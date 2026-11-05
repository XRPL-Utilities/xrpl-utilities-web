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
function el(attrs = {}) {
  return { attrs, hidden: false, _t: '', set textContent(v) { this._t = String(v); }, get textContent() { return this._t; },
    getAttribute(k) { return this.attrs[k]; }, setAttribute(k, v) { this.attrs[k] = v; }, addEventListener() {}, focus() {} };
}
const panels = ['xrp-market-briefing', 'wallet-check', 'xrpl-network-snapshot'].map((b) => {
  const p = el({ 'data-bundle': b });
  p.pre = el(); p.status = el();
  p.querySelector = (sel) => (sel === '.answer' ? p.pre : p.status);
  return p;
});
const agent = el();
const doc = {
  querySelectorAll: (sel) => (sel === '.case-panel' ? panels : []),
  querySelector: (sel) => panels.find((p) => sel.includes(p.attrs['data-bundle'])) || null,
  getElementById: (id) => (id === 'agent-answer' ? agent : null),
};
const sample = (b) => ({ bundle: b, generated_at: '2026-11-05T21:13:24Z', summary: evil, key_numbers: { a: evil },
  sections: { s: { source: 'XR-Pulse', status: 'ok', as_of: '2026-11-05T21:13:00Z' } } });
let calls = 0;
const ctx = {
  window: { XRU_BUILD_SAMPLES: { captured_at: '2026-11-05T21:13:23Z', bundles: {
    'xrp-market-briefing': sample('xrp-market-briefing'), 'wallet-check': sample('wallet-check'),
    'xrpl-network-snapshot': sample('xrpl-network-snapshot') } }, addEventListener() {} },
  document: doc, location: { hash: '' }, history: { replaceState() {} },
  fetch: () => { calls++; return Promise.reject(new Error('blocked')); },
  setTimeout, clearTimeout, AbortController, JSON, Object, Array, Date, isNaN,
};
ctx.window.addEventListener = () => {};
vm.createContext(ctx);
vm.runInContext(js, ctx);
await new Promise((r) => setTimeout(r, 20));
check('one live call', calls === 1);
check('failed live call falls back to the stored answer', panels[0].status.textContent === 'Stored answer from Nov 5, 2026');
check('stored tab is labelled with its date', panels[1].status.textContent === 'Stored answer from Nov 5, 2026');
check('hostile summary is shown as text inside JSON', panels[1].pre.textContent.includes(JSON.stringify(evil)));
check('sections are shown shortened', panels[1].pre.textContent.includes('"data": { … }'));
check('agent answer is the snapshot summary, as text', agent.textContent === evil);
process.exit(fails ? 1 : 0);
