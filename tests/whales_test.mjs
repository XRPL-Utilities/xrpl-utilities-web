// /whales/ page guards (added 2026-10-31).
//
// Wallet labels and categories come from the Pulse API, so the page script
// must never write API text as HTML. The page also has to keep its promise:
// the 1M XRP definition, the count excluding Ripple, and a top 10 only.
//
// Run: node tests/whales_test.mjs
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(repo, f), 'utf8');
let fails = 0;
const check = (name, cond) => { console.log((cond ? 'PASS ' : 'FAIL ') + name); if (!cond) fails++; };

const js = read('assets/pages/whales.js');
const html = read('whales/index.html');

check('whales.js never assigns innerHTML or outerHTML', !/\b(innerHTML|outerHTML|insertAdjacentHTML)\b/.test(js));
check('whales.js has no document.write', !/document\.write/.test(js));
check('whales.js reads the Pulse whale census', js.includes('pulse.xrpl-utilities.io/stats/whales'));
check('page loads whales.js', html.includes('/assets/pages/whales.js'));
check('page states the 1 million XRP line', /at least 1 million XRP/.test(html));
check('page has the excluding-Ripple tile', html.includes('id="stat-ex-ripple"'));
check('page promises a top 10, not more', /10 largest/.test(html) && !/top 100/i.test(html));
check('Pulse links to the whales page', read('pulse/index.html').includes('href="/whales/"'));
check('worker serves /whales as a page', /"\/whales"/.test(read('_worker.js')) && /"\/whales"/.test(read('wrangler.jsonc')));

// Render with a hostile label and check it lands as text.
const nodes = [];
function mkEl(tag) {
  const e = { tag, className: '', children: [], style: {}, attrs: {}, _text: '',
    set textContent(v) { this._text = String(v); }, get textContent() { return this._text; },
    append(...c) { this.children.push(...c); }, replaceChildren() { this.children = []; },
    setAttribute(k, v) { this.attrs[k] = v; }, addEventListener() {}, querySelectorAll: () => [], title: '' };
  nodes.push(e);
  return e;
}
const byId = {};
const doc = {
  getElementById: (id) => (['nav-open', 'nav-close', 'mobile-nav'].includes(id) ? null : (byId[id] ||= mkEl('div'))),
  createElement: mkEl,
  addEventListener() {}, body: {}, hidden: false,
};
const evil = '<img src=x onerror=alert(1)>';
const payload = { stale: false, history: [], latest: {
  captured_at: 1761900000, wallet_count: 2179, total_xrp: 50.9e9,
  excluding_ripple: { wallet_count: 2163, total_xrp: 47e9 },
  bands: [{ band: '1B+', wallets: 5, xrp: 8e9 }],
  categories: [{ category: evil, wallets: 1, xrp: 1e9 }],
  top: [{ rank: 1, account: 'rPyCQm8E5j78PDbrfKF24fRC7qUAk1kDMZ', balance_xrp: 1.8e9, category: evil, name: evil }],
} };
const ctx = {
  document: doc, console,
  window: { addEventListener() {}, innerWidth: 1280 },
  fetch: async () => ({ ok: true, json: async () => payload }),
  setInterval() {}, Math, Number, String, Array, Date, isFinite, Error,
};
vm.createContext(ctx);
vm.runInContext(js, ctx);
await new Promise((r) => setTimeout(r, 20));
check('count renders', byId['stat-count'].textContent === '2,179');
check('excluding-Ripple count renders', byId['stat-ex-ripple'].textContent === '2,163');
const texts = nodes.map((n) => n._text);
check('hostile label is rendered as plain text', texts.includes(evil));
check('top table has one row per wallet', byId['top'].children.length === 1);

if (fails) { console.error(`${fails} whales check(s) failed`); process.exit(1); }
console.log('whales checks passed');
