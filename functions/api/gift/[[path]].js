/*
  /api/gift/* — e-Gift API. One catch-all so the routes read top to bottom.

  Public
    GET  /api/gift/catalog                 lines, prices, bonus rule, themes
    POST /api/gift/otp/send   {phone}      sends a 6-digit WhatsApp OTP
    POST /api/gift/otp/verify {phone, code, name?}  → sets session cookie
    GET  /api/gift/card/<code>             public card view (more if sender/recipient)

  Signed in (lh_gift cookie)
    GET  /api/gift/me                      user + sent + received gifts
    POST /api/gift/logout
    POST /api/gift/create   {line, qty, recipientName, message, theme}
    POST /api/gift/claim    {code}
    POST /api/gift/redeem   {code, flavor, qty}   → reserves units, returns WA link
    POST /api/gift/thanks   {code, emoji, note?}

  Admin (Authorization: Bearer GIFT_ADMIN_TOKEN)
    GET  /api/gift/admin/list
    POST /api/gift/admin/paid    {code}
    POST /api/gift/admin/fulfil  {redemption_id}

  Persistence: D1 binding GIFT_DB (migrations/0001_gift.sql).
*/

import {
  CATALOG, THEMES, MIN_UNITS, MAX_UNITS, EXPIRY_MS,
  priceFor, json, bad, readJson, normalizePhone, maskPhone, hmacHex, safeEqual,
  secretOf, newGiftCode, newOtp, sessionCookie, clearCookie, currentUser,
  sendOtp, loadGift, giftView, shopWa,
} from '../../_lib/gift.js';

const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_WINDOW_MS = 15 * 60 * 1000;
const OTP_MAX_PER_WINDOW = 3;
const OTP_COOLDOWN_MS = 30 * 1000;
const OTP_MAX_TRIES = 5;
const EMOJIS = ['😍', '🥹', '🤤', '🙏', '❤️', '🎉'];

const clean = (s, max) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, max);

async function otpHash(env, phone, code) {
  return hmacHex(secretOf(env), `otp|${phone}|${code}`);
}

// ---- handlers ----

function catalog() {
  return json({
    lines: Object.values(CATALOG),
    themes: THEMES,
    minUnits: MIN_UNITS,
    maxUnits: MAX_UNITS,
  }, 200, { 'cache-control': 'public, max-age=300' });
}

async function otpSend({ env, body }) {
  const phone = normalizePhone(body.phone);
  if (!phone) return bad('That WhatsApp number doesn’t look right. Try e.g. 0812 3456 7890.');
  const now = Date.now();
  const recent = await env.GIFT_DB.prepare(
    'SELECT created_at FROM gift_otps WHERE phone = ? AND created_at > ? ORDER BY created_at DESC',
  ).bind(phone, now - OTP_WINDOW_MS).all();
  const rows = recent.results || [];
  if (rows.length && now - rows[0].created_at < OTP_COOLDOWN_MS) {
    return bad('Give it a few seconds before asking for another code.', 429, {
      retryIn: Math.ceil((OTP_COOLDOWN_MS - (now - rows[0].created_at)) / 1000),
    });
  }
  if (rows.length >= OTP_MAX_PER_WINDOW) return bad('Too many codes requested. Try again in 15 minutes.', 429);

  const code = newOtp();
  await env.GIFT_DB.prepare(
    'INSERT INTO gift_otps (phone, code_hash, created_at, expires_at) VALUES (?, ?, ?, ?)',
  ).bind(phone, await otpHash(env, phone, code), now, now + OTP_TTL_MS).run();

  let delivery;
  try { delivery = await sendOtp(env, phone, code); } catch (e) {
    return bad('We couldn’t send the code to WhatsApp. Please try again shortly.', 502, { detail: String(e.message || e) });
  }
  return json({ ok: true, phone: maskPhone(phone), cooldown: OTP_COOLDOWN_MS / 1000, ...delivery });
}

async function otpVerify({ env, request, body }) {
  const phone = normalizePhone(body.phone);
  const code = String(body.code || '').replace(/\D/g, '');
  if (!phone || code.length !== 6) return bad('The code is 6 digits.');
  const row = await env.GIFT_DB.prepare(
    'SELECT * FROM gift_otps WHERE phone = ? AND consumed = 0 ORDER BY id DESC LIMIT 1',
  ).bind(phone).first();
  if (!row || row.expires_at < Date.now()) return bad('That code has expired. Request a new one.', 410);
  if (row.attempts >= OTP_MAX_TRIES) return bad('Too many tries. Request a new code.', 429);

  if (!safeEqual(row.code_hash, await otpHash(env, phone, code))) {
    await env.GIFT_DB.prepare('UPDATE gift_otps SET attempts = attempts + 1 WHERE id = ?').bind(row.id).run();
    return bad('That code doesn’t match. Check it and try again.', 401, { triesLeft: OTP_MAX_TRIES - row.attempts - 1 });
  }
  await env.GIFT_DB.prepare('UPDATE gift_otps SET consumed = 1 WHERE id = ?').bind(row.id).run();

  const name = clean(body.name, 40);
  await env.GIFT_DB.prepare(
    `INSERT INTO gift_users (phone, name, created_at) VALUES (?, ?, ?)
     ON CONFLICT(phone) DO UPDATE SET name = CASE WHEN excluded.name <> '' THEN excluded.name ELSE gift_users.name END`,
  ).bind(phone, name, Date.now()).run();
  const user = await env.GIFT_DB.prepare('SELECT id, phone, name FROM gift_users WHERE phone = ?').bind(phone).first();

  return json({ user: { name: user.name, phone: maskPhone(user.phone) } }, 200, {
    'set-cookie': await sessionCookie(request, env, user.id),
  });
}

async function me({ env, user }) {
  const sent = await env.GIFT_DB.prepare(
    `SELECT g.*, s.name AS sender_name, r.name AS recipient_user_name FROM gifts g
     JOIN gift_users s ON s.id = g.sender_id LEFT JOIN gift_users r ON r.id = g.recipient_id
     WHERE g.sender_id = ? AND g.status <> 'cancelled' ORDER BY g.id DESC LIMIT 50`,
  ).bind(user.id).all();
  const received = await env.GIFT_DB.prepare(
    `SELECT g.*, s.name AS sender_name, r.name AS recipient_user_name FROM gifts g
     JOIN gift_users s ON s.id = g.sender_id LEFT JOIN gift_users r ON r.id = g.recipient_id
     WHERE g.recipient_id = ? ORDER BY g.id DESC LIMIT 50`,
  ).bind(user.id).all();
  const view = (g) => giftView(env, g, user);
  return json({
    user: { name: user.name, phone: maskPhone(user.phone) },
    sent: await Promise.all((sent.results || []).map(view)),
    received: await Promise.all((received.results || []).map(view)),
  });
}

async function create({ env, user, body }) {
  const line = String(body.line || '');
  const quote = priceFor(line, body.qty);
  if (!quote) return bad(`Choose ${MIN_UNITS}–${MAX_UNITS} items.`);
  const theme = THEMES.includes(body.theme) ? body.theme : 'cream';
  const recipientName = clean(body.recipientName, 30);
  if (!recipientName) return bad('Add the recipient’s name first.');
  const message = clean(body.message, 160);

  let code;
  for (let i = 0; i < 5; i += 1) {
    code = newGiftCode();
    const hit = await env.GIFT_DB.prepare('SELECT 1 FROM gifts WHERE code = ?').bind(code).first();
    if (!hit) break;
  }
  await env.GIFT_DB.prepare(
    `INSERT INTO gifts (code, sender_id, recipient_name, message, theme, line,
       units_paid, units_bonus, units_total, price_idr, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(code, user.id, recipientName, message, theme, line,
    quote.paid, quote.bonus, quote.total, quote.price, Date.now()).run();

  const gift = await loadGift(env, code);
  return json({
    gift: await giftView(env, gift, user),
    payment: {
      bank: env.PAYMENT_BANK_NAME || 'BCA',
      accountName: env.PAYMENT_ACCOUNT_NAME || '',
      accountNumber: env.PAYMENT_ACCOUNT_NUMBER || '',
      amount: quote.price,
      note: `GIFT-${code}`,
    },
  }, 201);
}

async function card({ env, user, code }) {
  const gift = await loadGift(env, code);
  if (!gift || gift.status === 'cancelled') return bad('We couldn’t find that gift.', 404);
  return json({ gift: await giftView(env, gift, user), signedIn: !!user, me: user ? { name: user.name } : null });
}

async function claim({ env, user, body }) {
  const gift = await loadGift(env, String(body.code || ''));
  if (!gift || gift.status === 'cancelled') return bad('We couldn’t find that gift.', 404);
  if (gift.sender_id === user.id) return bad('This is your own gift — send the link to the recipient.', 403);
  if (gift.recipient_id && gift.recipient_id !== user.id) return bad('This gift was already claimed by another number.', 409);
  if (!gift.recipient_id) {
    const r = await env.GIFT_DB.prepare(
      'UPDATE gifts SET recipient_id = ?, claimed_at = ? WHERE id = ? AND recipient_id IS NULL',
    ).bind(user.id, Date.now(), gift.id).run();
    if (!r.meta || r.meta.changes !== 1) return bad('This gift was already claimed by another number.', 409);
  }
  return json({ gift: await giftView(env, await loadGift(env, gift.code), user) });
}

async function redeem({ env, user, body }) {
  const gift = await loadGift(env, String(body.code || ''));
  if (!gift) return bad('We couldn’t find that gift.', 404);
  if (gift.recipient_id !== user.id) return bad('Claim this gift first.', 403);
  if (gift.status === 'pending_payment') return bad('Still being wrapped — you can redeem once payment is confirmed.', 409);
  if (gift.status !== 'active') return bad('Every treat in this gift has been enjoyed.', 409);
  if (gift.expires_at && gift.expires_at < Date.now()) return bad('This gift has expired.', 410);

  const item = CATALOG[gift.line];
  const flavor = String(body.flavor || '');
  const qty = Math.trunc(Number(body.qty));
  if (!item.flavors.includes(flavor)) return bad('Pick a flavour first.');
  if (!(qty >= 1 && qty <= gift.units_total - gift.units_redeemed)) return bad('That’s more than you have left.');

  // Reserve atomically: the WHERE clause is the double-spend guard.
  const r = await env.GIFT_DB.prepare(
    `UPDATE gifts SET units_redeemed = units_redeemed + ?1,
       status = CASE WHEN units_redeemed + ?1 >= units_total THEN 'completed' ELSE status END
     WHERE id = ?2 AND status = 'active' AND units_redeemed + ?1 <= units_total`,
  ).bind(qty, gift.id).run();
  if (!r.meta || r.meta.changes !== 1) return bad('Your balance just changed — refresh the page.', 409);
  await env.GIFT_DB.prepare(
    'INSERT INTO gift_redemptions (gift_id, flavor, qty, created_at) VALUES (?, ?, ?, ?)',
  ).bind(gift.id, flavor, qty, Date.now()).run();

  const text = `Hi Little Hanniel! Saya mau redeem e-Gift GIFT-${gift.code}: ${qty}× ${item.name} ${flavor}. `
    + 'Atas nama ' + (user.name || '') + '. Kapan bisa diambil/diantar?';
  const updated = await loadGift(env, gift.code);
  return json({
    gift: await giftView(env, updated, user),
    waUrl: `https://wa.me/${shopWa(env)}?text=${encodeURIComponent(text)}`,
  });
}

async function thanks({ env, user, body }) {
  const gift = await loadGift(env, String(body.code || ''));
  if (!gift || gift.recipient_id !== user.id) return bad('Claim this gift first.', 403);
  const emoji = EMOJIS.includes(body.emoji) ? body.emoji : '❤️';
  await env.GIFT_DB.prepare('UPDATE gifts SET thanks_emoji = ?, thanks_note = ? WHERE id = ?')
    .bind(emoji, clean(body.note, 120), gift.id).run();
  return json({ gift: await giftView(env, await loadGift(env, gift.code), user) });
}

// ---- admin ----

function isAdmin(request, env) {
  const want = env.GIFT_ADMIN_TOKEN || '';
  const got = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  return !!want && safeEqual(got, want);
}

async function admin({ env, request, body, rest }) {
  if (!isAdmin(request, env)) return bad('unauthorised', 401);
  if (rest === 'list' && request.method === 'GET') {
    const rows = await env.GIFT_DB.prepare(
      `SELECT g.code, g.status, g.line, g.units_total, g.units_redeemed, g.price_idr,
              g.recipient_name, s.name AS sender_name, s.phone AS sender_phone, g.created_at, g.paid_at
       FROM gifts g JOIN gift_users s ON s.id = g.sender_id ORDER BY g.id DESC LIMIT 200`,
    ).all();
    const pending = await env.GIFT_DB.prepare(
      `SELECT r.id, g.code, r.flavor, r.qty, r.created_at FROM gift_redemptions r
       JOIN gifts g ON g.id = r.gift_id WHERE r.status = 'requested' ORDER BY r.id`,
    ).all();
    return json({ gifts: rows.results || [], redemptionsToFulfil: pending.results || [] });
  }
  if (rest === 'paid' && request.method === 'POST') {
    const code = String(body.code || '').replace(/^GIFT-/i, '').toUpperCase();
    const now = Date.now();
    const r = await env.GIFT_DB.prepare(
      `UPDATE gifts SET status = 'active', paid_at = ?, expires_at = ?
       WHERE code = ? AND status = 'pending_payment'`,
    ).bind(now, now + EXPIRY_MS, code).run();
    return json({ ok: r.meta.changes === 1, code });
  }
  if (rest === 'fulfil' && request.method === 'POST') {
    const r = await env.GIFT_DB.prepare(
      "UPDATE gift_redemptions SET status = 'fulfilled' WHERE id = ? AND status = 'requested'",
    ).bind(Number(body.redemption_id)).run();
    return json({ ok: r.meta.changes === 1 });
  }
  return bad('not found', 404);
}

// ---- router ----

const SIGNED_IN = { me, create, claim, redeem, thanks };

export async function onRequest(context) {
  const { request, env, params } = context;
  if (!env.GIFT_DB) return bad('GIFT_DB binding is missing', 503);
  const parts = [].concat(params.path || []);
  const route = parts.join('/');
  const method = request.method;
  const body = method === 'POST' ? (await readJson(request)) || {} : {};

  try {
    if (route === 'catalog' && method === 'GET') return catalog();
    if (route === 'otp/send' && method === 'POST') return await otpSend({ env, body });
    if (route === 'otp/verify' && method === 'POST') return await otpVerify({ env, request, body });
    if (parts[0] === 'admin') return await admin({ env, request, body, rest: parts.slice(1).join('/') });
    if (route === 'logout' && method === 'POST') return json({ ok: true }, 200, { 'set-cookie': clearCookie(request) });

    const user = await currentUser(request, env);
    if (parts[0] === 'card' && parts.length === 2 && method === 'GET') {
      return await card({ env, user, code: parts[1].toUpperCase() });
    }

    const handler = SIGNED_IN[route];
    if (!handler || (route === 'me' ? method !== 'GET' : method !== 'POST')) return bad('not found', 404);
    if (!user) return bad('Verify your WhatsApp first.', 401, { needsAuth: true });
    return await handler({ env, user, body });
  } catch (e) {
    return bad('Something went wrong on our side. Please try again.', 500, { detail: String(e.message || e) });
  }
}
