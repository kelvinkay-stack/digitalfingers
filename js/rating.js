/* rating.js - the player's ear rating. localStorage only, like every other
   piece of personal state on this site: it is never sent anywhere.

   The whole system in one paragraph: every clip and every player carries a
   chess-style rating starting at 1500. Each judgment is a tiny match - the
   player wins by calling the clip correctly, the clip wins by fooling them -
   and both ratings move by the standard Elo formula: a big rating gap means
   the favourite gains little for winning and loses much for losing. Early
   judgments move ratings faster (K=32 for the first 20, then 16) so both
   converge quickly, deltas are clamped, and sub-second answers don't count. */

const KEY = 'digitalfingers.rating';
const START = 1500;
const FLOOR = 1000;
const CEIL = 2000;
const MAX_DELTA = 32;

export function eloExpected(a, b) {
  return 1 / (1 + 10 ** ((b - a) / 400));
}

export function eloK(n) {
  return n < 20 ? 32 : 16;
}

export function getRating() {
  try {
    const st = JSON.parse(localStorage.getItem(KEY));
    if (st && Number.isFinite(st.r) && Number.isFinite(st.n)) return st;
  } catch { /* fresh listener */ }
  return { r: START, n: 0 };
}

/** Update the player's rating after one judgment against a clip. */
export function updateRating(correct, clipRating = START) {
  const st = getRating();
  const raw = eloK(st.n) * ((correct ? 1 : 0) - eloExpected(st.r, clipRating));
  const delta = Math.max(-MAX_DELTA, Math.min(MAX_DELTA, raw));
  st.r = Math.max(FLOOR, Math.min(CEIL, st.r + delta));
  st.n += 1;
  try { localStorage.setItem(KEY, JSON.stringify(st)); } catch { /* best effort */ }
  return st;
}

/** Named band for the end-of-session screen. Raw numbers on request only. */
export function bandFor(r) {
  if (r >= 1700) return 'Golden Ear';
  if (r >= 1550) return 'Trained Ear';
  if (r >= 1400) return 'Developing Ear';
  return 'Fresh Ears';
}

/** Plain-language difficulty for a clip's reveal. Never raw numbers. */
export function difficultyPhrase(clipElo) {
  if (!clipElo || !Number.isFinite(clipElo.r) || (clipElo.n || 0) < 10) return null;
  if (clipElo.r >= 1600) return 'This clip fools almost everyone.';
  if (clipElo.r >= 1450) return 'This one splits the room.';
  return 'Most players catch this one.';
}
