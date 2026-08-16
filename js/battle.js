/* ============================================================
   BATTLE ARENA — you pick your coven first. Three rounds.
   The loser surrenders their best card played to the winner.
   ============================================================ */
const pSquad = $('#pSquad'), bSquad = $('#bSquad');
const roundLog = $('#roundLog'), resultBanner = $('#resultBanner');
const battlePit = $('#battlePit'), picker = $('#picker'), squadSlots = $('#squadSlots');
let candidatePool = [], picked = [null, null, null], playerSquad = [], botSquad = [], battleActive = false;

const SLOT_ROLES = ['Brute', 'Stalker', 'Mystic'];
const ROLE_ICONS = ['💪', '🌙', '🔮'];
function slotFit(p) {
  if (p.role === 'Warden') return [0, 1, 2];
  if (p.role === 'Brute') return [0];
  if (p.role === 'Stalker') return [1];
  return [2]; // Mystic
}
function addLoan(qualify) {
  for (let t = 0; t < 300; t++) {
    const c = pickCard();
    if (qualify(c) && !candidatePool.some(x => x.name === c.name)) { candidatePool.push(c); return; }
  }
}
function openPicker() {
  battleActive = false;
  picked = [null, null, null];
  $('#statsPanel').classList.add('hidden');
  resultBanner.classList.add('hidden');
  roundLog.textContent = '';
  battlePit.classList.add('hidden');
  document.querySelector('.picker-wrap').classList.remove('hidden');
  $('#arenaSub').textContent = 'Pick a brute, a stalker and a mystic — lose, and the enemy walks off with your crown jewel.';
  // candidates: every bound creature, topped up with loaners so a legal coven is always possible
  const owned = state.owned.map(o => findPlayer(o.name)).filter(Boolean).sort((a, b) => ovr(b) - ovr(a));
  candidatePool = [...owned];
  while (candidatePool.length < 3) {
    const c = pickCard();
    if (!candidatePool.some(x => x.name === c.name)) candidatePool.push(c);
  }
  if (!candidatePool.some(x => slotFit(x).includes(0))) addLoan(p => slotFit(p).includes(0));
  if (!candidatePool.some(x => slotFit(x).includes(1))) addLoan(p => slotFit(p).includes(1));
  if (!candidatePool.some(x => slotFit(x).includes(2))) addLoan(p => slotFit(p).includes(2));
  renderPicker();
  renderSlots();
}

function renderPicker() {
  picker.innerHTML = '';
  candidatePool.forEach(p => {
    const card = buildCard({ ...p }, 'p-card');
    card.dataset.name = p.name;
    if (!state.owned.some(o => o.name === p.name)) {
      const tag = document.createElement('span');
      tag.className = 'loan-tag';
      tag.textContent = 'Loan';
      card.appendChild(tag);
    }
    card.addEventListener('click', () => togglePick(p.name));
    picker.appendChild(card);
  });
  $$('.p-card').forEach(el => el.classList.toggle('picked', picked.includes(el.dataset.name)));
}

function togglePick(name) {
  const idx = picked.indexOf(name);
  if (idx >= 0) { picked[idx] = null; }
  else {
    const p = candidatePool.find(x => x.name === name);
    const slot = slotFit(p).find(i => picked[i] === null);
    if (slot !== undefined) picked[slot] = name;
  }
  renderPicker();
  renderSlots();
}

function renderSlots() {
  squadSlots.innerHTML = '';
  for (let i = 0; i < 3; i++) {
    const slot = document.createElement('div');
    slot.className = 'slot' + (picked[i] ? ' filled' : '');
    const p = candidatePool.find(x => x.name === picked[i]);
    const head = `${ROLE_ICONS[i]} ${SLOT_ROLES[i]}`;
    slot.innerHTML = p
      ? `<span class="s-num">${head}</span><span class="s-name">${p.name}</span><span class="s-ovr">OVR ${ovr(p)} · ${p.role}</span>`
      : `<span class="s-num">${head}</span><span class="s-name">—</span>`;
    squadSlots.appendChild(slot);
  }
  const ready = picked.every(Boolean);
  $('#arenaActions').innerHTML = `<button class="primary" id="fightBtn" ${ready ? '' : 'disabled'}>Fight</button>`;
  const fb = $('#fightBtn');
  if (fb) fb.addEventListener('click', () => { if (ready) startFight(); });
}

function buildBotSquad() {
  const used = new Set(playerSquad.map(p => p.name));
  const take = (fit) => {
    for (let t = 0; t < 300; t++) {
      const c = pickCard();
      if (fit(c) && !used.has(c.name)) { used.add(c.name); return c; }
    }
    return null;
  };
  const brute = take(p => slotFit(p).includes(0));
  const stalker = take(p => slotFit(p).includes(1));
  const mystic = take(p => slotFit(p).includes(2));
  return [brute, stalker, mystic].filter(Boolean);
}

function startFight() {
  if (battleActive) return;
  battleActive = true;
  playerSquad = [0, 1, 2].map(i => candidatePool.find(x => x.name === picked[i]));
  botSquad = buildBotSquad();
  document.querySelector('.picker-wrap').classList.add('hidden');
  $('#arenaSub').textContent = 'The hunt is on — three rounds decide it.';
  battlePit.classList.remove('hidden');
  pSquad.innerHTML = ''; bSquad.innerHTML = '';
  playerSquad.forEach((p, i) => { const c = buildCard({ ...p }, 'b-card'); c.id = 'pc' + i; pSquad.appendChild(c); });
  botSquad.forEach((p, i) => { const c = buildCard({ ...p }, 'b-card'); c.id = 'bc' + i; bSquad.appendChild(c); });
  roundLog.textContent = 'The enemy conjures its coven…';
  $('#arenaActions').innerHTML = '';
  let pScore = 0, bScore = 0, round = 0;
  const rounds = [];

  function roundStep() {
    if (round >= 3) { finishMatch(rounds, pScore, bScore); return; }
    const pc = playerSquad[round], bc = botSquad[round];
    const pEl = $('#pc' + round), bEl = $('#bc' + round);
    pEl.classList.add('fight'); bEl.classList.add('fight');
    roundLog.innerHTML = `Round ${round + 1}: <b>${pc.name}</b> vs <b>${bc.name}</b>…`;
    setTimeout(() => {
      pEl.classList.remove('fight'); bEl.classList.remove('fight');
      const ps = ovr(pc) * (0.85 + Math.random() * .3);
      const bs = ovr(bc) * (0.85 + Math.random() * .3);
      const pWin = ps > bs;
      rounds.push({ pc, bc, ps, bs, pWin });
      pScore += ps; bScore += bs;
      pEl.classList.add(pWin ? 'round-win' : 'round-lose');
      bEl.classList.add(pWin ? 'round-lose' : 'round-win');
      roundLog.innerHTML = `Round ${round + 1}: <b>${pc.name}</b> ${ps.toFixed(0)} vs ${bs.toFixed(0)} <b>${bc.name}</b> — ${pWin ? 'you' : 'the enemy'} takes it`;
      setTimeout(() => { round++; roundStep(); }, 1150);
    }, 850);
  }
  roundStep();
}

function finishMatch(rounds, pScore, bScore) {
  const pWins = rounds.filter(r => r.pWin).length;
  const bWins = rounds.length - pWins;
  const matchWon = pWins !== bWins ? pWins > bWins : pScore > bScore;
  const st = state.stats;

  // card records
  playerSquad.forEach(p => {
    const o = state.owned.find(x => x.name === p.name);
    if (o) { o.wins += matchWon ? 1 : 0; o.losses += matchWon ? 0 : 1; o.streak = matchWon ? o.streak + 1 : 0; }
  });

  let claimed = null, surrendered = null;
  if (matchWon) {
    const bestBot = [...botSquad].sort((a, b) => ovr(b) - ovr(a))[0];
    if (!state.owned.some(o => o.name === bestBot.name)) {
      state.owned.push({ name: bestBot.name, wins: 1, losses: 0, streak: 1 });
    } else {
      const o = state.owned.find(x => x.name === bestBot.name);
      o.wins++; o.streak++;
    }
    claimed = bestBot;
    resultBanner.style.borderColor = 'rgba(74,222,128,.65)';
    resultBanner.innerHTML = `🏆 Victory — you claim <b>${bestBot.name}</b> (OVR ${ovr(bestBot)}) from the enemy's coven!`;
  } else {
    // defeat costs the crown jewel — the single most valuable card in the whole collection
    const jewel = crownJewel();
    surrendered = jewel ? jewel.p : null;
    if (jewel) {
      state.owned = state.owned.filter(o => o.name !== jewel.p.name);
      resultBanner.style.borderColor = 'rgba(255,80,80,.65)';
      resultBanner.innerHTML = `💔 Defeat — the enemy claims your crown jewel, <b>${jewel.p.name}</b> (worth ${coin()}${jewel.v}), into its hoard.`;
    } else {
      resultBanner.style.borderColor = 'rgba(255,80,80,.65)';
      resultBanner.innerHTML = `💔 Defeat — your loaner coven escapes, but the enemy takes the glory.`;
    }
  }

  // career stats
  st.battles++;
  st.wins += matchWon ? 1 : 0;
  st.losses += matchWon ? 0 : 1;
  st.won += claimed ? 1 : 0;
  st.lost += surrendered ? 1 : 0;
  st.streak = matchWon ? st.streak + 1 : 0;

  saveState();
  updateWallet();
  refreshPackHint();
  renderCollection();
  resultBanner.classList.remove('hidden');
  roundLog.textContent = `Rounds ${pWins}–${bWins} · ` + (matchWon ? 'victory is yours' : 'the enemy prevails');

  // match report
  $('#statsPanel').innerHTML = statsHTML(rounds, pScore, bScore, matchWon, claimed, surrendered);
  $('#arenaActions').innerHTML = `
    <button id="statsBtn">View Match Stats</button>
    <button id="rematchBtn">Pick New Coven</button>
    <button class="primary" id="packBtn">Back to Menu</button>`;
  $('#statsBtn').addEventListener('click', () => {
    const panel = $('#statsPanel');
    const showing = !panel.classList.contains('hidden');
    panel.classList.toggle('hidden');
    $('#statsBtn').textContent = showing ? 'View Match Stats' : 'Hide Match Stats';
  });
  $('#rematchBtn').addEventListener('click', openPicker);
  $('#packBtn').addEventListener('click', showMenu);
  battleActive = false;
}

function statsHTML(rounds, pScore, bScore, matchWon, claimed, surrendered) {
  const st = state.stats;
  const pWins = rounds.filter(r => r.pWin).length;
  const pct = st.battles ? Math.round((st.wins / st.battles) * 100) : 0;
  const motm = [...rounds].sort((a, b) => (b.ps - b.bs) - (a.ps - a.bs))[0];
  const margin = (motm.ps - motm.bs).toFixed(0);
  const rows = rounds.map((r, i) => `
    <div class="s-row ${r.pWin ? 'ok' : 'no'}">
      <span class="s-rn">R${i + 1}</span>
      <span class="s-nm">${r.pc.name}</span>
      <span class="s-sc">${r.ps.toFixed(0)} — ${r.bs.toFixed(0)}</span>
      <span class="s-nm r">${r.bc.name}</span>
      <span class="s-res">${r.pWin ? 'You' : 'Enemy'}</span>
    </div>`).join('');
  const tile = (label, val, cls = '') => `<div class="s-tile ${cls}"><b>${val}</b><span>${label}</span></div>`;
  const prize = claimed ? `Claimed <b>${claimed.name}</b>` : surrendered ? `Lost <b>${surrendered.name}</b>` : 'No cards changed hands';
  return `
    <div class="stats-head"><b>Match Report</b><span>Rounds ${pWins}–${rounds.length - pWins} · ${matchWon ? 'Victory' : 'Defeat'}</span></div>
    <div class="stats-grid">
      ${tile('Battles', st.battles)}
      ${tile('Wins', st.wins, 'hot')}
      ${tile('Losses', st.losses, 'bad')}
      ${tile('Win Rate', pct + '%', pct >= 50 ? 'hot' : 'bad')}
      ${tile('Streak', st.streak, st.streak > 0 ? 'hot' : '')}
      ${tile('Cards Won', st.won, 'hot')}
      ${tile('Cards Lost', st.lost, 'bad')}
    </div>
    <div class="s-rows">${rows}</div>
    <div class="stats-foot">🏅 Champion of the Match: <b>${motm.pc.name}</b> (+${margin}) · Coven ${pScore.toFixed(0)} — ${bScore.toFixed(0)} · ${prize}</div>
  `;
}

packZone.addEventListener('click', openPack);
renderCollection();
updateWallet();
refreshPackHint();
