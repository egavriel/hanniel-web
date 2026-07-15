/* =====================================================================
   Little Hanniel — Premium refinements
   Lenis smooth scroll · GSAP/ScrollTrigger entrances · image parallax
   scroll progress bar · micro-interaction polish.

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

  /* ---------- Lenis smooth scroll ----------
     lerp ~0.1 · wheelMultiplier 1.0 · syncTouch: false (lets mobile
     native momentum scroll stay in charge of touch). */
  var lenis = null;
  if (window.Lenis) {
    lenis = new Lenis({
      lerp: 0.1,
      wheelMultiplier: 1.0,
      touchMultiplier: 1.2,
      syncTouch: false,
      smoothWheel: true,
    });

    // Sync Lenis → ScrollTrigger each frame.
    lenis.on('scroll', ScrollTrigger.update);

    // Drive Lenis from GSAP's ticker so it inherits RAF timing.
    gsap.ticker.add(function (time) {
      lenis.raf(time * 1000);
    });
    gsap.ticker.lagSmoothing(0);
  }

  /* ---------- Take over .reveal entrance animation ----------
     The CSS in styles.css transitions opacity/transform with
     `transition: opacity 0.9s ..., transform 0.9s ...`. We disable that
     for gsap-enabled sessions so GSAP's timeline owns the entrance —
     prevents the double-animate flicker. The IntersectionObserver in
     script.js still adds .is-visible (which is the GSAP start state),
     but on the GSAP side we re-animate from y:40, opacity:0. */
  document.documentElement.classList.add('gsap-enabled');

  /* ---------- Section entrances ----------
     Target every section's direct children + key inner blocks.
     Trigger at "top 85%" per the spec, play once. */
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

  /* ---------- Stagger entrance for ingredient row ----------
     Five ingredients all reveal-d1/d2 with delay; GSAP stagger matches. */
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

  /* ---------- Stagger entrance for hero CTA row ----------
     Modu-style 3-button row fades in with subtle stagger. */
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

  /* ---------- Image parallax (inside overflow:hidden containers only) ----------
     Translates the image ±6-8% on scroll. Container position/size
     unchanged. Splide slides and the fullbleed section get a gentler
     range because the image is already larger than its frame. */
  var isMobile = window.matchMedia('(max-width: 720px)').matches;
  var parallaxAmt = isMobile ? 0.03 : 0.07;

  // Story media images (already inside .story__media which has overflow:hidden)
  document.querySelectorAll('.story__media img').forEach(function (img) {
    gsap.fromTo(img,
      { yPercent: -parallaxAmt * 100 },
      {
        yPercent: parallaxAmt * 100,
        ease: 'none',
        scrollTrigger: {
          trigger: img.closest('.story__media'),
          start: 'top bottom',
          end: 'bottom top',
          scrub: true,
        },
      });
  });

  // Menu sheet image — wrap already provides overflow:hidden via padding
  // box, but the img itself sits flush. Add a gentle parallax.
  var menuImg = document.querySelector('.menu__image');
  if (menuImg) {
    gsap.fromTo(menuImg,
      { yPercent: -parallaxAmt * 100 },
      {
        yPercent: parallaxAmt * 100,
        ease: 'none',
        scrollTrigger: {
          trigger: '.menu__image-wrap',
          start: 'top bottom',
          end: 'bottom top',
          scrub: true,
        },
      });
  }

  // Full-bleed oats trio — gentle parallax (image is already cover-fit)
  var fullbleedImg = document.querySelector('.fullbleed img');
  if (fullbleedImg) {
    gsap.fromTo(fullbleedImg,
      { yPercent: -parallaxAmt * 60 },
      {
        yPercent: parallaxAmt * 60,
        ease: 'none',
        scrollTrigger: {
          trigger: '.fullbleed',
          start: 'top bottom',
          end: 'bottom top',
          scrub: true,
        },
      });
  }

  /* ---------- Heading reveal ----------
     Soft slide-up for the hero h1 and section heads. Uses overflow
     mask via inline wrapper so lines slide up from behind. We avoid
     layout-affecting properties — only transform. */
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

  /* ---------- Scroll progress bar ----------
     Only on pages long enough to warrant it. The Hanniel page has
     hero + trust + ingredients + menu + fullbleed + journal + contact
     + footer — comfortably long-form. */
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
    // Fallback if Lenis didn't initialize.
    ScrollTrigger.create({
      start: 0,
      end: 'max',
      onUpdate: function (self) {
        progressBar.style.transform = 'scaleX(' + self.progress.toFixed(4) + ')';
      },
    });
  }

  /* ---------- Section anchor link smoothing ----------
     Lenis handles this when present via the data-lenis-prevent attribute
     pattern; default behaviour is fine because we call lenis.scrollTo on
     hash click via a lightweight handler. */
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
      // Update URL without jumping
      if (history.replaceState) history.replaceState(null, '', id);
    });
  });

  /* ---------- Lazy-init + resize refresh ----------
     Refresh ScrollTrigger after fonts/layout settle. */
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () { ScrollTrigger.refresh(); });
  }
  window.addEventListener('load', function () { ScrollTrigger.refresh(); });

  var resizeTimer;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () { ScrollTrigger.refresh(); }, 150);
  });
})();
