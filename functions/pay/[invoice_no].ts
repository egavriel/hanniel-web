/*
  /pay/[invoice_no] — customer-facing "view + pay" page for a Hanniel invoice.

  Path:  staging.little.hanniel.co/pay/LH-2608-0042
         little.hanniel.co/pay/LH-2608-0042 (after prod cutover)

  Phase 1 (BCA Worker not live yet): renders invoice summary only, with a
  "QR will be available once BCA API is connected" placeholder. The page
  already demonstrates the customer-facing environment to the BCA facilitator.

  Phase 2 (Worker live): same page also fetches the latest payment_link for
  the invoice from the Worker and embeds the QR image. The Worker URL is
  read from the HANNIEL_BCA_API_URL env var; if unset, fall back to phase 1.

  Invoice source: GET https://app.hanniel.co/api/invoice/{invoice_no} (the
  hanniel-modules API). We do NOT talk to hanniel-modules' D1 directly; the
  app.hanniel.co endpoint is the public contract.

  Auth: NONE. The invoice_no is the secret. The format LH-YYMM-#### is not
  trivially guessable (we'd need to also know YYMM = year+month), and even
  if a random person found an invoice_no, the page shows items + total only,
  no customer phone, no address, no payment credentials.

  Branding: Hanniel web (warm cream + cocoa ink + caramel accent). Reuses
  Playfair + Inter from /assets/fonts/. No external CSS deps; no JS framework.
*/

// LH-YYMM-#### — keep in sync with hanniel-invoice skill's invoice-number contract.
const INVOICE_RE = /^LH-\d{4}-\d{4}$/;

const HANNIEL_API = 'https://app.hanniel.co';
// When the hanniel-bca Worker is live, set HANNIEL_BCA_API_URL as a Pages
// env var (e.g. https://hanniel-bca-api-prod.<acct>.workers.dev). Until
// then the page falls back to phase 1 behavior.
const BCA_API_URL_ENV = 'HANNIEL_BCA_API_URL';

interface PagesEnv {
  [BCA_API_URL_ENV]?: string;
}

interface InvoiceItem {
  product_id?: string;
  name?: string;
  quantity?: number;
  unit_price?: number;
  line_total?: number;
  description?: string | null;
}

interface Invoice {
  id?: number;
  invoice_no: string;
  invoice_date: string;
  template?: string;
  customer_name?: string;
  customer_phone?: string | null;
  delivery_address?: string | null;
  items?: InvoiceItem[];
  subtotal?: number;
  discount_rate?: number;
  discount_amount?: number;
  courtesy_adjustment?: number;
  total_order_value?: number;
  delivery_fee?: number;
  deposit_paid?: number;
  balance_due?: number;
  grand_total?: number;
  currency?: string;
  status?: string;
  notes?: string | null;
}

interface PaymentLink {
  partnerReferenceNo?: string;
  referenceNo?: string;
  status?: string;
  qrContent?: string;
  qrImageB64?: string;
  validityPeriod?: string;
  amount_minor?: number;
}

const escapeHtml = (s: string | null | undefined): string => String(s ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const formatIdr = (n: number | string | null | undefined): string => {
  const num = Number(n || 0);
  return 'Rp ' + num.toLocaleString('id-ID');
};

const formatDate = (iso: string | null | undefined): string => {
  if (!iso) return '';
  // YYYY-MM-DD → "DD MMM YYYY" (English month abbrev). Matches the parity
  // contract in hanniel-invoice's references/invoice-number-and-date-parity.md.
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const parts = iso.split('-').map(Number);
  const y = parts[0] as number;
  const m = parts[1] as number;
  const d = parts[2] as number;
  return `${String(d).padStart(2, '0')} ${months[m - 1]} ${y}`;
};

async function fetchInvoice(invoiceNo: string): Promise<{ notFound: true } | { error: string } | { invoice: Invoice }> {
  const r = await fetch(`${HANNIEL_API}/api/invoice/${encodeURIComponent(invoiceNo)}`, {
    headers: { 'accept': 'application/json' },
  });
  if (r.status === 404) return { notFound: true };
  if (!r.ok) return { error: `upstream ${r.status}` };
  return { invoice: await r.json() as Invoice };
}

async function fetchPaymentLink(env: PagesEnv | undefined, invoiceNo: string): Promise<PaymentLink | null> {
  const base = env && env[BCA_API_URL_ENV];
  if (!base) return null; // Worker not configured; phase 1 behavior.
  try {
    const r = await fetch(`${base}/payment-link/${encodeURIComponent(invoiceNo)}`, {
      headers: { 'accept': 'application/json' },
    });
    if (!r.ok) return null;
    const link = await r.json() as PaymentLink;
    return link || null;
  } catch (e) {
    return null; // never let the worker hiccup break the page
  }
}

function renderPage({ invoice, paymentLink, invoiceNo }: { invoice: Invoice; paymentLink: PaymentLink | null; invoiceNo: string }): string {
  const items = (invoice.items || []).map((it) => `
    <tr>
      <td class="pay-item-name">${escapeHtml(it.name || it.product_id || '')}</td>
      <td class="pay-item-qty">${Number(it.quantity || 0)}</td>
      <td class="pay-item-price">${formatIdr(it.unit_price || 0)}</td>
      <td class="pay-item-total">${formatIdr(it.line_total || 0)}</td>
    </tr>
  `).join('');

  const subtotal = Number(invoice.subtotal || 0);
  const deliveryFee = Number(invoice.delivery_fee || 0);
  const grandTotal = Number(invoice.grand_total || 0);
  const discount = Number(invoice.discount_amount || 0) + Number(invoice.courtesy_adjustment || 0);

  const qrSection = paymentLink
    ? `
      <div class="pay-qr">
        <img class="pay-qr-img" src="/pay/${escapeHtml(invoiceNo)}/qr.png" alt="QR code ${escapeHtml(invoiceNo)}" width="220" height="220" />
        ${paymentLink.validityPeriod
          ? `<p class="pay-qr-expiry">Berlaku sampai <strong>${escapeHtml(formatDate(paymentLink.validityPeriod.split('T')[0]))} ${escapeHtml((paymentLink.validityPeriod.split('T')[1] || '').slice(0, 5))} WIB</strong></p>`
          : ''}
        <p class="pay-qr-hint">Buka aplikasi e-wallet atau m-banking Anda, pilih <em>Scan QR</em>, arahkan ke kode di atas. Pembayaran via QRIS — BCA mobile, OVO, GoPay, Dana, ShopeePay, dll.</p>
      </div>
    `
    : `
      <div class="pay-qr pay-qr-placeholder">
        <div class="pay-qr-pending">
          <div class="pay-qr-pending-mark"></div>
          <p>QRIS payment link akan tersedia setelah BCA API live.</p>
          <p class="pay-qr-pending-sub">Invoice ini sudah tersimpan dan siap dibayar; tinggal menunggu integrasi payment gateway.</p>
        </div>
      </div>
    `;

  return `<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>Bayar ${escapeHtml(invoiceNo)} — Little Hanniel</title>
  <meta name="description" content="Halaman pembayaran invoice ${escapeHtml(invoiceNo)} dari Little Hanniel. Scan QRIS untuk membayar via QRIS." />
  <meta name="robots" content="noindex, nofollow" />
  <meta name="theme-color" content="#FDFAF6" />
  <link rel="icon" type="image/png" href="/favicon.png" />

  <!-- Open Graph for WhatsApp / iMessage preview -->
  <meta property="og:title" content="Bayar ${escapeHtml(invoiceNo)} — Little Hanniel" />
  <meta property="og:description" content="Total ${formatIdr(grandTotal)} • Scan QR untuk bayar via QRIS" />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="https://little.hanniel.co/pay/${escapeHtml(invoiceNo)}" />
  <meta property="og:image" content="https://little.hanniel.co/og-cover.jpg" />
  <meta property="og:locale" content="id_ID" />
  <meta property="og:site_name" content="Little Hanniel" />

  <!-- Self-hosted fonts (same as index.html) -->
  <link rel="preload" href="/assets/fonts/playfair-400.woff2" as="font" type="font/woff2" crossorigin />
  <link rel="preload" href="/assets/fonts/inter-400.woff2" as="font" type="font/woff2" crossorigin />
  <style>
    :root {
      --bg-page: #FDFAF6;
      --bg-subtle: #F5EFE6;
      --bg-card: #FFFCF7;
      --text-strong: #2B2118;
      --text-muted: #6E5F4F;
      --text-faint: #9B8A78;
      --border: #E8DFD2;
      --accent: #A67C52;
      --wa: #25D366;
      --shadow: 0 8px 28px rgba(43, 33, 24, 0.07), 0 2px 8px rgba(43, 33, 24, 0.04);
    }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: var(--bg-page); color: var(--text-strong); }
    body {
      font-family: 'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif;
      font-weight: 500;
      font-size: 15px;
      line-height: 1.5;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }
    .pay-shell {
      max-width: 480px;
      margin: 0 auto;
      padding: 32px 20px 80px;
    }
    .pay-header {
      text-align: center;
      margin-bottom: 32px;
    }
    .pay-logo {
      font-family: 'Playfair Display', Georgia, serif;
      font-size: 28px;
      font-weight: 500;
      letter-spacing: -0.02em;
      color: var(--text-strong);
      margin: 0;
    }
    .pay-logo-sub {
      font-size: 12px;
      color: var(--text-faint);
      letter-spacing: 0.18em;
      text-transform: uppercase;
      margin-top: 6px;
    }
    .pay-card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 18px;
      box-shadow: var(--shadow);
      padding: 24px 22px;
      margin-bottom: 16px;
    }
    .pay-meta {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      margin-bottom: 4px;
    }
    .pay-invoice-no {
      font-family: 'Playfair Display', Georgia, serif;
      font-size: 20px;
      font-weight: 500;
      letter-spacing: -0.01em;
      color: var(--text-strong);
      margin: 0;
    }
    .pay-date {
      font-size: 12px;
      color: var(--text-faint);
    }
    .pay-status {
      display: inline-block;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      padding: 3px 10px;
      border-radius: 999px;
      background: var(--bg-subtle);
      color: var(--text-muted);
      margin-top: 8px;
    }
    .pay-status.paid { background: #DCEFD8; color: #1F5C2A; }
    .pay-status.pending { background: #F8E9D2; color: #8A5419; }

    .pay-divider {
      border: 0;
      border-top: 1px dashed var(--border);
      margin: 18px 0;
    }

    .pay-items {
      width: 100%;
      border-collapse: collapse;
      font-size: 14px;
    }
    .pay-items th {
      text-align: left;
      font-weight: 600;
      font-size: 11px;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--text-faint);
      padding: 4px 0 8px;
      border-bottom: 1px solid var(--border);
    }
    .pay-items th.pay-item-qty,
    .pay-items th.pay-item-price,
    .pay-items th.pay-item-total {
      text-align: right;
    }
    .pay-items td {
      padding: 10px 0;
      border-bottom: 1px solid var(--border);
      vertical-align: top;
    }
    .pay-items tr:last-child td { border-bottom: 0; }
    .pay-item-name { color: var(--text-strong); }
    .pay-item-qty,
    .pay-item-price,
    .pay-item-total {
      text-align: right;
      color: var(--text-muted);
      font-variant-numeric: tabular-nums;
    }
    .pay-item-total { color: var(--text-strong); font-weight: 600; }

    .pay-totals {
      margin-top: 16px;
      font-size: 14px;
    }
    .pay-total-row {
      display: flex;
      justify-content: space-between;
      padding: 4px 0;
      color: var(--text-muted);
    }
    .pay-total-row.grand {
      margin-top: 10px;
      padding-top: 14px;
      border-top: 1px solid var(--border);
      font-size: 18px;
      font-weight: 600;
      color: var(--text-strong);
    }
    .pay-total-row.grand .pay-total-amt {
      font-family: 'Playfair Display', Georgia, serif;
      font-size: 22px;
      letter-spacing: -0.01em;
    }

    .pay-qr {
      text-align: center;
    }
    .pay-qr-img {
      display: block;
      margin: 0 auto 12px;
      border-radius: 12px;
      background: white;
      padding: 12px;
      box-shadow: var(--shadow);
    }
    .pay-qr-expiry {
      font-size: 13px;
      color: var(--text-muted);
      margin: 8px 0 4px;
    }
    .pay-qr-hint {
      font-size: 12px;
      color: var(--text-faint);
      line-height: 1.6;
      margin: 8px 0 0;
    }
    .pay-qr-placeholder {
      padding: 16px 0;
    }
    .pay-qr-pending {
      background: var(--bg-subtle);
      border-radius: 12px;
      padding: 24px 16px;
    }
    .pay-qr-pending-mark {
      width: 56px;
      height: 56px;
      border: 1.5px dashed var(--accent);
      border-radius: 12px;
      margin: 0 auto 14px;
      position: relative;
    }
    .pay-qr-pending-mark::after {
      content: '';
      position: absolute;
      inset: 8px;
      border: 1.5px dashed var(--accent);
      border-radius: 6px;
      opacity: 0.55;
    }
    .pay-qr-pending p {
      margin: 0 0 4px;
      color: var(--text-strong);
      font-size: 14px;
    }
    .pay-qr-pending-sub {
      font-size: 12px;
      color: var(--text-faint) !important;
    }

    .pay-help {
      text-align: center;
      font-size: 12px;
      color: var(--text-faint);
      margin-top: 24px;
    }
    .pay-help a { color: var(--accent); text-decoration: none; }
    .pay-help a:hover { text-decoration: underline; }

    @media (max-width: 360px) {
      .pay-shell { padding: 24px 16px 60px; }
      .pay-card { padding: 20px 16px; }
      .pay-logo { font-size: 24px; }
      .pay-invoice-no { font-size: 18px; }
    }
  </style>
</head>
<body>
  <main class="pay-shell">
    <header class="pay-header">
      <h1 class="pay-logo">Little Hanniel</h1>
      <p class="pay-logo-sub">Pembayaran Invoice</p>
    </header>

    <section class="pay-card" aria-labelledby="invoice-no">
      <div class="pay-meta">
        <h2 class="pay-invoice-no" id="invoice-no">${escapeHtml(invoiceNo)}</h2>
        <span class="pay-date">${escapeHtml(formatDate(invoice.invoice_date))}</span>
      </div>
      <span class="pay-status ${escapeHtml(invoice.status || 'issued')}">${escapeHtml((invoice.status || 'issued').toUpperCase())}</span>
      ${invoice.customer_name ? `<p style="margin: 14px 0 0; font-size: 14px; color: var(--text-muted);">Kepada <strong style="color: var(--text-strong);">${escapeHtml(invoice.customer_name)}</strong></p>` : ''}

      <hr class="pay-divider" />

      <table class="pay-items" role="table">
        <thead>
          <tr>
            <th scope="col">Item</th>
            <th scope="col" class="pay-item-qty">Qty</th>
            <th scope="col" class="pay-item-price">Harga</th>
            <th scope="col" class="pay-item-total">Total</th>
          </tr>
        </thead>
        <tbody>
          ${items || '<tr><td colspan="4" style="text-align:center;color:var(--text-faint);padding:16px 0;">Tidak ada item.</td></tr>'}
        </tbody>
      </table>

      <div class="pay-totals">
        <div class="pay-total-row"><span>Subtotal</span><span>${formatIdr(subtotal)}</span></div>
        ${discount > 0 ? `<div class="pay-total-row"><span>Diskon</span><span>−${formatIdr(discount)}</span></div>` : ''}
        ${deliveryFee > 0 ? `<div class="pay-total-row"><span>Ongkir</span><span>${formatIdr(deliveryFee)}</span></div>` : ''}
        <div class="pay-total-row grand">
          <span>Total</span>
          <span class="pay-total-amt">${formatIdr(grandTotal)}</span>
        </div>
      </div>
    </section>

    <section class="pay-card">
      ${qrSection}
    </section>

    <p class="pay-help">
      Butuh bantuan? <a href="https://wa.me/6285190299779?text=Halo%20Little%20Hanniel%2C%20saya%20butuh%20bantuan%20invoice%20${encodeURIComponent(invoiceNo)}" rel="noopener">Hubungi kami via WhatsApp</a>.
    </p>
  </main>
</body>
</html>`;
}

function notFoundPage(): Response {
  return new Response(renderNotFound(), {
    status: 404,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  });
}

function renderNotFound(): string {
  return `<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Invoice tidak ditemukan — Little Hanniel</title>
  <meta name="robots" content="noindex" />
  <style>
    body { font-family: 'Inter', system-ui, sans-serif; background: #FDFAF6; color: #2B2118; margin: 0; padding: 64px 20px; text-align: center; }
    h1 { font-family: 'Playfair Display', Georgia, serif; font-weight: 500; font-size: 28px; margin: 0 0 8px; }
    p { color: #6E5F4F; max-width: 360px; margin: 0 auto; }
    a { color: #A67C52; text-decoration: none; }
  </style>
</head>
<body>
  <h1>Invoice tidak ditemukan</h1>
  <p>Nomor invoice yang Anda buka tidak ada. Periksa kembali tautan dari chat WhatsApp kami.</p>
  <p style="margin-top: 24px;"><a href="https://little.hanniel.co">← Kembali ke Little Hanniel</a></p>
</body>
</html>`;
}

export async function onRequestGet(context: { request: Request; params: { invoice_no: string }; env: PagesEnv }): Promise<Response> {
  const invoiceNo = context.params.invoice_no || '';

  if (!INVOICE_RE.test(invoiceNo)) {
    return notFoundPage();
  }

  const [fetched, paymentLink] = await Promise.all([
    fetchInvoice(invoiceNo),
    fetchPaymentLink(context.env, invoiceNo),
  ]);

  if ('notFound' in fetched) {
    return notFoundPage();
  }
  if ('error' in fetched) {
    return new Response(`Upstream error: ${fetched.error}`, { status: 502, headers: { 'content-type': 'text/plain' } });
  }

  const html = renderPage({ invoice: fetched.invoice, paymentLink, invoiceNo });
  return new Response(html, {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, max-age=60',
    },
  });
}
