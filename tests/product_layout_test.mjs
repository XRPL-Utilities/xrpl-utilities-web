// The seven product pages share the layout piloted on Vault (design review,
// 2026-10-27): a big logo beside the name and a one-line promise, the live
// data first, explainers folded into a closed "How this works", and one
// developer strip that links to Pricing with the API notes folded under it.
//
// Run: node tests/product_layout_test.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(repo, p), 'utf8');
let fails = 0;
const fail = (m) => { fails++; console.log('FAIL ' + m); };

const css = read('assets/tailwind.css') + read('assets/stat-tile.css');
const esc = (c) => c.replace(/[:/.[\]]/g, (m) => '\\' + m);
const built = (c) => ['{', ':', ' ', ',', '>'].some((s) => css.includes('.' + esc(c) + s));
const custom = new Set(['gloss', 'group', 'glow', 'hero-logo', 'hero-title', 'hero-tag']);

const pages = ['sentinel', 'pulse', 'telemetry', 'trust', 'vault', 'flows', 'lineage'];
for (const p of pages) {
  const html = read(`${p}/index.html`);
  const main = html.slice(html.indexOf('<main'), html.indexOf('</main>'));
  const at = (id) => main.indexOf(`<section id="${id}"`);
  const next = (i) => { const n = main.indexOf('<section', i + 1); return n === -1 ? main.length : n; };

  // Header. Aaron, 2026-10-27: 64px and 128px logos read as too small on a
  // 17" 2560x1440 laptop, so 112 / 144 / 176px from the 512px source.
  if (/\bh-64\b/.test(main)) fail(`${p}: hero is back to the 256px logo that filled the first phone screen`);
  const logo = main.match(/<img[^>]*class="[^"]*hero-logo[^"]*"[^>]*>/);
  if (!logo) fail(`${p}: hero logo missing the hero-logo size class`);
  else if (!logo[0].includes(`xr-${p}-512.webp`)) fail(`${p}: hero logo must use the xr-${p}-512.webp source`);
  for (const [bp, px] of [[null, 112], [768, 144], [1024, 176]]) {
    const rule = `.hero-logo { width: ${px}px; height: ${px}px; }`;
    if (!html.includes(bp ? `@media (min-width: ${bp}px) { ${rule}` : rule)) fail(`${p}: hero logo must be ${px}px${bp ? ' from ' + bp + 'px' : ' on phones'}`);
  }
  // "XR-Telemetry" broke at the hyphen beside the logo on a 390px phone.
  if (!html.includes('@media (max-width: 767px) { .hero-title { font-size: clamp(1.75rem, 8vw, 2.25rem); white-space: nowrap; } }')) fail(`${p}: product name must stay on one line on phones`);
  if (!/<h1 class="hero-title[^"]*"/.test(main)) fail(`${p}: h1 missing hero-title`);
  if (!/<p class="hero-tag[^"]*"/.test(main)) fail(`${p}: one-line promise missing`);

  // Explainers and API notes are folded, never ahead of the data.
  for (const id of ['what-is', 'for-agents', 'output-shape', 'methodology', 'why', 'sla', 'uptime']) {
    if (at(id) !== -1) fail(`${p}: #${id} is a full section again; it belongs folded under How this works or API details`);
  }
  const dev = at('developers');
  if (dev === -1) { fail(`${p}: developer strip missing`); continue; }
  const how = at('how-it-works');
  if (how !== -1) {
    if (how > dev) fail(`${p}: How this works must come before the developer strip`);
    const block = main.slice(how, next(how));
    if (!/<details[\s>]/.test(block) || /<details[^>]*\sopen/.test(block)) fail(`${p}: How this works must be a closed <details>`);
  }
  const devBlock = main.slice(dev, next(dev));
  if (!/href="\/pricing\/"/.test(devBlock)) fail(`${p}: developer strip must link to /pricing/`);
  if (/<details[^>]*\sopen/.test(devBlock)) fail(`${p}: API details must start closed`);
  const firstData = main.indexOf('<section', main.indexOf('</section>'));
  if (firstData === how || firstData === dev) fail(`${p}: the first thing after the header must be data, not an explainer`);

  // The CSS is prebuilt, so a utility class that was never compiled silently
  // does nothing. Every class in the header and the new wrappers must exist.
  const hero = main.slice(0, main.indexOf('</section>'));
  const wrappers = [hero, ...(how === -1 ? [] : [main.slice(how, main.indexOf('</summary>', how) + 10)])];
  const cut = devBlock.indexOf('<details');
  const strip = cut === -1 ? devBlock : devBlock.slice(0, devBlock.indexOf('</summary>', cut) + 10);
  for (const b of [...wrappers, strip]) {
    for (const m of b.matchAll(/class="([^"]+)"/g)) {
      for (const c of m[1].split(/\s+/).filter(Boolean)) {
        if (!custom.has(c) && !built(c)) fail(`${p}: class "${c}" is not in the built CSS`);
      }
    }
  }

  // Ids the page scripts look up must not be lost in the move.
  const ids = [...main.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (dup.length) fail(`${p}: duplicate ids ${[...new Set(dup)].join(', ')}`);
}

console.log('product layout: ' + (fails ? fails + ' failure(s)' : 'ok'));
process.exit(fails ? 1 : 0);
