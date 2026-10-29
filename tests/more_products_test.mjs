// The "more products" block at the bottom of each product page.
//
// 2026-10-29: Sentinel and Lineage showed a compact six-tile grid while the
// other five pages showed large two-column cards with different headings and
// copy (one still said "The 15 XRP funds"). Every product page now carries
// the same block, listing every other product. This test fails if a page
// drifts or brings back the old sections.
//
// Telemetry also dropped its AMM card (top pools plus an always-empty vaults
// box gated on an amendment that is not live); the check below keeps it out.
//
// Run: node tests/more_products_test.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SLUGS = ['sentinel', 'telemetry', 'pulse', 'trust', 'vault', 'flows', 'lineage'];
let fails = 0;
function check(name, cond) { console.log((cond ? 'PASS ' : 'FAIL ') + name); if (!cond) fails++; }

const tiles = {};
for (const slug of SLUGS) {
  const html = fs.readFileSync(path.join(repo, slug, 'index.html'), 'utf8');
  check(`${slug}: no old sister-products section`, !/Sister products|Also part of the XRPL-Utilities Portfolio|More from the XRPL-Utilities portfolio/i.test(html));
  const sections = html.match(/<section id="more-tools"[\s\S]*?<\/section>/g) || [];
  check(`${slug}: exactly one more-tools block`, sections.length === 1);
  if (sections.length !== 1) continue;
  const found = [...sections[0].matchAll(/<a href="\/([a-z]+)\/"[\s\S]*?<\/a>/g)];
  const linked = found.map((m) => m[1]);
  const others = SLUGS.filter((s) => s !== slug);
  check(`${slug}: links every other product once`, JSON.stringify(linked) === JSON.stringify(others));
  check(`${slug}: does not link itself`, !linked.includes(slug));
  for (const m of found) {
    if (tiles[m[1]] === undefined) tiles[m[1]] = m[0];
    else check(`${slug}: ${m[1]} tile matches the other pages`, tiles[m[1]] === m[0]);
  }
}

const flow = fs.readFileSync(path.join(repo, 'assets/telemetry-flow.js'), 'utf8');
check('telemetry: no AMM card in the snapshot view', !flow.includes('renderAmmCard') && !flow.includes('No active vaults yet'));

console.log(fails ? `${fails} FAILED` : 'more products: ok');
process.exit(fails ? 1 : 0);
