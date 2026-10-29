// Pricing page facts checked against every live service on 2026-10-29: an
// unpaid call to each route below answered 402 at $0.10 (Pulse streams at their
// tier price), and Trust's 402 offers RLUSD, XRP and USDC on Base.
//
// - The page said Trust takes no RLUSD, and listed /domains and
//   /credentials/issuers as "free until data available". Both are paid now that
//   the directory has data (the site's own panels read them for free).
// - Six paid routes were missing, including all of XR-Ledger.
// - The MCP line said 44 tools across six services (29 free, 15 paid); the
//   server lists 46 across seven (32 free, 14 paid).
//
// Run: node tests/pricing_copy_test.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(repo, 'pricing/index.html'), 'utf8');
let fails = 0;
function check(name, cond) { console.log((cond ? 'PASS ' : 'FAIL ') + name); if (!cond) fails++; }

const slice = (from, to) => {
  const i = html.indexOf(from);
  return i < 0 ? '' : html.slice(i, html.indexOf(to, i + from.length));
};
const paid = slice('<!-- PAID ENDPOINTS MATRIX -->', '<!-- FREE ENDPOINTS -->');
const free = slice('<!-- FREE ENDPOINTS -->', '<!-- CODE SAMPLES.');

const PAID_ROUTES = [
  'POST /scan', 'POST /scan/history',
  'POST /events/recent', 'POST /events/by-address', 'POST /stream/purchase',
  'GET /domains', 'GET /domain/{domain_id}', 'GET /credentials/issuers',
  'GET /permissioned-domains/operators', 'GET /permissioned-domains/operators/{addr}',
  'POST /statement',
];
for (const r of PAID_ROUTES) check(`paid list names ${r}`, paid.includes(`>${r}<`));
check('XR-Ledger has a paid card', paid.includes('XR-Ledger') && paid.includes('ledger.xrpl-utilities.io'));
check('Trust is not described as RLUSD-free', !html.includes('RLUSD not offered'));
check('no "free until data available" label', !html.includes('free until data available'));
for (const r of ['/domains<', '/credentials/issuers<', '/permissioned-domains/operators<']) {
  check(`free list does not offer paid ${r.slice(0, -1)}`, !free.includes(`>${r}`));
}
check('MCP tool counts match the server', html.includes('46 across all seven services (32 free, 14 paid)'));
check('page says seven APIs, not six', !/Six agent-payable/.test(html));


// 2026-10-29: Aaron found the page "way too much": below the prices sat a
// three-step curl section, a three-card protocol walkthrough naming the
// payment facilitators and headers, and four code blocks, two of them MCP.
// Prices and a plain three-step strip stay up top; the code lives in one
// closed "Code samples" panel.
check('paid list is still there', paid.length > 1000);
check('free list is still there', free.length > 500);
check('no protocol walkthrough section', !html.includes('<!-- HOW PAYMENT WORKS -->') && !html.includes('PAYMENT-SIGNATURE'));
for (const leak of ['t54', 'facilitator', 'x402 v2', 'verify-then-work-then-settle', 'EIP-3009']) {
  check(`no "${leak}"`, !html.includes(leak));
}
const samples = slice('<!-- CODE SAMPLES.', '<!-- LEGAL -->');
check('code samples sit in one closed panel', /<details id="first-call" class="[^"]*">/.test(samples) && !/<details id="first-call"[^>]*\bopen\b/.test(samples));
check('every code block is inside that panel', (html.match(/<pre/g) || []).length === (samples.match(/<pre/g) || []).length);
check('one MCP block, not two', (html.match(/@xrpl-utilities\/mcp/g) || []).length === 1);

// Second pass the same day: the paid cards still carried method detail and
// two wrong facts (a 30-day Sentinel window, the real one is 90; Pulse listing
// permissioned-domain events, which moved to Trust). The free list named the
// toml and DID checks behind /verify-origin.
check('free endpoints sit in a closed panel', /<details id="free-endpoints" class="[^"]*">/.test(free) && !/<details id="free-endpoints"[^>]*\bopen\b/.test(free));
check('Sentinel window says 90 days', paid.includes('last 90 days') && !paid.includes('30-day'));
for (const leak of ['xrp-ledger.toml', 'XLS-40', 'curated', 'v2 (planned)', 'fabricated', 'JWT', 'Pearson', 'EDGAR', 'XLS-70']) {
  check(`no "${leak}"`, !html.includes(leak));
}

process.exit(fails ? 1 : 0);
