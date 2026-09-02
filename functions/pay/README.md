# /pay/ — customer-facing payment page

Self-contained CF Pages function. No new D1, no new DNS.

## What's live today (2026-09-02)

Two URL patterns are accepted:

| URL | When to use |
|---|---|
| `https://staging.little.hanniel.co/pay/<slug>?k=<hmac>` | **Canonical, production.** Unguessable, no invoice_no leaked. |
| `https://staging.little.hanniel.co/pay/<invoice_no>` | **Legacy/demo.** Still works; redirects to the slug URL when the salt is bound. |

### Slug shape

- `<slug>` = first 8 hex chars of `SHA-256(PAY_LINK_SALT + "|" + invoice_no)`
- `<hmac>` = first 12 hex chars of `HMAC-SHA-256(PAY_LINK_SALT, invoice_no)`

Both are derived from `PAY_LINK_SALT`, a per-environment CF Pages env var.
Brute-forcing the (slug, k) space is 2^80 work — economically irrational.

### Demo mode

Append `?demo=1` to mask customer name + items. The payment account info
(BCA, account number) is intentionally **NOT** masked — it's the company's
bank account, not the customer's PII. Used for the BCA facilitator preview
URL so real customer data doesn't leak.

## Page sections

```
+---------------------------------------+
|  Little Hanniel (header)              |
|  Pembayaran Invoice (subtitle)        |
+---------------------------------------+
|  LH-YYMM-NNNN        DD MMM YYYY      |
|  [STATUS]                              |
|  Kepada <Customer Name>                |
|  -----                                 |
|  ITEM         QTY   HARGA   TOTAL     |
|  ...                                   |
|  Subtotal           Rp X               |
|  Ongkir (jika ada)  Rp X               |
|  Total              Rp X               |
+---------------------------------------+
|  Cara bayar                            |
|  TRANSFER KE REKENING                  |
|  BCA (bank, big serif)                 |
|  HANNIEL KAIROS INDONESIA (a/n)        |
|  7195316091     [Salin] (mono pill)    |
|  Jumlah: Rp X                          |
|  1. Buka aplikasi BCA mobile...        |
|  2. Pilih Transfer → Antar Rekening    |
|  3. Masukkan nomor rekening...         |
|  4. Masukkan jumlah...                 |
|  5. Tambahkan berita: <invoice_no>     |
|  6. Konfirmasi transfer.               |
|  -----                                 |
|  Invoice ini akan ditandai lunas...    |
+---------------------------------------+
|  Butuh bantuan? Hubungi via WhatsApp   |
+---------------------------------------+
```

## File layout

```
functions/pay/
├── [invoice_no].ts                  # canonical — page + verify (slug + hmac)
├── [invoice_no]/
│   └── qr.png.ts                    # QR image (only used if Worker is live)
└── README.md
```

## Env vars (CF Pages project settings)

| Var | Value | Notes |
|---|---|---|
| `PAY_LINK_SALT` | `lh-pay-<env>-<random>` | Per-environment, never committed. |
| `DEMO_PAY_LINKS` | JSON `{ "<slug>": "<invoice_no>", ... }` | Staging-only; pre-baked for demo. Prod uses Workers KV. |
| `PAYMENT_ACCOUNT_NAME` | `HANNIEL KAIROS INDONESIA` | Company account holder. Per-env if prod differs. |
| `PAYMENT_ACCOUNT_NUMBER` | `7195316091` | The full BCA account number, no spaces. |
| `PAYMENT_BANK_NAME` | `BCA` | Default if unset. |
| `HANNIEL_BCA_API_URL` | Worker URL | Empty until phase 2 (QR Worker). |

If `PAYMENT_ACCOUNT_NAME` or `PAYMENT_ACCOUNT_NUMBER` is unset, the page
returns HTTP 503 with an operator-facing message. The function never
silently leaks an invoice page without payment info.

## Manual transfer vs QR — why manual now

Erwin chose manual transfer for the immediate workflow (2026-09-02).
Customer flow:

1. Customer opens `https://staging.little.hanniel.co/pay/<slug>?k=<hmac>` (sent in WhatsApp DM).
2. Page shows invoice + bank account + 6-step instructions + copy button.
3. Customer opens BCA mobile, taps "Salin" → number is on clipboard, pastes into the transfer form, enters the amount, adds the invoice_no as news, confirms.
4. Cron pulls bank statement 3×/day (8am/4pm/12am WIB), matches incoming CREDIT by amount + news → marks invoice paid → WhatsApp thank-you.

The QR flow will be a *phase 2 addition* (separate `paymentLink` data, separate UI section). For now, only the manual-transfer card is rendered.

## Phase 2 (BCA Worker live, optional)

When `HANNIEL_BCA_API_URL` is set as a Pages env var:

- The page calls `${HANNIEL_BCA_API_URL}/payment-link/{invoice_no}`
  in parallel with the invoice fetch.
- If a paymentLink is returned, an additional `<img src=/pay/<slug>/qr.png?k=<hmac>>`
  section appears BELOW the manual-transfer card (separated by a dashed rule).
  Customers can scan QR OR transfer manually — both paths supported.
- The `qr.png` endpoint verifies (slug, k), fetches `qrImageB64` from the
  Worker, decodes base64 → PNG, returns as `image/png` with 5-min cache.

No code changes required to enable phase 2 — just set the env var.

## Test invoices (staging)

- `LH-2608-0042` — Kelly, Rp 252.000
- `LH-2608-0073` — Shieren, Rp 440.000 (with ongkir Rp 28.000)

Live URLs (after deploy):
- Canonical 0042: `https://staging.little.hanniel.co/pay/859e2827?k=88ce2982fee9`
- Canonical 0073: `https://staging.little.hanniel.co/pay/91fd47ae?k=0a7b2c8c5b62`
- Legacy 0042: `https://staging.little.hanniel.co/pay/LH-2608-0042` (302 → canonical)
- Legacy 0073: `https://staging.little.hanniel.co/pay/LH-2608-0073` (302 → canonical)
- Demo (masked customer): append `&demo=1`
