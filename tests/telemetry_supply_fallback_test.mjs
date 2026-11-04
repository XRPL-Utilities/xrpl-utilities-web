// Regression test for the supply tiles on /telemetry/.
//
// 2026-11-04: one slow ledger read put total_xrp in fallback_fields although
// Telemetry served the previous live reading, and the page showed the April
// launch figures (66.80B circulating against 68.89B live). Telemetry 1.35.0
// names those readings in last_good_fields; the page must accept them while
// still refusing a real seed.
//
// Run: node tests/telemetry_supply_fallback_test.mjs [path-to-telemetry.js]

import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scriptPath = process.argv[2] ? path.resolve(process.argv[2]) : path.join(repo, 'assets/pages/telemetry.js');
const src = fs.readFileSync(scriptPath, 'utf8');
const m = src.match(/function liquidityToPayload\(d\) \{[\s\S]*?\n\}/);
if (!m) { console.error('FAIL liquidityToPayload not found'); process.exit(1); }
const ctx = {};
vm.runInNewContext(m[0] + '\nthis.f = liquidityToPayload;', ctx);
const f = ctx.f;

const supply = { total_xrp: 99985569657.97, circulating_xrp: 68885569657.97, escrowed_xrp: 31.1e9 };
let fails = 0;
function check(name, cond) { if (!cond) { fails++; console.error('FAIL ' + name); } else console.log('ok   ' + name); }

check('fully live supply is used', f({ fallback_fields: [], supply }).supply === supply);
check('last-good supply is used', f({ fallback_fields: ['amm_vaults', 'total_xrp'],
  last_good_fields: { total_xrp: '2026-11-04T14:26:12Z' }, supply }).supply === supply);
check('seeded supply is refused', f({ fallback_fields: ['total_xrp'], supply }).supply === undefined);
check('seeded escrow is refused even with last-good total', f({ fallback_fields: ['total_xrp', 'escrowed_xrp'],
  last_good_fields: { total_xrp: '2026-11-04T14:26:12Z' }, supply }).supply === undefined);
check('unrelated fallback leaves supply live', f({ fallback_fields: ['amm_vaults'], supply }).supply === supply);

if (fails) { console.error(`${fails} failing`); process.exit(1); }
console.log('all passed');
