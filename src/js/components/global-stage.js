/**
 * Global trade stage — an inset photo card expands into a full-bleed dark stage
 * while illustrative route lines draw across it, then the copy settles in.
 * Uses CSS sticky (no GSAP pin) inside a taller wrapper; scroll stays native.
 *
 * The routes are decorative (aria-hidden) and do not represent real operations.
 */
import { gsap } from '../gsap.js';
import { $, $$ } from '../utils/dom.js';
import { motionEnabled } from '../utils/env.js';

export function initGlobalStage(root) {
  if (!motionEnabled()) return;

  const wrap = $('[data-global-wrap]', root);
  const stage = $('[data-global-stage]', root);
  const media = $('[data-global-media]', root);
  const img = $('[data-global-img]', root);
  const routes = $$('[data-route]', root);
  const nodes = $$('[data-route-node]', root);
  const copy = $('[data-global-copy]', root);
  if (!wrap || !media) return;

  // Header contrast: the stage only reads as "dark" once the photo fills the top.
  const setTheme = (progress) => {
    const theme = progress > 0.3 ? 'dark' : 'light';
    if (stage.dataset.theme !== theme) stage.dataset.theme = theme;
  };
  stage.dataset.theme = 'light';

  const tl = gsap.timeline({
    defaults: { ease: 'none' },
    scrollTrigger: {
      trigger: wrap,
      start: 'top top',
      end: 'bottom bottom',
      scrub: 0.6,
      invalidateOnRefresh: true,
      onUpdate: (self) => setTheme(self.progress),
      onRefresh: (self) => setTheme(self.progress),
    },
  });

  tl.fromTo(media, { '--clip': 1 }, { '--clip': 0, duration: 0.45, ease: 'power2.inOut' }, 0)
    .fromTo(img, { scale: 1.22 }, { scale: 1, duration: 0.7 }, 0)
    .fromTo(routes, { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.4, stagger: 0.06, ease: 'power1.inOut' }, 0.3)
    .fromTo(nodes, { opacity: 0, scale: 0, transformOrigin: '50% 50%' }, { opacity: 1, scale: 1, duration: 0.12, stagger: 0.03 }, 0.62)
    .fromTo(copy, { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.25, ease: 'power2.out' }, 0.45)
    .to({}, { duration: 0.2 }); // hold the final composition before release
}
