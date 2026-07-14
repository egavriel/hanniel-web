/* =====================================================================
   Little Hanniel — Fluid scroll-linked motion (GSAP + Lenis)
   Replaces the previous IntersectionObserver reveal system.

   Sections mapped:
     - Hero:        load cascade + scrubbed drift
     - Trust strip: stagger fade-up
     - Ingredients: rotate-settle cards (preserves modu-shake on icons)
     - Menu:        rotate-settle cards (alternating ±3°)
     - Fullbleed:   scrubbed image parallax
     - Journal:     rotate-settle stories + scrubbed image parallax
     - FAQ:         fade-up + accordion (handled in script.js)
     - Contact:     fade-up

   Global:
     - Every targeted <img> wrapped in overflow:hidden, scaled 1.18,
       translated Y with scrub: true as the container crosses the viewport.

   Safety:
     - prefers-reduced-motion: reduce → no Lenis, no GSAP set / scrollTrigger
     - JS disabled → no hidden initial states in CSS; content visible
     - Mobile (≤860px) → amplitudes ×0.6
   ===================================================================== */
(function () {
  'use strict';

  // Bail entirely if motion libs didn't load or user prefers reduced motion.
  if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined' || typeof Lenis === 'undefined') return;
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotion) return;

  var mq = window.matchMedia('(max-width: 860px)');
  var isMobile = mq.matches;
  var AMP = isMobile ? 0.6 : 1;   // amplitude scaler for mobile

  gsap.registerPlugin(ScrollTrigger);

  /* ---- Lenis smooth scroll (desktop only, native touch on mobile) ---- */
  var lenis = null;
  if (!isMobile) {
    lenis = new Lenis({
      lerp: 0.1,
      // syncTouch defaults to false — keep native iOS momentum
      // anchor links handled natively by Lenis via anchor handling
    });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add(function (time) { lenis.raf(time * 1000); });
    gsap.ticker.lagSmoothing(0);
  }

  /* ---- Image parallax helper ----
     Most target imgs already sit inside an overflow:hidden parent
     (.fullbleed, .story__media). We animate the img directly with scale
     + scrubbed Y — the parent clips the overflow, giving parallax depth
     without restructuring the DOM. */
  function parallaxImage(img) {
    if (!img || img.dataset.parallaxReady) return;
    var wrap = img.parentElement;
    // Ensure the wrapper clips overflow. Most targets already do, but
    // .fullbleed img's parent is the .fullbleed section which is fine.
    // If the wrap is NOT overflow:hidden (defensive), add it inline.
    var wrapCs = wrap && wrap.ownerDocument.defaultView
      ? getComputedStyle(wrap) : null;
    if (wrapCs && wrapCs.overflow !== 'hidden' && wrapCs.overflow !== 'clip') {
      wrap.style.overflow = 'hidden';
    }
    gsap.fromTo(img,
      { yPercent: -10 * AMP, scale: 1.18 },
      {
        yPercent: 10 * AMP,
        ease: 'none',
        scrollTrigger: {
          trigger: wrap,
          start: 'top bottom',
          end: 'bottom top',
          scrub: 1,
        }
      }
    );
    img.dataset.parallaxReady = '1';
  }

  /* ---- Heading line reveal (only for hero h1 — has simple structure) ----
     IMPORTANT: do NOT set transform: translateY(110%) in CSS for these
     lines. If CSS sets a base transform, gsap.fromTo reads it and
     stacks on top — lines never reach translateY(0). GSAP sets the
     hidden initial state here. */
  function splitHeroHeading() {
    var h1 = document.querySelector('.hero__title');
    if (!h1) return;
    // Wrap each line (split on <br>) in a .line-mask > .line pair
    var html = h1.innerHTML;
    var lines = html.split(/<br\s*\/?>(?:\s*)/i);
    var newHtml = lines.map(function (line) {
      return '<span class="line-mask"><span class="line">' + line + '</span></span>';
    }).join('');
    h1.innerHTML = newHtml;
    var lineEls = h1.querySelectorAll('.line');
    // Set initial hidden state via GSAP (no CSS base transform)
    gsap.set(lineEls, { yPercent: 110 });
    gsap.to(lineEls, {
      yPercent: 0,
      duration: 0.9,
      ease: 'power4.out',
      stagger: 0.09,
      delay: 0.15,
    });
  }

  /* ---- Hero load cascade ----
     Eyebrow → lead (+100ms) → CTAs (+220ms). Strip already handled by splitHeroHeading. */
  function heroCascade() {
    var items = [
      { sel: '.hero .eyebrow', delay: 0 },
      { sel: '.hero .hero__lead', delay: 0.1 },
      { sel: '.hero .hero__ctas', delay: 0.22 },
      { sel: '.hero .hero__strip', delay: 0.32 },
    ];
    items.forEach(function (it) {
      var el = document.querySelector(it.sel);
      if (!el) return;
      gsap.fromTo(el,
        { opacity: 0, y: 24 },
        { opacity: 1, y: 0, duration: 0.8, delay: it.delay, ease: 'power3.out' }
      );
    });
    // Hero image scrub (scale 1→1.08 + slight up-drift on scroll)
    if (document.querySelector('.hero__strip img')) {
      gsap.to('.hero__strip', {
        scale: 1.08,
        ease: 'none',
        scrollTrigger: {
          trigger: '.hero',
          start: 'top top',
          end: 'bottom top',
          scrub: 1,
        }
      });
      gsap.to('.hero__text', {
        yPercent: -6.8,
        ease: 'none',
        scrollTrigger: {
          trigger: '.hero',
          start: 'top top',
          end: 'bottom top',
          scrub: 1,
        }
      });
    }
  }

  /* ---- Generic rotate-settle entrance for card-like elements ---- */
  function rotateSettleEnter(selector, opts) {
    var defaults = {
      y: 40,
      rotation: function (i) { return (i % 2 === 0 ? -3 : 3); },
      stagger: 0.1,
      ease: 'back.out(1.4)',
      start: 'top 85%',
    };
    var cfg = Object.assign({}, defaults, opts || {});
    var els = document.querySelectorAll(selector);
    if (!els.length) return;
    gsap.fromTo(els,
      { opacity: 0, y: cfg.y, rotation: cfg.rotation },
      {
        opacity: 1, y: 0, rotation: 0,
        duration: cfg.duration || 0.8,
        stagger: cfg.stagger,
        ease: cfg.ease,
        scrollTrigger: { trigger: els[0].closest('section') || els[0].parentElement, start: cfg.start, once: true }
      }
    );
  }

  /* ---- Section heading fade-up ---- */
  function headingReveal(selector) {
    var els = document.querySelectorAll(selector);
    els.forEach(function (el) {
      gsap.fromTo(el,
        { opacity: 0, y: 24 },
        { opacity: 1, y: 0, duration: 0.7, ease: 'power3.out',
          scrollTrigger: { trigger: el, start: 'top 88%', once: true } }
      );
    });
  }

  /* ---- Scrubbed Y drift for an element ---- */
  function scrubDrift(selector, opts) {
    var els = document.querySelectorAll(selector);
    els.forEach(function (el) {
      gsap.fromTo(el,
        { yPercent: -opts.amount * AMP },
        {
          yPercent: opts.amount * AMP,
          ease: 'none',
          scrollTrigger: { trigger: el.closest('section') || el, start: 'top bottom', end: 'bottom top', scrub: true }
        }
      );
    });
  }

  /* ---- Initialize ---- */
  function init() {
    // 1) Image parallax — all top-level imgs in cards, fullbleed, journal, story, hero strip
    var parallaxTargets = document.querySelectorAll(
      '.story__media img, .fullbleed img, .ingredient__icon img:not(.modu-shake)'
    );
    parallaxTargets.forEach(parallaxImage);
    // Fullbleed special: bigger amplitude (it's the signature image)
    var fullbleedImg = document.querySelector('.fullbleed img');
    if (fullbleedImg) {
      // Override the default parallax with more dramatic amplitude
      // (re-set the same property to bypass the early-return guard)
      fullbleedImg.dataset.parallaxReady = '';
      gsap.fromTo(fullbleedImg,
        { yPercent: -15 * AMP, scale: 1.22 },
        {
          yPercent: 15 * AMP, ease: 'none',
          scrollTrigger: {
            trigger: fullbleedImg.parentElement,
            start: 'top bottom', end: 'bottom top', scrub: 1
          }
        }
      );
      fullbleedImg.dataset.parallaxReady = '1';
    }

    // 2) Hero load cascade + heading line reveal + scrubbed hero drift
    splitHeroHeading();
    heroCascade();

    // 3) Trust strip cards stagger fade-up
    rotateSettleEnter('.trust-strip__item', { y: 30, rotation: function () { return 0; }, stagger: 0.08 });

    // 4) Ingredients cards rotate-settle (alternating tilt)
    rotateSettleEnter('.ingredient', { stagger: 0.07, duration: 0.9 });

    // 5) Menu cards rotate-settle (alternating ±3°)
    rotateSettleEnter('.menu-card', { stagger: 0.12 });

    // 6) Journal stories rotate-settle
    rotateSettleEnter('.story', { stagger: 0.18 });

    // 7) FAQ + Contact fade-up
    rotateSettleEnter('.faq-grid', { y: 24, rotation: function () { return 0; } });
    rotateSettleEnter('.contact .container', { y: 30, rotation: function () { return 0; } });
    rotateSettleEnter('.footer .container', { y: 30, rotation: function () { return 0; } });

    // 8) Section headings fade-up
    headingReveal('.section-head');

    // 9) Decorative accents: trust strip icons drift
    scrubDrift('.trust-strip__icon', { amount: 8 });

    // 10) Refresh after fonts/images load (so ScrollTrigger calculates correct positions)
    window.addEventListener('load', function () { ScrollTrigger.refresh(); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();