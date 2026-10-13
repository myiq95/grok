const CACHE_NAME = 'seojae-v1';
const ASSETS = [
  './',
  './index.html',
  './css/styles.css',
  './js/db.js',
  './js/parser.js',
  './js/toc.js',
  './js/tts.js',
  './js/app.js',
  './js/sw-register.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  // CDN libs (best-effort cache)
  'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js',
  'https://cdn.jsdelivr.net/npm/mammoth@1.8.0/mammoth.browser.min.js',
  'https://cdn.jsdelivr.net/npm/marked@12.0.0/marked.min.js',
  'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js',
  'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js',
  'https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@400;500;600;700&family=Noto+Sans+KR:wght@300;400;500;600;700&family=Nanum+Myeongjo:wght@400;700&display=swap'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS).catch(err => {
        console.warn('Some assets failed to cache', err);
        // Cache core assets individually
        return Promise.allSettled(
          ASSETS.map(url => cache.add(url).catch(() => null))
        );
      }))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  // Skip non-GET
  if (req.method !== 'GET') return;

  event.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;

      return fetch(req).then(res => {
        // Cache successful responses for same-origin or CDN
        if (res.ok && (req.url.startsWith(self.location.origin) || 
            req.url.includes('cdn.jsdelivr.net') || 
            req.url.includes('cdnjs.cloudflare.com') ||
            req.url.includes('fonts.googleapis.com') ||
            req.url.includes('fonts.gstatic.com'))) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, clone));
        }
        return res;
      }).catch(() => {
        // Offline fallback for navigation
        if (req.mode === 'navigate') {
          return caches.match('./index.html');
        }
        return new Response('Offline', { status: 503, statusText: 'Offline' });
      });
    })
  );
});
