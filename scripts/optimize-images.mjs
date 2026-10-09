#!/usr/bin/env node
/**
 * Responsive image pipeline.
 *
 *   npm run images
 *
 * Reads every JPG/PNG/WebP/AVIF/TIFF in `assets-src/images/` and writes to
 * `public/assets/images/`:
 *   <name>-<width>.avif / <name>-<width>.webp   for each width in WIDTHS (≤ source width)
 *   manifest.json                                dimensions, widths, average color, LQIP
 *
 * The Vite site plugin reads manifest.json to render <picture> elements with
 * srcset/sizes, intrinsic width/height (no layout shift) and a blurred LQIP.
 *
 * `hero-poster` is additionally exported as /assets/images/hero-poster.webp and
 * .avif (fixed names), so the poster can be preloaded and used by the video.
 *
 * To swap an image, drop a new file with the same base name into
 * assets-src/images/ and run `npm run images` again.
 */
import sharp from 'sharp';
import { readdirSync, mkdirSync, writeFileSync, existsSync, readFileSync, unlinkSync } from 'node:fs';
import { resolve, dirname, join, parse } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = join(root, 'assets-src/images');
const outDir = join(root, 'public/assets/images');
const manifestPath = join(outDir, 'manifest.json');

const WIDTHS = [640, 1024, 1600, 2400];
const AVIF = { quality: 52, effort: 5 };
const WEBP = { quality: 74, effort: 5 };
const FIXED_NAME_WIDTH = { 'hero-poster': 1920, 'hero-poster-mobile': 1080 };

mkdirSync(outDir, { recursive: true });

const files = readdirSync(srcDir).filter((f) => /\.(jpe?g|png|webp|avif|tiff?)$/i.test(f));
const previous = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : {};
const manifest = {};

// Remove generated files for images that no longer exist in the source folder.
const sourceNames = new Set(files.map((f) => parse(f).name));
for (const name of Object.keys(previous)) {
  if (sourceNames.has(name)) continue;
  for (const w of previous[name].widths || []) {
    for (const ext of ['avif', 'webp']) {
      const p = join(outDir, `${name}-${w}.${ext}`);
      if (existsSync(p)) unlinkSync(p);
    }
  }
}

for (const file of files) {
  const name = parse(file).name;
  const input = sharp(join(srcDir, file), { failOn: 'none' }).rotate();
  const meta = await input.metadata();
  const srcW = meta.autoOrient?.width ?? meta.width;
  const srcH = meta.autoOrient?.height ?? meta.height;

  const widths = WIDTHS.filter((w) => w <= srcW);
  if (!widths.length || widths[widths.length - 1] < srcW && srcW < WIDTHS[WIDTHS.length - 1]) widths.push(srcW);

  for (const w of widths) {
    const resized = input.clone().resize({ width: w, withoutEnlargement: true });
    await resized.clone().avif(AVIF).toFile(join(outDir, `${name}-${w}.avif`));
    await resized.clone().webp(WEBP).toFile(join(outDir, `${name}-${w}.webp`));
  }

  if (FIXED_NAME_WIDTH[name]) {
    const w = Math.min(FIXED_NAME_WIDTH[name], srcW);
    const resized = input.clone().resize({ width: w });
    await resized.clone().webp({ ...WEBP, quality: 70 }).toFile(join(outDir, `${name}.webp`));
    await resized.clone().avif(AVIF).toFile(join(outDir, `${name}.avif`));
  }

  const { dominant } = await input.clone().stats();
  const lqipBuf = await input.clone().resize({ width: 24 }).blur(1.2).webp({ quality: 40 }).toBuffer();
  const hex = (n) => n.toString(16).padStart(2, '0');

  manifest[name] = {
    width: srcW,
    height: srcH,
    widths,
    color: `#${hex(dominant.r)}${hex(dominant.g)}${hex(dominant.b)}`,
    lqip: `data:image/webp;base64,${lqipBuf.toString('base64')}`,
  };
  console.log(`✔ ${name.padEnd(32)} ${srcW}×${srcH} → ${widths.join(', ')}`);
}

writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

// Open Graph image (1200×630): hero poster + Ocean scrim + official negative logo.
const posterSrc = files.find((f) => parse(f).name === 'hero-poster');
const logoCandidates = ['logo-negative.svg', 'logo-negative.png'].map((f) => join(root, 'public/assets/logos', f));
const logoPath = logoCandidates.find((p) => existsSync(p));
if (posterSrc && logoPath) {
  const W = 1200;
  const H = 630;
  const scrim = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#0c1c36" stop-opacity="0.88"/><stop offset="0.7" stop-color="#0c1c36" stop-opacity="0.35"/><stop offset="1" stop-color="#0c1c36" stop-opacity="0.2"/></linearGradient><linearGradient id="b" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#FF8200"/><stop offset="0.42" stop-color="#F3D2B0"/><stop offset="0.56" stop-color="#D8ECF7"/><stop offset="1" stop-color="#8DC8E8"/></linearGradient></defs><rect width="${W}" height="${H}" fill="url(#g)"/><rect y="${H - 8}" width="${W}" height="8" fill="url(#b)"/></svg>`,
  );
  const logo = await sharp(logoPath, { density: 300 }).resize({ width: 520 }).png().toBuffer();
  await sharp(join(srcDir, posterSrc))
    .resize(W, H, { fit: 'cover', position: 'centre' })
    .composite([{ input: scrim }, { input: logo, left: 72, top: Math.round(H * 0.66) }])
    .jpeg({ quality: 84, mozjpeg: true })
    .toFile(join(outDir, 'og-image.jpg'));
  console.log('✔ og-image.jpg (1200×630)');
}
console.log(`\nManifest written: public/assets/images/manifest.json (${files.length} images)`);
