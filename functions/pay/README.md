# /pay/ — customer-facing payment page

Self-contained CF Pages function. No new D1, no new DNS until phase 2.

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
The salt is rotated per environment; production uses a different salt from
staging.

### Generation

The matching generator lives in `hanniel-invoice` (the skill that issues
payment links) and in any operator-side tooling. The page itself only
*verifies*, never generates. Verification is timing-safe (`charCodeAt`
xor-diff) and stateless — no D1 round-trip needed.

### Demo mode

Append `?demo=1` to mask customer name + items. Used for the BCA
facilitator preview URL — keeps real customer data out of screenshots.

## File layout

```
functions/pay/
├── [slug].ts                  # canonical — page + verify
├── [slug]/
│   └── qr.png.ts              # QR image (placeholder until Worker is live)
├── [invoice_no].ts            # legacy shim — 302 to slug URL, or fallback render
└── README.md
```

## Phase 1 (BCA Worker not live)

The page renders an inline SVG QR placeholder so the facilitator can
*see* what the page will look like. The placeholder shows the amount
and invoice_no in the frame for clarity. It is NOT scannable — it's
purely a visual mock.

## Phase 2 (BCA Worker live)

When `HANNIEL_BCA_API_URL` is set as a Pages env var:

- The page calls `${HANNIEL_BCA_API_URL}/payment-link/{invoice_no}`
  in parallel with the invoice fetch.
- If a payment_link is returned, the inline SVG is replaced by an
  `<img src=/pay/<slug>/qr.png?k=<hmac>>` pointing at the same
  project's `qr.png` endpoint.
- The `qr.png` endpoint verifies (slug, k), fetches `qrImageB64`
  from the Worker, decodes base64 → PNG, returns as `image/png` with
  5-minute cache.

No code changes required to enable phase 2 — just set the env var.

## Env vars (CF Pages project settings)

| Var | Value | Notes |
|---|---|---|
| `PAY_LINK_SALT` | `lh-pay-<env>-<random>` | Per-environment, never committed. |
| `DEMO_PAY_LINKS` | JSON `{ "<slug>": "<invoice_no>", ... }` | Staging-only; pre-baked for demo. Prod uses Workers KV. |
| `HANNIEL_BCA_API_URL` | Worker URL | Empty until phase 2. |

## Test invoice (staging)

`LH-2608-0042` — Kelly, Rp 252.000, three overnight oats items.

Live URLs (after deploy):
- Canonical: `https://staging.little.hanniel.co/pay/859e2827?k=88ce2982fee9`
- Legacy: `https://staging.little.hanniel.co/pay/LH-2608-0042` (302 → canonical)
- Demo (masked): `…?demo=1`
