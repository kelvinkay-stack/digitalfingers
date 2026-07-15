/* stats.js — persistent listener stats. localStorage only; no backend, no cookies. */

const KEY = 'digitalfingers.v1';

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (Array.isArray(data.sessions)) return data;
    }
  } catch { /* private mode or corrupt state — start fresh */ }
  return { sessions: [] };
}

function write(data) {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* best effort */ }
}

/** Record a finished session. rounds: [{id, correct}] */
export function recordSession({ score, total, hard, rounds }) {
  const data = read();
  data.sessions.push({ t: Date.now(), score, total, hard, rounds });
  if (data.sessions.length > 200) data.sessions = data.sessions.slice(-200);
  write(data);
  return data;
}

export function getSessions() {
  return read().sessions;
}

/** Lifetime accuracy across every recorded round. */
export function lifetime() {
  const sessions = getSessions();
  const games = sessions.length;
  let right = 0, total = 0;
  for (const s of sessions) { right += s.score; total += s.total; }
  return { games, right, total, pct: total ? Math.round(100 * right / total) : 0 };
}

/** The clip this listener has misjudged most (≥2 encounters). */
export function hardestClip(clipsById) {
  const tally = new Map();
  for (const s of getSessions()) {
    for (const r of s.rounds || []) {
      const t = tally.get(r.id) || { seen: 0, wrong: 0 };
      t.seen += 1;
      if (!r.correct) t.wrong += 1;
      tally.set(r.id, t);
    }
  }
  let worst = null;
  for (const [id, t] of tally) {
    if (t.seen < 2 || !t.wrong || !clipsById[id]) continue;
    const rate = t.wrong / t.seen;
    if (!worst || rate > worst.rate) worst = { id, rate, ...t };
  }
  return worst ? { clip: clipsById[worst.id], ...worst } : null;
}

/**
 * Render a per-session accuracy sparkline into an <svg class="sparkline">.
 * Shown only when 3+ sessions exist.
 */
export function renderSparkline(svg, sessions) {
  const pts = sessions.slice(-12).map(s => s.score / s.total);
  if (pts.length < 3) return false;
  const W = 200, H = 44, PAD = 4;
  const x = i => PAD + i * (W - 2 * PAD) / (pts.length - 1);
  const y = v => H - PAD - v * (H - 2 * PAD);
  svg.innerHTML = '';
  const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  poly.setAttribute('points', pts.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' '));
  svg.appendChild(poly);
  const last = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  last.setAttribute('cx', x(pts.length - 1).toFixed(1));
  last.setAttribute('cy', y(pts[pts.length - 1]).toFixed(1));
  last.setAttribute('r', '2.5');
  svg.appendChild(last);
  return true;
}
