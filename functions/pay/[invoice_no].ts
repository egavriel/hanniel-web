/*
  /pay/[invoice_no] — customer-facing "view + pay" page for a Hanniel invoice.

  Accepts BOTH URL shapes:

  | Shape | Example | When |
  |---|---|---|
  | Canonical (slug) | `/pay/859e2827?k=88ce2982fee9` | Production. Unguessable. No invoice_no leaked. |
  | Legacy (raw)     | `/pay/LH-2608-0042`            | Staging demo / backwards-compat. 302 to the slug form when salt is set, or renders inline as fallback. |

  Slug/HMAC generation:
    slug  = first 8 hex of SHA-256(PAY_LINK_SALT + "|" + invoice_no)
    hmac  = first 12 hex of HMAC-SHA-256(PAY_LINK_SALT, invoice_no)

  Both are derived from PAY_LINK_SALT, a per-environment CF Pages env var.
  Verification is timing-safe (charCodeAt xor-diff), stateless, no D1 round-trip.
  The matching generator lives in the hanniel-invoice skill / operator tools.

  Demo mode: append `?demo=1` to mask customer name + items.

  Invoice source: GET https://app.hanniel.co/api/invoice/{invoice_no}
  QR / payment source: GET ${HANNIEL_BCA_API_URL}/payment-link/{invoice_no}

  Phase 1 (BCA Worker not live): renders invoice summary + inline SVG QR.
  Phase 2 (Worker live): swap inline SVG for the real qr.png served by
  the `/pay/[invoice_no]/qr.png.ts` route.
*/

const INVOICE_RE = /^LH-\d{4}-\d{4}$/;
const SLUG_RE = /^[0-9a-f]{8}$/;
const HMAC_RE = /^[0-9a-f]{12}$/;

const HANNIEL_API = 'https://app.hanniel.co';
const BCA_API_URL_ENV = 'HANNIEL_BCA_API_URL';
const SALT_ENV = 'PAY_LINK_SALT';
const PAYMENT_ACCOUNT_NAME_ENV = 'PAYMENT_ACCOUNT_NAME';
const PAYMENT_ACCOUNT_NUMBER_ENV = 'PAYMENT_ACCOUNT_NUMBER';
const PAYMENT_BANK_NAME_ENV = 'PAYMENT_BANK_NAME';

interface PagesEnv {
  [BCA_API_URL_ENV]?: string;
  [SALT_ENV]?: string;
  [PAYMENT_ACCOUNT_NAME_ENV]?: string;
  [PAYMENT_ACCOUNT_NUMBER_ENV]?: string;
  [PAYMENT_BANK_NAME_ENV]?: string;
  DEMO_PAY_LINKS?: string;
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

// ---- crypto helpers ----

function hexFromBuffer(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i++) {
    s += (bytes[i] as number).toString(16).padStart(2, '0');
  }
  return s;
}

async function sha256Hex(message: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(message));
  return hexFromBuffer(buf);
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return hexFromBuffer(sig);
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ---- formatting helpers ----

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
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const parts = iso.split('-').map(Number);
  const y = parts[0] as number;
  const m = parts[1] as number;
  const d = parts[2] as number;
  return `${String(d).padStart(2, '0')} ${months[m - 1]} ${y}`;
};

// ---- upstream calls ----

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
  if (!base) return null;
  try {
    const r = await fetch(`${base}/payment-link/${encodeURIComponent(invoiceNo)}`, {
      headers: { 'accept': 'application/json' },
    });
    if (!r.ok) return null;
    const link = await r.json() as PaymentLink;
    return link || null;
  } catch (e) {
    return null;
  }
}

// ---- QR fallback (only used when the BCA Worker is live with a real paymentLink) ----
//
// Kept here as a stub so the page knows what a QR would look like if/when the
// Worker returns a paymentLink. The inline SVG generator was removed in v0.7+
// in favour of the manual-transfer card — BCA API integration will skip this
// section entirely and go straight to "paid" via the recon Worker.

// ---- page render ----

function renderPage({ invoice, paymentLink, invoiceNo, slug, hmac, demoMode, paymentAccount }: {
  invoice: Invoice; paymentLink: PaymentLink | null; invoiceNo: string;
  slug: string; hmac: string; demoMode: boolean;
  paymentAccount: { name: string; number: string; bank: string };
}): string {
  const customerName = demoMode ? 'BCA Demo Customer' : (invoice.customer_name || '');

  const grandTotal = Number(invoice.grand_total || 0);

  const transferSection = `
    <div class="pay-transfer">
      <p class="pay-transfer-label">Transfer ke rekening</p>
      <p class="pay-transfer-bank">${escapeHtml(paymentAccount.bank)}</p>
      <p class="pay-transfer-name">${escapeHtml(paymentAccount.name)}</p>
      <p class="pay-transfer-number" data-copy="${escapeHtml(paymentAccount.number)}">
        <span class="pay-transfer-number-text">${escapeHtml(paymentAccount.number)}</span>
        <button type="button" class="pay-copy-btn" aria-label="Salin nomor rekening">Salin</button>
      </p>
      <p class="pay-transfer-amount">
        Jumlah: <strong>${formatIdr(grandTotal)}</strong>
      </p>
    </div>
    <ol class="pay-steps">
      <li>Buka aplikasi <strong>${escapeHtml(paymentAccount.bank)} mobile</strong> atau aplikasi m-banking pilihan Anda.</li>
      <li>Pilih menu <em>Transfer</em>, lalu <em>Antar Rekening</em> atau <em>Ke Rekening ${escapeHtml(paymentAccount.bank)}</em>.</li>
      <li>Masukkan nomor rekening di atas, dan pastikan nama penerima yang tertera cocok dengan <strong>${escapeHtml(paymentAccount.name)}</strong>.</li>
      <li>Masukkan jumlah pembayaran sebesar <strong>${formatIdr(grandTotal)}</strong>.</li>
      <li>Pada kolom berita, salin nomor invoice di bawah ini:
        <div class="pay-invoice-no-copy" data-copy="${escapeHtml(invoiceNo)}">
          <span class="pay-invoice-no-copy-text">${escapeHtml(invoiceNo)}</span>
          <button type="button" class="pay-copy-btn pay-copy-btn--inline" aria-label="Salin nomor invoice">Salin</button>
        </div>
        Nomor ini membantu kami memverifikasi pembayaran Anda secara otomatis.
      </li>
      <li>Konfirmasi transfer dan simpan bukti pembayaran Anda.</li>
    </ol>
    <p class="pay-transfer-note">Setelah pembayaran kami terima dan diverifikasi, invoice ini akan ditandai <strong>lunas</strong>. Jika ada pertanyaan, silakan hubungi kami melalui WhatsApp.</p>
  `;

  const qrFallback = paymentLink
    ? `
      <div class="pay-qr">
        <img class="pay-qr-img" src="/pay/${escapeHtml(invoiceNo)}/qr.png?k=${escapeHtml(hmac)}" alt="QR code ${escapeHtml(invoiceNo)}" width="220" height="220" />
        ${paymentLink.validityPeriod
          ? `<p class="pay-qr-expiry">Berlaku sampai <strong>${escapeHtml(formatDate(paymentLink.validityPeriod.split('T')[0]))} ${escapeHtml((paymentLink.validityPeriod.split('T')[1] || '').slice(0, 5))} WIB</strong></p>`
          : ''}
        <p class="pay-qr-hint">Buka aplikasi e-wallet atau m-banking Anda, pilih <em>Scan QR</em>, arahkan ke kode di atas. Pembayaran via QRIS — BCA mobile, OVO, GoPay, Dana, ShopeePay, dll.</p>
      </div>
    `
    : '';

  const demoBanner = demoMode
    ? `<div class="pay-demo-banner"><strong>Mode demo.</strong> Nama pelanggan & item di-masker untuk presentasi ke BCA facilitator.</div>`
    : '';

  return `<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>Bayar ${escapeHtml(invoiceNo)} — Little Hanniel</title>
  <meta name="description" content="Halaman pembayaran invoice ${escapeHtml(invoiceNo)} dari Little Hanniel. Transfer ke rekening ${escapeHtml(paymentAccount.bank)} ${escapeHtml(paymentAccount.number)} a/n ${escapeHtml(paymentAccount.name)} sebesar ${formatIdr(grandTotal)}." />
  <meta name="robots" content="noindex, nofollow" />
  <meta name="theme-color" content="#FDFAF6" />
  <link rel="icon" type="image/png" href="/favicon.png" />

  <meta property="og:title" content="Bayar ${escapeHtml(invoiceNo)} — Little Hanniel" />
  <meta property="og:description" content="Total ${formatIdr(grandTotal)} • Transfer ke ${escapeHtml(paymentAccount.bank)} a/n ${escapeHtml(paymentAccount.name)}" />
  <meta property="og:type" content="website" />
  <meta property="og:image" content="https://little.hanniel.co/invoices/${escapeHtml(invoiceNo)}.jpg" />
  <meta property="og:locale" content="id_ID" />
  <meta property="og:site_name" content="Little Hanniel" />

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
    .pay-shell { max-width: 480px; margin: 0 auto; padding: 32px 20px 80px; }
    .pay-header { text-align: center; margin-bottom: 24px; }
    .pay-logo {
      font-family: 'Playfair Display', Georgia, serif;
      font-size: 28px; font-weight: 500; letter-spacing: -0.02em;
      color: var(--text-strong); margin: 0;
    }
    .pay-logo-sub {
      font-size: 12px; color: var(--text-faint);
      letter-spacing: 0.18em; text-transform: uppercase; margin-top: 6px;
    }
    .pay-demo-banner {
      background: #F8E9D2; color: #8A5419;
      font-size: 12px; padding: 10px 14px; border-radius: 12px;
      text-align: center; margin-bottom: 16px;
    }
    .pay-card {
      background: var(--bg-card); border: 1px solid var(--border);
      border-radius: 18px; box-shadow: var(--shadow);
      padding: 24px 22px; margin-bottom: 16px;
    }
    .pay-card-title {
      font-family: 'Playfair Display', Georgia, serif;
      font-size: 16px; font-weight: 500;
      letter-spacing: -0.01em; color: var(--text-strong);
      margin: 0 0 14px;
    }
    .pay-transfer { text-align: left; margin-bottom: 18px; }
    .pay-transfer-label {
      font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase;
      color: var(--text-faint); margin: 0 0 6px;
    }
    .pay-transfer-bank {
      font-family: 'Playfair Display', Georgia, serif;
      font-size: 22px; font-weight: 500;
      color: var(--accent); margin: 0 0 2px;
    }
    .pay-transfer-name {
      font-size: 14px; color: var(--text-muted);
      margin: 0 0 10px;
    }
    .pay-transfer-number {
      display: flex; align-items: center; gap: 10px;
      background: var(--bg-subtle);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 12px 14px;
      margin: 0 0 12px;
    }
    .pay-transfer-number-text {
      font-family: 'JetBrains Mono', ui-monospace, 'SFMono-Regular', Menlo, monospace;
      font-size: 17px; font-weight: 600;
      letter-spacing: 0.04em;
      color: var(--text-strong);
      flex: 1;
    }
    .pay-copy-btn {
      font-family: inherit; font-size: 12px; font-weight: 600;
      letter-spacing: 0.08em; text-transform: uppercase;
      padding: 6px 12px; border-radius: 999px;
      border: 1px solid var(--accent);
      background: transparent; color: var(--accent);
      cursor: pointer;
      transition: background 0.15s, color 0.15s;
    }
    .pay-copy-btn:hover { background: var(--accent); color: white; }
    .pay-copy-btn.is-copied {
      background: #DCEFD8; color: #1F5C2A;
      border-color: #B7D5A8;
    }
    .pay-transfer-amount {
      font-size: 14px; color: var(--text-muted);
      margin: 0;
    }
    .pay-transfer-amount strong {
      color: var(--text-strong);
      font-family: 'Playfair Display', Georgia, serif;
      font-size: 18px; font-weight: 500;
    }
    .pay-steps {
      margin: 0 0 14px; padding-left: 22px;
      font-size: 13px; color: var(--text-muted);
      line-height: 1.7;
    }
    .pay-steps li { margin-bottom: 10px; }
    .pay-steps strong { color: var(--text-strong); }
    .pay-invoice-no-copy {
      display: inline-flex; align-items: center; gap: 8px;
      margin: 8px 0 6px;
      padding: 8px 10px 8px 12px;
      background: white;
      border: 1px solid var(--border);
      border-radius: 10px;
      font-variant-numeric: tabular-nums;
    }
    .pay-invoice-no-copy-text {
      font-family: 'JetBrains Mono', ui-monospace, 'SFMono-Regular', Menlo, monospace;
      font-size: 14px; font-weight: 600;
      letter-spacing: 0.04em;
      color: var(--text-strong);
    }
    .pay-copy-btn--inline {
      padding: 4px 10px; font-size: 11px;
    }
    .pay-transfer-note {
      font-size: 12px; color: var(--text-faint);
      background: var(--bg-subtle);
      border-radius: 10px;
      padding: 10px 12px;
      margin: 0;
      line-height: 1.55;
    }
    .pay-transfer-note strong { color: var(--text-muted); }
    .pay-qr { text-align: center; margin-top: 18px; padding-top: 18px; border-top: 1px dashed var(--border); }
    .pay-qr img, .pay-qr svg {
      display: block; margin: 0 auto 12px;
      border-radius: 12px; background: white;
      padding: 12px; box-shadow: var(--shadow);
    }
    .pay-qr-expiry { font-size: 13px; color: var(--text-muted); margin: 8px 0 4px; }
    .pay-qr-hint { font-size: 12px; color: var(--text-faint); line-height: 1.6; margin: 8px 0 0; }
    .pay-jpeg {
      display: block; width: 100%; height: auto;
      border-radius: 12px;
      background: white;
      box-shadow: var(--shadow);
      margin: 0 0 8px;
    }
    .pay-jpeg-fallback {
      font-size: 12px; color: var(--text-faint);
      text-align: center; padding: 20px;
      background: var(--bg-subtle);
      border-radius: 10px;
      margin: 0 0 8px;
    }
    .pay-help {
      text-align: center; font-size: 12px; color: var(--text-faint); margin-top: 24px;
    }
    .pay-help a { color: var(--accent); text-decoration: none; }
    .pay-help a:hover { text-decoration: underline; }
    @media (max-width: 360px) {
      .pay-shell { padding: 24px 16px 60px; }
      .pay-card { padding: 20px 16px; }
      .pay-logo { font-size: 24px; }
    }
  </style>
</head>
<body>
  <main class="pay-shell">
    <header class="pay-header">
      <h1 class="pay-logo">Little Hanniel</h1>
      <p class="pay-logo-sub">Pembayaran Invoice</p>
    </header>

    ${demoBanner}

    <section class="pay-card pay-jpeg-card">
      <img class="pay-jpeg"
           src="/invoices/${escapeHtml(invoiceNo)}.jpg"
           alt="Invoice ${escapeHtml(invoiceNo)} — ${escapeHtml(customerName || 'Hanniel')}"
           loading="lazy"
           width="1200" height="1500"
           onerror="this.style.display='none';this.nextElementSibling&&(this.nextElementSibling.style.display='block');" />
      <div class="pay-jpeg-fallback" style="display:none;">
        Invoice asli (JPEG) belum tersedia di server. Detail invoice bisa dilihat di WhatsApp — nomor invoice: <strong>${escapeHtml(invoiceNo)}</strong>, total: <strong>${formatIdr(grandTotal)}</strong>.
      </div>
    </section>

    <section class="pay-card">
      <h3 class="pay-card-title">Cara bayar</h3>
      ${transferSection}
      ${qrFallback}
    </section>

    <p class="pay-help">
      Butuh bantuan? <a href="https://wa.me/6285190299779?text=Halo%20Little%20Hanniel%2C%20saya%20butuh%20bantuan%20invoice%20${encodeURIComponent(invoiceNo)}" rel="noopener">Hubungi kami via WhatsApp</a>.
    </p>
  </main>
  <script>
    (function () {
      // Wire every copy-button on the page. Each .pay-copy-btn is paired
      // with the closest ancestor that has [data-copy]. Supports the BCA
      // account number (full pill) and the invoice number pill in step 5.
      var buttons = document.querySelectorAll('.pay-copy-btn');
      if (!buttons.length) return;
      function fallbackCopy(text) {
        try {
          var ta = document.createElement('textarea');
          ta.value = text;
          ta.setAttribute('readonly', '');
          ta.style.position = 'absolute';
          ta.style.left = '-9999px';
          document.body.appendChild(ta);
          ta.select();
          var ok = document.execCommand('copy');
          document.body.removeChild(ta);
          return ok;
        } catch (e) { return false; }
      }
      function flashCopied(btn, orig) {
        btn.textContent = 'Tersalin';
        btn.classList.add('is-copied');
        setTimeout(function () {
          btn.textContent = orig;
          btn.classList.remove('is-copied');
        }, 1500);
      }
      function copyText(text) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return fallbackCopy(text); });
        }
        return Promise.resolve(fallbackCopy(text));
      }
      buttons.forEach(function (btn) {
        var holder = btn.closest('[data-copy]');
        if (!holder) return;
        var orig = btn.textContent;
        btn.addEventListener('click', function () {
          var text = holder.getAttribute('data-copy')
            || (holder.querySelector('span') ? holder.querySelector('span').textContent.trim() : '');
          if (!text) return;
          Promise.resolve(copyText(text)).then(function () { flashCopied(btn, orig); });
        });
      });
    })();
  </script>
</body>
</html>`;
}

function notFoundPage(): string {
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
  <p>Tautan pembayaran tidak valid atau sudah kadaluarsa. Periksa kembali tautan dari chat WhatsApp kami, atau minta tautan baru.</p>
  <p style="margin-top: 24px;"><a href="https://little.hanniel.co">← Kembali ke Little Hanniel</a></p>
</body>
</html>`;
}

function notFoundResponse(): Response {
  return new Response(notFoundPage(), {
    status: 404,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  });
}

// ---- request handler ----

export async function onRequestGet(context: { request: Request; params: { invoice_no: string }; env: PagesEnv }): Promise<Response> {
  const param = context.params.invoice_no || '';
  const url = new URL(context.request.url);
  const demoMode = url.searchParams.get('demo') === '1';
  const providedHmac = url.searchParams.get('k') || '';
  const salt = context.env[SALT_ENV];

  // CASE A: param is a slug (8 hex chars). Canonical hardened path.
  if (SLUG_RE.test(param)) {
    if (!HMAC_RE.test(providedHmac)) return notFoundResponse();
    if (!salt) return new Response('Payment-link service not configured.', {
      status: 503, headers: { 'content-type': 'text/plain' },
    });

    // Look up the invoice_no for this slug.
    // Production: Workers KV binding PAY_LINK_MAP. Phase-1 staging: DEMO_PAY_LINKS JSON env var.
    const demoMap = (() => {
      try {
        const raw = context.env.DEMO_PAY_LINKS;
        if (!raw) return null;
        return JSON.parse(raw) as Record<string, string>;
      } catch { return null; }
    })();
    const invoiceNo = demoMap ? demoMap[param] : null;
    if (!invoiceNo || !INVOICE_RE.test(invoiceNo)) return notFoundResponse();

    // Verify HMAC.
    const expectedHmac = (await hmacSha256Hex(salt, invoiceNo)).slice(0, 12);
    if (!timingSafeEqualHex(expectedHmac, providedHmac.toLowerCase())) return notFoundResponse();

    return await renderForInvoice(invoiceNo, param, providedHmac, demoMode, context.env);
  }

  // CASE B: param is a raw invoice number (LH-YYMM-####). Legacy / demo.
  if (INVOICE_RE.test(param)) {
    const invoiceNo = param;

    if (salt) {
      // Redirect to the canonical slug form. No body, no invoice_no in response.
      // Preserve the original Host header so the redirect target matches the
      // user-facing domain (the CF Pages middleware rewrites the URL but the
      // Host header still carries the original hostname).
      const slug = (await sha256Hex(`${salt}|${invoiceNo}`)).slice(0, 8);
      const hmac = (await hmacSha256Hex(salt, invoiceNo)).slice(0, 12);
      const qs = new URLSearchParams();
      qs.set('k', hmac);
      if (demoMode) qs.set('demo', '1');
      const host = context.request.headers.get('x-original-host')
        || context.request.headers.get('host')
        || url.host;
      const proto = url.protocol.replace(':', '');
      return Response.redirect(
        `${proto}://${host}/pay/${slug}?${qs.toString()}`,
        302,
      );
    }

    // Fallback: salt not bound (early staging). Render directly. The
    // qr.png endpoint requires ?k= and won't work here, so we use
    // a synthetic (slug, k) pair just for the page render — the
    // generated URL is stable for this single invoice_no only.
    const fakeSlug = 'fb' + invoiceNo.slice(-6).toLowerCase(); // 8 chars
    const fallbackSalt = 'fallback-' + invoiceNo;
    const fakeHmac = (await hmacSha256Hex(fallbackSalt, invoiceNo)).slice(0, 12);
    return await renderForInvoice(invoiceNo, fakeSlug, fakeHmac, demoMode, {
      ...context.env,
      PAY_LINK_SALT: fallbackSalt,
      DEMO_PAY_LINKS: JSON.stringify({ [fakeSlug]: invoiceNo }),
    });
  }

  // CASE C: neither shape. Garbage.
  return notFoundResponse();
}

async function renderForInvoice(
  invoiceNo: string,
  slug: string,
  hmac: string,
  demoMode: boolean,
  env: PagesEnv,
): Promise<Response> {
  const [fetched, paymentLink] = await Promise.all([
    fetchInvoice(invoiceNo),
    fetchPaymentLink(env, invoiceNo),
  ]);

  if ('notFound' in fetched) return notFoundResponse();
  if ('error' in fetched) return new Response(`Upstream error: ${fetched.error}`, {
    status: 502, headers: { 'content-type': 'text/plain' },
  });

  const paymentAccount = {
    name: (env[PAYMENT_ACCOUNT_NAME_ENV] || '').trim(),
    number: (env[PAYMENT_ACCOUNT_NUMBER_ENV] || '').trim(),
    bank: (env[PAYMENT_BANK_NAME_ENV] || 'BCA').trim(),
  };

  // If payment account isn't configured, render an admin-visible error
  // instead of an incomplete page. Don't leak invoice details.
  if (!paymentAccount.name || !paymentAccount.number) {
    return new Response(
      'Payment account not configured. Set PAYMENT_ACCOUNT_NAME and PAYMENT_ACCOUNT_NUMBER env vars on the Pages project.',
      { status: 503, headers: { 'content-type': 'text/plain' } },
    );
  }

  const html = renderPage({
    invoice: fetched.invoice,
    paymentLink,
    invoiceNo,
    slug,
    hmac,
    demoMode,
    paymentAccount,
  });
  return new Response(html, {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': demoMode ? 'no-store' : 'public, max-age=60',
    },
  });
}
