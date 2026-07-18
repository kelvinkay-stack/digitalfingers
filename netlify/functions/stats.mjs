/* stats.mjs - anonymous crowd counters for the training experiment and
 * the per-clip "who got fooled" numbers.
 *
 * Stores only counters: sessions / correct / total for the two training
 * groups, right / total per clip id, and a live Elo-style rating per clip.
 * No identifiers, no timestamps, no IPs. Player ratings live only in the
 * player's browser and never arrive here, so each clip's rating is updated
 * against a nominal 1500 listener: the clip "wins" when the player is
 * fooled. Early judgments move a clip's rating faster (K=32 for the first
 * 20, then 16) so ratings converge quickly, then hold steady.
 *
 * GET  /api/stats  → current aggregate
 * POST /api/stats {trained, score, total, rounds, key} → record one session
 *   trained: true | false | null (null = player didn't answer the question;
 *            group counters are skipped, per-clip counters still update)
 *   rounds:  [{id, correct}] for per-clip counters and ratings
 *   key:     idempotency key; a session key already seen counts nothing,
 *            so offline-queue retries can't inflate any counter or rating
 */

import { getStore } from '@netlify/blobs';

const EMPTY = {
  all: { sessions: 0, right: 0, total: 0 },
  trained: { sessions: 0, right: 0, total: 0 },
  untrained: { sessions: 0, right: 0, total: 0 },
  clips: {},
  elo: {},
};

const CLIP_ID = /^clip-[a-z0-9-]{1,40}$/;
const MAX_CLIP_KEYS = 300;
const MAX_SEEN_KEYS = 400;
const RATING_FLOOR = 1000;
const RATING_CEIL = 2000;

const eloExpected = (a, b) => 1 / (1 + 10 ** ((b - a) / 400));

function publicView(agg) {
  const { seen, ...rest } = agg;
  return rest;
}

export default async (req) => {
  const store = getStore({ name: 'digital-fingers-stats', consistency: 'strong' });

  if (req.method === 'POST') {
    let body;
    try { body = await req.json(); } catch { return new Response('bad json', { status: 400 }); }
    const { trained, score, total, rounds, key } = body || {};
    const okSession = (trained === null || typeof trained === 'boolean')
      && Number.isInteger(score) && Number.isInteger(total)
      && total >= 3 && total <= 20 && score >= 0 && score <= total;
    const okRounds = rounds === undefined || (Array.isArray(rounds) && rounds.length <= 20
      && rounds.every(r => r && typeof r.correct === 'boolean'
        && typeof r.id === 'string' && CLIP_ID.test(r.id)));
    const okKey = key === undefined || (typeof key === 'string' && key.length >= 1 && key.length <= 64);
    if (!okSession || !okRounds || !okKey) return new Response('bad request', { status: 400 });

    const agg = (await store.get('aggregate', { type: 'json' })) || structuredClone(EMPTY);
    agg.clips = agg.clips || {};
    agg.elo = agg.elo || {};
    agg.seen = agg.seen || [];

    // idempotency: a replayed session key changes nothing
    if (key && agg.seen.includes(key)) {
      return Response.json(publicView(agg), { headers: { 'cache-control': 'no-store' } });
    }
    if (key) agg.seen = agg.seen.slice(-(MAX_SEEN_KEYS - 1)).concat(key);

    // every finished session counts here, whether or not the training
    // question was answered (the group counters below only cover those who
    // answered) - still plain totals, nothing per-player
    agg.all = agg.all || { sessions: 0, right: 0, total: 0 };
    agg.all.sessions += 1;
    agg.all.right += score;
    agg.all.total += total;

    if (typeof trained === 'boolean') {
      const group = trained ? agg.trained : agg.untrained;
      group.sessions += 1;
      group.right += score;
      group.total += total;
    }
    for (const r of rounds || []) {
      const fresh = !agg.clips[r.id] && !agg.elo[r.id];
      if (fresh && Object.keys(agg.clips).length >= MAX_CLIP_KEYS) continue;
      const c = agg.clips[r.id] = agg.clips[r.id] || { right: 0, total: 0 };
      c.total += 1;
      if (r.correct) c.right += 1;

      // one judgment = one rated match against a nominal 1500 listener
      const e = agg.elo[r.id] = agg.elo[r.id] || { r: 1500, n: 0 };
      const k = e.n < 20 ? 32 : 16;
      const clipWon = r.correct ? 0 : 1; // fooling the listener is the clip's win
      e.r = Math.max(RATING_FLOOR, Math.min(RATING_CEIL,
        e.r + k * (clipWon - eloExpected(e.r, 1500))));
      e.r = Math.round(e.r * 10) / 10;
      e.n += 1;
    }
    await store.setJSON('aggregate', agg);
    return Response.json(publicView(agg), { headers: { 'cache-control': 'no-store' } });
  }

  if (req.method === 'GET') {
    const agg = (await store.get('aggregate', { type: 'json' })) || EMPTY;
    return Response.json(publicView(agg), { headers: { 'cache-control': 'no-store' } });
  }

  return new Response('method not allowed', { status: 405 });
};

export const config = { path: '/api/stats' };
