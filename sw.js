/* Shadowveil service worker — precaches the app shell so the game
   launches offline, and caches the Firebase CDN scripts at runtime
   (with the app's __fbOffline fallback kicking in if they're missing). */
const VERSION = 'shadowveil-v1';
const CORE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/styles.css',
  './js/data.js',
  './js/core.js',
  './js/packs.js',
  './js/nav.js',
  './js/trade.js',
  './js/battle.js',
  './js/grading.js',
  './js/auth.js',
  './js/app.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(VERSION)
      .then(c => c.addAll(CORE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === location.origin) {
    if (req.mode === 'navigate') {
      e.respondWith(
        fetch(req).then(res => {
          const copy = res.clone();
          caches.open(VERSION).then(c => c.put('./index.html', copy));
          return res;
        }).catch(() => caches.match('./index.html'))
      );
      return;
    }
    e.respondWith(
      caches.match(req).then(hit => hit || fetch(req).then(res => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(VERSION).then(c => c.put(req, copy));
        }
        return res;
      }))
    );
    return;
  }

  if (url.hostname === 'www.gstatic.com') {
    e.respondWith(
      caches.match(req).then(hit =>
        hit || fetch(req).then(res => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(VERSION).then(c => c.put(req, copy));
          }
          return res;
        }).catch(() => caches.match(req))
      )
    );
  }
});
