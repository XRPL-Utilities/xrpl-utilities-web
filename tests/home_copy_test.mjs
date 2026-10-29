// Home page facts checked on 2026-10-29.
//
// - The Sentinel scans tile said "paid ... lifetime"; the count includes
//   free web scans. The events tile said "lifetime"; whale events are
//   pruned after 14 days. The run-rate said "all-token"; it is XRP + RLUSD.
// - The ETF tile counted every registry ticker, including funds with no
//   figure yet; it now counts funds that reported on the latest day.
// - Sentinel was sold as wallet vetting with an address-poisoning signal
//   that does not exist. Lineage listed per-wallet focus alerts it lacks.
// - Trust's offer said it was free and XRP-only; it takes RLUSD too.
// - The page named the payment facilitators, said "x402 v2" and claimed an
//   OpenAPI 3.0 spec (the services publish 3.1).
//
// Run: node tests/home_copy_test.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(repo, 'index.html'), 'utf8');
const js = fs.readFileSync(path.join(repo, 'assets/pages/home-2.js'), 'utf8');
let fails = 0;
function check(name, cond) { console.log((cond ? 'PASS ' : 'FAIL ') + name); if (!cond) fails++; }

check('scans tile is not called paid or lifetime', !html.includes('paid behavioral classifications') && html.includes('free and paid'));
check('events tile is not called lifetime', !html.includes('lifetime'));
check('run-rate is not all-token', !html.includes('all-token') && html.includes('XRP + RLUSD'));
check('ETF tile counts reporting funds', js.includes('etf_aum_per_ticker_daily') && !js.includes('tracked_etfs.length'));
check('no address-poisoning claim', !/address poisoning/i.test(html));
check('Sentinel is not sold as vetting', !html.includes('Vet a wallet'));
check('no Lineage focus alerts', !html.includes('focus alerts'));
check('Trust offer is not free-only or XRP-only', !html.includes('free until the directory has data'));
check('Vault lists private credit', html.includes('private credit'));
check('OpenAPI version not claimed', !html.includes('OpenAPI 3.0'));
for (const leak of ['t54', 'facilitator', 'x402 v2', 'scraped', 'US-listed', 'Pearson', 'moat', 'curated']) {
  check(`no "${leak}"`, !html.includes(leak));
}
console.log(fails ? `${fails} FAILED` : 'home copy: ok');
process.exit(fails ? 1 : 0);
