import { defineConfig, loadEnv } from 'vite';
import { resolve } from 'node:path';
import sitePlugin from './plugins/vite-plugin-site.js';

/** Every static route of the site. `path` is used for the sitemap. */
const pages = [
  { name: 'home', file: 'index.html', path: '/', priority: 1.0 },
  { name: 'about', file: 'about/index.html', path: '/about/' },
  { name: 'products', file: 'products/index.html', path: '/products/' },
  { name: 'global-trade', file: 'global-trade/index.html', path: '/global-trade/' },
  { name: 'business', file: 'business/index.html', path: '/business/' },
  { name: 'contact', file: 'contact/index.html', path: '/contact/' },
  { name: 'credits', file: 'credits/index.html', path: '/credits/', noindex: true },
  { name: 'not-found', file: '404.html', path: '/404.html', noindex: true },
];

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  return {
    appType: 'mpa',
    plugins: [sitePlugin({ siteUrl: env.VITE_SITE_URL || 'https://www.interoceanco.com', pages })],
    build: {
      target: 'es2020',
      // Hashed bundles live in /_build/ (cached forever); /assets/ holds the
      // replaceable, un-hashed media from public/ (shorter cache, see vercel.json).
      assetsDir: '_build',
      cssMinify: true,
      assetsInlineLimit: 2048,
      rolldownOptions: {
        input: Object.fromEntries(pages.map((p) => [p.name, resolve(import.meta.dirname, p.file)])),
      },
    },
    server: { port: 5173, host: true },
    preview: { port: 4173, host: true },
  };
});
