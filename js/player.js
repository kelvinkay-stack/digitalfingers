/* player.js - circular-arc audio player used by the game and the Learn demos. */

const CIRCUMFERENCE = 2 * Math.PI * 46; // matches r=46 in the SVG ring

export class ArcPlayer {
  /**
   * @param {object} opts
   * @param {HTMLButtonElement} opts.button  the circular play button
   * @param {SVGCircleElement}  opts.progress the progress arc
   * @param {(ev: string) => void} [opts.onState] 'play' | 'ended' | 'error'
   */
  constructor({ button, progress, onState }) {
    this.button = button;
    this.progress = progress;
    this.onState = onState || (() => {});
    this.audio = new Audio();
    this.audio.preload = 'auto';
    this._raf = null;

    this._bind(this.audio);
    button.addEventListener('click', () => this.play());
  }

  /** Point the player at a clip. Accepts a preloaded Audio to adopt. */
  load(src, preloaded) {
    this.stop();
    if (preloaded && preloaded.src.endsWith(encodeURI(src))) {
      this.audio = this._swap(preloaded);
    } else {
      this.audio.src = src;
    }
    this._setArc(0);
  }

  _bind(el) {
    el.addEventListener('ended', () => { this._stopTicker(true); this.onState('ended'); });
    el.addEventListener('error', () => { this._stopTicker(false); this.onState('error'); });
    // timeupdate keeps the arc honest even when rAF is throttled (hidden tab)
    el.addEventListener('timeupdate', () => {
      if (el === this.audio && el.duration && !el.paused) this._setArc(el.currentTime / el.duration);
    });
  }

  _swap(next) {
    // rebind listeners onto the adopted element
    this.audio.removeAttribute('src');
    this._bind(next);
    return next;
  }

  play() {
    if (this.button.disabled) return;
    this.audio.currentTime = 0;
    const p = this.audio.play();
    if (p) p.then(() => {
      this.onState('play');
      this._tick();
    }).catch(() => this.onState('error'));
  }

  stop() {
    this.audio.pause();
    this.audio.currentTime = 0;
    this._stopTicker(false);
  }

  get playing() { return !this.audio.paused && !this.audio.ended; }

  _tick() {
    cancelAnimationFrame(this._raf);
    const step = () => {
      const d = this.audio.duration;
      if (d && !this.audio.paused) this._setArc(this.audio.currentTime / d);
      if (!this.audio.paused && !this.audio.ended) this._raf = requestAnimationFrame(step);
    };
    this._raf = requestAnimationFrame(step);
  }

  _stopTicker(complete) {
    cancelAnimationFrame(this._raf);
    this._setArc(complete ? 1 : 0);
  }

  _setArc(fraction) {
    this.progress.style.strokeDashoffset = String(CIRCUMFERENCE * (1 - Math.min(1, fraction)));
    // hide the rounded line-cap dot when there's no progress to show
    this.progress.style.opacity = fraction > 0.001 ? '1' : '0';
  }
}

/** Kick off a background preload for the next round's clip. */
export function preload(src) {
  const a = new Audio();
  a.preload = 'auto';
  a.src = src;
  a.load();
  return a;
}
