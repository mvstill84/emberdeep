// Emberdeep offline cache: always try the network first so updates land,
// fall back to the last copy when there's no signal (road trips).
const CACHE = 'emberdeep-v1';
const CORE = ['./', './index.html', './icon.png', './icon-512.png', './manifest.webmanifest', './vendor/qrcode.min.js', './vendor/jsqr.min.js'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).catch(() => {})); self.skipWaiting(); });
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  const req = e.request, u = new URL(req.url);
  if (req.method !== 'GET' || u.origin !== location.origin) return;
  const key = u.pathname.endsWith('/') ? u.pathname + 'index.html' : u.pathname; // ignore ?v= cache-busters
  const net = new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('slow')), 4000); // weak signal: don't hang, use the cache
    fetch(req).then(r => { clearTimeout(t); if (r.ok) { const cp = r.clone(); caches.open(CACHE).then(c => c.put(key, cp)); } res(r); }, err => { clearTimeout(t); rej(err); });
  });
  e.respondWith(net.catch(() => caches.match(key).then(r => r || caches.match('./index.html')).then(r => r || Response.error())));
});
