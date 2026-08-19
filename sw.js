/* Service Worker – Offline-Betrieb für den Sturzfaktor-/Fangstoß-Rechner.
   Strategie: App-Shell beim Install vorgeladen; Inhalt (HTML/JS/CSS) network-first
   (damit Updates ohne Neuinstallation ankommen), übrige same-origin GETs cache-first. */
/* v10: Höhenkonstanz strukturell statt gemessen. Alle Texte, die pro Regler-Tick
   wechseln (Kopfzeile, Ergebniszeile, Trendzeile, Formel-Unterzeilen, c-Notiz,
   Modul-Rückrechnung), sind einzeilig erzwungen (nowrap + Ellipsis) bzw. auf
   feste Zeilenhöhe gesetzt; die Kopfzeile wird bei offener Schublade gar nicht
   mehr fortgeschrieben. Damit hängt keine Höhe mehr an Glyphenbreiten oder
   Text-Zoom – index.html/app.js/styles.css/README, keine neuen Dateien,
   SHELL unverändert. */
/* v11: Testprotokoll — Karte am Seitenende speichert Rechnungen fortlaufend
   nummeriert („Test 1", „Test 2", …) unter localStorage sturzfaktor.tests.v1
   und exportiert sie als echtes .xlsx ohne Fremdbibliothek. Neue Shell-Dateien
   js/protokoll.mjs + js/xlsx.mjs (app.js importiert beide — ohne Precache wäre
   der Offline-Start nach dem Update kaputt). */
const VERSION = 'sturzfaktor-v11';
const SHELL = [
  './',
  'index.html',
  'styles.css',
  'app.js',
  'js/engine.mjs',
  'js/protokoll.mjs',
  'js/xlsx.mjs',
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
