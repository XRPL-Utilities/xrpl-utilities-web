// Makes the share picture for a lesson: the image on its X post and the
// preview card when the page link is shared. 2400x1350 PNG, written to
// assets/img/learn/<slug>.png, which build.mjs then uses as og:image.
//
// Needs Playwright (installed globally in the cloud sessions):
//   NODE_PATH=$(npm root -g) node tools/learn/card.mjs what-is-the-xrp-ledger
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { esc, parseLesson } from './build.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const slug = process.argv[2];
if (!/^[a-z0-9-]+$/.test(slug || '')) { console.error('usage: card.mjs <lesson-slug>'); process.exit(1); }
const manifest = JSON.parse(fs.readFileSync(path.join(here, 'lessons.json'), 'utf8'));
const entry = manifest.lessons.find((l) => l.slug === slug);
if (!entry) { console.error(`no lesson ${slug} in lessons.json`); process.exit(1); }
const lesson = parseLesson(fs.readFileSync(path.join(here, 'lessons', `${slug}.md`), 'utf8'));
const css = fs.readFileSync(path.join(repo, 'assets/learn.css'), 'utf8');
const logo = 'data:image/webp;base64,' + fs.readFileSync(path.join(repo, 'assets/img/logo-mark-128.webp')).toString('base64');

const html = `<!DOCTYPE html><html><head><meta charset="utf-8" />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet" />
<style>${css}
html, body { width: 1200px; height: 675px; overflow: hidden; }
.og { width: 1200px; height: 675px; box-sizing: border-box; padding: 64px 72px; display: grid; grid-template-columns: 1fr 470px; gap: 40px; align-items: center;
  background: radial-gradient(50rem 26rem at 90% -10%, rgba(0,184,255,0.22), transparent 60%), radial-gradient(36rem 20rem at 0% 120%, rgba(0,184,255,0.10), transparent 60%), #0a0a0a; }
.brand-row { display: flex; align-items: center; gap: 12px; color: #fff; font-weight: 600; letter-spacing: 0.16em; text-transform: uppercase; font-size: 15px; margin-bottom: 36px; }
.brand-row img { width: 40px; height: 40px; border-radius: 8px; box-shadow: 0 0 18px rgba(0,184,255,0.25); }
.brand-row em { font-style: normal; color: #00b8ff; }
.k { color: #00b8ff; font-weight: 700; letter-spacing: 0.2em; text-transform: uppercase; font-size: 16px; margin: 0 0 14px; }
h1 { font-size: 64px; line-height: 1.05; margin: 0 0 20px; }
.sub { color: #d4d4d4; font-size: 24px; line-height: 1.4; margin: 0; }
.foot { position: absolute; left: 72px; bottom: 44px; color: #a3a3a3; font-size: 17px; }
.art { width: 470px; min-width: 0; }
.art svg { width: 470px; height: auto; }
.hero-chain figcaption { display: none; }
.hero-chain .new, .hero-chain .lk-new { animation: none; }
</style></head><body>
<div class="og">
  <div>
    <div class="brand-row"><img src="${logo}" alt="" /><span>XRPL-Utilities <em>Learn</em></span></div>
    <p class="k">Lesson ${entry.n} of ${manifest.lessons.length}</p>
    <h1>${esc(lesson.meta.h1)}</h1>
    <p class="sub">${esc(lesson.meta.card || 'Explained for anyone who has heard of Bitcoin.')}</p>
  </div>
  <div class="art">${lesson.hero}</div>
</div>
<div class="foot">xrpl-utilities.com/learn &nbsp;&middot;&nbsp; ${esc(manifest.hashtag)}</div>
</body></html>`;

const { chromium } = createRequire(import.meta.url)('playwright');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 675 }, deviceScaleFactor: 2 });
await page.setContent(html, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
const out = path.join(repo, 'assets/img/learn', `${slug}.png`);
fs.mkdirSync(path.dirname(out), { recursive: true });
await page.screenshot({ path: out });
await browser.close();
console.log(`wrote ${path.relative(repo, out)} (${Math.round(fs.statSync(out).size / 1024)} KB)`);
