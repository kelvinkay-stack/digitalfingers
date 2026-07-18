/* mixer.js - the Learn page's expression mixer.
 *
 * No live DSP: all 16 combinations of the four expression layers are
 * pre-rendered offline (audio/mixer/mixer-<t><d><p><a>.mp3) through the
 * site's standard loudness chain. Flipping a toggle mid-playback switches
 * to the matching file at the equivalent position with a short volume
 * crossfade; combinations one toggle away are preloaded so the switch is
 * instant. Audio only starts loading when the panel scrolls into view or
 * is touched. */

const LAYERS = ['t', 'd', 'p', 'a']; // bit order matches the file names

const CAPTIONS = { // one line each, lifted from the essay sections below
  t: 'You steal a little here and pay it back there.',
  d: 'The melody note plays a little stronger than its neighbors, so the tune stands out from the background.',
  p: 'The new chord blooms into the old one’s fade.',
  a: 'Melodies get the connected, singing treatment while the accompaniment stays lighter and more detached.',
};

const NAMES = {
  t: 'Micro-timing and rubato',
  d: 'Dynamics and voicing',
  p: 'Pedal',
  a: 'Articulation',
};

const panel = document.querySelector('#mixer');

if (panel) {
  const els = {
    toggles: [...panel.querySelectorAll('.mixer-toggle')],
    play: panel.querySelector('#mixer-play'),
    deadpan: panel.querySelector('#mixer-deadpan'),
    full: panel.querySelector('#mixer-full'),
    caption: panel.querySelector('#mixer-caption'),
    bar: panel.querySelector('.ab-progress i'),
    live: panel.querySelector('#mixer-state'),
  };

  const state = { t: false, d: false, p: false, a: false };
  const pool = new Map(); // combo id -> Audio element
  const seenCaptions = new Set();
  let active = null;      // the Audio currently audible
  let raf = null;
  let armed = false;      // becomes true once the panel is seen or touched

  const comboId = (s = state) => `mixer-${LAYERS.map(l => s[l] ? 1 : 0).join('')}`;
  const srcFor = (id) => `audio/mixer/${id}.mp3`;

  function audioFor(id) {
    let a = pool.get(id);
    if (!a) {
      a = new Audio();
      a.preload = 'auto';
      a.src = srcFor(id);
      pool.set(id, a);
    }
    return a;
  }

  /* warm the current combination and every combination one toggle away */
  function preloadNeighbours() {
    if (!armed) return;
    audioFor(comboId());
    for (const l of LAYERS) {
      audioFor(comboId({ ...state, [l]: !state[l] }));
    }
  }

  function ramp(el, to, ms = 160) {
    const from = el.volume;
    const t0 = performance.now();
    const step = (t) => {
      const k = Math.min(1, (t - t0) / ms);
      el.volume = from + (to - from) * k;
      if (k < 1) requestAnimationFrame(step);
      else if (to === 0) { el.pause(); el.volume = 1; }
    };
    requestAnimationFrame(step);
  }

  function tick() {
    cancelAnimationFrame(raf);
    const step = () => {
      if (active && active.duration) {
        els.bar.style.width = `${100 * active.currentTime / active.duration}%`;
      }
      if (active && !active.paused && !active.ended) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  }

  function reflect() {
    for (const btn of els.toggles) {
      const on = state[btn.dataset.layer];
      btn.classList.toggle('is-on', on);
      btn.setAttribute('aria-pressed', String(on));
    }
    const playing = !!(active && !active.paused && !active.ended);
    els.play.textContent = playing ? 'Pause' : 'Play';
    els.play.setAttribute('aria-pressed', String(playing));
  }

  function stopUi() {
    els.bar.style.width = '0';
    reflect();
  }

  /* Switch to the file matching the current toggles. The files differ in
   * length (rubato stretches time), so the position carries over as a
   * fraction of duration - close enough that the phrase continues in place. */
  function switchFile() {
    preloadNeighbours();
    const next = audioFor(comboId());
    if (!active || active === next) { active = next; return; }
    const old = active;
    active = next;
    if (!old.paused && !old.ended) {
      const seek = () => {
        if (next.duration && old.duration) {
          next.currentTime = (old.currentTime / old.duration) * next.duration;
        }
        next.volume = 0;
        next.play().then(() => {
          ramp(next, 1);
          ramp(old, 0);
          tick();
        }).catch(() => { old.pause(); stopUi(); });
      };
      if (next.readyState >= 1) seek();
      else next.addEventListener('loadedmetadata', seek, { once: true });
    } else {
      old.pause();
    }
  }

  function setLayer(layer, on) {
    state[layer] = on;
    if (on && !seenCaptions.has(layer)) {
      seenCaptions.add(layer);
      els.caption.textContent = CAPTIONS[layer];
      els.caption.hidden = false;
    }
    els.live.textContent = `${NAMES[layer]} ${on ? 'on' : 'off'}.`;
    switchFile();
    reflect();
  }

  function setAll(t, d, p, a, announce) {
    Object.assign(state, { t, d, p, a });
    els.live.textContent = announce;
    switchFile();
    reflect();
  }

  function togglePlay() {
    armed = true;
    const a = audioFor(comboId());
    active = active || a;
    if (!active.paused && !active.ended) {
      active.pause();
      stopUi();
      return;
    }
    if (active.ended) active.currentTime = 0;
    active.volume = 1;
    active.play().then(() => { tick(); reflect(); preloadNeighbours(); }).catch(() => stopUi());
  }

  for (const btn of els.toggles) {
    btn.addEventListener('click', () => { armed = true; setLayer(btn.dataset.layer, !state[btn.dataset.layer]); });
  }
  els.deadpan.addEventListener('click', () => { armed = true; setAll(false, false, false, false, 'Deadpan: every layer off.'); });
  els.full.addEventListener('click', () => {
    armed = true;
    for (const l of LAYERS) seenCaptions.add(l);
    els.caption.textContent = 'Everything at once - the full illusion.';
    els.caption.hidden = false;
    setAll(true, true, true, true, 'The full illusion: every layer on.');
  });
  els.play.addEventListener('click', togglePlay);

  // elements join the pool lazily, so watch for the end from outside
  setInterval(() => { if (active && active.ended) stopUi(); }, 500);

  /* lazy-load: seeing the panel warms only the current combination (~450 KB,
   * one demo's worth); the one-toggle-away neighbours wait for a first touch */
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      if (entries.some(e => e.isIntersecting)) {
        armed = true;
        audioFor(comboId());
        io.disconnect();
      }
    }, { rootMargin: '200px' });
    io.observe(panel);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && active && !active.paused) { active.pause(); stopUi(); }
  });
}
