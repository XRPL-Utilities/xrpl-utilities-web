// Vault is the pilot for the lighter product-page layout (design review,
// 2026-10-27): a 64px logo beside the name and a one-line promise instead of
// a 256px logo and a paragraph, data before explainers, the 48 issuer tiles
// capped at 12 with "Show all", explainers folded into "How this works", and
// one developer strip that links to Pricing instead of a full API section.
//
// Run: node tests/vault_layout_test.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(repo, p), 'utf8');
let fails = 0;
const fail = (m) => { fails++; console.log('FAIL ' + m); };

const html = read('vault/index.html');
const main = html.slice(html.indexOf('<main'), html.indexOf('</main>'));

// Aaron, 2026-10-27: 64px was too small. 128px desktop / 96px phone, drawn
// from the 512px source so it stays sharp on high-density screens.
if (/\bh-64\b/.test(main)) fail('vault: hero is back to the 256px logo that filled the first phone screen');
const logo = main.match(/<img[^>]*class="[^"]*hero-logo[^"]*"[^>]*>/);
if (!logo) fail('vault: hero logo missing the hero-logo size class');
else if (!/xr-vault-512\.webp/.test(logo[0])) fail('vault: hero logo must use the 512px source to stay sharp at 128px');
if (!/\.hero-logo \{ width: 96px; height: 96px; \}/.test(html) || !/min-width: 768px\) \{ \.hero-logo \{ width: 128px; height: 128px; \}/.test(html)) fail('vault: hero logo must be 96px on phones and 128px from 768px up');

const at = (id) => main.indexOf(`<section id="${id}"`);
const order = ['vault-summary', 'top-movers', 'issuer-grid', 'settlement-over-time', 'how-it-works', 'developers'];
order.forEach((id) => { if (at(id) === -1) fail(`vault: section #${id} missing`); });
for (let k = 1; k < order.length; k++) {
  if (at(order[k - 1]) > at(order[k])) fail(`vault: #${order[k - 1]} must come before #${order[k]}`);
}
if (at('what-is') !== -1) fail('vault: explainer cards sit above the data again');
const how = main.slice(at('how-it-works'), at('developers'));
if (!/<details[\s>]/.test(how) || /<details[^>]*\sopen/.test(how)) fail('vault: "How this works" must be a closed <details>');

const dev = main.slice(at('developers'));
if (!/href="\/pricing\/"/.test(dev)) fail('vault: developer strip must link to /pricing/');
for (const s of ['Free MCP tools', 'Paid MCP tools', 'POST /events/recent', 'agents.json']) {
  if (main.includes(s)) fail(`vault: "${s}" belongs on Pricing, not the showcase page`);
}

if (!/id="issuer-show-all"/.test(main)) fail('vault: issuer grid has no Show all button');
const js = read('assets/pages/vault.js');
const lim = js.match(/const ISSUER_TILE_LIMIT = (\d+);/);
if (!lim || Number(lim[1]) !== 12) fail('vault.js: issuer grid must start at 12 tiles');
if (!/applyIssuerLimit\(\);\n}/.test(js)) fail('vault.js: renderIssuerTiles must apply the tile limit after each render');

// The CSS is prebuilt, so a utility class that was never compiled silently
// does nothing. Every class in the new layout blocks must exist in it.
const css = read('assets/tailwind.css') + read('assets/stat-tile.css');
const esc = (c) => c.replace(/[:/.[\]]/g, (m) => '\\' + m);
const custom = new Set(['gloss', 'group', 'glow', 'hero-logo']);
const blocks = [main.slice(0, at('discovery-callout')), how, dev];
for (const b of blocks) {
  for (const m of b.matchAll(/class="([^"]+)"/g)) {
    for (const c of m[1].split(/\s+/).filter(Boolean)) {
      if (custom.has(c)) continue;
      if (!css.includes('.' + esc(c) + '{') && !css.includes('.' + esc(c) + ':') && !css.includes('.' + esc(c) + ' ') && !css.includes('.' + esc(c) + ',') && !css.includes('.' + esc(c) + '>')) {
        fail(`vault: class "${c}" is not in the built CSS`);
      }
    }
  }
}

console.log('vault layout: ' + (fails ? fails + ' failure(s)' : 'ok'));
process.exit(fails ? 1 : 0);
