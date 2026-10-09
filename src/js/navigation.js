/**
 * Header & navigation
 *  - transparent over the hero, frosted once scrolled
 *  - hides while scrolling down (deep in the page), returns on scroll up
 *  - contrast follows the section underneath (any element with data-theme)
 *  - accessible mobile menu: dialog semantics, focus trap, Escape, focus return
 *  - global scroll progress bar
 */
import { $, $$, rafThrottle } from './utils/dom.js';
import { prefersReducedMotion } from './utils/env.js';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

export function initNavigation() {
  const header = $('[data-header]');
  if (!header) return;
  initHeaderState(header);
  initMobileMenu(header);
  initScrollProgress();
}

/* ---- Header state ------------------------------------------------------- */
function initHeaderState(header) {
  let lastY = window.scrollY;
  let theme = header.dataset.headerTheme;

  const sampleTheme = () => {
    // Look underneath the header's vertical centre for the nearest themed section.
    const y = header.offsetHeight / 2;
    const x = Math.round(window.innerWidth / 2);
    const stack = document.elementsFromPoint(x, y);
    for (const el of stack) {
      if (header.contains(el) || el.closest('.scroll-progress, .mobile-menu')) continue;
      const themed = el.closest('[data-theme]');
      if (themed) return themed.dataset.theme;
    }
    return 'light';
  };

  const update = () => {
    const y = window.scrollY;
    const scrolled = y > 24;
    header.classList.toggle('is-scrolled', scrolled);

    // Hide only well past the first screen, and never while the menu is open.
    const goingDown = y > lastY + 4;
    const goingUp = y < lastY - 4;
    const deep = y > window.innerHeight * 1.1;
    if (goingDown && deep && !document.body.classList.contains('is-locked')) header.classList.add('is-hidden');
    else if (goingUp || !deep) header.classList.remove('is-hidden');
    lastY = y;

    const next = sampleTheme();
    if (next !== theme) {
      theme = next;
      header.dataset.headerTheme = next;
    }
  };

  const onScroll = rafThrottle(update);
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  // Re-sample after layout-affecting animations settle (fonts, images, ScrollTrigger refresh).
  window.addEventListener('load', update);
  update();
}

/* ---- Mobile menu -------------------------------------------------------- */
function initMobileMenu(header) {
  const toggle = $('[data-menu-toggle]', header);
  const menu = $('[data-menu]');
  if (!toggle || !menu) return;
  const panel = $('[role="dialog"]', menu);
  const closeBtn = $('[data-menu-close]', menu);
  const background = [$('main'), $('.site-footer'), header].filter(Boolean);
  let isOpen = false;
  let closeTimer = 0;

  const focusables = () => $$(FOCUSABLE, panel).filter((el) => el.offsetParent !== null);

  const open = () => {
    if (isOpen) return;
    isOpen = true;
    clearTimeout(closeTimer);
    menu.hidden = false;
    // next frame: start the CSS transition from the closed state
    requestAnimationFrame(() => requestAnimationFrame(() => menu.classList.add('is-open')));
    toggle.setAttribute('aria-expanded', 'true');
    document.body.classList.add('is-locked');
    background.forEach((el) => el.setAttribute('inert', ''));
    setTimeout(() => closeBtn?.focus(), prefersReducedMotion() ? 0 : 120);
    document.addEventListener('keydown', onKeydown);
  };

  const close = ({ restoreFocus = true } = {}) => {
    if (!isOpen) return;
    isOpen = false;
    menu.classList.remove('is-open');
    toggle.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('is-locked');
    background.forEach((el) => el.removeAttribute('inert'));
    document.removeEventListener('keydown', onKeydown);
    closeTimer = setTimeout(() => (menu.hidden = true), prefersReducedMotion() ? 0 : 700);
    if (restoreFocus) toggle.focus();
  };

  function onKeydown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== 'Tab') return;
    const items = focusables();
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  toggle.addEventListener('click', () => (isOpen ? close() : open()));
  closeBtn?.addEventListener('click', () => close());

  // Navigating (incl. same-page anchors) closes the menu.
  $$('a', menu).forEach((a) => a.addEventListener('click', () => close({ restoreFocus: false })));

  // Leaving the mobile layout closes the menu.
  const desktop = window.matchMedia('(min-width: 1280px)');
  desktop.addEventListener('change', (e) => e.matches && close({ restoreFocus: false }));
}

/* ---- Scroll progress ---------------------------------------------------- */
function initScrollProgress() {
  const bar = $('[data-scroll-progress]');
  if (!bar) return;
  const update = rafThrottle(() => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const p = max > 0 ? window.scrollY / max : 0;
    bar.style.transform = `scaleX(${Math.min(1, Math.max(0, p)).toFixed(4)})`;
  });
  window.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update, { passive: true });
  update();
}
