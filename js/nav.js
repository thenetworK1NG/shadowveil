/* ============================================================
   NAVIGATION — menu, pack room and arena are separate screens
   ============================================================ */
const menu = document.querySelector('.menu');
const packScreen = $('#packScreen'), arenaScreen = $('#arenaScreen'), collectionScreen = $('#collectionScreen'), tradeScreen = $('#tradeScreen');
function showMenu() {
  menu.classList.remove('hidden');
  packScreen.classList.add('hidden');
  arenaScreen.classList.add('hidden');
  collectionScreen.classList.add('hidden');
  tradeScreen.classList.add('hidden');
  tradeCleanup();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
$('#menuPackBtn').addEventListener('click', () => {
  menu.classList.add('hidden');
  packScreen.classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
});
$('#menuArenaBtn').addEventListener('click', () => {
  menu.classList.add('hidden');
  arenaScreen.classList.remove('hidden');
  openPicker();
  window.scrollTo({ top: 0, behavior: 'smooth' });
});
$('#menuColBtn').addEventListener('click', () => {
  menu.classList.add('hidden');
  arenaScreen.classList.add('hidden');
  packScreen.classList.add('hidden');
  collectionScreen.classList.remove('hidden');
  renderCollection();
  window.scrollTo({ top: 0, behavior: 'smooth' });
});
$('#backMenuCol').addEventListener('click', showMenu);
$('#backMenuPack').addEventListener('click', showMenu);
$('#menuTradeBtn').addEventListener('click', () => {
  menu.classList.add('hidden');
  arenaScreen.classList.add('hidden');
  packScreen.classList.add('hidden');
  collectionScreen.classList.add('hidden');
  tradeScreen.classList.remove('hidden');
  openTrade();
  window.scrollTo({ top: 0, behavior: 'smooth' });
});
$('#backMenuTrade').addEventListener('click', showMenu);

