'use strict';

/**
 * Offline violin renders. The source MIDIs are licensed Mutopia score data;
 * GeneralUser GS is used only as an offline instrument and is not committed.
 */
module.exports = [
  { id: 'clip-vln-spring-m', midi: 'violin/vivaldi-spring-1.mid', start: 8, dur: 28 },
  { id: 'clip-vln-summer-m', midi: 'violin/vivaldi-summer-1.mid', start: 10, dur: 28 },
  { id: 'clip-vln-autumn-m', midi: 'violin/vivaldi-autumn-1.mid', start: 8, dur: 28 },
  { id: 'clip-vln-winter-m', midi: 'violin/vivaldi-winter-1.mid', start: 7, dur: 28 },
  { id: 'clip-vln-chaconne-m', midi: 'violin/bach-bwv1004-chaconne.mid', start: 18, dur: 28 },
  { id: 'clip-vln-air-m', midi: 'violin/bach-air-bwv1068.mid', start: 5, dur: 28, programs: { 1: 40, 2: 0 } },
  { id: 'clip-vln-ave-maria-m', midi: 'violin/schubert-ave-maria.mid', start: 24, dur: 28, programs: { 1: 40 } },
  { id: 'clip-vln-beethoven-concerto-m', midi: 'violin/beethoven-violin-concerto-1.mid', start: 208, dur: 28 },
];
