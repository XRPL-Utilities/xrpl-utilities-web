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

check('scans tile is not called paid or lifetime', !html.includes('paid behavioral classifications'));
check('events tile is not called lifetime', !html.includes('lifetime'));
check('run-rate is not all-token', !html.includes('all-token'));
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

// Homepage rework, 2026-10-29. The first screen was a 256 px logo tile, a
// category headline ("XRPL Data Infrastructure") and five buttons; the live
// numbers sat below the fold. Two of the seven tiles counted our own usage,
// not the ledger. The product grid left one card alone on its last row, and
// the code sample was clipped on the right.
const hero = html.slice(html.indexOf('<section class="home-hero">'), html.indexOf('id="paths"'));
check('hero exists', hero.length > 100);
check('no big logo tile on the home page', !html.includes('logo-512'));
check('h1 is not the category headline', !/<h1[^>]*>\s*XRPL <span[^>]*>Data Infrastructure/.test(html));
check('hero has exactly two buttons', (hero.match(/px-6 py-3 rounded-lg/g) || []).length === 2);
check('hero carries the live panel', hero.includes('id="hero-bars"') && hero.includes('id="ls-settled"') && hero.includes('id="ls-netflow"') && hero.includes('id="ls-escrow"'));
check('no self-usage tiles', !html.includes('Events on file') && !html.includes('Sentinel scans'));
const products = html.slice(html.indexOf('class="home-products"'), html.indexOf('</section>', html.indexOf('class="home-products"')));
check('product grid fills two rows of four', (products.match(/class="home-product group"/g) || []).length === 8);
const pre = (html.match(/<pre[^>]*>([\s\S]*?)<\/pre>/) || [])[1] || '';
const longest = Math.max(...pre.replace(/<[^>]+>/g, '').replace(/&[a-z]+;/g, 'x').split('\n').map((l) => l.length));
check('code sample lines fit the box (56 chars max)', longest <= 56, `longest ${longest}`);
check('net flow wording follows flow_direction', js.includes('exchange_to_wallet_usd') && js.includes('wallet_to_exchange_usd') && js.includes("'Net XRP off exchanges, 24h'"));
check('no innerHTML in the home script', !js.includes('innerHTML'));

console.log(fails ? `${fails} FAILED` : 'home copy: ok');
process.exit(fails ? 1 : 0);
