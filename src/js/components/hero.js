/**
 * Home hero — strategy selection, scroll choreography and graceful fallback.
 *
 * Fallback chain: video → frames (if available) → poster.
 * Reduced motion (or no JS): static hero, nothing scrubbed, no extended scroll.
 */
import { gsap, ScrollTrigger } from '../gsap.js';
import { HERO } from '../config.js';
import { VideoScrubber, FrameScrubber, PosterScrubber } from '../scroll-video.js';
import { $, $$, clamp, debounce } from '../utils/dom.js';
import { motionEnabled, matches, isConstrainedConnection } from '../utils/env.js';

let instance = null; // guard against double initialisation

function afterLoadIdle(callback) {
  const idle = () => (window.requestIdleCallback ? requestIdleCallback(callback, { timeout: 1500 }) : setTimeout(callback, 200));
  if (document.readyState === 'complete') idle();
  else window.addEventListener('load', idle, { once: true });
}

export function initHero(root) {
  if (instance) return instance;
  instance = new Hero(root);
  return instance;
}

class Hero {
  constructor(root) {
    this.root = root;
    this.track = $('[data-hero-track]', root);
    this.stage = $('[data-hero-stage]', root);
    this.mediaEl = $('[data-hero-media]', root);
    this.content = $('[data-hero-content]', root);
    this.inner = $('.hero__inner', root);
    this.cats = $$('[data-hero-cat]', root);
    this.progressBar = $('[data-hero-progress]', root);
    this.next = root.nextElementSibling;

    this.scrubber = null;
    this.strategy = 'static';
    this.triggers = [];
    this.timeline = null;
    this.progress = 0;
    this.activeCat = -1;

    this.onResize = debounce(() => this.scrubber?.resize(), 150);

    if (!motionEnabled() || !this.track || !this.mediaEl) return;

    this.setupScroll();
    this.selectStrategy();
    window.addEventListener('resize', this.onResize);
  }

  // The entrance animation is pure CSS (src/css/animations.css) so it starts at
  // first paint without waiting for this module.

  /* ---- Strategy -------------------------------------------------------- */
  selectStrategy() {
    const ds = this.mediaEl.dataset;
    const portrait = matches(HERO.portraitQuery);
    const video = portrait && ds.videoMobile ? ds.videoMobile : ds.video;
    const available = {
      video: Boolean(video || ds.videoWebm),
      frames: Boolean(ds.frames),
    };

    let wanted = HERO.strategy;
    if (isConstrainedConnection()) wanted = 'poster';
    if (wanted === 'auto') wanted = available.video ? 'video' : available.frames ? 'frames' : 'poster';
    if (wanted === 'video' && !available.video) wanted = available.frames ? 'frames' : 'poster';
    if (wanted === 'frames' && !available.frames) wanted = 'poster';

    this.available = available;
    this.videoSrc = video;

    // Heavy media must not compete with critical resources: the poster covers
    // the hero until the page has loaded and the main thread is idle.
    if (wanted === 'poster') this.use('poster');
    else afterLoadIdle(() => this.use(wanted));
  }

  async use(strategy) {
    this.scrubber?.destroy();
    this.strategy = strategy;
    this.root.dataset.heroStrategy = strategy;
    this.applyScrubLength();

    const ds = this.mediaEl.dataset;
    if (strategy === 'video') {
      this.scrubber = new VideoScrubber(this.mediaEl, {
        src: this.videoSrc,
        webm: ds.videoWebm,
        poster: ds.poster,
        onSlow: (info) => this.degrade(`slow seeking (${info.medianMs}ms median)`),
      });
    } else if (strategy === 'frames') {
      this.scrubber = new FrameScrubber(this.mediaEl, { manifestUrl: ds.frames });
    } else {
      this.scrubber = new PosterScrubber(this.mediaEl);
    }

    const scrubber = this.scrubber;
    try {
      await scrubber.init();
      if (scrubber !== this.scrubber) return; // replaced meanwhile
      scrubber.setProgress(this.progress);
    } catch (error) {
      if (scrubber !== this.scrubber) return;
      console.warn(`[hero] ${strategy} unavailable — ${error.message}. Falling back.`);
      this.degrade(error.message);
    }
  }

  degrade(reason) {
    const next = this.strategy === 'video' && this.available.frames ? 'frames' : this.strategy === 'poster' ? null : 'poster';
    if (!next) return;
    if (import.meta.env.DEV) console.info(`[hero] switching ${this.strategy} → ${next} (${reason})`);
    this.use(next);
  }

  /** Scroll distance depends on the strategy: a static poster deserves less scrolling. */
  applyScrubLength() {
    const mobile = matches(HERO.mobileQuery);
    const factor = this.strategy === 'poster' ? HERO.scrub.poster : mobile ? HERO.scrub.mobile : HERO.scrub.desktop;
    const value = `${Math.round(factor * 100)}svh`;
    // CSS already ships the default lengths; only re-measure when it changes.
    if (getComputedStyle(document.body).getPropertyValue('--hero-scrub').trim() === value) return;
    document.body.style.setProperty('--hero-scrub', value);
    ScrollTrigger.refresh();
  }

  /* ---- Scroll ------------------------------------------------------------ */
  overlapPx() {
    if (!this.next) return 0;
    return Math.max(0, -parseFloat(getComputedStyle(this.next).marginTop) || 0);
  }

  /** Pixels of scroll mapped to the media timeline (measured from real layout). */
  scrubPx() {
    return Math.max(1, this.track.offsetHeight - this.stage.offsetHeight - this.overlapPx());
  }

  setupScroll() {
    // 1) Media + panel + progress: raw progress (media applies its own capped smoothing)
    this.triggers.push(
      ScrollTrigger.create({
        trigger: this.track,
        start: 'top top',
        end: () => `+=${this.scrubPx()}`,
        invalidateOnRefresh: true,
        onUpdate: (self) => this.update(self.progress),
        onRefresh: (self) => this.update(self.progress),
      }),
    );

    // 2) Typography & scrim choreography (GSAP-smoothed scrub)
    this.timeline = gsap.timeline({
      defaults: { ease: 'none' },
      scrollTrigger: {
        trigger: this.track,
        start: 'top top',
        end: () => `+=${this.scrubPx()}`,
        scrub: 0.6,
        invalidateOnRefresh: true,
      },
    });
    this.timeline
      .to(this.content, { y: () => -window.innerHeight * 0.07, duration: 1 }, 0)
      // Full-strength scrim while text is on screen; it lifts as the text leaves.
      .to(this.inner, { opacity: 0, duration: 0.22, ease: 'power1.in' }, 0.74)
      .to(this.stage, { '--scrim': 0.45, duration: 0.26 }, 0.74);

    // 3) Overlap phase: the next section slides over; deepen the stage slightly
    this.triggers.push(
      ScrollTrigger.create({
        trigger: this.track,
        start: () => `top+=${this.scrubPx()} top`,
        end: 'bottom top',
        scrub: true,
        invalidateOnRefresh: true,
        animation: gsap.fromTo(this.stage, { '--veil': 0 }, { '--veil': 0.5, ease: 'none' }),
      }),
    );
  }

  update(progress) {
    this.progress = progress;
    this.scrubber?.setProgress(progress);
    if (this.progressBar) this.progressBar.style.transform = `scaleX(${progress.toFixed(4)})`;

    // Trading-interests panel follows the sequence: one category per quarter.
    const n = this.cats.length;
    if (!n) return;
    const active = Math.min(n - 1, Math.floor(progress * n));
    this.cats.forEach((li, i) => li.style.setProperty('--cat-progress', clamp(progress * n - i).toFixed(3)));
    if (active !== this.activeCat) {
      this.cats[this.activeCat]?.classList.remove('is-active');
      this.cats[active].classList.add('is-active');
      this.activeCat = active;
    }
  }

  destroy() {
    window.removeEventListener('resize', this.onResize);
    this.triggers.forEach((t) => t.kill());
    this.timeline?.scrollTrigger?.kill();
    this.timeline?.kill();
    this.scrubber?.destroy();
    instance = null;
  }
}
