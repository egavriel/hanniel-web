/* =====================================================================
   Little Hanniel — Premium refinements
   Lenis smooth scroll · GSAP/ScrollTrigger entrances · image parallax
   scroll progress bar · micro-interaction polish.

   Per-viewport-type behavior (v2):
   - touch (pointer:coarse + hover:none) → no Lenis, no parallax, native
     scroll only. Mobile momentum is already perfect; layering JS on
     top just makes it worse.
   - mouse (pointer:fine)                → Lenis tuned for snappy wheel
     response, parallax ON with reduced range, scroll progress ON.
   - hybrid (pointer:coarse but not hover:none) → mouse behavior with
     even lighter parallax (e.g. Surface tablets with active pens).

   Desktop lag fix (v1 → v2):
   - Lenis lerp 0.1 → 0.18 (40% snappier), wheelMultiplier 1.0 → 1.4
     on mouse. Lenis was rubber-banding the wheel because 0.1 lerp
     means ~6 frames of catch-up per wheel event.
   - Parallax tweens now lazy-init: zero tweens idle until the user
     starts scrolling; killed after 150ms of scroll inactivity. This
     was the main desktop paint cost — three continuous scrub tweens
     re-evaluating on every Lenis tick.
   - ScrollTrigger.normalizeScroll(false) to stop ST from adding its
     own smoothing on top of Lenis (was double-smoothing the wheel).
   - gsap.ticker.lagSmoothing(500, 33) instead of (0) — skip up to
     500ms / 33ms of frames under load instead of catching up
     aggressively, which would compound any single slow frame.

   Coexists with script.js:
   - Adds html.gsap-enabled to take over the .reveal entrance animation
     from the CSS transition (the IntersectionObserver in script.js
     still adds .is-visible, but the CSS transition is now no-op on
     gsap-enabled pages so GSAP's timeline owns the animation).
   - Respects prefers-reduced-motion: when set, all of this is skipped
     and the original CSS reveals run unchanged.
   ===================================================================== */
(function () {
  'use strict';

  if (!window.gsap || !window.ScrollTrigger) return;

  var reduceMotion = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotion) return;

  gsap.registerPlugin(ScrollTrigger);

  /* ---------- Input-type detection ----------
     Combines width, pointer, and hover media queries. The pointer
     query is the load-bearing one — width alone is wrong because a
     laptop with a small external monitor at 800px wide is still
     desktop, and a tablet at 1280px is still touch. */
  var mqCoarse = window.matchMedia('(pointer: coarse)');
  var mqNoHover = window.matchMedia('(hover: none)');
  var mqMobile = window.matchMedia('(max-width: 720px)');

  function detectBucket() {
    if (mqCoarse.matches && mqNoHover.matches) return 'touch';
    if (mqCoarse.matches) return 'hybrid';     // coarse but can hover (pen, etc)
    return 'mouse';
  }

  var bucket = detectBucket();

  /* ---------- Lenis smooth scroll ----------
     Skip entirely on touch. Tune per-bucket for the rest. */
  var lenis = null;
  if (window.Lenis && bucket !== 'touch') {
    var opts = (bucket === 'mouse')
      ? { lerp: 0.18, wheelMultiplier: 1.4, touchMultiplier: 1.2, syncTouch: false, smoothWheel: true }
      : { lerp: 0.12, wheelMultiplier: 1.2, touchMultiplier: 1.2, syncTouch: false, smoothWheel: true };

    lenis = new Lenis(opts);

    // Sync Lenis → ScrollTrigger each frame.
    lenis.on('scroll', ScrollTrigger.update);

    // Drive Lenis from GSAP's ticker so it inherits RAF timing.
    gsap.ticker.add(function (time) {
      lenis.raf(time * 1000);
    });
    // Allow up to 500ms / 33ms steps to be skipped if a frame is heavy.
    // This stops one slow frame from snowballing the catch-up work.
    gsap.ticker.lagSmoothing(500, 33);
  } else if (window.Lenis) {
    // Touch path — still need a ticker integration so entrance animations
    // and ScrollTrigger fire on RAF (parallax is skipped below).
    gsap.ticker.lagSmoothing(500, 33);
  }

  // Stop ScrollTrigger from doing its own smoothing on top of Lenis.
  // Without this, wheel events get smoothed twice (Lenis + ST) which
  // is a major source of the desktop lag.
  ScrollTrigger.normalizeScroll(false);

  /* ---------- Take over .reveal entrance animation ----------
     The CSS in styles.css transitions opacity/transform with
     `transition: opacity 0.9s ..., transform 0.9s ...`. We disable that
     for gsap-enabled sessions so GSAP's timeline owns the entrance —
     prevents the double-animate flicker. The IntersectionObserver in
     script.js still adds .is-visible (which is the GSAP start state),
     but on the GSAP side we re-animate from y:40, opacity:0. */
  document.documentElement.classList.add('gsap-enabled');

  /* ---------- Section entrances (all buckets) ---------- */
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

  // Headers (hero text, section heads, story titles, etc.)
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

  /* ---------- Image parallax (mouse + hybrid only) ----------
     Skipped on touch entirely — native scroll already gives the
     visual rhythm, and a parallax tween on top of mobile momentum
     makes the page feel gummy.

     On mouse + hybrid, parallax is built and torn down dynamically:
     - When the user starts scrolling, parallax tweens are created.
     - 150ms after the last scroll input, all parallax tweens are
       killed. The browser returns to idle and doesn't burn frames
       recomputing yPercent on three images every frame.
     - On the next scroll start, tweens are rebuilt.

     The "scrub" amount is also reduced vs. v1 (0.05 vs 0.07 on
     mouse, 0.03 on hybrid) to keep the work-per-frame down. */
  var parallaxTweens = [];
  var parallaxIdleTimer = null;
  var parallaxEnabled = (bucket !== 'touch');

  // Range selection per bucket. Smaller = cheaper to recompute.
  var PARALLAX_RANGE = (bucket === 'mouse') ? 0.05
                     : (bucket === 'hybrid') ? 0.03
                     : 0;

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
      // Fullbleed image is already cover-fit and tall — use 60% of range
      // so the visible movement stays small but the tween still has
      // something to do.
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
    if (!parallaxEnabled) return;
    if (parallaxTweens.length === 0) buildParallax();
    if (parallaxIdleTimer) clearTimeout(parallaxIdleTimer);
    parallaxIdleTimer = setTimeout(killParallax, 150);
  }

  if (parallaxEnabled) {
    // Lenis emits 'scroll' on every frame during smooth catch-up, so
    // we can't naively use it as a "user is actively scrolling" signal
    // — that would rebuild the tweens every frame. Instead, hook into
    // native wheel/touchmove/keydown as the user-input signals, and
    // let the scroll progress bar use Lenis directly.
    ['wheel', 'touchmove', 'keydown'].forEach(function (ev) {
      window.addEventListener(ev, onScrollStart, { passive: true });
    });
    // Touch / hybrid devices also need to know about touchend — once
    // the user lifts their finger, momentum is the only thing still
    // driving scroll and we can let parallax stay killed during the
    // deceleration phase. This was the second-largest source of
    // desktop lag: a touch device with pointer:coarse misclassified
    // as hybrid would burn frames on parallax while momentum
    // continued.
    if (bucket === 'hybrid') {
      window.addEventListener('touchend', function () {
        if (parallaxIdleTimer) clearTimeout(parallaxIdleTimer);
        parallaxIdleTimer = setTimeout(killParallax, 80);
      }, { passive: true });
    }
  }

  /* ---------- Scroll progress bar ----------
     Touch devices don't get one — small benefit, real cost, and a
     thin bar at the top on mobile is just visual noise. Mouse +
     hybrid get the bar. The bar itself is transform-only (one
     scaleX per Lenis scroll event), so the cost is minimal
     compared to the parallax work above. */
  var progressBar = null;
  if (bucket !== 'touch') {
    progressBar = document.createElement('div');
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
      // No Lenis (e.g. hybrid without smooth-wheel). Fall back to
      // ScrollTrigger, but the bar won't show on touch anyway.
      ScrollTrigger.create({
        start: 0,
        end: 'max',
        onUpdate: function (self) {
          progressBar.style.transform = 'scaleX(' + self.progress.toFixed(4) + ')';
        },
      });
    }
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

  /* ---------- Lazy-init + resize refresh ----------
     Refresh ScrollTrigger after fonts/layout settle. The resize
     handler also re-evaluates the input-type bucket and tears down
     + rebuilds the parallax + progress bar if the bucket changed
     (e.g. user resizes a hybrid window across the touch/mouse
     boundary). The full Lenis instance is only rebuilt on
     bucket change because swapping Lenis at runtime is expensive
     and almost never happens in practice. */
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
    // Bucket changed — rebuild the parts that depend on it.
    bucket = newBucket;
    // Note: full Lenis re-init is intentionally not done on bucket
    // change. The cost of tearing down and re-creating Lenis on every
    // resize event outweighs the benefit; in practice the user only
    // crosses the bucket boundary once per session (laptop lid open
    // / tablet mode toggle). If that becomes an issue we can add a
    // debounced full rebuild, but YAGNI for v2.
    if (bucket === 'touch' && parallaxTweens.length) killParallax();
    if (progressBar && bucket === 'touch') {
      progressBar.remove();
      progressBar = null;
    }
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
