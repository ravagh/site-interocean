/**
 * Central configuration — breakpoints, motion constants, hero media, forms.
 * CSS mirrors the breakpoints and timings in src/css/tokens.css.
 */

export const BREAKPOINTS = {
  sm: 480,
  md: 768,
  lg: 1024,
  nav: 1280,
  xl: 1280,
  xxl: 1600,
};

export const MOTION = {
  ease: 'expo.out',
  easeSoft: 'power3.out',
  easeInOut: 'power2.inOut',
  duration: 1.1,
  durationFast: 0.6,
  stagger: 0.08,
  revealOffset: 28, // px — matches the CSS initial state
  revealStart: 'top 86%',
};

/**
 * Hero scroll-scrubbing.
 *
 * strategy:
 *   'auto'   video if available → frame sequence if available → poster
 *   'video'  force <video> seeking (falls back to poster on failure)
 *   'frames' force the Canvas image sequence (public/assets/frames/hero/)
 *   'poster' static poster with a light scroll-linked zoom
 *
 * Media file paths are injected by the build (only files that exist).
 */
export const HERO = {
  strategy: 'auto',

  /** Scroll distance (in viewport heights) mapped to the media timeline. */
  scrub: { desktop: 2.1, mobile: 1.5, poster: 0.9 },

  /**
   * Smoothing: fraction of the remaining distance covered per 60fps frame.
   * Higher = snappier. Lag is additionally capped by maxLag so the media can
   * never trail the scroll position indefinitely.
   */
  smoothing: 0.16,
  maxLagSeconds: 0.3,
  maxLagFrames: 6,

  /** Ignore seeks smaller than this (seconds) — avoids redundant decoder work. */
  seekEpsilon: 1 / 60,

  /** Give up on media that hasn't produced metadata in this time (poster stays). */
  loadTimeoutMs: 12000,

  /**
   * Seek performance probe. After `samples` seeks inside already-buffered
   * ranges, if the median seek time exceeds `slowSeekMs` the controller
   * degrades (video → frames when available, otherwise → poster).
   */
  probe: { samples: 8, slowSeekMs: 180 },

  /** Viewports that use the portrait mobile encode (if present). */
  portraitQuery: '(max-aspect-ratio: 4/5)',

  /** Treated as "mobile" for scroll distance and conservative defaults. */
  mobileQuery: '(max-width: 767px)',
};

/**
 * Contact form. Values come from Vite env variables (see .env.example):
 *   VITE_FORM_ENDPOINT  — POST JSON endpoint (serverless function, Formspree, etc.)
 *   VITE_CONTACT_EMAIL  — optional public business email shown as an alternative
 */
export const FORM = {
  endpoint: (import.meta.env.VITE_FORM_ENDPOINT || '').trim(),
  email: (import.meta.env.VITE_CONTACT_EMAIL || '').trim(),
  timeoutMs: 15000,
};
