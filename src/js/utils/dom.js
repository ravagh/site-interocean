/** Small DOM & math helpers. */

export const $ = (selector, scope = document) => scope.querySelector(selector);
export const $$ = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));

export const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
export const lerp = (a, b, t) => a + (b - a) * t;

/** Maps `value` from [inMin, inMax] to [0, 1], clamped. */
export const progressBetween = (value, inMin, inMax) => clamp((value - inMin) / (inMax - inMin));

/** Frame-rate independent smoothing factor for a per-60fps-frame `factor`. */
export const frameLerpFactor = (factor, deltaMs) => 1 - Math.pow(1 - factor, deltaMs / (1000 / 60));

export function debounce(fn, wait = 150) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

/** Runs `fn` at most once per animation frame. */
export function rafThrottle(fn) {
  let frame = 0;
  let lastArgs;
  const throttled = (...args) => {
    lastArgs = args;
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      fn(...lastArgs);
    });
  };
  throttled.cancel = () => cancelAnimationFrame(frame);
  return throttled;
}

/** Returns a function that removes every listener registered through `on`. */
export function createListenerBag() {
  const removers = [];
  return {
    on(target, type, handler, options) {
      target.addEventListener(type, handler, options);
      removers.push(() => target.removeEventListener(type, handler, options));
    },
    removeAll() {
      while (removers.length) removers.pop()();
    },
  };
}

export function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
