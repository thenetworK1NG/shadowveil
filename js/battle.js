/* ============================================================
   BATTLE ARENA — you pick your coven first. Three rounds.
   The loser surrenders their best card played to the winner.
   ============================================================ */
const pSquad = $('#pSquad'), bSquad = $('#bSquad');
const resultBanner = $('#resultBanner');
const battlePit = $('#battlePit'), picker = $('#picker'), squadSlots = $('#squadSlots');
const battleHud = $('#battleHud'), youBar = $('#youBar'), themBar = $('#themBar'), youPts = $('#youPts'), themPts = $('#themPts');
const roundTicker = $('#roundTicker'), rewardBox = $('#rewardBox'), rewardGlow = $('#rewardGlow');
const rewardTitle = $('#rewardTitle'), rewardSub = $('#rewardSub'), rewardCard = $('#rewardCard'), rewardFoot = $('#rewardFoot');
const focusPlayerCard = $('#focusPlayerCard'), focusBotCard = $('#focusBotCard'), focusTurn = $('#focusTurn'), focusElement = $('#focusElement');
let candidatePool = [], picked = [null, null, null], playerSquad = [], botSquad = [], battleActive = false, botArtifacts = [];
let battleEpoch = 0, battleTimers = new Set();

/* Turn timers must belong to the fight that created them. Otherwise a
   player who leaves during a duel can have an old bot turn fire in a new
   fight and mutate the wrong match. */
function battleLater(fn, delay) {
  const epoch = battleEpoch;
  const timer = setTimeout(() => {
    battleTimers.delete(timer);
    if (battleActive && epoch === battleEpoch) fn();
  }, delay);
  battleTimers.add(timer);
  return timer;
}
function abortBattle(force = false) {
  if (battleActive && !force) return false;
  battleActive = false;
  battleEpoch++;
  battleTimers.forEach(clearTimeout);
  battleTimers.clear();
  botArtifacts = [];
  return true;
}
window.addEventListener('beforeunload', event => {
  if (!battleActive) return;
  event.preventDefault();
  event.returnValue = '';
});

const SLOT_ROLES = ['Brute', 'Stalker', 'Mystic'];
const SLOT_LABELS = ['Card 1', 'Card 2', 'Card 3'];
const BATTLE_LOSS_GOLD_PER_CARD = 35;
const BATTLE_SURVIVOR_GOLD = 10;
const BATTLE_FULL_TEAM_GOLD = 35;
function slotFit(p) {
  if (p.role === 'Warden') return [0, 1, 2];
  if (p.role === 'Brute') return [0];
  if (p.role === 'Stalker') return [1];
  return [2]; // Mystic
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
function focusCardElement(side) {
  const host = side === 'player' ? focusPlayerCard : focusBotCard;
  return host && host.querySelector('.focus-card');
}
function elementDamageDelta(attacker, defender) {
  return Math.round(ovr(attacker) * (elementMultiplier(attacker, defender).multiplier - 1));
}
function signedDamage(value) { return `${value >= 0 ? '+' : ''}${value}`; }
function effectPop(card, text, kind) {
  if (!card || !text) return;
  const pop = document.createElement('span');
  pop.className = 'effect-pop ' + (kind || 'buff');
  pop.textContent = text;
  card.appendChild(pop);
  setTimeout(() => pop.remove(), 1500);
}
function renderStatusRack(host, statuses) {
  const old = host.querySelector('.status-rack');
  if (old) old.remove();
  const visible = statuses.filter(Boolean);
  if (!visible.length) return;
  const rack = document.createElement('div');
  rack.className = 'status-rack';
  visible.forEach(status => {
    const chip = document.createElement('span');
    chip.className = 'combat-status ' + status.kind;
    chip.textContent = status.text;
    rack.appendChild(chip);
  });
  host.appendChild(rack);
}
function showElementEffect(side, attacker, defender) {
  const delta = elementDamageDelta(attacker, defender);
  if (!delta) return;
  const kind = delta > 0 ? 'element-up' : 'element-down';
  effectPop(focusCardElement(side), signedDamage(delta), kind);
}
function showRelicEffect(who, art) {
  const own = focusCardElement(who);
  const other = focusCardElement(who === 'player' ? 'bot' : 'player');
  if (art.effect === 'double' || art.effect === 'triple') effectPop(own, `NEXT HIT ×${art.effect === 'triple' ? 3 : 2}`, 'buff');
  if (art.effect === 'heal') effectPop(own, 'FULL HEAL', 'heal');
  if (art.effect === 'shield') effectPop(own, 'WARD READY', 'buff');
  if (art.effect === 'stun') effectPop(other, 'STUNNED', 'debuff');
}
function showDrainEffect(who, damage) {
  const own = focusCardElement(who);
  const other = focusCardElement(who === 'player' ? 'bot' : 'player');
  const healed = Math.round(damage * .5);
  effectPop(other, `-${Math.round(damage)}`, 'debuff');
  if (healed) effectPop(own, `+${healed} HP`, 'heal');
}
function bindEnemyPreview(card, enemy, getPlayer) {
  card.classList.add('enemy-previewable');
  card.setAttribute('role', 'button');
  card.setAttribute('tabindex', '0');
  card.setAttribute('aria-label', `Preview ${enemy.name}`);
  const open = () => showEnemyCardPreview(enemy, typeof getPlayer === 'function' ? getPlayer() : getPlayer);
  card.addEventListener('click', open);
  card.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); }
  });
}
function showEnemyCardPreview(enemy, player) {
  const old = document.querySelector('.battle-preview');
  if (old) old.remove();
  const enemyElement = elementInfo(enemy.element);
  const weakElement = elementInfo(enemyElement.weak);
  const strongElement = elementInfo(enemyElement.strong);
  const playerDelta = player ? elementDamageDelta(player, enemy) : 0;
  const enemyDelta = player ? elementDamageDelta(enemy, player) : 0;
  const verdict = delta => delta > 0 ? 'Vulnerable' : delta < 0 ? 'Resists' : 'Neutral';
  const effectRow = (label, source, target, direction) => {
    const delta = elementDamageDelta(source, target);
    const info = elementInfo(source.element);
    const kind = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat';
    return `<div class="battle-vuln-row ${kind}">
      <span><b>${label}</b>${info.icon} ${info.label} <i>→ ${direction}</i></span>
      <strong>${verdict(delta)} · ${signedDamage(delta)} damage</strong>
    </div>`;
  };
  const stat = (label, value, color) => `
    <div class="ci-stat">
      <div class="ci-stat-top"><span>${label}</span><b>${value}</b></div>
      <div class="ci-track"><i style="--w:${value}%;--c:${color}"></i></div>
    </div>`;
  const box = document.createElement('div');
  box.className = 'card-inspect battle-preview';
  box.innerHTML = `
    <div class="ci-inner">
      <div class="ci-card"></div>
      <div class="ci-panel">
        <div class="ci-head">
          <span class="ci-rarity rare-${enemy.rarity}">${RARITY_LABEL[enemy.rarity]}</span>
          <span class="ci-lvl">Enemy · Lv ${enemy.level || enemy.botLevel || 1}</span>
          <span class="ci-role">${enemy.role} · ${enemy.realm}</span>
        </div>
        <div class="ci-stats">
          ${stat('Power', enemy.power, '#ff9d5c')}
          ${stat('Cunning', enemy.cunning, '#7fd4ff')}
          ${stat('Arcana', enemy.arcana, '#d9a7ff')}
        </div>
        <div class="ci-meta">
          <span class="ci-ovr">OVR <b>${ovr(enemy)}</b></span>
          <span class="ci-rec">${enemyElement.icon} ${enemyElement.label}</span>
          <span class="ci-val"><b>Enemy</b></span>
        </div>
        <div class="battle-vulnerabilities">
          <div class="battle-vuln-title">Element matchup</div>
          <div class="battle-vuln-summary"><span>Weak to <b>${weakElement.icon} ${weakElement.label}</b></span><span>Strong vs <b>${strongElement.icon} ${strongElement.label}</b></span></div>
          ${player ? effectRow('Your active', player, enemy, 'enemy') : ''}
          ${player ? effectRow('Enemy attack', enemy, player, 'you') : ''}
          ${!player ? '<div class="battle-vuln-empty">Element matchup appears when the battle is live.</div>' : ''}
        </div>
        <div class="ci-actions"><button class="primary" id="battlePreviewClose">Close Preview</button></div>
      </div>
    </div>`;
  box.querySelector('.ci-card').appendChild(buildCard({ ...enemy }, 'ci-draw', true));
  document.body.appendChild(box);
  requestAnimationFrame(() => {
    box.classList.add('pop');
    box.querySelectorAll('.ci-track i').forEach(track => track.classList.add('fill'));
    box.querySelector('#battlePreviewClose').focus();
  });
  const close = () => {
    box.classList.remove('pop');
    setTimeout(() => box.remove(), 200);
  };
  box.addEventListener('click', event => { if (event.target === box) close(); });
  box.querySelector('#battlePreviewClose').addEventListener('click', close);
}
function openPicker() {
  if (battleActive) return;
  abortBattle();
  if (isBankrupt()) {
    triggerBankruptcy();
    return;
  }
  document.body.classList.remove('in-fight');
  document.getElementById('squadSlots').classList.remove('hidden');
  picked = [null, null, null];
  $('#statsPanel').classList.add('hidden');
  resultBanner.classList.add('hidden');
  battlePit.classList.add('hidden');
  battleHud.classList.add('hidden');
  rewardBox.classList.add('hidden');
  document.querySelector('.picker-wrap').classList.remove('hidden');
  $('#arenaBack').classList.remove('hidden');
  $('#arenaSub').textContent = 'Pick any three cards from your hoard. Fights are turn-based — burn your one-use relics mid-duel. Lose, and the enemy walks off with your crown jewel.';
  // Candidates are bound creatures only. Grading cards remain visible but locked.
  // duplicate copies of the same creature collapse into their best instance for the arena.
  const seen = new Set();
  candidatePool = state.owned
    .map(o => { const e = effPlayer(findPlayer(o.name), o); if (e) e.rec = o; return e; })
    .filter(Boolean)
    .sort((a, b) => ovr(b) - ovr(a))
    .filter(p => { if (seen.has(p.name)) return false; seen.add(p.name); return true; });
  renderPicker();
  renderSlots();
}

function renderPicker() {
  picker.innerHTML = '';
  candidatePool.forEach(p => {
    const locked = !!(p.rec && p.rec.grading);
    const card = buildCard({ ...p }, 'p-card' + (locked ? ' grading-locked' : ''), true);
    card.dataset.name = p.name;
    if (p.rec && p.rec.favorite) {
      card.classList.add('favorite-pick');
      const tag = document.createElement('span');
      tag.className = 'favorite-pick-tag';
      tag.textContent = '★ Favorite';
      tag.title = 'Favorite card';
      card.appendChild(tag);
    }
    if (!locked) card.addEventListener('click', () => togglePick(p.name));
    picker.appendChild(card);
  });
  $$('.p-card').forEach(el => el.classList.toggle('picked', picked.includes(el.dataset.name)));
}

function togglePick(name) {
  const idx = picked.indexOf(name);
  if (idx >= 0) { picked[idx] = null; }
  else {
    const p = candidatePool.find(x => x.name === name);
    if (!p || (p.rec && p.rec.grading)) return;
    const slot = picked.findIndex(card => card === null);
    if (slot >= 0) picked[slot] = name;
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
    const head = SLOT_LABELS[i];
    slot.innerHTML = p
      ? `<span class="s-num">${head}</span><span class="s-name">${elementInfo(p.element).icon} ${p.name}</span><span class="s-ovr">OVR ${ovr(p)} · ${p.role}</span>`
      : `<span class="s-num">${head}</span><span class="s-name">—</span>`;
    squadSlots.appendChild(slot);
  }
  const ready = picked.every(Boolean);
  $('#arenaActions').innerHTML = `<button class="primary" id="fightBtn" ${ready ? '' : 'disabled'}>Fight</button>`;
  const fb = $('#fightBtn');
  if (fb) fb.addEventListener('click', () => { if (ready) startFight(); });
}

function buildBotSquad() {
  const usedByPlayer = new Set(playerSquad.map(p => p.name));
  const targets = playerSquad;

  /* Bot cards are virtual copies. Their level follows the card they are
     answering, so a veteran player's high-level squad is not matched by
     fresh level-one opponents. They are never written to the collection. */
  const virtualCard = (base, target) => {
    const level = Math.max(1, Math.floor(Number(target.level) || 1));
    const card = effPlayer(base, { level, element: randomElement() });
    card.botLevel = level;
    return card;
  };
  const choiceScore = (base, candidate, target, slot) => {
    const distance = Math.abs(ovr(candidate) - ovr(target));
    const exactRole = base.role === SLOT_ROLES[slot] ? 8 : 0;
    const rarity = Math.max(0, RANK.indexOf(base.rarity)) * 0.8;
    /* Stay close enough to the player's level for a fair fight, then prefer
       the stronger card when several candidates are equally suitable. */
    return 120 - distance * 3 + ovr(candidate) * 0.08 + exactRole + rarity;
  };

  const options = targets.map((target, slot) => PLAYERS
    .filter(base => !usedByPlayer.has(base.name) && slotFit(base).includes(slot))
    .map(base => {
      const card = virtualCard(base, target);
      return { base, card, score: choiceScore(base, card, target, slot) };
    })
    .sort((a, b) => b.score - a.score));

  /* Enumerate the tiny three-slot draft instead of greedily spending a
     flexible Warden on the first slot and starving a later slot. */
  let best = null;
  function draft(slot, chosen, used, score) {
    if (slot === options.length) {
      if (!best || score > best.score) best = { cards: chosen.slice(), score };
      return;
    }
    options[slot].forEach(option => {
      if (used.has(option.base.name)) return;
      used.add(option.base.name);
      chosen.push(option.card);
      draft(slot + 1, chosen, used, score + option.score);
      chosen.pop();
      used.delete(option.base.name);
    });
  }
  draft(0, [], new Set(), 0);

  if (best && best.cards.length === 3) return best.cards;

  /* Defensive fallback for damaged/custom card data: always return three
     legal opponents when the global roster contains enough distinct cards. */
  const fallbackUsed = new Set(usedByPlayer);
  return targets.map((target, slot) => {
    const base = PLAYERS
      .filter(p => !fallbackUsed.has(p.name) && slotFit(p).includes(slot))
      .sort((a, b) => ovr(b) - ovr(a))[0];
    if (!base) return null;
    fallbackUsed.add(base.name);
    return virtualCard(base, target);
  }).filter(Boolean);
}

/* Show the most valuable available relics first, but limit the returned
   counts to the number of relic uses left in this match. */
function battleArtifacts(list, cap) {
  let remaining = Math.max(0, cap || 0);
  return (list || [])
    .slice()
    .sort((a, b) => (findArtifact(b.name) ? findArtifact(b.name).price : 0) - (findArtifact(a.name) ? findArtifact(a.name).price : 0))
    .map(a => {
      const count = Math.min(Math.max(0, Number(a.count) || 0), remaining);
      remaining -= count;
      return count > 0 ? { ...a, count } : null;
    })
    .filter(Boolean);
}
function artifactInventoryTotal(list) {
  return (list || []).reduce((total, a) => total + Math.max(0, Number(a.count) || 0), 0);
}
function rollBotArtifacts() {
  /* The bot cannot bring relics into a relicless match, and never receives
     more total uses than the player owns. */
  const available = Math.min(BATTLE_ART_CAP, artifactInventoryTotal(state.artifacts));
  if (!available) return [];

  /* The enemy packs a real loadout, weighted toward legendary relics. */
  const r = Math.random();
  const n = r < 0.12 ? 0 : r < 0.3 ? 1 : Math.min(available, 2 + Math.floor(Math.random() * 9));
  const pool = [];
  ARTIFACTS.forEach(a => {
    for (let i = 0; i < (a.tier === 'rare' ? 24 : 10); i++) pool.push(a);
  });
  const loadout = [];
  let guard = 0;
  while (artifactInventoryTotal(loadout) < n && guard++ < 100) {
    const a = pool[Math.floor(Math.random() * pool.length)];
    const slot = loadout.find(x => x.name === a.name);
    if (slot) {
      if (slot.count < ARTIFACT_STACK) slot.count++;
    } else {
      loadout.push({ name: a.name, count: 1 });
    }
  }
  return loadout;
}
function showBotArtifacts() {
  const old = document.getElementById('botArtRow');
  if (old) old.remove();
  const visible = (botArtifacts || []).filter(a => a.count > 0);
  if (!visible.length) return;
  const row = document.createElement('div');
  row.id = 'botArtRow';
  row.className = 'bot-art-row';
  row.innerHTML = '<span class="bot-art-label">Relics</span>' + visible.map(a => {
    const art = findArtifact(a.name);
    return `<span class="bot-art" title="${art.name} — ${art.desc}">${art.icon}<b>×${a.count}</b></span>`;
  }).join('');
  bSquad.parentElement.appendChild(row);
}

/* One duel = one of your creatures against one of theirs, decided
   turn by turn. On your turn: attack, or burn a one-use artifact. */
function startFight() {
  if (battleActive) return;
  battleEpoch++;
  battleActive = true;
  document.body.classList.add('in-fight');
  document.getElementById('squadSlots').classList.add('hidden');
  playerSquad = [0, 1, 2].map(i => candidatePool.find(x => x.name === picked[i]));
  if (playerSquad.some(p => !p || (p.rec && p.rec.grading))) {
    abortBattle(true);
    flash('Cards in the Grading Lab cannot enter battle.');
    openPicker();
    return;
  }
  botSquad = buildBotSquad();
  if (botSquad.length !== 3) {
    abortBattle(true);
    flash('The enemy could not form a legal coven. Try again.');
    openPicker();
    return;
  }
  botArtifacts = rollBotArtifacts();
  document.querySelector('.picker-wrap').classList.add('hidden');
  $('#arenaBack').classList.add('hidden');
  $('#arenaSub').textContent = 'Make the call: attack, switch for a better matchup, or spend a relic. First coven to three KOs wins.';
  battleHud.classList.remove('hidden');
  setScore(0, 0);
  $$('#roundTicker span').forEach((s, i) => { s.className = ''; s.textContent = 'KO' + (i + 1); });
  battlePit.classList.remove('hidden');
  pSquad.innerHTML = ''; bSquad.innerHTML = '';
  playerSquad.forEach((p, i) => { const c = buildCard({ ...p }, 'b-card'); c.id = 'pc' + i; pSquad.appendChild(c); });
   botSquad.forEach((p, i) => {
     const c = buildCard({ ...p }, 'b-card', true);
     c.id = 'bc' + i;
     bindEnemyPreview(c, p, () => playerSquad[pActive]);
     bSquad.appendChild(c);
   });
  showBotArtifacts();
  $('#arenaActions').innerHTML = '';

  let pScore = 0, bScore = 0;
  let pActive = 0, bActive = 0;
  let pMult = 1, bMult = 1, pShield = false, bShield = false, pStun = false, bStun = false;
  let playerRelicsUsed = 0, eliminations = 0, matchFinished = false;
  const hpOf = p => Math.round(60 + ovr(p) * 1.8);
  const pHP = playerSquad.map(hpOf), bHP = botSquad.map(hpOf);
  const pAlive = [true, true, true], bAlive = [true, true, true];
  const pCombat = playerSquad.map(() => ({ damage: 0, wins: 0, losses: 0, switches: 0, events: [] }));
  const bCombat = botSquad.map(() => ({ damage: 0, wins: 0, losses: 0, switches: 0, events: [] }));
  const engagements = [];
  let engagement = null;

  function setHP(el, hp, max) {
    const pct = Math.max(0, Math.min(100, hp / max * 100));
    const bar = el.querySelector('.hp-bar');
    if (!bar) return;
    bar.querySelector('i').style.width = pct + '%';
    bar.querySelector('i').classList.toggle('low', hp / max < .35);
    bar.querySelector('b').textContent = Math.max(0, Math.round(hp));
  }
  function addHPBar(el) {
    const bar = document.createElement('div');
    bar.className = 'hp-bar';
    bar.innerHTML = '<i></i><b></b>';
    el.appendChild(bar);
  }
  function renderFocus() {
    const pc = playerSquad[pActive], bc = botSquad[bActive];
    focusPlayerCard.innerHTML = '';
    focusBotCard.innerHTML = '';
    const pCard = buildCard({ ...pc }, 'focus-card', true);
    const bCard = buildCard({ ...bc }, 'focus-card', true);
    bindEnemyPreview(bCard, bc, pc);
    pCard.classList.toggle('battle-defeated', !pAlive[pActive]);
    bCard.classList.toggle('battle-defeated', !bAlive[bActive]);
    addHPBar(pCard); addHPBar(bCard);
    focusPlayerCard.appendChild(pCard); focusBotCard.appendChild(bCard);
    setHP(pCard, pHP[pActive], hpOf(pc));
    setHP(bCard, bHP[bActive], hpOf(bc));
    const matchup = elementMultiplier(pc, bc);
    const pElement = elementInfo(pc.element), bElement = elementInfo(bc.element);
    const enemyMatchup = elementMultiplier(bc, pc);
    const playerDelta = elementDamageDelta(pc, bc);
    const enemyDelta = elementDamageDelta(bc, pc);
    const modifier = damage => `${signedDamage(damage)} damage`;
    const modifierClass = match => match.multiplier > 1 ? 'up' : match.multiplier < 1 ? 'down' : 'flat';
    focusElement.innerHTML = `
      <span class="element-line yours ${modifierClass(matchup)}"><b>YOU</b><span>${pElement.icon} ${pElement.label} <i>→ enemy</i> <strong>${modifier(playerDelta)}</strong></span></span>
      <span class="element-line enemy ${modifierClass(enemyMatchup)}"><b>ENEMY</b><span>${bElement.icon} ${bElement.label} <i>→ you</i> <strong>${modifier(enemyDelta)}</strong></span></span>`;
    renderStatusRack(focusPlayerCard, [
      playerDelta ? { text: `ELEMENT ${signedDamage(playerDelta)} DMG`, kind: playerDelta > 0 ? 'element-up' : 'element-down' } : null,
      pMult > 1 ? { text: `NEXT HIT ×${pMult}`, kind: 'buff' } : null,
      pShield ? { text: 'WARD READY', kind: 'buff' } : null,
      pStun ? { text: 'STUNNED', kind: 'debuff' } : null,
    ]);
    renderStatusRack(focusBotCard, [
      enemyDelta ? { text: `ELEMENT ${signedDamage(enemyDelta)} DMG`, kind: enemyDelta > 0 ? 'element-up' : 'element-down' } : null,
      bMult > 1 ? { text: `NEXT HIT ×${bMult}`, kind: 'buff' } : null,
      bShield ? { text: 'WARD READY', kind: 'buff' } : null,
      bStun ? { text: 'STUNNED', kind: 'debuff' } : null,
    ]);
  }
  function focusDamage(side, value, win, label) {
    const host = side === 'player' ? focusPlayerCard : focusBotCard;
    const card = host.querySelector('.focus-card');
    if (card) damageNum(card, value, win, label);
  }
  function disableActs(container) {
    [...container.querySelectorAll('button')].forEach(b => { b.disabled = true; b.style.opacity = .5; });
  }
  function aliveIndexes(list) { return list.map((alive, i) => alive ? i : -1).filter(i => i >= 0); }
  function refreshActive() {
    pSquad.querySelectorAll('.b-card').forEach((el, i) => {
      el.classList.toggle('battle-active', i === pActive && pAlive[i]);
      el.classList.toggle('battle-defeated', !pAlive[i]);
      setHP(el, pHP[i], hpOf(playerSquad[i]));
    });
    bSquad.querySelectorAll('.b-card').forEach((el, i) => {
      el.classList.toggle('battle-active', i === bActive && bAlive[i]);
      el.classList.toggle('battle-defeated', !bAlive[i]);
      setHP(el, bHP[i], hpOf(botSquad[i]));
    });
    renderFocus();
  }
  function beginEngagement() {
    if (engagement) return;
    engagement = { pIndex: pActive, bIndex: bActive, ps: 0, bs: 0 };
  }
  function closeEngagement(killer) {
    if (!engagement) return;
    engagements.push({
      pc: playerSquad[engagement.pIndex],
      bc: botSquad[engagement.bIndex],
      ps: engagement.ps,
      bs: engagement.bs,
      pWin: killer === 'player' ? true : killer === 'bot' ? false : null,
      reason: killer ? 'elimination' : 'switch',
    });
    engagement = null;
  }
  function finishIfOver() {
    if (matchFinished) return true;
    if (!pAlive.some(Boolean) || !bAlive.some(Boolean)) {
      matchFinished = true;
      closeEngagement(!bAlive.some(Boolean) ? 'player' : 'bot');
      finishMatch(engagements, pScore, bScore, !bAlive.some(Boolean), pCombat, bCombat);
      return true;
    }
    return false;
  }
  function markElimination(killer) {
    markTicker(Math.min(2, eliminations), killer === 'player');
    eliminations++;
  }
  function chooseNextBot() {
    const options = aliveIndexes(bAlive);
    if (!options.length) return finishIfOver();
    const pc = playerSquad[pActive];
    options.sort((a, b) => {
      const bm = elementMultiplier(botSquad[b], pc).multiplier;
      const am = elementMultiplier(botSquad[a], pc).multiplier;
      return (bm * 40 + ovr(botSquad[b])) - (am * 40 + ovr(botSquad[a]));
    });
    bActive = options[0];
    bMult = 1; bShield = false; bStun = false;
    refreshActive();
    battleLater(() => playerTurn(), 900);
  }
  function playerReplacement() {
    const acts = $('#arenaActions');
    const options = aliveIndexes(pAlive).filter(i => i !== pActive);
    focusTurn.textContent = 'CHOOSE REPLACEMENT';
    acts.innerHTML = '<div class="action-header"><span class="turn-prompt">Choose a replacement</span><span class="action-tip">Keep the pressure on</span></div>';
    options.forEach(i => {
      const b = document.createElement('button');
      b.className = 'switch-btn';
      b.innerHTML = `${elementInfo(playerSquad[i].element).icon} ${playerSquad[i].name}`;
      b.addEventListener('click', () => {
        disableActs(acts);
        pActive = i;
        pMult = 1; pShield = false; pStun = false;
        refreshActive();
        focusTurn.textContent = 'YOUR TURN';
        playerTurn();
      });
      acts.appendChild(b);
    });
  }
  function defeat(side, index, killerIndex) {
    const alive = side === 'player' ? pAlive : bAlive;
    const hp = side === 'player' ? pHP : bHP;
    const squad = side === 'player' ? playerSquad : botSquad;
    const combat = side === 'player' ? pCombat : bCombat;
    alive[index] = false;
    hp[index] = 0;
    combat[index].losses++;
    combat[index].events.push('loss');
    const killerCombat = side === 'player' ? bCombat[killerIndex] : pCombat[killerIndex];
    killerCombat.wins++;
    killerCombat.events.push('win');
    closeEngagement(side === 'player' ? 'bot' : 'player');
    const el = document.getElementById((side === 'player' ? 'pc' : 'bc') + index);
    if (el) el.classList.add('battle-defeated');
    refreshActive();
    focusTurn.textContent = 'ENEMY TURN';
    markElimination(side === 'player' ? 'bot' : 'player');
    if (finishIfOver()) return;
    if (side === 'player') playerReplacement();
    else chooseNextBot();
  }
  function switchPlayer(index) {
    if (!pAlive[index] || index === pActive) return;
    closeEngagement(null);
    pCombat[pActive].switches++;
    pActive = index;
    pMult = 1; pShield = false; pStun = false;
    refreshActive();
    focusTurn.textContent = 'YOUR TURN';
    battleLater(() => botTurn(), 900);
  }
  function chooseBotSwitch() {
    const options = aliveIndexes(bAlive).filter(i => i !== bActive);
    if (!options.length) return null;
    const pc = playerSquad[pActive];
    const currentScore = elementMultiplier(botSquad[bActive], pc).multiplier * 40 + ovr(botSquad[bActive]) + (bHP[bActive] / hpOf(botSquad[bActive])) * 25;
    options.sort((a, b) => {
      const bs = elementMultiplier(botSquad[b], pc).multiplier * 40 + ovr(botSquad[b]) + (bHP[b] / hpOf(botSquad[b])) * 25;
      const as = elementMultiplier(botSquad[a], pc).multiplier * 40 + ovr(botSquad[a]) + (bHP[a] / hpOf(botSquad[a])) * 25;
      return bs - as;
    });
    const best = options[0];
    const bestScore = elementMultiplier(botSquad[best], pc).multiplier * 40 + ovr(botSquad[best]) + (bHP[best] / hpOf(botSquad[best])) * 25;
    return (bHP[bActive] / hpOf(botSquad[bActive]) < .3 && bestScore > currentScore) || (elementMultiplier(pc, botSquad[bActive]).multiplier > 1 && bestScore > currentScore + 12) ? best : null;
  }
  function switchBot(index) {
    closeEngagement(null);
    bCombat[bActive].switches++;
    bActive = index;
    bMult = 1; bShield = false; bStun = false;
    refreshActive();
    battleLater(() => playerTurn(), 900);
  }
  function playerTurn() {
    if (!battleActive || matchFinished) return;
    focusTurn.textContent = 'YOUR TURN';
    if (pStun) {
      pStun = false;
      renderFocus();
      effectPop(focusCardElement('player'), 'STUNNED', 'debuff');
      battleLater(() => botTurn(), 1000);
      return;
    }
    beginEngagement();
    const acts = $('#arenaActions');
    const pc = playerSquad[pActive];
    const relics = battleArtifacts(state.artifacts, BATTLE_ART_CAP - playerRelicsUsed);
    acts.innerHTML = '<div class="action-header"><span class="turn-prompt">Your move</span><span class="action-tip">Exploit the matchup or set up a relic</span></div><div class="action-buttons"><button class="primary" id="atkBtn">⚔️ Attack</button><button class="action-toggle" id="switchToggle">↔ Switch Cards</button>' + (relics.length ? '<button class="action-toggle" id="relicToggle">✦ Use Relic</button>' : '') + '</div>';
    $('#atkBtn').addEventListener('click', () => { disableActs(acts); playerAttack(); });
    const switchPanel = document.createElement('div');
    switchPanel.className = 'action-options hidden';
    switchPanel.id = 'switchOptions';
    aliveIndexes(pAlive).filter(i => i !== pActive).forEach(i => {
      const b = document.createElement('button');
      b.className = 'switch-btn';
      b.innerHTML = `↔ ${elementInfo(playerSquad[i].element).icon} ${playerSquad[i].name}`;
      b.addEventListener('click', () => { disableActs(acts); switchPlayer(i); });
      switchPanel.appendChild(b);
    });
    acts.appendChild(switchPanel);
    $('#switchToggle').addEventListener('click', () => switchPanel.classList.toggle('hidden'));
    if (relics.length) {
       const relicPanel = document.createElement('div');
       relicPanel.className = 'action-options hidden';
       relicPanel.id = 'relicOptions';
       relics.forEach(a => {
         const art = findArtifact(a.name);
         if (!art) return;
         const b = document.createElement('button');
         b.className = 'art-btn tier-' + art.tier;
         b.title = `${art.name} ×${a.count}`;
         b.setAttribute('aria-label', `${art.name} ×${a.count}: ${art.desc}`);
         b.innerHTML = `<span class="at-ico">${art.icon}</span><span class="at-count">×${a.count}</span>`;
         b.addEventListener('click', () => { disableActs(acts); useArtifactInBattle(art); });
         relicPanel.appendChild(b);
       });
      acts.appendChild(relicPanel);
      $('#relicToggle').addEventListener('click', () => relicPanel.classList.toggle('hidden'));
    }
  }
  function playerAttack() {
    if (!battleActive) return;
    const pc = playerSquad[pActive], bc = botSquad[bActive];
    const advantage = elementMultiplier(pc, bc);
    beginEngagement();
    let dmg = ovr(pc) * (0.85 + Math.random() * .3) * advantage.multiplier;
    if (bShield) {
      bShield = false;
      renderFocus();
      damageNum($('#bc' + bActive), 0, true, 'BLOCKED');
      focusDamage('bot', 0, true, 'BLOCKED');
      effectPop(focusCardElement('bot'), 'WARD BLOCKED', 'block');
    } else {
      if (pMult > 1) { dmg *= pMult; pMult = 1; }
      dmg = Math.min(Math.max(0, bHP[bActive]), dmg);
      bHP[bActive] -= dmg;
      pCombat[pActive].damage += dmg; pScore += dmg; engagement.ps += dmg;
      setHP($('#bc' + bActive), bHP[bActive], hpOf(bc));
      renderFocus();
      damageNum($('#bc' + bActive), dmg, true);
      focusDamage('bot', dmg, true);
      showElementEffect('bot', pc, bc);
    }
    setScore(pScore, bScore);
    if (bHP[bActive] <= 0) { defeat('bot', bActive, pActive); return; }
    battleLater(() => botTurn(), 1150);
  }
  function useArtifactInBattle(art) {
    if (!battleActive || !spendArtifact(art.name)) { playerTurn(); return; }
    playerRelicsUsed++;
    const pc = playerSquad[pActive], bc = botSquad[bActive];
    relicPopup(art, 'player');
    if (art.effect === 'drain') {
      const advantage = elementMultiplier(pc, bc);
      const dmg = Math.min(Math.max(0, bHP[bActive]), ovr(pc) * 1.4 * advantage.multiplier);
      bHP[bActive] -= dmg;
      pHP[pActive] = Math.min(hpOf(pc), pHP[pActive] + dmg * .5);
      pCombat[pActive].damage += dmg; pScore += dmg; engagement.ps += dmg;
      setHP($('#pc' + pActive), pHP[pActive], hpOf(pc)); setHP($('#bc' + bActive), bHP[bActive], hpOf(bc));
      renderFocus();
      damageNum($('#bc' + bActive), dmg, true);
      focusDamage('bot', dmg, true);
      showDrainEffect('player', dmg);
      if (bHP[bActive] <= 0) { defeat('bot', bActive, pActive); return; }
    } else {
      applyArtifact(art, 'player');
      showRelicEffect('player', art);
    }
    battleLater(() => botTurn(), 1100);
  }
  function applyArtifact(art, who) {
    if (who === 'player') {
      switch (art.effect) {
        case 'double': pMult = 2; break;
        case 'triple': pMult = 3; break;
        case 'heal': pHP[pActive] = hpOf(playerSquad[pActive]); setHP($('#pc' + pActive), pHP[pActive], hpOf(playerSquad[pActive])); break;
        case 'shield': pShield = true; break;
        case 'stun': bStun = true; break;
      }
    } else {
      switch (art.effect) {
        case 'double': bMult = 2; break;
        case 'triple': bMult = 3; break;
        case 'heal': bHP[bActive] = hpOf(botSquad[bActive]); setHP($('#bc' + bActive), bHP[bActive], hpOf(botSquad[bActive])); break;
        case 'shield': bShield = true; break;
        case 'stun': pStun = true; break;
      }
    }
    renderFocus();
  }
  function botTurn() {
    if (!battleActive || matchFinished) return;
    focusTurn.textContent = 'ENEMY TURN';
    if (bStun) {
      bStun = false;
      renderFocus();
      effectPop(focusCardElement('bot'), 'STUNNED', 'debuff');
      battleLater(() => playerTurn(), 1100);
      return;
    }
    beginEngagement();
    const pc = playerSquad[pActive], bc = botSquad[bActive];
    const usable = botArtifacts.filter(x => x.count > 0);
    const pMax = hpOf(pc), bMax = hpOf(bc);
    const playerAdvantage = elementMultiplier(pc, bc);
    const botAdvantage = elementMultiplier(bc, pc);
    const pElement = playerAdvantage.multiplier;
    const bElement = botAdvantage.multiplier;
    const expected = (fighter, multiplier, element) => ovr(fighter) * multiplier * element;
    const minimum = (fighter, multiplier, element) => expected(fighter, multiplier, element) * .85;
    const drainDmg = ovr(bc) * 1.4 * bElement;
    const playerExpected = expected(pc, pMult, pElement);
    const botExpected = expected(bc, bMult, bElement);
    const playerLikelyKills = !bShield && playerExpected >= bHP[bActive];
    const botLikelyKills = !pShield && botExpected >= pHP[pActive];
    const botSureKills = !pShield && minimum(bc, bMult, bElement) >= pHP[pActive];
    const chooseSwitch = chooseBotSwitch();
    if (chooseSwitch !== null && !botSureKills && (pElement > 1 || bHP[bActive] < bMax * .3)) return switchBot(chooseSwitch);
    const attack = () => {
      let dmg = ovr(bc) * (0.85 + Math.random() * .3) * bElement;
      if (pShield) {
        pShield = false;
        renderFocus();
        damageNum($('#pc' + pActive), 0, false, 'BLOCKED');
        focusDamage('player', 0, false, 'BLOCKED');
        effectPop(focusCardElement('player'), 'WARD BLOCKED', 'block');
      } else {
        if (bMult > 1) { dmg *= bMult; bMult = 1; }
        dmg = Math.min(Math.max(0, pHP[pActive]), dmg);
        pHP[pActive] -= dmg;
        bCombat[bActive].damage += dmg; bScore += dmg; engagement.bs += dmg;
        setHP($('#pc' + pActive), pHP[pActive], hpOf(pc));
        renderFocus();
        damageNum($('#pc' + pActive), dmg, false);
        focusDamage('player', dmg, false);
        showElementEffect('player', bc, pc);
      }
      setScore(pScore, bScore);
      if (pHP[pActive] <= 0) { defeat('player', pActive, bActive); return; }
      battleLater(() => playerTurn(), 1150);
    };
    const useArt = (slot, art) => {
      slot.count--;
      if (slot.count <= 0) botArtifacts = botArtifacts.filter(x => x !== slot);
      showBotArtifacts();
      relicPopup(art, 'bot');
      if (art.effect === 'drain') {
        const dmg = Math.min(Math.max(0, pHP[pActive]), drainDmg);
        pHP[pActive] -= dmg;
        bHP[bActive] = Math.min(hpOf(bc), bHP[bActive] + dmg * .5);
        bCombat[bActive].damage += dmg; bScore += dmg; engagement.bs += dmg;
        setHP($('#pc' + pActive), pHP[pActive], hpOf(pc)); setHP($('#bc' + bActive), bHP[bActive], hpOf(bc));
        renderFocus();
        damageNum($('#pc' + pActive), dmg, false);
        focusDamage('player', dmg, false);
        showDrainEffect('bot', dmg);
        if (pHP[pActive] <= 0) { defeat('player', pActive, bActive); return; }
      } else {
        applyArtifact(art, 'bot');
        showRelicEffect('bot', art);
      }
      battleLater(() => playerTurn(), 1100);
    };
    const has = {}, slots = {};
    usable.forEach(x => { const a = findArtifact(x.name); if (a) { has[a.effect] = true; slots[a.effect] = x; } });
    if (bMult > 1 && !pShield) return attack();
    if (botSureKills) return attack();
    if (has.drain && drainDmg >= pHP[pActive]) return useArt(slots.drain, findArtifact(slots.drain.name));
    if (has.shield && !bShield && (playerLikelyKills || pMult > 1)) return useArt(slots.shield, findArtifact(slots.shield.name));
    if (has.stun && !bShield && playerLikelyKills) return useArt(slots.stun, findArtifact(slots.stun.name));
    if (has.heal && bHP[bActive] < bMax * .55 && (playerLikelyKills || bHP[bActive] < bMax * .35)) return useArt(slots.heal, findArtifact(slots.heal.name));
    if (has.triple && !pShield && expected(bc, 3, bElement) >= pHP[pActive] && !botLikelyKills) return useArt(slots.triple, findArtifact(slots.triple.name));
    if (has.double && !pShield && expected(bc, 2, bElement) >= pHP[pActive] && !botLikelyKills) return useArt(slots.double, findArtifact(slots.double.name));
    if (has.drain && bHP[bActive] < bMax * .65 && pHP[pActive] < pMax * .85) return useArt(slots.drain, findArtifact(slots.drain.name));
    attack();
  }

  for (let i = 0; i < 3; i++) {
    addHPBar($('#pc' + i));
    addHPBar($('#bc' + i));
    setHP($('#pc' + i), pHP[i], hpOf(playerSquad[i]));
    setHP($('#bc' + i), bHP[i], hpOf(botSquad[i]));
  }
  refreshActive();
  playerTurn();
}

function setScore(p, b) {
  const total = Math.max(1, p + b);
  const even = p === 0 && b === 0;
  youBar.style.width = (even ? 50 : p / total * 100) + '%';
  themBar.style.width = (even ? 50 : b / total * 100) + '%';
  youPts.textContent = Math.round(p);
  themPts.textContent = Math.round(b);
}

function markTicker(round, pWin) {
  const s = roundTicker.children[round];
  if (s) s.className = pWin ? 'won' : 'lost';
}

function damageNum(cardEl, val, win, label) {
  if (!cardEl) return;
  const d = document.createElement('span');
  d.className = 'dmg ' + (win ? 'win' : 'lose') + (label ? ' labeled' : '');
  d.textContent = label || val.toFixed(0);
  cardEl.appendChild(d);
  setTimeout(() => d.remove(), 1650);
}

let bankruptcyOverlayOpen = false;
function triggerBankruptcy() {
  if (bankruptcyOverlayOpen || !isBankrupt()) return;
  bankruptcyOverlayOpen = true;
  const total = totalHoardValue();
  const box = document.createElement('div');
  box.className = 'legend-end';
  box.tabIndex = 0;
  box.innerHTML = `
    <div class="legend-end-card" role="dialog" aria-modal="true" aria-label="Your legend ends here">
      <span class="legend-end-kicker">THE VEIL CLOSES</span>
      <h2>YOUR LEGEND ENDS HERE</h2>
      <p>You no longer have enough gold or hoard value to form another three-card coven.</p>
      <div class="legend-end-stats"><span>Gold <b>${coin()}${Math.max(0, Number(state.coins) || 0)}</b></span><span>Hoard value <b>${coin()}${total}</b></span></div>
      <span class="legend-end-hint">Tap anywhere to begin a new profile</span>
    </div>`;
  const reset = () => {
    if (!box.isConnected) return;
    bankruptcyOverlayOpen = false;
    box.remove();
    if (typeof clearAccountData === 'function') clearAccountData();
    else {
      state = freshState();
      saveState();
      renderCollection();
      updateWallet();
      refreshPackHint();
      if (typeof showMenu === 'function') showMenu();
    }
  };
  box.addEventListener('click', reset);
  box.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); reset(); }
  });
  document.body.classList.remove('in-fight');
  rewardBox.classList.add('hidden');
  const preview = document.querySelector('.battle-preview');
  if (preview) preview.remove();
  document.body.appendChild(box);
  requestAnimationFrame(() => box.classList.add('show'));
  requestAnimationFrame(() => box.focus());
}

function finishMatch(rounds, pScore, bScore, matchWon, pCombat, bCombat) {
  const st = state.stats;

  // Apply each card's actual kill/death sequence. A switch or survival alone
  // is not a result; a kill is a win and being knocked out is a loss.
  const shifts = [];
  playerSquad.forEach((p, i) => {
    const o = p.rec;
    if (o) {
      pCombat[i].events.forEach(result => {
        const shift = recordCardDuel(o, result === 'win');
        if (shift) shifts.push({ name: o.name, ...shift, serial: o.serial });
      });
    }
  });

  let claimed = null, surrendered = null, jewelV = 0;
  let overflowPending = null;
  if (matchWon) {
    const bestBot = [...botSquad].sort((a, b) => ovr(b) - ovr(a))[0];
    const inst = makeInstance(bestBot.name, { level: bestBot.botLevel || 1, wins: 1, streak: 1, element: bestBot.element });
    if (hoardFull()) {
      // album page is full — the win is real but the slot is decided after the reward
      overflowPending = { instance: inst, player: bestBot };
    } else {
      state.owned.push(inst);
    }
    claimed = { p: bestBot, o: inst };
  } else {
    // defeat costs the crown jewel — the single most valuable instance in the whole collection
    const jewel = crownJewel();
    if (jewel) {
      surrendered = jewel;
      jewelV = jewel.v;
      state.owned = state.owned.filter(x => x.id !== jewel.o.id);
    }
  }

  const defeatedCards = pCombat.reduce((sum, card) => sum + card.losses, 0);
  const remainingCards = pCombat.filter(card => card.losses === 0).length;
  let goldChange = 0;
  if (matchWon) {
    goldChange = remainingCards === playerSquad.length
      ? BATTLE_FULL_TEAM_GOLD
      : remainingCards * BATTLE_SURVIVOR_GOLD;
    state.coins += goldChange;
  } else {
    const goldLost = Math.min(Math.max(0, Number(state.coins) || 0), defeatedCards * BATTLE_LOSS_GOLD_PER_CARD);
    goldChange = -goldLost;
    state.coins -= goldLost;
  }
  const goldResult = matchWon
    ? `<span class="battle-gold gain">+${coin()}${goldChange} gold</span>`
    : `<span class="battle-gold loss">-${coin()}${Math.abs(goldChange)} gold · ${defeatedCards} card${defeatedCards === 1 ? '' : 's'} lost</span>`;

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

  if (!matchWon && isBankrupt()) {
    battleActive = false;
    resultBanner.classList.add('hidden');
    triggerBankruptcy();
    return;
  }

  if (matchWon) {
    resultBanner.style.borderColor = 'rgba(74,222,128,.65)';
    resultBanner.innerHTML = `🏆 Victory — you claim <b>${claimed.p.name}</b> (OVR ${ovr(claimed.p)}) from the enemy's coven! ${goldResult}`;
  } else if (surrendered) {
    resultBanner.style.borderColor = 'rgba(255,80,80,.65)';
    resultBanner.innerHTML = `💔 Defeat — the enemy claims your crown jewel, <b>${surrendered.p.name}</b> (worth ${coin()}${jewelV}), into its hoard. ${goldResult}`;
  } else {
    resultBanner.style.borderColor = 'rgba(255,80,80,.65)';
    resultBanner.innerHTML = `💔 Defeat — the enemy takes the glory. ${goldResult}`;
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
  // match report
  $('#statsPanel').innerHTML = statsHTML(rounds, pScore, bScore, matchWon, claimed, surrendered, pCombat, bCombat);
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
  const src = claimed || surrendered;
  if (!src) return;
  const pl = src.p;
  const inst = src.o;
  rewardCard.innerHTML = '';
  rewardCard.appendChild(buildCard({ ...pl, rec: inst }, 'reward-draw', true));
  if (matchWon) {
    rewardGlow.className = 'reward-glow win';
    rewardTitle.textContent = '🏆 Claimed';
    rewardTitle.className = 'reward-title win';
    rewardSub.textContent = `${pl.name} joins your hoard`;
  } else {
    rewardGlow.className = 'reward-glow lose';
    rewardTitle.textContent = '💔 Lost';
    rewardTitle.className = 'reward-title lose';
    rewardSub.innerHTML = `The enemy seizes ${pl.name}${jewelV ? ' · worth ' + coin() + jewelV : ''}`;
  }
  rewardFoot.textContent = (matchWon ? 'A new creature bound to your hoard' : 'Your crown jewel is theirs now') + ' · Tap anywhere to continue';
  rewardBox.classList.remove('hidden');
  void rewardBox.offsetWidth;
  rewardBox.classList.add('pop');
  if (matchWon) burstReward(rewardBox);
}
function dismissReward() {
  rewardBox.classList.add('hidden');
  rewardBox.classList.remove('pop');
}
rewardBox.addEventListener('click', dismissReward);

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

function statsHTML(rounds, pScore, bScore, matchWon, claimed, surrendered, pCombat, bCombat) {
  const st = state.stats;
  const pct = st.battles ? Math.round((st.wins / st.battles) * 100) : 0;
  const pElims = pCombat.reduce((sum, card) => sum + card.wins, 0);
  const bElims = bCombat.reduce((sum, card) => sum + card.wins, 0);
  const tile = (label, val, cls = '') => `<div class="s-tile ${cls}"><b>${val}</b><span>${label}</span></div>`;
  const teamRows = (squad, combat) => squad.map((p, i) => {
    const c = combat[i], e = elementInfo(p.element);
    return `<div class="s-card-row"><span class="s-card-name">${e.icon} ${p.name}</span><span>KO <b>${c.wins}</b></span><span>Lost <b>${c.losses}</b></span><span>Dmg <b>${Math.round(c.damage)}</b></span><span>Swap <b>${c.switches}</b></span></div>`;
  }).join('');
  const prize = claimed ? `Claimed <b>${claimed.p.name}</b>` : surrendered ? `Lost <b>${surrendered.p.name}</b>` : 'No cards changed hands';
  return `
    <div class="stats-head"><b>Match Report</b><span>${matchWon ? 'Victory' : 'Defeat'} · ${pElims}–${bElims} eliminations</span></div>
    <div class="stats-grid">
      ${tile('Battles', st.battles)}
      ${tile('Wins', st.wins, 'hot')}
      ${tile('Losses', st.losses, 'bad')}
      ${tile('Win Rate', pct + '%', pct >= 50 ? 'hot' : 'bad')}
      ${tile('Streak', st.streak, st.streak > 0 ? 'hot' : '')}
      ${tile('Your Damage', Math.round(pScore), 'hot')}
      ${tile('Enemy Damage', Math.round(bScore), 'bad')}
    </div>
    <div class="stats-team"><div class="stats-team-head">Your Team</div>${teamRows(playerSquad, pCombat)}</div>
    <div class="stats-team enemy"><div class="stats-team-head">Enemy Team</div>${teamRows(botSquad, bCombat)}</div>
    <div class="stats-foot">${pScore >= bScore ? '🏅 Damage leader: Your team' : '☠ Damage leader: Enemy team'} · ${prize}</div>
  `;
}

packZone.addEventListener('click', openPack);
renderCollection();
updateWallet();
refreshPackHint();
