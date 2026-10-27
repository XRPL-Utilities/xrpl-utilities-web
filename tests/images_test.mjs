// Image weight on xrpl-utilities.com (P1 audit, 2026-10-27).
//
// Every page pulled about 6 MB of PNGs: 1254 px product art, about 1 MB
// each, shown at 36 to 256 px, all loaded up front. Pages now use sized
// WebP copies from assets/img/ (128 px for icons, 512 px for the hero,
// 96 px for the logo) and load everything below the header lazily. The
// full PNGs stay for og:image and JSON-LD, where crawlers want them.
//
// Run: node tests/images_test.mjs
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let fails = 0;
function check(name, cond, extra = '') {
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + extra));
  if (!cond) fails++;
}

const MAX_IMAGE = 32 * 1024;      // any single image a page displays
const MAX_PAGE_IMAGES = 160 * 1024; // all distinct images on one page

// Pixel size of a WebP file, from its header (VP8X, VP8L or plain VP8).
function webpSize(file) {
  const b = fs.readFileSync(file);
  if (b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WEBP') return null;
  const kind = b.toString('ascii', 12, 16);
  if (kind === 'VP8X') return { w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3) };
  if (kind === 'VP8L') { const v = b.readUInt32LE(21); return { w: 1 + (v & 0x3fff), h: 1 + ((v >> 14) & 0x3fff) }; }
  if (kind === 'VP8 ') return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
  return null;
}

const pages = execFileSync('git', ['ls-files', '*.html'], { cwd: repo, encoding: 'utf8' })
  .split('\n').filter((f) => f && !f.startsWith('tools/'));

for (const f of pages) {
  const s = fs.readFileSync(path.join(repo, f), 'utf8');
  const imgs = [...s.matchAll(/<img\b[^>]*>/g)].map((m) => m[0]);
  const seen = new Set();
  let bytes = 0;
  let eager = 0;
  for (const tag of imgs) {
    const src = (tag.match(/\ssrc="([^"]*)"/) || [])[1] || '';
    if (!src.startsWith('/assets/')) continue;
    const file = path.join(repo, src.split('?')[0]);
    const size = fs.existsSync(file) ? fs.statSync(file).size : Infinity;
    check(`${f}: ${src} exists and is under ${MAX_IMAGE / 1024} KB`, size <= MAX_IMAGE, `got ${size}`);
    check(`${f}: ${src} has width and height`, /\swidth="\d+"/.test(tag) && /\sheight="\d+"/.test(tag));
    // 2026-10-27: the home hero showed the 96 px logo at 256 px and looked
    // blurry. Every image needs at least twice its display size in pixels.
    const shown = Number((tag.match(/\swidth="(\d+)"/) || [])[1] || 0);
    const px = src.endsWith('.webp') && fs.existsSync(file) ? webpSize(file) : null;
    if (px) check(`${f}: ${src} is sharp at ${shown}px (file is ${px.w}px)`, px.w >= 2 * shown, `needs ${2 * shown}px`);
    const loading = (tag.match(/\sloading="(\w+)"/) || [])[1];
    check(`${f}: ${src} sets loading`, loading === 'lazy' || loading === 'eager');
    if (loading === 'eager') eager++;
    if (!seen.has(src)) { seen.add(src); bytes += size; }
  }
  // The header logo and at most one hero image load up front.
  check(`${f}: at most two images load eagerly`, eager <= 2, `got ${eager}`);
  check(`${f}: images total under ${MAX_PAGE_IMAGES / 1024} KB`, bytes <= MAX_PAGE_IMAGES, `got ${bytes}`);
}

if (fails) {
  console.error(`\n${fails} check(s) failed`);
  process.exit(1);
}
console.log('\nimage checks passed');
