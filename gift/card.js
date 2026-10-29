/* /g/<code> — unwrap → claim (WhatsApp OTP) → treat jar → redeem → thank.
   Senders opening their own link get a status view instead. Depends on gift/common.js. */
(function () {
  'use strict';
  const { esc, $, api, store, haptic, toast, countUp, confetti, cardHTML, mountCard, verifyWhatsApp, copyText } = window.LHG;

  const app = $('#app');
  const code = (location.pathname.split('/')[2] || new URLSearchParams(location.search).get('code') || '').toUpperCase();
  const FLAVOR_IMG = {
    'Double Chocolate': '/gift/img/oats-doublechoco.webp',
    Strawberry: '/gift/img/oats-strawberry.webp',
    Tiramisu: '/gift/img/oats-tiramisu.webp',
    'Almond Choco': '/gift/img/cookies.webp',
  };
  const EMOJIS = ['😍', '🥹', '🤤', '🙏', '❤️', '🎉'];

  let gift = null;
  let me = null;
  let pick = { flavor: '', qty: 1 };
  let lastRedeemed = null;

  const wrap = (html) => `<div class="gx-wrap">${html}</div>`;
  const left = () => gift.unitsTotal - gift.unitsRedeemed;

  /* ---------------- unwrap ---------------- */

  function viewUnwrap() {
    app.innerHTML = `
      <section class="unwrap view">
        <p class="eyebrow">A Little Hanniel e-Gift</p>
        <h1 class="gx-h1">${esc(gift.senderName)} sent you something sweet${gift.recipientName ? `, ${esc(gift.recipientName)}` : ''}</h1>
        <button class="box is-idle" type="button" id="box" aria-label="Unwrap your gift">
          <span class="box__glow"></span>
          <span class="box__lid"><span class="box__bow"></span></span>
          <span class="box__base"></span>
        </button>
        <p class="tap">Tap to unwrap</p>
      </section>`;
    const box = $('#box');
    box.addEventListener('click', () => {
      box.disabled = true;
      box.classList.remove('is-idle');
      box.classList.add('is-shake');
      haptic([20, 40, 20, 40, 30]);
      setTimeout(() => { box.classList.add('is-open'); haptic(40); }, 600);
      setTimeout(() => confetti({ y: 0.42, count: 180 }), 850);
      setTimeout(viewReveal, 1150);
    }, { once: true });
  }

  function viewReveal() {
    store.set(`unwrapped:${code}`, 1);
    app.innerHTML = wrap(`
      <section style="text-align:center;padding-top:12px">
        <div class="card-stage reveal-card" id="stage">${cardHTML(gift, { countFrom: 0 })}</div>
        <div class="reveal-copy">
          <h1 class="gx-h1">${gift.unitsTotal} ${esc(gift.lineName)}, on ${esc(gift.senderName)} 💛</h1>
          <p class="gx-lead">Pick any flavour and redeem whenever you like — one at a time or all at once.${gift.unitsBonus ? ` That includes <b>${gift.unitsBonus} free</b> from us.` : ''}</p>
          ${gift.status === 'pending_payment' ? `<div class="notice" style="text-align:left;margin-bottom:14px"><i>🎀</i><div>${esc(gift.senderName)}’s payment is being confirmed. Claim it now and it’ll be ready to redeem shortly.</div></div>` : ''}
          ${claimCta()}
        </div>
      </section>`);
    mountCard($('#stage'));
    setTimeout(() => countUp($('.gcard__num'), gift.unitsTotal, 1200), 500);
    bindClaim();
  }

  function claimCta() {
    if (gift.claimed && !gift.isRecipient) {
      return `<div class="notice" style="text-align:left"><i>🔒</i><div>This gift has already been claimed by its recipient.${me ? '' : ' Is it yours? Verify the WhatsApp number you claimed it with.'}</div></div>
        ${me ? '' : '<button class="btn btn--ghost" type="button" id="claim" style="margin-top:12px">It’s mine — verify</button>'}`;
    }
    return `<button class="btn btn--wa" type="button" id="claim">Claim with WhatsApp</button>
      <p class="muted" style="margin-top:10px">Takes 20 seconds. It locks this gift to your number, so only you can use it.</p>`;
  }

  function bindClaim() {
    const btn = $('#claim');
    if (!btn) return;
    btn.onclick = async () => {
      if (!me) {
        const u = await verifyWhatsApp({ title: 'Claim your gift', lead: `Your WhatsApp number keeps ${gift.senderName}’s gift safe. We’ll send you a 6-digit code.` });
        if (!u) return;
        me = u;
      }
      btn.classList.add('is-loading');
      try {
        const r = await api('claim', { code });
        gift = r.gift;
        haptic([10, 50, 10]);
        confetti({ y: 0.3, count: 90 });
        viewWallet();
      } catch (e) {
        btn.classList.remove('is-loading');
        if (e.status === 409 || e.status === 403) { await reload(); toast(e.message); return; }
        toast(e.message);
      }
    };
  }

  /* ---------------- treat jar (recipient) ---------------- */

  function stampsHTML(prevRedeemed) {
    let h = '';
    for (let i = 0; i < gift.unitsTotal; i += 1) {
      const used = i < gift.unitsRedeemed;
      const fresh = used && prevRedeemed != null && i >= prevRedeemed;
      h += `<div class="stamp ${used ? 'is-used' : 'is-ready'}" style="${fresh ? `animation:pop .5s ${(i - prevRedeemed) * 0.08}s var(--ease-spring) both` : 'animation:none'}">${gift.emoji}</div>`;
    }
    return h;
  }

  function badgesHTML() {
    const tried = new Set((gift.redemptions || []).map((r) => r.flavor));
    const list = [
      { i: '📦', t: 'Unwrapped', on: true },
      { i: '😋', t: 'First Bite', on: gift.unitsRedeemed > 0 },
      { i: '🧭', t: 'Flavour Explorer', on: gift.flavors.every((f) => tried.has(f)), d: `${tried.size}/${gift.flavors.length} flavours` },
      { i: '🍽️', t: 'Clean Plate', on: gift.status === 'completed' },
    ];
    return list.map((b) => `<div class="badge ${b.on ? '' : 'is-locked'}"><div class="badge__i">${b.i}</div><b>${b.t}</b>${b.d ? `<span>${b.d}</span>` : ''}</div>`).join('');
  }

  function viewWallet(prevRedeemed) {
    const pct = gift.unitsRedeemed / gift.unitsTotal;
    const done = gift.status === 'completed';
    const pending = gift.status === 'pending_payment';
    if (!pick.flavor || !gift.flavors.includes(pick.flavor)) pick.flavor = gift.flavors[0];
    pick.qty = Math.min(Math.max(1, pick.qty), Math.max(1, left()));

    app.innerHTML = wrap(`
      <section class="view">
        <p class="eyebrow">From ${esc(gift.senderName)}, with love</p>
        <div class="card-stage" id="stage">${cardHTML(gift, { remaining: left() })}</div>
        <p class="card-hint">Tap the card to read ${esc(gift.senderName)}’s note</p>

        ${done ? `
          <div class="panel done-hero"><i>🍽️</i>
            <h2 class="gx-h2" style="margin:8px 0 4px">Clean plate!</h2>
            <p class="gx-lead" style="margin-bottom:14px">You enjoyed all ${gift.unitsTotal} ${esc(gift.lineName)}. Pass the joy on?</p>
            <a class="btn btn--gold" href="/gift?from=${esc(code)}">Pay it forward — gift a friend 🎁</a>
          </div>` : ''}
        ${pending ? `<div class="notice" style="margin-bottom:14px"><i>🎀</i><div>Still being wrapped — ${esc(gift.senderName)}’s payment is being confirmed. You can redeem as soon as it’s done.</div></div>` : ''}

        <div class="panel">
          <div class="jar__head"><div><b id="enj">${prevRedeemed != null ? prevRedeemed : gift.unitsRedeemed}</b> <span>of ${gift.unitsTotal} enjoyed</span></div><span>${left()} ready</span></div>
          <div class="bar bar--sage bar--lg"><i id="jarBar" style="width:${(prevRedeemed != null ? prevRedeemed / gift.unitsTotal : 0) * 100}%"></i></div>
          <div class="stamps" style="grid-template-columns:repeat(6,1fr)">${stampsHTML(prevRedeemed)}</div>
        </div>

        ${!done ? `
        <div class="panel" id="redeem">
          <p class="eyebrow">Redeem</p>
          <h2 class="gx-h2">What are you craving?</h2>
          <div class="flavors">${gift.flavors.map((f) => `
            <button class="flavor" type="button" data-f="${esc(f)}" aria-pressed="${f === pick.flavor}">
              ${FLAVOR_IMG[f] ? `<img src="${FLAVOR_IMG[f]}" alt="" width="160" height="160" loading="lazy">` : `<div class="flavor__ph">${gift.emoji}</div>`}
              <span>${esc(f)}</span></button>`).join('')}</div>
          <div class="stepper" style="margin:0 0 14px">
            <button type="button" data-q="-1" aria-label="One less">−</button>
            <div class="stepper__val"><span class="stepper__num" id="q" style="font-size:40px">${pick.qty}</span><span class="stepper__lbl">of ${left()} left</span></div>
            <button type="button" data-q="1" aria-label="One more">+</button>
          </div>
          <button class="btn" type="button" id="go" ${pending ? 'disabled' : ''}></button>
          <p class="muted" style="margin:10px 0 0;text-align:center">We’ll open WhatsApp so Little Hanniel can arrange pickup or delivery.</p>
        </div>` : ''}

        ${lastRedeemed ? `
        <div class="panel" id="sendWa">
          <p class="eyebrow">Reserved ✓</p>
          <h2 class="gx-h2">${lastRedeemed.qty}× ${esc(lastRedeemed.flavor)} is saved for you</h2>
          <a class="btn btn--wa" href="${esc(lastRedeemed.waUrl)}" target="_blank" rel="noopener">Send to Little Hanniel on WhatsApp</a>
        </div>` : ''}

        <div class="panel">
          <p class="eyebrow">Badges</p>
          <div class="badges">${badgesHTML()}</div>
        </div>

        <div class="panel" id="thanks">
          <p class="eyebrow">Say thanks</p>
          <h2 class="gx-h2">${gift.thanksEmoji ? `You sent ${esc(gift.senderName)} a ${gift.thanksEmoji}` : `Let ${esc(gift.senderName)} know you loved it`}</h2>
          <div class="react">${EMOJIS.map((e) => `<button type="button" data-e="${e}" aria-pressed="${e === gift.thanksEmoji}" aria-label="React ${e}">${e}</button>`).join('')}</div>
          <input class="input" id="note" maxlength="120" placeholder="Add a note (optional)" value="${esc(gift.thanksNote || '')}" style="margin-top:12px">
        </div>

        ${(gift.redemptions || []).length ? `
        <div class="panel">
          <p class="eyebrow">History</p>
          <ul class="hist">${gift.redemptions.map((r) => `<li><span>${r.qty}× ${esc(r.flavor)}</span><span class="muted">${new Date(r.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} · ${r.status === 'fulfilled' ? 'Enjoyed' : 'Reserved'}</span></li>`).join('')}</ul>
        </div>` : ''}
      </section>`);

    mountCard($('#stage'));
    requestAnimationFrame(() => requestAnimationFrame(() => {
      $('#jarBar').style.width = `${pct * 100}%`;
      countUp($('#enj'), gift.unitsRedeemed, 900);
    }));
    if (lastRedeemed) setTimeout(() => $('#sendWa').scrollIntoView({ behavior: 'smooth', block: 'center' }), 700);
    bindWallet();
  }

  function goLabel() {
    const b = $('#go');
    if (!b) return;
    b.textContent = gift.status === 'pending_payment' ? 'Available once payment is confirmed' : `Redeem ${pick.qty} ${pick.flavor} →`;
  }

  function bindWallet() {
    app.querySelectorAll('[data-f]').forEach((b) => b.addEventListener('click', () => {
      pick.flavor = b.dataset.f; haptic(8);
      app.querySelectorAll('[data-f]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      goLabel();
    }));
    app.querySelectorAll('[data-q]').forEach((b) => b.addEventListener('click', () => {
      const n = Math.min(left(), Math.max(1, pick.qty + Number(b.dataset.q)));
      if (n === pick.qty) { haptic(30); return; }
      pick.qty = n; haptic(8);
      const q = $('#q'); q.textContent = n; q.classList.remove('bump'); void q.offsetWidth; q.classList.add('bump');
      goLabel();
    }));
    goLabel();
    const go = $('#go');
    if (go) go.onclick = async () => {
      go.classList.add('is-loading');
      const prev = gift.unitsRedeemed;
      try {
        const r = await api('redeem', { code, flavor: pick.flavor, qty: pick.qty });
        lastRedeemed = { flavor: pick.flavor, qty: pick.qty, waUrl: r.waUrl };
        gift = r.gift;
        pick.qty = 1;
        haptic([12, 40, 12]);
        viewWallet(prev);
        setTimeout(() => confetti({ count: gift.status === 'completed' ? 220 : 80, y: 0.35 }), 250);
      } catch (e) {
        go.classList.remove('is-loading');
        toast(e.message);
        if (e.status === 409) reload();
      }
    };

    let noteTimer = 0;
    const sendThanks = async (emoji) => {
      try {
        const r = await api('thanks', { code, emoji, note: $('#note').value });
        gift = r.gift;
        $('#thanks .gx-h2').textContent = `You sent ${gift.senderName} a ${gift.thanksEmoji}`;
        app.querySelectorAll('[data-e]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.e === gift.thanksEmoji)));
      } catch (e) { toast(e.message); }
    };
    app.querySelectorAll('[data-e]').forEach((b) => b.addEventListener('click', () => {
      haptic(10);
      const r = b.getBoundingClientRect();
      confetti({ count: 30, x: (r.left + r.width / 2) / innerWidth, y: r.top / innerHeight, spread: 0.4 });
      sendThanks(b.dataset.e).then(() => toast(`${gift.senderName} will see your ${b.dataset.e}`));
    }));
    $('#note').addEventListener('input', () => {
      clearTimeout(noteTimer);
      noteTimer = setTimeout(() => sendThanks(gift.thanksEmoji || '❤️'), 900);
    });
  }

  /* ---------------- sender looking at their own gift ---------------- */

  function viewSender() {
    const pct = gift.unitsRedeemed / gift.unitsTotal;
    const link = `${location.origin}/g/${code}`;
    const text = `🎁 ${gift.recipientName}, I sent you a Little Hanniel e-Gift — ${gift.unitsTotal} ${gift.lineName}! Unwrap it here: ${link}`;
    const state = gift.status === 'pending_payment' ? 'Waiting for your transfer'
      : !gift.claimed ? `Not opened by ${gift.recipientName} yet`
        : gift.status === 'completed' ? `${gift.recipientName} enjoyed every single one 🎉` : `${gift.recipientName} is enjoying it`;
    app.innerHTML = wrap(`
      <section class="view">
        <p class="eyebrow">Your gift to ${esc(gift.recipientName)}</p>
        <div class="card-stage" id="stage">${cardHTML(gift)}</div>
        <div class="panel">
          <h2 class="gx-h2">${esc(state)}</h2>
          <div class="jar__head"><div><b id="enj">0</b> <span>of ${gift.unitsTotal} enjoyed</span></div></div>
          <div class="bar bar--sage bar--lg"><i id="jarBar"></i></div>
          ${gift.thanksEmoji ? `<div class="notice" style="margin-top:14px;background:#FDEEF0;color:#4A1E25"><i>${gift.thanksEmoji}</i><div><b>${esc(gift.recipientName)} says thanks!</b>${gift.thanksNote ? `<br>“${esc(gift.thanksNote)}”` : ''}</div></div>` : ''}
        </div>
        <div class="stack" style="margin-top:14px">
          ${!gift.claimed ? `<a class="btn btn--wa" href="https://wa.me/?text=${encodeURIComponent(text)}" target="_blank" rel="noopener">Send it again on WhatsApp</a>` : ''}
          <button class="btn btn--ghost" type="button" id="copy">Copy gift link</button>
          <a class="btn btn--gold" href="/gift">Send another gift 🎁</a>
        </div>
      </section>`);
    mountCard($('#stage'));
    $('#copy').onclick = (e) => copyText(e.currentTarget, link);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      $('#jarBar').style.width = `${pct * 100}%`;
      countUp($('#enj'), gift.unitsRedeemed, 900);
    }));
    if (gift.thanksEmoji && !store.get(`thx:${code}:${gift.thanksEmoji}`)) {
      store.set(`thx:${code}:${gift.thanksEmoji}`, 1);
      setTimeout(() => confetti({ y: 0.4, count: 100 }), 400);
    }
  }

  /* ---------------- boot ---------------- */

  async function reload() {
    try {
      const r = await api(`card/${code}`);
      gift = r.gift; me = r.me;
    } catch (e) {
      app.innerHTML = wrap(`<div class="empty" style="padding-top:60px"><i>🔍</i><h1 class="gx-h2">We couldn’t find that gift</h1>
        <p>${esc(e.message)}</p><a class="btn" href="/gift" style="margin-top:16px">Send a gift instead</a></div>`);
      return;
    }
    if (gift.isSender) return viewSender();
    if (gift.isRecipient) return store.get(`unwrapped:${code}`) ? viewWallet() : viewUnwrap();
    return store.get(`unwrapped:${code}`) ? viewReveal() : viewUnwrap();
  }

  reload();
})();
