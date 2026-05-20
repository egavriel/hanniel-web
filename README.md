# Hanniel Web

The public-facing website for **Little Hanniel** — a family home baking business. Built as a handcrafted static site with no frameworks, no build step, and no dependencies: just HTML, CSS, and vanilla JavaScript.

> **Context:** This is a personal project with a real-world audience. It's the storefront for a side business run by my family, currently live and taking orders via WhatsApp and Instagram. The deliberate choice to keep it dependency-free was intentional — the goal was full control over every pixel and interaction, fast load time on mobile, and zero maintenance overhead from a build toolchain.

---

## What It Is

A single-page marketing and ordering site for two home-made food products — Almond Choco Cookies and Overnight Oats — told through a family story. The site uses a timeline-driven narrative structure to walk visitors through the origin of the business before presenting the menu.

**Live at:** [little.hanniel](https://instagram.com/little.hanniel) *(Instagram)*  
**Orders via:** WhatsApp

---

## Features

- **Announcement bar** — dismissible WIP banner, easily swapped for promotions
- **Fixed header** with slide-out mobile navigation and keyboard (`Escape`) support
- **Desktop timeline sidebar** — a fixed left-side nav that tracks the active section as the user scrolls
- **Scroll reveal animations** — fade-in-up on content as it enters the viewport
- **Hero parallax** — subtle depth on the hero image on desktop scroll
- **Journal section** — editorial story cards, alternating layout, date-stamped
- **Products / Menu section** — product cards with inline CTAs linking to WhatsApp ordering
- **Contact section** — WhatsApp and Instagram CTAs
- **Floating WhatsApp button** — appears after scrolling 400px, for persistent ordering access
- **Smooth scroll** — all in-page anchor links use `window.scrollTo` with offset compensation for the fixed header
- **Page load fade-in** — body fades in on `DOMContentLoaded` for a polished entrance

---

## Technical Decisions

### Zero dependencies, no build step

There is no `package.json`, no bundler, no preprocessor. The site is three files: `index.html`, `styles.css`, `script.js`. This was a deliberate choice:

- **Instant deploy** to any static host (GitHub Pages, Cloudflare Pages, Netlify) by simply pointing at the repo root
- **No dependency rot** — nothing to `npm audit` or update
- **Full control** over what ships to the browser; no framework runtime overhead

The tradeoff is that scaling to a multi-page site would require discipline to keep CSS and JS organized. At this scope, it's the right call.

### CSS design system via custom properties

Rather than using a utility framework, the stylesheet is built on a set of CSS custom properties defined in `:root`:

```css
:root {
    --color-bg: #FDFAF6;          /* warm off-white */
    --color-accent: #A67C52;      /* terracotta */
    --font-serif: 'Playfair Display', Georgia, serif;
    --font-body: 'Lora', Georgia, serif;
    --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
    /* ... */
}
```

This makes the visual language consistent and easy to update from a single location — changing `--color-accent` repaints the entire site. The design is inspired by editorial café aesthetics (warm earth tones, serif typography, generous whitespace).

### IntersectionObserver for two distinct jobs

`IntersectionObserver` is used twice with different configurations:

1. **Scroll reveal** — observes `.reveal` elements and adds a `visible` class when they cross a 12% threshold. Elements are unobserved after firing (one-shot animation). Hero elements are excluded since they use a CSS keyframe animation instead.

2. **Timeline tracking** — observes section elements and updates the `active` class on the corresponding timeline sidebar item. Uses a tighter rootMargin (`-10% 0px -20% 0px`) to trigger only when a section is meaningfully in the viewport, not just touching the edge.

Using `IntersectionObserver` for both keeps the scroll handler lean — only header state and floating button visibility are computed on scroll, everything else is observer-driven.

### Passive scroll listeners

All `scroll` event listeners are registered with `{ passive: true }` to avoid blocking the browser's paint thread — important for smooth parallax and header effects on mobile.

### Performance considerations

- Hero image uses `loading="eager"` — it's above the fold and must not lazy-load
- All other images use `loading="lazy"`
- Google Fonts are loaded with `<link rel="preconnect">` to warm the DNS connection before the stylesheet request
- Parallax is gated to `window.innerWidth > 1024` — it doesn't run on mobile where it would cause layout jank

### Semantic HTML structure

The page uses proper landmark elements throughout: `<header>`, `<nav>`, `<main>`, `<aside>`, `<section>`, `<article>`, `<footer>`. Product stories use `<article>` because they're self-contained pieces of content. The timeline sidebar uses `<aside>` as it's complementary navigation. All interactive elements have `aria-label` attributes.

---

## Project Structure

```
hanniel-web/
├── index.html          # Full page — all sections, markup, no templates
├── styles.css          # Design system + component styles (~1000 lines)
├── script.js           # All interactions: menu, scroll, observers, parallax
└── assets/
    ├── logo.png
    ├── family_hero.png
    ├── family_beginning.png
    ├── overnight_oats.png
    ├── almond_choco_cookies.png
    └── family_christmas.png   # Reserved for Christmas '25 section
```

---

## Sections

| Section | ID | Notes |
|---|---|---|
| Hero | `#hero` | Full-width editorial image + CTA |
| Journal | `#journal` | Story timeline with alternating cards |
| — The Beginning | `#story-beginning` | 2023 origin story |
| — Overnight Oats | `#story-oats` | 2024 product origin |
| — Christmas '25 | `#story-christmas` | Drafted, currently commented out |
| Menu | `#products` | Product cards with WhatsApp CTAs |
| Contact | `#contact` | Social + messaging links |

---

## Running Locally

No install required. Open `index.html` directly in a browser, or serve it with any static server:

```bash
# Python
python3 -m http.server 8080

# Node
npx serve .
```

---

## Deployment

This site deploys from the repo root to any static host. Recommended options:

**Cloudflare Pages** (zero-config, global CDN):
1. Connect the GitHub repo in the Cloudflare Pages dashboard
2. Set build command to *(none)* and output directory to `/`
3. Push to `main` — it deploys automatically

**GitHub Pages:**
1. Go to repo Settings → Pages
2. Set source to `main` branch, root folder
3. Done

No build step, no environment variables, no configuration needed.

---

## Credential Audit

This repository contains no credentials, secrets, API keys, or sensitive data of any kind — and structurally cannot, as it is a pure static frontend with no server-side code. There are no `.env` files, no npm config, and no authentication logic. The only external references are public social media links (Instagram, WhatsApp contact link) that are already publicly shared on the business's social profiles.

**Audit result: clean.**
