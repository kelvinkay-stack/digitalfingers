/* stats.mjs - anonymous crowd counters for the training experiment.
 *
 * Stores exactly six numbers (sessions / correct answers / total answers,
 * for "trained" and "untrained"). No identifiers, no timestamps, no IPs.
 *
 * GET  /api/stats               → current aggregate
 * POST /api/stats {trained, score, total} → record one finished session
 */

import { getStore } from '@netlify/blobs';

const EMPTY = {
  trained: { sessions: 0, right: 0, total: 0 },
  untrained: { sessions: 0, right: 0, total: 0 },
};

export default async (req) => {
  const store = getStore({ name: 'digital-fingers-stats', consistency: 'strong' });

  if (req.method === 'POST') {
    let body;
    try { body = await req.json(); } catch { return new Response('bad json', { status: 400 }); }
    const { trained, score, total } = body || {};
    const ok = typeof trained === 'boolean'
      && Number.isInteger(score) && Number.isInteger(total)
      && total >= 3 && total <= 20 && score >= 0 && score <= total;
    if (!ok) return new Response('bad request', { status: 400 });

    const agg = (await store.get('aggregate', { type: 'json' })) || structuredClone(EMPTY);
    const group = trained ? agg.trained : agg.untrained;
    group.sessions += 1;
    group.right += score;
    group.total += total;
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
