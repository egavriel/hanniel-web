# Little Hanniel e-Gift — plan & research

Status: v1 built on `feature/egift` (2026-10-29). Lives at `/gift` (buy + dashboard)
and `/g/<code>` (the recipient's card).

---

## 1. The product in one line

A friend pays for **5** overnight oats, the recipient gets **6**. The gift is a
link sent over WhatsApp; the recipient unwraps it, then redeems treats one or a
few at a time until the jar is empty.

## 2. Bundle rule

One rule for every product line: **every 5 paid → +1 free.**

| Line | Unit price | Example | Pays | Gets |
|---|---|---|---|---|
| Overnight Oats (Double Chocolate / Strawberry / Tiramisu) | 42k | Treat | 210k | 6 |
| | | Sharing | 420k | 12 |
| | | Office | 840k | 24 |
| Cookies (Almond Choco / Double Choco / Raisin Oat) | 70k | Treat | 350k | 6 |

- Prices and the `bonusEvery` rule live in `functions/_lib/gift-catalog.js`.
  The server always recomputes the price, so the browser can't set it.
- The recipient picks the **flavour at redemption time**, not the sender. That
  keeps buying to three taps, and gives the recipient a choice to enjoy.
- Minimum 3 units, maximum 60. Cards expire **6 months** after payment, which is
  printed on the card.

## 3. Flows

### Sender (aim: under 60 seconds)

1. **Pick**: choose oats or cookies, then a stepper. The stamp card fills in as
   the count goes up, and a bar shows "2 more for a FREE one". When the bonus
   unlocks, the free stamp pops in gold.
2. **Personalise**: the recipient's name, a short message (prompt chips like
   "Happy birthday!"), and a card colour. The live card tilts and shimmers.
3. **Verify WhatsApp**, only if not signed in yet: name + WA number → 6-digit
   OTP sent on WhatsApp. The code field supports autofill and paste.
4. **Pay**: BCA transfer with `GIFT-XXXX` in the transfer note, the same
   pattern as `/pay`. A copy button is included.
5. **Share**: one big "Send on WhatsApp" button with prefilled text and the
   link. The recipient can open it before payment clears and sees
   "your gift is being wrapped".

### Recipient

1. Opens `/g/<code>` from WhatsApp. The link preview says *"Erwin sent you 6
   Overnight Oats 🎁"* (server-rendered OG tags).
2. **Unwrap**: tap the gift box. It shakes, the lid flies off, the card rises,
   confetti falls, and the treat counter counts up 0 → 6.
3. **Claim**: name + WA number + OTP. This binds the card to their phone, so
   the link stops working for anyone they forward it to.
4. **Redeem**: pick flavour + qty → treats are reserved on the server → opens
   WhatsApp to Little Hanniel with the order prefilled (`Redeem GIFT-XXXX: 2×
   Tiramisu`). Fulfilment stays in the WhatsApp flow the shop already uses.
5. **Thank**: one-tap emoji reaction + optional note, which shows on the
   sender's dashboard.
6. **Clean plate**: when the last treat is used → celebration + "Pay it
   forward" CTA, which loops back to step 1 of the sender flow.

## 4. Gamification design (and why)

| Mechanic | Where | Principle |
|---|---|---|
| Stamp card with the free slot already visible | Sender pick step | **Goal-gradient effect**: people speed up as a visible goal gets close ("2 more for a free one") |
| Gold pop + haptic tick when the bonus unlocks | Sender | **Immediate reward** on the action that drives order value |
| Live card preview, 3D tilt, foil sweep | Sender | **IKEA effect**: people value what they personalise |
| Gift box unwrap → card → confetti | Recipient | **Anticipation + reveal**: the unboxing moment is the shareable peak |
| "Treats enjoyed" jar that *fills* as you redeem | Recipient | Frame redemption as progress, not a draining balance (avoids **loss aversion**) |
| Flavour Explorer badge (try all 3) | Recipient | **Completionism** spreads demand across flavours |
| Gifter levels: Kind Crumb → Sweet Friend → Golden Spoon → Hanniel Hero | Sender dashboard | **Status / progression**, and a reason for the next gift |
| Joy meter: % of your gifted treats your friends enjoyed, plus thank-you reactions | Sender dashboard | **Social feedback loop**: the sender sees the impact, which is what makes them gift again |
| "Pay it forward" when the card is finished | Recipient | **Viral loop**: every recipient becomes a likely sender |

All motion respects `prefers-reduced-motion`. Animations use only `transform`
and `opacity`, plus one canvas for confetti, so they stay smooth on cheap
Android phones.

### Optional perk switches (business decision, off by default)

- Golden Spoon level → +1 bonus treat on their next gift.
- Clean-plate recipients get 10% off their first own order.

## 5. WhatsApp OTP: research & choice

| Option | Notes | Fit |
|---|---|---|
| **Fonnte** (fonnte.com) | Indonesian gateway, simple `POST https://api.fonnte.com/send` with `Authorization: <token>`, `target`, `message`. Sends from your own WA number via a linked device. | **Recommended to start**: cheap, minutes to set up. Uses an unofficial linked-device session, so keep the volume low and the text plain. |
| **Meta WhatsApp Cloud API** | Official API. OTP must use an approved **Authentication** template with a copy-code button. Billed per message. Needs Business verification. | The upgrade path once volume grows. |
| Wablas / Watzap / Qontak | Similar to Fonnte or BSP-backed | Alternatives |

Implemented as a provider switch: `WA_OTP_PROVIDER = fonnte | meta | dev`.
`dev` returns the code in the API response, and **only** when
`GIFT_DEV_OTP=1`, so it never runs in production by accident.

Security rules in code:
- Only the SHA-256 hash of `code + phone + secret` is stored. Codes expire after
  5 minutes, with max 5 tries per code.
- Max 3 sends per phone per 15 minutes, with a 30 s cooldown between them.
- Phones are normalised to `628…` (accepts `08…`, `+62…`, `62…`).
- The session is an HMAC-signed, HttpOnly, SameSite=Lax cookie (30 days),
  so there are no server-side session rows.
- Redemption is reserved with one conditional `UPDATE … WHERE units_redeemed +
  ? <= units_total`, so there are no double spends.

## 6. Data model (D1 binding `GIFT_DB`)

See `migrations/0001_gift.sql`: `gift_users`, `gift_otps`, `gifts`,
`gift_redemptions`. It can share the `hanniel_events` database or use its own.

## 7. Operations

- **Payment confirm**: `POST /api/gift/admin/paid` with `{code}` and
  `Authorization: Bearer $GIFT_ADMIN_TOKEN`. The bank-statement cron that
  already matches `/pay` invoices can call this when it sees `GIFT-XXXX` in the
  transfer note.
- **Fulfil**: `POST /api/gift/admin/fulfil` with `{redemption_id}`.
- **List**: `GET /api/gift/admin/list`.
- **Accounting**: gift sales are a liability (deferred revenue) until redeemed.
  Free bonus units are a discount. Check the treatment with your accountant.

## 8. Env vars

| Var | Purpose |
|---|---|
| `GIFT_SESSION_SECRET` | HMAC key for sessions + OTP hashing (required) |
| `GIFT_ADMIN_TOKEN` | Bearer token for admin routes |
| `WA_OTP_PROVIDER` | `fonnte`, `meta` or `dev` |
| `FONNTE_TOKEN` | if fonnte |
| `META_WA_TOKEN`, `META_WA_PHONE_ID`, `META_WA_TEMPLATE` | if meta |
| `GIFT_DEV_OTP` | `1` only on local / staging |
| `PAYMENT_ACCOUNT_NAME`, `PAYMENT_ACCOUNT_NUMBER`, `PAYMENT_BANK_NAME` | reused from `/pay` |
| `HANNIEL_WA` | shop number for redemption messages (default `6285190299779`) |

## 9. Run it locally

```bash
wrangler d1 execute GIFT_DB --local -c <a wrangler.toml declaring GIFT_DB with database_id "gift-local"> --persist-to .wrangler/state --file migrations/0001_gift.sql
```

Then start the `gift-dev` entry in `.claude/launch.json` (wrangler pages dev on
port 18790, with dev OTP on). Open `/gift`. The OTP code shows up in the sheet.
Mark a gift paid with:

```bash
curl -H "authorization: Bearer local-admin" -H "content-type: application/json" -d '{"code":"GIFT-XXXXXXXX"}' http://127.0.0.1:18790/api/gift/admin/paid
```

## 10. Before going live

1. Create the D1 tables in production: run the migration against the real
   database, and add a `GIFT_DB` binding to the Pages project.
2. Set `GIFT_SESSION_SECRET`, `GIFT_ADMIN_TOKEN`, `WA_OTP_PROVIDER=fonnte` and
   `FONNTE_TOKEN` in the Pages env. **Don't** set `GIFT_DEV_OTP` in production.
3. Hook the bank-statement cron up to `/api/gift/admin/paid` for `GIFT-` notes.
4. Add a "Gift a friend" link from the homepage menu to `/gift`.

## 11. Next phases

- Phase 2: QRIS via the BCA Worker, so payment auto-confirms in seconds.
- Phase 2: a card image (OG PNG) per gift for richer WhatsApp previews.
- Phase 3: mixed bundles (oats + cookies) via credits instead of units.
- Phase 3: scheduled delivery ("send on her birthday at 8am").
