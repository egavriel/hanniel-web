/*
  /pay/[invoice_no]/qr.png — placeholder until the hanniel-bca Worker is live.

  When HANNIEL_BCA_API_URL is set, this function fetches the payment_link
  for the invoice from the Worker, decodes the qrImageB64 base64, and returns
  it as image/png.

  Until then, returns 404 with a tiny explanatory PNG so the page's <img>
  gracefully fails to load (the page itself shows a "QR coming soon" card
  when paymentLink is null — this endpoint is the secondary fetch the
  browser will make after the SSR pass).

  The path includes a fixed `qr.png` segment so the directory routing works
  (CF Pages only supports string segments inside [...]).
*/

interface PagesEnv {
  HANNIEL_BCA_API_URL?: string;
}

interface PaymentLink {
  qrImageB64?: string;
  status?: string;
}

const INVOICE_RE = /^LH-\d{4}-\d{4}$/;

function notFoundPng(): Response {
  // 1x1 transparent PNG. Inline base64 keeps the function dependency-free.
  const TRANSPARENT_PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
  const bytes = Uint8Array.from(atob(TRANSPARENT_PNG_B64), (c) => c.charCodeAt(0));
  return new Response(bytes, {
    status: 404,
    headers: {
      'content-type': 'image/png',
      'cache-control': 'no-store',
    },
  });
}

export async function onRequestGet(context: { request: Request; params: { invoice_no: string }; env: PagesEnv }): Promise<Response> {
  const invoiceNo = context.params.invoice_no || '';
  if (!INVOICE_RE.test(invoiceNo)) return notFoundPng();

  const base = context.env && context.env.HANNIEL_BCA_API_URL;
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
        // 5 minutes — QR is short-lived (validity 60 min) and may be regenerated.
        'cache-control': 'public, max-age=300',
      },
    });
  } catch (e) {
    return notFoundPng();
  }
}
