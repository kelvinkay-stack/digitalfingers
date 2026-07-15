#!/usr/bin/env node
/**
 * render-clips.js — Ghost Hands offline audio renderer.
 *
 * Parses public-domain MIDI files (Mutopia Project typesettings), applies one of
 * three expression tiers (deadpan / humanized / expressive), renders the result
 * through the Salamander Grand Piano samples, then normalizes loudness and
 * encodes MP3 (optionally OGG) via ffmpeg so every clip — machine or human —
 * exits through the identical chain.
 *
 * Usage:
 *   node tools/render-clips.js                render all clips in clips.config.js
 *   node tools/render-clips.js --only <id>    render a single clip
 *   node tools/render-clips.js --inspect <f>  print structure of a MIDI file
 *   node tools/render-clips.js --ogg          also emit .ogg alongside .mp3
 *   node tools/render-clips.js --keep-wav     keep intermediate WAVs for checking
 *
 * Requires: Node 18+, ffmpeg on PATH, samples in tools/samples/*.mp3
 * (download from https://tonejs.github.io/audio/salamander/).
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SAMPLE_DIR = path.join(__dirname, 'samples');
const MIDI_DIR = path.join(__dirname, 'midi');
const SR = 44100;

/* ------------------------------------------------------------------ */
/* MIDI parsing (Standard MIDI File, format 0/1)                       */
/* ------------------------------------------------------------------ */

function parseMidi(buf) {
  let pos = 0;
  const u32 = () => { const v = buf.readUInt32BE(pos); pos += 4; return v; };
  const u16 = () => { const v = buf.readUInt16BE(pos); pos += 2; return v; };
  const u8 = () => buf[pos++];
  const vlq = () => {
    let v = 0, b;
    do { b = u8(); v = (v << 7) | (b & 0x7f); } while (b & 0x80);
    return v;
  };

  if (buf.toString('latin1', 0, 4) !== 'MThd') throw new Error('not a MIDI file');
  pos = 4;
  const hlen = u32();
  const format = u16();
  const ntrks = u16();
  const division = u16();
  pos = 8 + hlen;
  if (division & 0x8000) throw new Error('SMPTE time division unsupported');

  const notes = [];      // {midi, vel, startTick, durTick, track}
  const tempos = [];     // {tick, usPerBeat}
  const timeSigs = [];   // {tick, num, den}

  for (let t = 0; t < ntrks; t++) {
    if (buf.toString('latin1', pos, pos + 4) !== 'MTrk') throw new Error('bad track chunk');
    pos += 4;
    const len = u32();
    const end = pos + len;
    let tick = 0, running = 0;
    const open = new Map(); // key: pitch -> [{startTick, vel}]

    const closeNote = (pitch) => {
      const stack = open.get(pitch);
      if (stack && stack.length) {
        const n = stack.shift();
        notes.push({ midi: pitch, vel: n.vel / 127, startTick: n.startTick, durTick: Math.max(1, tick - n.startTick), track: t });
      }
    };

    while (pos < end) {
      tick += vlq();
      let status = buf[pos];
      if (status & 0x80) { pos++; if (status < 0xf0) running = status; }
      else status = running;

      if (status === 0xff) {
        const type = u8();
        const mlen = vlq();
        if (type === 0x51) tempos.push({ tick, usPerBeat: (buf[pos] << 16) | (buf[pos + 1] << 8) | buf[pos + 2] });
        else if (type === 0x58) timeSigs.push({ tick, num: buf[pos], den: 2 ** buf[pos + 1] });
        pos += mlen;
      } else if (status === 0xf0 || status === 0xf7) {
        pos += vlq();
      } else {
        const kind = status & 0xf0;
        if (kind === 0x90) {
          const pitch = u8(), vel = u8();
          if (vel > 0) {
            if (!open.has(pitch)) open.set(pitch, []);
            open.get(pitch).push({ startTick: tick, vel });
          } else closeNote(pitch);
        } else if (kind === 0x80) {
          const pitch = u8(); u8();
          closeNote(pitch);
        } else if (kind === 0xc0 || kind === 0xd0) pos += 1;
        else pos += 2;
      }
    }
    pos = end;
  }

  notes.sort((a, b) => a.startTick - b.startTick || a.midi - b.midi);
  tempos.sort((a, b) => a.tick - b.tick);
  return { format, division, notes, tempos, timeSigs };
}

/* ------------------------------------------------------------------ */
/* Deterministic PRNG (mulberry32) so renders are reproducible         */
/* ------------------------------------------------------------------ */

function prng(seedStr) {
  let h = 1779033703;
  for (let i = 0; i < seedStr.length; i++) {
    h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const gauss = (rnd) => (rnd() + rnd() + rnd() + rnd() - 2) / 2; // ~N(0, 0.29)

/* ------------------------------------------------------------------ */
/* Expression engine                                                   */
/* ------------------------------------------------------------------ */

const TIERS = {
  deadpan: {
    velFlatten: 1.0, velJitter: 0, timeJitter: 0,
    rubato: 0, arc: 0, voicing: 0, asynchrony: false,
    artic: 'uniform', endRit: 0,
  },
  humanized: {
    velFlatten: 0.55, velJitter: 0.035, timeJitter: 0.012,
    rubato: 0, arc: 0.05, voicing: 0.04, asynchrony: false,
    artic: 'uniform', endRit: 0.04, drift: 0.01,
  },
  expressive: {
    velFlatten: 0.15, velJitter: 0.045, timeJitter: 0.008,
    rubato: 0.09, arc: 0.16, voicing: 0.15, asynchrony: true,
    artic: 'shaped', endRit: 0.35,
  },
};

/**
 * Extract an excerpt (in beats) and perform it according to tier params.
 * Returns performed notes: {midi, time (s), dur (s), vel (0..1)}.
 */
function performExcerpt(midiData, cfg) {
  const p = { ...TIERS[cfg.tier], ...(cfg.override || {}) };
  const rnd = prng(cfg.id);
  const tpq = midiData.division;
  const [b0, b1] = cfg.beats;
  const phraseLen = cfg.phraseBeats || 12;
  const bpm = cfg.bpm;

  // Select notes whose onset falls inside the window.
  let notes = midiData.notes
    .map(n => ({ midi: n.midi, vel: n.vel, beat: n.startTick / tpq, durBeats: n.durTick / tpq, track: n.track }))
    .filter(n => n.beat >= b0 - 1e-6 && n.beat < b1 - 1e-6)
    .map(n => ({ ...n, beat: n.beat - b0, durBeats: Math.min(n.durBeats, b1 - b0 - (n.beat - b0)) }));

  const totalBeats = b1 - b0;

  // ---- melody / bass detection --------------------------------------
  // Group notes by onset (within a 32nd); the highest pitch in each group
  // that is also near the running top line is treated as melody, the lowest
  // as bass. Everything else is inner accompaniment.
  notes.sort((a, b) => a.beat - b.beat || a.midi - b.midi);
  const groups = [];
  for (const n of notes) {
    const g = groups.length && Math.abs(groups[groups.length - 1].beat - n.beat) < 0.126
      ? groups[groups.length - 1] : (groups.push({ beat: n.beat, ns: [] }), groups[groups.length - 1]);
    g.ns.push(n);
  }
  for (const g of groups) {
    // find all notes still sounding at this onset for a truthful "top voice"
    const sounding = notes.filter(n => n.beat <= g.beat + 1e-6 && n.beat + n.durBeats > g.beat + 0.05);
    const top = Math.max(...sounding.map(n => n.midi));
    for (const n of g.ns) {
      n.role = 'inner';
      if (n.midi === Math.max(...g.ns.map(x => x.midi)) && n.midi >= top - 2) n.role = 'melody';
      if (n.midi === Math.min(...sounding.map(x => x.midi)) && g.ns.length > 1 || n.midi < 48) {
        if (n.midi === Math.min(...g.ns.map(x => x.midi)) && n.role !== 'melody') n.role = 'bass';
      }
    }
  }

  // ---- tempo map: rubato + final ritardando --------------------------
  // Integrate a local tempo-multiplier curve over a fine beat grid.
  const RES = 0.125;
  const steps = Math.ceil(totalBeats / RES);
  const times = new Float64Array(steps + 1);
  let drift = 0;
  for (let i = 0; i < steps; i++) {
    const beat = i * RES;
    const pos = (beat % phraseLen) / phraseLen;        // position within phrase
    const global = beat / totalBeats;                  // position within excerpt
    let m = 1;
    if (p.rubato) {
      // breathe at phrase start, press ahead through the middle, relax at the end
      m += p.rubato * 1.6 * Math.max(0, 1 - pos / 0.12) * 0.5;
      m -= p.rubato * 0.5 * Math.sin(Math.PI * pos);
      m += p.rubato * 1.4 * Math.pow(Math.max(0, (pos - 0.78) / 0.22), 2);
    }
    if (p.endRit) m += p.endRit * Math.pow(Math.max(0, (global - 0.88) / 0.12), 2) * 3;
    if (p.drift) { drift += gauss(rnd) * 0.004; drift *= 0.995; m += drift; }
    times[i + 1] = times[i] + (RES * 60 / bpm) * m;
  }
  const beatToTime = (beat) => {
    const x = Math.min(Math.max(beat, 0), totalBeats) / RES;
    const i = Math.floor(x);
    if (i >= steps) return times[steps];
    return times[i] + (x - i) * (times[i + 1] - times[i]);
  };

  // ---- per-note velocity + timing + articulation ----------------------
  const flatVel = 0.60;
  const out = [];
  for (const n of notes) {
    let vel = n.vel * (1 - p.velFlatten) + flatVel * p.velFlatten;

    if (p.arc) {
      const pos = (n.beat % phraseLen) / phraseLen;
      vel += p.arc * (Math.sin(Math.PI * pos) - 0.35);
      vel -= p.arc * 0.4 * Math.pow(n.beat / totalBeats, 2); // settle as the excerpt closes
    }
    if (p.voicing) {
      if (n.role === 'melody') vel += p.voicing;
      else if (n.role === 'inner') vel -= p.voicing * 0.6;
      else vel -= p.voicing * 0.15;
    }
    if (p.velJitter) vel += gauss(rnd) * p.velJitter;
    vel = Math.min(0.98, Math.max(0.15, vel));

    let t = beatToTime(n.beat);
    if (p.timeJitter) t += gauss(rnd) * p.timeJitter;
    if (p.asynchrony) {
      if (n.role === 'melody') t -= 0.014 + rnd() * 0.010;   // melody leads
      else if (n.role === 'bass') t -= 0.006 + rnd() * 0.006;
      else t += rnd() * 0.008;                                // inner voices trail
    }
    t = Math.max(0, t);

    let durBeats = n.durBeats;
    if (cfg.pedalBeats) {
      // sustain-pedal simulation: let notes ring to the next pedal change
      const boundary = (Math.floor(n.beat / cfg.pedalBeats) + 1) * cfg.pedalBeats;
      durBeats = Math.max(durBeats, boundary - n.beat + 0.12);
    }
    let dur = beatToTime(n.beat + durBeats) - beatToTime(n.beat);
    if (p.artic === 'uniform') dur *= 0.97;
    else {
      if (n.role === 'melody') dur *= 1.04;
      else if (n.role === 'inner' && !cfg.pedalBeats) dur *= 0.72 + rnd() * 0.1;
      else dur *= 0.96;
    }

    out.push({ midi: n.midi, time: t, dur: Math.max(0.05, dur), vel, role: n.role });
  }
  out.sort((a, b) => a.time - b.time);
  return out;
}

/* ------------------------------------------------------------------ */
/* Salamander sampler                                                  */
/* ------------------------------------------------------------------ */

const NOTE_NUM = { C: 0, Cs: 1, D: 2, Ds: 3, E: 4, F: 5, Fs: 6, G: 7, Gs: 8, A: 9, As: 10, B: 11 };
const sampleCache = new Map();

function loadSamples() {
  const files = fs.readdirSync(SAMPLE_DIR).filter(f => f.endsWith('.mp3'));
  const samples = [];
  for (const f of files) {
    const m = f.match(/^([A-G]s?)(\d)\.mp3$/);
    if (!m) continue;
    const midi = NOTE_NUM[m[1]] + (parseInt(m[2], 10) + 1) * 12;
    samples.push({ midi, file: path.join(SAMPLE_DIR, f) });
  }
  samples.sort((a, b) => a.midi - b.midi);
  if (!samples.length) throw new Error(`no samples found in ${SAMPLE_DIR}`);
  return samples;
}

function decodeSample(file) {
  if (sampleCache.has(file)) return sampleCache.get(file);
  const res = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-f', 'f32le', '-ac', '2', '-ar', String(SR), '-'],
    { maxBuffer: 1 << 28 });
  if (res.status !== 0) throw new Error(`ffmpeg decode failed for ${file}: ${res.stderr}`);
  const pcm = new Float32Array(res.stdout.buffer, res.stdout.byteOffset, res.stdout.length >> 2);
  sampleCache.set(file, pcm);
  return pcm;
}

function renderNotes(perf, tailSec = 3.2) {
  const samples = loadSamples();
  const endTime = Math.max(...perf.map(n => n.time + n.dur));
  const frames = Math.ceil((endTime + tailSec) * SR);
  const mix = new Float32Array(frames * 2);

  for (const n of perf) {
    // nearest sample (Salamander set is spaced in minor thirds)
    let best = samples[0];
    for (const s of samples) if (Math.abs(s.midi - n.midi) < Math.abs(best.midi - n.midi)) best = s;
    const src = decodeSample(best.file);
    const srcFrames = src.length >> 1;
    const rate = Math.pow(2, (n.midi - best.midi) / 12);
    const gain = 0.10 + 0.90 * Math.pow(n.vel, 1.7);

    const relTau = 0.28;                       // release time constant after note-off
    const maxOut = Math.min(Math.floor((srcFrames - 2) / rate), Math.floor((n.dur + relTau * 5) * SR));
    const start = Math.floor(n.time * SR);
    const durFrames = n.dur * SR;
    const atkFrames = 0.004 * SR;

    for (let i = 0; i < maxOut; i++) {
      const o = start + i;
      if (o >= frames) break;
      const sp = i * rate;
      const si = Math.floor(sp);
      const fr = sp - si;
      let env = 1;
      if (i < atkFrames) env = i / atkFrames;
      if (i > durFrames) env *= Math.exp(-(i - durFrames) / (relTau * SR));
      if (i > maxOut - 400) env *= (maxOut - i) / 400; // avoid truncation click
      const g = gain * env * 0.45;
      mix[o * 2] += (src[si * 2] * (1 - fr) + src[(si + 1) * 2] * fr) * g;
      mix[o * 2 + 1] += (src[si * 2 + 1] * (1 - fr) + src[(si + 1) * 2 + 1] * fr) * g;
    }
  }

  // peak guard
  let peak = 0;
  for (let i = 0; i < mix.length; i++) peak = Math.max(peak, Math.abs(mix[i]));
  if (peak > 0.85) { const s = 0.85 / peak; for (let i = 0; i < mix.length; i++) mix[i] *= s; }
  return mix;
}

function applyFades(mix, fadeOutSec) {
  const frames = mix.length / 2;
  const inF = Math.floor(0.008 * SR);
  for (let i = 0; i < inF; i++) { const g = i / inF; mix[i * 2] *= g; mix[i * 2 + 1] *= g; }
  const outF = Math.floor(fadeOutSec * SR);
  for (let i = 0; i < outF; i++) {
    const o = frames - outF + i;
    const g = 0.5 + 0.5 * Math.cos(Math.PI * (i / outF));
    mix[o * 2] *= g; mix[o * 2 + 1] *= g;
  }
  return mix;
}

function writeWav(file, mix) {
  const frames = mix.length / 2;
  const dataLen = frames * 4; // 16-bit stereo
  const buf = Buffer.alloc(44 + dataLen);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + dataLen, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(dataLen, 40);
  for (let i = 0; i < mix.length; i++) {
    buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(mix[i] * 32767))), 44 + i * 2);
  }
  fs.writeFileSync(file, buf);
}

/* ------------------------------------------------------------------ */
/* Encode chain: identical for every clip                              */
/* ------------------------------------------------------------------ */

function loudnormTwoPass(input, output) {
  // Pass 1: measure integrated loudness + true peak. Pass 2: apply a plain
  // linear gain to hit -16 LUFS exactly (clamped so true peak stays under
  // -1.2 dBTP). Deliberately NOT dynamic loudnorm — a static gain can't
  // introduce level movement that would differ between human and machine clips.
  let res = spawnSync('ffmpeg', ['-y', '-i', input,
    '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11:dual_mono=true:print_format=json', '-f', 'null', '-']);
  const text = res.stderr.toString();
  const match = text.match(/\{[^{}]*"input_i"[\s\S]*?\}/);
  if (!match) throw new Error(`loudnorm measure failed:\n${text.slice(-800)}`);
  const m = JSON.parse(match[0]);
  const gain = -16 - parseFloat(m.input_i);
  // Exact static gain to -16 LUFS; a brick-wall true-peak limiter at -1 dBTP
  // catches the few transient overs. Identical processing for every clip.
  res = spawnSync('ffmpeg', ['-y', '-v', 'error', '-i', input,
    '-af', `volume=${gain.toFixed(2)}dB,alimiter=limit=0.891:attack=2:release=60:level=false`,
    '-ar', String(SR), output]);
  if (res.status !== 0) throw new Error(`gain pass failed: ${res.stderr}`);
}

function encode(wav, outBase, opts) {
  // Single deterministic chain: loudness-normalize to -16 LUFS, then encode.
  const norm = `${wav}.norm.wav`;
  loudnormTwoPass(wav, norm);
  let res = spawnSync('ffmpeg', ['-y', '-v', 'error', '-i', norm, '-codec:a', 'libmp3lame', '-q:a', '2', `${outBase}.mp3`]);
  if (res.status !== 0) throw new Error(`mp3 encode failed: ${res.stderr}`);
  if (opts.ogg) {
    res = spawnSync('ffmpeg', ['-y', '-v', 'error', '-i', norm, '-codec:a', 'libvorbis', '-q:a', '5', `${outBase}.ogg`]);
    if (res.status !== 0) throw new Error(`ogg encode failed: ${res.stderr}`);
  }
  fs.unlinkSync(norm);
  if (!opts.keepWav) fs.unlinkSync(wav);
}

function probeDuration(file) {
  const res = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]);
  return parseFloat(res.stdout.toString().trim());
}

/* ------------------------------------------------------------------ */
/* Main                                                                */
/* ------------------------------------------------------------------ */

function inspect(file) {
  const data = parseMidi(fs.readFileSync(file));
  const tpq = data.division;
  const lastBeat = Math.max(...data.notes.map(n => (n.startTick + n.durTick) / tpq));
  console.log(`file: ${file}`);
  console.log(`format ${data.format}, division ${tpq} tpq, ${data.notes.length} notes, ${lastBeat.toFixed(1)} beats total`);
  console.log('tempos:', data.tempos.slice(0, 8).map(t => `beat ${(t.tick / tpq).toFixed(1)} = ${Math.round(60000000 / t.usPerBeat)}bpm`).join(', ') || '(none)');
  console.log('timeSigs:', data.timeSigs.map(t => `beat ${(t.tick / tpq).toFixed(1)}: ${t.num}/${t.den}`).join(', ') || '(none)');
  const tracks = new Set(data.notes.map(n => n.track));
  for (const t of tracks) {
    const ns = data.notes.filter(n => n.track === t);
    console.log(`track ${t}: ${ns.length} notes, pitch ${Math.min(...ns.map(n => n.midi))}–${Math.max(...ns.map(n => n.midi))}, beats ${(ns[0].startTick / tpq).toFixed(1)}–${((ns[ns.length - 1].startTick) / tpq).toFixed(1)}`);
  }
  // first bars preview
  for (const n of data.notes.slice(0, 24)) {
    console.log(`  beat ${(n.startTick / tpq).toFixed(2).padStart(7)} midi ${n.midi} vel ${(n.vel * 127) | 0} dur ${(n.durTick / tpq).toFixed(2)} trk ${n.track}`);
  }
}

function main() {
  const args = process.argv.slice(2);
  if (args[0] === '--inspect') return inspect(args[1]);
  const opts = { ogg: args.includes('--ogg'), keepWav: args.includes('--keep-wav') };
  const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;

  const CLIPS = require('./clips.config.js');
  const durations = {};

  for (const cfg of CLIPS) {
    if (only && cfg.id !== only) continue;
    const midiData = parseMidi(fs.readFileSync(path.join(MIDI_DIR, cfg.midi)));
    const perf = performExcerpt(midiData, cfg);
    console.log(`${cfg.id}: ${perf.length} notes, tier=${cfg.tier}`);
    let mix = renderNotes(perf, cfg.tail ?? 3.2);
    mix = applyFades(mix, cfg.fadeOut ?? 2.2);
    const outDir = path.join(ROOT, cfg.outDir);
    fs.mkdirSync(outDir, { recursive: true });
    const wav = path.join(outDir, `${cfg.id}.wav`);
    writeWav(wav, mix);
    encode(wav, path.join(outDir, cfg.id), opts);
    const dur = probeDuration(path.join(outDir, `${cfg.id}.mp3`));
    durations[cfg.id] = dur;
    console.log(`  → ${cfg.outDir}/${cfg.id}.mp3  (${dur.toFixed(1)}s)`);
  }

  // Patch durations into data/clips.json when entries exist.
  const manifestPath = path.join(ROOT, 'data', 'clips.json');
  if (fs.existsSync(manifestPath)) {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    let patched = 0;
    for (const list of [manifest.clips || [], manifest.demos || []]) {
      for (const c of list) {
        if (durations[c.id] != null) { c.duration = Math.round(durations[c.id] * 10) / 10; patched++; }
      }
    }
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
    console.log(`patched ${patched} durations into data/clips.json`);
  }
}

main();
