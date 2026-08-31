# /pay/ — customer-facing payment page (phase 1)

Self-contained CF Pages function. No new D1, no new DNS, no new env vars
(until the BCA Worker is wired in — see `HANNIEL_BCA_API_URL` below).

## What's live today (2026-08-31)

- `GET /pay/<invoice_no>` — renders the invoice summary on the Hanniel
  brand (warm cream + cocoa ink + caramel accent), with a "QR will be
  available once BCA API is live" placeholder card. Reads invoice data
  from `app.hanniel.co/api/invoice/{invoice_no}` (the existing hanniel-modules
  public contract). No auth.
- `GET /pay/<invoice_no>/qr.png` — placeholder; returns 404 with a
  1×1 transparent PNG. The page's `<img src=…qr.png>` fails gracefully
  (the surrounding card already shows the "coming soon" copy).

## What the BCA Worker will unlock (phase 2)

When `HANNIEL_BCA_API_URL` is set as a Pages env var, the page:

- Calls `${HANNIEL_BCA_API_URL}/payment-link/{invoice_no}` in parallel
  with the invoice fetch.
- If a payment_link is returned, replaces the placeholder card with the
  real QR (`<img src=…qr.png>`) + the "Berlaku sampai … WIB" expiry.
- The `qr.png` endpoint then base64-decodes the `qrImageB64` from the
  Worker and returns it as `image/png` with a 5-minute cache.

No code changes required to enable phase 2 — just set the env var.

## Test invoice

`LH-2608-0042` (real, from the existing hanniel-modules D1) is the
recommended demo invoice. Total Rp 252.000, customer "Kelly", three items.

## Why this exists

The BCA facilitator has been unresponsive for "a few months" as of
2026-08-31. Building the customer-facing page now (without live BCA)
gives the facilitator something concrete to look at and removes one
abstraction layer from the conversation. See
`~/.hermes/memories/projects/hanniel-bca.md` for the full context.

## Invoice-number contract

`LH-YYMM-####` — 2-digit year + 2-digit month + 4-digit sequence.
Reuses the same format as hanniel-modules, hanniel-web, and the agent
path. Verified 2026-06-28 in
`~/.hermes/skills/hanniel-invoice/references/invoice-number-and-date-parity.md`.
This same string is what we'll use as the BCA `partnerReferenceNo`.

## File layout

```
functions/pay/
├── [invoice_no].ts            # the page
└── [invoice_no]/
    └── qr.png.ts              # the QR image (placeholder until Worker)
```

## Brand tokens used

| Token | Value | Source |
|---|---|---|
| `--bg-page` | `#FDFAF6` | `DESIGN-HANNIEL.md` |
| `--bg-card` | `#FFFCF7` | (slightly lighter than page) |
| `--bg-subtle` | `#F5EFE6` | `DESIGN-HANNIEL.md` |
| `--text-strong` | `#2B2118` | `DESIGN-HANNIEL.md` |
| `--text-muted` | `#6E5F4F` | derived |
| `--text-faint` | `#9B8A78` | derived |
| `--border` | `#E8DFD2` | derived |
| `--accent` | `#A67C52` | `DESIGN-HANNIEL.md` (caramel) |
| Fonts | Playfair Display + Inter (400) | self-hosted in `/assets/fonts/` |
