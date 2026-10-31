/* /gift — pick a bundle → personalise → verify WhatsApp → pay & share,
   plus the sender dashboard at /gift#me. Depends on gift/common.js. */
(function () {
  'use strict';
  const { esc, rupiah, $, api, store, haptic, toast, countUp, confetti, cardHTML, mountCard, levelFor, verifyWhatsApp, copyText, sfx } = window.LHG;

  const app = $('#app');
  const dock = $('#dock');
  const dockInner = $('#dockInner');

  const IMG = { oats: '/gift/img/oats.webp', cookies: '/gift/img/cookies.webp' };
  const MESSAGES = ['Happy birthday! 🎂', 'Thank you so much 🙏', 'Thinking of you 💛', 'Get well soon 🌷', 'Just because ❤️'];
  const THEME_LABEL = { cream: 'Cream', sage: 'Sage', cocoa: 'Cocoa', berry: 'Berry' };

  const draft = Object.assign({ line: 'oats', qty: 5, recipientName: '', message: '', theme: 'cream' }, store.get('draft') || {});
  let catalog = null;
  let user = null;
  let lastBonus = -1;
  let lastStamps = 0;
  let order = null;     // { gift, payment } after create

  const lineOf = () => catalog.lines.find((l) => l.id === draft.line) || catalog.lines[0];
  const quote = () => {
    const l = lineOf();
    const bonus = Math.floor(draft.qty / l.bonusEvery);
    return { paid: draft.qty, bonus, total: draft.qty + bonus, price: draft.qty * l.price, saved: bonus * l.price };
  };
  const saveDraft = () => store.set('draft', draft);

  function steps(n) {
    return `<div class="steps" aria-hidden="true">${[1, 2, 3].map((i) => `<div class="steps__seg ${i <= n ? 'is-done' : ''}"><i></i></div>`).join('')}</div>`;
  }

  function setDock(html) {
    if (!html) { dock.hidden = true; dockInner.innerHTML = ''; return; }
    dock.hidden = false; dockInner.innerHTML = html;
  }

  function previewGift() {
    const q = quote();
    const l = lineOf();
    return {
      theme: draft.theme, unitsTotal: q.total, unitsPaid: q.paid, unitsBonus: q.bonus,
      lineName: l.name, recipientName: draft.recipientName || 'Someone special',
      senderName: (user && user.name) || (store.get('who') || {}).name || 'you',
      message: draft.message,
    };
  }

  /* ---------------- step 1: pick ---------------- */

  function viewPick() {
    lastBonus = -1; lastStamps = 0;
    app.innerHTML = `
      <section class="view">
        ${steps(1)}
        <p class="eyebrow">Step 1 of 3 · Pick a treat</p>
        <h1 class="gx-h1">Gift a jar of happy mornings</h1>
        <p class="gx-lead">For every 5 you gift, we add 1 more on the house. They pick the flavours.</p>
        <div class="lines" role="group" aria-label="Choose a treat">
          ${catalog.lines.map((l) => `
            <button class="line" type="button" data-line="${l.id}" aria-pressed="${l.id === draft.line}">
              <img src="${IMG[l.id] || ''}" alt="" width="480" height="360" loading="lazy">
              <div class="line__body"><div class="line__name">${esc(l.name)}</div>
              <div class="line__price">${rupiah(l.price)} each</div></div>
            </button>`).join('')}
        </div>
        <div class="panel">
          <div class="stepper">
            <button type="button" data-step="-1" aria-label="One less">−</button>
            <div class="stepper__val"><span class="stepper__num" id="qty">${draft.qty}</span><span class="stepper__lbl" id="qtyLbl">you pay for</span></div>
            <button type="button" data-step="1" aria-label="One more">+</button>
          </div>
          <div class="chips" style="justify-content:center">
            ${[5, 10, 20].map((n) => `<button class="chip" type="button" data-preset="${n}">${n} + ${n / 5} free</button>`).join('')}
          </div>
          <div class="stamps" id="stamps" aria-hidden="true"></div>
          <p class="muted" id="stampMore" style="text-align:center;margin:4px 0 0"></p>
          <div class="goal">
            <div class="goal__row"><span id="goalTxt"></span><b id="goalCount"></b></div>
            <div class="bar"><i id="goalBar"></i></div>
          </div>
        </div>
      </section>`;

    app.querySelectorAll('[data-line]').forEach((b) => b.addEventListener('click', () => {
      draft.line = b.dataset.line; saveDraft(); haptic(8); sfx.play('tick');
      app.querySelectorAll('[data-line]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      lastStamps = 0; updatePick();
    }));
    app.querySelectorAll('[data-step]').forEach((b) => b.addEventListener('click', () => setQty(draft.qty + Number(b.dataset.step))));
    app.querySelectorAll('[data-preset]').forEach((b) => b.addEventListener('click', () => setQty(Number(b.dataset.preset))));

    setDock(`
      <div class="dock__sum"><span>You pay <b id="dPrice"></b><small class="save" id="dSave"></small></span><span id="dGet"></span></div>
      <button class="btn" type="button" id="next1">Personalise the card →</button>`);
    $('#next1').onclick = () => go('personal');
    updatePick();
  }

  function setQty(n) {
    const clamped = Math.max(catalog.minUnits, Math.min(catalog.maxUnits, n));
    if (clamped === draft.qty) { haptic(30); sfx.play('bump'); return; }
    draft.qty = clamped; saveDraft(); haptic(8);
    const line = catalog.lines.find((x) => x.id === draft.line);
    sfx.play('tick', (clamped % line.bonusEvery) * 2);   // climbs toward the next free one
    const num = $('#qty');
    num.textContent = clamped;
    num.classList.remove('bump'); void num.offsetWidth; num.classList.add('bump');
    updatePick();
  }

  function updatePick() {
    const l = lineOf();
    const q = quote();
    const every = l.bonusEvery;

    // Stamp card: one row per bundle (5 paid + 1 free). Only new stamps animate.
    const rowsShown = 4;
    const rowsTotal = Math.ceil(q.paid / every) || 1;
    const visibleRows = Math.min(rowsShown, rowsTotal);
    let html = '';
    let idx = 0;
    for (let r = 0; r < visibleRows; r += 1) {
      for (let c = 0; c < every; c += 1) {
        const n = r * every + c;
        const filled = n < q.paid;
        idx += 1;
        const anim = filled && idx > lastStamps ? '' : ' style="animation:none"';
        html += `<div class="stamp ${filled ? 'is-filled' : ''}"${anim}>${filled ? l.emoji : ''}</div>`;
      }
      const earned = r < q.bonus;
      idx += 1;
      html += earned
        ? `<div class="stamp is-bonus"${idx > lastStamps ? '' : ' style="animation:none"'}>${l.emoji}</div>`
        : '<div class="stamp is-ghost-bonus">FREE</div>';
    }
    $('#stamps').style.gridTemplateColumns = `repeat(${every + 1}, 1fr)`;
    $('#stamps').innerHTML = html;
    lastStamps = Math.min(idx, q.paid + q.bonus);
    $('#stampMore').textContent = rowsTotal > rowsShown ? `+ ${rowsTotal - rowsShown} more bundles` : '';

    const into = q.paid % every;
    const left = every - into;
    $('#goalTxt').innerHTML = into === 0
      ? `🎉 <b>${q.bonus} free</b> unlocked — ${every} more for another`
      : `Add <b>${left} more</b> to unlock 1 FREE`;
    $('#goalCount').textContent = `${into === 0 ? every : into}/${every}`;
    $('#goalBar').style.width = `${(into === 0 ? 1 : into / every) * 100}%`;
    $('#qtyLbl').textContent = `${l.unit} you pay for`;

    $('#dPrice').textContent = rupiah(q.price);
    $('#dGet').innerHTML = `They get <b>${q.total}</b>`;
    $('#dSave').textContent = q.saved ? `You save ${rupiah(q.saved)}` : '';
    app.querySelectorAll('[data-preset]').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.preset) === q.paid)));

    if (lastBonus >= 0 && q.bonus > lastBonus) celebrateUnlock(l, q.bonus);
    lastBonus = q.bonus;
  }

  function celebrateUnlock(l, bonus) {
    const u = document.createElement('div');
    u.className = 'unlock';
    u.textContent = `+1 FREE ${l.name.replace(/s$/, '')} unlocked!`;
    document.body.appendChild(u);
    setTimeout(() => u.remove(), 1700);
    const r = $('#stamps').getBoundingClientRect();
    confetti({ count: 70, x: (r.left + r.width / 2) / innerWidth, y: (r.top + r.height / 2) / innerHeight, spread: 0.7 });
    haptic([12, 50, 20]);
    sfx.play('unlock', bonus);
  }

  /* ---------------- step 2: personalise ---------------- */

  function viewPersonal() {
    app.innerHTML = `
      <section class="view">
        ${steps(2)}
        <p class="eyebrow">Step 2 of 3 · Make it theirs</p>
        <h1 class="gx-h1">Write them a little note</h1>
        <div class="card-stage" id="stage">${cardHTML(previewGift())}</div>
        <p class="card-hint">Tap the card to flip it</p>
        <div class="panel">
          <label class="field"><span>Who is it for?</span>
            <input class="input" id="to" maxlength="30" autocomplete="off" placeholder="Their name" value="${esc(draft.recipientName)}"></label>
          <label class="field"><span>Your message <em class="counter" id="cnt"></em></span>
            <textarea class="input" id="msg" maxlength="160" placeholder="Something sweet…">${esc(draft.message)}</textarea></label>
          <div class="chips" style="margin:-4px 0 16px">${MESSAGES.map((m) => `<button class="chip" type="button" data-msg="${esc(m)}">${esc(m)}</button>`).join('')}</div>
          <div class="field"><span>Card colour</span>
            <div class="swatches">${catalog.themes.map((t) => `<button class="swatch" type="button" data-v="${t}" aria-label="${THEME_LABEL[t] || t}" aria-pressed="${t === draft.theme}"></button>`).join('')}</div>
          </div>
        </div>
      </section>`;

    const stage = $('#stage');
    const refresh = (flip) => {
      const wasFlipped = $('.gcard', stage).classList.contains('is-flip');
      stage.innerHTML = cardHTML(previewGift());
      if (flip || (flip === undefined && wasFlipped)) $('.gcard', stage).classList.add('is-flip');
      mountCard(stage);
      $('#cnt').textContent = `${draft.message.length}/160`;
    };
    mountCard(stage);
    $('#cnt').textContent = `${draft.message.length}/160`;
    $('#to').addEventListener('input', (e) => { draft.recipientName = e.target.value; saveDraft(); refresh(false); validate(); });
    $('#msg').addEventListener('input', (e) => { draft.message = e.target.value; saveDraft(); refresh(true); });
    app.querySelectorAll('[data-msg]').forEach((b) => b.addEventListener('click', () => {
      draft.message = b.dataset.msg; $('#msg').value = draft.message; saveDraft(); refresh(true); haptic(8); sfx.play('tick', 4);
    }));
    app.querySelectorAll('.swatch').forEach((b) => b.addEventListener('click', () => {
      draft.theme = b.dataset.v; saveDraft(); haptic(8); sfx.play('tick', 4);
      app.querySelectorAll('.swatch').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      refresh();
    }));

    const q = quote();
    setDock(`
      <div class="dock__sum"><span>${q.total} ${esc(lineOf().name)} · <b>${rupiah(q.price)}</b></span><button class="linkbtn" type="button" id="back">Edit</button></div>
      <button class="btn" type="button" id="next2">${user ? 'Wrap it up 🎁' : 'Continue with WhatsApp'}</button>`);
    $('#back').onclick = () => go('pick');
    const validate = () => { $('#next2').disabled = !draft.recipientName.trim(); };
    validate();
    $('#next2').onclick = submit;
  }

  async function submit() {
    const btn = $('#next2');
    if (!user) {
      user = await verifyWhatsApp({ title: 'Almost there', lead: 'Verify your WhatsApp so you can track this gift and see when they enjoy it. No password needed.' });
      if (!user) return;
      updateMeBtn();
    }
    btn.classList.add('is-loading');
    try {
      order = await api('create', { line: draft.line, qty: draft.qty, recipientName: draft.recipientName, message: draft.message, theme: draft.theme });
      store.set('lastOrder', order);
      store.set('draft', { line: draft.line, qty: draft.qty, theme: draft.theme });
      draft.recipientName = ''; draft.message = '';
      location.hash = `#sent/${order.gift.code}`;
    } catch (e) {
      btn.classList.remove('is-loading');
      if (e.status === 401) { user = null; submit(); return; }
      toast(e.message);
    }
  }

  /* ---------------- step 3: pay & share ---------------- */

  function shareText(g) {
    const link = `${location.origin}/g/${g.code}`;
    return `🎁 ${g.recipientName}, I sent you a Little Hanniel e-Gift — ${g.unitsTotal} ${g.lineName}! Unwrap it here: ${link}`;
  }

  function viewSent(code) {
    const o = order && order.gift.code === code ? order : store.get('lastOrder');
    if (!o || o.gift.code !== code) { location.hash = '#me'; return; }
    const g = o.gift;
    const p = o.payment;
    const link = `${location.origin}/g/${g.code}`;
    app.innerHTML = `
      <section class="view">
        ${steps(3)}
        <p class="eyebrow">Step 3 of 3 · Send it</p>
        <h1 class="gx-h1">Your gift is wrapped 🎀</h1>
        <p class="gx-lead">Send it to ${esc(g.recipientName)} now. They can unwrap it straight away and start redeeming once your transfer is confirmed.</p>
        <div class="card-stage reveal-card" id="stage">${cardHTML(g)}</div>
        <div class="stack">
          <a class="btn btn--wa" id="share" href="https://wa.me/?text=${encodeURIComponent(shareText(g))}" target="_blank" rel="noopener">Send to ${esc(g.recipientName)} on WhatsApp</a>
          <button class="btn btn--ghost" type="button" id="copyLink">Copy gift link</button>
        </div>
        <div class="panel" style="margin-top:18px">
          <p class="eyebrow">Finish the wrapping</p>
          <h2 class="gx-h2">Transfer ${rupiah(p.amount)}</h2>
          ${p.accountNumber ? `
            <div class="pay__row"><span>Bank</span><b>${esc(p.bank)}</b></div>
            <div class="pay__row"><span>Account name</span><b>${esc(p.accountName)}</b></div>
            <div class="pay__row"><span>Account no.</span><b class="mono">${esc(p.accountNumber)}<button class="copy" type="button" data-copy="${esc(p.accountNumber)}">Copy</button></b></div>
            <div class="pay__row"><span>Amount</span><b>${rupiah(p.amount)}<button class="copy" type="button" data-copy="${p.amount}">Copy</button></b></div>
            <div class="pay__row"><span>Transfer note</span><b class="mono">${esc(p.note)}<button class="copy" type="button" data-copy="${esc(p.note)}">Copy</button></b></div>
            <p class="muted" style="margin:10px 0 0">Put <b>${esc(p.note)}</b> in the transfer note so we can match it. We confirm within a few hours and let you know on WhatsApp.</p>`
          : '<p class="muted">We’ll send payment details to your WhatsApp shortly.</p>'}
        </div>
        <a class="btn btn--ghost" href="#me" style="margin-top:14px">See my gifts</a>
      </section>`;
    mountCard($('#stage'));
    setDock('');
    $('#copyLink').onclick = (e) => copyText(e.currentTarget, link);
    app.querySelectorAll('[data-copy]').forEach((b) => b.addEventListener('click', () => copyText(b, b.dataset.copy)));
    $('#share').addEventListener('click', () => { haptic(10); sfx.play('pop'); });
    if (!store.get(`celebrated:${code}`)) {
      store.set(`celebrated:${code}`, 1);
      setTimeout(() => { confetti({ y: 0.35 }); sfx.play('fanfare'); }, 350);
      haptic([10, 60, 20]);
    }
  }

  /* ---------------- dashboard ---------------- */

  const BADGES = [
    { id: 'first', i: '🎁', t: 'First Gift', d: 'Send your first e-Gift', test: (s) => s.sent.length >= 1 },
    { id: 'bonus', i: '🌟', t: 'Bonus Hunter', d: 'Unlock 2+ free in one gift', test: (s) => s.sent.some((g) => g.unitsBonus >= 2) },
    { id: 'joy', i: '🥳', t: 'Joy Spreader', d: 'Friends enjoy 6 of your treats', test: (s) => s.enjoyed >= 6 },
    { id: 'thanks', i: '💌', t: 'Warm Fuzzies', d: 'Get a thank-you', test: (s) => s.sent.some((g) => g.thanksEmoji) },
    { id: 'generous', i: '💝', t: 'Generous Soul', d: 'Send 3 gifts', test: (s) => s.sent.length >= 3 },
    { id: 'unwrap', i: '📦', t: 'Unwrapped', d: 'Receive a gift', test: (s) => s.received.length >= 1 },
    { id: 'explorer', i: '🧭', t: 'Flavour Explorer', d: 'Try every flavour', test: (s) => s.received.some((g) => g.flavors.every((f) => (g.redemptions || []).some((r) => r.flavor === f))) },
    { id: 'clean', i: '🍽️', t: 'Clean Plate', d: 'Enjoy a whole gift', test: (s) => s.received.some((g) => g.status === 'completed') },
  ];

  function statusPill(g) {
    if (g.status === 'pending_payment') return '<span class="pill pill--wait">Awaiting transfer</span>';
    if (g.status === 'completed') return '<span class="pill pill--done">All enjoyed</span>';
    return g.claimed ? '<span class="pill pill--live">Being enjoyed</span>' : '<span class="pill">Not opened yet</span>';
  }

  function giftItem(g, mine) {
    const pct = g.unitsTotal ? g.unitsRedeemed / g.unitsTotal : 0;
    const title = mine ? `To ${g.recipientName}` : `From ${g.senderName}`;
    return `
      <a class="gitem" href="/g/${g.code}">
        <div class="gitem__ic">${g.emoji}</div>
        <div class="gitem__main">
          <div class="gitem__t">${esc(title)} · ${g.unitsTotal} ${esc(g.lineName)}</div>
          <div class="gitem__s">${statusPill(g)} &nbsp;${g.unitsRedeemed}/${g.unitsTotal} enjoyed</div>
          <div class="bar bar--sage"><i data-w="${pct * 100}"></i></div>
        </div>
        ${g.thanksEmoji ? `<div class="gitem__thx" title="${esc(g.thanksNote || 'Thank you!')}">${g.thanksEmoji}</div>` : ''}
      </a>`;
  }

  async function viewMe() {
    setDock('');
    if (!user) {
      app.innerHTML = `
        <section class="view" style="text-align:center;padding-top:40px">
          <div style="font-size:56px">🎁</div>
          <h1 class="gx-h1">Your gifts live here</h1>
          <p class="gx-lead">Sign in with your WhatsApp number to see gifts you’ve sent and received, your level and your badges.</p>
          <button class="btn btn--wa" type="button" id="signin">Continue with WhatsApp</button>
          <a class="btn btn--ghost" href="#" style="margin-top:10px">Send a gift instead</a>
        </section>`;
      $('#signin').onclick = async () => {
        user = await verifyWhatsApp({ title: 'Welcome back' });
        if (user) { updateMeBtn(); viewMe(); }
      };
      return;
    }
    app.innerHTML = '<p class="muted" style="padding:40px 0;text-align:center">Loading your gifts…</p>';
    let data;
    try { data = await api('me'); } catch (e) {
      if (e.status === 401) { user = null; updateMeBtn(); viewMe(); return; }
      app.innerHTML = `<p class="empty"><i>😕</i>${esc(e.message)}</p>`; return;
    }
    const sent = data.sent;
    const received = data.received;
    const gifted = sent.reduce((a, g) => a + g.unitsTotal, 0);
    const enjoyed = sent.reduce((a, g) => a + g.unitsRedeemed, 0);
    const thanks = sent.filter((g) => g.thanksEmoji).length;
    const lvl = levelFor(gifted);
    const joyPct = gifted ? Math.round((enjoyed / gifted) * 100) : 0;
    const s = { sent, received, enjoyed };
    const seen = store.get('badges') || [];
    const unlocked = BADGES.filter((b) => b.test(s)).map((b) => b.id);
    const fresh = unlocked.filter((id) => !seen.includes(id));
    store.set('badges', unlocked);
    const tab = store.get('tab') === 'received' ? 'received' : 'sent';
    const C = 2 * Math.PI * 52;

    app.innerHTML = `
      <section class="view">
        <p class="eyebrow">Hi ${esc(data.user.name || 'there')} 👋</p>
        <div class="level">
          <div class="level__icon">${lvl.icon}</div>
          <p class="eyebrow">Gifter level ${lvl.index + 1}</p>
          <div class="level__name">${lvl.name}</div>
          <div class="level__sub"><b data-count="${gifted}">0</b> treats gifted so far</div>
          <div class="bar bar--lg"><i data-w="${lvl.pct * 100}"></i></div>
          <div class="level__foot"><span>${lvl.name}</span><span>${lvl.next ? `${lvl.toNext} to ${lvl.next.name} ${lvl.next.icon}` : 'Top level — legend!'}</span></div>
        </div>

        <div class="stats">
          <div class="stat"><b data-count="${sent.length}">0</b><span>gifts sent</span></div>
          <div class="stat"><b data-count="${enjoyed}">0</b><span>treats enjoyed</span></div>
          <div class="stat"><b data-count="${thanks}">0</b><span>thank-yous</span></div>
        </div>

        <div class="panel joy">
          <div class="ring">
            <svg viewBox="0 0 120 120" aria-hidden="true">
              <defs><linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8A9A6B"/><stop offset="1" stop-color="#D4A24C"/></linearGradient></defs>
              <circle class="ring__track" cx="60" cy="60" r="52"/>
              <circle class="ring__val" cx="60" cy="60" r="52" stroke-dasharray="${C}" stroke-dashoffset="${C}" data-off="${C * (1 - joyPct / 100)}"/>
            </svg>
            <div class="ring__txt"><div><b><em data-count="${joyPct}">0</em>%</b><span>joy meter</span></div></div>
          </div>
          <div>
            <h2 class="gx-h2" style="margin-bottom:4px">${gifted ? `${enjoyed} of ${gifted} treats enjoyed` : 'Spread some joy'}</h2>
            <p class="muted" style="margin:0">${gifted ? 'Every time a friend redeems a treat, your meter grows.' : 'Send your first gift and watch your friends enjoy it here.'}</p>
          </div>
        </div>

        <div class="panel">
          <p class="eyebrow">Badges · ${unlocked.length}/${BADGES.length}</p>
          <div class="badges">${BADGES.map((b) => `
            <div class="badge ${unlocked.includes(b.id) ? '' : 'is-locked'} ${fresh.includes(b.id) ? 'is-new' : ''}">
              <div class="badge__i">${b.i}</div><b>${b.t}</b><span>${b.d}</span></div>`).join('')}</div>
        </div>

        <div class="tabs" role="tablist">
          <button role="tab" type="button" data-tab="sent" aria-selected="${tab === 'sent'}">Sent (${sent.length})</button>
          <button role="tab" type="button" data-tab="received" aria-selected="${tab === 'received'}">Received (${received.length})</button>
        </div>
        <ul class="glist" id="list"></ul>

        <a class="btn btn--gold" href="#" style="margin-top:18px">Send another gift 🎁</a>
        <p style="text-align:center;margin-top:18px"><button class="linkbtn" type="button" id="logout">Sign out</button></p>
      </section>`;

    const renderList = (t) => {
      const arr = t === 'sent' ? sent : received;
      $('#list').innerHTML = arr.length
        ? arr.map((g) => giftItem(g, t === 'sent')).join('')
        : `<li class="empty"><i>${t === 'sent' ? '🎀' : '📭'}</i>${t === 'sent' ? 'No gifts sent yet.' : 'No gifts received yet — hint hint 😉'}</li>`;
      requestAnimationFrame(() => app.querySelectorAll('#list [data-w]').forEach((el) => { el.style.width = el.dataset.w + '%'; }));
    };
    renderList(tab);
    app.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => {
      app.querySelectorAll('[data-tab]').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
      store.set('tab', b.dataset.tab); renderList(b.dataset.tab); haptic(6); sfx.play('tick');
    }));
    $('#logout').onclick = async () => { await api('logout', {}).catch(() => {}); user = null; updateMeBtn(); location.hash = ''; };

    // Grow everything in after first paint.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      app.querySelectorAll('.level [data-w]').forEach((el) => { el.style.width = el.dataset.w + '%'; });
      const ring = $('.ring__val'); ring.style.strokeDashoffset = ring.dataset.off;
      app.querySelectorAll('[data-count]').forEach((el) => countUp(el, Number(el.dataset.count), 1100));
    }));
    if (fresh.length && seen.length) { setTimeout(() => { confetti({ y: 0.5 }); sfx.play('unlock'); }, 500); toast(`New badge: ${BADGES.find((b) => b.id === fresh[0]).t}!`); }
  }

  /* ---------------- routing ---------------- */

  function updateMeBtn() {
    const b = $('#meBtn');
    b.textContent = user ? `My gifts · ${user.name || 'me'}` : 'My gifts';
  }

  function go(view) {
    if (view === 'pick') location.hash = '';
    else location.hash = '#' + view;
  }

  function route() {
    window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
    const h = location.hash.replace(/^#/, '');
    if (h === 'me') return viewMe();
    if (h === 'personal') return viewPersonal();
    if (h.startsWith('sent/')) return viewSent(h.slice(5));
    return viewPick();
  }

  async function boot() {
    try {
      catalog = await api('catalog');
    } catch (e) {
      app.innerHTML = `<p class="empty"><i>😕</i>${esc(e.message)}</p>`; return;
    }
    if (!catalog.lines.some((l) => l.id === draft.line)) draft.line = catalog.lines[0].id;
    try { const r = await api('me'); user = r.user; } catch (e) { user = null; }
    updateMeBtn();
    const params = new URLSearchParams(location.search);
    if (params.get('line') && catalog.lines.some((l) => l.id === params.get('line'))) draft.line = params.get('line');
    window.addEventListener('hashchange', route);
    route();
  }

  boot();
})();
