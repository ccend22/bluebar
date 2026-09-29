// BlueBar service worker. BlueBar is an online POS — orders, stock and payments must
// always be live — so this never serves data from a cache:
//   * /api/* and anything that isn't a GET: straight to the network, never stored.
//   * The page itself: network first (a new deploy shows up immediately); only when
//     the network is unreachable does the last copy open, so the app starts and
//     can say it's offline instead of showing the browser's error page.
//   * /assets/*: Vite names them by content hash, so a cached copy is never stale.
//     Each time a fresh page arrives, assets it no longer references are dropped.
const CACHE = "bluebar-v1";
const SHELL = "/";

// The first visit's page loads before this worker exists, so store the page and its
// current assets right away — otherwise going offline after a first visit would still
// show the browser's error page.
self.addEventListener("install", (event) =>
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      const response = await fetch(SHELL, { cache: "no-cache" });
      if (response.ok) {
        await cache.put(SHELL, response.clone());
        const html = await response.text();
        for (const path of new Set(html.match(/\/assets\/[^"'\s)]+/g) || []))
          await cache.add(path).catch(() => {});
      }
      await self.skipWaiting();
    })(),
  ),
);
self.addEventListener("activate", (event) =>
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
      await self.clients.claim();
    })(),
  ),
);

async function page(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) {
      await cache.put(SHELL, response.clone());
      const html = await response.clone().text();
      const current = new Set(html.match(/\/assets\/[^"'\s)]+/g) || []);
      for (const cached of await cache.keys()) {
        const path = new URL(cached.url).pathname;
        if (path.startsWith("/assets/") && !current.has(path)) await cache.delete(cached);
      }
    }
    return response;
  } catch {
    return (await cache.match(SHELL)) || Response.error();
  }
}

async function asset(request) {
  const cache = await caches.open(CACHE);
  // ignoreVary: servers mark assets "Vary: Origin", and a <script crossorigin> request
  // differs from the one that stored it — a content-hashed file is identical regardless.
  const cached = await cache.match(request, { ignoreVary: true });
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  if (request.mode === "navigate") event.respondWith(page(request));
  else if (url.pathname.startsWith("/assets/")) event.respondWith(asset(request));
});
