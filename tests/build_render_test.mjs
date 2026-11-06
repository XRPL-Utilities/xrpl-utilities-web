// /build/ page script: API text lands as text, never as markup, and the
// live call goes only to the bundle visitors get free.
//
// Run: node tests/build_render_test.mjs
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const js = fs.readFileSync(path.join(repo, 'assets/pages/build.js'), 'utf8');
const html = fs.readFileSync(path.join(repo, 'build/index.html'), 'utf8');
let fails = 0;
const check = (name, cond) => { console.log((cond ? 'PASS ' : 'FAIL ') + name); if (!cond) fails++; };

check('build.js never writes HTML', !/\b(innerHTML|outerHTML|insertAdjacentHTML)\b|document\.write/.test(js));
check('live call is the free market briefing only',
  (js.match(/https:\/\/[a-z.]+xrpl-utilities\.io[^'"]*/g) || []).every((u) => u === 'https://pulse.xrpl-utilities.io/bundles/xrp-market-briefing'));
check('page loads samples before the page script',
  html.indexOf('/assets/pages/build-samples.js') > 0 && html.indexOf('/assets/pages/build-samples.js') < html.indexOf('/assets/pages/build.js'));
check('page loads api-resilient.js for the visitor pass', html.includes('/assets/api-resilient.js'));
check('worker serves /build as a page', /"\/build"/.test(fs.readFileSync(path.join(repo, '_worker.js'), 'utf8')));

// Render with hostile summaries and a failing live call.
const evil = '<img src=x onerror=alert(1)>';
const made = [];
function el(attrs = {}, tag = 'div') {
  const e = { tag, attrs, hidden: false, className: '', children: [], _t: '', listeners: {},
    set textContent(v) { this._t = String(v); this.children = []; }, get textContent() { return this._t + this.children.map((c) => c.textContent).join('|'); },
    getAttribute(k) { return this.attrs[k]; }, setAttribute(k, v) { this.attrs[k] = v; },
    addEventListener(t, f) { this.listeners[t] = f; }, focus() {},
    appendChild(c) { this.children.push(c); return c; }, replaceChildren(...c) { this._t = ''; this.children = c; } };
  made.push(e);
  return e;
}
const panels = ['xrp-market-briefing', 'wallet-check', 'xrpl-network-snapshot'].map((b) => {
  const p = el({ 'data-bundle': b });
  p.pre = el(); p.status = el(); p.table = el();
  p.querySelector = (sel) => (sel === '.answer' ? p.pre : sel === '.answer-table' ? p.table : p.status);
  return p;
});
const btnJson = el({ 'data-view': 'json', 'aria-pressed': 'true' });
const btnTable = el({ 'data-view': 'table', 'aria-pressed': 'false' });
const agent = el();
const doc = {
  querySelectorAll: (sel) => (sel === '.case-panel' ? panels : sel === '.view-btn' ? [btnJson, btnTable]
    : sel === '.answer' ? panels.map((p) => p.pre) : sel === '.answer-table' ? panels.map((p) => p.table) : []),
  querySelector: (sel) => panels.find((p) => sel.includes(p.attrs['data-bundle'])) || null,
  getElementById: (id) => (id === 'agent-answer' ? agent : null),
  createElement: (tag) => el({}, tag),
};
const sample = (b) => ({ bundle: b, generated_at: '2026-11-05T21:13:24Z', summary: evil,
  key_numbers: { known_as: evil, role: null, xrp_net_90d: null, statement_partial: true, name: null, jurisdiction: null, is_domain_operator: false, sell_10m_usd_slippage_bps_xrp_rlusd: 6133.19,
    exchange_net_flow_24h_usd: 85646867.22, top_holder_pct: 0.745796, xrp_funds_xrp_held: 1712041943.6, next_escrow_unlock_date: '2026-12-01T00:00:00Z', brand_new_field: 7 },
  sections: { s: { source: 'XR-Pulse', status: 'ok', as_of: '2026-11-05T21:13:00Z' } } });
let calls = 0;
const store = {};
const ctx = {
  window: { XRU_BUILD_SAMPLES: { captured_at: '2026-11-05T21:13:23Z', bundles: {
    'xrp-market-briefing': sample('xrp-market-briefing'), 'wallet-check': sample('wallet-check'),
    'xrpl-network-snapshot': sample('xrpl-network-snapshot') } }, addEventListener() {} },
  document: doc, location: { hash: '' }, history: { replaceState() {} },
  sessionStorage: { getItem: (k) => store[k] || null, setItem: (k, v) => { store[k] = v; } },
  fetch: () => { calls++; return Promise.reject(new Error('blocked')); },
  setTimeout, clearTimeout, AbortController, JSON, Object, Array, Date, isNaN, isFinite, Math, Number, String,
};
vm.createContext(ctx);
vm.runInContext(js, ctx);
await new Promise((r) => setTimeout(r, 20));
check('one live call', calls === 1);
check('failed live call falls back to the stored answer', panels[0].status.textContent === 'Stored answer from Nov 5, 2026');
check('stored tab is labelled with its date', panels[1].status.textContent === 'Stored answer from Nov 5, 2026');
check('hostile summary is shown as text inside JSON', panels[1].pre.textContent.includes(JSON.stringify(evil)));
check('sections are shown shortened', panels[1].pre.textContent.includes('"data": { … }'));
check('agent answer is the snapshot summary, as text', agent.textContent === evil);

// Table view
const tableText = panels[1].table.textContent;
check('table holds the summary as text', panels[1].table.children[0].tag === 'p' && panels[1].table.children[0].textContent === evil);
check('table shows a hostile value as text', tableText.includes(evil));
check('an empty role says none is on file', tableText.includes('Role|None on file'));
check('empty net XRP on a partial history says why', tableText.includes('Net XRP, last 90 days|Not counted, history is partial'));
check('empty venue name and jurisdiction say why', tableText.includes('Name|No public name') && tableText.includes('Jurisdiction|Not disclosed'));
check('the four known blanks never read "Not available"', !/(Role|Net XRP, last 90 days|Name|Jurisdiction)\|Not available/.test(tableText));
check('false reads "No"', tableText.includes('Runs a permissioned domain|No'));
check('bps reads as a percent', tableText.includes('61.3% (6,133 bps)'));
check('a flow carries its sign', tableText.includes('+$85.6M'));
check('a holding carries no sign', tableText.includes('XRP held by funds|1.71B XRP'));
check('a UTC calendar date stays on its day', tableText.includes('Next Ripple escrow unlock|Dec 1, 2026'));
check('share reads as a percent', tableText.includes('74.6%'));
check('an unknown field still shows under its own name', tableText.includes('brand new field|7'));
check('sources are listed', tableText.includes('From: XR-Pulse.'));
check('JSON view is the default', !panels[1].pre.hidden && panels[1].table.hidden);
btnTable.listeners.click({ currentTarget: btnTable });
check('Table button shows every table and hides the JSON', panels.every((p) => p.pre.hidden && !p.table.hidden));
check('Table button is pressed', btnTable.attrs['aria-pressed'] === 'true' && btnJson.attrs['aria-pressed'] === 'false');
check('choice is kept for the visit', store.xru_build_view_v1 === 'table');
btnJson.listeners.click({ currentTarget: btnJson });
check('JSON button brings the JSON back', panels.every((p) => !p.pre.hidden && p.table.hidden));
check('page has a JSON and Table switch on all six answers',
  (html.match(/data-view="json"/g) || []).length === 6 && (html.match(/data-view="table"/g) || []).length === 6);
// close_out.sh fails the public repo on these names (AI fingerprint scrub).
check('page names no AI vendor or product', !/Claude Code|Co-Authored-By: Claude|ChatGPT|GPT-4|claude\.ai/i.test(html));
process.exit(fails ? 1 : 0);
