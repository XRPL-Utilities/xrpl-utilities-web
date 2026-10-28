// Between UTC midnight and the first rollup of the day, Pulse has no row
// for yesterday's whale tally yet. On 2026-10-28 at 00:08 UTC the Pulse
// card read "Yesterday $0, 0 txs" for a $300M+ day and Lineage's RLUSD
// card paired a $0 delta with a prior-snapshot figure from a different day.
// A missing row is unknown, not zero, and the prior card must show the
// snapshot the delta was measured against.
//
// Run: node tests/midnight_gap_test.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(repo, p), 'utf8');
let fails = 0;
const fail = (m) => { fails++; console.log('FAIL ' + m); };

const pulse = read('assets/pages/pulse.js');
const i = pulse.indexOf("series.find(row => row.snapshot_date === yestStr)");
if (i === -1) fail('pulse.js: yesterday lookup by date is gone');
else {
  const missing = pulse.slice(pulse.indexOf('} else if (yestUsdEl) {', i), pulse.indexOf('} catch', i));
  if (!missing) fail('pulse.js: no branch for a missing yesterday row');
  if (/\$0|'0 tx/.test(missing)) fail('pulse.js: a missing yesterday row is shown as $0 again');
  if (!/pending/.test(missing)) fail('pulse.js: a missing yesterday row must say the tally is pending');
}

const lineage = read('assets/pages/lineage.js');
if (!/hist\.find\(h => h\.snapshot_date === basis\)/.test(lineage) || !/obligations_delta_today_basis_date/.test(lineage)) {
  fail('lineage.js: the prior-snapshot card must use the row the delta was measured against');
}

console.log('midnight gap: ' + (fails ? fails + ' failure(s)' : 'ok'));
process.exit(fails ? 1 : 0);
