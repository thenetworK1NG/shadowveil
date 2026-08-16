/* ============================================================
   PWA BOOTSTRAP — service worker registration + the Settings
   install button that listens for the browser's install prompt.
   ============================================================ */
let deferredInstall = null;

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true;
}

function setupInstallButton() {
  const btn = document.getElementById('installAppBtn');
  if (!btn) return;
  const show = !!deferredInstall && !isStandalone();
  btn.classList.toggle('hidden', !show);
  if (deferredInstall) {
    btn.onclick = () => {
      deferredInstall.prompt();
      deferredInstall.userChoice.then(() => { deferredInstall = null; setupInstallButton(); });
    };
  }
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredInstall = e;
  setupInstallButton();
});

window.addEventListener('appinstalled', () => {
  deferredInstall = null;
  setupInstallButton();
});

window.addEventListener('load', setupInstallButton);
