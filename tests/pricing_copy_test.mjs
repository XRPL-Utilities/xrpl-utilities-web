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
const paid = slice('<!-- PAID ENDPOINTS MATRIX -->', '<!-- FIRST CALL -->');
const free = slice('<!-- FREE ENDPOINTS -->', '<!-- LEGAL -->');

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

process.exit(fails ? 1 : 0);
