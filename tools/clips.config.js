/**
 * clips.config.js — every machine-rendered clip and Learn-page demo.
 *
 * beats:        [start, end] excerpt window in quarter-note beats of the MIDI
 * bpm:          performance tempo (quarter note)
 * tier:         deadpan | humanized | expressive  (see render-clips.js TIERS)
 * phraseBeats:  phrase length used by the rubato / dynamic-arc model
 * pedalBeats:   sustain-pedal simulation — notes ring to the next boundary
 * override:     per-clip expression parameter overrides (used by the demos
 *               to isolate a single expressive dimension)
 *
 * IDs are deliberately piece-keyed but tier-neutral; the game never shows a
 * filename before the reveal.
 */

module.exports = [
  /* ---------------- game pool: machine clips ---------------- */
  {
    id: 'clip-846', midi: 'bwv846.mid', outDir: 'audio/machine',
    tier: 'deadpan', beats: [0, 44], bpm: 88, phraseBeats: 16,
    fadeOut: 2.4,
  },
  {
    id: 'clip-anh114', midi: 'minuet-g.mid', outDir: 'audio/machine',
    tier: 'deadpan', beats: [0, 48], bpm: 112, phraseBeats: 12,
    fadeOut: 2.0,
  },
  {
    id: 'clip-woo59', midi: 'fur-elise.mid', outDir: 'audio/machine',
    tier: 'humanized', beats: [0, 24.5], bpm: 76, phraseBeats: 12,
    fadeOut: 1.8,
  },
  {
    id: 'clip-op28n7', midi: 'chopin-28-7.mid', outDir: 'audio/machine',
    tier: 'humanized', beats: [0, 37], bpm: 84, phraseBeats: 6, pedalBeats: 3,
    fadeOut: 2.0,
  },
  {
    id: 'clip-gym1', midi: 'gymnopedie1.mid', outDir: 'audio/machine',
    tier: 'expressive', beats: [0, 39], bpm: 80, phraseBeats: 12, pedalBeats: 3,
    fadeOut: 2.6,
  },
  {
    id: 'clip-op28n4', midi: 'chopin-28-4.mid', outDir: 'audio/machine',
    tier: 'expressive', beats: [0, 30], bpm: 62, phraseBeats: 16, pedalBeats: 2,
    fadeOut: 2.8,
  },
  {
    id: 'clip-kv397', midi: 'mozart-kv397.mid', outDir: 'audio/machine',
    tier: 'expressive', beats: [0, 20], bpm: 58, phraseBeats: 8, pedalBeats: 4,
    fadeOut: 2.8,
  },

  /* ---------------- Learn page: A/B demos ---------------- */
  /* Same eight-bar Gymnopédie phrase every time; one dimension per demo. */
  {
    id: 'demo-deadpan', midi: 'gymnopedie1.mid', outDir: 'audio/demos',
    tier: 'deadpan', beats: [12, 36], bpm: 76, phraseBeats: 12,
    fadeOut: 2.0,
  },
  {
    id: 'demo-timing', midi: 'gymnopedie1.mid', outDir: 'audio/demos',
    tier: 'deadpan', beats: [12, 36], bpm: 76, phraseBeats: 12,
    override: { rubato: 0.10, timeJitter: 0.010, endRit: 0.30 },
    fadeOut: 2.0,
  },
  {
    id: 'demo-dynamics', midi: 'gymnopedie1.mid', outDir: 'audio/demos',
    tier: 'deadpan', beats: [12, 36], bpm: 76, phraseBeats: 12,
    override: { arc: 0.18, voicing: 0.17 },
    fadeOut: 2.0,
  },
  {
    id: 'demo-pedal', midi: 'gymnopedie1.mid', outDir: 'audio/demos',
    tier: 'deadpan', beats: [12, 36], bpm: 76, phraseBeats: 12, pedalBeats: 3,
    fadeOut: 2.4,
  },
  {
    id: 'demo-articulation', midi: 'gymnopedie1.mid', outDir: 'audio/demos',
    tier: 'deadpan', beats: [12, 36], bpm: 76, phraseBeats: 12,
    override: { artic: 'shaped' },
    fadeOut: 2.0,
  },
  {
    id: 'demo-full', midi: 'gymnopedie1.mid', outDir: 'audio/demos',
    tier: 'expressive', beats: [12, 36], bpm: 76, phraseBeats: 12, pedalBeats: 3,
    fadeOut: 2.4,
  },
];
