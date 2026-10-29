// Telemetry page facts checked against the live service on 2026-10-28.
//
// - The page opened on launch-day constants (2026-04-28) as if live:
//   66.80B circulating against 68.59B live (Ripple escrow 31.4B).
// - It stated the identity as M·V = P·Q, then solved P = Q / (V·M), which
//   is Q = P·V·M.
// - A 2026-08-21 "permissioned books are close to idle" claim had gone stale
//   (273 permissioned fills in the 30 days to 2026-10-28).
// - The Python sample called time.sleep without importing time.
//
// Run: node tests/telemetry_copy_test.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(repo, 'telemetry/index.html'), 'utf8');
const js = fs.readFileSync(path.join(repo, 'assets/pages/telemetry.js'), 'utf8');
let fails = 0;
function check(name, cond) { console.log((cond ? 'PASS ' : 'FAIL ') + name); if (!cond) fails++; }

check('page loads live supply and float on open', js.includes("'/stats/liquidity'") && html.includes('id="af-as-of"'));
check('identity stated the way it is solved', !html.includes('M &middot; V = P &middot; Q') && html.includes('Q = P &times; V &times; M'));
check('no dated idle-books claim', !html.includes('2026-08-21'));
const sample = (html.match(/# pip install requests<\/div>\s*<pre[^>]*>([\s\S]*?)<\/pre>/) || [])[1] || '';
check('python sample imports what it uses', /import<\/span> time/.test(sample) || !/time\.sleep/.test(sample));
// The floor chart panel pushed the phone layout to 408px wide (2026-10-28).
check('floor grid panels can shrink on phones', html.includes('lg:col-span-2 min-w-0') && html.includes('p-6 space-y-6 min-w-0'));
// RLUSD settlement is counted at $1, not at the XRP price (settlement_walker.py).
check('RLUSD volume is not described as valued at the XRP price', !html.includes('RLUSD payment on the XRP Ledger, valued at the XRP price') && html.includes('RLUSD at $1'));
check('a delta that rounds to 0.00% is not shown in red', js.includes('Math.abs(deltaPct) < 0.005'));
// 2026-10-29: the service offers no SLA; the uptime panel reads /uptime.
check('uptime panel reads /uptime, not /sla', js.includes("'/uptime?days=30'") && !js.includes("'/sla"));
check('page never calls uptime an SLA', !/\bSLA\b/.test(html));
// 2026-10-29: no published uptime target either; it read like an SLA.
check('uptime panel shows no target', !js.includes('target_uptime') && !html.includes('sla-target') && !/>\s*Target\s*</.test(html));
console.log(fails ? `${fails} FAILED` : 'telemetry copy: ok');
process.exit(fails ? 1 : 0);
