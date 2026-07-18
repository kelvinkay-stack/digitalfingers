/* results.js - renders /results from one fetch of /api/results.
   Hand-built bars (no chart library); every figure also reads as plain text. */

import { lifetime } from './stats.js';

const $ = (sel) => document.querySelector(sel);
const pct = (right, total) => Math.round(100 * right / total);
const fmt = (n) => Number(n).toLocaleString('en-US');

const SUPPRESSED = 'not enough listeners yet — help us find out';

/* One labeled horizontal bar, matching the game's crowd chart. */
function bar(label, value, detail) {
  const row = document.createElement('div');
  row.className = 'crowd-row';

  const name = document.createElement('span');
  name.className = 'crowd-label';
  name.textContent = label;

  const track = document.createElement('span');
  track.className = 'crowd-bar';
  const fill = document.createElement('i');
  fill.style.width = `${value === null ? 0 : value}%`;
  track.appendChild(fill);
  const tick = document.createElement('u');
  tick.className = 'coin-tick';
  tick.title = 'coin flip (50%)';
  track.appendChild(tick);

  const num = document.createElement('span');
  num.className = 'crowd-pct';
  num.textContent = value === null ? '–' : `${value}%`;

  row.append(name, track, num);
  row.setAttribute('aria-label',
    value === null ? `${label}: ${SUPPRESSED}` : `${label}: ${value}%${detail ? `, ${detail}` : ''}`);

  if (detail || value === null) {
    const note = document.createElement('span');
    note.className = 'crowd-detail';
    note.textContent = value === null ? SUPPRESSED : detail;
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
    $('#overall-chart').append(bar('Everyone', pct(o.right, o.total), `${fmt(o.total)} judgments`));
  } else {
    $('#overall-line').textContent = `${SUPPRESSED[0].toUpperCase()}${SUPPRESSED.slice(1)}.`;
  }

  // (c) trained vs untrained
  for (const [key, label] of [['trained', 'Musical training'], ['untrained', 'No training']]) {
    const g = data.groups[key];
    $('#training-chart').append(
      g.total >= minN
        ? bar(label, pct(g.right, g.total), `${fmt(g.total)} judgments across ${fmt(g.sessions)} sessions`)
        : bar(label, null)
    );
  }
  if (data.groups.trained.total >= minN && data.groups.untrained.total >= minN) {
    $('#training-note').textContent = 'Two piles, no verdict: this page reports the counts and leaves the arguing to you.';
  } else {
    $('#training-note').textContent = 'Groups appear once they pass ' + minN + ' judgments.';
  }

  // (d) fool rate by machine tier - the central finding, now with numbers
  const tierLabels = [['deadpan', 'Deadpan'], ['humanized', 'Humanized'], ['expressive', 'Expressive']];
  for (const [key, label] of tierLabels) {
    const t = data.tiers[key];
    // fooled = judged human when it was a render
    $('#tier-chart').append(
      t.total >= minN
        ? bar(label, pct(t.total - t.right, t.total), `mistaken for human · ${fmt(t.total)} judgments`)
        : bar(label, null)
    );
  }
  $('#tier-note').textContent = 'Each bar is the share of judgments where a render of that tier was called human.';

  // (e) hall of deception
  fillHall($('#hall-fooling'), data.mostFooling, true);
  fillHall($('#hall-caught'), data.mostCaught, false);

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
