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
// 2026-11-02: server lists 64 tools (8 free, 56 paid: 55 x402 plus the
// Telemetry invoice quote). The page still said 46 (8 free, 38 paid).
check('MCP tool counts match the server', html.includes('64 across all seven services (8 free, 56 paid)'));
check('old MCP count is gone', !html.includes('46 across all seven services'));

// 2026-11-02: Pulse's /stats data routes cost agents $0.01 per call (free on
// this site). The free list and the free curl sample named four of them.
check('Pulse data calls priced at $0.01', paid.includes('Also &middot; data calls') && paid.includes('$0.01 / call'));
for (const r of ['/stats/whale-flow-24h', '/stats/whale-flow-history', '/stats/rwa-summary', '/stats/exchange-flow-delta']) {
  check(`free list does not offer paid ${r}`, !free.includes(`>${r}<`));
}
// Same day: Telemetry, Trust and Flows data routes went to $0.01 as well.
for (const r of ['/stats/correlation', '/stats/launch-impact', '/stats/etf-candidates', '/activity',
                 '/permissioned-domains/usage-summary', '/jurisdictions', '/events',
                 '/settlement/series', '/stats/liquidity']) {
  check(`free list does not offer paid ${r}`, !free.includes(`>${r}<`));
}
for (const r of ['GET /settlement/series', 'GET /activity', 'GET /stats/correlation']) {
  check(`paid list prices ${r} as a data call`, paid.includes(`>${r}<`));
}
check('free samples stay listed', ['/settlement/totals', '/permissioned-domains/operators/index',
  '/stats/etf-aggregate-xrp-held', '/stats/network'].every((r) => free.includes(`>${r}<`)));
check('hero names data calls for every service', html.includes('Agents pay per call: data calls $0.01,'));
check('free curl sample uses a free route', html.includes('curl https://pulse.xrpl-utilities.io/stats/network<'));
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



// 2026-11-01: each paid card names the MCP tool that calls it, so agent
// builders can go from a price to a tool. Names checked against the live
// tools/list that day. Routes with no MCP tool (Trust operators rollup and
// POST /scan) are left out on purpose.
const MCP = {
  sentinel: ['xrpl_sentinel_scan', 'xrpl_sentinel_scan_history'],
  pulse: ['xrpl_pulse_recent_events', 'xrpl_pulse_events_by_address', 'xrpl_pulse_stream_purchase'],
  telemetry: ['xrpl_telemetry_snapshot'],
  trust: ['xrpl_trust_list_domains', 'xrpl_trust_get_domain', 'xrpl_trust_credential_issuers', 'xrpl_trust_operator_drilldown'],
  vault: ['xrpl_vault_scan', 'xrpl_vault_daily_flow_history'],
  flows: ['xrpl_flows_scan'],
  ledger: ['xrpl_ledger_statement'],
};
for (const [svc, tools] of Object.entries(MCP)) {
  const i = paid.indexOf(`data-mcp="${svc}"`);
  const row = i < 0 ? '' : paid.slice(i, paid.indexOf('</div>', i));
  check(`${svc} card has an MCP tool row`, i >= 0);
  for (const t of tools) check(`${svc} card names ${t}`, row.includes(`>${t}<`));
  const host = paid.indexOf(`>${svc}.xrpl-utilities.io<`);
  check(`${svc} MCP row sits in its own card`, i >= 0 && host > i && paid.lastIndexOf('data-mcp=', host) === i);
}
check('multi-tool MCP rows say "MCP tools"', !/MCP tool<\/span>\s*<code[^>]*>[^<]+<\/code>\s*<(code|span)/.test(paid));
check('no MCP tool row offers a free poll step as paid', !paid.includes('xrpl_telemetry_get_status') && !paid.includes('xrpl_telemetry_get_results'));

// 2026-11-02 pricing matrix check: the six Pulse bundles (live since that day)
// and Sentinel bulk scans were missing from the page. Prices from live 402s.
const BUNDLES = {
  'wallet-check': '$0.25', 'rwa-token-report': '$0.15', 'fund-flow-report': '$0.10',
  'permissioned-venue-report': '$0.10', 'xrpl-network-snapshot': '$0.10', 'xrp-market-briefing': '$0.05',
};
const b = paid.indexOf('data-bundles');
const bundleBlock = b < 0 ? '' : paid.slice(b, paid.indexOf('</ul>', b));
check('Pulse card has a bundles block', b >= 0 && b < paid.indexOf('>pulse.xrpl-utilities.io<'));
for (const [name, price] of Object.entries(BUNDLES)) {
  const li = bundleBlock.indexOf(`>GET /bundles/${name}<`);
  const line = li < 0 ? '' : bundleBlock.slice(li, bundleBlock.indexOf('</li>', li));
  check(`bundle ${name} listed at ${price}`, line.includes(`&middot; ${price} &middot;`));
}
check('headline range reaches the $0.25 bundle', paid.includes('$0.01 to $0.25 USD per call') && html.includes('bundles $0.05 to $0.25'));
check('Sentinel bulk scans listed at $0.10 per wallet', paid.includes('>POST /bulk/quote<') && paid.includes('$0.10 / wallet'));
const pulseRow = paid.slice(paid.indexOf('data-mcp="pulse"'), paid.indexOf('</div>', paid.indexOf('data-mcp="pulse"')));
check('Pulse MCP row names the bundle tools', pulseRow.includes('>xrpl_wallet_check<') && pulseRow.includes('>xrpl_xrp_market_briefing<'));
// 5 named Pulse tools + 2 bundle tools + 23 more = 30 paid Pulse tools.
check('Pulse MCP row count adds up to 30', pulseRow.includes('and 23 more data and bundle tools'));
process.exit(fails ? 1 : 0);
