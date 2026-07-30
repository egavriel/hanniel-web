/* =====================================================================
   Little Hanniel — Marketing Site interactions
   Nav toggle · menu tabs · scroll reveals · header state · CTA tracking
   Tier 2b content.json · Tier 4 experimental arm (opt-in, default off)
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

    requestAnimationFrame(revealInView);
    window.addEventListener('load', revealInView);
    setTimeout(revealAll, 900);
  } else {
    revealAll();
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

  /* ---- Native share button (mobile menu) ----
     Prefers sharing the actual menu PNG via Web Share Level 2
     (navigator.share + files). That lets WhatsApp / Telegram /
     Messages receive the image itself instead of only a website link.

     Fallback chain:
     1) share file (PNG) when canShare({ files }) is true
     2) share title/text + direct image URL when file share is unavailable
     3) WhatsApp deep-link with the direct image URL
     AbortError (user cancelled the sheet) is silent. */
  function initShareButton() {
    var btn = document.getElementById('menuShareBtn');
    if (!btn) return;

    var menuImg = document.querySelector('.menu__image');
    var menuSrc = (menuImg && menuImg.getAttribute('src')) || 'assets/little-hanniel-menu.png';
    // Resolve to absolute URL so share payloads and wa.me links always work.
    var menuUrl = new URL(menuSrc, window.location.href).href;

    btn.addEventListener('click', function () {
      shareMenuImage(menuUrl);
    });
  }

  function shareMenuImage(menuUrl) {
    var text = 'Little Hanniel menu — overnight oats, cookies, bakes, and our little Korean kitchen.';
    var title = 'Little Hanniel Menu';

    // Try file share first (actual PNG).
    fetch(menuUrl, { cache: 'force-cache' })
      .then(function (res) {
        if (!res.ok) throw new Error('menu image fetch failed');
        return res.blob();
      })
      .then(function (blob) {
        // Force image/png even if the server content-type is off.
        var file = new File([blob], 'little-hanniel-menu.png', {
          type: blob.type || 'image/png',
        });
        var fileData = {
          title: title,
          text: text,
          files: [file],
        };

        // Level-2 Web Share with files (Android Chrome, many iOS Safari versions).
        if (navigator.canShare && navigator.canShare({ files: [file] }) && navigator.share) {
          return navigator.share(fileData);
        }

        // No file-share support: share a direct image URL instead of the homepage.
        if (navigator.share) {
          return navigator.share({
            title: title,
            text: text,
            url: menuUrl,
          });
        }

        openWhatsAppShare({ text: text, url: menuUrl });
      })
      .catch(function (err) {
        if (err && err.name === 'AbortError') return;

        // Last-resort fallback: WhatsApp with direct image URL.
        if (navigator.share) {
          navigator.share({
            title: title,
            text: text,
            url: menuUrl,
          }).catch(function (err2) {
            if (err2 && err2.name === 'AbortError') return;
            openWhatsAppShare({ text: text, url: menuUrl });
          });
          return;
        }
        openWhatsAppShare({ text: text, url: menuUrl });
      });
  }

  function openWhatsAppShare(shareData) {
    var msg = (shareData.text || '') + ' ' + (shareData.url || '');
    // wa.me deep link with pre-filled text. Works on mobile WhatsApp
    // and on desktop WhatsApp Web.
    var url = 'https://wa.me/?text=' + encodeURIComponent(msg);
    window.open(url, '_blank', 'noopener');
  }

  /* ---- FAQ accordion ----
     Wordings from feature/website-revamp. One item open at a time.
     Uses class .is-active; open/close height is CSS grid-rows. */
  function initFaq() {
    var items = document.querySelectorAll('.faq-item');
    if (!items.length) return;
    items.forEach(function (item) {
      var trigger = item.querySelector('.faq-item__trigger');
      if (!trigger) return;
      trigger.addEventListener('click', function () {
        var wasOpen = item.classList.contains('is-active');
        items.forEach(function (other) {
          other.classList.remove('is-active');
          var otherTrigger = other.querySelector('.faq-item__trigger');
          if (otherTrigger) otherTrigger.setAttribute('aria-expanded', 'false');
        });
        if (!wasOpen) {
          item.classList.add('is-active');
          trigger.setAttribute('aria-expanded', 'true');
        }
      });
    });
  }

  function loadContentThenInit() {
    fetch('/content.json', { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        applyContent(data);
        tagWaLinks();
        initShareButton();
        initFaq();
        initPetCorner();
        if (CURRENT_ARM) trackEvent('exposure', { arm: CURRENT_ARM });
      })
      .catch(function () {
        tagWaLinks();
        initShareButton();
        initFaq();
        initPetCorner();
      });
  }

  /* ---- Pet Corner controller ----------------------------------------
     Drives /assets/pet-spritesheet.webp — custom Hanniel jar mascot.
     Atlas: 1536x1456 (8 cols × 7 rows of 192x208 frames).
     7 states occupy rows 0-6: idle / walk / run / bake / review / error / done.
     Triggered by:
       - window scroll → walk
       - click on the existing .floating-wa / .floating-grab → run → done
     Pet: custom "Little Hanniel" overnight-oats jar character (PIL-drawn).
     ----------------------------------------------------------------- */
  function initPetCorner() {
    var sprite = document.getElementById('lh-pet-sprite');
    if (!sprite) return;
    var stage = sprite.parentElement; // .lh-pet-stage

    var SPRITE = {
      cols: 8, rows: 7, frameW: 192, frameH: 208, fps: 8,
      states: { idle: 0, walk: 1, run: 2, tool_call: 3, reviewing: 4, error: 5, done: 6 }
    };
    /* SCALE: derived from the LIVE stage box so the sprite frame fills
       the stage without clipping.  aspect of stage is what matters —
       both desktop (168×182) and mobile (120×130) have the same 192:208
       aspect as the sprite, so SCALE = stageW / frameW.  Computed AFTER
       the stage is in the DOM and styled; Re-read on resize. */
    var SCALE = stage.clientWidth / SPRITE.frameW;
    if (!SCALE || !isFinite(SCALE)) SCALE = 168 / SPRITE.frameW;

    sprite.style.backgroundSize =
      (SPRITE.frameW * SPRITE.cols * SCALE) + 'px ' +
      (SPRITE.frameH * SPRITE.rows * SCALE) + 'px';

    // Re-compute SCALE on resize so mobile/desktop stay correct
    window.addEventListener('resize', function () {
      var newScale = stage.clientWidth / SPRITE.frameW;
      if (!newScale || !isFinite(newScale)) return;
      SCALE = newScale;
      sprite.style.backgroundSize =
        (SPRITE.frameW * SPRITE.cols * SCALE) + 'px ' +
        (SPRITE.frameH * SPRITE.rows * SCALE) + 'px';
    });

    var bubble = document.getElementById('lh-pet-bubble');
    var state = 'idle', frame = 0, lastT = 0;

    function draw(now) {
      // Always schedule the next frame first so the loop never drops,
      // even if we skip the body for this tick (fps limiter).
      if (now - lastT >= 1000 / SPRITE.fps) {
        lastT = now;
        var row = SPRITE.states[state] || 0;
        var col = frame % SPRITE.cols;
        sprite.style.backgroundPosition =
          '-' + (col * SPRITE.frameW * SCALE) + 'px -' +
               (row * SPRITE.frameH * SCALE) + 'px';
        frame++;
      }
      requestAnimationFrame(draw);
    }
    requestAnimationFrame(draw);

    // Scroll → walk (walk frames keep the smiley face + sparkly eyes)
    var walkTimer = null;
    window.addEventListener('scroll', function () {
      state = 'walk';
      clearTimeout(walkTimer);
      walkTimer = setTimeout(function () { state = 'idle'; }, 250);
    }, { passive: true });

    // Click on the existing floating Grab / WhatsApp buttons → run → done
    // (run frames keep the smiley face)
    document.querySelectorAll('.floating-wa, .floating-grab').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state = 'run';
        setTimeout(function () { state = 'done'; }, 900);
        if (bubble) {
          bubble.textContent = 'On the way! Fresh oats 🥣';
          bubble.classList.add('is-visible');
          setTimeout(function () { bubble.classList.remove('is-visible'); }, 2200);
        }
      });
    });

    // Welcome bubble on entrance
    if (bubble) {
      setTimeout(function () {
        bubble.classList.add('is-visible');
        setTimeout(function () { bubble.classList.remove('is-visible'); }, 3500);
      }, 1400);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadContentThenInit);
  } else {
    loadContentThenInit();
  }
})();
