/* pwa.js - service-worker registration, install link, offline badge, and the
   deferred-stats queue. Loaded on every page; each hook is optional. */

const PENDING_KEY = 'digitalfingers.pendingStats';

/* ---------- registration ---------- */

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => { /* offline-first is a bonus, not a requirement */ });
}

/* ---------- quiet install link ---------- */

let installEvent = null;
const installLine = document.querySelector('#install-line');
const installLink = document.querySelector('#install-link');

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installEvent = e;
  if (installLine) installLine.hidden = false;
});
window.addEventListener('appinstalled', () => {
  installEvent = null;
  if (installLine) installLine.hidden = true;
});
if (installLink) {
  installLink.addEventListener('click', (e) => {
    e.preventDefault();
    if (installEvent) { installEvent.prompt(); installEvent = null; }
    if (installLine) installLine.hidden = true;
  });
}

/* ---------- offline indicator ---------- */

const offlineNote = document.querySelector('#offline-note');
function reflectConnectivity() {
  if (offlineNote) offlineNote.hidden = navigator.onLine;
}
window.addEventListener('online', () => { reflectConnectivity(); flushPendingStats(); });
window.addEventListener('offline', reflectConnectivity);
reflectConnectivity();

/* ---------- deferred anonymous counters ----------
   A session finished offline queues its POST body here; each entry carries
   an idempotency key and is deleted only after the server accepts it, so a
   result is never lost and never sent twice. */

function readQueue() {
  try {
    const q = JSON.parse(localStorage.getItem(PENDING_KEY));
    return Array.isArray(q) ? q : [];
  } catch { return []; }
}

function writeQueue(q) {
  try { localStorage.setItem(PENDING_KEY, JSON.stringify(q)); } catch { /* best effort */ }
}

export function queueStats(body) {
  const q = readQueue();
  q.push({ key: body.key || `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`, body });
  writeQueue(q.slice(-20));
}

let flushing = false;
export async function flushPendingStats() {
  if (flushing || !navigator.onLine) return;
  flushing = true;
  try {
    while (true) {
      const q = readQueue();
      if (!q.length) break;
      const { key, body } = q[0];
      const res = await fetch('/api/stats', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...body, key }),
      });
      if (!res.ok && res.status !== 400) throw new Error('retry later');
      writeQueue(readQueue().filter(entry => entry.key !== key)); // 400 = malformed, drop it
    }
  } catch { /* still offline or server down; the queue keeps waiting */ }
  flushing = false;
}

flushPendingStats();
