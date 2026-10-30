/* Fuchine service worker (T3.13). Hand-written on purpose: no next-pwa/workbox.
 *
 * What it caches, and only this:
 *   - the offline fallback page + icons (precached on install);
 *   - Next's content-hashed build assets under /_next/static/ (cache-first —
 *     the hash in the URL changes whenever the content does).
 *
 * What it NEVER caches: /api/* responses, page HTML (navigations), React
 * Server Component payloads, or anything else that can carry user data. Those
 * go straight to the network; a navigation that fails falls back to the static
 * offline page. Reviews need the YouTube clip, so there is no offline review.
 *
 * Bump VERSION when this file or the precache list changes; activate() drops
 * every older "fuchine-" cache.
 */
const VERSION = "v1";
const CACHE_PREFIX = "fuchine-";
const STATIC_CACHE = `${CACHE_PREFIX}static-${VERSION}`;
const OFFLINE_URL = "/offline.html";
const PRECACHE_URLS = [
  OFFLINE_URL,
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon.svg",
];
/** Old build chunks pile up across deploys; keep the static cache bounded. */
const MAX_STATIC_ENTRIES = 250;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS.map((url) => new Request(url, { cache: "reload" }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith(CACHE_PREFIX) && key !== STATIC_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

/** How a request is handled: "offline-fallback", "cache-first", or null (browser default, never cached). */
function strategyFor(request) {
  if (request.method !== "GET") return null;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return null; // YouTube, fonts, thumbnails
  if (url.pathname.startsWith("/api/")) return null; // user data — never cached
  if (request.mode === "navigate") return "offline-fallback";
  if (url.pathname.startsWith("/_next/static/")) return "cache-first";
  if (PRECACHE_URLS.includes(url.pathname)) return "cache-first";
  return null;
}

async function trimCache(cache) {
  const keys = await cache.keys();
  const excess = keys.length - MAX_STATIC_ENTRIES;
  // Cache keys come back in insertion order: drop the oldest, keep the precache.
  for (let i = 0, dropped = 0; i < keys.length && dropped < excess; i++) {
    if (PRECACHE_URLS.includes(new URL(keys[i].url).pathname)) continue;
    await cache.delete(keys[i]);
    dropped++;
  }
}

async function cacheFirst(event) {
  const cache = await caches.open(STATIC_CACHE);
  const hit = await cache.match(event.request);
  if (hit) return hit;
  const response = await fetch(event.request);
  if (response.ok && response.type === "basic") {
    event.waitUntil(cache.put(event.request, response.clone()).then(() => trimCache(cache)));
  }
  return response;
}

async function networkWithOfflineFallback(event) {
  try {
    // Straight to the network, never stored: page HTML carries user data.
    return await fetch(event.request);
  } catch (err) {
    const offline = await caches.match(OFFLINE_URL);
    if (offline) return offline;
    throw err;
  }
}

self.addEventListener("fetch", (event) => {
  const strategy = strategyFor(event.request);
  if (strategy === "cache-first") event.respondWith(cacheFirst(event));
  else if (strategy === "offline-fallback") event.respondWith(networkWithOfflineFallback(event));
  // null: no respondWith — the browser fetches it exactly as without a worker.
});
