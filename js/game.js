/* game.js — session drawing and verdicts. Pure logic, no DOM. */

export const STANDARD_ROUNDS = 10;  // drawn from a 25-clip pool
export const MAX_REPLAYS = 2;       // replays after the first listen

/** Fisher–Yates on a copy. */
function shuffle(list) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Draw a session from the pool.
 *
 * Some pieces exist in BOTH a human and a machine version (same excerpt,
 * different hands) — so a session first groups clips by `piece`, then picks
 * ONE version of each piece at random. A piece never appears twice in a
 * session, and on replay the same piece may switch sides: recognizing the
 * tune tells you nothing.
 *
 * Hard mode restricts the pool to clips flagged ambiguous. The draw is
 * reshuffled until it contains at least one human and one machine clip
 * (when the pool allows), so no session is trivially one-sided.
 */
export function drawSession(clips, { hard = false } = {}) {
  const pool = hard ? clips.filter(c => c.hard) : clips;
  const byPiece = new Map();
  for (const c of pool) {
    const key = c.piece || c.id;
    if (!byPiece.has(key)) byPiece.set(key, []);
    byPiece.get(key).push(c);
  }
  const pieces = [...byPiece.values()];
  const n = Math.min(STANDARD_ROUNDS, pieces.length);
  const hasBoth = pool.some(c => c.isHuman) && pool.some(c => !c.isHuman);
  let draw = [];
  for (let attempt = 0; attempt < 20; attempt++) {
    draw = shuffle(pieces).slice(0, n)
      .map(versions => versions[Math.floor(Math.random() * versions.length)]);
    if (!hasBoth || (draw.some(c => c.isHuman) && draw.some(c => !c.isHuman))) return draw;
  }
  return draw;
}

/** End-of-session verdict copy. */
export function verdictFor(score, total) {
  const pct = total ? score / total : 0;
  if (pct === 1) return {
    title: 'Golden Ears',
    line: `${score} out of ${total}. Nothing got past you — not even the renders that were built to fool people.`,
  };
  if (pct >= 0.8) return {
    title: 'The Skeptic',
    line: `${score} of ${total}. You caught the too-even chords and the breathing that repeats itself. A machine has to work hard to fool you.`,
  };
  if (pct >= 0.6) return {
    title: 'A Good Ear, Mostly',
    line: `${score} of ${total}. You caught most of them, but a few machines walked right past you wearing human clothes.`,
  };
  if (pct >= 0.4) return {
    title: 'About Even With the Coin Flip',
    line: `${score} of ${total}. You did roughly as well as guessing. That's not an insult — it's kind of the whole point of this experiment.`,
  };
  return {
    title: 'Thoroughly Fooled',
    line: `${score} of ${total}. The machines convinced you and the humans sounded suspicious. Spend a few minutes on the Learn page and try again.`,
  };
}
