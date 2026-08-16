const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const packZone = $('#packZone'), pack = $('#pack'), hint = $('#hint');
const fan = $('#fan'), actions = $('#actions'), collection = $('#collection');

let dealing = false;
let dealt = [];

/* ---- persistent collection ---- */
const SAVE_KEY = 'shadowveil-state';
const DEFAULT_STATS = { battles: 0, wins: 0, losses: 0, won: 0, lost: 0, streak: 0 };
/* New players start with one of each role already bound, so you can
   jump straight into a trade with a friend — no pack-grinding first. */
const STARTERS = ['Frost, Hoarfrost Golem', 'Bahar, Jade Oracle', 'Aria, Moonlit Sylph'];
let state = { owned: STARTERS.map(n => ({ name: n, wins: 0, losses: 0, streak: 0 })), coins: 500, stats: { ...DEFAULT_STATS } };
try {
  const raw = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
  if (raw) {
    state = {
      owned: Array.isArray(raw.owned) ? raw.owned : [],
      coins: typeof raw.coins === 'number' ? raw.coins : 500,
      stats: Object.assign({ ...DEFAULT_STATS }, raw.stats || {}),
    };
  }
} catch (e) {}
function saveState() { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); }

/* ============================================================
   ECONOMY — coin values, pack costs, buying & selling
   ============================================================ */
const PACK_COST = 100;
const RARITY_BASE = { bronze: 15, silver: 35, gold: 80, diamond: 180 };

/* Card worth = rarity base scaled by stats, then driven by the battle
   ledger — every win stacks on 35% of value, every loss costs 20%.
   An unplayed card is a cheap base; a proven winner is the prize. */
function cardValue(p, rec) {
  const o = rec || (state.owned.find(x => x.name === p.name) || null);
  const base = RARITY_BASE[p.rarity] * (0.6 + ovr(p) / 100);
  let recMod = 1;
  if (o && (o.wins + o.losses) > 0) {
    recMod += Math.min(2.5, o.wins * 0.35);
    recMod -= Math.min(1.5, o.losses * 0.20);
    recMod = Math.max(0.35, recMod);
  }
  return Math.round(base * recMod);
}

/* A gold coin rendered in pure CSS — no emoji fonts required. */
const coin = () => '<span class="coin-ico"></span>';
function updateWallet() {
  $('#wallet').textContent = state.coins;
}
let flashTimer = null;
function flash(msg) {
  const f = $('#flash');
  f.innerHTML = msg;
  f.classList.add('show');
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => f.classList.remove('show'), 2200);
}
function refreshPackHint() {
  hint.innerHTML = state.coins >= PACK_COST
    ? `Tap the pack to open it — ${coin()}${PACK_COST} coins`
    : `Not enough coins — sell a card or win a battle`;
}
function sellCard(name) {
  const o = state.owned.find(x => x.name === name);
  const p = findPlayer(name);
  if (!o || !p) return;
  pendingSell = { p, o };
  const val = cardValue(p, o);
  $('#confirmCard').innerHTML = '';
  $('#confirmCard').appendChild(buildCard({ ...p, rec: o }, '', true));
  $('#confirmText').innerHTML = `Sell <b>${p.name}</b> to the market for <span class="coin-big">${coin()}${val}</span>?`;
  confirmBox.classList.remove('hidden');
}
function confirmSale() {
  if (!pendingSell) return;
  const { p, o } = pendingSell;
  const val = cardValue(p, o);
  state.coins += val;
  state.owned = state.owned.filter(x => x.name !== p.name);
  saveState();
  updateWallet();
  renderCollection();
  refreshPackHint();
  confirmBox.classList.add('hidden');
  pendingSell = null;
  flash(`${p.name} sold — ${coin()}${val} added to your hoard`);
}
function cancelSale() {
  confirmBox.classList.add('hidden');
  pendingSell = null;
}

/* The crown jewel — the most valuable card in the whole collection.
   Defeat in the arena hands it to the enemy, so losses bite for real. */
function crownJewel() {
  let best = null;
  state.owned.forEach(o => {
    const p = findPlayer(o.name);
    if (!p) return;
    const v = cardValue(p, o);
    if (!best || v > best.v) best = { p, o, v };
  });
  return best;
}
function findPlayer(name) { return PLAYERS.find(p => p.name === name); }
function ovr(p) { return Math.round((p.power + p.cunning + p.arcana) / 3); }
function recordLine(p) {
  const o = state.owned.find(x => x.name === p.name);
  if (!o) return `<span class="series">Veil I</span>`;
  const fire = o.streak > 1 ? ` 🔥<b>${o.streak}</b>` : '';
  return `<span class="rec">W<b>${o.wins}</b> L<b>${o.losses}</b>${fire}</span>`;
}
function renderCollection() {
  collection.innerHTML = '';
  const jewel = crownJewel();
  state.owned.forEach((o, i) => {
    const p = findPlayer(o.name);
    if (!p) return;
    const wrap = document.createElement('div');
    wrap.className = 'collect-wrap' + (jewel && jewel.p.name === p.name ? ' jewel-card' : '');
    const card = buildCard({ ...p, rec: o }, 'collect-card');
    card.style.setProperty('--d', ((i % 8) * .07) + 's');
    const val = cardValue(p, o);
    const sell = document.createElement('button');
    sell.className = 'sell-btn';
    sell.innerHTML = `Sell · ${coin()}<span class="coin">${val}</span>`;
    sell.addEventListener('click', () => sellCard(p.name));
    wrap.appendChild(card);
    wrap.appendChild(sell);
    collection.appendChild(wrap);
  });
  $('#count').textContent = state.owned.length + ' creatures bound';
  const jl = $('#jewelLine');
  if (jewel) {
    jl.innerHTML = `Crown Jewel · <b>${jewel.p.name}</b> · ${jewel.o.wins}W ${jewel.o.losses}L · ${coin()}${jewel.v}`;
    jl.classList.remove('hidden');
  } else {
    jl.classList.add('hidden');
  }
}

function pickCard() {
  const r = Math.random() * 100;
  let acc = 0, rarity = 'bronze';
  for (const key of RANK) { acc += RARITY[key].weight; if (r < acc) { rarity = key; break; } }
  const pool = PLAYERS.filter(p => p.rarity === rarity);
  return pool[Math.floor(Math.random() * pool.length)];
}

/* --- photo fallback: if an image fails to load, drop it and show the neutral backdrop --- */
function silFallback(imgEl) {
  const photo = imgEl.closest('.photo');
  if (photo) photo.classList.add('nophoto');
  imgEl.remove();
}

function cardBack() {
  return `<div class="face card-back">
    <div class="b-crest">🐉</div>
    <div class="b-label">Shadowveil</div>
    <div class="b-sub">Veil Series</div>
  </div>`;
}

function cardFront(p) {
  const rarity = RARITY[p.rarity];
  const ovr = Math.round((p.power + p.cunning + p.arcana) / 3);
  const stars = '★'.repeat(RANK.indexOf(p.rarity) + 1);
  const art = p.img
    ? `<img src="${p.img}" alt="${p.name}" data-name="${p.name}" onerror="silFallback(this)">`
    : '';
  const chip = (label, val) => `<div class="chip"><span>${label}</span><b>${val}</b><i><em data-v="${val}"></em></i></div>`;
  return `<div class="face tcard rare-${p.rarity}" style="--rar:${rarity.color}">
    <div class="card-top">
      <span class="team">${p.realm}</span>
      <span class="rarity-tag">${RARITY_LABEL[p.rarity]}</span>
    </div>
    <div class="photo${p.img ? '' : ' nophoto'}">
      <div class="energy"></div>
      <div class="lines"></div>
      ${art}
      <div class="ovr-badge">OVR<b>${ovr}</b></div>
    </div>
    <div class="plate">
      <div class="nm"><h3>${p.name}</h3><span class="stars">${stars}</span></div>
      <div class="role"><b>${p.role}</b><span>${p.realm}</span></div>
    </div>
    <div class="stat-panel">
      ${chip('Power', p.power)}
      ${chip('Cunning', p.cunning)}
      ${chip('Arcana', p.arcana)}
    </div>
    <div class="card-foot">
      <span class="serial">#${String(PLAYERS.indexOf(p) + 1).padStart(3, '0')}</span>
      ${recordLine(p)}
      <span class="value">${coin()}${cardValue(p)}</span>
    </div>
    <div class="frame"></div>
  </div>`;
}

function buildCard(p, cls = '', noFlip = false) {
  const div = document.createElement('div');
  div.className = 'flip ' + cls;
  div.innerHTML = `<div class="flip-inner">${cardFront(p)}${cardBack()}</div>`;
  if (!noFlip) div.addEventListener('click', () => div.querySelector('.flip-inner').classList.toggle('flipped'));
  return div;
}
