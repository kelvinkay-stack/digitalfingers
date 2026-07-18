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
 *   rounds:  [{id, correct}] for per-clip counters
 */

import { getStore } from '@netlify/blobs';

const EMPTY = {
  all: { sessions: 0, right: 0, total: 0 },
  trained: { sessions: 0, right: 0, total: 0 },
  untrained: { sessions: 0, right: 0, total: 0 },
  clips: {},
};

const CLIP_ID = /^clip-[a-z0-9-]{1,40}$/;
const MAX_CLIP_KEYS = 300;

export default async (req) => {
  const store = getStore({ name: 'digital-fingers-stats', consistency: 'strong' });

  if (req.method === 'POST') {
    let body;
    try { body = await req.json(); } catch { return new Response('bad json', { status: 400 }); }
    const { trained, score, total, rounds } = body || {};
    const okSession = (trained === null || typeof trained === 'boolean')
      && Number.isInteger(score) && Number.isInteger(total)
      && total >= 3 && total <= 20 && score >= 0 && score <= total;
    const okRounds = rounds === undefined || (Array.isArray(rounds) && rounds.length <= 20
      && rounds.every(r => r && typeof r.correct === 'boolean'
        && typeof r.id === 'string' && CLIP_ID.test(r.id)));
    if (!okSession || !okRounds) return new Response('bad request', { status: 400 });

    const agg = (await store.get('aggregate', { type: 'json' })) || structuredClone(EMPTY);
    agg.clips = agg.clips || {};

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
      if (!agg.clips[r.id] && Object.keys(agg.clips).length >= MAX_CLIP_KEYS) continue;
      const c = agg.clips[r.id] = agg.clips[r.id] || { right: 0, total: 0 };
      c.total += 1;
      if (r.correct) c.right += 1;
    }
    await store.setJSON('aggregate', agg);
    return Response.json(agg, { headers: { 'cache-control': 'no-store' } });
  }

  if (req.method === 'GET') {
    const agg = (await store.get('aggregate', { type: 'json' })) || EMPTY;
    return Response.json(agg, { headers: { 'cache-control': 'no-store' } });
  }

  return new Response('method not allowed', { status: 405 });
};

export const config = { path: '/api/stats' };
