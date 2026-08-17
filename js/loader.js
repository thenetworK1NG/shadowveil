/* Coordinates the small set of async tasks needed before the app is usable. */
(function () {
  const loader = document.getElementById('appLoader');
  const status = document.getElementById('loaderStatus');
  const progress = document.getElementById('loaderProgress');
  const ready = { art: false, profile: false };
  let closed = false;

  function setStatus(text) {
    if (status) status.textContent = text;
  }
  function update() {
    const count = Object.values(ready).filter(Boolean).length;
    if (progress) progress.style.width = (count / Object.keys(ready).length * 100) + '%';
    if (count === Object.keys(ready).length) close();
  }
  function close() {
    if (closed || !loader) return;
    closed = true;
    if (progress) progress.style.width = '100%';
    setStatus('Ready');
    loader.classList.add('done');
    setTimeout(() => loader.remove(), 520);
  }
  window.shadowveilLoaderStatus = setStatus;
  window.shadowveilLoaderReady = key => {
    if (!(key in ready)) return;
    ready[key] = true;
    update();
  };

  setStatus('Loading creature data...');
  // A failed remote profile request already has its own timeout; this keeps a
  // broken offline service from leaving the shell covered forever.
  setTimeout(() => {
    if (closed) return;
    setStatus('Continuing in offline mode...');
    ready.art = true;
    ready.profile = true;
    update();
  }, 12000);
}());
