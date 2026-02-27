// ── BabyLog Service Worker v1.1.0 ──
// NOTA: aggiorna CACHE_NAME ad ogni deploy per forzare refresh
const CACHE_NAME = 'babylog-v1.1.0';

// Usa percorsi RELATIVI (funziona su qualsiasi base path, es. /baby-log/)
// L'app shell viene popolata dinamicamente al primo fetch
const PRECACHE = [];  // Non precachiamo nulla nell'install per evitare errori 404

// ── INSTALL ──
self.addEventListener('install', e => {
  // Niente da precachare, entra in waiting
  console.log('[SW] Installed', CACHE_NAME);
});

// ── ACTIVATE: pulisce vecchie cache ──
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => {
        console.log('[SW] Deleting old cache:', k);
        return caches.delete(k);
      }))
    ).then(() => self.clients.claim())
  );
});

// ── FETCH ──
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Firebase, gstatic, CDN esterni → sempre network, mai cache
  if (
    url.hostname.includes('firestore.googleapis.com') ||
    url.hostname.includes('firebase') ||
    url.hostname.includes('gstatic.com') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('cloudflare.com') ||
    url.hostname.includes('fonts.gstatic.com')
  ) {
    e.respondWith(fetch(e.request).catch(() => new Response('', { status: 503 })));
    return;
  }

  // HTML (index.html, root) → Network-first: scarica sempre la versione fresca
  if (
    e.request.destination === 'document' ||
    url.pathname.endsWith('.html') ||
    url.pathname.endsWith('/')
  ) {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          // Aggiorna la cache con la risposta fresca
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
          }
          return res;
        })
        .catch(() => {
          // Offline: serve dalla cache se disponibile
          return caches.match(e.request);
        })
    );
    return;
  }

  // Tutto il resto (JS, CSS, font) → Cache-first
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
        }
        return res;
      });
    })
  );
});

// ── SKIP_WAITING: attivazione immediata su richiesta dell'app ──
self.addEventListener('message', e => {
  if (e.data?.type === 'SKIP_WAITING') {
    console.log('[SW] Skipping waiting, activating now');
    self.skipWaiting();
  }
});
