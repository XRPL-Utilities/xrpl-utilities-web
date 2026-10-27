// Charts share one palette and fold long tails into "Other" (design review,
// 2026-10-27). The Flows ETF chart had 15 tickers on a 12-color list, so the
// last three fell back to generated blues next to the brand cyan; the Vault
// settlement chart hashed issuer names to hues and put four issuers in reds.
//
// Run: node tests/chart_palette_test.mjs
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(repo, p), 'utf8');
let fails = 0;
const fail = (m) => { fails++; console.log('FAIL ' + m); };
const eq = (got, want, what) => { if (JSON.stringify(got) !== JSON.stringify(want)) fail(`${what}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); };

const sandbox = { window: {} };
vm.runInNewContext(read('assets/chart-palette.js'), sandbox);
const X = sandbox.window.XRChart;
if (!X) { console.log('FAIL chart-palette.js did not define window.XRChart'); process.exit(1); }

// The validated order. Changing it means re-running the color-blind check.
eq([...X.SERIES], ['#0a9fdc', '#d95926', '#9085e9', '#c98500', '#d55181'], 'SERIES');
if (new Set(X.SERIES.concat([X.OTHER])).size !== 6) fail('palette has a repeated color');

const tickers = Array.from({ length: 15 }, (_, i) => 'T' + i);
const size = (t) => 100 - Number(t.slice(1));
const r15 = X.topN(tickers, size);
eq(r15.top, ['T0', 'T1', 'T2', 'T3', 'T4'], 'topN top of 15');
eq(r15.rest.length, 10, 'topN rest of 15');
const r6 = X.topN(tickers.slice(0, 6), size);
if (r6.top.length > X.SERIES.length) fail(`topN gave ${r6.top.length} colored series, palette has ${X.SERIES.length}`);
eq(X.topN(['a', 'b'], () => 0).top, ['a', 'b'], 'topN keeps input order on ties');
eq(X.topN(tickers, size, 4).top.length, 4, 'topN honors n');

eq(X.compact(80000000, 'XRP'), '80M XRP', 'compact XRP');
eq(X.compact(2130000000, '$'), '$2.1B', 'compact $B');
eq(X.compact(-540000, '$'), '-$540K', 'compact negative');
eq(X.compact(1000000, '$'), '$1M', 'compact trims .0');
eq(X.compact(NaN, '$'), '', 'compact NaN');

for (const f of ['assets/pages/flows.js', 'assets/pages/vault.js']) {
  const src = read(f);
  if (/hsl\(/.test(src)) fail(`${f}: generates hues instead of using the shared palette`);
  if (/function labelColor/.test(src)) fail(`${f}: keeps its own per-label color picker`);
  if (!/XRChart\.topN/.test(src)) fail(`${f}: does not fold long tails into Other`);
}
const flows = read('assets/pages/flows.js');
if (!/XRChart\.compact\(v, 'XRP'\)/.test(flows)) fail('flows.js: exchange-flow axis has no XRP unit');
if (/stack: 'delta'/.test(flows)) fail('flows.js: daily AUM change is still stacked per ticker instead of one net bar');

for (const page of ['flows/index.html', 'vault/index.html']) {
  const html = read(page);
  const pal = html.indexOf('/assets/chart-palette.js');
  const own = html.indexOf('/assets/pages/' + page.split('/')[0] + '.js');
  if (pal === -1 || own === -1 || pal > own) fail(`${page}: chart-palette.js must load before the page script`);
}

if (!/Peak \$\{fmtUsd\(peakVal\)\}/.test(read('assets/pages/pulse.js'))) fail('pulse.js: hourly volume bars have no scale or peak label');

console.log('chart palette: ' + (fails ? fails + ' failure(s)' : 'ok'));
process.exit(fails ? 1 : 0);
