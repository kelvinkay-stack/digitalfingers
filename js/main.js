/* main.js - game page controller: screens, rounds, reveal, results. */

import { ArcPlayer, preload } from './player.js';
import { Waveform } from './waveform.js';
import { drawSession, verdictFor, MAX_REPLAYS } from './game.js';
import { initStats, recordSession, getSessions, lifetime, hardestClip, renderSparkline } from './stats.js';

const $ = (sel) => document.querySelector(sel);

/* Per-page pool config. index.html (piano) runs on the defaults; other
 * instrument pages (violin.html) override via <body data-…> attributes. */
const ds = document.body.dataset;
const cfg = {
  manifest: ds.manifest || 'data/clips.json',
  pool: ds.pool || 'piano', // crowd-stats namespace on /api/stats
  storageKey: ds.storageKey || 'digitalfingers.v1',
  shareLine: ds.shareLine || 'telling humans from computers at the piano',
  shareUrl: ds.shareUrl || 'https://digital-fingers.netlify.app',
};
const STATS_URL = cfg.pool === 'piano' ? '/api/stats' : `/api/stats?pool=${encodeURIComponent(cfg.pool)}`;
initStats(cfg.storageKey);

const els = {
  screens: {
    intro: $('#screen-intro'),
    round: $('#screen-round'),
    results: $('#screen-results'),
  },
  begin: $('#begin-btn'),
  hardMode: $('#hardmode'),
  lifetimeLine: $('#lifetime-line'),
  roundLabel: $('#round-label'),
  scoreLabel: $('#score-label'),
  playBtn: $('#play-btn'),
  progressArc: $('#progress-arc'),
  replays: $('#replays'),
  listenHint: $('#listen-hint'),
  answerHuman: $('#answer-human'),
  answerMachine: $('#answer-machine'),
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
  review: $('#review'),
  sparkBlock: $('#spark-block'),
  sparkline: $('#sparkline'),
  sparkCaption: $('#spark-caption'),
  againBtn: $('#again-btn'),
  againHardBtn: $('#again-hard-btn'),
  hardestLine: $('#hardest-line'),
  trainedYes: $('#trained-yes'),
  trainedNo: $('#trained-no'),
  crowdBlock: $('#crowd-block'),
  crowdChart: $('#crowd-chart'),
  crowdCaption: $('#crowd-caption'),
  revealCrowd: $('#reveal-crowd'),
  shareBtn: $('#share-btn'),
};

const TRAINED_KEY = 'digitalfingers.trained';

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
  hard: false,
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
  const res = await fetch(cfg.manifest);
  if (!res.ok) throw new Error('manifest failed');
  manifest = await res.json();
}

function currentClip() { return session[state.index]; }

function startSession(hard) {
  state.hard = hard;
  state.index = 0;
  state.score = 0;
  state.rounds = [];
  state.preloaded.clear();
  session = drawSession(manifest.clips, { hard });
  if (!session.length) { toast('No clips available.'); return; }
  show('round');
  startRound();
}

function startRound() {
  const clip = currentClip();
  state.replaysUsed = 0;
  state.answered = false;
  state.listened = false;

  els.roundLabel.textContent = `Round ${state.index + 1} of ${session.length}`;
  const answeredSoFar = state.rounds.length;
  els.scoreLabel.textContent = answeredSoFar ? `${state.score}/${answeredSoFar}` : '';
  els.listenHint.textContent = 'Press play, then decide.';
  els.playBtn.disabled = false;
  els.playBtn.classList.add('is-idle');
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
    els.playBtn.classList.remove('is-idle');
    els.playBtn.disabled = true;
    wave.startTicking();
    if (!state.answered) {
      if (state.listened) state.replaysUsed += 1;
      state.listened = true;
      setAnswersEnabled(true);
      els.listenHint.textContent = 'Human or machine?';
    }
    renderReplays();
  } else if (ev === 'ended') {
    const replaysLeft = MAX_REPLAYS - state.replaysUsed;
    if (state.answered) {
      els.playBtn.disabled = false;
    } else if (replaysLeft > 0) {
      els.playBtn.disabled = false;
      els.listenHint.textContent = replaysLeft === 1 ? 'One replay left.' : `${replaysLeft} replays left.`;
    } else {
      els.playBtn.disabled = true;
      els.listenHint.textContent = 'No replays left. Trust your ear.';
    }
  } else if (ev === 'error') {
    skipBrokenClip();
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
  if (state.answered || !state.listened) return;
  state.answered = true;
  const clip = currentClip();
  const correct = guessedHuman === clip.isHuman;
  if (correct) state.score += 1;
  state.rounds.push({ id: clip.id, correct, guessedHuman });

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
  if (cs && cs.total >= 5) {
    const pct = Math.round(100 * cs.right / cs.total);
    els.revealCrowd.textContent = `${pct}% of players have called this one correctly.`;
    els.revealCrowd.hidden = false;
  } else {
    els.revealCrowd.hidden = true;
  }

  els.reveal.removeAttribute('hidden');
  requestAnimationFrame(() => {
    els.reveal.classList.add('is-shown');
    els.reveal.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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
  recordSession({ score: state.score, total: state.rounds.length, hard: state.hard, rounds: state.rounds });
  submitAndRenderCrowd(state.score, state.rounds.length);
  const { title, line } = verdictFor(state.score, state.rounds.length);

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

function getTrained() {
  const v = localStorage.getItem(TRAINED_KEY);
  return v === 'yes' || v === 'no' ? v : null;
}

function reflectTrainingButtons() {
  const v = getTrained();
  els.trainedYes.classList.toggle('is-selected', v === 'yes');
  els.trainedNo.classList.toggle('is-selected', v === 'no');
  els.trainedYes.setAttribute('aria-pressed', v === 'yes');
  els.trainedNo.setAttribute('aria-pressed', v === 'no');
}

function submitAndRenderCrowd(score, total) {
  const trained = getTrained();
  fetch(STATS_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      trained: trained ? trained === 'yes' : null,
      score,
      total,
      rounds: state.rounds.map(r => ({ id: r.id, correct: r.correct })),
    }),
  })
    .then(r => { if (!r.ok) throw new Error(); return r.json(); })
    .then(agg => { crowdData = agg; renderCrowd(agg); })
    .catch(() => { els.crowdBlock.hidden = true; });
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
  els.begin.addEventListener('click', () => startSession(els.hardMode.checked));

  reflectTrainingButtons();
  const setTrained = (v) => {
    const current = getTrained();
    try {
      if (current === v) localStorage.removeItem(TRAINED_KEY);
      else localStorage.setItem(TRAINED_KEY, v);
    } catch { /* private mode */ }
    reflectTrainingButtons();
  };
  els.trainedYes.addEventListener('click', () => setTrained('yes'));
  els.trainedNo.addEventListener('click', () => setTrained('no'));
}

function wireRound() {
  player = new ArcPlayer({ button: els.playBtn, progress: els.progressArc, onState: onPlayerState });
  wave = new Waveform(document.querySelector('#waveform'));
  els.answerHuman.addEventListener('click', () => answer(true));
  els.answerMachine.addEventListener('click', () => answer(false));
  els.nextBtn.addEventListener('click', nextRound);
}

function wireResults() {
  els.againBtn.addEventListener('click', () => startSession(state.hard));
  els.againHardBtn.addEventListener('click', () => startSession(true));
  els.shareBtn.addEventListener('click', shareScore);
}

async function shareScore() {
  const total = state.rounds.length;
  const text = `I scored ${state.score}/${total} ${cfg.shareLine}. Can you? ${cfg.shareUrl}`;
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
    const tag = document.activeElement && document.activeElement.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;

    if (els.screens.round.classList.contains('is-active')) {
      if (e.key === ' ' || e.key === 'p' || e.key === 'P') {
        e.preventDefault();
        if (!els.playBtn.disabled) player.play();
      } else if (e.key === 'h' || e.key === 'H' || e.key === 'ArrowLeft') {
        if (!els.answerHuman.disabled) { e.preventDefault(); answer(true); }
      } else if (e.key === 'm' || e.key === 'M' || e.key === 'ArrowRight') {
        if (!els.answerMachine.disabled) { e.preventDefault(); answer(false); }
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
  } catch {
    toast('Could not load the clip list. Refresh to try again.');
    els.begin.disabled = true;
    return;
  }
  // A pool that exists but has no clips yet (a new instrument section being
  // assembled) shows its notice instead of a dead Begin button.
  if (!manifest.clips.length) {
    els.begin.disabled = true;
    const note = $('#pool-note');
    if (note) note.hidden = false;
    return;
  }
  // per-clip crowd numbers for the reveals; the game works fine without them
  fetch(STATS_URL)
    .then(r => { if (!r.ok) throw new Error(); return r.json(); })
    .then(agg => { crowdData = agg; })
    .catch(() => {});
}

init();
