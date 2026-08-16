/* ============================================================
   BATTLE ARENA — you pick your coven first. Three rounds.
   The loser surrenders their best card played to the winner.
   ============================================================ */
const pSquad = $('#pSquad'), bSquad = $('#bSquad');
const roundLog = $('#roundLog'), resultBanner = $('#resultBanner');
const battlePit = $('#battlePit'), picker = $('#picker'), squadSlots = $('#squadSlots');
const battleHud = $('#battleHud'), youBar = $('#youBar'), themBar = $('#themBar'), youPts = $('#youPts'), themPts = $('#themPts');
const roundTicker = $('#roundTicker'), rewardBox = $('#rewardBox'), rewardGlow = $('#rewardGlow');
const rewardTitle = $('#rewardTitle'), rewardSub = $('#rewardSub'), rewardCard = $('#rewardCard'), rewardFoot = $('#rewardFoot');
let candidatePool = [], picked = [null, null, null], playerSquad = [], botSquad = [], battleActive = false, botArtifacts = [];

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

/* ---- relic played popup: the artifact card flashes up on screen ---- */
function relicPopup(art, who) {
  const pop = document.createElement('div');
  pop.className = 'relic-pop ' + (who === 'player' ? 'yours' : 'theirs');
  const tag = document.createElement('span');
  tag.className = 'rp-tag';
  tag.textContent = who === 'player' ? '✦ YOU PLAYED' : '☠ THE ENEMY PLAYED';
  pop.appendChild(tag);
  pop.appendChild(buildArtifactTile(art, 'pop'));
  document.body.appendChild(pop);
  void pop.offsetWidth;
  pop.classList.add('in');
  setTimeout(() => {
    pop.classList.add('out');
    setTimeout(() => pop.remove(), 420);
  }, 1250);
}
function openPicker() {
  battleActive = false;
  document.body.classList.remove('in-fight');
  document.getElementById('squadSlots').classList.remove('hidden');
  picked = [null, null, null];
  $('#statsPanel').classList.add('hidden');
  resultBanner.classList.add('hidden');
  roundLog.textContent = '';
  battlePit.classList.add('hidden');
  battleHud.classList.add('hidden');
  rewardBox.classList.add('hidden');
  document.querySelector('.picker-wrap').classList.remove('hidden');
  $('#arenaBack').classList.remove('hidden');
  $('#arenaSub').textContent = 'Pick a brute, a stalker and a mystic. Fights are turn-based — burn your one-use relics mid-duel. Lose, and the enemy walks off with your crown jewel.';
  // candidates: every bound creature, topped up with loaners so a legal coven is always possible.
  // duplicate copies of the same creature collapse into their best instance for the arena.
  const seen = new Set();
  candidatePool = state.owned
    .map(o => { const e = effPlayer(findPlayer(o.name), o); if (e) e.rec = o; return e; })
    .filter(Boolean)
    .sort((a, b) => ovr(b) - ovr(a))
    .filter(p => { if (seen.has(p.name)) return false; seen.add(p.name); return true; });
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
  /* The enemy scopes your coven and drafts to match it — for each slot
     it hunts the card whose OVR sits closest to your pick, so it never
     fields a random bronze against your crown jewel. */
  const targets = playerSquad.map(p => ovr(p));
  const take = (i, fit) => {
    let best = null, bestDist = Infinity;
    for (let t = 0; t < 300; t++) {
      const c = pickCard();
      if (!fit(c) || used.has(c.name)) continue;
      const dist = Math.abs(ovr(c) - targets[i]);
      if (dist < bestDist) { bestDist = dist; best = c; }
    }
    if (best) { used.add(best.name); return best; }
    for (let t = 0; t < 300; t++) {
      const c = pickCard();
      if (fit(c) && !used.has(c.name)) { used.add(c.name); return c; }
    }
    return null;
  };
  const brute = take(0, p => slotFit(p).includes(0));
  const stalker = take(1, p => slotFit(p).includes(1));
  const mystic = take(2, p => slotFit(p).includes(2));
  return [brute, stalker, mystic].filter(Boolean);
}

/* The best BATTLE_ART_CAP relic stacks come to the fight — a stack
   counts as one relic whether it holds one copy or a full stack. */
function battleArtifacts(list, cap) {
  return (list || [])
    .slice()
    .sort((a, b) => (findArtifact(b.name) ? findArtifact(b.name).price : 0) - (findArtifact(a.name) ? findArtifact(a.name).price : 0))
    .slice(0, cap);
}
function rollBotArtifacts() {
  /* The enemy packs a real loadout — mostly 2-4 relics, heavily
     weighted toward the legendary ones. Rare relics come stacked so a
     big duel can hinge on a saved drain or stun. */
  const r = Math.random();
  const n = r < 0.12 ? 0 : r < 0.3 ? 1 : 2 + Math.floor(Math.random() * 3);
  const pool = [];
  ARTIFACTS.forEach(a => {
    for (let i = 0; i < (a.tier === 'rare' ? 24 : 10); i++) pool.push(a);
  });
  const names = [];
  let guard = 0;
  while (names.length < n && guard++ < 40) {
    const a = pool[Math.floor(Math.random() * pool.length)];
    if (!names.includes(a.name)) names.push(a.name);
  }
  return names.map(name => {
    const a = findArtifact(name);
    const count = a.tier === 'rare'
      ? 1 + Math.floor(Math.random() * Math.min(2, ARTIFACT_STACK - 1))
      : 1;
    return { name, count };
  });
}
function showBotArtifacts() {
  const old = document.getElementById('botArtRow');
  if (old) old.remove();
  if (!botArtifacts || !botArtifacts.length) return;
  const row = document.createElement('div');
  row.id = 'botArtRow';
  row.className = 'bot-art-row';
  row.innerHTML = '<span class="bot-art-label">Relics</span>' + botArtifacts.map(a => {
    const art = findArtifact(a.name);
    return `<span class="bot-art" title="${art.name} — ${art.desc}">${art.icon}<b>×${a.count}</b></span>`;
  }).join('');
  bSquad.parentElement.appendChild(row);
}

/* One duel = one of your creatures against one of theirs, decided
   turn by turn. On your turn: attack, or burn a one-use artifact. */
function startFight() {
  if (battleActive) return;
  battleActive = true;
  document.body.classList.add('in-fight');
  document.getElementById('squadSlots').classList.add('hidden');
  playerSquad = [0, 1, 2].map(i => candidatePool.find(x => x.name === picked[i]));
  botSquad = buildBotSquad();
  botArtifacts = rollBotArtifacts();
  document.querySelector('.picker-wrap').classList.add('hidden');
  $('#arenaBack').classList.add('hidden');
  $('#arenaSub').textContent = 'Three duels, decided turn by turn. Burn your relics to tip the scales — each side brings at most ' + BATTLE_ART_CAP + ' into battle.';
  battleHud.classList.remove('hidden');
  setScore(0, 0);
  $$('#roundTicker span').forEach((s, i) => { s.className = ''; s.dataset.round = i; });
  battlePit.classList.remove('hidden');
  pSquad.innerHTML = ''; bSquad.innerHTML = '';
  playerSquad.forEach((p, i) => { const c = buildCard({ ...p }, 'b-card'); c.id = 'pc' + i; pSquad.appendChild(c); });
  botSquad.forEach((p, i) => { const c = buildCard({ ...p }, 'b-card'); c.id = 'bc' + i; bSquad.appendChild(c); });
  showBotArtifacts();
  roundLog.textContent = 'The enemy conjures its coven…';
  $('#arenaActions').innerHTML = '';

  let pScore = 0, bScore = 0, round = 0;
  let pcHP = 0, bcHP = 0;
  let pMult = 1, bMult = 1, pShield = false, bShield = false, pStun = false, bStun = false;
  let pRoundDmg = 0, bRoundDmg = 0;
  const rounds = [];
  const hpOf = p => Math.round(60 + ovr(p) * 1.8);

  function setHP(el, hp, max) {
    const pct = Math.max(0, Math.min(100, hp / max * 100));
    const bar = el.querySelector('.hp-bar');
    if (!bar) return;
    bar.querySelector('i').style.width = pct + '%';
    bar.querySelector('i').classList.toggle('low', hp / max < .35);
    bar.querySelector('b').textContent = Math.max(0, Math.round(hp));
  }
  function disableActs(container) {
    [...container.querySelectorAll('button')].forEach(b => { b.disabled = true; b.style.opacity = .5; });
  }

  function roundStep() {
    if (!battleActive) return;
    if (round >= 3) { finishMatch(rounds, pScore, bScore); return; }
    const pc = playerSquad[round], bc = botSquad[round];
    const pEl = $('#pc' + round), bEl = $('#bc' + round);
    const max = hpOf(pc);
    pcHP = max; bcHP = hpOf(bc);
    pMult = 1; bMult = 1; pShield = false; bShield = false; pStun = false; bStun = false;
    pRoundDmg = 0; bRoundDmg = 0;
    roundBanner(round + 1, pc, bc);
    [pEl, bEl].forEach(el => {
      if (!el.querySelector('.hp-bar')) {
        const bar = document.createElement('div');
        bar.className = 'hp-bar';
        bar.innerHTML = '<i></i><b></b>';
        el.appendChild(bar);
      }
    });
    setHP(pEl, pcHP, max); setHP(bEl, bcHP, hpOf(bc));
    roundLog.innerHTML = `Round ${round + 1}: <b>${pc.name}</b> vs <b>${bc.name}</b> — your move.`;
    playerTurn(pc, bc, pEl, bEl);
  }

  function playerTurn(pc, bc, pEl, bEl) {
    if (!battleActive) return;
    if (pStun) {
      pStun = false;
      roundLog.innerHTML = '❄️ Frost binds your fighter — the turn slips away.';
      setTimeout(() => botTurn(pc, bc, pEl, bEl), 1000);
      return;
    }
    const acts = $('#arenaActions');
    acts.innerHTML = `<button class="primary" id="atkBtn">⚔️ Attack</button>`;
    const atk = $('#atkBtn');
    atk.addEventListener('click', () => { disableActs(acts); playerAttack(pc, bc, pEl, bEl); });
    (battleArtifacts(state.artifacts, BATTLE_ART_CAP)).forEach(a => {
      const art = findArtifact(a.name);
      if (!art) return;
      const b = document.createElement('button');
      b.className = 'art-btn tier-' + art.tier;
      b.title = `${art.name} ×${a.count}`;
      b.innerHTML = `<span class="at-ico">${art.icon}</span><span class="at-count">×${a.count}</span>`;
      b.addEventListener('click', () => { disableActs(acts); useArtifactInBattle(art, pc, bc, pEl, bEl); });
      acts.appendChild(b);
    });
  }

  function playerAttack(pc, bc, pEl, bEl) {
    if (!battleActive) return;
    let dmg = ovr(pc) * (0.85 + Math.random() * .3);
    if (bShield) {
      bShield = false;
      roundLog.innerHTML = `🛡️ <b>${bc.name}</b>'s ward deflects your blow — no damage.`;
      damageNum(bEl, 0, true);
    } else {
      if (pMult > 1) { dmg *= pMult; pMult = 1; }
      bcHP -= dmg;
      setHP(bEl, bcHP, hpOf(bc));
      damageNum(bEl, dmg, true);
      roundLog.innerHTML = `⚔️ You strike <b>${bc.name}</b> for <b>${Math.round(dmg)}</b> — ${Math.max(0, Math.round(bcHP))} HP left`;
    }
    pRoundDmg += dmg; pScore += dmg;
    setScore(pScore, bScore);
    if (bcHP <= 0) { endRound(true, pc, bc, pEl, bEl); return; }
    setTimeout(() => botTurn(pc, bc, pEl, bEl), 1150);
  }

  function useArtifactInBattle(art, pc, bc, pEl, bEl) {
    if (!battleActive) return;
    if (!spendArtifact(art.name)) return;
    relicPopup(art, 'player');
    if (art.effect === 'drain') {
      const dmg = ovr(pc) * 1.4;
      bcHP -= dmg;
      pcHP = Math.min(hpOf(pc), pcHP + dmg * .5);
      setHP(pEl, pcHP, hpOf(pc)); setHP(bEl, bcHP, hpOf(bc));
      pRoundDmg += dmg; pScore += dmg;
      damageNum(bEl, dmg, true);
      setScore(pScore, bScore);
      roundLog.innerHTML = `💀 <b>${art.name}</b> drains <b>${bc.name}</b> for <b>${Math.round(dmg)}</b> — you siphon health back.`;
      if (bcHP <= 0) { endRound(true, pc, bc, pEl, bEl); return; }
    } else {
      applyArtifact(art, 'player', pc, bc, pEl, bEl);
      roundLog.innerHTML = `🔮 You unleash <b>${art.name}</b> ${art.icon} — ${art.desc}`;
    }
    setTimeout(() => botTurn(pc, bc, pEl, bEl), 1100);
  }

  function applyArtifact(art, who, pc, bc, pEl, bEl) {
    if (who === 'player') {
      switch (art.effect) {
        case 'double': pMult = 2; break;
        case 'triple': pMult = 3; break;
        case 'heal': pcHP = hpOf(pc); setHP(pEl, pcHP, hpOf(pc)); break;
        case 'shield': pShield = true; break;
        case 'stun': bStun = true; break;
      }
    } else {
      switch (art.effect) {
        case 'double': bMult = 2; break;
        case 'triple': bMult = 3; break;
        case 'heal': bcHP = hpOf(bc); setHP(bEl, bcHP, hpOf(bc)); break;
        case 'shield': bShield = true; break;
        case 'stun': pStun = true; break;
      }
    }
  }

  function botTurn(pc, bc, pEl, bEl) {
    if (!battleActive) return;
    if (bStun) {
      bStun = false;
      roundLog.innerHTML = `❄️ <b>${bc.name}</b> is frozen solid and skips its turn.`;
      setTimeout(() => playerTurn(pc, bc, pEl, bEl), 1100);
      return;
    }
    const usable = botArtifacts.filter(x => x.count > 0);
    const pAvg = ovr(pc) * 1.0;
    const bAvg = ovr(bc) * 1.0;
    const drainDmg = ovr(bc) * 1.4;
    const pMax = hpOf(pc), bMax = hpOf(bc);
    const playerBuffed = pMult > 1;
    const playerKills = pAvg >= bcHP;         // player's next hit can finish us
    const botKills = bAvg >= pcHP && !pShield; // a plain attack ends it

    const attack = () => {
      let dmg = ovr(bc) * (0.85 + Math.random() * .3);
      if (pShield) {
        pShield = false;
        roundLog.innerHTML = `🛡️ Your <b>${pc.name}</b> deflects the enemy's blow — no damage.`;
        damageNum(pEl, 0, false);
      } else {
        if (bMult > 1) { dmg *= bMult; bMult = 1; }
        pcHP -= dmg;
        setHP(pEl, pcHP, hpOf(pc));
        damageNum(pEl, dmg, false);
        roundLog.innerHTML = `💥 <b>${bc.name}</b> hits <b>${pc.name}</b> for <b>${Math.round(dmg)}</b> — ${Math.max(0, Math.round(pcHP))} HP left`;
      }
      bRoundDmg += dmg; bScore += dmg;
      setScore(pScore, bScore);
      if (pcHP <= 0) { endRound(false, pc, bc, pEl, bEl); return; }
      setTimeout(() => playerTurn(pc, bc, pEl, bEl), 1150);
    };
    const useArt = (slot, art) => {
      slot.count--;
      relicPopup(art, 'bot');
      if (art.effect === 'drain') {
        const dmg = ovr(bc) * 1.4;
        pcHP -= dmg;
        bcHP = Math.min(hpOf(bc), bcHP + dmg * .5);
        setHP(pEl, pcHP, hpOf(pc)); setHP(bEl, bcHP, hpOf(bc));
        bRoundDmg += dmg; bScore += dmg;
        damageNum(pEl, dmg, false);
        setScore(pScore, bScore);
        roundLog.innerHTML = `💀 <b>${bc.name}</b> unleashes <b>${art.name}</b>, draining <b>${pc.name}</b> for <b>${Math.round(dmg)}</b>`;
        if (pcHP <= 0) { endRound(false, pc, bc, pEl, bEl); return; }
      } else {
        applyArtifact(art, 'bot', pc, bc, pEl, bEl);
        roundLog.innerHTML = `🌀 The enemy unleashes <b>${art.name}</b> ${art.icon} — ${art.desc}`;
      }
      setTimeout(() => playerTurn(pc, bc, pEl, bEl), 1100);
    };

    /* The enemy holds its relics like they cost something. No cold
       opens at full health — it attacks, and only spends when the
       round is decided: to take the kill, to deflect a buffed blow,
       or to drag itself out of death's reach. */
    const decide = () => {
      const has = {}, slots = {};
      usable.forEach(x => {
        const a = findArtifact(x.name);
        if (!a) return;
        has[a.effect] = true;
        slots[a.effect] = x;
      });
      if (bMult > 1) return 'attack';           // a loaded buff must be unleashed
      if (botKills) return 'attack';            // take the sure kill
      // drain that ends the round — damage now, and it tops us up
      if (has.drain && drainDmg >= pcHP && !pShield) return slots.drain;

      // the one cold read: deflect a buffed hit entirely
      if (has.shield && playerBuffed) return slots.shield;
      // top up when the next hit kills us or we're badly hurt
      if (has.heal && bcHP < bMax * 0.85 && (playerKills || bcHP < bMax * 0.4)) return slots.heal;
      // or deny a plain lethal hit
      if (has.shield && playerKills) return slots.shield;
      // stun to skip a lethal turn when nothing else will do
      if (has.stun && playerKills) return slots.stun;

      // buff only to close the kill — never as an opener. The round
      // must have cost the player health already (we've struck once)
      // and cost us health too, and we must survive the counter.
      // Never spend into their ward.
      if (has.triple && !pShield && pcHP < pMax && bcHP < bMax * 0.7 && pcHP > bAvg && pcHP <= bAvg * 3 && bcHP > pAvg) return slots.triple;
      if (has.double && !pShield && pcHP < pMax && bcHP < bMax * 0.7 && pcHP > bAvg && pcHP <= bAvg * 2 && bcHP > pAvg) return slots.double;

      // behind on health? drain keeps the pressure and tops us up
      if (has.drain && pcHP < pMax && bcHP < bMax * 0.6) return slots.drain;

      return 'attack';                          // otherwise hold the relics
    };

    const plan = decide();
    if (plan === 'attack') return attack();
    return useArt(plan, findArtifact(plan.name));
  }

  function endRound(pWin, pc, bc, pEl, bEl) {
    rounds.push({ pc, bc, ps: pRoundDmg, bs: bRoundDmg, pWin });
    pEl.classList.add(pWin ? 'round-win' : 'round-lose');
    bEl.classList.add(pWin ? 'round-lose' : 'round-win');
    markTicker(round, pWin);
    roundLog.innerHTML = `Round ${round + 1}: <b>${pc.name}</b> ${pWin ? 'stands victorious' : 'falls'} — ${pWin ? 'you' : 'the enemy'} takes the round`;
    round++;
    setTimeout(roundStep, 1350);
  }
  roundStep();
}

function setScore(p, b) {
  const total = Math.max(1, p + b);
  youBar.style.width = (p / total * 100) + '%';
  themBar.style.width = (b / total * 100) + '%';
  youPts.textContent = Math.round(p);
  themPts.textContent = Math.round(b);
}

function markTicker(round, pWin) {
  const s = roundTicker.children[round];
  if (s) s.className = pWin ? 'won' : 'lost';
}

function roundBanner(n, pc, bc) {
  const b = document.createElement('div');
  b.className = 'round-banner';
  b.innerHTML = `<div class="rb-n">Round ${n}</div><div class="rb-fight">${pc.name}<br>vs<br>${bc.name}</div>`;
  battlePit.appendChild(b);
  setTimeout(() => b.remove(), 1300);
}

function damageNum(cardEl, val, win) {
  const d = document.createElement('span');
  d.className = 'dmg ' + (win ? 'win' : 'lose');
  d.textContent = val.toFixed(0);
  cardEl.appendChild(d);
  setTimeout(() => d.remove(), 1100);
}

function finishMatch(rounds, pScore, bScore) {
  const pWins = rounds.filter(r => r.pWin).length;
  const bWins = rounds.length - pWins;
  const matchWon = pWins !== bWins ? pWins > bWins : pScore > bScore;
  const st = state.stats;

  // card records
  playerSquad.forEach(p => {
    const o = p.rec;
    if (o) { o.wins += matchWon ? 1 : 0; o.losses += matchWon ? 0 : 1; o.streak = matchWon ? o.streak + 1 : 0; }
  });

  // level shifts — a strong W/L record promotes, sustained losses de-rank
  const shifts = [];
  playerSquad.forEach(p => {
    const o = p.rec;
    if (!o) return;
    const dir = checkLevelShift(o);
    if (dir) {
      const { prev, level } = applyLevelShift(o, dir);
      shifts.push({ name: o.name, prev, level, dir });
    }
  });

  let claimed = null, surrendered = null, jewelV = 0;
  let overflowPending = null;
  if (matchWon) {
    const bestBot = [...botSquad].sort((a, b) => ovr(b) - ovr(a))[0];
    const inst = makeInstance(bestBot.name, { wins: 1, streak: 1 });
    if (hoardFull()) {
      // album page is full — the win is real but the slot is decided after the reward
      overflowPending = { instance: inst, player: bestBot };
    } else {
      state.owned.push(inst);
    }
    claimed = bestBot;
  } else {
    // defeat costs the crown jewel — the single most valuable instance in the whole collection
    const jewel = crownJewel();
    if (jewel) {
      surrendered = jewel.p;
      jewelV = jewel.v;
      state.owned = state.owned.filter(x => x.id !== jewel.o.id);
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

  if (matchWon) {
    resultBanner.style.borderColor = 'rgba(74,222,128,.65)';
    resultBanner.innerHTML = `🏆 Victory — you claim <b>${claimed.name}</b> (OVR ${ovr(claimed)}) from the enemy's coven!`;
  } else if (surrendered) {
    resultBanner.style.borderColor = 'rgba(255,80,80,.65)';
    resultBanner.innerHTML = `💔 Defeat — the enemy claims your crown jewel, <b>${surrendered.name}</b> (worth ${coin()}${jewelV}), into its hoard.`;
  } else {
    resultBanner.style.borderColor = 'rgba(255,80,80,.65)';
    resultBanner.innerHTML = `💔 Defeat — your loaner coven escapes, but the enemy takes the glory.`;
  }

  showReward(matchWon, claimed, surrendered, jewelV);

  if (overflowPending) {
    setTimeout(() => {
      flash(`The album page is full (${MAX_HOARD}/${MAX_HOARD}) — decide what happens to your win.`);
      resolveHoardOverflow([overflowPending], () => {
        overflowPending = null;
        renderCollection();
        saveState();
      });
    }, 3600);
  }

  shifts.forEach((s, i) => setTimeout(() => showLevelToast(s), 3600 + i * 2800));

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
  document.body.classList.remove('in-fight');
}

function showReward(matchWon, claimed, surrendered, jewelV) {
  const card = claimed || surrendered;
  if (!card) return;
  rewardCard.innerHTML = '';
  rewardCard.appendChild(buildCard({ ...card }, 'reward-draw', true));
  if (matchWon) {
    rewardGlow.className = 'reward-glow win';
    rewardTitle.textContent = '🏆 Claimed';
    rewardTitle.className = 'reward-title win';
    rewardSub.textContent = `${card.name} joins your hoard`;
  } else {
    rewardGlow.className = 'reward-glow lose';
    rewardTitle.textContent = '💔 Lost';
    rewardTitle.className = 'reward-title lose';
    rewardSub.textContent = `The enemy seizes ${card.name}${jewelV ? ' · worth ' + coin() + jewelV : ''}`;
  }
  rewardFoot.textContent = matchWon ? 'A new creature bound to your hoard' : 'Your crown jewel is theirs now';
  rewardBox.classList.remove('hidden');
  void rewardBox.offsetWidth;
  rewardBox.classList.add('pop');
  if (matchWon) burstReward(rewardBox);
  setTimeout(() => {
    rewardBox.classList.add('hidden');
    rewardBox.classList.remove('pop');
  }, 3400);
}

function burstReward(box) {
  for (let i = 0; i < 12; i++) {
    const s = document.createElement('span');
    s.className = 'spark';
    s.textContent = ['✦', '★', '◆'][i % 3];
    s.style.left = (box.offsetLeft + Math.random() * box.offsetWidth) + 'px';
    s.style.top = (box.offsetTop + Math.random() * box.offsetHeight) + 'px';
    s.style.animationDelay = (Math.random() * .4) + 's';
    document.body.appendChild(s);
    setTimeout(() => s.remove(), 1600);
  }
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
