/* VolleyTeam Manager (Coach) - Service Worker
   Aggiornamento controllato: il nuovo SW resta in attesa finché l'utente
   non conferma (banner o pulsante in Impostazioni). skipWaiting solo su richiesta.
   Bump CACHE_VERSION ad ogni rilascio. I dati utente (localStorage) non vengono mai toccati. */
const CACHE_VERSION = 'volleyteam-v55';
const APP_SHELL = [
  './',
  './index.html',
  './app.js',
  './soundkit.js',
  './manifest.json',
  './icons/logo-badge.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png'
];

// Installazione: pre-cache dell'app shell. NON attiva subito: aspetta conferma.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL))
  );
});

// Attivazione: pulizia delle cache vecchie e presa di controllo
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// La pagina chiede di applicare l'aggiornamento in attesa
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

// Fetch: same-origin cache-first (offline), CDN stale-while-revalidate
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  if (sameOrigin) {
    event.respondWith(
      caches.match(req).then((cached) =>
        cached ||
        fetch(req).then((res) => {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((c) => c.put(req, copy));
          return res;
        }).catch(() => caches.match('./index.html'))
      )
    );
  } else {
    event.respondWith(
      caches.open(CACHE_VERSION).then((cache) =>
        cache.match(req).then((cached) => {
          const network = fetch(req).then((res) => {
            cache.put(req, res.clone());
            return res;
          }).catch(() => cached);
          return cached || network;
        })
      )
    );
  }
});
