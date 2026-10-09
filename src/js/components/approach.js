/**
 * Business approach — a continuous line (wave on desktop, rail on mobile)
 * progresses with scroll; each step lights up and reveals as the line reaches it.
 * The scroll distance is the section's natural height: no pinning, no extra scroll.
 */
import { gsap, ScrollTrigger } from '../gsap.js';
import { $, $$ } from '../utils/dom.js';
import { motionEnabled } from '../utils/env.js';

export function initApproach(root) {
  const steps = $$('[data-approach-step]', root);
  const path = $('[data-approach-path]', root);
  const rail = $('[data-approach-rail]', root);

  if (!motionEnabled()) {
    steps.forEach((s) => s.classList.add('is-active', 'is-revealed'));
    return;
  }

  const revealed = new Set();
  const reveal = (step) => {
    if (revealed.has(step)) return;
    revealed.add(step);
    gsap.to(step, {
      opacity: 1,
      y: 0,
      duration: 1,
      ease: 'expo.out',
      onComplete: () => {
        step.classList.add('is-revealed');
        gsap.set(step, { clearProps: 'opacity,transform' });
      },
    });
  };

  // Thresholds where the line reaches each step (desktop nodes sit at 0, 1/3, 2/3).
  const thresholds = steps.map((_, i) => (i / steps.length) * 0.98 + 0.01);

  const update = (progress) => {
    steps.forEach((step, i) => {
      const reached = progress >= thresholds[i];
      step.classList.toggle('is-active', reached);
      if (reached) reveal(step);
    });
  };

  const mm = gsap.matchMedia();

  mm.add('(min-width: 1024px)', () => {
    const tween = gsap.fromTo(path, { strokeDashoffset: 1 }, { strokeDashoffset: 0, ease: 'none' });
    ScrollTrigger.create({
      trigger: root,
      start: 'top 78%',
      end: 'bottom 62%',
      scrub: 0.5,
      animation: tween,
      onUpdate: (self) => update(self.progress),
      onRefresh: (self) => update(self.progress),
    });
  });

  mm.add('(max-width: 1023px)', () => {
    const tween = gsap.fromTo(rail, { '--rail': 0 }, { '--rail': 1, ease: 'none' });
    ScrollTrigger.create({
      trigger: root,
      start: 'top 70%',
      end: 'bottom 55%',
      scrub: 0.4,
      animation: tween,
      onUpdate: (self) => update(self.progress * 1.02),
      onRefresh: (self) => update(self.progress * 1.02),
    });
  });

  return () => mm.revert();
}
