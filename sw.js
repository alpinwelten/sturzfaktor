/* Service Worker – Offline-Betrieb für den Sturzfaktor-/Fangstoß-Rechner.
   Strategie: App-Shell beim Install vorgeladen; Inhalt (HTML/JS/CSS) network-first
   (damit Updates ohne Neuinstallation ankommen), übrige same-origin GETs cache-first. */
/* v5: Dynamik-Karte einklappbar (details.disc, standardmäßig zu) in
   index.html/app.js/styles.css – keine neuen Dateien, SHELL unverändert. */
const VERSION = 'sturzfaktor-v5';
const SHELL = [
  './',
  'index.html',
  'styles.css',
  'app.js',
  'js/engine.mjs',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-180.png',
  'icons/icon-32.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function store(req, res) {
  if (res && res.status === 200 && res.type === 'basic') {
    const copy = res.clone();
    caches.open(VERSION).then((c) => c.put(req, copy));
  }
  return res;
}
function networkFirst(req) {
  return fetch(req).then((res) => store(req, res)).catch(() => caches.match(req));
}
function cacheFirst(req) {
  return caches.match(req).then((cached) => cached || fetch(req).then((res) => store(req, res)));
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // externe Links direkt durchlassen

  const isContent = req.mode === 'navigate' || url.pathname.endsWith('/') ||
    /\.(html|js|mjs|css)$/.test(url.pathname);
  e.respondWith(isContent ? networkFirst(req) : cacheFirst(req));
});
