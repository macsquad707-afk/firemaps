// Fire Maps service worker: opens fast and keeps map pieces you've already seen on your phone.
const APP = 'firemaps-app-v11';
const LIBS = 'firemaps-libs-v1';   // map library (versioned URLs, never change)
const MAPS = 'firemaps-maps-v1';   // map tiles, fonts, icons and satellite images
const MAX_MAP_ITEMS = 4000;
const SHELL = ['./', './index.html', './manifest.json', './apple-touch-icon.png', './icon.svg'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(APP).then(c => c.addAll(SHELL)));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  const keep = [APP, LIBS, MAPS];
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => !keep.includes(k)).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

let puts = 0;
async function trim() {
  const c = await caches.open(MAPS), keys = await c.keys();
  for (let i = 0; i < keys.length - MAX_MAP_ITEMS; i++) await c.delete(keys[i]);
}
async function cacheFirst(req, name) {
  const c = await caches.open(name);
  const hit = await c.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) { c.put(req, res.clone()); if (name === MAPS && ++puts % 100 === 0) trim(); }
  return res;
}
async function staleWhileRevalidate(req, name) {
  const c = await caches.open(name);
  const hit = await c.match(req);
  const net = fetch(req).then(res => { if (res.ok) c.put(req, res.clone()); return res; }).catch(() => hit);
  return hit || net;
}
async function networkFirst(req) {
  const c = await caches.open(APP);
  try { const res = await fetch(req); if (res.ok) c.put(req, res.clone()); return res; }
  catch { return (await c.match(req)) || (await c.match('./index.html')); }
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) { e.respondWith(networkFirst(req)); return; }
  if (url.hostname === 'cdnjs.cloudflare.com') { e.respondWith(cacheFirst(req, LIBS)); return; }
  if (url.hostname === 'tiles.openfreemap.org') {
    // The style and tile list change when the map data is updated; everything else has versioned URLs
    if (url.pathname.startsWith('/styles/') || !/\.(pbf|png|json)$/.test(url.pathname) || url.pathname.endsWith('/backup_planet')) e.respondWith(staleWhileRevalidate(req, MAPS));
    else e.respondWith(cacheFirst(req, MAPS));
    return;
  }
  if (url.hostname === 'server.arcgisonline.com') { e.respondWith(cacheFirst(req, MAPS)); return; }
});
