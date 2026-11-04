// Docs audit, 2026-11-03. Copy that had fallen behind the live services:
//
// - The home page said the MCP server had 46 tools (32 free, 14 paid); it
//   lists 64 (8 free, 56 paid). It also said most calls cost $0.10; most are
//   now $0.01 data calls.
// - The site llms.txt said "Six APIs", left XR-Ledger out and said nothing
//   about the $0.01 data calls, the six bundles or the Verified Record.
// - The start page said "the six services" are paid APIs; there are seven.
// - Nothing outside /verify/ said that paid answers carry a ledger stamp.
//
// Run: node tests/docs_freshness_test.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(repo, p), 'utf8');
const home = read('index.html');
const start = read('start/index.html');
const pricing = read('pricing/index.html');
const llms = read('llms.txt');
let fails = 0;
function check(name, cond) { console.log((cond ? 'PASS ' : 'FAIL ') + name); if (!cond) fails++; }

check('home: MCP count is 64 (8 free, 56 paid)', home.includes('64 tools across the seven services') && home.includes('8 free</span>, 56 paid'));
check('home: old 46-tool count is gone', !home.includes('46 tools'));
check('home: no "most calls $0.10"', !home.includes('most calls $0.10'));
check('home: links the Verify page from the agents section', /Every paid answer names the validated XRP Ledger[\s\S]{0,200}href="\/verify\/"/.test(home));
check('start: no "six services"', !/six services/i.test(start));
check('pricing: explains the provenance stamp and links /verify/', /id="ledger-stamp"[\s\S]{0,600}href="\/verify\/"/.test(pricing));
check('llms: seven APIs, not six', llms.includes('Seven APIs') && !llms.includes('Six APIs'));
check('llms: lists XR-Ledger', llms.includes('https://ledger.xrpl-utilities.io/llms.txt'));
check('llms: lists the $0.01 tier', llms.includes('$0.01 USD each'));
for (const b of ['wallet check $0.25', 'RWA token report $0.15', 'fund flow report $0.10', 'permissioned venue report $0.10', 'XRPL network snapshot $0.10', 'XRP market briefing $0.05']) {
  check(`llms: bundle "${b}"`, llms.includes(b));
}
check('llms: Verify page and anchor account', llms.includes('https://xrpl-utilities.com/verify/') && llms.includes('rwty5XRq5zrqTZ7XMLgk3EqQ76V3SY8Gwy'));
check('llms: provenance block', llms.includes('`provenance`'));
for (const [name, text] of [['home', home], ['start', start], ['pricing', pricing], ['llms', llms]]) {
  check(`${name}: no H-Seal`, !/h-?seal/i.test(text));
  check(`${name}: no em dash`, !text.includes('\u2014'));
}

if (fails) { console.error(`${fails} failing`); process.exit(1); }
console.log('docs freshness: all pass');
