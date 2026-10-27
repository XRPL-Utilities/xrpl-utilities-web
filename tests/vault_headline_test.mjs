// Vault RWA headline: JMWH stays out of the headline figure.
//
// 2026-10-26 audit: Justoken JMWH made up 55% of the "Total tracked RWA"
// headline ($2.23B of $4.05B on 2026-10-27), priced at $60/MWh, a figure
// only the issuer publishes (no DEX offers, no AMM, no TOML price). The
// headline now leads with the total without it and shows the all-in figure
// underneath. Fixture: the live /stats/rwa-summary from 2026-10-27.
//
// Run: node tests/vault_headline_test.mjs
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const body = JSON.parse(fs.readFileSync(path.join(repo, 'tests/fixtures/rwa-summary-2026-10-27.json'), 'utf8'));

function fakeEl() {
  const classes = new Set();
  return {
    innerHTML: '', textContent: '', style: {}, dataset: {},
    classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c), contains: (c) => classes.has(c), toggle() {} },
    addEventListener() {}, querySelectorAll() { return []; }, querySelector() { return null; },
    setAttribute() {}, getAttribute() { return null; }, appendChild() {}, remove() {},
    getContext() { return null; },
  };
}
const nodes = {};
const ctx = {
  console, JSON, Math, Number, String, Set, Map, Array, Object, Date, isFinite, parseFloat, parseInt,
  document: {
    getElementById(id) { return (nodes[id] = nodes[id] || fakeEl()); },
    querySelectorAll() { return []; }, querySelector() { return null; },
    createElement: fakeEl, addEventListener() {}, body: fakeEl(),
  },
  window: {}, localStorage: { getItem() { return null; }, setItem() {} },
  fetch: () => new Promise(() => {}),
  pollWhileVisible() {}, setTimeout() {}, setInterval() {}, clearInterval() {},
  XRStale: { ok() {}, fail() {} },
};
ctx.globalThis = ctx;
ctx.window = ctx;
ctx.addEventListener = () => {};
ctx.innerWidth = 1280;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(repo, 'assets/pages/vault.js'), 'utf8'), ctx);

let fails = 0;
function check(name, cond, extra = '') {
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + extra));
  if (!cond) fails++;
}

vm.runInContext('renderSummary', ctx)(body);
const headline = nodes['stat-usd-pegged-total'].textContent;
const incl = nodes['stat-usd-pegged-incl'];
check('headline leaves JMWH out ($4.05B - $2.23B)', headline === '$1.82B', headline);
check('all-in total is shown under it', incl.textContent.startsWith('$4.05B including JMWH at an issuer-stated $60/MWh'), incl.textContent);
check('all-in line is visible', !incl.classList.contains('hidden'));
check('issuer count drops JMWH', /^19 issuers converted/.test(nodes['stat-usd-pegged-detail'].textContent), nodes['stat-usd-pegged-detail'].textContent);

// Without JMWH in the data the headline is the plain total and the line hides.
const noJ = JSON.parse(JSON.stringify(body));
const agg = noJ.usd_pegged_aggregate;
const j = agg.included.find((r) => r.currency === 'JMWH');
agg.included = agg.included.filter((r) => r !== j);
agg.total_usd -= j.usd_equivalent;
agg.issuer_count_included -= 1;
vm.runInContext('renderSummary', ctx)(noJ);
check('no JMWH: headline is the plain total', nodes['stat-usd-pegged-total'].textContent === '$1.82B', nodes['stat-usd-pegged-total'].textContent);
check('no JMWH: the all-in line hides', incl.classList.contains('hidden') && incl.textContent === '');

// Trustline counts that stopped at Pulse's page cap are a floor, not a count
// (2026-10-27: RLUSD read "2000" against ~93k real trustlines).
const tileIssuer = (extra) => Object.assign({ label: 'Ripple RLUSD', logical_label: 'Ripple RLUSD', wallet: 'rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De', currency: 'RLUSD', asset_class: 'fiat_stable_usd', mint_status: 'live', token_standard: 'iou', circulating: '1001880101.99', net_24h: '7206553', trustline_count: 2000 }, extra);
vm.runInContext('renderIssuerTiles', ctx)([tileIssuer({ trustline_count_truncated: true })]);
check('capped trustline count renders with a plus', nodes['issuer-tiles'].innerHTML.includes('2,000+'), nodes['issuer-tiles'].innerHTML.slice(0, 200));
vm.runInContext('renderIssuerTiles', ctx)([tileIssuer({ trustline_count: 412, trustline_count_truncated: false })]);
check('exact trustline count renders without a plus', nodes['issuer-tiles'].innerHTML.includes('>412<'), '');

console.log(fails ? `${fails} FAILED` : 'vault headline: ok');
process.exit(fails ? 1 : 0);
