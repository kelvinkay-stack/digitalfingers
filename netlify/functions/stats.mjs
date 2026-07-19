/* stats.mjs - anonymous crowd counters for the training experiment and
 * the per-clip "who got fooled" numbers.
 *
 * Stores only counters: sessions / correct / total for the two training
 * groups, plus right / total per clip id. No identifiers, no timestamps,
 * no IPs.
 *
 * GET  /api/stats  → current aggregate
 * POST /api/stats {trained, score, total, rounds} → record one finished session
 *   trained: true | false | null (null = player didn't answer the question;
 *            group counters are skipped, per-clip counters still update)
 *   rounds:  [{id, correct, confidence?}] for per-clip counters; confidence
 *            2 ("definitely") also feeds the clip's sureRight/sureTotal
 *            calibration counters, 1 ("leaning") only the plain ones
 *
 * Each instrument pool keeps its own aggregate: ?pool=violin reads/writes the
 * violin counters; no pool param (or ?pool=piano) is the original piano pool.
 */

import { getStore } from '@netlify/blobs';

const EMPTY = {
  trained: { sessions: 0, right: 0, total: 0 },
  untrained: { sessions: 0, right: 0, total: 0 },
  clips: {},
};

const CLIP_ID = /^clip-[a-z0-9-]{1,40}$/;
const MAX_CLIP_KEYS = 300;

// blob key per instrument pool; 'aggregate' predates pools, so piano keeps it
const POOL_KEYS = { piano: 'aggregate', violin: 'aggregate-violin' };

export default async (req) => {
  const store = getStore({ name: 'digital-fingers-stats', consistency: 'strong' });
  const pool = new URL(req.url).searchParams.get('pool') || 'piano';
  const aggKey = POOL_KEYS[pool];
  if (!aggKey) return new Response('unknown pool', { status: 400 });

  if (req.method === 'POST') {
    let body;
    try { body = await req.json(); } catch { return new Response('bad json', { status: 400 }); }
    const { trained, score, total, rounds } = body || {};
    const okSession = (trained === null || typeof trained === 'boolean')
      && Number.isInteger(score) && Number.isInteger(total)
      && total >= 3 && total <= 20 && score >= 0 && score <= total;
    const okRounds = rounds === undefined || (Array.isArray(rounds) && rounds.length <= 20
      && rounds.every(r => r && typeof r.correct === 'boolean'
        && typeof r.id === 'string' && CLIP_ID.test(r.id)
        && (r.confidence === undefined || r.confidence === 1 || r.confidence === 2)));
    if (!okSession || !okRounds) return new Response('bad request', { status: 400 });

    const agg = (await store.get(aggKey, { type: 'json' })) || structuredClone(EMPTY);
    agg.clips = agg.clips || {};

    if (typeof trained === 'boolean') {
      const group = trained ? agg.trained : agg.untrained;
      group.sessions += 1;
      group.right += score;
      group.total += total;
    }
    for (const r of rounds || []) {
      if (!agg.clips[r.id] && Object.keys(agg.clips).length >= MAX_CLIP_KEYS) continue;
      const c = agg.clips[r.id] = agg.clips[r.id] || { right: 0, total: 0 };
      c.total += 1;
      if (r.correct) c.right += 1;
      if (r.confidence === 2) {
        c.sureTotal = (c.sureTotal || 0) + 1;
        if (r.correct) c.sureRight = (c.sureRight || 0) + 1;
      }
    }
    await store.setJSON(aggKey, agg);
    return Response.json(agg, { headers: { 'cache-control': 'no-store' } });
  }

  if (req.method === 'GET') {
    const agg = (await store.get(aggKey, { type: 'json' })) || EMPTY;
    return Response.json(agg, { headers: { 'cache-control': 'no-store' } });
  }

  return new Response('method not allowed', { status: 405 });
};

export const config = { path: '/api/stats' };
