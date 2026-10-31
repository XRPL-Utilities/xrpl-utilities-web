// Flows page facts checked against the live service and issuer sources on 2026-10-28.
//
// - The MOEX snapshot printed last_value (the prior reading) next to a
//   change_pct measured to current_value.
// - Futures chips showed the raw Russian contract name and did not say the
//   price was the previous settlement.
// - The European subline named GXRP.DE, which has no figure.
// - Copy named data vendors, the SEC ticker index and scraper internals.
// - The x402 line said "x402 v2 (XRP/RLUSD on XRPL or USDC on Base)".
//
// Run: node tests/flows_copy_test.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(repo, 'flows/index.html'), 'utf8');
const js = fs.readFileSync(path.join(repo, 'assets/pages/flows.js'), 'utf8');
let fails = 0;
function check(name, cond) { console.log((cond ? 'PASS ' : 'FAIL ') + name); if (!cond) fails++; }

check('MOEX value matches the change it is shown with', js.includes('snap.current_value ?? snap.last_value'));
check('futures show the contract code and say previous settlement', js.includes('f.short_name') && !js.includes('f.sec_name') && js.includes('previous settlement'));
check('European subline does not name a fund with no figure', !js.includes('AXRP / WXRP / GXRP.DE'));
// 2026-10-31: funds outside the US. The subline must include Canada and
// Brazil (the international series), not just the European one, and the
// region label must come from a fixed map, never straight from the API.
check('non-US subline sums the European and international series',
  js.includes('body.etf_international_total_aum_daily') && js.includes('from funds outside the US'));
check('region label is looked up, not echoed', js.includes('REGION_LABEL[etf.region]') && !js.includes('${etf.region}'));
check('issuer list names the non-US issuers', ['Virtune', 'CoinShares', 'Valour', '3iQ', 'Purpose', 'Evolve', 'In Brazil: Hashdex'].every(n => html.includes(n)));
{
  const src = js.match(/function sumSeries[\s\S]*?\n}\n/)[0];
  const sumSeries = new Function(src + '; return sumSeries;')();
  const out = sumSeries(
    [{ snapshot_date: '2026-10-30', aum_usd_total: 10 }, { snapshot_date: '2026-10-31', aum_usd_total: null }],
    [{ snapshot_date: '2026-10-31', aum_usd_total: 5 }, { snapshot_date: '2026-11-01', aum_usd_total: null }],
  );
  check('sumSeries adds by date and keeps all-null days null', JSON.stringify(out) === JSON.stringify([
    { snapshot_date: '2026-10-30', aum_usd_total: 10 },
    { snapshot_date: '2026-10-31', aum_usd_total: 5 },
    { snapshot_date: '2026-11-01', aum_usd_total: null },
  ]));
}
// 2026-10-31: the day-over-day tile read +$545M on the day the non-US
// funds got issuer figures, because it subtracted yesterday's total from
// today's. It must sum each fund's own change instead.
check('day-over-day tile sums per-fund deltas', js.includes('sumTickerDeltas(series, latest.snapshot_date)') && !js.includes('latest.aum_usd_total - prior.aum_usd_total'));
{
  const src = js.match(/function sumTickerDeltas[\s\S]*?\n}\n/)[0];
  const f = new Function(src + '; return sumTickerDeltas;')();
  const series = {
    OLD: [{ snapshot_date: '2026-10-30', aum_delta_usd: null }, { snapshot_date: '2026-10-31', aum_delta_usd: -2 }],
    NEW: [{ snapshot_date: '2026-10-31', aum_usd: 300, aum_delta_usd: null }],
  };
  check('a fund with no prior figure adds nothing to the change', f(series, '2026-10-31') === -2);
  check('no deltas at all gives null', f({ NEW: series.NEW }, '2026-10-31') === null);
}
for (const leak of ['aggregator', 'discovery loop', "SEC's", 'public-source', 'scraper', 'static HTML']) {
  check(`no "${leak}" in page copy`, !html.includes(leak) && !js.replace(/\/\/.*$/gm, '').includes(leak));
}
check('payment options listed in full', html.includes('Pay in RLUSD or XRP on the XRP Ledger, or USDC on Base.'));
check('AUM change is not presented as pure inflow', html.includes('A rise can come from the XRP price rather than new money.'));
// The stacked chart said "Other 10 funds" while 3 of them had no figures.
check('Other band counts only funds with data', js.includes('XRChart.topN(chartTickers, latestAum)'));
console.log(fails ? `${fails} FAILED` : 'flows copy: ok');
process.exit(fails ? 1 : 0);
