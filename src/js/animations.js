/**
 * Declarative motion system — driven by data attributes in the HTML:
 *
 *   data-reveal              fade + rise when entering the viewport (batched)
 *   data-reveal="mask"       clip-path wipe from bottom + image settles from 1.18 → 1
 *   data-reveal-stagger      children reveal one after another
 *   data-split               heading reveals line by line (GSAP SplitText, masked)
 *   data-parallax="<n>"      moves ±n % of its height across the viewport (scrub)
 *   data-parallax-bg         full-bleed background drifts slower than the page
 *   data-draw                SVG stroke draws once on enter (path needs pathLength="1")
 *
 * Initial states live in src/css/animations.css under `.motion`, so nothing is
 * hidden for visitors without JS or with reduced motion.
 */
import { gsap, ScrollTrigger, SplitText } from './gsap.js';
import { MOTION } from './config.js';
import { $$ } from './utils/dom.js';
import { motionEnabled } from './utils/env.js';

/** Once revealed, the CSS initial state no longer applies; inline styles are cleared. */
function markRevealed(el) {
  el.classList.add('is-revealed');
  gsap.set(el, { clearProps: 'opacity,transform' });
}

export function initAnimations(scope = document) {
  if (!motionEnabled()) return;
  initReveals(scope);
  initMasks(scope);
  initStaggers(scope);
  initSplits(scope);
  initParallax(scope);
  initBackgroundParallax(scope);
  initDraws(scope);
}

function initReveals(scope) {
  const items = $$('[data-reveal]:not([data-reveal="mask"])', scope);
  if (!items.length) return;
  ScrollTrigger.batch(items, {
    start: MOTION.revealStart,
    once: true,
    onEnter: (batch) =>
      gsap.to(batch, {
        opacity: 1,
        y: 0,
        duration: MOTION.duration,
        ease: MOTION.ease,
        stagger: MOTION.stagger,
        overwrite: true,
        onComplete: () => batch.forEach(markRevealed),
      }),
  });
}

function initMasks(scope) {
  $$('[data-reveal="mask"]', scope).forEach((el) => {
    const radius = getComputedStyle(el).borderTopLeftRadius || '0px';
    const img = el.querySelector('.media img');
    const tl = gsap.timeline({
      scrollTrigger: { trigger: el, start: 'top 88%', once: true },
      onComplete: () => {
        markRevealed(el);
        gsap.set(el, { clearProps: 'clipPath' });
        // Hand the image transform back to CSS (hover zoom).
        if (img) gsap.set(img, { clearProps: 'transform' });
      },
    });
    tl.fromTo(
      el,
      { clipPath: `inset(100% 0% 0% 0% round ${radius})` },
      { clipPath: `inset(0% 0% 0% 0% round ${radius})`, duration: 1.3, ease: 'expo.inOut' },
    );
    if (img) tl.fromTo(img, { scale: 1.18 }, { scale: 1, duration: 1.8, ease: 'expo.out' }, 0.15);
  });
}

function initStaggers(scope) {
  $$('[data-reveal-stagger]', scope).forEach((group) => {
    gsap.to(group.children, {
      opacity: 1,
      y: 0,
      duration: MOTION.duration,
      ease: MOTION.ease,
      stagger: 0.12,
      onComplete: () => Array.from(group.children).forEach(markRevealed),
      scrollTrigger: { trigger: group, start: MOTION.revealStart, once: true },
    });
  });
}

function initSplits(scope) {
  const headings = $$('[data-split]', scope);
  if (!headings.length) return;
  // Measure lines with the real webfont to avoid re-splitting after swap.
  const ready = document.fonts?.ready ?? Promise.resolve();
  ready.then(() => {
    headings.forEach((el) => {
      SplitText.create(el, {
        type: 'lines',
        mask: 'lines',
        linesClass: 'split-line',
        autoSplit: true,
        // Line-only split keeps words intact, so assistive tech reads the text
        // naturally; no aria-label (it is prohibited on <p> elements).
        aria: 'none',
        onSplit(self) {
          el.classList.add('is-split');
          return gsap.from(self.lines, {
            yPercent: 105,
            duration: 1.25,
            ease: MOTION.ease,
            stagger: 0.1,
            scrollTrigger: { trigger: el, start: 'top 88%', once: true },
          });
        },
      });
    });
  });
}

function initParallax(scope) {
  $$('[data-parallax]', scope).forEach((el) => {
    const amount = parseFloat(el.dataset.parallax) || 6;
    gsap.fromTo(
      el,
      { yPercent: -amount },
      {
        yPercent: amount,
        ease: 'none',
        scrollTrigger: { trigger: el.parentElement, start: 'top bottom', end: 'bottom top', scrub: true },
      },
    );
  });
}

/** Full-bleed hero photos drift slightly slower than the page (oversized to never show edges). */
function initBackgroundParallax(scope) {
  $$('[data-parallax-bg]', scope).forEach((el) => {
    gsap.fromTo(
      el,
      { yPercent: 0, scale: 1.08 },
      {
        yPercent: 12,
        scale: 1.08,
        ease: 'none',
        scrollTrigger: { trigger: el.parentElement, start: 'top top', end: 'bottom top', scrub: true },
      },
    );
  });
}

function initDraws(scope) {
  const svgs = new Set($$('[data-draw]', scope).map((path) => path.ownerSVGElement));
  svgs.forEach((svg) => {
    gsap.to(svg.querySelectorAll('[data-draw]'), {
      strokeDashoffset: 0,
      duration: 2.4,
      ease: 'power2.inOut',
      stagger: 0.18,
      scrollTrigger: { trigger: svg, start: 'top 80%', once: true },
    });
  });
}
