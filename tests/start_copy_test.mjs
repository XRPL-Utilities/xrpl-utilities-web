// Start page facts checked on 2026-10-29.
//
// - XRP was called "a fixed 100-billion-supply asset"; fees are burned, so
//   the total shrinks from the 100 billion created at launch.
// - Addresses were "25-34 characters"; classic addresses run 25 to 35.
// - RLUSD was "the largest IOU on XRPL by every measure" with a stale count.
// - The reference-agent example was called a 30-line example (it is 108).
// - Telemetry was sold as a "price-floor calculator" (now a what-if model);
//   Vault listed asset classes that left out its largest (private credit).
// - Copy named the payment facilitators, said "x402 v2" and "moat", and
//   claimed a flat $0.10 price on every rail and route.
//
// Run: node tests/start_copy_test.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(repo, 'start/index.html'), 'utf8');
let fails = 0;
function check(name, cond) { console.log((cond ? 'PASS ' : 'FAIL ') + name); if (!cond) fails++; }

check('XRP supply is not called fixed', !html.includes('fixed 100-billion') && html.includes('100 billion were created at launch'));
check('address length is 25 to 35', html.includes('25 to 35 character') && !html.includes('25-34'));
check('no RLUSD superlative or stale count', !html.includes('by every measure') && !html.includes('93,000'));
check('example is not called 30 lines', !html.includes('30-line'));
check('Telemetry is not a price-floor calculator', !html.includes('price-floor calculator'));
check('Vault lists private credit', html.includes('private credit'));
check('payment options listed in full', html.includes('Pay in RLUSD or XRP on the XRP Ledger, or USDC on Base.'));
check('price is not claimed flat everywhere', !html.includes('Same $0.10 USD price across rails'));
for (const leak of ['t54', 'facilitator', 'x402 v2', 'moat', 'by every measure']) {
  check(`no "${leak}"`, !html.includes(leak));
}
console.log(fails ? `${fails} FAILED` : 'start copy: ok');
process.exit(fails ? 1 : 0);
