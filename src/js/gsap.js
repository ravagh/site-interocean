/**
 * Single GSAP entry: registers plugins once and applies global defaults.
 * (GSAP and all its plugins are free for commercial use since v3.13.)
 */
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';

gsap.registerPlugin(ScrollTrigger, SplitText);

gsap.defaults({ ease: 'power3.out', duration: 1 });

// Mobile URL-bar show/hide shouldn't trigger full refreshes (avoids jumps).
ScrollTrigger.config({ ignoreMobileResize: true });

export { gsap, ScrollTrigger, SplitText };
