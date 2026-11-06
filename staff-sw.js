/*
 * GSD Staff service worker (hand-written, no build step).
 *
 * Registered ONLY by the staff portal, with scope /talent/portal or
 * /es/talento/portal, so it never controls the public marketing site.
 *
 * Strategy:
 *  - Page navigations: network first (always the latest Lovable deploy),
 *    falling back to the last good copy, then to a tiny offline page.
 *  - Hashed build assets (/assets/*): cache first. They are immutable, so a
 *    new deploy simply requests new file names.
 *  - Everything else (Supabase API, fonts, analytics): untouched.
 */
const VERSION = 'gsd-staff-v1';
const PAGE_CACHE = `${VERSION}-pages`;
const ASSET_CACHE = `${VERSION}-assets`;
const MAX_ASSETS = 120;

const OFFLINE_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>GSD Staff</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
background:#000;color:#fff;font-family:system-ui,sans-serif;text-align:center;padding:24px}
h1{color:#21E957;font-size:22px}button{margin-top:16px;background:#21E957;color:#000;border:0;
border-radius:12px;padding:12px 20px;font-weight:700}</style></head><body><div>
<h1>GSD Staff</h1><p>You are offline. / Estás sin conexión.</p>
<button onclick="location.reload()">Retry / Reintentar</button></div></body></html>`;

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k.startsWith('gsd-staff-') && !k.startsWith(VERSION)).map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

async function trimAssets() {
  const cache = await caches.open(ASSET_CACHE);
  const keys = await cache.keys();
  if (keys.length <= MAX_ASSETS) return;
  await Promise.all(keys.slice(0, keys.length - MAX_ASSETS).map((k) => cache.delete(k)));
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          if (res.ok) {
            const cache = await caches.open(PAGE_CACHE);
            cache.put(req, res.clone());
          }
          return res;
        } catch {
          const cached = await caches.match(req, { ignoreSearch: true });
          if (cached) return cached;
          return new Response(OFFLINE_HTML, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
        }
      })(),
    );
    return;
  }

  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(req);
        if (cached) return cached;
        const res = await fetch(req);
        if (res.ok) {
          const cache = await caches.open(ASSET_CACHE);
          await cache.put(req, res.clone());
          trimAssets();
        }
        return res;
      })(),
    );
  }
});
