/* game.js - session drawing and verdicts. Pure logic, no DOM. */

export const STANDARD_ROUNDS = 5;  // drawn from the selected instrument's paired pool
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
 * different hands) - so a session first groups clips by `piece`, then picks
 * ONE version of each piece at random. A piece never appears twice in a
 * session, and on replay the same piece may switch sides: recognizing the
 * tune tells you nothing.
 *
 * When a player rating and live clip ratings are supplied, standard mode
 * serves a spread matched to the player instead of a uniform draw; hard
 * mode restricts the pool to the top-quartile-rated pieces (seeded by the
 * hand-flagged list until ratings converge). The draw is reshuffled until
 * it contains at least one human and one machine clip (when the pool
 * allows), so no session is trivially one-sided.
 *
 * WHY RATINGS CANNOT LEAK THE ANSWER: difficulty is computed per PIECE as
 * the mean rating of both of its versions, so selection only ever sees
 * pair-level difficulty - a property both sides share. Which side the
 * player actually gets is a fresh coin flip AFTER the pieces are chosen.
 * Since no selection decision depends on anything that differs between the
 * human and machine versions, knowing why a clip was served tells the
 * player nothing about which side it is.
 */
export function drawSession(clips, { hard = false, playerRating = null, ratings = {} } = {}) {
  const pool = clips;
  const byPiece = new Map();
  for (const c of pool) {
    const key = c.piece || c.id;
    if (!byPiece.has(key)) byPiece.set(key, []);
    byPiece.get(key).push(c);
  }
  let pieces = [...byPiece.values()];

  if (hard) {
    pieces = hardPool(pieces, ratings);
  } else if (playerRating != null && pieces.length > STANDARD_ROUNDS) {
    pieces = pickSpread(pieces, playerRating, ratings);
  }

  const n = Math.min(STANDARD_ROUNDS, pieces.length);
  const chosen = pieces.flat();
  const hasBoth = chosen.some(c => c.isHuman) && chosen.some(c => !c.isHuman);
  let draw = [];
  for (let attempt = 0; attempt < 20; attempt++) {
    draw = shuffle(pieces).slice(0, n)
      .map(versions => versions[Math.floor(Math.random() * versions.length)]);
    if (!hasBoth || (draw.some(c => c.isHuman) && draw.some(c => !c.isHuman))) return draw;
  }
  return draw;
}

/** A piece's difficulty: mean live rating of both versions (1500 unrated). */
function pieceRating(versions, ratings) {
  const rs = versions.map(v => (ratings[v.id] && Number.isFinite(ratings[v.id].r)) ? ratings[v.id].r : 1500);
  return rs.reduce((a, b) => a + b, 0) / rs.length;
}

function pieceJudgments(versions, ratings) {
  return versions.reduce((sum, v) => sum + ((ratings[v.id] && ratings[v.id].n) || 0), 0);
}

/**
 * Standard mode's spread: two pieces near the player's rating, one easier,
 * one harder, and at least one expressive-tier pair, topped up at random.
 */
function pickSpread(pieces, playerRating, ratings) {
  const rated = shuffle(pieces).map(p => ({ p, r: pieceRating(p, ratings) })); // shuffle first so 1500-ties don't repeat
  const take = new Set();

  const nearest = [...rated].sort((a, b) => Math.abs(a.r - playerRating) - Math.abs(b.r - playerRating));
  for (const x of nearest.slice(0, 2)) take.add(x);

  const below = rated.filter(x => x.r < playerRating && !take.has(x));
  const above = rated.filter(x => x.r > playerRating && !take.has(x));
  if (below.length) take.add(below[Math.floor(Math.random() * below.length)]);
  if (above.length) take.add(above[Math.floor(Math.random() * above.length)]);

  const isExpressive = x => x.p.some(c => !c.isHuman && c.tier === 'expressive');
  if (![...take].some(isExpressive)) {
    const expressive = rated.filter(x => isExpressive(x) && !take.has(x));
    if (expressive.length) take.add(expressive[Math.floor(Math.random() * expressive.length)]);
  }

  const rest = shuffle(rated.filter(x => !take.has(x)));
  while (take.size < STANDARD_ROUNDS && rest.length) take.add(rest.pop());
  return [...take].slice(0, STANDARD_ROUNDS).map(x => x.p);
}

/**
 * Hard mode: the top quartile of live piece ratings once at least eight
 * pieces have 20+ rated judgments; the hand-flagged `hard` list seeds the
 * mode until the store has converged that far.
 */
function hardPool(pieces, ratings) {
  const settled = pieces.filter(p => pieceJudgments(p, ratings) >= 20);
  if (settled.length >= 8) {
    const sorted = [...pieces].sort((a, b) => pieceRating(b, ratings) - pieceRating(a, ratings));
    return sorted.slice(0, Math.max(STANDARD_ROUNDS, Math.ceil(sorted.length / 4)));
  }
  return pieces.filter(p => p.some(c => c.hard));
}

/** End-of-session verdict copy. */
export function verdictFor(score, total) {
  const pct = total ? score / total : 0;
  if (pct === 1) return {
    title: 'Golden Ears',
    line: `${score} out of ${total}. Nothing got past you, not even the renders that were built to fool people.`,
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
    line: `${score} of ${total}. You did roughly as well as guessing. That's not an insult. It's kind of the whole point of this experiment.`,
  };
  return {
    title: 'Thoroughly Fooled',
    line: `${score} of ${total}. The machines convinced you and the humans sounded suspicious. Spend a few minutes on the Learn page and try again.`,
  };
}
