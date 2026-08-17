/* ============================================================
   NAVIGATION — menu, pack room and arena are separate screens
   ============================================================ */
const menu = document.querySelector('.menu');
const siteHeader = $('#siteHeader');
const siteFooter = $('#siteFooter');
const packScreen = $('#packScreen'), arenaScreen = $('#arenaScreen'), collectionScreen = $('#collectionScreen'), gradingScreen = $('#gradingScreen'), tradeScreen = $('#tradeScreen'), settingsScreen = $('#settingsScreen'), hallScreen = $('#leaderboardScreen');
function battleLocked() { return typeof battleActive !== 'undefined' && battleActive; }
function setHeaderVisible(v) {
  if (siteHeader) siteHeader.classList.toggle('hidden', !v);
}
function setFooterVisible(v) {
  if (siteFooter) siteFooter.classList.toggle('hidden', !v);
}
function showMenu() {
  if (battleLocked()) return;
  if (typeof abortBattle === 'function') abortBattle();
  menu.classList.remove('hidden');
  packScreen.classList.add('hidden');
  arenaScreen.classList.add('hidden');
  collectionScreen.classList.add('hidden');
  gradingScreen.classList.add('hidden');
  tradeScreen.classList.add('hidden');
  settingsScreen.classList.add('hidden');
  hallScreen.classList.add('hidden');
  setHeaderVisible(true);
  setFooterVisible(true);
  tradeCleanup();
  setWalletVisible(true);
  if (typeof updateLabStatus === 'function') updateLabStatus();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function openSettings() {
  if (battleLocked()) return;
  menu.classList.add('hidden');
  packScreen.classList.add('hidden');
  arenaScreen.classList.add('hidden');
  collectionScreen.classList.add('hidden');
  gradingScreen.classList.add('hidden');
  tradeScreen.classList.add('hidden');
  hallScreen.classList.add('hidden');
  settingsScreen.classList.remove('hidden');
  setHeaderVisible(false);
  setFooterVisible(false);
  setWalletVisible(false);
  const u = document.getElementById('settingsUser');
  if (u) u.textContent = currentUser ? currentUser.user : '—';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
$('#menuHallBtn').addEventListener('click', () => {
  if (battleLocked()) return;
  menu.classList.add('hidden');
  arenaScreen.classList.add('hidden');
  gradingScreen.classList.add('hidden');
  packScreen.classList.add('hidden');
  collectionScreen.classList.add('hidden');
  hallScreen.classList.remove('hidden');
  setHeaderVisible(false);
  setFooterVisible(false);
  setWalletVisible(false);
  watchLeaderboard();
  renderLeaderboard();
  window.scrollTo({ top: 0, behavior: 'smooth' });
});
$('#backMenuHall').addEventListener('click', showMenu);
$('#menuPackBtn').addEventListener('click', () => {
  if (battleLocked()) return;
  if (typeof resumePendingPack === 'function' && resumePendingPack()) return;
  menu.classList.add('hidden');
  gradingScreen.classList.add('hidden');
  hallScreen.classList.add('hidden');
  packScreen.classList.remove('hidden');
  setHeaderVisible(false);
  setFooterVisible(false);
  setWalletVisible(true);
  window.scrollTo({ top: 0, behavior: 'smooth' });
});
$('#menuArenaBtn').addEventListener('click', () => {
  if (battleLocked()) return;
  menu.classList.add('hidden');
  hallScreen.classList.add('hidden');
  arenaScreen.classList.remove('hidden');
  setHeaderVisible(false);
  setFooterVisible(false);
  setWalletVisible(false);
  openPicker();
  window.scrollTo({ top: 0, behavior: 'smooth' });
});
$('#menuColBtn').addEventListener('click', () => {
  if (battleLocked()) return;
  menu.classList.add('hidden');
  arenaScreen.classList.add('hidden');
  gradingScreen.classList.add('hidden');
  hallScreen.classList.add('hidden');
  packScreen.classList.add('hidden');
  collectionScreen.classList.remove('hidden');
  setHeaderVisible(false);
  setFooterVisible(false);
  setWalletVisible(true);
  renderCollection();
  window.scrollTo({ top: 0, behavior: 'smooth' });
});
$('#menuGradingBtn').addEventListener('click', () => {
  if (battleLocked()) return;
  menu.classList.add('hidden');
  arenaScreen.classList.add('hidden');
  hallScreen.classList.add('hidden');
  packScreen.classList.add('hidden');
  collectionScreen.classList.add('hidden');
  gradingScreen.classList.remove('hidden');
  setHeaderVisible(false);
  setFooterVisible(false);
  setWalletVisible(true);
  renderGrading();
  window.scrollTo({ top: 0, behavior: 'smooth' });
});
$('#backMenuCol').addEventListener('click', showMenu);
$('#backMenuPack').addEventListener('click', showMenu);
$('#backMenuGrading').addEventListener('click', showMenu);
$('#menuTradeBtn').addEventListener('click', () => {
  if (battleLocked()) return;
  menu.classList.add('hidden');
  arenaScreen.classList.add('hidden');
  gradingScreen.classList.add('hidden');
  hallScreen.classList.add('hidden');
  packScreen.classList.add('hidden');
  collectionScreen.classList.add('hidden');
  tradeScreen.classList.remove('hidden');
  setHeaderVisible(false);
  setFooterVisible(false);
  setWalletVisible(false);
  openTrade();
  window.scrollTo({ top: 0, behavior: 'smooth' });
});
$('#backMenuTrade').addEventListener('click', showMenu);
$('#menuSettingsBtn').addEventListener('click', openSettings);
$('#backMenuSettings').addEventListener('click', showMenu);
$('#settingsLogout').addEventListener('click', () => logout());
$('#clearAccountBtn').addEventListener('click', () => openClearAccountPopup());
