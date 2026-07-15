/* =====================================================================
   Little Hanniel — Premium refinements
   Lenis smooth scroll · GSAP/ScrollTrigger entrances · image parallax
   scroll progress bar · micro-interaction polish.

   Per-viewport-type behavior (v3):
   - mouse (pointer:fine, no touch)  → PURE NATIVE SCROLL. No Lenis, no
     scroll-driven JS, no progress bar, no parallax. The browser's
     default wheel handler fires immediately; the page scrolls the
     moment the user wheels. The CSS-only .reveal fade-up from
     script.js (IntersectionObserver) is preserved because it's a
     one-shot transition, not a continuous tween — the user
     specifically said "delay then jump" is the problem, and that
     is Lenis's smooth-catch-up behavior, not the CSS reveal.
   - touch (pointer:coarse + hover:none)  → current JS experience
     preserved: entrance animations, parallax, progress bar, native
     scroll. Mobile momentum is already perfect; no Lenis.
   - hybrid (pointer:coarse but hover capable, e.g. tablet with
     active pen)  → same as touch.

   What was v1 / v2 / v3:
   - v1: Lenis on everything, three continuous scrub tweens. Laggy
     on desktop because three scrub tweens + Lenis 0.1 lerp + ST
     normalize-scroll compounded.
   - v2: Per-bucket Lenis tuning + lazy parallax + lagSmoothing.
     Fixed the lag on desktop, but Lenis's catch-up still produced
     a "delay then jump" feel on every wheel event because the
     browser's wheel handler is intercepted and re-emitted over
     multiple frames.
   - v3: Drop Lenis entirely on desktop. Wheel events are
     instant; the user gets native scroll. On mobile the previous
     behavior is preserved (it was already correct there).

   Coexists with script.js:
   - On mobile, adds html.gsap-enabled so GSAP owns the entrance
     animation (CSS transition is no-op there). script.js's IO
     still adds .is-visible.
   - On desktop, html.gsap-enabled is NOT added. script.js's IO
     runs the CSS .reveal transition as designed in v1.
   - Respects prefers-reduced-motion: skipped on all buckets; the
     CSS reveal runs unchanged.
   ===================================================================== */
(function () {
  'use strict';

  if (!window.gsap || !window.ScrollTrigger) return;

  var reduceMotion = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotion) return;

  /* ---------- Input-type detection ---------- */
  var mqCoarse = window.matchMedia('(pointer: coarse)');
  var mqNoHover = window.matchMedia('(hover: none)');

  function detectBucket() {
    if (mqCoarse.matches && mqNoHover.matches) return 'touch';
    if (mqCoarse.matches) return 'hybrid';
    return 'mouse';
  }

  var bucket = detectBucket();

  /* ---------- Mouse (desktop) early return ----------
     The user wants normal scroll on desktop: no Lenis smoothing,
     no scroll-driven JS, no progress bar, no parallax. We let
     script.js's IntersectionObserver handle .reveal via the CSS
     transition, which is a one-shot fade-up — not the "delay then
     jump" symptom that Lenis causes. We do nothing else here. */
  if (bucket === 'mouse') {
    // Expose the bucket for debugging (one-time, no cost).
    window.__lhRefinements = {
      bucket: bucket,
      hasLenis: false,
      parallaxEnabled: false,
      note: 'desktop native scroll — no Lenis, no scroll-driven JS',
    };
    return;
  }

  // From here down: touch or hybrid (mobile-class). Keep v2 behavior.

  gsap.registerPlugin(ScrollTrigger);

  /* ---------- Lenis smooth scroll ----------
     Touch bucket already has syncTouch:false to let native
     momentum drive. Hybrid bucket gets the same. We instantiate
     Lenis on both because the wheelMultiplier and smoothWheel
     still help the "hybrid with pen" case (some pens emit wheel
     events). On pure touch, Lenis is essentially a no-op for
     touch events. */
  var lenis = null;
  if (window.Lenis) {
    var opts = { lerp: 0.12, wheelMultiplier: 1.2, touchMultiplier: 1.2, syncTouch: false, smoothWheel: true };
    lenis = new Lenis(opts);
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add(function (time) { lenis.raf(time * 1000); });
    gsap.ticker.lagSmoothing(500, 33);
  } else {
    gsap.ticker.lagSmoothing(500, 33);
  }

  // Stop ScrollTrigger from doing its own smoothing on top of Lenis.
  ScrollTrigger.normalizeScroll(false);

  /* ---------- Take over .reveal entrance animation ----------
     The CSS in styles.css transitions opacity/transform with
     `transition: opacity 0.9s ..., transform 0.9s ...`. We disable
     that for gsap-enabled sessions so GSAP's timeline owns the
     entrance — prevents the double-animate flicker. The
     IntersectionObserver in script.js still adds .is-visible
     (which is the GSAP start state), but on the GSAP side we
     re-animate from y:40, opacity:0. */
  document.documentElement.classList.add('gsap-enabled');

  /* ---------- Section entrances (all buckets that reach here) ---------- */
  function animateIn(el) {
    if (!el || el.dataset.gsapDone) return;
    el.dataset.gsapDone = '1';
    gsap.fromTo(el,
      { y: 40, opacity: 0 },
      {
        y: 0,
        opacity: 1,
        duration: 0.9,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: el,
          start: 'top 85%',
          once: true,
        },
      });
  }

  var entranceEls = document.querySelectorAll(
    '.hero__text, .hero__strip, .trust-strip, ' +
    '.section-head, .menu__image-wrap, .menu__order, ' +
    '.menu__note, .story__media, .story__text, .ingredient, ' +
    '.contact .container > *, .fullbleed, .footer__inner'
  );
  entranceEls.forEach(animateIn);

  /* ---------- Stagger entrance for ingredient row ---------- */
  var ingredients = document.querySelectorAll('.ingredients__grid .ingredient');
  if (ingredients.length) {
    ingredients.forEach(function (el) { el.dataset.gsapDone = '0'; });
    gsap.fromTo(ingredients,
      { y: 40, opacity: 0 },
      {
        y: 0,
        opacity: 1,
        duration: 0.85,
        ease: 'power3.out',
        stagger: 0.08,
        scrollTrigger: {
          trigger: '.ingredients__grid',
          start: 'top 85%',
          once: true,
        },
      });
    ingredients.forEach(function (el) { el.dataset.gsapDone = '1'; });
  }

  /* ---------- Stagger entrance for hero CTA row ---------- */
  var heroCtas = document.querySelectorAll('.hero__ctas--modu .hero-btn');
  if (heroCtas.length) {
    gsap.fromTo(heroCtas,
      { y: 20, opacity: 0 },
      {
        y: 0,
        opacity: 1,
        duration: 0.7,
        ease: 'power3.out',
        stagger: 0.1,
        delay: 0.3,
      });
  }

  /* ---------- Heading reveal ---------- */
  document.querySelectorAll('.hero__title, .section-head h2, .story__title, .menu__order-title').forEach(function (h) {
    gsap.fromTo(h,
      { y: 24, opacity: 0 },
      {
        y: 0,
        opacity: 1,
        duration: 1.0,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: h,
          start: 'top 88%',
          once: true,
        },
      });
  });

  /* ---------- Image parallax (lazy-init, scroll-input driven) ----------
     Three continuous scrub tweens re-evaluating yPercent on every
     frame is the main mobile paint cost. Built on first scroll
     input, killed 150ms after the last input. */
  var parallaxTweens = [];
  var parallaxIdleTimer = null;
  var parallaxEnabled = true;

  // Range selection per bucket.
  var PARALLAX_RANGE = (bucket === 'hybrid') ? 0.03 : 0.05;

  function buildParallax() {
    if (parallaxTweens.length || !parallaxEnabled || PARALLAX_RANGE === 0) return;

    document.querySelectorAll('.story__media img').forEach(function (img) {
      parallaxTweens.push(gsap.fromTo(img,
        { yPercent: -PARALLAX_RANGE * 100 },
        {
          yPercent: PARALLAX_RANGE * 100,
          ease: 'none',
          scrollTrigger: {
            trigger: img.closest('.story__media'),
            start: 'top bottom',
            end: 'bottom top',
            scrub: true,
          },
        }));
    });

    var menuImg = document.querySelector('.menu__image');
    if (menuImg) {
      parallaxTweens.push(gsap.fromTo(menuImg,
        { yPercent: -PARALLAX_RANGE * 100 },
        {
          yPercent: PARALLAX_RANGE * 100,
          ease: 'none',
          scrollTrigger: {
            trigger: '.menu__image-wrap',
            start: 'top bottom',
            end: 'bottom top',
            scrub: true,
          },
        }));
    }

    var fullbleedImg = document.querySelector('.fullbleed img');
    if (fullbleedImg) {
      parallaxTweens.push(gsap.fromTo(fullbleedImg,
        { yPercent: -PARALLAX_RANGE * 60 },
        {
          yPercent: PARALLAX_RANGE * 60,
          ease: 'none',
          scrollTrigger: {
            trigger: '.fullbleed',
            start: 'top bottom',
            end: 'bottom top',
            scrub: true,
          },
        }));
    }
  }

  function killParallax() {
    parallaxTweens.forEach(function (t) { t.kill(); });
    parallaxTweens = [];
  }

  function onScrollStart() {
    if (parallaxTweens.length === 0) buildParallax();
    if (parallaxIdleTimer) clearTimeout(parallaxIdleTimer);
    parallaxIdleTimer = setTimeout(killParallax, 150);
  }

  ['wheel', 'touchmove', 'keydown'].forEach(function (ev) {
    window.addEventListener(ev, onScrollStart, { passive: true });
  });
  if (bucket === 'hybrid' || bucket === 'touch') {
    window.addEventListener('touchend', function () {
      if (parallaxIdleTimer) clearTimeout(parallaxIdleTimer);
      parallaxIdleTimer = setTimeout(killParallax, 80);
    }, { passive: true });
  }

  /* ---------- Scroll progress bar ----------
     On mobile: thin 2px caramel line at the top, transform-only
     so it stays on the GPU. Drives off Lenis if available, else
     falls back to ScrollTrigger. */
  var progressBar = document.createElement('div');
  progressBar.className = 'lh-scroll-progress';
  document.body.appendChild(progressBar);

  if (lenis) {
    lenis.on('scroll', function (e) {
      var limit = e.limit || 1;
      var scroll = e.scroll || 0;
      var pct = limit > 0 ? Math.min(1, Math.max(0, scroll / limit)) : 0;
      progressBar.style.transform = 'scaleX(' + pct.toFixed(4) + ')';
    });
  } else {
    ScrollTrigger.create({
      start: 0,
      end: 'max',
      onUpdate: function (self) {
        progressBar.style.transform = 'scaleX(' + self.progress.toFixed(4) + ')';
      },
    });
  }

  /* ---------- Section anchor link smoothing ---------- */
  document.querySelectorAll('a[href^="#"]').forEach(function (a) {
    a.addEventListener('click', function (ev) {
      var id = a.getAttribute('href');
      if (!id || id === '#') return;
      var target = document.querySelector(id);
      if (!target) return;
      ev.preventDefault();
      if (lenis) {
        lenis.scrollTo(target, { offset: -20, duration: 1.1 });
      } else {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      if (history.replaceState) history.replaceState(null, '', id);
    });
  });

  /* ---------- Lazy-init + resize refresh ---------- */
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () { ScrollTrigger.refresh(); });
  }
  window.addEventListener('load', function () { ScrollTrigger.refresh(); });

  var resizeTimer;
  function onResize() {
    var newBucket = detectBucket();
    if (newBucket === bucket) {
      ScrollTrigger.refresh();
      return;
    }
    // Bucket changed. Full re-init of the JS scroll system would be
    // ideal but is expensive at runtime; the resize that crosses
    // the bucket boundary is rare (lid close, tablet mode toggle).
    // The most common case — width-only change within the same
    // bucket — is handled by the early-return path above.
    bucket = newBucket;
    ScrollTrigger.refresh();
  }
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(onResize, 150);
  });

  // Expose bucket for debugging (no production cost).
  window.__lhRefinements = {
    bucket: bucket,
    hasLenis: !!lenis,
    parallaxEnabled: parallaxEnabled,
  };
})();
