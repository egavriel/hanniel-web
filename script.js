/* =====================================================================
   Little Hanniel — Marketing Site interactions
   Nav toggle · menu tabs · scroll reveals · header state · CTA tracking
   ===================================================================== */
(function () {
  'use strict';

  /* ---- Lightweight analytics event shim ----
     Fire-and-forget wrapper that calls Plausible, GA4, or any provider
     that exposes a global function. No-op when nothing is loaded — keeps
     the page light and provider-agnostic.
     CF Web Analytics (cloudflareinsights) does not support custom events;
     pageviews are captured automatically when its beacon token is set. */
  function trackEvent(name, props) {
    var p = props || {};
    try { if (typeof window.plausible === 'function') window.plausible(name, { props: p }); } catch (_) {}
    try { if (typeof window.gtag === 'function') window.gtag('event', name, p); } catch (_) {}
    try { if (typeof window.dataLayer !== 'undefined') window.dataLayer.push(Object.assign({event: name}, p)); } catch (_) {}
    try {
      // Self-host fallback so events survive even without a 3rd-party SDK.
      if (navigator.sendBeacon) {
        var body = new Blob([JSON.stringify({name: name, props: p, ts: Date.now()})], {type: 'application/json'});
        navigator.sendBeacon('/api/event', body);
      }
    } catch (_) {}
  }

  /* ---- WhatsApp CTA tracking ----
     Attribute every wa.me link to the section that contains it, so each
     WhatsApp click can be measured separately (hero, menu, contact, floating). */
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
      // floating-wa class names itself
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

  /* ---- Content surface (Tier 2b) ----
     Edit content.json to change promo copy without touching index.html.
     HTML keeps the same strings as fallbacks if fetch fails. */
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
  }

  function loadContentThenInit() {
    fetch('/content.json', { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        applyContent(data);
        tagWaLinks();
      })
      .catch(function () {
        tagWaLinks();
      });
  }

  /* ---- Bind CTA tracking once DOM is ready ---- */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadContentThenInit);
  } else {
    loadContentThenInit();
  }
})();
