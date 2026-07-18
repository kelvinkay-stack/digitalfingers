/* sw.js - hand-written service worker. No libraries, same rules as the site:
 * plain code, nothing clever that can't be explained in a paragraph.
 *
 * Caches:
 *   df-shell-<v>  app shell, precached on install, versioned - bump VERSION
 *                 when the shell list changes shape; individual files stay
 *                 fresh via stale-while-revalidate below.
 *   df-audio-v1   clips and demos, cache-first, unversioned so downloaded
 *                 music survives shell updates.
 *   df-stats-v1   last good /api/stats aggregate, network-first fallback.
 */

const VERSION = 'v4';
const SHELL_CACHE = `df-shell-${VERSION}`;
const AUDIO_CACHE = 'df-audio-v1';
const STATS_CACHE = 'df-stats-v1';
const KEEP = [SHELL_CACHE, AUDIO_CACHE, STATS_CACHE];

const SHELL = [
  '/',
  '/learn.html',
  '/about.html',
  '/results.html',
  '/css/style.css?v=20260717-3',
  '/fonts/fonts.css',
  '/fonts/cormorant-garamond-normal-500-latin.woff2',
  '/fonts/cormorant-garamond-normal-500-latin-ext.woff2',
  '/fonts/cormorant-garamond-normal-600-latin.woff2',
  '/fonts/cormorant-garamond-normal-600-latin-ext.woff2',
  '/fonts/cormorant-garamond-italic-500-latin.woff2',
  '/fonts/cormorant-garamond-italic-500-latin-ext.woff2',
  '/js/main.js',
  '/js/game.js',
  '/js/player.js',
  '/js/stats.js',
  '/js/waveform.js',
  '/js/learn.js',
  '/js/results.js',
  '/js/rating.js',
  '/js/mixer.js',
  '/js/pwa.js',
  '/data/clips.json',
  '/assets/favicon.svg?v=3',
  '/assets/icon-192.png',
  '/assets/robot-human-pianists.webp',
  '/assets/robot-human-violinists.jpg',
  '/manifest.webmanifest',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(SHELL_CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => !KEEP.includes(k)).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* Serve cached, refresh the copy in the background. Keeps the no-build-step
 * promise: code and data changes reach clients on the next visit without a
 * service-worker version bump. */
async function staleWhileRevalidate(req) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(req, { ignoreVary: true });
  const refresh = fetch(req)
    .then(res => { if (res.ok) cache.put(req, res.clone()); return res; })
    .catch(() => undefined);
  return cached || refresh.then(res => res || Response.error());
}

/* Audio never changes once published: serve from cache, fill the cache the
 * first time each clip is heard. */
async function audioCacheFirst(req) {
  const cache = await caches.open(AUDIO_CACHE);
  const cached = await cache.match(req, { ignoreVary: true });
  if (cached) return cached;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}

/* Crowd numbers want to be fresh, but a stale aggregate beats none. */
async function statsNetworkFirst(req) {
  const cache = await caches.open(STATS_CACHE);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    const cached = await cache.match(req, { ignoreVary: true });
    return cached || Response.error();
  }
}

/* Fresh pages when online, cached pages when not. */
async function pageNetworkFirst(req) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    const cached = await cache.match(req, { ignoreVary: true });
    return cached || cache.match('/') || Response.error();
  }
}

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  if (e.request.method !== 'GET') return; // stats POSTs go straight through

  if (e.request.mode === 'navigate') {
    e.respondWith(pageNetworkFirst(e.request));
  } else if (url.pathname.startsWith('/audio/')) {
    e.respondWith(audioCacheFirst(e.request));
  } else if (url.pathname === '/api/stats' || url.pathname === '/api/results') {
    e.respondWith(statsNetworkFirst(e.request));
  } else {
    e.respondWith(staleWhileRevalidate(e.request));
  }
});
