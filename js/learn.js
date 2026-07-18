/* learn.js - A/B demo widgets on the Learn page.
   One shared audio element; pressing a demo button swaps the source, so
   comparisons stay honest (same output path, no overlapping audio). */

const audio = new Audio();
audio.preload = 'none';

let activeBtn = null;
let activeBar = null;
let raf = null;

function stop() {
  audio.pause();
  cancelAnimationFrame(raf);
  if (activeBtn) {
    activeBtn.classList.remove('is-playing');
    activeBtn.setAttribute('aria-pressed', 'false');
  }
  if (activeBar) activeBar.style.width = '0';
  activeBtn = null;
  activeBar = null;
}

function tick() {
  if (activeBar && audio.duration) {
    activeBar.style.width = `${100 * audio.currentTime / audio.duration}%`;
  }
  if (!audio.paused && !audio.ended) raf = requestAnimationFrame(tick);
}

/* timeupdate keeps the bar honest even when rAF is throttled (hidden tab) */
audio.addEventListener('timeupdate', () => {
  if (activeBar && audio.duration) {
    activeBar.style.width = `${100 * audio.currentTime / audio.duration}%`;
  }
});
audio.addEventListener('ended', stop);
audio.addEventListener('error', () => {
  if (activeBtn) activeBtn.classList.remove('is-playing');
  stop();
});

for (const btn of document.querySelectorAll('.ab-btn')) {
  btn.addEventListener('click', () => {
    const src = btn.dataset.src;
    if (activeBtn === btn) { stop(); return; }  // toggle off
    stop();
    activeBtn = btn;
    activeBar = btn.closest('.ab-demo').querySelector('.ab-progress i');
    audio.src = src;
    audio.play().then(() => {
      btn.classList.add('is-playing');
      btn.setAttribute('aria-pressed', 'true');
      raf = requestAnimationFrame(tick);
    }).catch(stop);
  });
}

/* stop playback when the page is hidden */
document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
