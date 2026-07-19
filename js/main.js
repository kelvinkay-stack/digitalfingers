/* main.js - game page controller: screens, rounds, reveal, results. */

import { ArcPlayer, preload } from './player.js';
import { Waveform } from './waveform.js';
import { drawSession, verdictFor, MAX_REPLAYS } from './game.js';
import { recordSession, getSessions, lifetime, hardestClip, renderSparkline } from './stats.js';
import { queueStats } from './pwa.js';
import { getRating, updateRating, bandFor, difficultyPhrase } from './rating.js';

const $ = (sel) => document.querySelector(sel);

const els = {
  screens: {
    intro: $('#screen-intro'),
    round: $('#screen-round'),
    results: $('#screen-results'),
  },
  begin: $('#begin-btn'),
  instrumentChoices: [...document.querySelectorAll('.instrument-choice')],
  premise: $('#premise'),
  heroNote: $('#hero-note'),
  heroArt: $('#hero-art'),
  previewInstrument: $('#preview-instrument'),
  previewPlay: $('#preview-play-btn'),
  keysRule: $('.keys-rule'),
  stringsRule: $('#strings-rule'),
  lifetimeLine: $('#lifetime-line'),
  roundLabel: $('#round-label'),
  roundInstrument: $('#round-instrument'),
  scoreLabel: $('#score-label'),
  playBtn: $('#play-btn'),
  progressArc: $('#progress-arc'),
  replays: $('#replays'),
  listenHint: $('#listen-hint'),
  answerHuman: $('#answer-human'),
  answerMachine: $('#answer-machine'),
  confidence: $('#confidence'),
  confidenceButtons: [...document.querySelectorAll('.confidence-btn')],
  trainingQ: document.querySelector('.training-q'),
  reveal: $('#reveal'),
  verdictMark: $('#verdict-mark'),
  revealTitle: $('#reveal-title'),
  revealTruth: $('#reveal-truth'),
  revealExplain: $('#reveal-explain'),
  nextBtn: $('#next-btn'),
  live: $('#live-region'),
  toast: $('#toast'),
  finalScore: $('#final-score'),
  verdictTitle: $('#verdict-title'),
  verdictLine: $('#verdict-line'),
  ratingLine: $('#rating-line'),
  review: $('#review'),
  sparkBlock: $('#spark-block'),
  sparkline: $('#sparkline'),
  sparkCaption: $('#spark-caption'),
  againBtn: $('#again-btn'),
  hardestLine: $('#hardest-line'),
  trainingChoices: [...document.querySelectorAll('.training-choice')],
  crowdBlock: $('#crowd-block'),
  crowdChart: $('#crowd-chart'),
  crowdCaption: $('#crowd-caption'),
  revealCrowd: $('#reveal-crowd'),
  shareBtn: $('#share-btn'),
};

const TRAINED_KEY = 'digitalfingers.trained';   // legacy yes/no
const TRAINING_KEY = 'digitalfingers.training'; // none | some | lots
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

let manifest = null;
let session = null;
let player = null;
let wave = null;
let crowdData = null; // latest aggregate from /api/stats

const state = {
  index: 0,
  score: 0,
  replaysUsed: 0,
  answered: false,
  listened: false,
  retriedId: null,
  firstPlayAt: 0,
  pendingGuess: null,
  pendingTooFast: false,
  instrument: 'piano',
  rounds: [], // {id, correct, guessedHuman}
  preloaded: new Map(),
};

/* ---------- helpers ---------- */

function show(name) {
  for (const [k, el] of Object.entries(els.screens)) el.classList.toggle('is-active', k === name);
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function announce(text) { els.live.textContent = text; }

let toastTimer = null;
function toast(text) {
  els.toast.textContent = text;
  els.toast.classList.add('is-shown');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.remove('is-shown'), 3600);
}

function setAnswersEnabled(on) {
  els.answerHuman.disabled = !on;
  els.answerMachine.disabled = !on;
}

function renderReplays() {
  const dots = els.replays.querySelectorAll('i');
  dots.forEach((d, i) => d.classList.toggle('used', i < state.replaysUsed));
  els.replays.style.visibility = state.answered ? 'hidden' : 'visible';
}

/* ---------- game flow ---------- */

async function loadManifest() {
  const res = await fetch('data/clips.json');
  if (!res.ok) throw new Error('manifest failed');
  manifest = await res.json();
}

function currentClip() { return session[state.index]; }

/* ---------- offline clips ----------
 * The same cache the service worker fills as clips are played
 * (AUDIO_CACHE in sw.js). */
const AUDIO_CACHE = 'df-audio-v1';
const OFFLINE_PACK_KEY = 'digitalfingers.offlinePack.'; // + instrument

function groupByPiece(clips) {
  const byPiece = new Map();
  for (const c of clips) {
    const key = c.piece || c.id;
    if (!byPiece.has(key)) byPiece.set(key, []);
    byPiece.get(key).push(c);
  }
  return byPiece;
}

/* While online, quietly download enough pairs for one full offline session.
 * Both versions of every chosen piece are cached, so offline play keeps the
 * fairness guarantees: a piece appears once, and its side stays a coin flip. */
async function ensureOfflinePack(instrument) {
  if (!('caches' in window) || !manifest || !navigator.onLine) return;
  try {
    const clips = manifest.clips.filter(c => (c.instrument || 'piano') === instrument);
    const pairs = [...groupByPiece(clips).values()].filter(v => v.length >= 2);
    if (!pairs.length) return;

    // reuse the same pack between visits so nothing is downloaded twice
    let ids = [];
    try { ids = JSON.parse(localStorage.getItem(OFFLINE_PACK_KEY + instrument)) || []; } catch { /* fresh */ }
    const byId = new Map(clips.map(c => [c.id, c]));
    let pack = ids.map(id => byId.get(id)).filter(Boolean);
    if (pack.length < Math.min(5, pairs.length) * 2) {
      for (let i = pairs.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pairs[i], pairs[j]] = [pairs[j], pairs[i]];
      }
      pack = pairs.slice(0, 5).flat();
      try { localStorage.setItem(OFFLINE_PACK_KEY + instrument, JSON.stringify(pack.map(c => c.id))); } catch { /* best effort */ }
    }

    const cache = await caches.open(AUDIO_CACHE);
    for (const c of pack) {
      if (!(await cache.match(c.src))) await cache.add(c.src);
    }
  } catch { /* the offline pack is a bonus; never let it break the game */ }
}

/* Offline, only pieces with BOTH versions cached are playable. Requiring the
 * full pair means the cache's contents can never correlate with the answer. */
async function cachedPairs(clips) {
  if (!('caches' in window)) return [];
  const cache = await caches.open(AUDIO_CACHE);
  const present = (await Promise.all(
    clips.map(async c => (await cache.match(c.src)) ? c : null)
  )).filter(Boolean);
  return [...groupByPiece(present).values()].filter(v => v.length >= 2).flat();
}

async function startSession() {
  state.index = 0;
  state.score = 0;
  state.rounds = [];
  state.preloaded.clear();
  let instrumentClips = manifest.clips.filter(c => (c.instrument || 'piano') === state.instrument);
  if (!navigator.onLine) {
    instrumentClips = await cachedPairs(instrumentClips);
    if (!instrumentClips.length) {
      toast('No clips are saved for offline play yet. Listen once while connected and they will be.');
      return;
    }
  }
  session = drawSession(instrumentClips, {
    playerRating: getRating().r,
    ratings: (crowdData && crowdData.elo) || {},
  });
  if (!session.length) { toast('No clips available.'); return; }
  show('round');
  startRound();
}

function startRound() {
  const clip = currentClip();
  state.replaysUsed = 0;
  state.answered = false;
  state.listened = false;
  state.firstPlayAt = 0;
  state.pendingGuess = null;
  els.confidence.hidden = true;

  els.roundInstrument.textContent = state.instrument === 'violin' ? 'Violin' : 'Piano';
  els.roundLabel.textContent = `Round ${state.index + 1} of ${session.length}`;
  const answeredSoFar = state.rounds.length;
  els.scoreLabel.textContent = answeredSoFar ? `${state.score}/${answeredSoFar}` : '';
  els.listenHint.textContent = 'Press play (or Space), then decide.';
  els.playBtn.disabled = false;
  els.playBtn.classList.add('is-idle');
  els.screens.round.classList.remove('is-listening', 'is-revealed', 'is-correct', 'is-wrong');
  els.answerHuman.classList.remove('is-selected', 'is-truth', 'is-wrong');
  els.answerMachine.classList.remove('is-selected', 'is-truth', 'is-wrong');
  setAnswersEnabled(false);
  els.reveal.classList.remove('is-shown');
  els.reveal.setAttribute('hidden', '');
  renderReplays();

  player.load(clip.src, state.preloaded.get(clip.id));
  state.preloaded.delete(clip.id);
  wave.load(clip.src, player.audio);

  announce(`Round ${state.index + 1} of ${session.length}. Press play to listen, then choose human or machine.`);
  els.playBtn.focus({ preventScroll: true });

  // preload the next clip while this one is on stage
  const next = session[state.index + 1];
  if (next && !state.preloaded.has(next.id)) state.preloaded.set(next.id, preload(next.src));
}

function onPlayerState(ev) {
  if (ev === 'play') {
    els.screens.round.classList.add('is-listening');
    els.playBtn.classList.remove('is-idle');
    els.playBtn.disabled = true;
    wave.startTicking();
    if (!state.answered) {
      if (state.listened) state.replaysUsed += 1;
      if (!state.listened) state.firstPlayAt = performance.now();
      state.listened = true;
      setAnswersEnabled(true);
      els.listenHint.textContent = 'Human or machine?';
    }
    renderReplays();
  } else if (ev === 'ended') {
    els.screens.round.classList.remove('is-listening');
    const replaysLeft = MAX_REPLAYS - state.replaysUsed;
    if (state.pendingGuess !== null) {
      els.playBtn.disabled = true; // committed to a side; confidence comes first
    } else if (state.answered) {
      els.playBtn.disabled = false;
    } else if (replaysLeft > 0) {
      els.playBtn.disabled = false;
      els.listenHint.textContent = replaysLeft === 1 ? 'One replay left.' : `${replaysLeft} replays left.`;
    } else {
      els.playBtn.disabled = true;
      els.listenHint.textContent = 'No replays left. Trust your ear.';
    }
  } else if (ev === 'error') {
    els.screens.round.classList.remove('is-listening');
    const clip = currentClip();
    if (clip && state.retriedId !== clip.id) {
      // give a stumbling clip one more chance before giving up on it
      state.retriedId = clip.id;
      player.load(clip.src);
      els.playBtn.disabled = false;
      els.playBtn.classList.add('is-idle');
      els.listenHint.textContent = 'That clip stumbled. Press play to try again.';
    } else {
      skipBrokenClip();
    }
  }
}

function skipBrokenClip() {
  toast('That clip failed to load. Skipping it.');
  session.splice(state.index, 1);
  if (state.index < session.length) startRound();
  else if (state.rounds.length) finishSession();
  else { show('intro'); toast('No clips could be loaded. Check your connection and try again.'); }
}

function answer(guessedHuman) {
  if (state.answered || !state.listened || state.pendingGuess !== null) return;
  // stage one: commit to a side. The reveal waits until the player says how
  // sure they were - confidence stated before the truth is honest; stated
  // after, it would be hindsight.
  state.pendingGuess = guessedHuman;
  // a pick under a second after first play means nobody was listening -
  // the round still plays out, but counts toward no rating or counter
  state.pendingTooFast = performance.now() - state.firstPlayAt < 1000;
  (guessedHuman ? els.answerHuman : els.answerMachine).classList.add('is-selected');
  setAnswersEnabled(false);
  els.playBtn.disabled = true;
  els.listenHint.textContent = 'How sure are you?';
  els.confidence.hidden = false;
  announce(`You chose ${guessedHuman ? 'human' : 'machine'}. How sure are you? Just guessing, fairly sure, or certain.`);
  els.confidenceButtons[0].focus({ preventScroll: true });
}

function confirmAnswer(conf) {
  if (state.answered || state.pendingGuess === null) return;
  const guessedHuman = state.pendingGuess;
  const tooFast = state.pendingTooFast;
  state.pendingGuess = null;
  state.answered = true;
  els.confidence.hidden = true;

  const clip = currentClip();
  const correct = guessedHuman === clip.isHuman;
  if (correct) state.score += 1;
  state.rounds.push({ id: clip.id, correct, guessedHuman, conf, tooFast });
  const clipElo = crowdData && crowdData.elo && crowdData.elo[clip.id];
  if (!tooFast) updateRating(correct, (clipElo && clipElo.r) || 1500);

  els.screens.round.classList.remove('is-listening');
  els.screens.round.classList.add('is-revealed', correct ? 'is-correct' : 'is-wrong');
  const chosenButton = guessedHuman ? els.answerHuman : els.answerMachine;
  const truthButton = clip.isHuman ? els.answerHuman : els.answerMachine;
  truthButton.classList.add('is-truth');
  if (!correct) chosenButton.classList.add('is-wrong');

  setAnswersEnabled(false);
  els.scoreLabel.textContent = `${state.score}/${state.rounds.length}`;

  // the reveal
  els.verdictMark.textContent = correct ? 'Correct' : 'Not this time';
  els.verdictMark.classList.toggle('wrong', !correct);
  els.revealTitle.textContent = clip.title;
  els.revealTruth.innerHTML =
    `<strong>${clip.isHuman ? 'Human' : 'Machine'}</strong> · ${escapeHtml(clip.composer)} · ${escapeHtml(clip.performer)}`;
  els.revealExplain.innerHTML = mdEm(clip.reveal);

  // how the crowd did on this exact clip
  const cs = crowdData && crowdData.clips && crowdData.clips[clip.id];
  const phrase = difficultyPhrase(clipElo);
  const crowdBits = [];
  if (phrase) crowdBits.push(phrase);
  if (cs && cs.total >= 5) {
    crowdBits.push(`${Math.round(100 * cs.right / cs.total)}% of players have called this one correctly.`);
  }
  els.revealCrowd.textContent = crowdBits.join(' ');
  els.revealCrowd.hidden = !crowdBits.length;

  els.reveal.removeAttribute('hidden');
  requestAnimationFrame(() => {
    els.reveal.classList.add('is-shown');
    els.reveal.scrollIntoView({ behavior: reducedMotion.matches ? 'instant' : 'smooth', block: 'nearest' });
  });

  els.playBtn.disabled = player.playing;
  els.listenHint.textContent = 'Listen again, knowing the answer.';
  renderReplays();
  announce(`${correct ? 'Correct.' : 'Incorrect.'} This was a ${clip.isHuman ? 'human performance' : 'machine rendering'}: ${clip.title} by ${clip.composer}.`);
  els.nextBtn.textContent = state.index + 1 < session.length ? 'Next round' : 'See results';
  els.nextBtn.focus({ preventScroll: true });
}

function nextRound() {
  player.stop();
  state.index += 1;
  if (state.index < session.length) startRound();
  else finishSession();
}

function finishSession() {
  recordSession({
    score: state.score,
    total: state.rounds.length,
    hard: false,
    instrument: state.instrument,
    rounds: state.rounds,
  });
  submitAndRenderCrowd(state.score, state.rounds.length);
  const { title, line } = verdictFor(state.score, state.rounds.length);

  const me = getRating();
  if (me.n > 0) {
    els.ratingLine.innerHTML = '';
    els.ratingLine.append(`Your ear rating: ${bandFor(me.r)}. `);
    const peek = document.createElement('button');
    peek.type = 'button';
    peek.className = 'linklike';
    peek.textContent = 'show the number';
    peek.addEventListener('click', () => {
      peek.replaceWith(`${Math.round(me.r)}`);
    }, { once: true });
    els.ratingLine.appendChild(peek);
    els.ratingLine.hidden = false;
  }

  els.finalScore.innerHTML = `${state.score}<span>/${state.rounds.length}</span>`;
  els.verdictTitle.textContent = title;
  els.verdictLine.textContent = line;

  // per-round review
  els.review.innerHTML = '';
  const byId = Object.fromEntries(manifest.clips.map(c => [c.id, c]));
  for (const r of state.rounds) {
    const c = byId[r.id];
    const li = document.createElement('li');
    li.innerHTML =
      `<span class="mark ${r.correct ? 'right' : 'wrong'}" aria-hidden="true">${r.correct ? '✓' : '✕'}</span>` +
      `<span class="piece"><b>${escapeHtml(c.title)}</b> · ${escapeHtml(c.composer)}</span>` +
      `<span class="was">${c.isHuman ? 'human' : 'machine'}</span>`;
    li.setAttribute('aria-label',
      `${c.title} by ${c.composer}: ${c.isHuman ? 'human' : 'machine'}. You were ${r.correct ? 'right' : 'wrong'}.`);
    els.review.appendChild(li);
  }

  // sparkline across sessions
  const sessions = getSessions();
  const drawn = renderSparkline(els.sparkline, sessions);
  els.sparkBlock.hidden = !drawn;
  if (drawn) {
    const lt = lifetime();
    els.sparkCaption.textContent = `${lt.pct}% lifetime accuracy over ${lt.games} sessions.`;
  }

  const worst = hardestClip(byId);
  els.hardestLine.textContent = worst
    ? `Your blind spot: ${worst.clip.title}. It has fooled you ${worst.wrong} of ${worst.seen} times.`
    : '';

  show('results');
  announce(`Session over. You scored ${state.score} out of ${state.rounds.length}. ${title}.`);
  els.againBtn.focus({ preventScroll: true });
}

/* ---------- crowd stats (anonymous, two counters) ---------- */

/* Graded training level. Legacy 'no' answers migrate to 'none'; legacy
   'yes' can't tell a few years from a lifetime, so those players are asked
   once more and the better answer replaces the coarse one. */
function getTraining() {
  try {
    const v = localStorage.getItem(TRAINING_KEY);
    if (v === 'none' || v === 'some' || v === 'lots') return v;
    if (localStorage.getItem(TRAINED_KEY) === 'no') {
      localStorage.setItem(TRAINING_KEY, 'none');
      return 'none';
    }
  } catch { /* private mode */ }
  return null;
}

function getTrained() {
  const level = getTraining();
  return level === null ? null : level === 'none' ? 'no' : 'yes';
}

function reflectTrainingButtons() {
  const v = getTraining();
  for (const btn of els.trainingChoices) {
    const on = btn.dataset.level === v;
    btn.classList.toggle('is-selected', on);
    btn.setAttribute('aria-pressed', String(on));
  }
}

function submitAndRenderCrowd(score, total) {
  const trained = getTrained();
  const body = {
    key: `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
    trained: trained ? trained === 'yes' : null,
    training: getTraining() || undefined,
    score,
    total,
    rounds: state.rounds.filter(r => !r.tooFast).map(r => ({ id: r.id, correct: r.correct, conf: r.conf })),
  };
  if (!navigator.onLine) {
    queueStats(body); // counted when connectivity returns
    els.crowdBlock.hidden = true;
    return;
  }
  fetch('/api/stats', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
    .then(r => { if (!r.ok) throw new Error(); return r.json(); })
    .then(agg => { crowdData = agg; renderCrowd(agg); })
    .catch((err) => {
      els.crowdBlock.hidden = true;
      // a TypeError is a network failure, not a server verdict - keep the result
      if (err instanceof TypeError) queueStats(body);
    });
}

function renderCrowd(agg) {
  const rows = [
    { label: 'Musical training', g: agg.trained, mine: getTrained() === 'yes' },
    { label: 'No training', g: agg.untrained, mine: getTrained() === 'no' },
  ];
  if (!rows.some(r => r.g && r.g.total > 0)) { els.crowdBlock.hidden = true; return; }
  els.crowdChart.innerHTML = '';
  for (const r of rows) {
    const pct = r.g.total ? Math.round(100 * r.g.right / r.g.total) : 0;
    const row = document.createElement('div');
    row.className = 'crowd-row';
    row.innerHTML =
      `<span class="crowd-label">${r.label}${r.mine ? ' <em>(you)</em>' : ''}</span>` +
      `<span class="crowd-bar"><i style="width:${r.g.total ? pct : 0}%"></i></span>` +
      `<span class="crowd-pct">${r.g.total ? pct + '%' : '–'}</span>`;
    els.crowdChart.appendChild(row);
  }
  const n = (agg.trained.sessions || 0) + (agg.untrained.sessions || 0);
  els.crowdCaption.textContent =
    `Average accuracy across ${n} session${n === 1 ? '' : 's'} recorded on this site so far. ` +
    (getTrained() ? 'Your sessions count toward your group.' : 'Answer the training question on the start screen to be counted.');
  els.crowdBlock.hidden = false;
}

/* ---------- tiny formatters ---------- */

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
/** *word* → <em>word</em>, everything else escaped. */
function mdEm(s) {
  return escapeHtml(s).replace(/\*([^*]+)\*/g, '<em>$1</em>');
}

/* ---------- wiring ---------- */

function wireIntro() {
  const lt = lifetime();
  if (lt.games >= 1) {
    els.lifetimeLine.textContent =
      `Your ear so far: ${lt.pct}% over ${lt.games} session${lt.games === 1 ? '' : 's'}.`;
  }
  const selectInstrument = (instrument) => {
    state.instrument = instrument === 'violin' ? 'violin' : 'piano';
    const violin = state.instrument === 'violin';
    for (const button of els.instrumentChoices) {
      const selected = button.dataset.instrument === state.instrument;
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-pressed', selected);
    }
    els.premise.innerHTML = violin
      ? 'Can you tell the difference between <em>human</em> players and <em>computer</em> strings?'
      : 'Can you tell the difference between a <em>human</em> and a <em>computer</em> playing piano?';
    els.heroNote.textContent = violin
      ? 'Five bowed-string mysteries, from Vivaldi to Beethoven.'
      : 'Five tiny piano mysteries for curious ears.';
    els.heroArt.src = violin
      ? '/assets/robot-human-violinists.jpg'
      : '/assets/robot-human-pianists.webp';
    els.heroArt.alt = violin
      ? 'An old-fashioned robot and a human violinist facing each other with violins and bows'
      : 'An old-fashioned robot and a human pianist seated across from each other at a grand piano';
    els.previewInstrument.textContent = `${violin ? 'Violin' : 'Piano'} · listen closely`;
    els.previewPlay.setAttribute('aria-label', `Start a ${violin ? 'violin' : 'piano'} game and play the first clip`);
    els.keysRule.hidden = violin;
    els.stringsRule.hidden = !violin;
    announce(`${violin ? 'Violin' : 'Piano'} selected. Five rounds.`);
    ensureOfflinePack(state.instrument);
  };
  for (const button of els.instrumentChoices) {
    button.addEventListener('click', () => selectInstrument(button.dataset.instrument));
  }
  const violinArt = new Image();
  violinArt.src = '/assets/robot-human-violinists.jpg';

  const startFromIntro = async (autoplay = false) => {
    if (!manifest) {
      toast('The music is still loading. Try again in a moment.');
      return;
    }
    if (!getTrained()) {
      // the experiment needs every session in one of the two piles
      toast('One thing first: the musical-training question, just below.');
      announce('Please answer the musical training question before beginning.');
      els.trainingQ.classList.add('is-nudged');
      setTimeout(() => els.trainingQ.classList.remove('is-nudged'), 2000);
      els.trainingChoices[0].focus({ preventScroll: true });
      return;
    }
    await startSession();
    if (autoplay && session && session.length && els.screens.round.classList.contains('is-active')) player.play();
  };
  els.begin.addEventListener('click', () => startFromIntro(false));
  els.previewPlay.addEventListener('click', () => startFromIntro(true));

  reflectTrainingButtons();
  const setTraining = (level) => {
    try {
      if (getTraining() === level) {
        localStorage.removeItem(TRAINING_KEY);
        localStorage.removeItem(TRAINED_KEY);
      } else {
        localStorage.setItem(TRAINING_KEY, level);
        localStorage.setItem(TRAINED_KEY, level === 'none' ? 'no' : 'yes'); // keep legacy key coherent
      }
    } catch { /* private mode */ }
    reflectTrainingButtons();
  };
  for (const btn of els.trainingChoices) {
    btn.addEventListener('click', () => setTraining(btn.dataset.level));
  }
}

function wireRound() {
  player = new ArcPlayer({ button: els.playBtn, progress: els.progressArc, onState: onPlayerState });
  wave = new Waveform(document.querySelector('#waveform'));
  els.answerHuman.addEventListener('click', () => answer(true));
  els.answerMachine.addEventListener('click', () => answer(false));
  for (const btn of els.confidenceButtons) {
    btn.addEventListener('click', () => confirmAnswer(Number(btn.dataset.conf)));
  }
  els.nextBtn.addEventListener('click', nextRound);
}

function wireResults() {
  els.againBtn.addEventListener('click', startSession);
  els.shareBtn.addEventListener('click', shareScore);
}

async function shareScore() {
  const total = state.rounds.length;
  const instrument = state.instrument === 'violin' ? 'violin' : 'piano';
  const text = `I scored ${state.score}/${total} telling humans from computers on ${instrument}. Can you? https://digital-fingers.netlify.app`;
  if (navigator.share) {
    try { await navigator.share({ text }); return; } catch { /* user cancelled; fall through */ }
  }
  try {
    await navigator.clipboard.writeText(text);
    toast('Copied to clipboard. Go brag a little.');
  } catch {
    toast(text);
  }
}

function wireKeyboard() {
  document.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const active = document.activeElement;
    const tag = active && active.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || (active && active.isContentEditable)) return;

    if (els.screens.round.classList.contains('is-active')) {
      if (e.key === ' ' || e.key === 'p' || e.key === 'P') {
        e.preventDefault();
        if (!els.playBtn.disabled) player.play();
      } else if (e.key === 'h' || e.key === 'H' || e.key === 'ArrowLeft') {
        if (!els.answerHuman.disabled) { e.preventDefault(); answer(true); }
      } else if (e.key === 'm' || e.key === 'M' || e.key === 'ArrowRight') {
        if (!els.answerMachine.disabled) { e.preventDefault(); answer(false); }
      } else if ((e.key === '1' || e.key === '2' || e.key === '3') && state.pendingGuess !== null) {
        e.preventDefault(); confirmAnswer(Number(e.key));
      } else if ((e.key === 'n' || e.key === 'N') && state.answered) {
        e.preventDefault(); nextRound();
      } else if (e.key === 'Enter' && state.answered && document.activeElement !== els.nextBtn) {
        // Enter on the focused Next button clicks it natively; only handle the rest
        e.preventDefault(); nextRound();
      }
    }
  });
}

async function init() {
  wireIntro();
  wireRound();
  wireResults();
  wireKeyboard();
  try {
    await loadManifest();
    ensureOfflinePack(state.instrument);
  } catch {
    toast('Could not load the clip list. Refresh to try again.');
    els.begin.disabled = true;
    els.previewPlay.disabled = true;
    els.heroNote.textContent = 'The clip list didn’t load. Check your connection and refresh to try again.';
  }
  // per-clip crowd numbers for the reveals; the game works fine without them
  fetch('/api/stats')
    .then(r => { if (!r.ok) throw new Error(); return r.json(); })
    .then(agg => { crowdData = agg; })
    .catch(() => {});
}

init();
