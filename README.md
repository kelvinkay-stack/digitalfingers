# Digital Fingers — Can You Hear the Human?

A blind listening test: short solo-piano excerpts, some played by human pianists,
some rendered by software from the score. Visitors guess **Human** or **Machine**,
get an explanation of the tells after each answer, and track their accuracy over
time. Static site — no backend, no build step, no frameworks.

A second pool — **violin** — lives at `/violin.html`: same game engine, its own
clip manifest (`data/clips-violin.json`), its own localStorage history and crowd
counters. See "The violin section" below.

Live: `https://digital-fingers.netlify.app` (update canonical URLs if the domain changes —
they appear in every HTML `<head>`, `sitemap.xml`, and `robots.txt`).

## Layout

```
index.html            the piano game (intro → rounds → reveal → results)
violin.html           the violin game — same engine, its own pool
learn.html            "How to Hear a Human" — essay + A/B ear-training demos
about.html            methodology, credits, licensing
css/style.css         the entire design system
js/                   ES modules: main (game controller), game, player, stats, learn
data/clips.json       the piano clip manifest — every clip and demo, with reveal copy
data/clips-violin.json the violin clip manifest (same schema)
audio/human/          human piano recordings (public domain / CC0)
audio/machine/        machine piano renderings (built by tools/render-clips.js)
audio/violin/human/   human violin recordings    } created as the violin pool
audio/violin/machine/ machine violin renderings  } is assembled
audio/demos/          Learn-page A/B pairs (same phrase, one dimension isolated)
tools/render-clips.js offline renderer: MIDI → expression model → Salamander → MP3
tools/prepare-human.js trim/normalize a human recording into the pool
tools/clips.config.js which excerpts get rendered, at which tier, with which knobs
tools/midi/           public-domain source MIDI (Mutopia Project typesettings)
tools/samples/        Salamander Grand Piano samples (not committed — see below)
tools/source-human/   full-length source recordings for the human excerpts
_headers              Cloudflare Pages cache/security headers
```

## The game

- A session is 10 rounds (`STANDARD_ROUNDS` in `js/game.js`), drawn from a 57-clip
  pool (27 machine renders, 30 human recordings) covering 38 pieces across eleven
  composers (Bach, Petzold, Mozart, Beethoven, Chopin, Schumann, Brahms, Satie,
  Scriabin, Debussy, Tchaikovsky). 19 pieces are twinned.
- **Twins:** clips carry a `piece` key, and some pieces exist as BOTH a human
  recording and a machine render (currently Chopin Preludes Op. 28 Nos. 4/6/7).
  The draw groups by piece, plays each piece at most once per session, and picks
  the version at random — so on replay a familiar tune can switch sides. 14 of
  the 34 pieces are twinned. To twin another piece, give both clips the same
  `piece` value. Vetting rules for found recordings: verify the key by chroma
  analysis, and read the source page — reject anything whose provenance says
  MuseScore/Sibelius (MIDI renders masquerading as recordings), YouTube rips,
  or has no named performer/provenance at all.
- **The training experiment and crowd stats:** the intro asks whether the
  player has musical training (stored locally). Every finished session POSTs
  anonymously to `/api/stats` (a Netlify Function backed by Netlify Blobs, see
  `netlify/functions/stats.mjs`): per-clip right/wrong counters always
  (plus `sureRight`/`sureTotal` for "definitely" answers), and the
  trained/untrained group totals when the question was answered. Reveals
  show "NN% of players called this one correctly" once a clip has 5+ answers;
  the results screen charts trained vs. untrained accuracy and offers a
  share-your-score button.
- **Answers carry confidence:** the round screen offers a four-point scale —
  Definitely human · Leaning human · Leaning machine · Definitely machine.
  Direction decides right/wrong (the score stays x/10); strength is recorded as
  `confidence: 2|1` per round. Results show a lifetime calibration line
  ("when you answer definitely, you're right NN% of the time") once 5+
  confident answers exist, plus this session's boldest miss. Reveals add the
  crowd's certainty ("among those who answered definitely, NN% were right")
  once a clip has 5+ confident answers. Rounds recorded before the scale
  existed simply lack the field and are skipped by the calibration math.
- Max 2 replays per clip before answering; free relistening after the reveal.
- **Hard mode** restricts the draw to clips flagged `"hard": true` — expressive-tier
  renders and unusually precise human playing.
- Keyboard: `Space`/`P` play · `1`–`4` across the answer scale (1 = definitely
  human … 4 = definitely machine) · `H`/`←` leaning human, `M`/`→` leaning
  machine, `Shift+H`/`Shift+M` definitely · `Enter`/`N` next.
- Stats live in `localStorage` (`digitalfingers.v1`): per-session history, lifetime
  accuracy, the visitor's most-fooling clip, and a sparkline after 3+ sessions.
- A clip that fails to load is skipped gracefully and doesn't count against the score.
- The listening stage shows a **rolling waveform** (`js/waveform.js`): peaks are
  decoded client-side from the same MP3 the player streams, so human and machine
  clips get identical treatment and drop-in clips need no build step. Under
  `prefers-reduced-motion` it renders as a static waveform with a progress fill.

**Honesty note:** the truth for each clip is plainly visible in `data/clips.json`
and in the audio paths (`/audio/human/` vs `/audio/machine/`). A visitor with
devtools open can cheat; that's accepted for a game with no stakes. If you ever
care, add a build step that copies audio to hashed names in one flat directory
and strips `isHuman` from the served manifest, resolving answers from a second
fetch after each guess.

## Adding a clip

### A human recording (the usual case)

1. Run it through the normalizer — same chain as every other clip:

   ```sh
   node tools/prepare-human.js path/to/recording.wav clip-myid --start 0 --dur 26
   ```

   This strips leading silence, trims, fades (0.15 s in / 2.2 s out), applies a
   static gain to −16 LUFS (true-peak limited at −1 dBTP), and encodes MP3 → `audio/human/clip-myid.mp3`.

2. Add an entry to `data/clips.json`:

   ```json
   {
     "id": "clip-myid",
     "title": "Nocturne in C minor",
     "composer": "F. Chopin",
     "performer": "Aunt Ruth (recorded 2019, used with ownership)",
     "src": "audio/human/clip-myid.mp3",
     "duration": 26.0,
     "isHuman": true,
     "tier": null,
     "difficulty": 2,
     "hard": false,
     "source": "family recording",
     "reveal": "Why this one sounds human — write the tell, specifically, for THIS clip."
   }
   ```

That's it. The game picks it up on the next load.

### A machine rendering

1. Drop a quantized MIDI file in `tools/midi/` (Mutopia Project files work
   perfectly and state their license in the source `.ly`; verify it says
   Public Domain).
2. Add an entry to `tools/clips.config.js` — pick the excerpt window in beats
   (use `node tools/render-clips.js --inspect tools/midi/file.mid` to see the
   structure), a tempo, a tier, and phrase/pedal settings.
3. Render: `node tools/render-clips.js --only clip-newid`
4. Add the manifest entry as above with `"isHuman": false` and the tier.

The renderer patches real durations back into `data/clips.json` (and
`data/clips-violin.json`) after each run.

## The violin section

`/violin.html` is a full second instance of the game, driven by the same
`js/main.js`. The page selects its pool with `<body data-…>` attributes
(`data-manifest`, `data-pool`, `data-storage-key`, `data-share-line`,
`data-share-url`); `index.html` carries no attributes and runs on the piano
defaults. Everything is namespaced:

- **Manifest:** `data/clips-violin.json` — identical schema to `clips.json`.
- **Local stats:** `localStorage` key `digitalfingers.violin.v1`.
- **Crowd stats:** `/api/stats?pool=violin` → a separate Netlify Blobs key
  (`aggregate-violin`), so violin sessions never pollute the piano numbers.
- **Audio:** `audio/violin/human/` and `audio/violin/machine/` (the `_headers`
  immutable-cache rule for `/audio/*` already covers them).

While the manifest's `clips` array is empty the page shows a "pool is still
being recorded" notice and disables Begin — it goes live automatically the
moment clips are added.

### Filling the violin pool

Same rules as piano, same chain, different sources:

- **Human recordings:** solo-violin performances with clear provenance and a
  named performer (Musopen, Wikimedia Commons CC performances, crowdfunded
  open recordings). The vetting rules above apply doubly: reject anything that
  smells like a MIDI render or a YouTube rip. Bach's Sonatas & Partitas are the
  natural backbone — widely recorded, public-domain compositions. Prepare with:

  ```sh
  node tools/prepare-human.js path/to/rec.wav clip-vmyid --start 0 --dur 26 --out audio/violin/human
  ```

- **Machine renders:** drop violin note samples (one MP3 per pitch, named like
  `A4.mp3`/`Ds5.mp3` — e.g. the CC0 VSCO 2 Community Edition violin set, or the
  violin folder of tonejs-instruments) into `tools/samples-violin/`, put
  public-domain violin MIDI in `tools/midi/`, and give the clip's entry in
  `tools/clips.config.js` `samples: 'samples-violin'` and
  `outDir: 'audio/violin/machine'`. Solo-violin writing is mostly monophonic,
  so skip `pedalBeats` and expect the melody/bass voicing model to mostly
  no-op; the timing tiers (deadpan / humanized / expressive) carry the game.

- **Manifest entries** go in `data/clips-violin.json`, same fields, and the
  reveal copy should teach violin tells: bow changes and string crossings,
  vibrato that varies within a note, expressive intonation and slides,
  bow-pressure "consonants" at phrase starts — versus renders whose vibrato is
  a fixed LFO and whose every note starts with the identical attack.

The loudness policy is unchanged: every violin clip exits through the same
−16 LUFS static-gain chain as the piano pool.

## The expression model (tiers)

- **deadpan** — the score executed exactly: constant velocity, quantized timing,
  uniform articulation. The classic MIDI-file sound.
- **humanized** — deadpan plus small gaussian timing/velocity jitter and a slow
  tempo drift. Sounds less robotic, but the errors are uncorrelated — which is
  itself the tell, and the Learn page teaches exactly that.
- **expressive** — a phrase model: rubato (breathe at phrase starts, press
  through the middle, relax at cadences, final ritardando), dynamic arcs,
  melody/bass voicing with asynchrony (melody leads ~15–25 ms), shaped
  articulation, and sustain-pedal simulation. Deliberately built to fool you.

Per-clip overrides in `clips.config.js` can enable any single dimension in
isolation — that's how the six Learn-page demos were made (same 8 bars of
Gymnopédie No. 1, one dimension at a time).

## Loudness / fairness policy

Every clip exits through the identical chain: static gain to **−16 LUFS**
integrated (measured with ffmpeg loudnorm, applied as plain `volume` so no
dynamics processing differs between clips), brick-wall true-peak limiter at
−1 dBTP for transient overs, 44.1 kHz, `libmp3lame -q:a 2`. Verify the pool
anytime:

```sh
for f in audio/*/*.mp3; do
  printf '%s ' "$f"; ffmpeg -i "$f" -af ebur128 -f null - 2>&1 | grep 'I:' | tail -1
done
```

Everything should sit within ±0.4 LU of −16.

## Rendering prerequisites

- Node 18+ and `ffmpeg`/`ffprobe` on PATH.
- Salamander samples (not committed): download the 30 files into `tools/samples/`:

  ```sh
  cd tools/samples
  for n in A0 C1 Ds1 Fs1 A1 C2 Ds2 Fs2 A2 C3 Ds3 Fs3 A3 C4 Ds4 Fs4 A4 \
           C5 Ds5 Fs5 A5 C6 Ds6 Fs6 A6 C7 Ds7 Fs7 A7 C8; do
    curl -sO "https://tonejs.github.io/audio/salamander/$n.mp3"
  done
  ```

- `node tools/render-clips.js` re-renders everything deterministically (the
  expression randomness is seeded per clip id). `--ogg` also emits Vorbis files.

## Deployment (Netlify)

Deployed at `https://digital-fingers.netlify.app`.

- Continuous deploys (preferred): Netlify → the `digitalfingers` project →
  Site configuration → Build & deploy → Link repository → this repo.
  No build command, publish directory `/`, and enable branch deploys for
  all branches so every pushed branch gets a preview URL
  (`<branch-with-dashes>--digital-fingers.netlify.app`). The root
  `package.json` exists solely so CI installs `@netlify/blobs` and the
  stats function bundles; the site itself has no build step.
- CLI deploy: `netlify deploy --prod --dir .` (the repo is linked to the
  `digitalfingers` project). `netlify deploy --dir .` gives a draft URL.
- `_headers` ships long-lived immutable caching for `/audio/*` and `/fonts/*`
  (Netlify and Cloudflare Pages share this file format).

If you re-render a clip in place, bump its filename (or the manifest `version`)
— audio is cached as immutable.

## Licensing

- Compositions: all public domain (composers deceased 100+ years).
- Human recordings: Musopen (CC0/PD), the Open Goldberg Variations and Open
  Well-Tempered Clavier (Kimiko Ishizaka, CC0/PD), and three Wikimedia Commons
  performances (CC BY-SA 4.0 — Prati, Han, eldüendesüarez; those three clips
  remain CC BY-SA).
- Machine renders: generated from Mutopia Project typesettings (public domain);
  the renders themselves are dedicated to the public domain.
- Salamander Grand Piano samples: Alexander Holm, CC-BY 3.0 (credited on /about).
- Cormorant Garamond: SIL OFL, self-hosted.
- Site code: © kelvinkay.com — do what you like with it, attribution appreciated.
