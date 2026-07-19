/* results.js - renders /results from one fetch of /api/results.
   Hand-built bars (no chart library); every figure also reads as plain text. */

import { lifetime } from './stats.js';

const $ = (sel) => document.querySelector(sel);
const pct = (right, total) => Math.round(100 * right / total);
const fmt = (n) => Number(n).toLocaleString('en-US');

const SUPPRESSED = 'not enough listeners yet — help us find out';

/* 95% Wilson score interval - honest whiskers without claiming significance */
function wilson(right, total, z = 1.96) {
  if (!total) return null;
  const p = right / total;
  const z2 = z * z;
  const denom = 1 + z2 / total;
  const center = (p + z2 / (2 * total)) / denom;
  const half = z * Math.sqrt(p * (1 - p) / total + z2 / (4 * total * total)) / denom;
  return { lo: Math.max(0, center - half) * 100, hi: Math.min(1, center + half) * 100 };
}

/* One labeled horizontal bar, matching the game's crowd chart. Takes raw
   counts so it can draw the interval whisker; pass right = null to render
   the suppressed state. */
function bar(label, right, total, detail) {
  const suppressed = right === null;
  const value = suppressed ? null : pct(right, total);
  const row = document.createElement('div');
  row.className = 'crowd-row';

  const name = document.createElement('span');
  name.className = 'crowd-label';
  name.textContent = label;

  const track = document.createElement('span');
  track.className = 'crowd-bar';
  const fill = document.createElement('i');
  fill.style.width = `${suppressed ? 0 : value}%`;
  track.appendChild(fill);
  const tick = document.createElement('u');
  tick.className = 'coin-tick';
  tick.title = 'coin flip (50%)';
  track.appendChild(tick);

  let ciText = '';
  if (!suppressed) {
    const ci = wilson(right, total);
    if (ci) {
      const w = document.createElement('u');
      w.className = 'ci-whisker';
      w.style.left = `${ci.lo}%`;
      w.style.width = `${Math.max(0.5, ci.hi - ci.lo)}%`;
      w.title = `95% interval: ${Math.round(ci.lo)}–${Math.round(ci.hi)}%`;
      track.appendChild(w);
      ciText = `, plausibly ${Math.round(ci.lo)} to ${Math.round(ci.hi)} percent`;
    }
  }

  const num = document.createElement('span');
  num.className = 'crowd-pct';
  num.textContent = suppressed ? '–' : `${value}%`;

  row.append(name, track, num);
  row.setAttribute('aria-label',
    suppressed ? `${label}: ${SUPPRESSED}` : `${label}: ${value}%${ciText}${detail ? `, ${detail}` : ''}`);

  if (detail || suppressed) {
    const note = document.createElement('span');
    note.className = 'crowd-detail';
    note.textContent = suppressed ? SUPPRESSED : detail;
    row.appendChild(note);
  }
  return row;
}

function render(data) {
  const minN = data.minN || 30;
  $('#min-n').textContent = minN;
  $('#stat-sessions').textContent = fmt(data.sessions);
  $('#stat-judgments').textContent = fmt(data.judgments);

  // (b) overall vs the coin flip
  const o = data.overall;
  if (o.total >= minN) {
    $('#overall-line').textContent =
      `Across ${fmt(o.total)} judgments, players told human from machine ${pct(o.right, o.total)}% of the time. ` +
      `Guessing at random would get 50. The notch on the bar marks the coin.`;
    $('#overall-chart').append(bar('Everyone', o.right, o.total, `${fmt(o.total)} judgments`));
  } else {
    $('#overall-line').textContent = `${SUPPRESSED[0].toUpperCase()}${SUPPRESSED.slice(1)}.`;
  }

  // (c) the dose-response chart: accuracy by graded training level
  const levelLabels = [['lots', 'Five-plus years'], ['some', 'A few years'], ['none', 'No training']];
  for (const [key, label] of levelLabels) {
    const g = (data.levels && data.levels[key]) || { sessions: 0, right: 0, total: 0 };
    $('#training-chart').append(
      g.total >= minN
        ? bar(label, g.right, g.total, `${fmt(g.total)} judgments across ${fmt(g.sessions)} sessions`)
        : bar(label, null, 0)
    );
  }
  const coarse = data.groups;
  if (coarse.trained.total >= minN && coarse.untrained.total >= minN) {
    $('#training-note').textContent =
      `The two coarse piles, all sessions counted: musical training ${pct(coarse.trained.right, coarse.trained.total)}% of ` +
      `${fmt(coarse.trained.total)} · no training ${pct(coarse.untrained.right, coarse.untrained.total)}% of ${fmt(coarse.untrained.total)}. ` +
      'No verdict either way: this page reports the counts and leaves the arguing to you.';
  } else {
    $('#training-note').textContent = 'Levels appear once they pass ' + minN + ' judgments.';
  }

  // calibration: accuracy at each stated confidence, per training group
  if (data.confidence) {
    const confLabels = [['c3', 'certain'], ['c2', 'fairly sure'], ['c1', 'just guessing']];
    for (const [groupKey, groupLabel] of [['trained', 'Musical training'], ['untrained', 'No training']]) {
      const g = data.confidence[groupKey];
      for (const [cell, confLabel] of confLabels) {
        const c = (g && g[cell]) || { right: 0, total: 0 };
        $('#confidence-chart').append(
          c.total >= minN
            ? bar(`${groupLabel} · ${confLabel}`, c.right, c.total, `${fmt(c.total)} judgments`)
            : bar(`${groupLabel} · ${confLabel}`, null, 0)
        );
      }
    }
  }

  // (d) fool rate by machine tier - the central finding, now with numbers
  const tierLabels = [['deadpan', 'Deadpan'], ['humanized', 'Humanized'], ['expressive', 'Expressive']];
  for (const [key, label] of tierLabels) {
    const t = data.tiers[key];
    // fooled = judged human when it was a render
    $('#tier-chart').append(
      t.total >= minN
        ? bar(label, t.total - t.right, t.total, `mistaken for human · ${fmt(t.total)} judgments`)
        : bar(label, null, 0)
    );
  }
  $('#tier-note').textContent = 'Each bar is the share of judgments where a render of that tier was called human.';

  // (e) hall of deception
  fillHall($('#hall-fooling'), data.mostFooling, true);
  fillHall($('#hall-caught'), data.mostCaught, false);

  // live Elo leaderboard (ships empty until clips pass 20 rated judgments)
  const live = $('#hall-live');
  if (data.liveDeceptive && data.liveDeceptive.length) {
    for (const r of data.liveDeceptive) {
      const li = document.createElement('li');
      const title = document.createElement('b');
      title.textContent = r.title;
      const note = document.createElement('span');
      note.textContent = `rated ${fmt(r.rating)} after ${fmt(r.n)} rated judgments`;
      li.append(title, note);
      live.appendChild(li);
    }
  } else {
    const li = document.createElement('li');
    li.textContent = SUPPRESSED;
    live.appendChild(li);
  }

  // personal layer, computed entirely from this browser's localStorage
  const you = lifetime();
  if (you.games >= 1 && o.total >= minN) {
    const crowd = pct(o.right, o.total);
    const verdictText = you.pct > crowd ? 'You are running ahead of the crowd.'
      : you.pct < crowd ? 'The crowd is running ahead of you, for now.'
      : 'You and the crowd are in perfect step.';
    $('#you-line').textContent =
      `Your ear: ${you.pct}% over ${you.games} session${you.games === 1 ? '' : 's'}. The crowd: ${crowd}%. ${verdictText}`;
    $('#you-block').hidden = false;
  }
}

function fillHall(list, rows, fooling) {
  if (!rows.length) {
    const li = document.createElement('li');
    li.textContent = SUPPRESSED;
    list.appendChild(li);
    return;
  }
  for (const r of rows) {
    const wrong = r.total - r.right;
    const rate = fooling ? pct(wrong, r.total) : pct(r.right, r.total);
    const li = document.createElement('li');
    const title = document.createElement('b');
    title.textContent = r.title;
    const note = document.createElement('span');
    note.textContent = fooling
      ? `${r.side === 'machine' ? 'render taken for human' : 'human taken for a render'} ${rate}% of the time · n=${fmt(r.total)}`
      : `called correctly ${rate}% of the time · n=${fmt(r.total)}`;
    li.append(title, note);
    list.appendChild(li);
  }
}

async function init() {
  try {
    const res = await fetch('/api/results');
    if (!res.ok) throw new Error('bad response');
    render(await res.json());
    $('#results-loading').hidden = true;
    $('#results-body').hidden = false;
  } catch {
    $('#results-loading').hidden = true;
    $('#results-error').hidden = false;
  }
}

init();
