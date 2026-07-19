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

  {
    id: 'clip-anh115', midi: 'minuet-g-minor.mid', outDir: 'audio/machine',
    tier: 'deadpan', beats: [0, 48], bpm: 112, phraseBeats: 12,
    fadeOut: 2.0,
  },
  {
    id: 'clip-kinderszenen1', midi: 'kinderszenen1.mid', outDir: 'audio/machine',
    tier: 'humanized', beats: [0, 30], bpm: 69, phraseBeats: 8, pedalBeats: 2,
    fadeOut: 2.2,
  },
  {
    id: 'clip-brahms3915', midi: 'brahms-39-15.mid', outDir: 'audio/machine',
    tier: 'humanized', beats: [0, 48], bpm: 112, phraseBeats: 12, pedalBeats: 3,
    fadeOut: 2.2,
  },
  {
    id: 'clip-traumerei', midi: 'traumerei.mid', outDir: 'audio/machine',
    tier: 'expressive', beats: [0, 33], bpm: 69, phraseBeats: 16, pedalBeats: 2,
    fadeOut: 2.6,
  },
  {
    id: 'clip-brahms1182', midi: 'brahms-118.mid', outDir: 'audio/machine',
    tier: 'expressive', beats: [0, 36], bpm: 72, phraseBeats: 12, pedalBeats: 3,
    fadeOut: 2.6,
  },
  {
    id: 'clip-scriabin111', midi: 'scriabin-11-1.mid', outDir: 'audio/machine',
    tier: 'expressive', beats: [0, 48], bpm: 132, phraseBeats: 16, pedalBeats: 4,
    fadeOut: 2.4,
  },
  {
    id: 'clip-clairdelune', midi: 'clair-de-lune.mid', outDir: 'audio/machine',
    tier: 'expressive', beats: [0, 31.5], bpm: 66, phraseBeats: 13.5, pedalBeats: 4.5,
    fadeOut: 2.8,
  },
  {
    id: 'clip-arabesque1', midi: 'arabesque1.mid', outDir: 'audio/machine',
    tier: 'expressive', beats: [0, 56], bpm: 132, phraseBeats: 16, pedalBeats: 4,
    fadeOut: 2.4,
  },

  {
    id: 'clip-op28n6-m', midi: 'chopin-28-6.mid', outDir: 'audio/machine',
    tier: 'expressive', beats: [0, 24], bpm: 54, phraseBeats: 12, pedalBeats: 3,
    fadeOut: 2.6,
  },

  {
    id: 'clip-op28n15-m', midi: 'chopin-28-15.mid', outDir: 'audio/machine',
    tier: 'expressive', beats: [0, 32], bpm: 72, phraseBeats: 16, pedalBeats: 2,
    fadeOut: 2.6,
  },
  {
    id: 'clip-op28n20-m', midi: 'chopin-28-20.mid', outDir: 'audio/machine',
    tier: 'expressive', beats: [0, 24], bpm: 50, phraseBeats: 16, pedalBeats: 1,
    fadeOut: 2.6,
  },
  {
    id: 'clip-gym3', midi: 'gymnopedie3.mid', outDir: 'audio/machine',
    tier: 'expressive', beats: [0, 39], bpm: 80, phraseBeats: 12, pedalBeats: 3,
    fadeOut: 2.6,
  },
  {
    id: 'clip-pathetique2', midi: 'pathetique2.mid', outDir: 'audio/machine',
    tier: 'expressive', beats: [0, 25], bpm: 56, phraseBeats: 16, pedalBeats: 2,
    fadeOut: 2.6,
  },
  {
    id: 'clip-tchaik-morning', midi: 'tchaik-morning.mid', outDir: 'audio/machine',
    tier: 'humanized', beats: [0, 36], bpm: 76, phraseBeats: 12, pedalBeats: 3,
    fadeOut: 2.2,
  },
  {
    id: 'clip-tchaik-french', midi: 'tchaik-french.mid', outDir: 'audio/machine',
    tier: 'humanized', beats: [0, 32], bpm: 72, phraseBeats: 8, pedalBeats: 2,
    fadeOut: 2.2,
  },

  {
    id: 'clip-etude251-m', midi: 'etude-25-1.mid', outDir: 'audio/machine',
    tier: 'expressive', beats: [0, 44], bpm: 104, phraseBeats: 16, pedalBeats: 4,
    fadeOut: 2.4,
  },
  {
    id: 'clip-fantimpromptu-m', midi: 'fantaisie-impromptu.mid', outDir: 'audio/machine',
    tier: 'expressive', beats: [0, 64], bpm: 160, phraseBeats: 16, pedalBeats: 4,
    fadeOut: 2.4,
  },
  {
    id: 'clip-etude1012-m', midi: 'etude-10-12.mid', outDir: 'audio/machine',
    tier: 'expressive', beats: [0, 60], bpm: 152, phraseBeats: 16, pedalBeats: 4,
    fadeOut: 2.4,
  },
  {
    id: 'clip-etude109-m', midi: 'etude-10-9.mid', outDir: 'audio/machine',
    tier: 'expressive', beats: [0, 60], bpm: 138, phraseBeats: 12, pedalBeats: 3,
    fadeOut: 2.4,
  },
  {
    id: 'clip-pathetique3-m', midi: 'pathetique3.mid', outDir: 'audio/machine',
    tier: 'expressive', beats: [0, 96], bpm: 200, phraseBeats: 16, pedalBeats: 2,
    fadeOut: 2.4,
  },
  {
    id: 'clip-k545-m', midi: 'k545.mid', outDir: 'audio/machine',
    tier: 'expressive', beats: [0, 58], bpm: 126, phraseBeats: 8, pedalBeats: 2,
    fadeOut: 2.2,
  },
  {
    id: 'clip-grieg127-m', midi: 'grieg-12-3.mid', outDir: 'audio/machine',
    tier: 'expressive', beats: [0, 56], bpm: 108, phraseBeats: 8, pedalBeats: 2,
    fadeOut: 2.6,
  },
  {
    id: 'clip-noc92-m', midi: 'chopin-9-2.mid', outDir: 'audio/machine',
    tier: 'expressive', beats: [0, 25], bpm: 66, phraseBeats: 12, pedalBeats: 3,
    fadeOut: 2.6,
  },
  {
    id: 'clip-maz174-m', midi: 'chopin-17-4.mid', outDir: 'audio/machine',
    tier: 'humanized', beats: [9, 49], bpm: 100, phraseBeats: 12, pedalBeats: 3,
    fadeOut: 2.2,
  },
  {
    id: 'clip-op28n1-m', midi: 'chopin-28-1.mid', outDir: 'audio/machine',
    tier: 'expressive', beats: [0, 34], bpm: 100, phraseBeats: 8, pedalBeats: 2,
    fadeOut: 2.4,
  },
  {
    id: 'clip-op28n3-m', midi: 'chopin-28-3.mid', outDir: 'audio/machine',
    tier: 'humanized', beats: [0, 56], bpm: 168, phraseBeats: 16, pedalBeats: 2,
    fadeOut: 2.2,
  },
  {
    id: 'clip-noc151-m', midi: 'chopin-15-1.mid', outDir: 'audio/machine',
    tier: 'expressive', beats: [2, 48], bpm: 120, phraseBeats: 16, pedalBeats: 4,
    fadeOut: 2.6,
  },
  {
    id: 'clip-maz242-m', midi: 'chopin-24-2.mid', outDir: 'audio/machine',
    tier: 'humanized', beats: [4, 66], bpm: 168, phraseBeats: 12, pedalBeats: 3,
    fadeOut: 2.2,
  },
  {
    id: 'clip-noc271-m', midi: 'chopin-27-1.mid', outDir: 'audio/machine',
    tier: 'expressive', beats: [0, 24], bpm: 60, phraseBeats: 12, pedalBeats: 3,
    fadeOut: 2.6,
  },
  {
    id: 'clip-moonlight3-m', midi: 'moonlight3.mid', outDir: 'audio/machine',
    tier: 'humanized', beats: [0, 56], bpm: 167, phraseBeats: 16, pedalBeats: 2,
    fadeOut: 2.2,
  },
  {
    id: 'clip-waltz691-m', midi: 'chopin-69-1.mid', outDir: 'audio/machine',
    tier: 'humanized', beats: [2, 48], bpm: 120, phraseBeats: 12, pedalBeats: 3,
    fadeOut: 2.2,
  },
  {
    id: 'clip-aria-m', midi: 'bwv988-aria.mid', outDir: 'audio/machine',
    tier: 'expressive', beats: [0, 24], bpm: 60, phraseBeats: 12, pedalBeats: 3,
    fadeOut: 2.6,
  },
  {
    id: 'clip-berceuse-m', midi: 'chopin-57.mid', outDir: 'audio/machine',
    tier: 'expressive', beats: [2, 50], bpm: 120, phraseBeats: 16, pedalBeats: 4,
    fadeOut: 2.6,
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

/* ---------------- Learn page: expression mixer ----------------
 * All 16 combinations of the four expression layers over the same eight
 * bars as the A/B demos. File names use a 4-bit scheme, mixer-<t><d><p><a>:
 *   t = micro-timing/rubato   d = dynamics + voicing
 *   p = pedal                 a = articulation
 * (mixer-0000 = deadpan, mixer-1111 = every layer). Each layer's parameters
 * are identical to its matching demo above, so the mixer and the essays
 * teach the same sounds; every file exits through the same loudness chain
 * as the rest of the pool, so level never hints at which layers are on. */
for (let mask = 15; mask >= 0; mask--) {
  const t = !!(mask & 8), d = !!(mask & 4), p = !!(mask & 2), a = !!(mask & 1);
  module.exports.push({
    id: `mixer-${t ? 1 : 0}${d ? 1 : 0}${p ? 1 : 0}${a ? 1 : 0}`,
    midi: 'gymnopedie1.mid', outDir: 'audio/mixer',
    tier: 'deadpan', beats: [12, 36], bpm: 76, phraseBeats: 12,
    ...(p ? { pedalBeats: 3 } : {}),
    override: {
      ...(t ? { rubato: 0.10, timeJitter: 0.010, endRit: 0.30 } : {}),
      ...(d ? { arc: 0.18, voicing: 0.17 } : {}),
      ...(a ? { artic: 'shaped' } : {}),
    },
    fadeOut: p ? 2.4 : 2.0,
  });
}
