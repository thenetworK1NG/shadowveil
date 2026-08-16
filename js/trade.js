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
let myGive = null;              // name of the card I'm giving away
let theirGive = null;           // name of the card my buddy is giving me
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
function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 5; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return TRADE_PREFIX + s;
}
function fbInit() {
  if (fbDb) return true;
  if (!window.firebase) { flash('Trading needs internet — the Firebase library did not load.'); return false; }
  firebase.initializeApp({
    apiKey: 'AIzaSyB7KNURIlPW2S2J_aJdoX3c4L6BR5gma0g',
    authDomain: 'secu-18771.firebaseapp.com',
    databaseURL: 'https://secu-18771-default-rtdb.firebaseio.com',
    projectId: 'secu-18771',
    storageBucket: 'secu-18771.firebasestorage.app',
    messagingSenderId: '119665330735',
    appId: '1:119665330735:web:52bdea3a4a8aac362114da',
    measurementId: 'G-GJMJJT9636',
  });
  fbDb = firebase.database();
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
    const mine = isHost ? r.host : r.guest;
    const theirs = isHost ? r.guest : r.host;
    if (r.status === 'done') {
      if (!theirGive && theirs) theirGive = theirs.name;
      if (myGive && theirGive) finalize();
      return;
    }
    if (theirs && theirs.name && theirGive !== theirs.name) {
      theirGive = theirs.name;
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
  left.appendChild(buildCard({ ...findPlayer(myGive) }, 'p-card', true));
  const arrow = el('div', 'trade-arrow', '⇄');
  const right = document.createElement('div');
  right.appendChild(el('p', 'trade-side', 'You receive'));
  right.appendChild(buildCard({ ...findPlayer(theirGive) }, 'p-card', true));
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
      const card = buildCard({ ...p, rec: o }, 'p-card', true);
      card.addEventListener('click', () => { if (!tradeBusy) { myGive = p.name; createRoom(); } });
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
  tradeRef.set({ host: { name: myGive, confirm: false }, status: 'open', ts: Date.now() })
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
  offer.innerHTML = `Send this code to your friend — they enter it, pick their card, and you both confirm. You're giving <b>${findPlayer(myGive).name}</b>`;
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
    recv.innerHTML = `You're receiving <b>${findPlayer(theirGive).name}</b> — pick the card you'll give in return`;
    box.appendChild(recv);
    if (state.owned.length === 0) {
      box.appendChild(el('p', 'trade-offer-line', 'Your hoard is empty — open a pack first.'));
      return;
    }
    const picker = document.createElement('div');
    picker.className = 'picker';
    state.owned.forEach(o => {
      const p = findPlayer(o.name);
      if (!p) return;
      const card = buildCard({ ...p, rec: o }, 'p-card', true);
      card.addEventListener('click', () => {
        if (tradeBusy) return;
        myGive = p.name;
        tradeBusy = true;
        tradeRef.child('guest').set({ name: myGive, confirm: false })
          .then(() => { tradeBusy = false; tradeStep = 3; renderTrade(); })
          .catch(() => { tradeBusy = false; flash('Could not reach the trade server.'); });
      });
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
    theirGive = r.host.name;
    tradeStep = 2;
    tradeBusy = false;
    renderTrade();
    watchRoom();
  }).catch(() => { tradeBusy = false; flash('Could not reach the trade server.'); });
}

function finalize() {
  if (done) return;
  done = true;
  const theirCard = findPlayer(theirGive);
  if (!theirCard || !state.owned.some(x => x.name === myGive)) {
    flash('The cards did not line up — trade cancelled.');
    stopWatching();
    freshTrade(tradeMode);
    return;
  }
  const gaveCard = findPlayer(myGive);
  applySwap(myGive, theirCard);
  saveState(); renderCollection(); updateWallet();
  const ref = tradeRef;
  if (ref) {
    ref.child('status').set('done').catch(() => {});
    setTimeout(() => ref.remove().catch(() => {}), 2000);
  }
  stopWatching();
  showTradeDone(gaveCard, theirCard);
}

function showTradeDone(gave, got) {
  tradeBody.innerHTML = '';
  const doneEl = document.createElement('div');
  doneEl.className = 'trade-wait';
  doneEl.appendChild(el('p', 'trade-done-title', 'Trade complete'));
  const cards = document.createElement('div');
  cards.className = 'trade-review-cards';
  const gotBox = document.createElement('div');
  gotBox.appendChild(el('p', 'trade-side', 'You received'));
  gotBox.appendChild(buildCard({ ...got }, 'p-card', true));
  const gaveBox = document.createElement('div');
  gaveBox.appendChild(el('p', 'trade-side', 'You gave'));
  gaveBox.appendChild(buildCard({ ...gave }, 'p-card', true));
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

function applySwap(giveName, getCard) {
  state.owned = state.owned.filter(x => x.name !== giveName);
  if (!state.owned.some(x => x.name === getCard.name)) {
    state.owned.push({ name: getCard.name, wins: 0, losses: 0, streak: 0 });
  }
}

