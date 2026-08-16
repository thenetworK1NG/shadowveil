/* ============================================================
   CARD TRADE — a straight-forward two-way swap, synced live
   through Firebase. You pick a card, your friend joins your
   room code and picks theirs, then you BOTH confirm.
   ============================================================ */
const TRADE_PREFIX = 'SV';
const TRADE_ITEM = 'creature';
const tradeBody = $('#tradeBody');
let tradeMode = 'offer';        // 'offer' | 'join'
let tradeStep = 1;              // 1 pick · 2 connect · 3 confirm
let myGive = null;              // instance snapshot { id, name, serial, grade, graded } I'm giving away
let theirGive = null;           // instance snapshot my buddy is giving me
let tradeCode = null;
let tradeRef = null;            // live firebase ref for the trade room
let tradeBusy = false;
let accepted = false;           // I already hit Confirm
let done = false;               // trade finalised
let fbDb = null;

function el(tag, cls, text) {
  const d = document.createElement(tag);
  if (cls) d.className = cls;
  if (text !== undefined) d.textContent = text;
  return d;
}
/* A tradeable snapshot of an owned instance — serial + grade + the
   1st Edition stamp travel with the card, so a #0002 GEM MT 10 stays
   special after the swap. */
function snapInstance(o) {
  return { id: o.id, name: o.name, serial: o.serial, grade: o.grade, graded: !!o.graded, firstEd: !!o.firstEd };
}
function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 5; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return TRADE_PREFIX + s;
}
function fbInit() {
  if (fbDb) return true;
  if (!window.firebase) { flash('Trading needs internet — the Firebase library did not load.'); return false; }
  const db = svDb();
  if (!db) return false;
  fbDb = db;
  return true;
}
function roomPath(code) { return 'shadowveil/trades/' + code; }

/* ---- live room sync ---- */
function watchRoom() {
  if (!tradeRef) return;
  tradeRef.off('value');
  tradeRef.on('value', snap => {
    if (done) return;
    const r = snap.val();
    if (!r || r.status === 'cancelled') {
      if (tradeStep > 1) flash(r && r.status === 'cancelled' ? 'Your buddy cancelled the trade.' : 'The trade room was closed.');
      stopWatching();
      freshTrade(tradeMode);
      return;
    }
    const isHost = tradeMode === 'offer';
    const theirs = isHost ? r.guest : r.host;
    if (r.status === 'done') {
      if (!theirGive && theirs) theirGive = theirs;
      if (myGive && theirGive) finalize();
      return;
    }
    if (theirs && theirs.name && myGive && theirs.name === myGive.name) {
      flash('That card is already on the table — you can\'t trade the same card back and forth.');
      stopWatching();
      freshTrade(tradeMode);
      return;
    }
    if (theirs && theirs.name && (!theirGive || theirGive.id !== theirs.id)) {
      theirGive = theirs;
      if (tradeStep === 2) { tradeStep = 3; tradeBusy = false; renderTrade(); }
    }
    if (theirs && theirs.confirm && myGive && theirGive) {
      if (accepted) finalize();
      else flash('Your buddy has confirmed — confirm to complete the trade.');
    }
  });
}
function stopWatching() {
  if (tradeRef) { tradeRef.off('value'); tradeRef = null; }
}
function cancelTrade() {
  const ref = tradeRef;
  if (ref && tradeStep > 1) {
    ref.set({ status: 'cancelled', ts: Date.now() })
      .then(() => setTimeout(() => ref.remove().catch(() => {}), 1500))
      .catch(() => {});
  }
}
function tradeCleanup() {
  stopWatching();
}
function freshTrade(mode) {
  tradeCleanup();
  tradeMode = mode;
  tradeStep = 1;
  myGive = null; theirGive = null;
  tradeCode = null; tradeBusy = false; accepted = false; done = false;
  renderTrade();
}
function openTrade() { freshTrade('offer'); }

/* ---- shared trade UI ---- */
function stepChips() {
  const steps = tradeMode === 'offer'
    ? ['Pick your card', 'Share your code', 'Confirm the swap']
    : ['Join the code', 'Pick your card', 'Confirm the swap'];
  const row = document.createElement('div');
  row.className = 'trade-steps';
  steps.forEach((s, i) => {
    const c = document.createElement('span');
    c.className = 'trade-step' + (i + 1 === tradeStep ? ' on' : '') + (i + 1 < tradeStep ? ' done' : '');
    c.innerHTML = (i + 1 < tradeStep ? '✓ ' : '') + (i + 1) + '. ' + s;
    row.appendChild(c);
  });
  return row;
}
function swapPreview() {
  const wrap = document.createElement('div');
  wrap.className = 'trade-swap';
  const left = document.createElement('div');
  left.appendChild(el('p', 'trade-side', 'You give'));
  left.appendChild(buildCard({ ...findPlayer(myGive.name), rec: myGive }, 'p-card', true));
  const lv = el('p', 'trade-val');
  lv.innerHTML = `${coin()}${cardValue(findPlayer(myGive.name), myGive)}`;
  left.appendChild(lv);
  const arrow = el('div', 'trade-arrow', '⇄');
  const right = document.createElement('div');
  right.appendChild(el('p', 'trade-side', 'You receive'));
  right.appendChild(buildCard({ ...findPlayer(theirGive.name), rec: theirGive }, 'p-card', true));
  const rv = el('p', 'trade-val');
  rv.innerHTML = `${coin()}${cardValue(findPlayer(theirGive.name), theirGive)}`;
  right.appendChild(rv);
  wrap.appendChild(left);
  wrap.appendChild(arrow);
  wrap.appendChild(right);
  return wrap;
}
function renderTrade() {
  tradeBody.innerHTML = '';
  const tabs = document.createElement('div');
  tabs.className = 'trade-tabs';
  tabs.innerHTML = `
    <button class="trade-tab ${tradeMode === 'offer' ? 'active' : ''}" id="tabOffer">Start a Trade</button>
    <button class="trade-tab ${tradeMode === 'join' ? 'active' : ''}" id="tabJoin">Join a Trade</button>`;
  tradeBody.appendChild(tabs);
  if (tradeMode === 'offer') renderOffer(tradeBody);
  else renderJoin(tradeBody);
  $('#tabOffer').addEventListener('click', () => { if (!tradeBusy) { cancelTrade(); freshTrade('offer'); } });
  $('#tabJoin').addEventListener('click', () => { if (!tradeBusy) { cancelTrade(); freshTrade('join'); } });
}

/* ---- offer side ---- */
function renderOffer(box) {
  box.appendChild(stepChips());
  if (tradeStep === 1) {
    box.appendChild(el('p', 'pick-hint', 'Pick the card you want to give away'));
    if (state.owned.length === 0) {
      box.appendChild(el('p', 'trade-offer-line', 'Your hoard is empty — open a pack first.'));
      return;
    }
    const picker = document.createElement('div');
    picker.className = 'picker';
    state.owned.forEach(o => {
      const p = findPlayer(o.name);
      if (!p) return;
      const card = buildCard({ ...effPlayer(p, o), rec: o }, 'p-card', true);
      card.addEventListener('click', () => {
        if (tradeBusy) return;
        if (o.grading) { flash('That card is in the grading lab right now.'); return; }
        myGive = snapInstance(o);
        createRoom();
      });
      picker.appendChild(card);
    });
    box.appendChild(picker);
  } else if (tradeStep === 2) {
    renderWaiting(box);
  } else {
    renderConfirm(box);
  }
}

function createRoom() {
  if (!fbInit()) return;
  tradeBusy = true;
  tradeCode = genCode();
  tradeRef = fbDb.ref(roomPath(tradeCode));
  tradeRef.set({ host: { ...myGive, confirm: false }, status: 'open', ts: Date.now() })
    .then(() => {
      sweepRooms();
      tradeBusy = false; tradeStep = 2;
      renderTrade();
      watchRoom();
    })
    .catch(() => { flash('Could not reach the trade server.'); tradeBusy = false; });
}
function sweepRooms() {
  if (!fbDb) return;
  const now = Date.now();
  fbDb.ref('shadowveil/trades').once('value')
    .then(snap => snap.forEach(child => {
      const v = child.val();
      if (!v || (v.ts && now - v.ts > 3600000)) child.ref.remove().catch(() => {});
    }))
    .catch(() => {});
}

function renderWaiting(box) {
  const wait = document.createElement('div');
  wait.className = 'trade-wait';
  wait.appendChild(el('p', 'pick-hint', 'Waiting for your friend to join…'));
  wait.appendChild(el('p', 'trade-code', tradeCode));
  const offer = document.createElement('p');
  offer.className = 'trade-offer-line';
  offer.innerHTML = `Send this code to your friend — they enter it, pick their card, and you both confirm. You're giving <b>${findPlayer(myGive.name).name}</b> <span class="serial hot">#${String(myGive.serial).padStart(4, '0')}</span>`;
  wait.appendChild(offer);
  const acts = document.createElement('div');
  acts.className = 'actions';
  acts.style.marginTop = '16px';
  acts.innerHTML = `<button id="tradeCancel">Cancel Trade</button>`;
  wait.appendChild(acts);
  box.appendChild(wait);
  $('#tradeCancel').addEventListener('click', () => { cancelTrade(); freshTrade('offer'); });
}

function renderConfirm(box) {
  box.appendChild(el('p', 'pick-hint', 'Review the swap — confirm to make it official'));
  box.appendChild(swapPreview());
  const acts = document.createElement('div');
  acts.className = 'actions';
  acts.style.marginTop = '16px';
  acts.innerHTML = accepted
    ? `<button disabled>Waiting for your friend to confirm…</button>`
    : `<button class="primary" id="tradeAccept">Confirm Trade</button><button id="tradeDecline">Cancel</button>`;
  box.appendChild(acts);
  if (!accepted) {
    $('#tradeAccept').addEventListener('click', () => {
      accepted = true; tradeBusy = true;
      const isHost = tradeMode === 'offer';
      tradeRef.child(isHost ? 'host' : 'guest').update({ confirm: true })
        .then(() => { tradeBusy = false; renderTrade(); })
        .catch(() => { accepted = false; tradeBusy = false; flash('Could not reach the trade server.'); });
    });
    $('#tradeDecline').addEventListener('click', () => { cancelTrade(); freshTrade(tradeMode); });
  }
}

/* ---- join side ---- */
function renderJoin(box) {
  box.appendChild(stepChips());
  if (tradeStep === 1) {
    const wrap = document.createElement('div');
    wrap.className = 'trade-join';
    wrap.appendChild(el('p', 'pick-hint', 'Enter your friend\'s trade code'));
    const input = document.createElement('input');
    input.id = 'tradeCodeInput';
    input.className = 'trade-input';
    input.maxLength = 10;
    input.placeholder = 'e.g. ' + genCode();
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.addEventListener('keydown', e => { if (e.key === 'Enter') joinRoom(); });
    wrap.appendChild(input);
    const acts = document.createElement('div');
    acts.className = 'actions';
    acts.style.marginTop = '14px';
    acts.innerHTML = `<button class="primary" id="tradeJoinBtn">Join Trade</button>`;
    wrap.appendChild(acts);
    wrap.appendChild(el('p', 'trade-join-status', ''));
    box.appendChild(wrap);
    $('#tradeJoinBtn').addEventListener('click', joinRoom);
  } else if (tradeStep === 2) {
    const recv = document.createElement('p');
    recv.className = 'pick-hint';
    recv.innerHTML = `You're receiving <b>${findPlayer(theirGive.name).name}</b> <span class="serial hot">#${String(theirGive.serial).padStart(4, '0')}</span> — pick the card you'll give in return`;
    box.appendChild(recv);
    if (state.owned.length === 0) {
      box.appendChild(el('p', 'trade-offer-line', 'Your hoard is empty — open a pack first.'));
      return;
    }
    if (state.owned.some(o => o.name === theirGive.name)) {
      box.appendChild(el('p', 'trade-warn', "You already own a copy of the card being offered — you can't trade the same card back and forth."));
    }
    const picker = document.createElement('div');
    picker.className = 'picker';
    state.owned.forEach(o => {
      const p = findPlayer(o.name);
      if (!p) return;
      const card = buildCard({ ...effPlayer(p, o), rec: o }, 'p-card', true);
      if (p.name === theirGive.name) {
        card.classList.add('blocked');
        const tag = document.createElement('span');
        tag.className = 'block-tag';
        tag.textContent = 'Same Card';
        card.appendChild(tag);
        card.addEventListener('click', () => flash('You can\'t trade the same card back — pick a different one.'));
      } else {
        card.addEventListener('click', () => {
          if (tradeBusy) return;
          if (o.grading) { flash('That card is in the grading lab right now.'); return; }
          myGive = snapInstance(o);
          tradeBusy = true;
          tradeRef.child('guest').set({ ...myGive, confirm: false })
            .then(() => { tradeBusy = false; tradeStep = 3; renderTrade(); })
            .catch(() => { tradeBusy = false; flash('Could not reach the trade server.'); });
        });
      }
      picker.appendChild(card);
    });
    box.appendChild(picker);
    const acts = document.createElement('div');
    acts.className = 'actions';
    acts.style.marginTop = '16px';
    acts.innerHTML = `<button id="tradeBackJoin">← Back</button>`;
    box.appendChild(acts);
    $('#tradeBackJoin').addEventListener('click', () => { cancelTrade(); freshTrade('join'); });
  } else {
    renderConfirm(box);
  }
}

function joinRoom() {
  if (tradeBusy) return;
  if (!fbInit()) return;
  const input = $('#tradeCodeInput');
  const code = (input ? input.value : '').trim().toUpperCase();
  if (!code) { flash('Enter the trade code first.'); return; }
  tradeBusy = true;
  const status = $('#tradeJoinStatus');
  if (status) status.textContent = 'Looking for that trade…';
  const ref = fbDb.ref(roomPath(code));
  ref.once('value', snap => {
    const r = snap.val();
    if (!r || !r.host || r.status !== 'open') {
      flash('No open trade found with that code.');
      tradeBusy = false;
      if (status) status.textContent = '';
      return;
    }
    if (r.guest && r.guest.name) {
      flash('That trade already has a partner.');
      tradeBusy = false;
      if (status) status.textContent = '';
      return;
    }
    tradeRef = ref;
    tradeCode = code;
    theirGive = r.host;
    tradeStep = 2;
    tradeBusy = false;
    renderTrade();
    watchRoom();
  }).catch(() => { tradeBusy = false; flash('Could not reach the trade server.'); });
}

function finalize() {
  if (done) return;
  if (!myGive || !theirGive || myGive.name === theirGive.name) {
    flash('You can\'t trade a card for itself — pick a different card.');
    stopWatching();
    freshTrade(tradeMode);
    return;
  }
  done = true;
  const theirCard = findPlayer(theirGive.name);
  if (!theirCard || !state.owned.some(x => x.id === myGive.id)) {
    flash('The cards did not line up — trade cancelled.');
    stopWatching();
    freshTrade(tradeMode);
    return;
  }
  const gaveCard = findPlayer(myGive.name);
  applySwap(myGive, theirGive);
  saveState(); renderCollection(); updateWallet();
  const ref = tradeRef;
  if (ref) {
    ref.child('status').set('done').catch(() => {});
    setTimeout(() => ref.remove().catch(() => {}), 2000);
  }
  stopWatching();
  showTradeDone(gaveCard, theirCard, myGive, theirGive);
}

function showTradeDone(gave, got, gaveRec, gotRec) {
  tradeBody.innerHTML = '';
  const doneEl = document.createElement('div');
  doneEl.className = 'trade-wait';
  doneEl.appendChild(el('p', 'trade-done-title', 'Trade complete'));
  const cards = document.createElement('div');
  cards.className = 'trade-review-cards';
  const gotBox = document.createElement('div');
  gotBox.appendChild(el('p', 'trade-side', 'You received'));
  gotBox.appendChild(buildCard({ ...got, rec: gotRec }, 'p-card', true));
  const gaveBox = document.createElement('div');
  gaveBox.appendChild(el('p', 'trade-side', 'You gave'));
  gaveBox.appendChild(buildCard({ ...gave, rec: gaveRec }, 'p-card', true));
  cards.appendChild(gotBox);
  cards.appendChild(gaveBox);
  doneEl.appendChild(cards);
  const btn = document.createElement('button');
  btn.className = 'primary';
  btn.id = 'tradeDoneBtn';
  btn.textContent = 'Done';
  doneEl.appendChild(btn);
  tradeBody.appendChild(doneEl);
  $('#tradeDoneBtn').addEventListener('click', () => openTrade());
}

function applySwap(give, get) {
  state.owned = state.owned.filter(x => x.id !== give.id);
  const received = makeInstance(get.name, { serial: get.serial, grade: get.grade, graded: get.graded, firstEd: get.firstEd });
  // claim the incoming serial locally so we never re-mint it ourselves
  const arr = state.serialBase[get.name] = Array.isArray(state.serialBase[get.name]) ? state.serialBase[get.name] : [];
  if (typeof get.serial === 'number' && !arr.includes(get.serial)) { arr.push(get.serial); syncSerials(get.name, arr); }
  state.owned.push(received);
}

