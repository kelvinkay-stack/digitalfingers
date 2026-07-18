# Digital Fingers — Can You Hear the Human?

A blind listening test: short piano and violin excerpts, some played by human musicians,
some rendered by software from the score. Visitors choose an instrument, guess **Human** or **Machine**,
get an explanation of the tells after each answer, and track their accuracy over
time. Static site — no backend, no build step, no frameworks.

Live: `https://digital-fingers.netlify.app` (update canonical URLs if the domain changes —
they appear in every HTML `<head>`, `sitemap.xml`, and `robots.txt`).

## Layout

```
index.html            the game (intro → rounds → reveal → results)
learn.html            "How to Hear a Human" — essay + A/B ear-training demos
about.html            methodology, credits, licensing
css/style.css         the entire design system
js/                   ES modules: main (game controller), game, player, stats, learn
data/clips.json       the clip manifest — every clip and demo, with reveal copy
audio/human/          human recordings (public domain / Creative Commons)
audio/machine/        machine renderings (built by the offline renderers)
audio/demos/          Learn-page A/B pairs (same phrase, one dimension isolated)
tools/render-clips.js offline renderer: MIDI → expression model → Salamander → MP3
tools/render-violin.js offline renderer: MIDI → FluidSynth → GeneralUser GS → MP3
tools/prepare-human.js trim/normalize a human recording into the pool
tools/clips.config.js which excerpts get rendered, at which tier, with which knobs
tools/violin.config.js excerpt windows for the violin machine renders
tools/midi/           licensed score and performance MIDI used by the renderer
tools/samples/        Salamander Grand Piano samples (not committed — see below)
tools/soundfonts/     GeneralUser GS for violin renders (not committed — see below)
tools/source-human/   full-length source recordings for the human excerpts
_headers              Cloudflare Pages cache/security headers
```

## The game

- A session is 5 rounds (`STANDARD_ROUNDS` in `js/game.js`). The piano game draws
  from a 76-clip pool (38 machine renders, 38 human recordings) covering 38 pieces across eleven
  composers (Bach, Petzold, Mozart, Beethoven, Chopin, Schumann, Brahms, Satie,
  Scriabin, Debussy, Tchaikovsky). The violin game adds sixteen clips: human and
  machine versions of eight works by Vivaldi, Bach, Schubert, and Beethoven. Every piece is twinned.
- **Twins:** clips carry a `piece` key, and every piece exists as BOTH a human
  recording and a machine render.
  The draw groups by piece, plays each piece at most once per session, and picks
  the version at random — so on replay a familiar tune can switch sides. To add
  another piece, give both clips the same `piece` value. Vetting rules for found
  recordings: verify the key by chroma
  analysis, and read the source page — reject anything whose provenance says
  MuseScore/Sibelius (MIDI renders masquerading as recordings), YouTube rips,
  or has no named performer/provenance at all.
- **The training experiment and crowd stats:** the intro asks whether the
  player has musical training (stored locally). Every finished session POSTs
  anonymously to `/api/stats` (a Netlify Function backed by Netlify Blobs, see
  `netlify/functions/stats.mjs`): per-clip right/wrong counters always, plus
  the trained/untrained group totals when the question was answered. Reveals
  show "NN% of players called this one correctly" once a clip has 5+ answers;
  the results screen charts trained vs. untrained accuracy and offers a
  share-your-score button.
- Max 2 replays per clip before answering; free relistening after the reveal.
- Keyboard: `Space`/`P` play · `H`/`←` human · `M`/`→` machine · `Enter`/`N` next.
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
     "instrument": "piano",
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

### A piano machine rendering

1. Drop a quantized MIDI file in `tools/midi/`. Verify its source and license;
   Mutopia Project files work well and state their license in the source `.ly`.
2. Add an entry to `tools/clips.config.js` — pick the excerpt window in beats
   (use `node tools/render-clips.js --inspect tools/midi/file.mid` to see the
   structure), a tempo, a tier, and phrase/pedal settings.
3. Render: `node tools/render-clips.js --only clip-newid`
4. Add the manifest entry as above with `"isHuman": false` and the tier.

The renderer patches real durations back into `data/clips.json` after each run.

### A violin machine rendering

1. Put licensed MIDI in `tools/midi/violin/` and add an excerpt entry to
   `tools/violin.config.js`.
2. Install FluidSynth and download GeneralUser GS as described below.
3. Render with `node tools/render-violin.js --only clip-vln-newid`.
4. Add the manifest entry with `"instrument": "violin"` and `"isHuman": false`.

The violin renderer uses each MIDI's embedded orchestration and then applies the
same trim, fades, loudness target, limiter, sample rate, and MP3 encoder used for
human clips.

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
- Violin renders additionally require FluidSynth and GeneralUser GS:

  ```sh
  brew install fluidsynth
  mkdir -p tools/soundfonts
  curl -L -o tools/soundfonts/GeneralUser-GS.sf2 \
    https://raw.githubusercontent.com/mrbumpy409/GeneralUser-GS/main/GeneralUser-GS.sf2
  node tools/render-violin.js
  ```

## Deployment (Netlify)

Deployed at `https://digital-fingers.netlify.app`.

- CLI deploy: `netlify deploy --prod --dir .` (the repo is linked to the
  `digitalfingers` project).
- Or wire continuous deploys: Netlify → Import from Git → this repo,
  no build command, publish directory `/`.
- `_headers` ships long-lived immutable caching for `/audio/*` and `/fonts/*`
  (Netlify and Cloudflare Pages share this file format).

If you re-render a clip in place, bump its filename (or the manifest `version`)
— audio is cached as immutable.

## Licensing

- Compositions: all public domain (composers deceased 100+ years).
- Human recordings: Musopen, the Open Goldberg Variations, the Open
  Well-Tempered Clavier, Wikimedia Commons, and IMSLP, including the Modena
  Chamber Orchestra's public-domain Four Seasons and Ben Goldstein's CC BY-SA
  3.0 Chaconne. Each is public domain,
  CC0, or under the Creative Commons license named on the source and About page.
  The expanded violin pool also includes Robert Gayler's 1920 Bach Air (Public
  Domain Mark), Katy Adelson's Schubert Ave Maria (CC BY 3.0), and the United
  States Marine Band's Beethoven Violin Concerto (U.S. government public domain).
- Machine renders: generated from licensed Mutopia, Knute Snortum, Bernd Krueger,
  MAESTRO v3, and Tirol's MIDI Works note data. The rendered excerpts preserve
  all applicable attribution, noncommercial, and share-alike terms.
- Salamander Grand Piano samples: Alexander Holm, CC-BY 3.0 (credited on /about).
- Violin and string samples: GeneralUser GS by S. Christian Collins, used through
  FluidSynth for the committed audio renders (credited on /about).
- Cormorant Garamond: SIL OFL, self-hosted.
- Site code: © kelvinkay.com — do what you like with it, attribution appreciated.
