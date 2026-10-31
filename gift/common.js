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

  /* ---- sound effects: synthesised with Web Audio, so there are no files to load ---- */
  const sfx = (function () {
    const AC = window.AudioContext || window.webkitAudioContext;
    let ctx, out, noiseBuf;
    let muted = !!store.get('muted');

    function unlock() {
      if (!AC) return;
      if (!ctx) {
        ctx = new AC();
        out = ctx.createGain();
        out.gain.value = 0.6;
        out.connect(ctx.destination);
        noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
        const d = noiseBuf.getChannelData(0);
        for (let i = 0; i < d.length; i += 1) d[i] = Math.random() * 2 - 1;
      }
      if (ctx.state === 'suspended') ctx.resume();
    }
    // Browsers only allow audio after a gesture; iOS only counts touchend/click.
    ['pointerdown', 'touchend', 'click', 'keydown'].forEach((ev) => window.addEventListener(ev, unlock, { capture: true, passive: true }));

    function tone(at, freq, dur, vol, o) {
      const p = o || {};
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = p.type || 'sine';
      osc.frequency.setValueAtTime(freq, at);
      if (p.to) osc.frequency.exponentialRampToValueAtTime(p.to, at + dur);
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(vol, at + Math.min(0.012, dur / 3));
      g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      osc.connect(g); g.connect(out);
      osc.start(at); osc.stop(at + dur + 0.02);
    }

    function noise(at, dur, vol, from, to, q) {
      const src = ctx.createBufferSource();
      const f = ctx.createBiquadFilter();
      const g = ctx.createGain();
      src.buffer = noiseBuf;
      f.type = 'bandpass'; f.Q.value = q || 1;
      f.frequency.setValueAtTime(from, at);
      f.frequency.exponentialRampToValueAtTime(to, at + dur);
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(vol, at + dur * 0.35);
      g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      src.connect(f); f.connect(g); g.connect(out);
      src.start(at, Math.random() * 0.5, dur + 0.02);
    }

    const semi = (hz, n) => hz * Math.pow(2, n / 12);
    const sparkle = (t, vol) => [3136, 4186, 3520, 5274, 4699].forEach((hz, i) => tone(t + i * 0.055, hz, 0.22, vol));
    const arp = (t, notes, gap, vol) => notes.forEach((hz, i) => {
      tone(t + i * gap, hz, 0.34, vol, { type: 'triangle' });
      tone(t + i * gap, hz * 2, 0.2, vol * 0.3);
    });
    const C = [523.25, 659.25, 783.99, 1046.5];

    const recipes = {
      // arg: semitones, so the stepper climbs in pitch toward the next free treat
      tick: (t, n) => tone(t, semi(740, n || 0), 0.05, 0.14, { type: 'triangle' }),
      bump: (t) => tone(t, 150, 0.12, 0.28, { to: 90 }),
      pop: (t) => tone(t, 420, 0.09, 0.26, { to: 940 }),
      flip: (t) => {
        noise(t, 0.03, 0.12, 3500, 2500, 1);          // the card leaves the table
        noise(t + 0.03, 0.34, 0.3, 500, 3200, 0.8);   // the air as it spins
        const land = t + (reduced ? 0.42 : 0.6);
        noise(land, 0.05, 0.22, 1800, 700, 0.9);      // and lands
        tone(land, 190, 0.08, 0.26, { to: 110 });
      },
      // arg: how many free treats so far; each unlock rings a little higher
      unlock: (t, n) => {
        const up = Math.min(Math.max((n || 1) - 1, 0), 7);
        arp(t, C.map((hz) => semi(hz, up)), 0.075, 0.2);
        sparkle(t + 0.3, 0.035);
      },
      success: (t) => arp(t, [783.99, 1046.5], 0.09, 0.18),
      rattle: (t) => [0, 0.11, 0.2, 0.32, 0.41, 0.52].forEach((d, i) => noise(t + d, 0.06, 0.8, i % 2 ? 900 : 1300, 600, 2)),
      open: (t) => { noise(t, 0.28, 0.26, 700, 5000, 0.7); tone(t, 300, 0.14, 0.26, { to: 800 }); },
      reveal: (t) => {
        C.forEach((hz, i) => tone(t + i * 0.035, hz, 0.9, 0.11, { type: 'triangle' }));
        sparkle(t + 0.12, 0.045);
      },
      redeem: (t) => {
        [2093, 3322].forEach((hz) => tone(t, hz, 0.28, 0.09));   // spoon on a jar
        arp(t + 0.14, [659.25, 987.77], 0.09, 0.16);
      },
      fanfare: (t) => {
        arp(t, C, 0.1, 0.2);
        C.forEach((hz) => tone(t + 0.42, hz, 1.1, 0.09, { type: 'triangle' }));
        sparkle(t + 0.5, 0.05);
      },
    };

    function play(name, arg) {
      if (muted || !ctx || !recipes[name]) return;
      const go = () => { try { recipes[name](ctx.currentTime + 0.005, arg); } catch (e) { /* never break the page for a sound */ } };
      if (ctx.state === 'running') { go(); return; }
      const asked = Date.now();
      ctx.resume().then(() => { if (Date.now() - asked < 300) go(); }).catch(() => {});
    }

    function setMuted(v) { muted = !!v; store.set('muted', muted); }

    return { play, setMuted, isMuted: () => muted, supported: !!AC };
  })();

  /* The sound on/off button in the page header. */
  function mountSoundToggle() {
    const top = $('.gx-top');
    if (!top || !sfx.supported) return;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'gx-sound';
    const paint = () => {
      b.textContent = sfx.isMuted() ? '🔇' : '🔊';
      b.setAttribute('aria-label', sfx.isMuted() ? 'Turn sound on' : 'Turn sound off');
      b.title = b.getAttribute('aria-label');
    };
    paint();
    b.addEventListener('click', () => { sfx.setMuted(!sfx.isMuted()); paint(); sfx.play('pop'); });
    top.insertBefore(b, top.lastElementChild);
  }
  mountSoundToggle();

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
      sfx.play('flip');
      const land = setTimeout(() => haptic(14), reduced ? 420 : 620);
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
        if (user) sfx.play('success');
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
    sfx.play('tick', 7);
    try { await navigator.clipboard.writeText(text); } catch (e) {
      const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select();
      try { document.execCommand('copy'); } catch (er) { /* noop */ } t.remove();
    }
    const old = btn.textContent;
    btn.classList.add('is-done'); btn.textContent = 'Copied ✓'; haptic(10);
    setTimeout(() => { btn.classList.remove('is-done'); btn.textContent = old; }, 1600);
  }

  window.LHG = { esc, rupiah, $, api, store, haptic, toast, countUp, confetti, cardHTML, mountCard, levelFor, LEVELS, verifyWhatsApp, copyText, reduced, sfx };
})();
