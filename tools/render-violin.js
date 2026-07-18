#!/usr/bin/env node
/**
 * render-violin.js — MIDI + GeneralUser GS → normalized violin game clips.
 *
 * Usage:
 *   node tools/render-violin.js
 *   node tools/render-violin.js --only clip-vln-spring-m
 *
 * Requires FluidSynth and ffmpeg on PATH, plus GeneralUser-GS.sf2 at
 * tools/soundfonts/GeneralUser-GS.sf2. Override that location with the
 * DIGITAL_FINGERS_SOUNDFONT environment variable.
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const clips = require('./violin.config.js');

const ROOT = path.join(__dirname, '..');
const soundfont = process.env.DIGITAL_FINGERS_SOUNDFONT
  || path.join(__dirname, 'soundfonts', 'GeneralUser-GS.sf2');
const onlyIndex = process.argv.indexOf('--only');
const only = onlyIndex >= 0 ? process.argv[onlyIndex + 1] : null;
const selected = only ? clips.filter(c => c.id === only) : clips;

if (only && !selected.length) {
  console.error(`unknown clip id: ${only}`);
  process.exit(1);
}
if (!fs.existsSync(soundfont)) {
  console.error(`missing soundfont: ${soundfont}`);
  console.error('See the violin section in README.md.');
  process.exit(1);
}

function run(command, args, opts = {}) {
  const res = spawnSync(command, args, { ...opts, maxBuffer: 1 << 24 });
  if (res.status !== 0) {
    const detail = res.stderr ? res.stderr.toString().slice(-1200) : '';
    throw new Error(`${command} failed${detail ? `:\n${detail}` : ''}`);
  }
  return res;
}

/** Replace General MIDI program changes in-place without changing note data. */
function patchPrograms(input, output, programs) {
  const data = fs.readFileSync(input);
  const readVar = (offset) => {
    let value = 0;
    do { value = (value << 7) | (data[offset] & 0x7f); } while (data[offset++] & 0x80);
    return offset;
  };
  let chunk = 14;
  while (chunk + 8 <= data.length) {
    const type = data.toString('ascii', chunk, chunk + 4);
    const size = data.readUInt32BE(chunk + 4);
    let pos = chunk + 8;
    const end = pos + size;
    if (type === 'MTrk') {
      let running = null;
      while (pos < end) {
        pos = readVar(pos);
        let status = data[pos];
        if (status & 0x80) { pos += 1; running = status; }
        else status = running;
        if (status === 0xff) {
          pos += 1;
          const lengthStart = pos;
          pos = readVar(pos);
          let length = 0;
          for (let i = lengthStart; i < pos; i++) length = (length << 7) | (data[i] & 0x7f);
          pos += length;
        } else if (status === 0xf0 || status === 0xf7) {
          const lengthStart = pos;
          pos = readVar(pos);
          let length = 0;
          for (let i = lengthStart; i < pos; i++) length = (length << 7) | (data[i] & 0x7f);
          pos += length;
        } else {
          const kind = status & 0xf0;
          const channel = status & 0x0f;
          if (kind === 0xc0 && Object.prototype.hasOwnProperty.call(programs, channel)) data[pos] = programs[channel];
          pos += kind === 0xc0 || kind === 0xd0 ? 1 : 2;
        }
      }
    }
    chunk = end;
  }
  fs.writeFileSync(output, data);
}

function renderClip(cfg) {
  const midi = path.join(__dirname, 'midi', cfg.midi);
  const outDir = path.join(ROOT, 'audio', 'machine');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `digital-fingers-${cfg.id}-`));
  const raw = path.join(tmpDir, 'raw.wav');
  const renderMidi = cfg.programs ? path.join(tmpDir, 'patched.mid') : midi;
  const trimmed = path.join(tmpDir, 'trimmed.wav');
  const normalized = path.join(tmpDir, 'normalized.wav');
  const out = path.join(outDir, `${cfg.id}.mp3`);

  if (!fs.existsSync(midi)) throw new Error(`missing MIDI: ${midi}`);
  fs.mkdirSync(outDir, { recursive: true });

  try {
    console.log(`Rendering ${cfg.id}...`);
    if (cfg.programs) patchPrograms(midi, renderMidi, cfg.programs);
    run('fluidsynth', [
      '-ni', '-g', '0.7', '-F', raw, '-r', '44100', soundfont, renderMidi,
    ], { stdio: 'inherit' });

    const fadeOut = 2.2;
    const chain = [
      'silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.2',
      `atrim=start=${cfg.start}:duration=${cfg.dur}`,
      'asetpts=PTS-STARTPTS',
      'afade=t=in:st=0:d=0.15:curve=hsin',
      `afade=t=out:st=${cfg.dur - fadeOut}:d=${fadeOut}:curve=hsin`,
    ].join(',');
    run('ffmpeg', ['-y', '-v', 'error', '-i', raw, '-af', chain, '-ar', '44100', trimmed], { stdio: 'inherit' });

    const measured = run('ffmpeg', [
      '-y', '-i', trimmed,
      '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11:dual_mono=true:print_format=json',
      '-f', 'null', '-',
    ]);
    const match = measured.stderr.toString().match(/\{[^{}]*"input_i"[\s\S]*?\}/);
    if (!match) throw new Error(`loudnorm measure failed for ${cfg.id}`);
    const stats = JSON.parse(match[0]);
    const gain = -16 - parseFloat(stats.input_i);

    run('ffmpeg', [
      '-y', '-v', 'error', '-i', trimmed,
      '-af', `volume=${gain.toFixed(2)}dB,alimiter=limit=0.891:attack=2:release=60:level=false`,
      '-ar', '44100', normalized,
    ], { stdio: 'inherit' });
    run('ffmpeg', [
      '-y', '-v', 'error', '-i', normalized,
      '-codec:a', 'libmp3lame', '-q:a', '2', out,
    ], { stdio: 'inherit' });
    console.log(`→ ${path.relative(ROOT, out)} (${cfg.dur.toFixed(1)}s)`);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

try {
  for (const cfg of selected) renderClip(cfg);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
