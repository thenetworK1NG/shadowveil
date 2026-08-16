/* ============================================================
   ACCOUNTS — username + password, backed by your Firebase
   Realtime Database. Accounts live at shadowveil/users/<name>;
   each holds a salted password hash plus that player's hoard.
   ============================================================ */
const SESSION_KEY = 'shadowveil-session';
let pushTimer = null;

function safeParse(s) { try { return JSON.parse(s); } catch (e) { return null; } }
function sanitizeUser(u) { return (u || '').trim().toLowerCase().replace(/[^a-z0-9_.]/g, ''); }
function userPath(u) { return 'shadowveil/users/' + u; }
function randHex(len) {
  const a = new Uint8Array(len);
  if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(a);
  else for (let i = 0; i < len; i++) a[i] = Math.floor(Math.random() * 256);
  return [...a].map(b => b.toString(16).padStart(2, '0')).join('');
}
async function hashPassword(str) {
  if (window.crypto && crypto.subtle && crypto.subtle.digest) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  }
  // cyrb53 fallback for non-secure contexts — not plaintext, still salted
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
}
/* read a DB path with a safety timeout; null if unreachable */
function dbGet(path) {
  const db = svDb();
  if (!db) return Promise.resolve(null);
  return Promise.race([
    db.ref(path).once('value'),
    new Promise(res => setTimeout(() => res(null), 8000)),
  ]).then(snap => (snap && typeof snap.val === 'function' ? snap.val() : snap));
}
/* debounced push of the current hoard up to the account */
function svPushState() {
  if (!currentUser) return;
  const db = svDb();
  if (!db) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    db.ref(userPath(currentUser.user) + '/state').set(JSON.parse(JSON.stringify(state)))
      .then(() => {}).catch(() => {});
  }, 350);
}

function normalizeState() {
  state.owned = Array.isArray(state.owned) ? state.owned : [];
  if (!state.serialBase || typeof state.serialBase !== 'object') state.serialBase = {};
  /* old saves tracked a simple per-creature count; new ones keep an
     array of the serials already handed out for that creature */
  Object.keys(state.serialBase).forEach(k => {
    const v = state.serialBase[k];
    if (typeof v === 'number') {
      state.serialBase[k] = Array.from({ length: v }, (_, i) => i + 1);
    } else if (!Array.isArray(v)) {
      state.serialBase[k] = [];
    }
  });
  state.owned.forEach(o => {
    if (!o.id) o.id = genId();
    if (!o.serial) o.serial = mintSerial(o.name);
    if (!('grade' in o)) o.grade = null;
    if (!o.graded) o.graded = false;
    if (!('grading' in o)) o.grading = null;
    if (!o.level) o.level = 1;
    if (!('wins' in o)) o.wins = 0;
    if (!('losses' in o)) o.losses = 0;
    if (!('streak' in o)) o.streak = 0;
    if (!('firstEd' in o)) o.firstEd = false;
    const arr = state.serialBase[o.name];
    if (Array.isArray(arr) && typeof o.serial === 'number' && !arr.includes(o.serial)) arr.push(o.serial);
  });
  if (typeof state.coins !== 'number') state.coins = 500;
  state.stats = Object.assign({ battles: 0, wins: 0, losses: 0, won: 0, lost: 0, streak: 0 }, state.stats || {});
  if (!Array.isArray(state.artifacts)) state.artifacts = [];
}
function renderAll() { renderCollection(); updateWallet(); refreshPackHint(); }

async function enterGame(user, hash) {
  currentUser = { user, hash };
  localStorage.setItem(SESSION_KEY, JSON.stringify({ user, hash }));
  const remote = await dbGet(userPath(user) + '/state');
  if (remote) {
    state = remote;
  } else {
    const cached = safeParse(localStorage.getItem(saveKey()));
    if (cached) state = cached;
  }
  // adopt any globally-claimed serials so a low # stays rare everywhere
  const serials = await dbGet('shadowveil/serials');
  if (serials && typeof serials === 'object') {
    state.serialBase = state.serialBase || {};
    Object.keys(serials).forEach(k => {
      const remote = serials[k];
      const cur = Array.isArray(state.serialBase[k]) ? state.serialBase[k] : [];
      const add = [];
      if (typeof remote === 'number') { for (let i = 1; i <= remote; i++) add.push(i); }
      else if (remote && typeof remote === 'object') Object.keys(remote).forEach(x => { if (remote[x]) add.push(Number(x)); });
      state.serialBase[k] = Array.from(new Set(cur.concat(add))).filter(n => typeof n === 'number' && !isNaN(n));
    });
  }
  normalizeState();
  hideAuth();
  renderAll();
  svPushState();
  if (typeof watchLeaderboard === 'function') watchLeaderboard();
}

async function register(user, pw) {
  const db = svDb();
  if (!db) throw new Error('Can\'t reach the account server — check your connection.');
  const salt = randHex(16);
  const hash = await hashPassword(salt + ':' + pw);
  const ref = db.ref(userPath(user));
  const exists = await dbGet(userPath(user));
  if (exists) throw new Error('That name is already taken.');
  await ref.set({ salt, hash, created: Date.now() });
  await enterGame(user, hash);
}
async function login(user, pw) {
  const rec = await dbGet(userPath(user));
  if (!rec || !rec.hash) throw new Error('No account with that name.');
  const hash = await hashPassword(rec.salt + ':' + pw);
  if (hash !== rec.hash) throw new Error('Wrong password.');
  await enterGame(user, hash);
}
async function verifySession(user, hash) {
  const rec = await dbGet(userPath(user));
  if (!rec) return false;
  return rec.hash === hash;
}
function logout() {
  localStorage.removeItem(SESSION_KEY);
  currentUser = null;
  if (typeof unwatchLeaderboard === 'function') unwatchLeaderboard();
  if (typeof showMenu === 'function') showMenu();
  showAuth();
}

/* ============================================================
   POPUP SYSTEM — a modal with a hold-to-confirm button, so
   destructive actions need more than one careless tap.
   ============================================================ */
function showPopup(opts) {
  const old = $('#svPopup');
  if (old) old.remove();
  const box = document.createElement('div');
  box.className = 'sv-popup';
  box.id = 'svPopup';
  box.innerHTML = `
    <div class="sv-popup-inner">
      <div class="svp-ico">${opts.icon || '⚠️'}</div>
      <h3 class="svp-title">${opts.title}</h3>
      ${opts.sub ? `<p class="svp-sub">${opts.sub}</p>` : ''}
      <div class="svp-actions"></div>
    </div>`;
  const actions = box.querySelector('.svp-actions');
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'svp-cancel';
  cancelBtn.textContent = opts.cancelLabel || 'Cancel';
  actions.appendChild(cancelBtn);
  const confirmBtn = makeHoldBtn({
    label: opts.confirmLabel || 'Hold to confirm',
    ms: opts.holdMs || 1200,
    danger: opts.danger !== false,
    onDone: () => { close(); if (opts.onConfirm) opts.onConfirm(); },
  });
  actions.appendChild(confirmBtn);
  const onKey = e => { if (e.key === 'Escape') close(); };
  function close() {
    document.removeEventListener('keydown', onKey);
    box.remove();
  }
  cancelBtn.addEventListener('click', close);
  box.addEventListener('click', e => { if (e.target === box) close(); });
  document.addEventListener('keydown', onKey);
  document.body.appendChild(box);
  requestAnimationFrame(() => box.classList.add('pop'));
  return box;
}

function makeHoldBtn({ label, ms, onDone, danger }) {
  const btn = document.createElement('button');
  btn.className = 'hold-btn' + (danger ? ' danger' : '');
  btn.innerHTML = `<i class="hold-fill"></i><span class="hold-label">${label}</span>`;
  let raf = null;
  let start = 0;
  const reset = () => {
    if (raf) { cancelAnimationFrame(raf); raf = null; }
    btn.classList.remove('holding');
    btn.style.setProperty('--p', '0%');
  };
  const tick = now => {
    const p = Math.min(100, ((now - start) / ms) * 100);
    btn.style.setProperty('--p', p + '%');
    if (p >= 100) {
      raf = null;
      btn.classList.remove('holding');
      onDone();
    } else {
      raf = requestAnimationFrame(tick);
    }
  };
  btn.addEventListener('pointerdown', e => {
    e.preventDefault();
    start = performance.now();
    btn.classList.add('holding');
    raf = requestAnimationFrame(tick);
  });
  ['pointerup', 'pointercancel', 'pointerleave', 'blur'].forEach(ev => btn.addEventListener(ev, reset));
  return btn;
}

function openClearAccountPopup() {
  showPopup({
    icon: '☠️',
    title: 'Erase your hoard?',
    sub: 'Every card, serial, grade, coin and battle record on this account is wiped forever — hold the button to confirm. This cannot be undone.',
    confirmLabel: 'Hold to erase',
    holdMs: 1500,
    onConfirm: clearAccountData,
  });
}

function clearAccountData() {
  state = freshState();
  saveState();
  if (currentUser) {
    const db = svDb();
    if (db) db.ref(userPath(currentUser.user) + '/state').remove().catch(() => {});
  }
  renderAll();
  showMenu();
  flash('Account data wiped — fresh hoard, fresh start.');
}

/* ============================================================
   AUTH SCREEN — full-screen gate built in JS, no HTML changes.
   ============================================================ */
function showAuth() {
  let screen = $('#authScreen');
  if (!screen) {
    screen = document.createElement('div');
    screen.className = 'auth';
    screen.id = 'authScreen';
    screen.innerHTML = `
      <div class="auth-inner">
        <div class="auth-kicker">Summon · Trade · Dominate</div>
        <h1 class="auth-title">SHADOWVEIL</h1>
        <p class="auth-sub">Sign in to carry your hoard anywhere.</p>
        <div class="auth-tabs">
          <button id="authTabLogin" class="auth-tab on">Log In</button>
          <button id="authTabReg" class="auth-tab">Register</button>
        </div>
        <input id="authUser" class="auth-input" placeholder="Username" maxlength="24" autocomplete="username" spellcheck="false">
        <input id="authPass" class="auth-input" type="password" placeholder="Password" maxlength="64" autocomplete="current-password">
        <button class="primary auth-go" id="authGo">Enter Shadowveil</button>
        <p class="auth-err" id="authErr"></p>
        <p class="auth-note">Accounts live in your own Firebase database.</p>
      </div>`;
    document.body.appendChild(screen);
    $('#authTabLogin').addEventListener('click', () => setAuthMode('login'));
    $('#authTabReg').addEventListener('click', () => setAuthMode('register'));
    $('#authGo').addEventListener('click', submitAuth);
    $('#authPass').addEventListener('keydown', e => { if (e.key === 'Enter') submitAuth(); });
    $('#authUser').addEventListener('keydown', e => { if (e.key === 'Enter') $('#authPass').focus(); });
  }
  screen.classList.remove('hidden');
  setAuthMode(window.__authMode || 'login');
  setTimeout(() => { const u = $('#authUser'); if (u) u.focus(); }, 80);
}
function hideAuth() {
  const screen = $('#authScreen');
  if (screen) screen.classList.add('hidden');
}
function setAuthMode(mode) {
  window.__authMode = mode;
  $('#authTabLogin').classList.toggle('on', mode === 'login');
  $('#authTabReg').classList.toggle('on', mode === 'register');
  const go = $('#authGo');
  if (go) {
    go.disabled = false;
    go.textContent = mode === 'register' ? 'Create Account' : 'Enter Shadowveil';
  }
  const err = $('#authErr');
  if (err) { err.textContent = ''; err.classList.remove('show'); }
}
function authError(msg) {
  const err = $('#authErr');
  if (err) { err.textContent = msg; err.classList.add('show'); }
}
async function submitAuth() {
  const user = sanitizeUser($('#authUser').value);
  const pw = $('#authPass').value || '';
  if (!user) return authError('Enter a username (letters, numbers, dots, underscores).');
  if (window.__authMode === 'register' && pw.length < 6) return authError('Password needs at least 6 characters.');
  if (!pw) return authError('Enter your password.');
  const go = $('#authGo');
  go.disabled = true;
  go.textContent = '…';
  authError('');
  try {
    if (window.__authMode === 'register') await register(user, pw);
    else await login(user, pw);
  } catch (e) {
    authError(e.message || 'Could not sign in.');
    go.disabled = false;
    go.textContent = window.__authMode === 'register' ? 'Create Account' : 'Enter Shadowveil';
  }
}

/* ---- boot: restore a session, otherwise gate the game ---- */
async function authBoot() {
  const saved = safeParse(localStorage.getItem(SESSION_KEY));
  if (saved && saved.user) {
    const ok = await verifySession(saved.user, saved.hash);
    if (ok) {
      await enterGame(saved.user, saved.hash);
      return;
    }
  }
  localStorage.removeItem(SESSION_KEY);
  currentUser = null;
  showAuth();
}
authBoot();
