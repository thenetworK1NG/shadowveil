
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

    const cards = [pickCard(), pickCard(), pickCard(), pickCard(), pickCard()];
    dealt = cards;
    // responsive fan — fit all five cards inside the viewport on any screen
    const vw = document.documentElement.clientWidth;
    const pad = 8;
    const cw = Math.min(200, Math.max(110, Math.floor((vw - pad * 2) / 2.5)));
    const ch = Math.round(cw * 1.45);
    const step = (vw - pad * 2 - cw) / 4;
    const rotBase = cw < 180 ? 4 : 5;
    fan.style.height = (ch + 130) + 'px';
    cards.forEach((p, i) => {
      const el = buildCard(p, 'deal-card', true);
      el.style.width = cw + 'px';
      el.style.height = ch + 'px';
      el.style.setProperty('--tx', Math.round((i - 2) * step) + 'px');
      el.style.setProperty('--ty', (Math.abs(i - 2) * 20) + 'px');
      el.style.setProperty('--rot', ((i - 2) * rotBase) + 'deg');
      el.style.setProperty('--delay', (i * .16 + .2) + 's');
      fan.appendChild(el);
    });

    // flip each card over, animate stat bars, sparkle rares
    setTimeout(() => {
      $$('.deal-card').forEach((el, i) => {
        setTimeout(() => {
          el.querySelector('.flip-inner').classList.add('flipped');
          el.querySelectorAll('.chip i em').forEach(b => b.style.width = b.dataset.v + '%');
          const tcard = el.querySelector('.tcard');
          const isDia = tcard.classList.contains('rare-diamond');
          const isGold = tcard.classList.contains('rare-gold');
          if (isDia || (isGold && Math.random() > .5)) sparkle(el);
        }, i * 260);
      });
      setTimeout(() => {
        // review time — tap a card to see it big, tap again for the next
        $$('.deal-card').forEach(el => {
          el.addEventListener('click', startInspection);
        });
        hint.textContent = 'Tap a card to inspect it';
        dealing = false;
      }, cards.length * 260 + 900);
    }, 650);
  }, 520);
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
  const p = dealt[inspectIdx];
  viewerCard.innerHTML = '';
  viewerCard.appendChild(buildCard({ ...p }, 'viewer-draw', true));
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

/* --- bind the pack's creatures to the hoard, then start a fresh pack --- */
function collectDealt() {
  let fresh = 0;
  dealt.forEach(p => {
    if (!state.owned.some(o => o.name === p.name)) {
      state.owned.push({ name: p.name, wins: 0, losses: 0, streak: 0 });
      fresh++;
    }
  });
  const total = dealt.length;
  saveState();
  renderCollection();
  dealt = [];
  fan.innerHTML = '';
  actions.innerHTML = '';
  fan.classList.add('hidden');
  packZone.classList.remove('hidden');
  pack.classList.remove('burst');
  refreshPackHint();
  flash(fresh
    ? `Collected ${total} creatures — ${fresh} new to the hoard`
    : `Pack reviewed — all ${total} creatures already bound`);
}
viewer.addEventListener('click', advanceInspection);
$('#viewerSkip').addEventListener('click', e => {
  e.stopPropagation();
  finishReview();
});
$('#confirmYes').addEventListener('click', confirmSale);
$('#confirmNo').addEventListener('click', cancelSale);

