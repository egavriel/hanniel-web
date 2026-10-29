/* Little Hanniel e-Gift — shared client helpers (window.LHG).
   No dependencies. Used by gift/buy.js and gift/card.js. */
(function () {
  'use strict';

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const rupiah = (n) => 'Rp ' + Number(n || 0).toLocaleString('id-ID');
  const $ = (sel, root) => (root || document).querySelector(sel);

  async function api(path, body) {
    const init = body === undefined
      ? { credentials: 'same-origin' }
      : { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) };
    let res, data;
    try {
      res = await fetch('/api/gift/' + path, init);
      data = await res.json().catch(() => ({}));
    } catch (e) {
      throw Object.assign(new Error('No connection. Check your internet and try again.'), { status: 0 });
    }
    if (!res.ok) throw Object.assign(new Error(data.error || 'Something went wrong.'), { status: res.status, data });
    return data;
  }

  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem('lhg:' + k)); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem('lhg:' + k, JSON.stringify(v)); } catch (e) { /* private mode */ } },
  };

  function haptic(ms) { try { if (navigator.vibrate) navigator.vibrate(ms || 12); } catch (e) { /* noop */ } }

  function toast(text) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = text;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2700);
  }

  /* ---- numbers that count up ---- */
  function countUp(el, to, ms) {
    const from = Number(el.dataset.v || 0);
    el.dataset.v = to;
    if (reduced || from === to) { el.textContent = to; return; }
    const dur = ms || 900;
    const t0 = performance.now();
    (function step(now) {
      const p = Math.min(1, (now - t0) / dur);
      const e = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(from + (to - from) * e);
      if (p < 1) requestAnimationFrame(step);
    })(t0);
  }

  /* ---- confetti (one canvas, brand colours) ---- */
  let canvas, ctx, parts = [], raf = 0;
  const COLORS = ['#D4A24C', '#E9C072', '#A67C52', '#8A9A6B', '#EBA3AD', '#2B2118', '#FBF3E6'];
  function confetti(opts) {
    if (reduced) return;
    const o = Object.assign({ count: 140, x: 0.5, y: 0.45, spread: 1 }, opts);
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.id = 'confetti';
      document.body.appendChild(canvas);
      ctx = canvas.getContext('2d');
    }
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = innerWidth * dpr; canvas.height = innerHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (let i = 0; i < o.count; i += 1) {
      const a = (Math.random() * Math.PI * 2);
      const v = (4 + Math.random() * 9) * o.spread;
      parts.push({
        x: innerWidth * o.x, y: innerHeight * o.y,
        vx: Math.cos(a) * v, vy: Math.sin(a) * v - 7,
        w: 6 + Math.random() * 6, h: 8 + Math.random() * 8,
        r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.35,
        c: COLORS[(Math.random() * COLORS.length) | 0], life: 0, round: Math.random() < 0.3,
      });
    }
    if (!raf) raf = requestAnimationFrame(tick);
  }
  function tick() {
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    parts = parts.filter((p) => p.life < 200 && p.y < innerHeight + 40);
    for (const p of parts) {
      p.life += 1; p.vy += 0.32; p.vx *= 0.985; p.vy *= 0.985;
      p.x += p.vx; p.y += p.vy; p.r += p.vr;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - p.life / 200);
      ctx.translate(p.x, p.y); ctx.rotate(p.r);
      ctx.fillStyle = p.c;
      if (p.round) { ctx.beginPath(); ctx.arc(0, 0, p.w / 2, 0, Math.PI * 2); ctx.fill(); }
      else ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.life / 8)) + 2);
      ctx.restore();
    }
    raf = parts.length ? requestAnimationFrame(tick) : 0;
    if (!raf) ctx.clearRect(0, 0, innerWidth, innerHeight);
  }

  /* ---- the gift card ---- */
  function cardHTML(g, opt) {
    const o = opt || {};
    const ribbon = g.status === 'pending_payment' ? 'Wrapping'
      : g.status === 'completed' ? 'Enjoyed' : (g.unitsBonus ? `+${g.unitsBonus} free` : '');
    const total = o.remaining != null ? o.remaining : g.unitsTotal;
    const sub = o.remaining != null ? `left of ${g.unitsTotal}` : (g.unitsBonus ? `${g.unitsPaid} + ${g.unitsBonus} free` : 'treats');
    return `
      <div class="gcard" data-theme="${esc(g.theme || 'cream')}">
       <div class="gcard__inner">
        <div class="gcard__face gcard__front">
          <span class="gcard__shine"></span>
          ${ribbon ? `<div class="gcard__ribbon">${esc(ribbon)}</div>` : ''}
          <div class="gcard__top">
            <div class="gcard__brand">Little Hanniel</div>
            <div class="gcard__tag">e-Gift</div>
          </div>
          <div class="gcard__mid">
            <div class="gcard__num" data-v="${o.countFrom || 0}">${o.countFrom != null ? o.countFrom : esc(total)}</div>
            <div class="gcard__what">${esc(g.lineName || 'Treats')}<small>${esc(sub)}</small></div>
          </div>
          <div class="gcard__bot">
            <div class="gcard__to"><span>For</span><b>${esc(g.recipientName || 'Someone special')}</b></div>
            <div style="text-align:right"><span style="opacity:.8">from ${esc(g.senderName || 'you')}</span>
              ${g.code ? `<div class="gcard__code">GIFT-${esc(g.code)}</div>` : ''}</div>
          </div>
        </div>
        <div class="gcard__face gcard__back">
          <span class="gcard__shine"></span>
          <div class="gcard__seal" aria-hidden="true">♥</div>
          <div class="gcard__msg">${esc(g.message || 'Something sweet, just for you.')}</div>
          <div class="gcard__sig">— ${esc(g.senderName || 'you')}</div>
          <div class="gcard__brand gcard__brand--back">Little Hanniel</div>
        </div>
       </div>
      </div>`;
  }

  /* Tilt toward the pointer (on .gcard); tap spins the inner card over to the
     other face (on .gcard__inner), always turning the same way like a coin. */
  function mountCard(stage) {
    const card = $('.gcard', stage);
    const inner = card && $('.gcard__inner', card);
    if (!inner) return;
    if (!reduced) {
      stage.addEventListener('pointermove', (e) => {
        const r = card.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - 0.5;
        const y = (e.clientY - r.top) / r.height - 0.5;
        card.style.transition = 'transform 0.12s linear';
        card.style.transform = `rotateY(${x * 16}deg) rotateX(${-y * 12}deg)`;
        card.style.setProperty('--sx', `${x * 120}%`);
      });
      stage.addEventListener('pointerleave', () => { card.style.transition = ''; card.style.transform = ''; });
    }
    let busy = false;
    stage.addEventListener('click', () => {
      if (busy) return;
      busy = true;
      const toBack = !card.classList.contains('is-flip');
      card.classList.add(toBack ? 'is-flipping-back' : 'is-flipping-front');
      haptic(8);
      const land = setTimeout(() => haptic(14), reduced ? 0 : 620);
      // the faces' shine/shadow animations bubble up too; only the spin itself counts
      const onEnd = (e) => { if (e.target === inner) done(); };
      const done = () => {
        clearTimeout(fallback);
        inner.removeEventListener('animationend', onEnd);
        card.classList.remove('is-flipping-back', 'is-flipping-front');
        card.classList.toggle('is-flip', toBack);
        busy = false;
      };
      const fallback = setTimeout(() => { clearTimeout(land); done(); }, 1200);
      inner.addEventListener('animationend', onEnd);
    });
  }

  /* ---- levels & badges ---- */
  const LEVELS = [
    { at: 0, name: 'Kind Crumb', icon: '🌱' },
    { at: 6, name: 'Sweet Friend', icon: '🍯' },
    { at: 18, name: 'Golden Spoon', icon: '🥄' },
    { at: 36, name: 'Hanniel Hero', icon: '👑' },
  ];
  function levelFor(xp) {
    let i = 0;
    while (i + 1 < LEVELS.length && xp >= LEVELS[i + 1].at) i += 1;
    const cur = LEVELS[i];
    const next = LEVELS[i + 1] || null;
    const pct = next ? (xp - cur.at) / (next.at - cur.at) : 1;
    return { ...cur, index: i, next, pct, toNext: next ? next.at - xp : 0 };
  }

  /* ---- WhatsApp OTP sheet. Resolves with the user, or null if dismissed. ---- */
  function verifyWhatsApp(opt) {
    const o = Object.assign({ title: 'Verify your WhatsApp', lead: 'We’ll send a 6-digit code on WhatsApp. That’s your account — no password.' }, opt);
    return new Promise((resolve) => {
      const saved = store.get('who') || {};
      const bg = document.createElement('div'); bg.className = 'sheet-bg';
      const sh = document.createElement('div'); sh.className = 'sheet';
      sh.setAttribute('role', 'dialog'); sh.setAttribute('aria-modal', 'true'); sh.setAttribute('aria-label', o.title);
      document.body.append(bg, sh);
      document.body.style.overflow = 'hidden';
      let phone = '', name = '', timer = 0, done = false;

      function close(user) {
        if (done) return; done = true;
        clearInterval(timer);
        sh.classList.add('is-closing'); bg.classList.add('is-closing');
        setTimeout(() => { sh.remove(); bg.remove(); document.body.style.overflow = ''; }, 300);
        resolve(user || null);
      }
      bg.addEventListener('click', () => close(null));
      document.addEventListener('keydown', function onKey(e) { if (e.key === 'Escape') { document.removeEventListener('keydown', onKey); close(null); } });

      function stepPhone(err) {
        sh.innerHTML = `
          <button class="sheet__x" type="button" aria-label="Close">×</button>
          <div class="sheet__icon">💬</div>
          <h2 class="gx-h2">${esc(o.title)}</h2>
          <p class="gx-lead" style="margin-bottom:16px">${esc(o.lead)}</p>
          <form novalidate>
            <label class="field"><span>Your name</span>
              <input class="input" name="name" autocomplete="given-name" maxlength="40" placeholder="e.g. Erwin" value="${esc(name || saved.name || '')}" required></label>
            <label class="field"><span>WhatsApp number</span>
              <div class="phone"><b>+62</b><input name="phone" type="tel" inputmode="tel" autocomplete="tel-national" placeholder="812 3456 7890" value="${esc(phone || saved.phone || '')}" required></div></label>
            <div class="err" role="alert">${esc(err || '')}</div>
            <button class="btn btn--wa" type="submit">Send code on WhatsApp</button>
          </form>`;
        $('.sheet__x', sh).onclick = () => close(null);
        const f = $('form', sh);
        setTimeout(() => (f.name.value ? f.phone : f.name).focus(), 350);
        f.onsubmit = async (e) => {
          e.preventDefault();
          name = f.name.value.trim(); phone = f.phone.value.trim();
          if (!name) { $('.err', sh).textContent = 'What should we call you?'; f.name.focus(); return; }
          if (phone.replace(/\D/g, '').length < 9) { $('.err', sh).textContent = 'That number looks too short.'; f.phone.focus(); return; }
          const btn = $('button[type=submit]', f); btn.classList.add('is-loading');
          try {
            const r = await api('otp/send', { phone });
            store.set('who', { name, phone });
            stepCode(r);
          } catch (er) {
            btn.classList.remove('is-loading');
            $('.err', sh).textContent = er.message;
          }
        };
      }

      function stepCode(sent) {
        sh.innerHTML = `
          <button class="sheet__x" type="button" aria-label="Close">×</button>
          <div class="sheet__icon">🔐</div>
          <h2 class="gx-h2">Enter the code</h2>
          <p class="gx-lead" style="margin-bottom:4px">Sent on WhatsApp to <b>${esc(sent.phone)}</b>
            <button class="linkbtn" type="button" data-edit>Change</button></p>
          <div class="otp">
            <div class="otp__boxes">${'<div class="otp__box"></div>'.repeat(6)}</div>
            <input type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]*" aria-label="6-digit code">
          </div>
          <div class="err" role="alert"></div>
          ${sent.devCode ? `<div class="devcode">Dev mode — your code is <b class="mono">${esc(sent.devCode)}</b></div>` : ''}
          <p class="muted" style="margin-top:14px">Didn’t get it? <button class="linkbtn" type="button" data-resend disabled>Resend in <span>30</span>s</button></p>`;
        $('.sheet__x', sh).onclick = () => close(null);
        $('[data-edit]', sh).onclick = () => stepPhone();
        const wrap = $('.otp', sh);
        const input = $('input', wrap);
        const boxes = [...sh.querySelectorAll('.otp__box')];
        const paint = () => {
          const v = input.value;
          boxes.forEach((b, i) => {
            const had = b.textContent;
            b.textContent = v[i] || '';
            b.classList.toggle('is-active', i === Math.min(v.length, 5) && document.activeElement === input);
            if (v[i] && !had) { b.classList.remove('is-filled'); void b.offsetWidth; b.classList.add('is-filled'); }
          });
        };
        input.addEventListener('focus', paint); input.addEventListener('blur', paint);
        input.addEventListener('input', async () => {
          input.value = input.value.replace(/\D/g, '').slice(0, 6);
          wrap.classList.remove('is-bad'); $('.err', sh).textContent = '';
          paint(); haptic(6);
          if (input.value.length !== 6) return;
          input.disabled = true;
          try {
            const r = await api('otp/verify', { phone, code: input.value, name });
            wrap.classList.add('is-ok'); haptic([10, 40, 10]);
            setTimeout(() => close(r.user), 450);
          } catch (er) {
            wrap.classList.add('is-bad'); haptic(60);
            $('.err', sh).textContent = er.message;
            input.disabled = false; input.value = ''; paint(); input.focus();
          }
        });
        setTimeout(() => input.focus(), 300);

        const resend = $('[data-resend]', sh);
        let left = sent.cooldown || 30;
        clearInterval(timer);
        timer = setInterval(() => {
          left -= 1;
          if (left <= 0) { clearInterval(timer); resend.disabled = false; resend.textContent = 'Resend code'; }
          else $('span', resend).textContent = left;
        }, 1000);
        resend.onclick = async () => {
          resend.disabled = true;
          try { stepCode(await api('otp/send', { phone })); toast('New code sent on WhatsApp'); }
          catch (er) { $('.err', sh).textContent = er.message; resend.disabled = false; }
        };
      }

      stepPhone();
    });
  }

  async function copyText(btn, text) {
    try { await navigator.clipboard.writeText(text); } catch (e) {
      const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select();
      try { document.execCommand('copy'); } catch (er) { /* noop */ } t.remove();
    }
    const old = btn.textContent;
    btn.classList.add('is-done'); btn.textContent = 'Copied ✓'; haptic(10);
    setTimeout(() => { btn.classList.remove('is-done'); btn.textContent = old; }, 1600);
  }

  window.LHG = { esc, rupiah, $, api, store, haptic, toast, countUp, confetti, cardHTML, mountCard, levelFor, LEVELS, verifyWhatsApp, copyText, reduced };
})();
