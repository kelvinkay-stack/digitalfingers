/* results.mjs - the read side of the experiment, aggregated for /results.
 *
 * Joins the anonymous counters (stats.mjs) with static clip facts from the
 * manifest - tier, title, which side - at read time, so nothing new is ever
 * stored. Returns one JSON payload, cached at the edge for ten minutes so
 * the page can't be used to hammer the store. No per-user data exists here
 * and none can be added.
 *
 * GET /api/results →
 *   { minN, sessions, judgments,
 *     overall: {right,total}, groups: {trained,untrained},
 *     tiers: {deadpan,humanized,expressive},
 *     mostFooling: [{title,side,right,total}], mostCaught: [...] }
 */

import { getStore } from '@netlify/blobs';
import manifest from '../../data/clips.json';

const MIN_N = 30; // breakdowns under this many judgments stay unpublished

export default async () => {
  const store = getStore({ name: 'digital-fingers-stats', consistency: 'strong' });
  const agg = (await store.get('aggregate', { type: 'json' })) || {};
  const groups = {
    trained: agg.trained || { sessions: 0, right: 0, total: 0 },
    untrained: agg.untrained || { sessions: 0, right: 0, total: 0 },
  };

  const byId = new Map(manifest.clips.map(c => [c.id, c]));
  const tiers = {
    deadpan: { right: 0, total: 0 },
    humanized: { right: 0, total: 0 },
    expressive: { right: 0, total: 0 },
  };
  let right = 0, total = 0;
  const rows = [];
  for (const [id, c] of Object.entries(agg.clips || {})) {
    const clip = byId.get(id);
    if (!clip || !Number.isFinite(c.right) || !Number.isFinite(c.total) || c.total <= 0) continue;
    right += c.right;
    total += c.total;
    if (!clip.isHuman && tiers[clip.tier]) {
      tiers[clip.tier].right += c.right;
      tiers[clip.tier].total += c.total;
    }
    rows.push({ title: clip.title, side: clip.isHuman ? 'human' : 'machine', right: c.right, total: c.total });
  }

  // the leaderboards only rank clips heard often enough to mean something
  const ranked = rows
    .filter(r => r.total >= MIN_N)
    .sort((a, b) => (a.right / a.total) - (b.right / b.total));

  // the all-sessions counter arrived later than the group counters, so the
  // group sum serves as a floor for historical data
  const sessions = Math.max(
    (agg.all && agg.all.sessions) || 0,
    groups.trained.sessions + groups.untrained.sessions,
  );

  // live difficulty ratings: the five highest-rated (most deceptive) clips,
  // counted only once a clip has 20 rated judgments
  const liveDeceptive = Object.entries(agg.elo || {})
    .map(([id, e]) => ({ clip: byId.get(id), e }))
    .filter(x => x.clip && x.e && Number.isFinite(x.e.r) && (x.e.n || 0) >= 20)
    .sort((a, b) => b.e.r - a.e.r)
    .slice(0, 5)
    .map(x => ({
      title: x.clip.title,
      side: x.clip.isHuman ? 'human' : 'machine',
      rating: Math.round(x.e.r),
      n: x.e.n,
    }));

  const EMPTY_GROUP = { sessions: 0, right: 0, total: 0 };
  const levels = {
    none: (agg.levels && agg.levels.none) || EMPTY_GROUP,
    some: (agg.levels && agg.levels.some) || EMPTY_GROUP,
    lots: (agg.levels && agg.levels.lots) || EMPTY_GROUP,
  };

  const EMPTY_CONF = { c1: { right: 0, total: 0 }, c2: { right: 0, total: 0 }, c3: { right: 0, total: 0 } };
  const confidence = {
    trained: (agg.confidence && agg.confidence.trained) || EMPTY_CONF,
    untrained: (agg.confidence && agg.confidence.untrained) || EMPTY_CONF,
  };

  return Response.json({
    minN: MIN_N,
    sessions,
    judgments: total,
    overall: { right, total },
    groups,
    levels,
    tiers,
    confidence,
    mostFooling: ranked.slice(0, 5),
    mostCaught: ranked.slice(-5).reverse(),
    liveDeceptive,
  }, {
    headers: {
      'cache-control': 'public, max-age=0, must-revalidate',
      'netlify-cdn-cache-control': 'public, s-maxage=600, stale-while-revalidate=120',
    },
  });
};

export const config = { path: '/api/results' };
