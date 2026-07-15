/* waveform.js — the rolling waveform on the listening stage.
 *
 * Peaks are computed client-side from the same MP3 the player streams
 * (fetch → decodeAudioData → bucketed |peak|), so human and machine clips
 * get identical treatment and drop-in clips need no build step.
 *
 * Two modes:
 *  - rolling (default): a window of the waveform scrolls right-to-left under
 *    a fixed playhead while the clip plays.
 *  - static (prefers-reduced-motion): the full waveform stays put and fills
 *    with brass as a progress bar.
 */

const BUCKETS_PER_SECOND = 30;
const WINDOW_SECONDS = 9;        // rolling view width
const PLAYHEAD_FRACTION = 0.38;  // where "now" sits in the rolling view

const peaksCache = new Map();
let audioCtx = null;

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

async function computePeaks(src) {
  if (peaksCache.has(src)) return peaksCache.get(src);
  const promise = (async () => {
    const res = await fetch(src);
    if (!res.ok) throw new Error('fetch failed');
    const buf = await res.arrayBuffer();
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const decoded = await audioCtx.decodeAudioData(buf);
    const data = decoded.getChannelData(0);
    const n = Math.max(1, Math.round(decoded.duration * BUCKETS_PER_SECOND));
    const per = Math.floor(data.length / n);
    const peaks = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let max = 0;
      const start = i * per;
      for (let j = start; j < start + per; j += 4) {   // stride 4: plenty for peaks
        const v = Math.abs(data[j]);
        if (v > max) max = v;
      }
      peaks[i] = max;
    }
    // normalize so quiet clips still draw visibly
    let top = 0;
    for (const v of peaks) if (v > top) top = v;
    if (top > 0) for (let i = 0; i < n; i++) peaks[i] = Math.min(1, peaks[i] / top);
    return { peaks, duration: decoded.duration };
  })();
  peaksCache.set(src, promise);
  promise.catch(() => peaksCache.delete(src));
  return promise;
}

export class Waveform {
  /** @param {HTMLCanvasElement} canvas */
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.data = null;      // {peaks, duration}
    this.audio = null;
    this._raf = null;
    this._brass = '#c8a24b';
    this._dim = '#3a352c';
    this._onTime = () => this.draw();
    new ResizeObserver(() => this.draw()).observe(canvas);
  }

  /** Point at a clip + the <audio> element that plays it. */
  async load(src, audio) {
    this._detach();
    this.audio = audio;
    audio.addEventListener('timeupdate', this._onTime);
    this._boundAudio = audio;
    this.data = null;
    this.draw(); // clears
    try {
      const data = await computePeaks(src);
      // a later load() may have superseded this one
      if (this._boundAudio === audio) { this.data = data; this.draw(); }
    } catch { /* no waveform — the game plays fine without it */ }
  }

  _detach() {
    if (this._boundAudio) this._boundAudio.removeEventListener('timeupdate', this._onTime);
    this._boundAudio = null;
    cancelAnimationFrame(this._raf);
  }

  /** Call while playing for smooth motion; timeupdate covers throttled tabs. */
  startTicking() {
    cancelAnimationFrame(this._raf);
    const step = () => {
      this.draw();
      if (this.audio && !this.audio.paused && !this.audio.ended) {
        this._raf = requestAnimationFrame(step);
      }
    };
    this._raf = requestAnimationFrame(step);
  }

  draw() {
    const { canvas, ctx } = this;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (!this.data) return;

    const { peaks, duration } = this.data;
    const t = this.audio ? Math.min(this.audio.currentTime, duration) : 0;
    const mid = h / 2;
    const barW = 2, gap = 1.5, step = barW + gap;
    const nBars = Math.floor(w / step);

    if (reducedMotion.matches) {
      // static: whole clip, brass fill up to the current position
      const playedBars = duration ? (t / duration) * nBars : 0;
      for (let i = 0; i < nBars; i++) {
        const p = peaks[Math.floor(i / nBars * peaks.length)] || 0;
        this._bar(i * step, mid, p, h, i <= playedBars ? this._brass : this._dim);
      }
      return;
    }

    // rolling: window centered on the playhead
    const windowStart = t - WINDOW_SECONDS * PLAYHEAD_FRACTION;
    const playheadX = Math.floor(nBars * PLAYHEAD_FRACTION) * step;
    for (let i = 0; i < nBars; i++) {
      const time = windowStart + (i / nBars) * WINDOW_SECONDS;
      if (time < 0 || time > duration) continue;
      const p = peaks[Math.floor(time * BUCKETS_PER_SECOND)] || 0;
      const x = i * step;
      this._bar(x, mid, p, h, x <= playheadX ? this._brass : this._dim);
    }
    // playhead
    ctx.fillStyle = 'rgba(237, 228, 211, 0.55)';
    ctx.fillRect(playheadX, 2, 1, h - 4);
  }

  _bar(x, mid, p, h, color) {
    const half = Math.max(1, p * (h / 2 - 3));
    this.ctx.fillStyle = color;
    this.ctx.fillRect(x, mid - half, 2, half * 2);
  }
}
