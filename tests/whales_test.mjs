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
check('page has the XRP-held-excluding-Ripple tile', html.includes('id="stat-total-ex-ripple"'));
check('page no longer shows a wallet count excluding Ripple', !html.includes('id="stat-ex-ripple"'));
check('page promises a top 10, not more', /10 largest/.test(html) && !/top 100/i.test(html));
check('Pulse links to the whales page', read('pulse/index.html').includes('href="/whales/"'));
check('worker serves /whales as a page', /"\/whales"/.test(read('_worker.js')) && /"\/whales"/.test(read('wrangler.jsonc')));

// Render with a hostile label and check it lands as text.
const nodes = [];
function mkEl(tag) {
  const e = { tag, className: '', children: [], style: {}, attrs: {}, _text: '',
    set textContent(v) { this._text = String(v); }, get textContent() { return this._text; },
    append(...c) { this.children.push(...c); }, replaceChildren() { this.children = []; },
    setAttribute(k, v) { this.attrs[k] = v; }, addEventListener() {}, querySelectorAll: () => [], title: '',
    get classList() { const cls = this.className.split(/\s+/); return { contains: (c) => cls.includes(c) }; } };
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
const A1 = 'rPyCQm8E5j78PDbrfKF24fRC7qUAk1kDMZ';
const A2 = 'rJ9Ey7HbscSECamgDRzvw5wrVbFUgaUDt7';
const A3 = 'rs8ZPbYqgecRcDzQpJYAMhSxSi5htsjnza';
const A4 = 'rDxJNbV23mu9xsWoQHoBqZQvc77YcbJXwb';
const payload = { stale: false, history: [], latest: {
  sample_date: '2026-11-01', captured_at: 1761960000, wallet_count: 2179, total_xrp: 50.9e9,
  excluding_ripple: { wallet_count: 2163, total_xrp: 47e9 },
  bands: [{ band: '1B+', wallets: 5, xrp: 8e9 }],
  categories: [{ category: evil, wallets: 1, xrp: 1e9 }],
  top: [
    { rank: 1, account: A1, balance_xrp: 1.8e9, category: evil, name: evil },
    { rank: 2, account: A2, balance_xrp: 1.7e9, category: 'Exchange', name: 'Kraken cold wallet' },
    { rank: 3, account: A3, balance_xrp: 1.6e9, category: 'Exchange', name: 'Krakenish' },
    { rank: 4, account: A4, balance_xrp: 1.5e9, category: 'Exchange', name: 'Bithumb' },
  ],
}, previous: {
  sample_date: '2026-10-31', captured_at: 1761900000, wallet_count: 2170, total_xrp: 51.0e9,
  excluding_ripple: { wallet_count: 2154, total_xrp: 47e9 },
  bands: [{ band: '1B+', wallets: 5, xrp: 7e9 }],
  categories: [{ category: evil, wallets: 1, xrp: 2e9 }],
  top: [{ rank: 1, account: A1, balance_xrp: 1.7e9 }, { rank: 2, account: A2, balance_xrp: 1.9e9 }, { rank: 3, account: A3, balance_xrp: 1.6e9 }],
} };
const icons = { icons: { kraken: 'kraken.webp', bithumb: 'bithumb.webp', evil: '../../x.svg' } };
const ctx = {
  document: doc, console,
  window: { addEventListener() {}, innerWidth: 1280 },
  fetch: async (u) => ({ ok: true, json: async () => (String(u).includes('owners.json') ? icons : payload) }),
  setInterval() {}, Math, Number, String, Array, Date, isFinite, Error,
};
vm.createContext(ctx);
vm.runInContext(js, ctx);
await new Promise((r) => setTimeout(r, 20));
check('count renders', byId['stat-count'].textContent === '2,179');
check('XRP held excluding Ripple renders', byId['stat-total-ex-ripple'].textContent === '47.00B');
check('Ripple share is named in the sub line', byId['stat-total-ex-ripple-sub'].textContent.includes('3.90B'));
const texts = nodes.map((n) => n._text);
check('hostile label is rendered as plain text', texts.includes(evil));
check('top table has one row per wallet', byId['top'].children.length === 4);

// Green up, red down, muted when flat.
const textOf = (id) => (byId[id].children[0] || {})._text || '';
const clsOf = (id) => (byId[id].children[0] || {}).className || '';
check('count up shows a green +9', textOf('stat-count-delta').includes('+9') && clsOf('stat-count-delta').includes('text-emerald-400'));
check('total down shows red', textOf('stat-total-delta').includes('\u2212100.0M') && clsOf('stat-total-delta').includes('text-red-400'));
check('flat total shows no change, muted', textOf('stat-total-ex-ripple-delta') === 'no change' && clsOf('stat-total-ex-ripple-delta').includes('text-muted'));
const green = nodes.filter((n) => n.className.includes('text-emerald-400')).map((n) => n._text);
const red = nodes.filter((n) => n.className.includes('text-red-400')).map((n) => n._text);
check('band XRP up is green', green.some((t) => t.includes('+1.00B')));
check('holder XRP down is red', red.some((t) => t.includes('\u22121.00B')));
check('top-10 wallet up is green and down is red', green.some((t) => t.includes('+100.0M')) && red.some((t) => t.includes('\u2212200.0M')));
check('a wallet new to the top 10 is marked', texts.includes('new in top 10'));

// Owner icons: prefix match on a whole word, unsafe file names dropped.
const imgs = nodes.filter((n) => n.tag === 'img').map((n) => n.src);
check('Kraken label gets the Kraken icon', imgs.includes('/assets/img/owners/kraken.webp'));
check('Bithumb gets its icon', imgs.includes('/assets/img/owners/bithumb.webp'));
check('Krakenish does not get the Kraken icon', imgs.length === 2);
check('an unsafe icon path is never used', !imgs.some((u) => u.includes('..')));

// Every icon in the manifest exists, and the hero art exists.
const manifest = JSON.parse(read('assets/img/owners/owners.json'));
const files = Object.values(manifest.icons);
check('icon manifest is not empty', files.length >= 10);
check('every manifest icon file exists and is a safe name', files.every((f) => /^[a-z0-9-]{1,40}\.webp$/.test(f) && fs.existsSync(path.join(repo, 'assets/img/owners', f))));
check('every manifest key is lower case', Object.keys(manifest.icons).every((k) => k === k.toLowerCase()));
for (const owner of ['bithumb', 'robinhood', 'binance', 'upbit', 'ripple', 'bitbank', 'coincheck']) {
  check(`today's top-10 owner ${owner} has an icon`, owner in manifest.icons);
}
check('hero whale art exists and is on the page', fs.existsSync(path.join(repo, 'assets/img/xr-whales-512.webp')) && html.includes('/assets/img/xr-whales-512.webp'));

if (fails) { console.error(`${fails} whales check(s) failed`); process.exit(1); }
console.log('whales checks passed');
