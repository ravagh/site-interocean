#!/usr/bin/env node
/**
 * Hero media pipeline — prepares a source clip for scroll-scrubbing.
 *
 * Usage:
 *   npm run hero:encode -- <input-video> [options]
 *
 * Options:
 *   --start <s>        Start time in the source clip (default 0)
 *   --duration <s>     Length of the segment to keep (default: whole clip)
 *   --fps <n>          Output frame rate (default 20 — plenty for scrubbing)
 *   --width <px>       Desktop output width (default 1920)
 *   --crf <n>          H.264 quality, lower = better/larger (default 29)
 *   --gop <n>          Keyframe interval in frames (default 8). Small GOPs make
 *                      seeking fast and precise — essential for scrubbing.
 *   --mobile-x <0..1>  Horizontal focus of the portrait (mobile) crop (default 0.5)
 *   --webm             Also encode a VP9 WebM (optional, slower)
 *   --frames <n>       Also export an image sequence of n frames (Canvas strategy)
 *   --frame-width <px> Width of exported frames (default 1280)
 *   --no-mobile        Skip the portrait mobile encode
 *
 * Outputs:
 *   public/assets/videos/hero-scroll.mp4          H.264 (default 1920px), no audio, faststart
 *   public/assets/videos/hero-scroll-mobile.mp4   720x1280 portrait crop (optional)
 *   public/assets/videos/hero-scroll.webm         VP9 (with --webm)
 *   assets-src/images/hero-poster.jpg             first frame (run `npm run images` after)
 *   assets-src/images/hero-poster-mobile.jpg      first frame, portrait crop
 *   public/assets/frames/hero/frame-0001.webp …   with --frames, plus manifest.json
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, existsSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ffmpegPath from 'ffmpeg-static';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const VALUE_OPTIONS = ['--start', '--duration', '--fps', '--width', '--crf', '--gop', '--mobile-x', '--frames', '--frame-width'];
const input = args.find((a, i) => !a.startsWith('--') && !VALUE_OPTIONS.includes(args[i - 1]));

const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const flag = (name) => args.includes(`--${name}`);

if (!input || !existsSync(input)) {
  console.error('Usage: npm run hero:encode -- <input-video> [--start 0] [--duration 12] [--frames 120]');
  process.exit(1);
}

const start = Number(opt('start', 0));
const duration = opt('duration', null);
const fps = Number(opt('fps', 20));
const width = Number(opt('width', 1920));
const crf = Number(opt('crf', 29));
const gop = Number(opt('gop', 8));
const mobileX = Math.min(1, Math.max(0, Number(opt('mobile-x', 0.5))));
const frames = Number(opt('frames', 0));
const frameWidth = Number(opt('frame-width', 1280));

const videosDir = join(root, 'public/assets/videos');
const srcImagesDir = join(root, 'assets-src/images');
const framesDir = join(root, 'public/assets/frames/hero');
mkdirSync(videosDir, { recursive: true });
mkdirSync(srcImagesDir, { recursive: true });

const trim = ['-ss', String(start), ...(duration ? ['-t', String(duration)] : [])];

function ff(label, argv) {
  console.log(`\n▸ ${label}`);
  const r = spawnSync(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-y', ...argv], { stdio: 'inherit' });
  if (r.status !== 0) {
    console.error(`✖ ffmpeg failed: ${label}`);
    process.exit(r.status || 1);
  }
}

// H.264 settings tuned for scrubbing: short closed GOP, no B-frames (each seek
// decodes at most `gop` frames), no scene-cut keyframe drift, no audio track.
const h264 = (scaleFilter, out) => [
  ...trim, '-i', input,
  '-an',
  '-vf', `${scaleFilter},fps=${fps},format=yuv420p`,
  '-c:v', 'libx264', '-preset', 'slow', '-crf', String(crf),
  '-profile:v', 'high', '-level', '4.1',
  '-g', String(gop), '-keyint_min', String(gop), '-sc_threshold', '0', '-bf', '0',
  '-movflags', '+faststart',
  out,
];

ff(`Desktop MP4 (${width}px)`, h264(`scale=${width}:-2:flags=lanczos`, join(videosDir, 'hero-scroll.mp4')));

// Portrait crop for phones: 9:16 window positioned by --mobile-x.
const portraitCrop = `crop=ih*9/16:ih:(iw-ih*9/16)*${mobileX}:0`;
if (!flag('no-mobile')) {
  ff('Mobile MP4 (720x1280 portrait)', h264(`${portraitCrop},scale=720:1280:flags=lanczos`, join(videosDir, 'hero-scroll-mobile.mp4')));
}

if (flag('webm')) {
  ff('WebM VP9 (1920px)', [
    ...trim, '-i', input, '-an',
    '-vf', `scale=1920:-2:flags=lanczos,fps=${fps}`,
    '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '36', '-g', String(gop), '-row-mt', '1', '-deadline', 'good',
    join(videosDir, 'hero-scroll.webm'),
  ]);
}

// Posters: exactly the first frame, so the swap poster → video is seamless.
ff('Poster (first frame)', ['-ss', String(start), '-i', input, '-frames:v', '1', '-vf', 'scale=2560:-2:flags=lanczos', '-q:v', '2', join(srcImagesDir, 'hero-poster.jpg')]);
ff('Mobile poster (portrait)', ['-ss', String(start), '-i', input, '-frames:v', '1', '-vf', `${portraitCrop},scale=1080:-2:flags=lanczos`, '-q:v', '2', join(srcImagesDir, 'hero-poster-mobile.jpg')]);

if (frames > 0) {
  rmSync(framesDir, { recursive: true, force: true });
  mkdirSync(framesDir, { recursive: true });
  const seg = duration ? Number(duration) : null;
  const rate = seg ? frames / seg : fps;
  ff(`Image sequence (${frames} frames)`, [
    ...trim, '-i', input,
    '-vf', `fps=${rate.toFixed(4)},scale=${frameWidth}:-2:flags=lanczos`,
    '-frames:v', String(frames), '-c:v', 'libwebp', '-quality', '72',
    join(framesDir, 'frame-%04d.webp'),
  ]);
  const count = readdirSync(framesDir).filter((f) => f.endsWith('.webp')).length;
  writeFileSync(join(framesDir, 'manifest.json'), JSON.stringify({ count, pattern: 'frame-{index}.webp', pad: 4, width: frameWidth }, null, 2));
  console.log(`  ${count} frames written to public/assets/frames/hero/`);
}

console.log('\n✔ Done. Run `npm run images` to regenerate the responsive poster images.');
