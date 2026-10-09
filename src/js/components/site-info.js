/**
 * Small site-wide helpers: current year, optional public email, inquiry deep links.
 */
import { FORM } from '../config.js';
import { $$ } from '../utils/dom.js';

export function initSiteInfo() {
  const year = String(new Date().getFullYear());
  $$('[data-year]').forEach((el) => (el.textContent = year));

  // Public email is shown only when configured (VITE_CONTACT_EMAIL).
  if (FORM.email) {
    $$('[data-contact-email]').forEach((el) => {
      el.hidden = false;
      const link = el.matches('a') ? el : el.querySelector('[data-contact-email-link]');
      if (link) {
        link.href = `mailto:${FORM.email}`;
        if (!link.textContent.trim()) link.textContent = FORM.email;
      }
    });
  }
}
