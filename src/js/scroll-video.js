/**
 * Scroll-scrubbed hero media.
 *
 * Three interchangeable strategies share one interface:
 *   init(): Promise<void>   resolves when the first frame is visible, rejects on failure
 *   setProgress(p)          0..1 — target position on the media timeline
 *   resize()                re-measure (canvas only)
 *   destroy()               remove DOM, listeners, timers and rAF loops
 *
 * Smoothing: each frame the displayed position moves a fraction of the remaining
 * distance (frame-rate independent), but the lag is hard-capped (maxLag) so the
 * media can never trail the real scroll position indefinitely.
 */
import { HERO } from './config.js';
import { clamp, frameLerpFactor, median } from './utils/dom.js';

/* ==========================================================================
   Video seeking
   ========================================================================== */
export class VideoScrubber {
  /**
   * @param {HTMLElement} container  .hero-media
   * @param {{ src: string, webm?: string, poster?: string, onSlow?: Function }} options
   */
  constructor(container, { src, webm, poster, onSlow } = {}) {
    this.container = container;
    this.src = src;
    this.webm = webm;
    this.poster = poster;
    this.onSlow = onSlow;

    this.video = null;
    this.duration = 0;
    this.ready = false;
    this.destroyed = false;

    this.target = 0;
    this.current = 0;
    this.pending = null; // seek requested while another one is in flight
    this.raf = 0;
    this.lastTs = 0;

    this.seekStartedAt = 0;
    this.seekWasBuffered = false;
    this.seekSamples = [];
    this.probeDone = false;
    this.watchdog = 0;

    this.tick = this.tick.bind(this);
    this.onSeeked = this.onSeeked.bind(this);
  }

  pickSource(video) {
    const mp4 = this.src && video.canPlayType('video/mp4; codecs="avc1.640029"');
    if (mp4) return this.src;
    if (this.webm && video.canPlayType('video/webm; codecs="vp9"')) return this.webm;
    return this.src || this.webm || '';
  }

  init() {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      this.video = video;
      video.className = 'hero-media__video';
      video.muted = true;
      video.defaultMuted = true;
      video.playsInline = true;
      video.setAttribute('muted', '');
      video.setAttribute('playsinline', '');
      video.setAttribute('webkit-playsinline', '');
      video.setAttribute('aria-hidden', 'true');
      video.setAttribute('tabindex', '-1');
      video.disablePictureInPicture = true;
      video.disableRemotePlayback = true;
      video.preload = 'auto';
      if (this.poster) video.poster = this.poster;

      const src = this.pickSource(video);
      if (!src) {
        reject(new Error('No playable hero video source'));
        return;
      }

      let settled = false;
      const fail = (reason) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        reject(reason instanceof Error ? reason : new Error(String(reason)));
      };

      const timeout = setTimeout(() => fail('Hero video load timeout'), HERO.loadTimeoutMs);

      video.addEventListener('error', () => fail(video.error ? `Media error ${video.error.code}` : 'Media error'), { once: true });

      video.addEventListener(
        'loadedmetadata',
        () => {
          this.duration = Number.isFinite(video.duration) ? video.duration : 0;
          if (!this.duration) {
            fail('Video has no usable duration');
            return;
          }
          // Prime the decoder: iOS Safari ignores preload and only buffers /
          // renders seeked frames after playback has started once. Muted +
          // inline playback is allowed without a user gesture.
          const playing = video.play();
          if (playing && typeof playing.then === 'function') {
            playing.then(() => video.pause()).catch(() => {});
          }
        },
        { once: true },
      );

      video.addEventListener(
        'loadeddata',
        () => {
          if (settled || this.destroyed) return;
          video.pause();
          settled = true;
          clearTimeout(timeout);
          this.ready = true;
          this.current = video.currentTime;
          video.addEventListener('seeked', this.onSeeked);
          this.container.classList.add('is-ready');
          this.kick();
          resolve();
        },
        { once: true },
      );

      video.src = src;
      this.container.appendChild(video);
      video.load();
    });
  }

  setProgress(progress) {
    // Stop just short of the end: seeking to `duration` can show a blank frame.
    this.target = clamp(progress) * Math.max(0, this.duration - 0.05);
    this.kick();
  }

  kick() {
    if (!this.ready || this.raf || this.destroyed) return;
    this.lastTs = performance.now();
    this.raf = requestAnimationFrame(this.tick);
  }

  tick(now) {
    this.raf = 0;
    if (this.destroyed) return;
    const dt = Math.min(64, Math.max(1, now - this.lastTs));
    this.lastTs = now;

    const diff = this.target - this.current;
    if (Math.abs(diff) < 0.002) {
      this.current = this.target;
    } else {
      this.current += diff * frameLerpFactor(HERO.smoothing, dt);
      const lag = this.target - this.current;
      if (Math.abs(lag) > HERO.maxLagSeconds) this.current = this.target - Math.sign(lag) * HERO.maxLagSeconds;
    }

    this.requestSeek(this.current);

    if (this.current !== this.target || this.pending !== null) {
      this.raf = requestAnimationFrame(this.tick);
    }
  }

  isBuffered(time) {
    const { buffered } = this.video;
    for (let i = 0; i < buffered.length; i += 1) {
      if (time >= buffered.start(i) && time <= buffered.end(i)) return true;
    }
    return false;
  }

  requestSeek(time) {
    const video = this.video;
    // Only one seek in flight: queue the latest target and wait for `seeked`.
    if (video.seeking && performance.now() - this.seekStartedAt < 1000) {
      this.pending = time;
      return;
    }
    if (Math.abs(video.currentTime - time) < HERO.seekEpsilon) {
      this.pending = null;
      return;
    }
    this.pending = null;
    this.seekStartedAt = performance.now();
    this.seekWasBuffered = this.isBuffered(time);
    video.currentTime = time;
  }

  onSeeked() {
    if (this.destroyed) return;
    const elapsed = performance.now() - this.seekStartedAt;
    if (this.seekWasBuffered && !this.probeDone) this.recordSample(elapsed);

    if (this.pending !== null) {
      const next = this.pending;
      this.pending = null;
      this.requestSeek(next);
    }
    this.kick();
  }

  /** Seek performance probe: only buffered seeks count (network waits are not decoder slowness). */
  recordSample(ms) {
    this.seekSamples.push(ms);
    if (this.seekSamples.length < HERO.probe.samples) return;
    this.probeDone = true;
    const m = median(this.seekSamples);
    if (m > HERO.probe.slowSeekMs && this.onSlow) this.onSlow({ medianMs: Math.round(m) });
  }

  resize() {}

  destroy() {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    if (this.video) {
      this.video.removeEventListener('seeked', this.onSeeked);
      this.video.pause();
      this.video.removeAttribute('src');
      this.video.load();
      this.video.remove();
    }
    this.container.classList.remove('is-ready');
  }
}

/* ==========================================================================
   Canvas image sequence
   ========================================================================== */
export class FrameScrubber {
  /** @param {HTMLElement} container @param {{ manifestUrl: string }} options */
  constructor(container, { manifestUrl } = {}) {
    this.container = container;
    this.manifestUrl = manifestUrl;
    this.canvas = null;
    this.ctx = null;
    this.frames = [];
    this.urls = [];
    this.count = 0;
    this.target = 0;
    this.current = 0;
    this.drawn = -1;
    this.raf = 0;
    this.lastTs = 0;
    this.destroyed = false;
    this.tick = this.tick.bind(this);
  }

  async init() {
    const res = await fetch(this.manifestUrl, { cache: 'force-cache' });
    if (!res.ok) throw new Error(`Frame manifest ${res.status}`);
    const manifest = await res.json();
    const base = this.manifestUrl.slice(0, this.manifestUrl.lastIndexOf('/') + 1);
    this.count = manifest.count;
    if (!this.count) throw new Error('Empty frame sequence');
    this.urls = Array.from({ length: this.count }, (_, i) => base + manifest.pattern.replace('{index}', String(i + 1).padStart(manifest.pad || 4, '0')));
    this.frames = new Array(this.count).fill(null);

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'hero-media__canvas';
    this.canvas.setAttribute('aria-hidden', 'true');
    this.ctx = this.canvas.getContext('2d', { alpha: false });
    this.container.appendChild(this.canvas);
    this.resize();

    await this.load(0);
    if (this.destroyed) return;
    this.draw(0);
    this.container.classList.add('is-ready');
    this.loadProgressively();
  }

  async load(index) {
    if (this.frames[index] || this.destroyed) return;
    const img = new Image();
    img.decoding = 'async';
    img.src = this.urls[index];
    await img.decode();
    this.frames[index] = img;
  }

  /** Coarse-to-fine order (every 16th, 8th, 4th…) so scrubbing works early. */
  async loadProgressively() {
    const order = [];
    const seen = new Set([0]);
    for (const stride of [16, 8, 4, 2, 1]) {
      for (let i = 0; i < this.count; i += stride) {
        if (!seen.has(i)) {
          seen.add(i);
          order.push(i);
        }
      }
    }
    const concurrency = 6;
    let cursor = 0;
    const worker = async () => {
      while (cursor < order.length && !this.destroyed) {
        const index = order[cursor++];
        try {
          await this.load(index);
          if (Math.abs(index - this.current) < 2) this.kick(true);
        } catch {
          /* a missing frame is skipped; nearest loaded frame is drawn instead */
        }
      }
    };
    await Promise.all(Array.from({ length: concurrency }, worker));
  }

  nearestLoaded(index) {
    if (this.frames[index]) return index;
    for (let d = 1; d < this.count; d += 1) {
      if (this.frames[index - d]) return index - d;
      if (this.frames[index + d]) return index + d;
    }
    return -1;
  }

  draw(index, force = false) {
    const i = this.nearestLoaded(index);
    if (i < 0 || (i === this.drawn && !force)) return;
    const img = this.frames[i];
    const { width: cw, height: ch } = this.canvas;
    const scale = Math.max(cw / img.naturalWidth, ch / img.naturalHeight);
    const w = img.naturalWidth * scale;
    const h = img.naturalHeight * scale;
    this.ctx.drawImage(img, (cw - w) / 2, (ch - h) * 0.45, w, h);
    this.drawn = i;
  }

  setProgress(progress) {
    this.target = clamp(progress) * (this.count - 1);
    this.kick();
  }

  kick(forceDraw = false) {
    if (forceDraw) this.draw(Math.round(this.current), true);
    if (this.raf || this.destroyed) return;
    this.lastTs = performance.now();
    this.raf = requestAnimationFrame(this.tick);
  }

  tick(now) {
    this.raf = 0;
    if (this.destroyed) return;
    const dt = Math.min(64, Math.max(1, now - this.lastTs));
    this.lastTs = now;
    const diff = this.target - this.current;
    if (Math.abs(diff) < 0.01) {
      this.current = this.target;
    } else {
      this.current += diff * frameLerpFactor(HERO.smoothing, dt);
      const lag = this.target - this.current;
      if (Math.abs(lag) > HERO.maxLagFrames) this.current = this.target - Math.sign(lag) * HERO.maxLagFrames;
    }
    this.draw(Math.round(this.current));
    if (this.current !== this.target) this.raf = requestAnimationFrame(this.tick);
  }

  resize() {
    if (!this.canvas) return;
    const rect = this.container.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.max(1, Math.round(rect.width * dpr));
    this.canvas.height = Math.max(1, Math.round(rect.height * dpr));
    this.drawn = -1;
    this.draw(Math.round(this.current), true);
  }

  destroy() {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    this.canvas?.remove();
    this.frames = [];
    this.container.classList.remove('is-ready');
  }
}

/* ==========================================================================
   Poster (fallback) — gentle scroll-linked push-in, no media download
   ========================================================================== */
export class PosterScrubber {
  constructor(container) {
    this.poster = container.querySelector('.hero-media__poster');
  }

  init() {
    return Promise.resolve();
  }

  setProgress(progress) {
    if (!this.poster) return;
    const p = clamp(progress);
    this.poster.style.transform = `scale(${(1.1 - 0.1 * p).toFixed(4)})`;
  }

  resize() {}

  destroy() {
    if (this.poster) this.poster.style.transform = '';
  }
}
