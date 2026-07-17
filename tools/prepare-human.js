#!/usr/bin/env node
/**
 * prepare-human.js — trim + normalize a human recording into the game pool.
 *
 * Every clip (human or machine) must exit through the same chain, so nothing
 * about level, fade shape, or encoder betrays the answer:
 *   1. strip leading silence          (silenceremove, -45 dB)
 *   2. trim to the excerpt length     (--start / --dur)
 *   3. fade in 0.15 s, fade out 2.2 s (cosine, same as machine renders)
 *   4. loudness-normalize             (two-pass loudnorm, I=-16 TP=-1.5 LRA=11)
 *   5. encode                         (libmp3lame -q:a 2, 44.1 kHz)
 *
 * Usage:
 *   node tools/prepare-human.js <input> <clip-id> [--start s] [--dur s] [--ogg]
 *                               [--out audio/violin/human]
 *
 * Output: <out>/<clip-id>.mp3 (default audio/human/) — then add a matching
 * entry to the pool's manifest, data/clips.json or data/clips-violin.json
 * (see README).
 */

'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');

const args = process.argv.slice(2);
if (args.length < 2) {
  console.error('usage: node tools/prepare-human.js <input> <clip-id> [--start s] [--dur s] [--ogg] [--out dir]');
  process.exit(1);
}
const [input, id] = args;
const flag = (name, dflt) => {
  const i = args.indexOf(name);
  return i >= 0 ? parseFloat(args[i + 1]) : dflt;
};
const start = flag('--start', 0);
const dur = flag('--dur', 26);
const ogg = args.includes('--ogg');

const outRel = args.includes('--out') ? args[args.indexOf('--out') + 1] : path.join('audio', 'human');
const outDir = path.join(__dirname, '..', outRel);
fs.mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, `${id}.mp3`);

const FADE_OUT = 2.2;
const trimChain = [
  `silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.2`,
  start > 0 ? `atrim=start=${start}` : null,
  `atrim=duration=${dur}`,
  `afade=t=in:st=0:d=0.15:curve=hsin`,
  `afade=t=out:st=${dur - FADE_OUT}:d=${FADE_OUT}:curve=hsin`,
].filter(Boolean).join(',');

// Intermediate trimmed WAV, then two-pass loudnorm (measure → linear apply).
const tmp = path.join(os.tmpdir(), `gh-${id}-trim.wav`);
const tmpNorm = path.join(os.tmpdir(), `gh-${id}-norm.wav`);
let res = spawnSync('ffmpeg', ['-y', '-v', 'error', '-i', input, '-af', trimChain, '-ar', '44100', tmp], { stdio: 'inherit' });
if (res.status !== 0) process.exit(1);

res = spawnSync('ffmpeg', ['-y', '-i', tmp,
  '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11:dual_mono=true:print_format=json', '-f', 'null', '-']);
const text = res.stderr.toString();
const match = text.match(/\{[^{}]*"input_i"[\s\S]*?\}/);
if (!match) { console.error(`loudnorm measure failed:\n${text.slice(-800)}`); process.exit(1); }
const m = JSON.parse(match[0]);
// Exact static gain to -16 LUFS with a brick-wall true-peak limiter at
// -1 dBTP for transient overs — identical policy to the machine-render chain.
const gain = -16 - parseFloat(m.input_i);
res = spawnSync('ffmpeg', ['-y', '-v', 'error', '-i', tmp,
  '-af', `volume=${gain.toFixed(2)}dB,alimiter=limit=0.891:attack=2:release=60:level=false`,
  '-ar', '44100', tmpNorm], { stdio: 'inherit' });
if (res.status !== 0) process.exit(1);

res = spawnSync('ffmpeg', ['-y', '-v', 'error', '-i', tmpNorm, '-codec:a', 'libmp3lame', '-q:a', '2', out], { stdio: 'inherit' });
if (res.status !== 0) process.exit(1);
if (ogg) {
  spawnSync('ffmpeg', ['-y', '-v', 'error', '-i', tmpNorm, '-codec:a', 'libvorbis', '-q:a', '5', out.replace(/\.mp3$/, '.ogg')], { stdio: 'inherit' });
}
fs.unlinkSync(tmp); fs.unlinkSync(tmpNorm);

const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', out]);
console.log(`→ ${outRel}/${id}.mp3 (${parseFloat(probe.stdout).toFixed(1)}s)`);
console.log(`Now add an entry with "id": "${id}", "isHuman": true to the pool's manifest (data/clips.json or data/clips-violin.json).`);
