const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const packZone = $('#packZone'), pack = $('#pack'), hint = $('#hint');
const fan = $('#fan'), actions = $('#actions'), collection = $('#collection');

let dealing = false;
let dealt = [];

let currentUser = null; // set by auth.js once signed in

/* ---- persistent collection ---- */
const SAVE_KEY = 'shadowveil-state';
const DEFAULT_STATS = { battles: 0, wins: 0, losses: 0, won: 0, lost: 0, streak: 0 };
const STARTING_COINS = 100;
const LEVEL_STEP = 4;
const XP_PER_WIN = 100;
const XP_PER_LOSS = 50;
const XP_LEVEL_BASE = 250;
const XP_LEVEL_STEP = 100;
const MAX_CARD_LEVEL = 15;
const EVOLUTION_PHASES = {
  base: { key: 'base', label: 'Base Evolution', short: 'BASE', min: 1, max: 4 },
  second: { key: 'second', label: 'Second Evolution', short: 'EVOLVED', min: 5, max: 9 },
  god: { key: 'god', label: 'God Tier Evolution', short: 'GOD TIER', min: 10, max: 15 },
};
function evolutionForLevel(level) {
  const lv = Math.max(1, Math.min(MAX_CARD_LEVEL, Math.floor(Number(level) || 1)));
  const phase = lv >= 10 ? EVOLUTION_PHASES.god : lv >= 5 ? EVOLUTION_PHASES.second : EVOLUTION_PHASES.base;
  return { ...phase, level: lv, capped: phase.key === 'god' && lv >= MAX_CARD_LEVEL };
}
/* New players start with a four-card reserve so the first battle can use
   the complete evolution-ready lineup without loan cards. */
const STARTERS = ['Frost, Hoarfrost Golem', 'Bahar, Jade Oracle', 'Aria, Moonlit Sylph', 'Wren, Twilight Sprite'];

/* ---- card instances ----
   Every creature you own is a unique instance: it carries its own
   serial number and, once graded, its own condition grade. Serials
   are a totally random lottery out of 0001–1000 per creature, and
   the used pool is synced to Firebase so two collectors never share
   the same number. A scarce few cards are stamped 1st Edition. */
function genId() { return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8); }
/* Draw a random unused serial for a creature and mark it used. The
   per-creature pool is tracked as an array of used numbers. */
function mintSerial(name) {
  const cur = state.serialBase[name];
  let used;
  if (typeof cur === 'number') { // legacy count watermark → claimed serials
    used = state.serialBase[name] = Array.from({ length: cur }, (_, i) => i + 1);
  } else if (Array.isArray(cur)) {
    used = cur;
  } else {
    used = state.serialBase[name] = [];
  }
  let s = 1 + Math.floor(Math.random() * MAX_SERIAL);
  let tries = 0;
  while (used.includes(s) && tries < 40) { s = 1 + Math.floor(Math.random() * MAX_SERIAL); tries++; }
  if (used.includes(s)) { // pool nearly sold out — grab the smallest free number
    s = 1;
    while (used.includes(s) && s <= MAX_SERIAL) s++;
  }
  used.push(s);
  syncSerials(name, used);
  return s;
}
/* Push the used serial pool for a creature up to Firebase (union
   merge, so every minted number is claimed exactly once). */
function syncSerials(name, used) {
  if (typeof currentUser !== 'undefined' && currentUser) {
    const db = svDb();
    if (db) {
      const key = name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
      const out = {};
      used.forEach(x => { out[x] = true; });
      db.ref('shadowveil/serials/' + key)
        .transaction(cur => {
          const merged = {};
          if (cur && typeof cur === 'object') Object.keys(cur).forEach(k => { if (cur[k]) merged[k] = true; });
          Object.keys(out).forEach(k => { merged[k] = true; });
          return merged;
        }).catch(() => {});
    }
  }
}
function makeInstance(name, extra) {
  extra = extra || {};
  const serial = extra.serial || mintSerial(name);
  const base = findPlayer(name);
  const rarity = extra.rarity || randomRarity();
  const o = {
    id: genId(),
    name,
    serial,
    firstEd: isFirstEdition(serial),
    grade: extra.grade != null ? extra.grade : null,
    graded: !!extra.graded,
    grading: null,
    wins: 0, losses: 0, streak: 0, level: 1, xp: 0, favorite: false, sleeved: !!extra.sleeved, rarity, rarityCode: extra.rarityCode || mintRarityCode(rarity), stats: normalizeCardStats(base, extra.stats), element: extra.element || randomElement(),
  };
  Object.keys(extra).forEach(k => { if (extra[k] !== undefined) o[k] = extra[k]; });
  return o;
}
/* A card only counts as 1st Edition when its serial falls in the
   first print run — #0001 through #0010. Anything above that is a
   regular print, regardless of how rare it looks. */
function isFirstEdition(serial) { return serial >= 1 && serial <= 10; }
/* Low serials are the bragging rights — the first copies ever bound
   are worth a premium on top of the grade. */
function serialBonus(n) {
  if (n <= 1) return 1.6;
  if (n <= 5) return 1.35;
  if (n <= 10) return 1.2;
  if (n <= 25) return 1.1;
  if (n <= 50) return 1.05;
  return 1;
}
function randomCardStats(base) {
  if (!base) return { power: 1, cunning: 1, arcana: 1 };
  const roll = value => Math.max(1, Math.min(100, Math.round(Number(value || 1) + (Math.random() * 20 - 10))));
  return { power: roll(base.power), cunning: roll(base.cunning), arcana: roll(base.arcana) };
}
function randomRarity() {
  const total = RANK.reduce((sum, rarity) => sum + (RARITY[rarity].weight || 0), 0);
  let roll = Math.random() * total;
  for (const rarity of RANK) {
    roll -= RARITY[rarity].weight || 0;
    if (roll < 0) return rarity;
  }
  return RANK[0];
}
function mintRarityCode(rarity) {
  const prefix = RARITY_PREFIX[rarity] || 'CARD';
  return `${prefix} #${String(1 + Math.floor(Math.random() * 9999)).padStart(4, '0')}`;
}
function normalizeCardStats(base, stats) {
  const fallback = randomCardStats(base);
  const value = key => {
    const raw = stats && stats[key];
    return raw != null && Number.isFinite(Number(raw)) ? Number(raw) : fallback[key];
  };
  return { power: value('power'), cunning: value('cunning'), arcana: value('arcana') };
}

let state = { owned: [], coins: STARTING_COINS, stats: { ...DEFAULT_STATS }, serialBase: {}, pendingPack: null, pendingOverflow: [] };
state.owned = STARTERS.map(n => makeInstance(n));
try {
  const raw = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
  if (raw) {
    state = {
      owned: Array.isArray(raw.owned) ? raw.owned : [],
      coins: typeof raw.coins === 'number' ? raw.coins : STARTING_COINS,
      stats: Object.assign({ ...DEFAULT_STATS }, raw.stats || {}),
      artifacts: Array.isArray(raw.artifacts) ? raw.artifacts : [],
      serialBase: raw.serialBase || {},
      pendingPack: Array.isArray(raw.pendingPack) && raw.pendingPack.length ? raw.pendingPack : null,
      pendingOverflow: Array.isArray(raw.pendingOverflow) ? raw.pendingOverflow : [],
    };
  }
} catch (e) {}
state.owned.forEach(o => { if (!o.level) o.level = 1; o.level = Math.min(MAX_CARD_LEVEL, Math.max(1, Math.floor(Number(o.level) || 1))); o.xp = Math.min(xpForLevel(MAX_CARD_LEVEL), Math.max(0, Number(o.xp) || xpForLevel(o.level))); o.favorite = !!o.favorite; o.sleeved = !!o.sleeved; o.rarity = RANK.includes(o.rarity) ? o.rarity : randomRarity(); o.rarityCode = o.rarityCode || mintRarityCode(o.rarity); const p = findPlayer(o.name); o.stats = normalizeCardStats(p, o.stats); if (!o.element) o.element = randomElement(); });
if (!Array.isArray(state.artifacts)) state.artifacts = [];
if (!state.serialBase || typeof state.serialBase !== 'object') state.serialBase = {};
if (!Array.isArray(state.pendingOverflow)) state.pendingOverflow = [];
if (!Array.isArray(state.pendingPack) || !state.pendingPack.length) state.pendingPack = null;
function blankState() {
  const old = (state && state.serialBase) || {};
  const carry = {};
  Object.keys(old).forEach(k => {
    const v = old[k];
    carry[k] = typeof v === 'number'
      ? Array.from({ length: v }, (_, i) => i + 1)
      : Array.isArray(v)
        ? v.slice()
        : v && typeof v === 'object'
          ? Object.keys(v).map(Number).filter(n => Number.isInteger(n) && n >= 1 && n <= MAX_SERIAL)
          : [];
  });
  return { owned: [], coins: STARTING_COINS, stats: { ...DEFAULT_STATS }, artifacts: [], serialBase: carry, pendingPack: null, pendingOverflow: [] };
}
/* Brand-new hoard (first play, or after wiping account data). The
   used serial pools are carried over so a fresh hoard never re-rolls
   numbers already handed out. */
function freshState() {
  const s = blankState();
  state = s;
  s.owned = STARTERS.map(n => makeInstance(n));
  return s;
}
function saveKey() { return currentUser ? SAVE_KEY + '-' + currentUser.user : SAVE_KEY; }
function saveState() {
  try { localStorage.setItem(saveKey(), JSON.stringify(state)); } catch (e) {}
  if (window.svPushState) svPushState();
}
function setWalletVisible(v) {
  const w = document.querySelector('.wallet');
  if (w) w.classList.toggle('hidden', !v);
}

/* ============================================================
   FIREBASE — one shared connection for the whole game.
   Accounts + saved hoards live under shadowveil/users, trade
   rooms under shadowveil/trades.
   ============================================================ */
const FB_CONFIG = {
  apiKey: 'AIzaSyB7KNURIlPW2S2J_aJdoX3c4L6BR5gma0g',
  authDomain: 'secu-18771.firebaseapp.com',
  databaseURL: 'https://secu-18771-default-rtdb.firebaseio.com',
  projectId: 'secu-18771',
  storageBucket: 'secu-18771.firebasestorage.app',
  messagingSenderId: '119665330735',
  appId: '1:119665330735:web:52bdea3a4a8aac362114da',
  measurementId: 'G-GJMJJT9636',
};
function svDb() {
  if (window.__fbOffline || (typeof navigator !== 'undefined' && navigator.onLine === false)) return null;
  if (window.__fbDb) return window.__fbDb;
  if (!window.firebase) return null;
  firebase.initializeApp(FB_CONFIG);
  window.__fbDb = firebase.database();
  return window.__fbDb;
}

/* ============================================================
   ECONOMY — coin values, pack costs, buying & selling.
   Base values are kept deliberately lean so a fresh pull rarely
   beats the pack price — packs are a coin sink, and only grades,
   low serials, 1st Editions and proven win records push a card's
   value up. This keeps the economy from inflating too fast.
   ============================================================ */
const PACK_COST = 100;
const RARITY_BASE = { bronze: 6, silver: 15, gold: 41, diamond: 77, prismatic: 120, astral: 175, void: 240, celestial: 340 };

/* ============================================================
   LEVELING — cards earn XP from their own duels.
   Wins add XP, losses remove some, and every threshold changes the
   level. Each level adds +LEVEL_STEP to every stat and unlocks the
   evolution phases separately from the card's rolled rarity.
   ============================================================ */

function effRarity(p, level, rarity) {
  return RANK.includes(rarity) ? rarity : p.rarity;
}
function effPlayer(p, o) {
  if (!p || !o) return p;
  const lvl = o.level || 1;
  const gain = (lvl - 1) * LEVEL_STEP;
  const stats = o.stats || { power: p.power, cunning: p.cunning, arcana: p.arcana };
  return {
    _eff: true, ...p,
    stats,
    power: stats.power + gain,
    cunning: stats.cunning + gain,
    arcana: stats.arcana + gain,
    rarity: effRarity(p, lvl, o.rarity),
    rarityCode: o.rarityCode || p.rarityCode || mintRarityCode(effRarity(p, lvl, o.rarity)),
    level: lvl,
    element: o.element || p.element || randomElement(),
  };
}
function xpForLevel(level) {
  const target = Number.isFinite(Number(level)) ? Math.max(1, Math.floor(Number(level))) : 1;
  let total = 0;
  for (let lv = 1; lv < target; lv++) {
    total += XP_LEVEL_BASE + (lv - 1) * XP_LEVEL_STEP;
  }
  return total;
}
function levelForXP(xp) {
  const numeric = Number(xp);
  const value = Number.isFinite(numeric) ? Math.max(0, numeric) : 0;
  let level = 1;
  while (level < MAX_CARD_LEVEL && value >= xpForLevel(level + 1)) level++;
  return level;
}
function xpProgress(o) {
  const level = o.level || 1;
  if (level >= MAX_CARD_LEVEL) return { current: 0, needed: 0 };
  const floor = xpForLevel(level);
  const next = xpForLevel(level + 1);
  const xp = Math.max(floor, Number(o.xp) || 0);
  return { current: xp - floor, needed: next - floor };
}
function recordCardDuel(o, won) {
  if (!o) return null;
  o.wins = (o.wins || 0) + (won ? 1 : 0);
  o.losses = (o.losses || 0) + (won ? 0 : 1);
  o.streak = won ? (o.streak || 0) + 1 : 0;
  if (!Number.isFinite(o.xp)) o.xp = xpForLevel(o.level || 1);
  const prev = o.level || 1;
  o.xp = Math.min(xpForLevel(MAX_CARD_LEVEL), Math.max(0, o.xp + (won ? XP_PER_WIN : -XP_PER_LOSS)));
  o.level = levelForXP(o.xp);
  return prev === o.level ? null : { prev, level: o.level, dir: o.level > prev ? 'up' : 'down' };
}

/* Migrate older cards that had levels but no XP ledger without changing
   their existing level or battle record. */
state.owned.forEach(o => {
  if (!Number.isFinite(o.xp)) o.xp = xpForLevel(o.level || 1);
});

/* Card worth = rarity base scaled by stats, then driven by the battle
   ledger — every win stacks on 35% of value, every loss costs 20%.
   An unplayed card is a cheap base; a proven winner is the prize.
   A revealed grade then swings the value hard — a GEM MT 10 is worth
   ten times as much, a Poor 1 is scrap — and a low serial tops it off. */
function cardValue(p, rec) {
  const o = rec || null;
  const e = p._eff ? p : effPlayer(p, o);
  const base = RARITY_BASE[e.rarity] * (0.6 + ovr(e) / 100);
  let recMod = 1;
  if (o && (o.wins + o.losses) > 0) {
    recMod += Math.min(2.5, o.wins * 0.35);
    recMod -= Math.min(1.5, o.losses * 0.20);
    recMod = Math.max(0.35, recMod);
  }
  let v = base * recMod;
  if (o) {
    if (o.graded) v *= GRADE_MULT[o.grade] || 1;
    v *= serialBonus(o.serial || 1);
    if (isFirstEdition(o.serial)) v *= FIRST_ED_MULT;
  }
  return Math.round(v);
}
function totalHoardValue(list) {
  return (list || state.owned || []).reduce((sum, o) => {
    const p = findPlayer(o.name);
    return p ? sum + cardValue(p, o) : sum;
  }, 0);
}
function isBankrupt() {
  const playable = new Set(state.owned
    .filter(o => !o.grading && !o.sleeved && findPlayer(o.name))
    .map(o => o.name));
  if (playable.size >= 4 || state.owned.some(o => o.grading)) return false;
  return (Number(state.coins) || 0) + totalHoardValue() < PACK_COST;
}
function checkBankruptcy() {
  if (typeof triggerBankruptcy === 'function' && isBankrupt()) triggerBankruptcy();
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
function sellCard(id) {
  const o = state.owned.find(x => x.id === id);
  if (!o) return;
  if (o.grading) { flash('That card is in the grading lab right now.'); return; }
  if (o.sleeved) { flash('That card is sleeved and protected. Unsleeve it before selling.'); return; }
  const p = findPlayer(o.name);
  if (!p) return;
  pendingSell = { p, o };
  const val = cardValue(p, o);
  $('#confirmCard').innerHTML = '';
  $('#confirmCard').appendChild(buildCard({ ...effPlayer(p, o), rec: o }, '', true));
  $('#confirmText').innerHTML = `Sell <b>${p.name}</b> <span class="coin-big">#${String(o.serial).padStart(4, '0')}</span> to the market for <span class="coin-big">${coin()}${val}</span>?`;
  confirmBox.classList.remove('hidden');
}
function confirmSale() {
  if (!pendingSell) return;
  const { o } = pendingSell;
  const current = state.owned.find(x => x.id === o.id);
  if (!current || current.grading || current.sleeved) {
    confirmBox.classList.add('hidden');
    pendingSell = null;
    flash(current && current.sleeved ? 'That card is sleeved and protected.' : 'That card is no longer available to sell.');
    return;
  }
  const p = findPlayer(current.name);
  if (!p) {
    confirmBox.classList.add('hidden');
    pendingSell = null;
    return;
  }
  const val = cardValue(p, current);
  state.coins += val;
  state.owned = state.owned.filter(x => x.id !== current.id);
  saveState();
  updateWallet();
  renderCollection();
  refreshPackHint();
  confirmBox.classList.add('hidden');
  pendingSell = null;
  flash(`${p.name} #${String(current.serial).padStart(4, '0')} sold — ${coin()}${val} added to your hoard`);
  checkBankruptcy();
}
function nonFavoriteSellables() {
  return state.owned.filter(o => !o.favorite && !o.grading && !o.sleeved && findPlayer(o.name));
}
function sellNonFavorites() {
  const cards = nonFavoriteSellables();
  if (!cards.length) {
    flash('No non-favorite cards are available to sell.');
    return;
  }
  const total = cards.reduce((sum, o) => sum + cardValue(findPlayer(o.name), o), 0);
  const noun = cards.length === 1 ? 'card' : 'cards';
  if (!window.confirm(`Sell ${cards.length} non-favorite ${noun} for ${total} coins? Favorites will be kept.`)) return;
  state.coins += total;
  const sold = new Set(cards.map(o => o.id));
  state.owned = state.owned.filter(o => !sold.has(o.id));
  saveState();
  updateWallet();
  renderCollection();
  refreshPackHint();
  flash(`Sold ${cards.length} non-favorite ${noun} for ${coin()}${total}. Favorites were kept.`);
  checkBankruptcy();
}
function cancelSale() {
  confirmBox.classList.add('hidden');
  pendingSell = null;
}

/* ============================================================
   ARTIFACTS — one-use relics, stacked up to ARTIFACT_STACK.
   ============================================================ */
function findArtifact(name) { return ARTIFACTS.find(a => a.name === name); }
function artifactCount(name) {
  const slot = (state.artifacts || []).find(x => x.name === name);
  return slot ? slot.count : 0;
}
/* Collect n more of an artifact. Anything past the stack cap is
   converted straight into coins and returned as overflow. */
function addArtifact(name, n) {
  const art = findArtifact(name);
  if (!art) return 0;
  state.artifacts = state.artifacts || [];
  let slot = state.artifacts.find(x => x.name === name);
  let overflow = 0;
  if (slot) {
    slot.count += n;
    if (slot.count > ARTIFACT_STACK) {
      overflow = slot.count - ARTIFACT_STACK;
      slot.count = ARTIFACT_STACK;
    }
  } else {
    state.artifacts.push({ name, count: Math.min(n, ARTIFACT_STACK) });
    if (n > ARTIFACT_STACK) overflow = n - ARTIFACT_STACK;
  }
  if (overflow > 0) { state.coins += overflow * art.price; updateWallet(); }
  saveState();
  return overflow;
}
/* Use up one — returns false if there's nothing to spend. */
function spendArtifact(name) {
  const slot = (state.artifacts || []).find(x => x.name === name);
  if (!slot || slot.count <= 0) return false;
  slot.count--;
  if (slot.count <= 0) state.artifacts = state.artifacts.filter(x => x.name !== name);
  saveState();
  return true;
}
function renderArtifacts() {
  let strip = $('#artifactStrip');
  const grid = $('#collection');
  if (!grid) return;
  if (!strip) {
    strip = document.createElement('div');
    strip.className = 'artifact-strip';
    strip.id = 'artifactStrip';
    grid.parentNode.insertBefore(strip, grid);
  }
  strip.innerHTML = '';
  (state.artifacts || []).forEach(a => {
    const art = findArtifact(a.name);
    if (!art) return;
    const t = document.createElement('button');
    t.className = 'art-token tier-' + art.tier;
    t.title = `${art.name} ×${a.count}`;
    t.innerHTML = `<span class="at-ico">${art.icon}</span><span class="at-count">×${a.count}</span>`;
    t.addEventListener('click', () => openArtifactView(a.name));
    strip.appendChild(t);
  });
}
function openArtifactView(name) {
  const art = findArtifact(name);
  const slot = (state.artifacts || []).find(x => x.name === name);
  if (!art || !slot) return;
  const box = document.createElement('div');
  box.className = 'card-inspect';
  const wrap = document.createElement('div');
  wrap.className = 'ci-inner';
  wrap.innerHTML = `
    <div class="art-big tier-${art.tier}">
      <div class="art-big-glow"></div>
      <div class="art-big-ico">${art.icon}</div>
      <div class="art-big-name">${art.name}</div>
      <div class="art-big-tier">${ARTIFACT_TIER_LABEL[art.tier]}</div>
    </div>
    <div class="ci-panel">
      <div class="ci-head">
        <span class="ci-rarity art-tier-${art.tier}">◆ ${ARTIFACT_TIER_LABEL[art.tier]}</span>
        <span class="ci-lvl">×${slot.count} owned</span>
        <span class="ci-role">One-use · Max ${ARTIFACT_STACK}</span>
      </div>
      <div class="ci-stats">
        <p class="art-desc">${art.desc}</p>
        <p class="art-desc small">Spend it on your turn in the arena — it vanishes after the battle.</p>
      </div>
      <div class="ci-meta">
        <span class="ci-ovr">In Battle · One-use</span>
        <span class="ci-val"><b>${slot.count}</b> / ${ARTIFACT_STACK} stacked</span>
      </div>
      <div class="ci-actions">
        <button class="primary" id="ciClose">Done</button>
      </div>
    </div>`;
  box.appendChild(wrap);
  document.body.appendChild(box);
  requestAnimationFrame(() => box.classList.add('pop'));
  const close = () => { box.classList.remove('pop'); setTimeout(() => box.remove(), 200); };
  box.addEventListener('click', ev => { if (ev.target === box) close(); });
  wrap.querySelector('#ciClose').addEventListener('click', close);
}

/* ---- level-up / de-rank notification ---- */
let lvlToastQueue = [];
let lvlToastActive = false;
function showLevelToast(shift) {
  lvlToastQueue.push(shift);
  pumpLevelToasts();
}
function pumpLevelToasts() {
  if (lvlToastActive || !lvlToastQueue.length) return;
  lvlToastActive = true;
  renderLevelToast(lvlToastQueue.shift(), () => {
    lvlToastActive = false;
    pumpLevelToasts();
  });
}
function renderLevelToast(s, done) {
  const p = findPlayer(s.name);
  if (!p) { done(); return; }
  const up = s.dir === 'up';
  const record = state.owned.find(o => o.name === s.name && o.serial === s.serial);
  const beforeEvolution = evolutionForLevel(s.prev);
  const afterEvolution = evolutionForLevel(s.level);
  const oldStats = effPlayer(p, { level: s.prev, rarity: record && record.rarity, rarityCode: record && record.rarityCode, stats: record && record.stats });
  const newStats = effPlayer(p, { level: s.level, rarity: record && record.rarity, rarityCode: record && record.rarityCode, stats: record && record.stats });
  const stat = (label, key) => `<div class="lt-stat"><span>${label}</span><b>${oldStats[key]}</b><i>→</i><b>${newStats[key]}</b></div>`;
  const box = document.createElement('div');
  box.className = 'level-toast';
  box.innerHTML = `
    <div class="lt-glow ${up ? 'up' : 'down'}"></div>
    <div class="lt-title ${up ? 'up' : 'down'}">${up ? '⬆ Level Up!' : '⬇ De-Ranked'}</div>
    <div class="lt-sub">${p.name}</div>
    <div class="lt-line">${beforeEvolution.label} → ${afterEvolution.label} · Lv ${s.prev} → ${s.level}</div>
    <div class="lt-stats">${stat('Power', 'power')}${stat('Cunning', 'cunning')}${stat('Arcana', 'arcana')}</div>
    <div class="lt-foot">${up ? 'Stats forged · XP threshold reached' : 'XP loss pulls stats back toward base'} · Tap anywhere to continue</div>`;
  const cardWrap = document.createElement('div');
  cardWrap.className = 'lt-card';
  cardWrap.appendChild(buildCard({
    ...effPlayer(p, { level: s.level, rarity: record && record.rarity, rarityCode: record && record.rarityCode, stats: record && record.stats, wins: 0, losses: 0, streak: 0 }),
    rec: { serial: s.serial, wins: 0, losses: 0, streak: 0, level: s.level, rarity: record && record.rarity, rarityCode: record && record.rarityCode, stats: record && record.stats },
  }, 'lt-draw', true));
  box.appendChild(cardWrap);
  document.body.appendChild(box);
  void box.offsetWidth;
  box.classList.add('pop');
  if (up && typeof burstReward === 'function') burstReward(box);
  let closed = false;
  box.addEventListener('click', () => {
    if (closed) return;
    closed = true;
    box.classList.remove('pop');
    setTimeout(() => { box.remove(); done(); }, 200);
  });
}

/* The crown jewel — the most valuable unprotected card in the collection.
   Defeat in the arena hands it to the enemy, so losses bite for real. */
function crownJewel() {
  let best = null;
  state.owned.forEach(o => {
    if (o.sleeved || o.grading) return;
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
  const o = p.rec || (state.owned.find(x => x.name === p.name) || null);
  if (!o) return `<span class="series">Veil I</span>`;
  const fire = o.streak > 1 ? ` 🔥<b>${o.streak}</b>` : '';
  const lvl = (o.level || 1) > 1 ? ` Lv<b>${o.level}</b>` : '';
  return `<span class="rec">W<b>${o.wins}</b> L<b>${o.losses}</b>${lvl}${fire}</span>`;
}
function hoardCount() { return state.owned.length; }
function hoardFull() { return state.owned.length >= MAX_HOARD; }

/* The album page: every realm is its own leaf, ordered by how high
   its rarest card flies. Within a leaf, cards sit rarity-first so a
   diamond always fronts the page. */
function renderCollection() {
  collection.innerHTML = '';
  collection.className = 'album';
  const jewel = crownJewel();

  const group = {};
  state.owned.forEach(o => {
    const p = findPlayer(o.name);
    if (!p) return;
    (group[p.realm] = group[p.realm] || []).push({ o, p });
  });

  const rankIdx = rarity => RANK.indexOf(rarity);
  const realmRank = entries =>
    Math.max.apply(null, entries.map(e => rankIdx(e.p.rarity)));
  const realms = Object.keys(group).sort((a, b) =>
    realmRank(group[b]) - realmRank(group[a]) || (a < b ? -1 : a > b ? 1 : 0));

  realms.forEach((realm, ri) => {
    const entries = group[realm].slice().sort((x, y) =>
      rankIdx(y.p.rarity) - rankIdx(x.p.rarity) ||
      cardValue(y.p, y.o) - cardValue(x.p, x.o));
    const topRarity = entries[0].p.rarity;
    const sec = document.createElement('div');
    sec.className = 'album-section';
    const head = document.createElement('div');
    head.className = 'album-head';
    head.innerHTML = `<span class="album-dot rare-${topRarity}"></span>
      <span class="album-title">${realm}</span>
      <span class="album-count">${entries.length} card${entries.length === 1 ? '' : 's'}</span>`;
    sec.appendChild(head);
    const grid = document.createElement('div');
    grid.className = 'album-grid';
    entries.forEach(({ o, p }, i) => {
      const wrap = document.createElement('div');
      wrap.className = 'collect-wrap' + (jewel && jewel.o.id === o.id ? ' jewel-card' : '') + (o.favorite ? ' favorite-card' : '');
      if (o.favorite) {
        const marker = document.createElement('span');
        marker.className = 'favorite-mark';
        marker.textContent = '★';
        marker.title = 'Favorite card';
        marker.setAttribute('aria-label', 'Favorite card');
        wrap.appendChild(marker);
      }
      const card = buildCard({ ...effPlayer(p, o), rec: o }, 'collect-card', true);
      card.addEventListener('click', () => openCardView(o.id));
      card.style.setProperty('--d', (((ri + i) % 8) * .07) + 's');
      wrap.appendChild(card);
      grid.appendChild(wrap);
    });
    sec.appendChild(grid);
    collection.appendChild(sec);
  });

  if (state.owned.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'album-empty';
    empty.innerHTML = `<span class="album-empty-ico">🗂️</span>
      <p>Your album page is empty.</p>
      <span>Open a pack or win an arena match to bind the first creatures.</span>`;
    collection.appendChild(empty);
  }

  $('#count').innerHTML = `<b>${state.owned.length}</b> / ${MAX_HOARD} album slots filled
    <span class="cap${state.owned.length >= MAX_HOARD ? ' full' : ''}"><i style="--fill:${Math.round(state.owned.length / MAX_HOARD * 100)}%"></i></span>`;
  const sellUnfavBtn = $('#sellUnfavBtn');
  if (sellUnfavBtn) {
    const count = nonFavoriteSellables().length;
    sellUnfavBtn.disabled = count === 0;
    sellUnfavBtn.textContent = count ? `Sell ${count} Non-Favorite${count === 1 ? '' : 's'}` : 'No Non-Favorites';
  }
  const jl = $('#jewelLine');
  if (jewel) {
    jl.innerHTML = `Crown Jewel · <b>${jewel.p.name}</b> · ${jewel.o.wins}W ${jewel.o.losses}L · ${coin()}${jewel.v}`;
    jl.classList.remove('hidden');
  } else {
    jl.classList.add('hidden');
  }
  renderArtifacts();
  publishGallery();
}

/* ============================================================
   FULL ALBUM — when a pull or arena win can't fit the page, it
   goes into the overflow queue. The player decides each card's
   fate: let it go, sell it, or trade it in against an owned card.
   ============================================================ */
let overflowQueue = [];
let overflowActionBusy = false;
function overflowStateItem(item) {
  return item && item.instance && item.player
    ? { instance: item.instance, playerName: item.player.name }
    : null;
}
function persistOverflowQueue() {
  state.pendingOverflow = overflowQueue.map(overflowStateItem).filter(Boolean);
  saveState();
}
function resolveHoardOverflow(items, onDone) {
  overflowQueue = items.slice();
  overflowActionBusy = false;
  persistOverflowQueue();
  processOverflowItem(onDone);
}
function closeOverflow() {
  const box = document.getElementById('hoardOverflow');
  if (box) box.remove();
}
function processOverflowItem(onDone) {
  closeOverflow();
  if (!overflowQueue.length) {
    state.pendingOverflow = [];
    saveState();
    onDone && onDone();
    return;
  }
  showOverflowCard(overflowQueue[0], onDone);
}
function showOverflowCard(item, onDone) {
  overflowActionBusy = false;
  const { player, instance } = item;
  const val = cardValue(player, instance);
  const box = document.createElement('div');
  box.className = 'sv-popup pop';
  box.id = 'hoardOverflow';
  box.innerHTML = `
    <div class="sv-popup-inner ovf">
      <div class="svp-ico">⚠️</div>
      <div class="svp-title">Album page is full</div>
      <div class="svp-sub">${hoardCount()} / ${MAX_HOARD} slots bound — <b>${instance.name}</b> needs a slot before it can join.</div>
      <div class="ovf-card"></div>
      <div class="svp-actions">
        <button class="ovf-btn" id="ovfSell">Sell it · ${coin()}<span class="coin">${val}</span></button>
        <button class="ovf-btn" id="ovfTrade">Trade with a card I own</button>
        <button class="svp-cancel" id="ovfCancel">Cancel — let it go</button>
      </div>
    </div>`;
  box.querySelector('.ovf-card').appendChild(buildCard({ ...effPlayer(player, instance), rec: instance }, 'ovf-draw', true));
  box.querySelector('#ovfSell').addEventListener('click', () => overflowSell(item, onDone));
  box.querySelector('#ovfCancel').addEventListener('click', () => overflowCancel(item, onDone));
  box.querySelector('#ovfTrade').addEventListener('click', () => showOverflowTrade(item, onDone));
  document.body.appendChild(box);
  requestAnimationFrame(() => box.classList.add('pop'));
}
function overflowSell(item, onDone) {
  if (overflowActionBusy) return;
  overflowActionBusy = true;
  closeOverflow();
  const val = cardValue(item.player, item.instance);
  state.coins += val;
  updateWallet();
  flash(`Sold ${item.instance.name} for ${coin()}${val} — the slot stays free.`);
  overflowQueue.shift();
  persistOverflowQueue();
  processOverflowItem(onDone);
}
function overflowCancel(item, onDone) {
  if (overflowActionBusy) return;
  overflowActionBusy = true;
  closeOverflow();
  flash(`${item.instance.name} slips away — the page stays full.`);
  overflowQueue.shift();
  persistOverflowQueue();
  processOverflowItem(onDone);
}
/* Give up one of your own cards: it's sold for its value, and the new
   pull takes its slot on the page. */
function overflowTradeWith(o, item, onDone) {
  if (overflowActionBusy) return;
  const current = state.owned.find(x => x.id === o.id);
  if (!current || current.grading || current.sleeved) {
    flash('That card is no longer available for the trade.');
    return;
  }
  overflowActionBusy = true;
  closeOverflow();
  const p = findPlayer(current.name);
  if (!p) { overflowActionBusy = false; processOverflowItem(onDone); return; }
  const val = cardValue(p, current);
  state.coins += val;
  state.owned = state.owned.filter(x => x.id !== current.id);
  state.owned.push(item.instance);
  updateWallet();
  flash(`Traded — ${current.name} sold for ${coin()}${val}, ${item.instance.name} joins the page.`);
  overflowQueue.shift();
  persistOverflowQueue();
  processOverflowItem(onDone);
}
function showOverflowTrade(item, onDone) {
  const box = document.getElementById('hoardOverflow');
  if (!box) return;
  const inner = box.querySelector('.sv-popup-inner');
  inner.innerHTML = `
    <div class="svp-title">Give up a card</div>
    <div class="svp-sub">Pick one of your bound creatures. It's sold for its value to free a slot for <b>${item.instance.name}</b>.</div>
    <div class="ovf-pick"></div>
    <div class="svp-actions"><button class="svp-cancel" id="ovfBack">← Back</button></div>`;
  const pick = inner.querySelector('.ovf-pick');
  state.owned.forEach((o, i) => {
    if (o.sleeved || o.grading) return;
    const p = findPlayer(o.name);
    if (!p) return;
    const val = cardValue(p, o);
    const wrap = document.createElement('div');
    wrap.className = 'collect-wrap';
    const card = buildCard({ ...effPlayer(p, o), rec: o }, 'collect-card', true);
    card.style.setProperty('--d', ((i % 8) * .06) + 's');
    card.addEventListener('click', () => overflowTradeWith(o, item, onDone));
    const tag = document.createElement('button');
    tag.className = 'sell-btn trade-tag';
    tag.innerHTML = `Give up · ${coin()}<span class="coin">${val}</span>`;
    tag.addEventListener('click', () => overflowTradeWith(o, item, onDone));
    wrap.appendChild(card);
    wrap.appendChild(tag);
    pick.appendChild(wrap);
  });
  inner.querySelector('#ovfBack').addEventListener('click', () => showOverflowCard(item, onDone));
}
function resumePendingOverflow() {
  if (overflowQueue.length || document.getElementById('hoardOverflow')) return false;
  const items = (state.pendingOverflow || []).map(entry => {
    const instance = entry && entry.instance;
    const playerName = entry && (entry.playerName || (entry.player && entry.player.name));
    const player = findPlayer(playerName || (instance && instance.name));
    return instance && player ? { instance, player } : null;
  }).filter(Boolean);
  if (!items.length) {
    if ((state.pendingOverflow || []).length) {
      state.pendingOverflow = [];
      saveState();
    }
    return false;
  }
  resolveHoardOverflow(items, () => {
    renderCollection();
    saveState();
  });
  return true;
}

/* ============================================================
   HALL OF FAME — every collector's top cards are published to a
   shared board. The five most valuable cards across all hoards
   are shown, without naming who owns them.
   ============================================================ */
let galleryCache = {};
let galleryRef = null;
let lastGalleryPub = null;

function valuedCards(list) {
  return list.map(o => {
    const p = findPlayer(o.name);
    if (!p) return null;
    return { p, o, v: cardValue(p, o) };
  }).filter(Boolean);
}
function leaderboardEntries(cards) {
  const seen = new Set();
  return valuedCards(cards)
    .filter(e => {
      if (seen.has(e.o.id)) return false;
      seen.add(e.o.id);
      return true;
    })
    .sort((a, b) => b.v - a.v || (a.o.serial || 0) - (b.o.serial || 0))
    .slice(0, 5);
}
/* Push my current top 5 up to the shared board. Runs on every
   collection render; only writes when the list actually changes. */
function publishGallery() {
  if (typeof currentUser === 'undefined' || !currentUser) return;
  const db = svDb();
  if (!db) return;
  const top = leaderboardEntries(state.owned.filter(o => o.graded));
  const payload = top.map(e => ({
    id: e.o.id, name: e.o.name, serial: e.o.serial,
    grade: e.o.grade, graded: e.o.graded, grading: !!e.o.grading,
    firstEd: isFirstEdition(e.o.serial), level: e.o.level || 1,
    xp: Number(e.o.xp) || 0, wins: e.o.wins || 0, losses: e.o.losses || 0,
    streak: e.o.streak || 0, rarity: e.o.rarity, rarityCode: e.o.rarityCode,
    stats: e.o.stats, element: e.o.element,
  }));
  const json = JSON.stringify(payload);
  if (json === lastGalleryPub) return;
  lastGalleryPub = json;
  db.ref('shadowveil/gallery/' + String(currentUser.user).replace(/[^a-z0-9]/gi, '_').toLowerCase())
    .set(payload).catch(() => {});
}
function unwatchLeaderboard() {
  if (galleryRef) { galleryRef.off('value'); galleryRef = null; }
  galleryCache = {};
}
function watchLeaderboard() {
  unwatchLeaderboard();
  const db = svDb();
  if (!db) return;
  galleryRef = db.ref('shadowveil/gallery');
  galleryRef.on('value', snap => {
    galleryCache = (snap && snap.val && snap.val()) || {};
    renderLeaderboard();
  });
}
function renderLeaderboard() {
  const host = $('#leaderboard');
  if (!host) return;
  host.innerHTML = '';
  const cards = [];
  Object.keys(galleryCache).forEach(uid => {
    const arr = galleryCache[uid];
    if (!Array.isArray(arr)) return;
    arr.forEach(c => { if (c && c.name && c.graded) cards.push(c); });
  });
  const top = leaderboardEntries(cards);
  if (!top.length) {
    host.innerHTML = `<div class="album-empty">
      <span class="album-empty-ico">🏆</span>
      <p>The Hall of Fame is waiting for its first legends.</p>
      <span>Grade something rare and it will surface here — no names, just the cards.</span>
    </div>`;
    return;
  }
  const medals = ['🥇', '🥈', '🥉', '4', '5'];
  top.forEach((entry, i) => {
    const { o, p } = entry;
    const rarity = RANK.includes(o.rarity) ? o.rarity : p.rarity;
    const row = document.createElement('div');
    row.className = 'lb-row' + (i === 0 ? ' first' : '');
    row.innerHTML = `
      <span class="lb-rank${i === 0 ? ' gold' : ''}">${medals[i]}</span>
       <div class="lb-info">
         <span class="lb-tier rare-${rarity}">${RARITY_LABEL[rarity]}</span>
        <span class="lb-name">${p.name}</span>
      </div>
      <span class="lb-val">${coin()}<b>${entry.v}</b></span>`;
    row.addEventListener('click', () => openHallCardView(entry));
    host.appendChild(row);
  });
}

/* ---- big card inspect ---- */
function openCardView(id) {
  const o = state.owned.find(x => x.id === id);
  if (!o) return;
  const p = findPlayer(o.name);
  if (!p) return;
  showCardInspect(p, o, { sellable: true, gradable: !o.graded, favoriteable: true, sleeveable: true });
}
/* A card on the Hall of Fame isn't yours — inspect it read-only. */
function openHallCardView(entry) {
  if (!entry || !entry.p || !entry.o) return;
  showCardInspect(entry.p, entry.o, { sellable: false, gradable: false });
}
function showCardInspect(p, o, opts) {
  const e = effPlayer(p, o);
  const lvl = o.level || 1;
  const evolution = evolutionForLevel(lvl);
  const val = cardValue(p, o);
  const progress = xpProgress(o);
  const box = document.createElement('div');
  box.className = 'card-inspect';
  const wrap = document.createElement('div');
  wrap.className = 'ci-inner';
  const stat = (label, v, color) => `
    <div class="ci-stat">
      <div class="ci-stat-top"><span>${label}</span><b>${v}</b></div>
      <div class="ci-track"><i style="--w:${v}%;--c:${color}"></i></div>
    </div>`;
  const gc = o.grading ? GRADE_COLOR[9] : GRADE_COLOR[o.grade] || '#c9d3dd';
  const gradeBlock = o.grading
    ? `<div class="ci-grade in-lab">
         <span class="cg-ico">⏳</span>
         <span class="cg-info"><b>In the Grading Lab</b><span>Results in <b>${fmtTime(gradeRemaining(o))}</b> — it's out of your hands until then.</span></span>
       </div>`
    : o.graded
      ? `<div class="ci-grade graded" style="--gc:${gc}">
           <span class="cg-num">${o.grade}</span>
           <span class="cg-info"><b>${GRADE_FULL[o.grade]}</b><span>${GRADE_LABEL[o.grade]} · ${fmtMult(GRADE_MULT[o.grade])} card value</span></span>
         </div>`
      : `<div class="ci-grade ungraded">
           <span class="cg-ico">?</span>
           <span class="cg-info"><b>Condition unknown</b><span>Pay ${coin()}<b>${GRADE_FEE}</b> and the lab reveals its hidden 1–10 grade.</span></span>
         </div>`;
  const actions = [];
  if (opts.favoriteable) actions.push(`<button id="ciFavorite" class="favorite-toggle${o.favorite ? ' active' : ''}" aria-pressed="${!!o.favorite}">${o.favorite ? '★ Favorited' : '☆ Favorite'}</button>`);
  if (opts.sleeveable) actions.push(`<button id="ciSleeve" class="sleeve-toggle${o.sleeved ? ' active' : ''}" aria-pressed="${!!o.sleeved}"${o.grading ? ' disabled' : ''}>${o.sleeved ? 'Unsleeve Card' : 'Sleeve Card'}</button>`);
  if (opts.sellable && !o.grading && !o.sleeved) actions.push(`<button id="ciSell">Sell</button>`);
  if (opts.gradable && !o.grading) actions.push(`<button id="ciGrade">Send to Lab</button>`);
  actions.push(`<button class="primary" id="ciClose">Done</button>`);
  wrap.innerHTML = `
    <div class="ci-card"></div>
    <div class="ci-panel">
      <div class="ci-head">
        <span class="ci-rarity rare-${e.rarity}">${RARITY_LABEL[e.rarity]}</span>
        ${isFirstEdition(o.serial) ? `<span class="ci-firsted">★ 1st Edition</span>` : ''}
        <span class="ci-evolution evo-${evolution.key}">${evolution.label}${evolution.capped ? ' · CAPPED' : ''}</span>
        <span class="ci-lvl">Lv ${lvl} · XP ${evolution.capped ? 'MAX' : `${progress.current}/${progress.needed}`}</span>
        <span class="ci-role">${e.realm}</span>
      </div>
      <div class="ci-stats">
        ${stat('Power', e.power, '#ff9d5c')}
        ${stat('Cunning', e.cunning, '#7fd4ff')}
        ${stat('Arcana', e.arcana, '#d9a7ff')}
      </div>
      <div class="ci-meta">
        <span class="ci-ovr">OVR <b>${ovr(e)}</b></span>
        <span class="ci-rec">${o.rarityCode || 'CARD #0000'} · #${String(o.serial).padStart(4, '0')} · W <b>${o.wins || 0}</b> L <b>${o.losses || 0}</b></span>
        <span class="ci-val">${coin()}<b>${val}</b></span>
      </div>
      <div class="ci-grade-row">${gradeBlock}</div>
      <div class="ci-actions">${actions.join('')}</div>
    </div>`;
  const card = buildCard({ ...e, rec: o }, 'ci-draw', true);
  wrap.querySelector('.ci-card').appendChild(card);
  box.appendChild(wrap);
  document.body.appendChild(box);
  requestAnimationFrame(() => box.classList.add('pop'));
  const close = () => {
    box.classList.remove('pop');
    setTimeout(() => box.remove(), 200);
  };
  box.addEventListener('click', ev => { if (ev.target === box) close(); });
  wrap.querySelector('#ciClose').addEventListener('click', close);
  const favoriteBtn = wrap.querySelector('#ciFavorite');
  if (favoriteBtn) favoriteBtn.addEventListener('click', () => {
    o.favorite = !o.favorite;
    saveState();
    renderCollection();
    favoriteBtn.classList.toggle('active', o.favorite);
    favoriteBtn.setAttribute('aria-pressed', String(o.favorite));
    favoriteBtn.textContent = o.favorite ? '★ Favorited' : '☆ Favorite';
  });
  const sellBtn = wrap.querySelector('#ciSell');
  if (sellBtn) sellBtn.addEventListener('click', () => { close(); sellCard(o.id); });
  const sleeveBtn = wrap.querySelector('#ciSleeve');
  if (sleeveBtn) sleeveBtn.addEventListener('click', () => {
    if (o.grading) return;
    o.sleeved = !o.sleeved;
    saveState();
    renderCollection();
    setSleeveVisual(card, o.sleeved);
    sleeveBtn.classList.toggle('active', o.sleeved);
    sleeveBtn.setAttribute('aria-pressed', String(!!o.sleeved));
    sleeveBtn.textContent = o.sleeved ? 'Unsleeve Card' : 'Sleeve Card';
    const sell = wrap.querySelector('#ciSell');
    if (o.sleeved && sell) sell.remove();
    if (!o.sleeved && !sell && opts.sellable) {
      const button = document.createElement('button');
      button.id = 'ciSell';
      button.textContent = 'Sell';
      button.addEventListener('click', () => { close(); sellCard(o.id); });
      wrap.querySelector('.ci-actions').insertBefore(button, wrap.querySelector('#ciClose'));
    }
  });
  const gradeBtn = wrap.querySelector('#ciGrade');
  if (gradeBtn) gradeBtn.addEventListener('click', () => { close(); sendToGrade(o.id); });
  setTimeout(() => wrap.querySelectorAll('.ci-track i').forEach(b => b.classList.add('fill')), 60);
}

function pickCard() {
  return PLAYERS[Math.floor(Math.random() * PLAYERS.length)];
}

/* --- photo fallback: if an image fails to load, drop it and show the neutral backdrop --- */
function silFallback(imgEl) {
  const fallback = imgEl.dataset.fallback;
  if (fallback && !imgEl.dataset.fallbackUsed) {
    imgEl.dataset.fallbackUsed = '1';
    imgEl.src = fallback;
    return;
  }
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
  const rec = p.rec || null;
  const level = p.level || (rec && rec.level) || 1;
  const evolution = evolutionForLevel(level);
  const defaultArt = creatureImg(p.name);
  const artSrc = typeof evolutionImg === 'function' ? evolutionImg(p.name, evolution.key) : defaultArt;
  const fallbackArt = artSrc && artSrc !== defaultArt ? ` data-fallback="${defaultArt}"` : '';
  const art = artSrc
    ? `<img src="${artSrc}" alt="${p.name}" data-name="${p.name}"${fallbackArt} onerror="silFallback(this)">`
    : '';
  const chip = (label, val) => `<div class="chip"><span>${label}</span><b>${val}</b><i><em data-v="${val}"></em></i></div>`;
  const gradeChip = rec
    ? rec.grading
      ? `<span class="grade-chip lab" title="In the Grading Lab">⏳</span>`
      : rec.graded
        ? `<span class="grade-chip g" style="--gc:${GRADE_COLOR[rec.grade] || '#c9d3dd'}" title="${GRADE_FULL[rec.grade]}">${rec.grade}<em>${GRADE_LABEL[rec.grade]}</em></span>`
        : `<span class="grade-chip ungraded" title="Condition unknown — submit to the Grading Lab">?</span>`
    : `<span class="grade-chip ungraded" title="Condition unknown — submit to the Grading Lab">?</span>`;
   const serial = `<span class="serial${rec && rec.serial <= 10 ? ' hot' : ''}">#${String(rec && rec.serial ? rec.serial : 0).padStart(4, '0')}</span>`;
  const elem = elementInfo(p.element || (rec && rec.element));
  const firstEd = rec && isFirstEdition(rec.serial)
    ? `<span class="firsted" title="1st Edition print run">1st Edition</span>`
    : '';
  const rarityCode = (rec && rec.rarityCode) || p.rarityCode || `${RARITY_PREFIX[p.rarity] || 'CARD'} #0000`;
  return `<div class="face tcard rare-${p.rarity} evo-${evolution.key}${evolution.capped ? ' god-capped' : ''}" style="--rar:${rarity.color}">
    <div class="card-top">
      <span class="team">${p.realm}</span>
      <span class="top-right">${gradeChip}<span class="rarity-tag">${RARITY_LABEL[p.rarity]}</span></span>
    </div>
    <div class="photo${artSrc ? '' : ' nophoto'}">
      <div class="energy"></div>
      <div class="lines"></div>
      ${art}
      ${firstEd}
      <div class="ovr-badge">OVR<b>${ovr}</b></div>
    </div>
    <div class="plate">
      <div class="nm"><h3>${p.name}</h3><span class="stars">${stars}</span></div>
      <div class="role"><b>${evolution.label}</b><span>Lv ${level}${evolution.capped ? ' · MAX' : ''}</span></div>
      <div class="element-tag" title="${elem.label}">${elem.icon} ${elem.label}</div>
    </div>
    <div class="stat-panel">
      ${chip('Power', p.power)}
      ${chip('Cunning', p.cunning)}
      ${chip('Arcana', p.arcana)}
    </div>
    <div class="card-foot">
      ${serial}
      <span class="rarity-code">${rarityCode}</span>
      ${recordLine(p)}
      <span class="value">${coin()}${cardValue(p, rec)}</span>
    </div>
    <div class="frame"></div>
  </div>`;
}

function setSleeveVisual(card, enabled) {
  card.classList.toggle('sleeved', enabled);
  const old = card.querySelector('.sleeve-overlay');
  if (old) old.remove();
  if (!enabled) return;
  const overlay = document.createElement('span');
  overlay.className = 'sleeve-overlay';
  overlay.innerHTML = '<span class="sleeve-stamp">PROTECTED</span>';
  card.appendChild(overlay);
}

function buildCard(p, cls = '', noFlip = false) {
  const div = document.createElement('div');
  const evolution = evolutionForLevel(p.level || (p.rec && p.rec.level) || 1);
  div.className = 'flip ' + cls + ` evo-${evolution.key}${evolution.capped ? ' god-capped' : ''}`;
  div.innerHTML = `<div class="flip-inner">${cardFront(p)}${cardBack()}</div>`;
  if (p.rec && p.rec.grading) {
    const status = document.createElement('span');
    status.className = 'card-status grading-status';
    status.textContent = 'In Grading';
    status.title = 'This card cannot be played or sold until grading is complete.';
    div.classList.add('has-card-status');
    div.appendChild(status);
  }
  if (p.rec && p.rec.sleeved) setSleeveVisual(div, true);
  if (!noFlip) div.addEventListener('click', () => div.querySelector('.flip-inner').classList.toggle('flipped'));
  return div;
}

const sellUnfavBtn = $('#sellUnfavBtn');
if (sellUnfavBtn) sellUnfavBtn.addEventListener('click', sellNonFavorites);
