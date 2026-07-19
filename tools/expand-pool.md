# Expanding the clip pool

Every piece in the game is a **pair**: one licensed human recording and one
machine render of the same excerpt. A piece can't join the pool with only one
side — the session builder's fairness rule (side chosen by coin flip) depends
on both existing. This file is the working checklist for adding pairs.

The fetching below can't run from a network-restricted environment; run it on
a normal machine (a local Claude Code session can do the whole list in one
sitting: fetch, trim, render, verify, and write the manifest entries).

## Already half-staged (finish these first)

Two piano MIDIs are in `tools/midi/` with no config entry and no human twin:

| Piece | MIDI in repo | Human recording to fetch |
|---|---|---|
| Mozart — Sonata in C, K. 545, I. Allegro | `k545.mid` | Musopen's Mozart collection (public domain) — search musopen.org for "K545"; verify PD/CC0 on the file page |
| Grieg — Lyric Piece Op. 12 No. 3 | `grieg-12-3.mid` | Musopen Grieg / Wikimedia Commons — verify license per file |

## Piano candidates (sources already credited on /about)

The Musopen Complete Chopin Collection (PD/CC0, already in the credits) has
far more than the pool uses. Pair any of these with Bernd Krueger's
piano-midi.de MIDIs (CC BY-SA DE, also already credited):

- Nocturne Op. 9 No. 1
- Prelude Op. 28 No. 17
- Waltz Op. 64 No. 2 ("Minute" waltz's sibling)
- Polonaise Op. 40 No. 1

Other strong candidates (verify each recording's license on its file page):

- Satie — Gnossienne No. 1 (Commons has CC recordings; Mutopia has the score)
- Beethoven — Pathétique, I (Musopen; MAESTRO/Krueger MIDI)

## Violin candidates

The easiest wins reuse sources already in the credits:

- **Remaining Four Seasons movements.** The Modena Chamber Orchestra set on
  Wikimedia Commons (Public Domain Mark, already credited for the four first
  movements) covers the full concertos — e.g. Winter II (Largo), Summer III
  (Presto), Autumn III (La caccia). Mutopia's performer facsimiles likewise
  cover the other movements. Same pipeline, same credits, four-plus new pairs.
- Bach — Violin Concerto in A minor, BWV 1041, I. Advent Chamber Orchestra
  recordings circulate under CC BY-SA (Commons/IMSLP); Mutopia has BWV 1041.
- Massenet — Méditation from Thaïs. Commons has candidates; verify the
  performer's license and that it's violin (not a cello transcription).

## The steps per pair

1. **Human side**: download the recording, confirm the license on the file
   page, then trim/normalize with `tools/prepare-human.js` into
   `audio/human/clip-<id>-h.mp3`. Note performer + license for the credits.
2. **Machine side (piano)**: put the MIDI in `tools/midi/`, add an entry to
   `tools/clips.config.js` (choose the tier deliberately — the pool wants
   more expressive than deadpan), then `node tools/render-clips.js --only <id>`.
3. **Machine side (violin)**: MIDI into `tools/midi/violin/`, entry in
   `tools/violin.config.js`, then `node tools/render-violin.js --only <id>`
   (needs FluidSynth + GeneralUser GS, see README).
4. **Loudness check**: every new file must sit within ±0.4 LU of −16 LUFS
   (command in the README). This is the fairness guarantee; don't skip it.
5. **Manifest**: add BOTH clips to `data/clips.json` with the same `piece`
   key, honest `reveal` copy in the site's voice, `tier` on the machine side,
   and `instrument` for violin. New ids start unrated at Elo 1500 and the
   counters pick them up automatically — no server changes needed.
6. **Copy that hard-codes the pool size** (update all three):
   - `index.html` instrument picker: "38 paired pieces" / "8 paired pieces"
   - `about.html` Twins section: "38 paired pieces; the violin pool has eight"
   - Credits on /about: add the new performers and licenses.
7. Play a session of each instrument locally and confirm the new pieces can
   appear, the reveal reads correctly, and the pair's side flips on replay.
