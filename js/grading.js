/* ============================================================
   GRADING LAB — every card hides a 1–10 condition grade. Pay the
   fee, one of the lab's three slots takes the card for a few
   minutes, then the slab cracks open and the truth is revealed.
   A 10 is a legend; a 1 is scrap. That's the gamble.
   ============================================================ */
const labScreen = $('#gradingScreen');
const gradingBody = $('#gradingBody');

function rollGrade(o) {
  const serial = Number(o && o.serial) || 0;
  const wins = Math.max(0, Number(o && o.wins) || 0);
  const losses = Math.max(0, Number(o && o.losses) || 0);
  const played = wins + losses;
  let bias = 0;

  /* The print run and a card's battle history improve the odds gently;
     they never replace the random grade roll. */
  if (serial >= 1 && serial <= 10) bias += .55;       // 1st Edition
  else if (serial <= 25) bias += .25;                 // near 1st Edition
  if (played) {
    const winRate = wins / played;
    bias += Math.min(.25, played * .025);
    bias += Math.max(-.35, Math.min(.45, (winRate - .5) * 1.1));
  }

  const weights = GRADE_WEIGHTS.map((weight, grade) =>
    weight * Math.pow((grade + 1) / 6, bias));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const r = Math.random() * total;
  let acc = 0;
  for (let g = 1; g <= 10; g++) { acc += weights[g]; if (r < acc) return g; }
  return 5;
}

function activeGradings() { return state.owned.filter(o => o.grading); }
function gradeRemaining(o) { return o.grading ? Math.max(0, o.grading.done - Date.now()) : 0; }
function fmtTime(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(s / 60), r = s % 60;
  return m + ':' + String(r).padStart(2, '0');
}
function fmtMult(n) { return String(n).replace(/\.0$/, '') + '×'; }

function sendToGrade(id) {
  const o = state.owned.find(x => x.id === id);
  if (!o) return;
  if (o.grading) { flash('That card is already in the lab.'); return; }
  if (o.graded) { flash('That card has already been graded.'); return; }
  if (activeGradings().length >= GRADE_SLOTS) {
    flash(`The lab is full — only ${GRADE_SLOTS} cards at a time.`);
    return;
  }
  if (state.coins < GRADE_FEE) {
    flash(`Grading costs ${coin()}${GRADE_FEE} — sell a card or win a battle.`);
    return;
  }
  state.coins -= GRADE_FEE;
  o.grading = { start: Date.now(), done: Date.now() + GRADE_TIME };
  saveState();
  updateWallet();
  renderGrading();
  renderCollection();
  flash(`${findPlayer(o.name).name} is in the lab — results in ${fmtTime(GRADE_TIME)}.`);
}

/* ---- the lab clock: check every second for finished slabs ---- */
function settleGradings() {
  if (!state) return;
  const done = [];
  state.owned.forEach(o => {
    if (o.grading && o.grading.done <= Date.now()) {
      o.grade = rollGrade(o);
      o.graded = true;
      o.grading = null;
      done.push(o);
    }
  });
  if (!done.length) return;
  saveState();
  updateLabStatus();
  renderCollection();
  if (!labScreen.classList.contains('hidden')) renderGrading();
  done.forEach(o => revealGrade(o));
}

/* ---- grade reveal: crack the slab open ---- */
let gradeQueue = [];
let gradeBusy = false;
function revealGrade(o) {
  gradeQueue.push(o);
  if (!gradeBusy) pumpGradeReveals();
}
function pumpGradeReveals() {
  const o = gradeQueue.shift();
  if (!o) { gradeBusy = false; return; }
  gradeBusy = true;
  showGradeReveal(o, () => pumpGradeReveals());
}

function showGradeReveal(o, done) {
  const p = findPlayer(o.name);
  const gc = GRADE_COLOR[o.grade] || '#c9d3dd';
  const legend = o.grade >= 9;
  const wins = Math.max(0, Number(o.wins) || 0);
  const losses = Math.max(0, Number(o.losses) || 0);
  const played = wins + losses;
  const record = `Record ${wins}W / ${losses}L · Played ${played} time${played === 1 ? '' : 's'}`;
  const title = o.grade === 10 ? 'GEM MINT 10' : (GRADE_FULL[o.grade] + ' ' + o.grade);
  const sub = legend
    ? `A collector's legend. <b>${o.name}</b> #${String(o.serial).padStart(4, '0')} is now worth ${coin()}<b>${cardValue(p, o)}</b> — ${fmtMult(GRADE_MULT[o.grade])} its ungraded price.<br><small>${record}</small>`
    : o.grade <= 4
      ? `Rough. <b>${o.name}</b> #${String(o.serial).padStart(4, '0')} is now worth ${coin()}<b>${cardValue(p, o)}</b> — the lab did it no favours.<br><small>${record}</small>`
      : `<b>${o.name}</b> #${String(o.serial).padStart(4, '0')} graded ${GRADE_LABEL[o.grade]} — now worth ${coin()}<b>${cardValue(p, o)}</b>.<br><small>${record}</small>`;
  const box = document.createElement('div');
  box.className = 'grade-reveal';
  box.innerHTML = `
    <div class="gr-glow" style="--gc:${gc}"></div>
    <div class="gr-badge" style="--gc:${gc}">
      <span class="gr-num">${o.grade}</span>
      <span class="gr-label">${GRADE_LABEL[o.grade]}</span>
    </div>
    <div class="gr-title" style="--gc:${gc}">${title}</div>
    <div class="gr-card"></div>
    <div class="gr-sub">${sub}</div>
    <div class="gr-actions"><button class="primary" id="grDone">Done</button></div>`;
  const cardWrap = box.querySelector('.gr-card');
  cardWrap.appendChild(buildCard({ ...effPlayer(p, { level: o.level, wins: 0, losses: 0, streak: 0 }), rec: o }, 'gr-draw', true));
  document.body.appendChild(box);
  requestAnimationFrame(() => box.classList.add('pop'));
  if (legend) burstReward(box);
  box.querySelector('#grDone').addEventListener('click', () => {
    box.classList.remove('pop');
    setTimeout(() => { box.remove(); done(); }, 240);
  });
}

/* ---- menu badge: how crowded is the lab ---- */
function updateLabStatus() {
  const el = $('#labStatus');
  if (!el) return;
  const busy = activeGradings().length;
  el.textContent = `${busy}/${GRADE_SLOTS} slots busy`;
  const tile = $('#menuGradingBtn');
  if (tile) tile.classList.toggle('busy', busy > 0);
}

/* ---- the grading screen ---- */
function renderGrading() {
  if (!gradingBody) return;
  gradingBody.innerHTML = '';
  updateLabStatus();

  const info = document.createElement('p');
  info.className = 'lab-info';
  info.innerHTML = `Every card hides a condition grade. Send one in for <b>${coin()}${GRADE_FEE}</b> — the lab keeps <b>${GRADE_SLOTS} cards</b> at a time and takes <b>${fmtTime(GRADE_TIME)}</b>. A low serial, battle record, and total plays can gently improve the odds, but every result is still randomized. A <b>GEM MT 10</b> is ten times the value; a <b>PR 1</b> is near scrap. Brave enough to roll the dice?`;
  gradingBody.appendChild(info);

  const slotHead = document.createElement('p');
  slotHead.className = 'lab-section-label';
  slotHead.textContent = 'The Lab';
  gradingBody.appendChild(slotHead);

  const slots = document.createElement('div');
  slots.className = 'lab-slots';
  const busy = activeGradings();
  for (let i = 0; i < GRADE_SLOTS; i++) {
    const slot = document.createElement('div');
    slot.className = 'lab-slot';
    if (busy[i]) {
      slot.classList.add('filled');
      const o = busy[i];
      const p = findPlayer(o.name);
      const card = buildCard({ ...effPlayer(p, o), rec: o }, 'lab-card', true);
      card.querySelector('.flip-inner').classList.add('flipped');
      slot.appendChild(card);
      const timer = document.createElement('div');
      timer.className = 'lab-timer';
      timer.dataset.for = o.id;
      timer.textContent = '⏳ ' + fmtTime(gradeRemaining(o));
      slot.appendChild(timer);
    } else {
      slot.classList.add('empty');
      slot.innerHTML = `<div class="lab-empty-in"><span class="le-ico">🗄️</span><span class="le-txt">Empty Slot</span></div>`;
    }
    slots.appendChild(slot);
  }
  gradingBody.appendChild(slots);

  const readyHead = document.createElement('p');
  readyHead.className = 'lab-section-label';
  readyHead.textContent = 'Ready to Grade';
  gradingBody.appendChild(readyHead);

  const eligible = state.owned.filter(o => !o.graded && !o.grading);
  if (!eligible.length) {
    const empty = document.createElement('p');
    empty.className = 'lab-empty';
    empty.textContent = 'Nothing waiting — open packs to pull more cards, then gamble their condition here.';
    gradingBody.appendChild(empty);
  } else {
    const grid = document.createElement('div');
    grid.className = 'lab-grid';
    eligible.forEach(o => {
      const p = findPlayer(o.name);
      if (!p) return;
      const wrap = document.createElement('div');
      wrap.className = 'lab-card-wrap';
      const card = buildCard({ ...effPlayer(p, o), rec: o }, 'lab-card', true);
      card.addEventListener('click', () => openCardView(o.id));
      wrap.appendChild(card);
      const btn = document.createElement('button');
      btn.className = 'lab-grade-btn';
      btn.innerHTML = `${coin()}${GRADE_FEE} · Send to Lab`;
      btn.disabled = state.coins < GRADE_FEE || activeGradings().length >= GRADE_SLOTS;
      btn.addEventListener('click', () => sendToGrade(o.id));
      wrap.appendChild(btn);
      grid.appendChild(wrap);
    });
    gradingBody.appendChild(grid);
  }

  const hint = document.createElement('p');
  hint.className = 'lab-empty';
  hint.innerHTML = state.coins >= GRADE_FEE
    ? `You have ${coin()}<b>${state.coins}</b> — enough for ${Math.floor(state.coins / GRADE_FEE)} submission${Math.floor(state.coins / GRADE_FEE) === 1 ? '' : 's'}.`
    : `You need ${coin()}${GRADE_FEE} to grade — sell a card or win a battle.`;
  gradingBody.appendChild(hint);
}

/* tick the lab timers on screen */
let labTimer = null;
function startLabTicker() {
  if (labTimer) return;
  labTimer = setInterval(() => {
    settleGradings();
    if (!labScreen.classList.contains('hidden')) {
      document.querySelectorAll('.lab-timer').forEach(t => {
        const o = state.owned.find(x => x.id === t.dataset.for);
        if (o && o.grading) t.textContent = '⏳ ' + fmtTime(gradeRemaining(o));
      });
    }
  }, 1000);
}
startLabTicker();
