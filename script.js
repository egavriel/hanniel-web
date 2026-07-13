/* =====================================================================
   Little Hanniel — Marketing Site interactions
   Nav toggle · menu tabs · scroll reveals · CTA tracking
   Tier 2b content.json · Tier 4 experimental arm (opt-in, default off)
   Interactive FAQ accordion logic
   Top scroll progress bar
   ===================================================================== */
(function () {
  'use strict';

  /* ---- Tier 4 — experimental arm assignment ----
     Opt-in via content.json `_experimental_test.enabled`. Uses a coarse
     session-stable hash so 50% of visitors see each arm within a day, and
     persists the chosen arm in sessionStorage (cleared on browser close)
     so multiple page views during the same visit stay consistent.

     Tracked events tag their `variant` so /api/stats can rollup per arm. */
  var CURRENT_ARM = '';          // '' means no experiment in effect
  var STORAGE_KEY = 'lh_arm_v1';

  function hash01(str) {
    // Cheap, deterministic, no crypto needed — DJB2 mod 1000 over Math.random() seed
    var h = 5381;
    for (var i = 0; i < str.length; i += 1) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
    return (h % 10000) / 10000;
  }

  function pickArm(test) {
    var uid = (navigator.userAgent || '') + '|' + (navigator.language || '');
    try {
      var k = sessionStorage.getItem(STORAGE_KEY);
      if (k && test.arm[k]) return k;
    } catch (_) { /* sessionStorage may be blocked */ }

    var r = hash01(uid);
    var cum = 0;
    var names = Object.keys(test.arm);
    for (var i = 0; i < names.length; i += 1) {
      cum += (test.buckets[names[i]] || 0);
      if (r < cum) {
        try { sessionStorage.setItem(STORAGE_KEY, names[i]); } catch (_) {}
        return names[i];
      }
    }
    return names[names.length - 1];
  }

  function applyArm(test) {
    if (!test || !test.enabled) return;
    var arm = pickArm(test);
    var patch = (test.arm && test.arm[arm]) || {};
    if (patch.announcement) {
      var bar = document.getElementById('announcement-bar');
      if (bar) bar.textContent = patch.announcement;
    }
    CURRENT_ARM = arm;
  }

  /* ---- Lightweight analytics event shim ----
     Fire-and-forget wrapper. Always tags events with the current arm so
     Tier 3 and Tier 4 can rollup click counts per arm. */
  function trackEvent(name, props) {
    var p = props || {};
    if (CURRENT_ARM) p.variant = CURRENT_ARM;
    try { if (typeof window.plausible === 'function') window.plausible(name, { props: p }); } catch (_) {}
    try { if (typeof window.gtag === 'function') window.gtag('event', name, p); } catch (_) {}
    try { if (typeof window.dataLayer !== 'undefined') window.dataLayer.push(Object.assign({event: name}, p)); } catch (_) {}
    try {
      if (navigator.sendBeacon) {
        var body = new Blob([JSON.stringify({name: name, props: p, ts: Date.now(), variant: CURRENT_ARM})], {type: 'application/json'});
        navigator.sendBeacon('/api/event', body);
      }
    } catch (_) {}
  }

  /* ---- WhatsApp CTA tracking ----
     Attribute every wa.me link to the section that contains it. */
  function tagWaLinks() {
    var links = document.querySelectorAll('a[href*="wa.me/"]');
    links.forEach(function (link) {
      if (link.dataset.ctaTracked) return;
      link.dataset.ctaTracked = '1';
      var section = link.closest('section, header, footer, body');
      var name = 'wa-click';
      if (section && section.id) name += '-' + section.id;
      else if (section) name += '-' + (section.className || 'unknown').split(/\s+/)[0] || 'unknown';
      else name += '-floating';
      if (link.classList.contains('floating-wa')) name = 'wa-click-floating';
      link.addEventListener('click', function () {
        trackEvent(name, { href: link.href, label: (link.textContent || '').trim().slice(0, 64) });
      });
    });
  }

  /* ---- Mobile slide-out nav ---- */
  var body = document.body;
  var toggle = document.getElementById('menuToggle');
  var overlay = document.getElementById('navOverlay');

  function closeNav() {
    body.classList.remove('nav-open');
    if (toggle) toggle.setAttribute('aria-expanded', 'false');
  }

  if (toggle) {
    toggle.addEventListener('click', function () {
      var open = body.classList.toggle('nav-open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }
  if (overlay) {
    overlay.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', closeNav);
    });
  }
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeNav();
  });

  /* ---- Scroll reveals (progressive enhancement + guaranteed fallback) ---- */
  var docEl = document.documentElement;
  docEl.classList.add('reveal-enabled');
  // All elements that opt into a scroll-triggered reveal. Hero intro is excluded
  // (it cascades on load, not on scroll) and the accent line is keyed to its
  // .section-head parent via CSS, so we observe the parent here.
  var reveals = document.querySelectorAll('.reveal, .reveal-media, .reveal-wipe');

  function revealAll() {
    reveals.forEach(function (el) { el.classList.add('is-visible'); });
  }
  function revealInView() {
    reveals.forEach(function (el) {
      var r = el.getBoundingClientRect();
      if (r.top < window.innerHeight && r.bottom > 0) el.classList.add('is-visible');
    });
  }

  if ('IntersectionObserver' in window && reveals.length) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0, rootMargin: '0px 0px -8% 0px' });
    reveals.forEach(function (el) { io.observe(el); });

    requestAnimationFrame(revealInView);
    window.addEventListener('load', revealInView);
    setTimeout(revealAll, 900);
  } else {
    revealAll();
  }

  /* ---- FAQ Accordion logic ---- */
  function initFaq() {
    var faqItems = document.querySelectorAll('.faq-item');
    faqItems.forEach(function (item) {
      var trigger = item.querySelector('.faq-item__trigger');
      if (!trigger) return;
      trigger.addEventListener('click', function () {
        var active = item.classList.contains('is-active');
        faqItems.forEach(function (otherItem) {
          otherItem.classList.remove('is-active');
          var otherTrigger = otherItem.querySelector('.faq-item__trigger');
          if (otherTrigger) otherTrigger.setAttribute('aria-expanded', 'false');
        });
        if (!active) {
          item.classList.add('is-active');
          trigger.setAttribute('aria-expanded', 'true');
        }
      });
    });
  }

  /* ---- Scroll Progress bar ----
     Header is no longer sticky (matches main branch behavior), so the
     only scroll-driven visual left is the top progress indicator. */
  function initScrollEffects() {
    var progress = document.getElementById('scroll-progress');
    if (!progress) return;

    window.addEventListener('scroll', function () {
      var scrollTop = window.scrollY || document.documentElement.scrollTop;
      var docHeight = document.documentElement.scrollHeight - document.documentElement.clientHeight;
      var scrolled = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
      progress.style.width = scrolled + '%';
    }, { passive: true });
  }

  /* ---- Hero load-time cascade ----
     NOT scroll-triggered — fires on DOMContentLoaded so the hero is rendered
     and the cascade runs on top of already-painted content (zero LCP delay).
     Pattern: title → subhead +100ms → CTAs +320ms. */
  function initHeroCascade() {
    var intros = document.querySelectorAll('.hero__intro');
    if (!intros.length) return;
    // Two rAFs so the browser paints the hidden state first, then animates.
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        intros.forEach(function (el) { el.classList.add('is-visible'); });
      });
    });
  }

  /* ---- Parallax (one section, transform-only, max ~12% offset) ----
     Skips on mobile (<=860px) and on prefers-reduced-motion.
     Listens to scroll with rAF throttle, writes --parallax-y on the element. */
  function initParallax() {
    var targets = document.querySelectorAll('.parallax-media');
    if (!targets.length) return;

    var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var isMobile = window.matchMedia && window.matchMedia('(max-width: 860px)').matches;
    if (reduceMotion || isMobile) return;

    var ticking = false;
    function update() {
      ticking = false;
      var vh = window.innerHeight;
      targets.forEach(function (el) {
        var rect = el.getBoundingClientRect();
        // Element center as a fraction of viewport; clamp to [-1, 1]
        var center = rect.top + rect.height / 2;
        var progress = (center - vh / 2) / vh; // -1 when below viewport, 0 at center, +1 above
        if (progress > 1) progress = 1;
        if (progress < -1) progress = -1;
        // Max offset ~12% of element height, capped to 80px to stay restrained
        var max = Math.min(rect.height * 0.12, 80);
        var offset = -progress * max;
        el.style.setProperty('--parallax-y', offset.toFixed(1) + 'px');
      });
    }
    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    update();
  }

  /* ---- Content surface (Tier 2b) ----
     Edit content.json to change promo copy without touching index.html. */
  function applyContent(data) {
    if (!data || typeof data !== 'object') return;
    var bar = document.getElementById('announcement-bar');
    if (bar && data.announcement) bar.textContent = data.announcement;
    var heroWa = document.querySelector('#hero a[href*="wa.me"]');
    if (heroWa && data.hero && data.hero.waCtaLabel) heroWa.textContent = data.hero.waCtaLabel;
    var orderTitle = document.querySelector('.menu__order-title');
    if (orderTitle && data.menu && data.menu.orderTitle) orderTitle.textContent = data.menu.orderTitle;
    var orderLead = document.querySelector('.menu__order-lead');
    if (orderLead && data.menu && data.menu.orderLead) orderLead.textContent = data.menu.orderLead;
    if (data._experimental_test) applyArm(data._experimental_test);
  }

  function loadContentThenInit() {
    fetch('/content.json', { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        applyContent(data);
        tagWaLinks();
        initFaq();
        initScrollEffects();
        initHeroCascade();
        initParallax();
        if (CURRENT_ARM) trackEvent('exposure', { arm: CURRENT_ARM });
      })
      .catch(function () {
        tagWaLinks();
        initFaq();
        initScrollEffects();
        initHeroCascade();
        initParallax();
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadContentThenInit);
  } else {
    loadContentThenInit();
  }
})();
