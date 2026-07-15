# Hanniel Brand Overlay

A Hanniel-specific adaptation of the Mastercard design system
(`DESIGN.md` in this directory, sourced from
[VoltAgent/awesome-design-md](https://github.com/VoltAgent/awesome-design-md)).

Hanniel is a small family home bakery in Batam, Indonesia. The Mastercard
system was chosen because it shares three load-bearing traits with our
brand: warm putty-cream canvas (vs. sterile white), editorial weight-450
body, and pill-shaped navigation. We keep the **system**; we swap the
**color story** and the **type system** for a Hanniel voice.

---

## What we keep from the Mastercard system

| Mastercard | Hanniel | Why |
|---|---|---|
| Canvas Cream `#F3F0EE` body bg | `--bg-page: #FDFAF6` (a touch warmer) | Same gesture: never sterile white |
| Lifted Cream `#FCFBFA` for nested surfaces | `--bg-subtle: #F5EFE6` for sections | Same gesture: paper on paper |
| Ink Black `#141413` for primary CTA + body | `--text-strong: #2B2118` (warm cocoa, not neutral black) | Same gesture: warm ink, never jet |
| 20px pill radius on body CTAs | 20–22px on body CTAs | Same gesture: signature pill |
| 40px stadium on hero media | 22px on hero strip (we keep media rectangular, not stadium) | Deviation: keep the family |
| Floating pill nav below viewport top | Logo-only centered header (no nav) | Existing modu-style — deviates, but the empty space is intentional |
| Soft shadow scale 0.04/0.08/0.25 opacity | Same scale, warm-tinted (rgba 43,33,24 not 0,0,0) | Same gesture: atmospheric cushioning, not hard light |
| Ghost watermark headlines (cream-on-cream) | Not adopted — Hanniel has no display surface for ghost text | Hold back: no decorative needs |
| -2% letter-spacing on headlines | -0.02em on h1/h2/h3, -0.025em on h1 | Same gesture: editorial density |
| 8px base spacing scale | 8px base, but `clamp()` on section padding for fluidity | Same gesture: 8/16/24/32/48/64/96/128 |
| Section vertical padding ~96–128px desktop | `clamp(5rem, 10vw, 9rem)` desktop | Same gesture: ample whitespace |
| Signal orange `#CF4500` reserved for legal/consent | We use Caramel `#A67C52` as accent (not signal); WhatsApp `#25D366` for the only true CTA | Deviation: Hanniel has no legal action surface, so the orange slot becomes caramel |

## What we swap

### Color story

The Mastercard system has a sharp "red+yellow locked to the brand mark,
orange reserved for consent" rule. Hanniel has a different brand mark (the
H logo) and a different signal (WhatsApp green). The page-level accent is
**caramel `#A67C52`**, used in three ways only:

1. Eyebrow labels (`.eyebrow`) — the dominant accent in normal reading
2. `data-active` states and the scroll progress bar
3. The WhatsApp-pill shadow (`rgba(37, 211, 102, 0.4)`) for the floating
   button — the only place WhatsApp green lives

Carrying caramel into CTA fills would dilute it. The primary CTA stays
**Ink Black on cream** (warm-near-black), with caramel reserved for the
accent role Mastercard gives to orange.

### Type system

Mastercard's MarkForMC is proprietary; we use the open-source stack Hanniel
already ships:

- Display: **Playfair Display** weight 500 (matches the 500 weight rule,
  serif weight carries the "editorial" tone MarkForMC's geometric sans
  achieves for Mastercard)
- Body: **Lora** weight 400, **with the body rendered at 500 via CSS**
  on `.hero__lead`, `.story__body`, `.contact p` to mimic Mastercard's
  signature weight-450 tone. We do not introduce a 450 font-weight — we
  upgrade from 400 to 500, which is the closest stable weight on Lora
  and gives the same "firmer than 400, softer than 700" feel.
- Eyebrow: **Inter** weight 600, 0.2em tracking (matches the +4% rule
  rounded to em)
- Decorative hand: **Gochi Hand** kept for the existing `.hero__hand`
  element (skewed, vertical, decorative only)

### Buttons

Mastercard's signature is "Ink Black pill, cream text, 20px radius, 6×24
padding." Hanniel already ships three CTA styles. We keep all three
(brand has been using them) and tighten them to the system:

| CTA | Status | Treatment |
|---|---|---|
| `.hero-btn` (modu-style 3-up, dark fill on cream) | **Keep** | Already a 1.5px ink border; tighten radius to 6px (deviation: square corners are part of modu.sg DNA, and Hanniel explicitly adopted that pattern) |
| `.btn--primary` (caramel pill) | **Demote** | Caramel was used as the primary accent but per the brand-story swap, the primary CTA should be Ink Black. Kept available for menu order card and footer; not used in the hero |
| `.btn--secondary` (caramel outline) | **Keep** | Same role |
| `.menu__order-btn` (WhatsApp pill) | **Keep** | WhatsApp green is the literal CTA signal — the only place the accent is allowed to fill a button |
| `.channel--wa` / `.channel--ig` | **Keep** | Same |

### Nav

Hanniel uses a centered logo only (modu-style), no top nav. The Mastercard
floating pill pattern would conflict with that. We hold back — the empty
space between announcement bar and logo is the Hanniel nav.

### Service portraits (circular)

Mastercard's signature is circular image masks with white satellite CTAs
attached. Hanniel has only rectangular imagery (oats photos, family photos,
menu sheet). We do not crop these to circles — that would distort the
existing brand photography (oats photos are 4:5 product shots, family
photos are full-bleed moments). We **hold back** on this gesture.

---

## The single Hanniel "feel" line

> Calm, confident, and warm. The page should feel like a handwritten note
> on heavy cream paper — every weight and every radius earns its keep.
