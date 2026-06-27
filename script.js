/* =====================================================================
   Little Hanniel — Marketing Site interactions
   Nav toggle · menu tabs · scroll reveals · header state
   ===================================================================== */
(function () {
  'use strict';

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

  /* ---- Header shadow on scroll ---- */
  var header = document.getElementById('header');
  function onScroll() {
    if (!header) return;
    header.classList.toggle('is-scrolled', window.scrollY > 8);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ---- Menu tabs ---- */
  var tabs = document.querySelectorAll('.menu__tab');
  var panels = document.querySelectorAll('.menu__panel');
  tabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      var name = tab.getAttribute('data-tab');
      tabs.forEach(function (t) { t.classList.toggle('is-active', t === tab); });
      panels.forEach(function (p) {
        p.classList.toggle('is-active', p.getAttribute('data-panel') === name);
      });
    });
  });

  /* ---- Scroll reveals (progressive enhancement + guaranteed fallback) ---- */
  var docEl = document.documentElement;
  docEl.classList.add('reveal-enabled'); // CSS only hides reveals once we can restore them
  var reveals = document.querySelectorAll('.reveal');

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

    // Immediately show anything already on screen (covers environments where IO
    // doesn't fire for in-viewport elements), and guarantee everything reveals.
    requestAnimationFrame(revealInView);
    window.addEventListener('load', revealInView);
    setTimeout(revealAll, 900);
  } else {
    revealAll();
  }
})();
