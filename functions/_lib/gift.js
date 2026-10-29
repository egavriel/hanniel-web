/*
  Shared helpers for the e-Gift API (functions/api/gift/*) and the
  recipient page (functions/g/[code].js). See docs/EGIFT-PLAN.md.

  Everything here is stateless except the D1 calls; the session is an
  HMAC-signed cookie so there is no sessions table.
*/

// ---- catalog (server is the source of truth for prices) ----

export const CATALOG = {
  oats: {
    id: 'oats',
    name: 'Overnight Oats',
    unit: 'oats',
    price: 42000,
    bonusEvery: 5,
    flavors: ['Double Chocolate', 'Strawberry', 'Tiramisu'],
    emoji: '🥣',
  },
  cookies: {
    id: 'cookies',
    name: 'Cookies',
    unit: 'jars',
    price: 70000,
    bonusEvery: 5,
    flavors: ['Almond Choco', 'Double Choco', 'Raisin Oat'],
    emoji: '🍪',
  },
};

export const THEMES = ['cream', 'sage', 'cocoa', 'berry'];
export const MIN_UNITS = 3;
export const MAX_UNITS = 60;
export const EXPIRY_MS = 182 * 24 * 60 * 60 * 1000;   // ~6 months after payment

export function priceFor(line, qty) {
  const item = CATALOG[line];
  const paid = Math.trunc(Number(qty));
  if (!item || !(paid >= MIN_UNITS && paid <= MAX_UNITS)) return null;
  const bonus = Math.floor(paid / item.bonusEvery);
  return { paid, bonus, total: paid + bonus, price: paid * item.price };
}

// ---- responses ----

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers },
  });
}

export const bad = (error, status = 400, extra = {}) => json({ error, ...extra }, status);

export async function readJson(request) {
  try { return await request.json(); } catch { return null; }
}

// ---- phone ----

export function normalizePhone(raw) {
  let d = String(raw || '').replace(/\D/g, '');
  if (d.startsWith('0')) d = '62' + d.slice(1);
  else if (d.startsWith('8')) d = '62' + d;
  return /^628\d{7,12}$/.test(d) ? d : null;
}

export const maskPhone = (p) => (p ? `+${p.slice(0, 4)}••••${p.slice(-3)}` : '');

// ---- crypto ----

const enc = new TextEncoder();

function hex(buf) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function hmacHex(secret, message) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, enc.encode(message)));
}

export function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i += 1) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export function secretOf(env) {
  const s = env && env.GIFT_SESSION_SECRET;
  if (!s) throw new Error('GIFT_SESSION_SECRET is not set');
  return s;
}

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';   // no 0/O/1/I/L

export function newGiftCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

export function newOtp() {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1000000;
  return String(n).padStart(6, '0');
}

// ---- session cookie: lh_gift=<uid>.<exp>.<sig> ----

const COOKIE = 'lh_gift';
const SESSION_MS = 30 * 24 * 60 * 60 * 1000;

// Secure is dropped only for plain-http local dev (wrangler pages dev).
const secureFlag = (request) => (new URL(request.url).protocol === 'https:' ? '; Secure' : '');

export async function sessionCookie(request, env, userId) {
  const exp = Date.now() + SESSION_MS;
  const sig = (await hmacHex(secretOf(env), `s|${userId}|${exp}`)).slice(0, 32);
  return `${COOKIE}=${userId}.${exp}.${sig}; Path=/; HttpOnly${secureFlag(request)}; SameSite=Lax; Max-Age=${SESSION_MS / 1000}`;
}

export const clearCookie = (request) => `${COOKIE}=; Path=/; HttpOnly${secureFlag(request)}; SameSite=Lax; Max-Age=0`;

export async function currentUser(request, env) {
  const raw = (request.headers.get('cookie') || '')
    .split(';').map((c) => c.trim()).find((c) => c.startsWith(`${COOKIE}=`));
  if (!raw) return null;
  const [uid, exp, sig] = raw.slice(COOKIE.length + 1).split('.');
  if (!uid || !exp || !sig || Number(exp) < Date.now()) return null;
  const want = (await hmacHex(secretOf(env), `s|${uid}|${exp}`)).slice(0, 32);
  if (!safeEqual(sig, want)) return null;
  return env.GIFT_DB.prepare('SELECT id, phone, name FROM gift_users WHERE id = ?').bind(Number(uid)).first();
}

// ---- WhatsApp OTP delivery ----

export async function sendOtp(env, phone, code) {
  const provider = (env.WA_OTP_PROVIDER || 'dev').toLowerCase();
  const text = `${code} adalah kode verifikasi Little Hanniel kamu. Berlaku 5 menit. Jangan bagikan kode ini ke siapa pun.`;

  if (provider === 'fonnte') {
    const body = new FormData();
    body.set('target', phone);
    body.set('message', text);
    const r = await fetch('https://api.fonnte.com/send', {
      method: 'POST', headers: { Authorization: env.FONNTE_TOKEN || '' }, body,
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || data.status === false) throw new Error(`fonnte: ${data.reason || r.status}`);
    return {};
  }

  if (provider === 'meta') {
    const r = await fetch(`https://graph.facebook.com/v21.0/${env.META_WA_PHONE_ID}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.META_WA_TOKEN}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: phone,
        type: 'template',
        template: {
          name: env.META_WA_TEMPLATE || 'hanniel_otp',
          language: { code: 'id' },
          components: [
            { type: 'body', parameters: [{ type: 'text', text: code }] },
            { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: code }] },
          ],
        },
      }),
    });
    if (!r.ok) throw new Error(`meta: ${r.status} ${await r.text()}`);
    return {};
  }

  // dev: never deliver; only echo the code back when explicitly allowed.
  if (env.GIFT_DEV_OTP === '1') return { devCode: code };
  throw new Error('WA_OTP_PROVIDER is not configured');
}

// ---- gift view ----

export const firstName = (n) => String(n || '').trim().split(/\s+/)[0] || 'A friend';

export async function loadGift(env, code) {
  if (!/^[A-Z2-9]{8}$/.test(code || '')) return null;
  return env.GIFT_DB.prepare(
    `SELECT g.*, s.name AS sender_name, r.name AS recipient_user_name
     FROM gifts g
     JOIN gift_users s ON s.id = g.sender_id
     LEFT JOIN gift_users r ON r.id = g.recipient_id
     WHERE g.code = ?`,
  ).bind(code).first();
}

/** Public shape of a gift. Redemption detail only for sender/recipient. */
export async function giftView(env, gift, user) {
  const item = CATALOG[gift.line];
  const isSender = !!user && user.id === gift.sender_id;
  const isRecipient = !!user && user.id === gift.recipient_id;
  const view = {
    code: gift.code,
    line: gift.line,
    lineName: item ? item.name : gift.line,
    unit: item ? item.unit : 'treats',
    emoji: item ? item.emoji : '🎁',
    flavors: item ? item.flavors : [],
    senderName: firstName(gift.sender_name),
    recipientName: gift.recipient_name || firstName(gift.recipient_user_name),
    message: gift.message,
    theme: gift.theme,
    unitsPaid: gift.units_paid,
    unitsBonus: gift.units_bonus,
    unitsTotal: gift.units_total,
    unitsRedeemed: gift.units_redeemed,
    status: gift.status,
    claimed: !!gift.recipient_id,
    expiresAt: gift.expires_at,
    thanksEmoji: gift.thanks_emoji,
    thanksNote: gift.thanks_note,
    isSender,
    isRecipient,
  };
  if (isSender || isRecipient) {
    const rows = await env.GIFT_DB.prepare(
      'SELECT id, flavor, qty, status, created_at FROM gift_redemptions WHERE gift_id = ? ORDER BY id DESC',
    ).bind(gift.id).all();
    view.redemptions = rows.results || [];
  }
  if (isSender) {
    view.priceIdr = gift.price_idr;
    view.createdAt = gift.created_at;
  }
  return view;
}

export function shopWa(env) {
  return env.HANNIEL_WA || '6285190299779';
}
