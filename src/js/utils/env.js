/** Environment & capability helpers. */

const mq = (query) => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query) : { matches: false, addEventListener() {}, removeEventListener() {} });

export const reducedMotionQuery = mq('(prefers-reduced-motion: reduce)');

/** True when the visitor asked for reduced motion (live value). */
export const prefersReducedMotion = () => reducedMotionQuery.matches;

/** `.motion` is set in <head> before first paint; it's the single source of truth for scroll animations. */
export const motionEnabled = () => document.documentElement.classList.contains('motion') && !prefersReducedMotion();

export const matches = (query) => mq(query).matches;

/** Data-saver or very slow connections should not download heavy hero media. */
export function isConstrainedConnection() {
  const c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (!c) return false;
  return Boolean(c.saveData) || /(^|-)2g$/.test(c.effectiveType || '');
}

export const isCoarsePointer = () => matches('(pointer: coarse)');
