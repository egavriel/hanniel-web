/*
  /pay/[invoice_no]/qr.png — the QR image. Placeholder until the hanniel-bca Worker is live.

  When the Worker is wired in (HANNIEL_BCA_API_URL set), this endpoint:
    1. Verifies (slug, k) against PAY_LINK_SALT + DEMO_PAY_LINKS.
    2. Calls ${HANNIEL_BCA_API_URL}/payment-link/{invoice_no} for the qrImageB64.
    3. Decodes base64 → PNG → returns as image/png with 5-min cache.

  Until then: returns 404 with a 1×1 transparent PNG so the page's <img>
  fails silently (the page already renders the QR inline as SVG in phase 1).
*/

const SLUG_RE = /^[0-9a-f]{8}$/;
const HMAC_RE = /^[0-9a-f]{12}$/;
const INVOICE_RE = /^LH-\d{4}-\d{4}$/;
const SALT_ENV = 'PAY_LINK_SALT';
const BCA_API_URL_ENV = 'HANNIEL_BCA_API_URL';

interface PagesEnv {
  [SALT_ENV]?: string;
  [BCA_API_URL_ENV]?: string;
  DEMO_PAY_LINKS?: string;
}

interface PaymentLink {
  qrImageB64?: string;
  status?: string;
}

function notFoundPng(): Response {
  const TRANSPARENT_PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
  const bytes = Uint8Array.from(atob(TRANSPARENT_PNG_B64), (c) => c.charCodeAt(0));
  return new Response(bytes, {
    status: 404,
    headers: { 'content-type': 'image/png', 'cache-control': 'no-store' },
  });
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  const bytes = new Uint8Array(sig);
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += (bytes[i] as number).toString(16).padStart(2, '0');
  return s;
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function onRequestGet(context: { request: Request; params: { invoice_no: string }; env: PagesEnv }): Promise<Response> {
  const slug = context.params.invoice_no || '';
  const url = new URL(context.request.url);
  const k = url.searchParams.get('k') || '';

  if (!SLUG_RE.test(slug) || !HMAC_RE.test(k)) return notFoundPng();

  const salt = context.env[SALT_ENV];
  const demoMapRaw = context.env.DEMO_PAY_LINKS;
  if (!salt || !demoMapRaw) return notFoundPng();

  let demoMap: Record<string, string>;
  try { demoMap = JSON.parse(demoMapRaw); } catch { return notFoundPng(); }
  const invoiceNo = demoMap[slug];
  if (!invoiceNo || !INVOICE_RE.test(invoiceNo)) return notFoundPng();

  const expected = (await hmacSha256Hex(salt, invoiceNo)).slice(0, 12);
  if (!timingSafeEqualHex(expected, k.toLowerCase())) return notFoundPng();

  const base = context.env[BCA_API_URL_ENV];
  if (!base) return notFoundPng();

  try {
    const r = await fetch(`${base}/payment-link/${encodeURIComponent(invoiceNo)}`, {
      headers: { 'accept': 'application/json' },
    });
    if (!r.ok) return notFoundPng();
    const link = await r.json() as PaymentLink;
    if (!link || !link.qrImageB64) return notFoundPng();
    const bytes = Uint8Array.from(atob(link.qrImageB64), (c) => c.charCodeAt(0));
    return new Response(bytes, {
      status: 200,
      headers: {
        'content-type': 'image/png',
        'cache-control': 'public, max-age=300',
      },
    });
  } catch {
    return notFoundPng();
  }
}
