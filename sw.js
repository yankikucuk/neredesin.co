/**
 * @fileoverview Service worker: offline support with pragmatic caching.
 *
 * Strategies:
 *   - Navigations (HTML)          network-first, cache fallback
 *   - posts/ markdown + index     network-first, cache fallback (freshness)
 *   - sounds/ media               cache-first (large, effectively immutable)
 *   - other same-origin assets    stale-while-revalidate (?v= ignored)
 *   - CDN (jsdelivr, Google Fonts) cache-first (URLs are version-pinned)
 *   - everything else             untouched (e.g. analytics)
 *
 * CACHE_VERSION is stamped by tools/generate.py from a content hash of
 * the site's own assets, so every release activates a fresh cache and
 * old ones are dropped on activate.
 *
 * @license MIT
 */

const CACHE_VERSION = "22381d55";
const CACHE_NAME = `neredesin-${CACHE_VERSION}`;

/** App shell precached on install (relative to the worker's scope). */
const PRECACHE = [
  "./",
  "index.html",
  "blog.html",
  "portfolio.html",
  "404.html",
  "style.css",
  "script.js",
  "site.js",
  "lib/utils.js",
  "manifest.json",
  "favicon.svg",
  "favicon-32.png",
  "en/index.html",
  "en/blog.html",
  "en/portfolio.html",
];

/** Cross-origin hosts safe to cache-first (version-pinned URLs). */
const CDN_HOSTS = [
  "cdn.jsdelivr.net",
  "fonts.googleapis.com",
  "fonts.gstatic.com",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE))
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
            .filter((k) => k.startsWith("neredesin-") && k !== CACHE_NAME)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

/**
 * Network-first: try the network, fall back to cache when offline.
 * Successful responses refresh the cache.
 *
 * @param {Request} request
 * @returns {Promise<Response>}
 */
async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const fresh = await fetch(request);
    if (fresh.ok) cache.put(request, fresh.clone());
    return fresh;
  } catch (err) {
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    throw err;
  }
}

/**
 * Cache-first: serve from cache, fetch and store on miss.
 *
 * @param {Request} request
 * @returns {Promise<Response>}
 */
async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request, { ignoreSearch: true });
  if (cached) return cached;
  const fresh = await fetch(request);
  if (fresh.ok) cache.put(request, fresh.clone());
  return fresh;
}

/**
 * Stale-while-revalidate: serve cache immediately when present and
 * refresh it in the background; otherwise wait for the network.
 *
 * @param {Request} request
 * @returns {Promise<Response>}
 */
async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request, { ignoreSearch: true });
  const refresh = fetch(request)
    .then((fresh) => {
      if (fresh.ok) cache.put(request, fresh.clone());
      return fresh;
    })
    .catch(() => cached);
  return cached || refresh;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  if (url.origin === self.location.origin) {
    if (request.mode === "navigate") {
      event.respondWith(networkFirst(request));
    } else if (url.pathname.includes("/posts/")) {
      event.respondWith(networkFirst(request));
    } else if (url.pathname.includes("/sounds/")) {
      event.respondWith(cacheFirst(request));
    } else {
      event.respondWith(staleWhileRevalidate(request));
    }
    return;
  }

  if (CDN_HOSTS.includes(url.hostname)) {
    event.respondWith(cacheFirst(request));
  }
});
