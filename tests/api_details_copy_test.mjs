// 2026-10-29: the folded "API details" panels on Pulse, Trust and Telemetry
// still named the payment facilitator and protocol version, walked through
// payment headers, listed internal source ids, and described how the uptime
// recorder probes its dependencies. The Pulse page showed raw feed ids such as
// "sec_press" on news cards, and Lineage named Ripple's toml file. The same
// cut was made on Pricing (tests/pricing_copy_test.mjs).
//
// Run: node tests/api_details_copy_test.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(repo, f), 'utf8');
let fails = 0;
function check(name, cond) { console.log((cond ? 'PASS ' : 'FAIL ') + name); if (!cond) fails++; }

const LEAKS = ['t54', 'facilitator', 'x402 v2', 'PAYMENT-SIGNATURE', 'PAYMENT-RESPONSE', 'JWT',
  'xrp-ledger.toml', 'XRPL RPC', 'slow_tasks', 'TelemetryPayload', 'recurring cadence',
  'choreography_watcher', 'ETF-flow-biased', 'Backfilled', 'auto-walker'];
for (const page of ['pulse/index.html', 'trust/index.html', 'telemetry/index.html']) {
  const html = read(page);
  for (const leak of LEAKS) check(`${page}: no "${leak}"`, !html.includes(leak));
  check(`${page}: three-step payment strip kept`, html.includes('The quote is good for 10 minutes') || page.startsWith('telemetry'));
}

const pulse = read('assets/pages/pulse.js');
check('Pulse news pills show outlet names', /escapeHtml\(sourceName\(s\)\)/.test(pulse) && !/>\$\{escapeHtml\(s\)\}<\/span>/.test(pulse));
check('Pulse source cards show outlet names', /escapeHtml\(sourceName\(name\)\)/.test(pulse));
const srcBlock = pulse.slice(pulse.indexOf('const SOURCES = {'), pulse.indexOf('function sourceName'));
check('Pulse source copy has no feed jargon', srcBlock.length > 100 && !/RSS|on probe/.test(srcBlock) && !/recurring cadence|cross_verified<\/span>/.test(pulse));
check('Lineage does not name the toml file', !read('assets/pages/lineage.js').includes('xrp-ledger.toml'));

// The 30-day uptime card showed "Recording started recently" at 29.99 days
// observed: a rolling window never spans its full length, so the service's
// bootstrap flag never clears. The page now allows two sample intervals.
const tjs = read('assets/pages/telemetry.js');
check('uptime banner tolerates a full rolling window', /days_observed \|\| 0\) >= \(w30\.window_days \|\| 30\) - slack/.test(tjs));

// The live feed list had 23 sources; 11 had no display name and showed as
// "fca uk" or "google news xrp institutional". Every feed Pulse reported on
// 2026-10-29 now has one.
for (const id of ['sec_press','federal_reserve','bis_speeches','ecb_press','bank_of_england','rba_australia','bank_of_japan','bank_of_canada','fca_uk','esma_eu','fsb','google_news_xrp_institutional','cointelegraph_xrp','crypto_news_xrp','coinspeaker_xrp','theblock','decrypt','utoday','cryptobriefing','ambcrypto','beincrypto','bitcoinist','coindesk']) {
  check(`Pulse has a display name for ${id}`, new RegExp(`\\n  ${id}:\\s+\\['`).test(srcBlock));
}

// The six-across ledger-object tiles clipped a delta beside a five-digit
// count ("15,661 -4" lost the 4). The value row wraps now.
check('ledger-object tile row wraps its delta', pulse.includes('<div class="flex flex-wrap items-baseline gap-x-2">'));
// At 1024 px six across clipped the count itself; six columns start at xl.
check('ledger-object tiles go six across only from xl', read('pulse/index.html').includes('id="primitives-grid" class="mt-6 grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3"'));

process.exit(fails ? 1 : 0);
