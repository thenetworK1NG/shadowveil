
/* --- open the pack --- */
function openPack() {
  if (dealing) return;
  if (state.coins < PACK_COST) {
    refreshPackHint();
    flash(`Not enough coins — a pack costs ${coin()}${PACK_COST}`);
    pack.classList.remove('ripping');
    void pack.offsetWidth;
    pack.classList.add('ripping');
    return;
  }
  state.coins -= PACK_COST;
  updateWallet();
  saveState();
  dealing = true;
  hint.textContent = 'Ripping it open…';
  pack.classList.add('ripping');
  setTimeout(() => {
    pack.classList.remove('ripping');
    pack.classList.add('burst');
    setTimeout(() => { packZone.classList.add('hidden'); fan.classList.remove('hidden'); }, 420);

    const items = [0, 1, 2, 3, 4].map(() =>
      Math.random() < .35
        ? { kind: 'artifact', a: ARTIFACTS[Math.floor(Math.random() * ARTIFACTS.length)] }
        : { kind: 'creature', p: pickCard() });
    // every pack hides at least one relic
    if (!items.some(i => i.kind === 'artifact')) {
      const idx = Math.floor(Math.random() * items.length);
      items[idx] = { kind: 'artifact', a: ARTIFACTS[Math.floor(Math.random() * ARTIFACTS.length)] };
    }
    dealt = items;
    // responsive fan — fit all five inside the viewport on any screen
    const vw = document.documentElement.clientWidth;
    const pad = 8;
    const cw = Math.min(200, Math.max(110, Math.floor((vw - pad * 2) / 2.5)));
    const ch = Math.round(cw * 1.45);
    const step = (vw - pad * 2 - cw) / 4;
    const rotBase = cw < 180 ? 4 : 5;
    fan.style.height = (ch + 130) + 'px';
    items.forEach((item, i) => {
      const el = item.kind === 'artifact'
        ? buildArtifactTile(item.a, 'deal-art')
        : buildCard(item.p, 'deal-card', true);
      el.style.width = cw + 'px';
      el.style.height = ch + 'px';
      el.style.setProperty('--tx', Math.round((i - 2) * step) + 'px');
      el.style.setProperty('--ty', (Math.abs(i - 2) * 20) + 'px');
      el.style.setProperty('--rot', ((i - 2) * rotBase) + 'deg');
      el.style.setProperty('--delay', (i * .16 + .2) + 's');
      fan.appendChild(el);
    });

    // flip each card over, animate stat bars, sparkle rares & relics
    setTimeout(() => {
      $$('.deal-card, .deal-art').forEach((el, i) => {
        setTimeout(() => {
          const fi = el.querySelector('.flip-inner');
          if (fi) fi.classList.add('flipped');
          el.querySelectorAll('.chip i em').forEach(b => b.style.width = b.dataset.v + '%');
          const tcard = el.querySelector('.tcard');
          const isDia = tcard && tcard.classList.contains('rare-diamond');
          const isGold = tcard && tcard.classList.contains('rare-gold');
          if (isDia || (isGold && Math.random() > .5) || el.classList.contains('deal-art')) sparkle(el);
        }, i * 260);
      });
      setTimeout(() => {
        // review time — tap a card to see it big, tap again for the next
        $$('.deal-card, .deal-art').forEach(el => {
          el.addEventListener('click', startInspection);
        });
        hint.textContent = 'Tap a find to inspect it';
        dealing = false;
      }, items.length * 260 + 900);
    }, 650);
  }, 520);
}

/* A relic tile — deliberately not a playing card, so an artifact
   never gets mistaken for a creature. */
function buildArtifactTile(a, cls = '') {
  const el = document.createElement('div');
  el.className = 'flip art-tile ' + cls;
  el.innerHTML = `
    <div class="art-face tier-${a.tier}">
      <div class="art-glow"></div>
      <div class="art-ico">${a.icon}</div>
      <div class="art-nm">${a.name}</div>
      <div class="art-tier">${ARTIFACT_TIER_LABEL[a.tier]}</div>
      <div class="art-effect">${a.desc}</div>
    </div>`;
  return el;
}

function sparkle(el) {
  for (let i = 0; i < 10; i++) {
    const s = document.createElement('span');
    s.className = 'spark';
    s.textContent = ['✦', '★', '✦'][i % 3];
    s.style.left = (el.offsetLeft + Math.random() * el.offsetWidth) + 'px';
    s.style.top = (el.offsetTop + Math.random() * el.offsetHeight) + 'px';
    s.style.animationDelay = (Math.random() * .4) + 's';
    document.body.appendChild(s);
    setTimeout(() => s.remove(), 1600);
  }
}

/* ============================================================
   PACK REVIEW — tap a card to see it big on screen. Tap again
   to dismiss it and reveal the next card. After the last card,
   the pack is bound to the hoard and we return to the pack view.
   ============================================================ */
const viewer = $('#viewer'), viewerCard = $('#viewerCard'), viewerCount = $('#viewerCount');
const confirmBox = $('#confirmBox');
let inspectIdx = -1;
let pendingSell = null;
let closing = false;

function startInspection() {
  // the review always opens on the first card of the pack
  if (inspectIdx >= 0 || closing) return;
  inspectIdx = 0;
  showBigCard();
}
function showBigCard() {
  const item = dealt[inspectIdx];
  viewerCard.innerHTML = '';
  if (item.kind === 'artifact') {
    viewerCard.appendChild(buildArtifactTile(item.a, 'viewer-art'));
  } else {
    viewerCard.appendChild(buildCard({ ...item.p }, 'viewer-draw', true));
  }
  viewerCount.textContent = (inspectIdx + 1) + ' / ' + dealt.length;
  viewer.classList.remove('hidden');
  viewer.classList.remove('fading');
}
function advanceInspection() {
  if (closing) return;
  closing = true;
  // melt back to the table, then draw the next card up big
  viewer.classList.add('fading');
  setTimeout(() => {
    inspectIdx++;
    if (inspectIdx >= dealt.length) {
      finishReview();
      return;
    }
    showBigCard();
    closing = false;
  }, 280);
}
function finishReview() {
  viewer.classList.add('hidden');
  viewer.classList.remove('fading');
  viewerCard.innerHTML = '';
  inspectIdx = -1;
  closing = false;
  collectDealt();
}

/* --- bind the pack's finds to the hoard, then start a fresh pack --- */
function collectDealt() {
  let arts = 0, overflow = 0, fresh = 0, dupes = 0, firstEd = 0, queued = 0;
  const known = new Set(state.owned.map(o => o.name));
  const pending = [];
  dealt.forEach(item => {
    if (item.kind === 'artifact') {
      overflow += addArtifact(item.a.name, 1);
      arts++;
      return;
    }
    const p = item.p;
    const inst = makeInstance(p.name);
    if (inst.firstEd) firstEd++;
    if (hoardFull()) {
      queued++;
      pending.push({ instance: inst, player: p });
    } else {
      state.owned.push(inst);
      if (known.has(p.name)) dupes++;
      else { known.add(p.name); fresh++; }
    }
  });
  const total = dealt.length;
  dealt = [];
  fan.innerHTML = '';
  actions.innerHTML = '';
  fan.classList.add('hidden');
  packZone.classList.remove('hidden');
  pack.classList.remove('burst');
  refreshPackHint();
  saveState();
  renderCollection();
  const bits = [];
  if (arts) bits.push(`${arts} artifact${arts > 1 ? 's' : ''}`);
  if (fresh) bits.push(`${fresh} new to the hoard`);
  if (dupes) bits.push(`${dupes} duplicate${dupes > 1 ? 's' : ''} with fresh serials`);
  let msg = `Collected ${total} finds` + (bits.length ? ' — ' + bits.join(', ') : '');
  if (firstEd) msg = `★ ${firstEd} 1st Edition print${firstEd > 1 ? 's' : ''}! ${msg}`;
  if (overflow) msg += ` · ${overflow} sold to make room (stack limit ${ARTIFACT_STACK})`;
  flash(msg);
  if (queued) {
    flash(`The album page is full (${MAX_HOARD}/${MAX_HOARD}) — decide what happens to ${queued} pull${queued > 1 ? 's' : ''}.`);
    resolveHoardOverflow(pending, () => {
      renderCollection();
      saveState();
    });
  }
}
viewer.addEventListener('click', advanceInspection);
$('#viewerSkip').addEventListener('click', e => {
  e.stopPropagation();
  finishReview();
});
$('#confirmYes').addEventListener('click', confirmSale);
$('#confirmNo').addEventListener('click', cancelSale);

