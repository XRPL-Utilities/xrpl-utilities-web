// Lineage page facts checked against the live service and the ledger on 2026-10-28.
//
// - The 24h change tile showed yesterday's full-day change next to the live
//   supply, labelled as a 24h change against a "prior snapshot".
// - Exit cards listed every address we attribute as "hot wallets attributed";
//   39 of 63 were not publicly named.
// - Burst rows and the chain card led with total_usd, the sum of every hop,
//   which counts the same money once per hop.
// - The chain card drew the anchor as the first sender; it can sit anywhere.
// - Copy said "operator-curated" and "curated", and promotion was described
//   as score plus provenance only.
//
// Run: node tests/lineage_copy_test.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(repo, 'lineage/index.html'), 'utf8');
const js = fs.readFileSync(path.join(repo, 'assets/pages/lineage.js'), 'utf8');
const code = js.replace(/\/\/.*$/gm, '');
let fails = 0;
function check(name, cond) { console.log((cond ? 'PASS ' : 'FAIL ') + name); if (!cond) fails++; }

check('change tile uses the live change since 00:00 UTC', code.includes('live_change_since_snapshot') && !code.includes('obligations_delta_today'));
check('change tile is labelled as since 00:00 UTC', html.includes('Change since 00:00 UTC') && !html.includes('Supply change (24h)'));
// 2026-10-29: Pulse now counts every RLUSD trustline (101,453), and the tile
// sat over a fixed "our count stops at 2,000" caption.
check('trustline caption follows the data, no fixed cap', !html.includes('stops at 2,000')
  && code.includes("getElementById('rlusd-trustlines-sub')") && /trustline_count_truncated\s*\n?\s*\?/.test(code));
check('exit cards count attributed wallets without addresses', code.includes('inferred_wallet_count') && code.includes('addresses not shown'));
check('no catch-all exits card', !code.includes('Additional CEX'));
check('chain size is the largest hop, not the hop sum', code.includes('largest hop') && !/fmtUSD\(\s*b\.total_usd/.test(code) && !code.includes('top.total_usd'));
check('anchor is not drawn as the first sender', !code.includes('anchorBox'));
check('promotion paths stated', html.includes("on Ripple's redemption list, publicly named, or scored 70+"));
for (const leak of ['operator-curated', 'Operator-curated', 'curated', 'operator-tracked', 'moat', 'discovery loop', 'focus-watch', 'heuristic stack']) {
  check(`no "${leak}" in page copy`, !html.includes(leak) && !code.includes(leak));
}
console.log(fails ? `${fails} FAILED` : 'lineage copy: ok');
process.exit(fails ? 1 : 0);
