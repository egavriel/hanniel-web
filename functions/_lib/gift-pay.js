/*
  Gateway payments for e-Gifts (Midtrans Core API). See docs/EGIFT-PLAN.md.

  Off until MIDTRANS_SERVER_KEY is set; the buy flow then falls back to manual
  BCA transfer. MIDTRANS_ENV=production selects the live API, anything else the
  sandbox. MIDTRANS_API_URL overrides both, for local tests against a mock only.
*/

import { EXPIRY_MS, safeEqual } from './gift.js';

const METHODS = {
  qris: { ms: 15 * 60 * 1000, expiry: { expiry_duration: 15, unit: 'minute' } },
  bca_va: { ms: 24 * 60 * 60 * 1000, expiry: { expiry_duration: 24, unit: 'hour' } },
};

const REUSE_MARGIN_MS = 30 * 1000;
const RECHECK_MS = 15 * 1000;
const FINAL = ['expire', 'cancel', 'deny', 'failure', 'refund', 'partial_refund'];

export const isPayMethod = (m) => Object.prototype.hasOwnProperty.call(METHODS, m);
export const gatewayOn = (env) => !!(env && env.MIDTRANS_SERVER_KEY);

function apiBase(env) {
  if (env.MIDTRANS_API_URL) return env.MIDTRANS_API_URL.replace(/\/$/, '');
  return env.MIDTRANS_ENV === 'production' ? 'https://api.midtrans.com' : 'https://api.sandbox.midtrans.com';
}

const authHeader = (env) => `Basic ${btoa(`${env.MIDTRANS_SERVER_KEY}:`)}`;

async function midtrans(env, path, body) {
  const r = await fetch(apiBase(env) + path, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: authHeader(env), Accept: 'application/json', 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return r.json();
}

/** The single way a gift becomes paid: gateway, status check and admin all use it. */
export async function markGiftPaid(env, giftId) {
  const now = Date.now();
  const r = await env.GIFT_DB.prepare(
    `UPDATE gifts SET status = 'active', paid_at = ?, expires_at = ?
     WHERE id = ? AND status = 'pending_payment'`,
  ).bind(now, now + EXPIRY_MS, giftId).run();
  return r.meta.changes === 1;
}

export function paymentView(gift, row) {
  return {
    orderId: row.order_id,
    method: row.method,
    amount: row.amount,
    status: row.status,
    expiresAt: row.expires_at,
    qrUrl: row.qr_url ? `/api/gift/pay/qr/${gift.code}?o=${encodeURIComponent(row.order_id)}` : null,
    vaNumber: row.va_number,
    bank: row.method === 'bca_va' ? 'BCA' : null,
  };
}

/** Reuse a live attempt for this method, otherwise ask the gateway for a new one. */
export async function startPayment(env, gift, method) {
  const now = Date.now();
  const live = await env.GIFT_DB.prepare(
    `SELECT * FROM gift_payments WHERE gift_id = ? AND method = ? AND status = 'pending' AND expires_at > ?
     ORDER BY id DESC LIMIT 1`,
  ).bind(gift.id, method, now + REUSE_MARGIN_MS).first();
  if (live) return live;

  const count = await env.GIFT_DB.prepare('SELECT COUNT(*) AS n FROM gift_payments WHERE gift_id = ?').bind(gift.id).first();
  const orderId = `GIFT-${gift.code}-${count.n + 1}`;
  const conf = METHODS[method];
  const charge = {
    transaction_details: { order_id: orderId, gross_amount: gift.price_idr },
    custom_expiry: conf.expiry,
    ...(method === 'qris'
      ? { payment_type: 'qris', qris: { acquirer: 'gopay' } }
      : { payment_type: 'bank_transfer', bank_transfer: { bank: 'bca' } }),
  };
  const res = await midtrans(env, '/v2/charge', charge);
  if (!['200', '201'].includes(String(res.status_code))) {
    throw new Error(`midtrans charge ${res.status_code}: ${res.status_message || ''}`);
  }

  const actions = res.actions || [];
  const qr = actions.find((a) => a.name === 'generate-qr-code-v2') || actions.find((a) => a.name === 'generate-qr-code');
  const va = (res.va_numbers || [])[0];
  if (method === 'qris' ? !qr : !va) throw new Error('midtrans charge: no QR or VA in the response');

  await env.GIFT_DB.prepare(
    `INSERT INTO gift_payments (gift_id, order_id, provider, method, amount, provider_ref, qr_url, va_number, expires_at, created_at, updated_at)
     VALUES (?, ?, 'midtrans', ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(gift.id, orderId, method, gift.price_idr, res.transaction_id || null,
    qr ? qr.url : null, va ? va.va_number : null, now + conf.ms, now, now).run();
  return env.GIFT_DB.prepare('SELECT * FROM gift_payments WHERE order_id = ?').bind(orderId).first();
}

/** Apply a gateway status (from a notification or a status check) to our records. */
export async function applyStatus(env, txn) {
  const row = await env.GIFT_DB.prepare('SELECT * FROM gift_payments WHERE order_id = ?').bind(String(txn.order_id || '')).first();
  if (!row) return { known: false };

  const status = txn.transaction_status;
  const settled = status === 'settlement' || (status === 'capture' && txn.fraud_status === 'accept');
  const set = (s) => env.GIFT_DB.prepare('UPDATE gift_payments SET status = ?, provider_ref = COALESCE(?, provider_ref), updated_at = ? WHERE id = ?')
    .bind(s, txn.transaction_id || null, Date.now(), row.id).run();

  if (settled) {
    if (Math.round(Number(txn.gross_amount)) !== row.amount) {
      await set('amount_mismatch');
      return { known: true, paid: false, mismatch: true };
    }
    await set('paid');
    await markGiftPaid(env, row.gift_id);
    return { known: true, paid: true };
  }
  // A refund on a paid attempt is recorded, but cancelling the gift stays a human decision.
  if (FINAL.includes(status) && (row.status !== 'paid' || status.endsWith('refund'))) await set(status);
  return { known: true, paid: false };
}

/** Is this notification really from Midtrans? SHA512(order_id+status_code+gross_amount+ServerKey) */
export async function validNotification(env, n) {
  if (!gatewayOn(env) || typeof n.signature_key !== 'string') return false;
  const text = `${n.order_id}${n.status_code}${n.gross_amount}${env.MIDTRANS_SERVER_KEY}`;
  const digest = await crypto.subtle.digest('SHA-512', new TextEncoder().encode(text));
  const want = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return safeEqual(n.signature_key, want);
}

/** Safety net for lost notifications: ask the gateway about one attempt. */
export async function recheck(env, row) {
  const res = await midtrans(env, `/v2/${encodeURIComponent(row.order_id)}/status`);
  await env.GIFT_DB.prepare('UPDATE gift_payments SET updated_at = ? WHERE id = ?').bind(Date.now(), row.id).run();
  if (!res || !res.transaction_status) return { known: true, paid: false };
  return applyStatus(env, res);
}

/** Polled by the payment screen. Only calls the gateway every RECHECK_MS per attempt. */
export async function refreshGift(env, gift) {
  const rows = await env.GIFT_DB.prepare(
    "SELECT * FROM gift_payments WHERE gift_id = ? AND status = 'pending' ORDER BY id DESC LIMIT 3",
  ).bind(gift.id).all();
  const now = Date.now();
  for (const row of rows.results || []) {
    if (now - row.updated_at >= RECHECK_MS) {
      try {
        if ((await recheck(env, row)).paid) return true;
      } catch (e) { /* the gateway being slow must not break the waiting screen */ }
    }
  }
  return false;
}

export async function reconcile(env, withinMs) {
  const rows = await env.GIFT_DB.prepare(
    "SELECT * FROM gift_payments WHERE status = 'pending' AND created_at > ? ORDER BY id LIMIT 50",
  ).bind(Date.now() - withinMs).all();
  let paid = 0;
  for (const row of rows.results || []) {
    if ((await recheck(env, row)).paid) paid += 1;
  }
  return { checked: (rows.results || []).length, paid };
}

export async function fetchQr(env, row) {
  return fetch(row.qr_url, { headers: { Authorization: authHeader(env) } });
}
