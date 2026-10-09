/**
 * Inter Ocean — application entry.
 *
 * Essential UI (navigation, footer helpers) runs immediately. Page modules are
 * code-split and only loaded when their markup exists on the page. Motion
 * modules are skipped entirely for visitors who prefer reduced motion.
 */
import { initNavigation } from './navigation.js';
import { initSiteInfo } from './components/site-info.js';
import { $ } from './utils/dom.js';
import { motionEnabled, reducedMotionQuery } from './utils/env.js';

const html = document.documentElement;

initNavigation();
initSiteInfo();

async function boot() {
  const jobs = [];

  if (motionEnabled()) {
    jobs.push(import('./animations.js').then((m) => m.initAnimations()));
  }

  const hero = $('[data-hero]');
  if (hero) jobs.push(import('./components/hero.js').then((m) => m.initHero(hero)));

  const approach = $('[data-approach]');
  if (approach) jobs.push(import('./components/approach.js').then((m) => m.initApproach(approach)));

  const globalStage = $('[data-global]');
  if (globalStage) jobs.push(import('./components/global-stage.js').then((m) => m.initGlobalStage(globalStage)));

  const categoryIndex = $('[data-category-index]');
  if (categoryIndex) jobs.push(import('./components/category-preview.js').then((m) => m.initCategoryPreview(categoryIndex)));

  const form = $('[data-contact-form]');
  if (form) jobs.push(import('./forms.js').then((m) => m.initContactForm(form)));

  const results = await Promise.allSettled(jobs);
  const failed = results.filter((r) => r.status === 'rejected');
  if (failed.length) {
    // Never leave content hidden behind a motion state that can't complete.
    html.classList.remove('motion');
    failed.forEach((r) => console.error('[boot]', r.reason));
  }
  window.__interOceanReady = true;
  // (ScrollTrigger refreshes itself on window load — no extra refresh needed.)
}

boot();

/* If the visitor turns on "reduce motion" while browsing, go static immediately. */
reducedMotionQuery.addEventListener?.('change', async (event) => {
  if (!event.matches || !html.classList.contains('motion')) return;
  html.classList.remove('motion');
  const { gsap, ScrollTrigger } = await import('./gsap.js');
  ScrollTrigger.getAll().forEach((t) => t.kill(true));
  gsap.globalTimeline.clear();
  gsap.set('[data-reveal], [data-reveal-stagger] > *, [data-split], [data-hero-line], [data-hero-intro], [data-hero-panel], .hero__inner, [data-hero-content], [data-global-copy], [data-approach-step]', {
    clearProps: 'all',
  });
});
