/**
 * Products hero — a floating image preview follows the pointer while hovering
 * the category index. Purely decorative (aria-hidden); only enabled for fine
 * pointers with hover and when motion is allowed. Links work normally without it.
 */
import { gsap } from '../gsap.js';
import { $, $$ } from '../utils/dom.js';
import { motionEnabled, matches } from '../utils/env.js';

export function initCategoryPreview(root) {
  if (!motionEnabled() || !matches('(hover: hover) and (pointer: fine)')) return;
  const preview = $('[data-category-preview]', root);
  const items = $$('[data-preview]', root);
  if (!preview || !items.length) return;
  const images = $$('.media', preview);

  gsap.set(preview, { xPercent: -50, yPercent: -50, x: 0, y: 0, scale: 0.85 });
  const moveX = gsap.quickTo(preview, 'x', { duration: 0.6, ease: 'power3.out' });
  const moveY = gsap.quickTo(preview, 'y', { duration: 0.6, ease: 'power3.out' });
  let current = -1;

  const show = (index) => {
    if (index !== current) {
      images[current]?.classList.remove('is-current');
      images[index]?.classList.add('is-current');
      current = index;
    }
    preview.classList.add('is-visible');
    gsap.to(preview, { scale: 1, duration: 0.5, ease: 'expo.out', overwrite: 'auto' });
  };

  const hide = () => {
    preview.classList.remove('is-visible');
    gsap.to(preview, { scale: 0.85, duration: 0.4, ease: 'power2.out', overwrite: 'auto' });
  };

  root.addEventListener('pointermove', (event) => {
    const rect = root.getBoundingClientRect();
    // Offset to the right of the cursor so the label stays readable.
    moveX(event.clientX - rect.left + 180);
    moveY(event.clientY - rect.top);
  });

  items.forEach((item) => {
    const index = Number(item.dataset.preview);
    item.addEventListener('pointerenter', () => show(index));
    item.addEventListener('pointerleave', hide);
  });
}
