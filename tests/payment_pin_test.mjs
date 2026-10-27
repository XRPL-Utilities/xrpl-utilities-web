// Payment quote pinning for the browser invoice flows.
//
// 2026-10-27 audit: /sentinel/bulk/ and /telemetry/ rendered the recipient,
// wallet link and (on Telemetry) a server-made QR image straight from the
// quote response, so a tampered quote paid an attacker while the page looked
// normal. Telemetry's manual rows also left out the destination tag, so a
// payer copying them by hand was never credited. This drives both flows with
// good and tampered quotes in a fake DOM and checks that only the hardcoded
// treasury is ever shown, the link and QR are rebuilt from checked values, and
// a bad quote is refused before any polling starts.
//
// Run: node tests/payment_pin_test.mjs
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TREASURY = 'rKxTzCKYKPPdXEzuioEQ6KekQK26w2DBd5';
const ATTACKER = 'rN7n7otQDd6FczFgLdSqtcsAUxDkw6fzRH';

let fails = 0;
function check(name, cond, extra = '') {
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + extra));
  if (!cond) fails++;
}

class Node {
  constructor(tag = 'div') {
    this.tagName = tag; this.children = []; this.ownText = ''; this.attrs = {};
    this.style = {}; this.dataset = {}; this.href = ''; this.src = '';
    this.classList = { add() {}, remove() {}, contains() { return false; } };
  }
  appendChild(c) { this.children.push(c); return c; }
  addEventListener() {}
  setAttribute(k, v) { this.attrs[k] = v; }
  remove() {} replaceWith() {} scrollIntoView() {}
  querySelector() { return null; }
  querySelectorAll() { return []; }
  set textContent(v) { this.ownText = v == null ? '' : String(v); this.children = []; }
  get textContent() { return [this.ownText].concat(this.children.map((c) => c.textContent)).filter(Boolean).join('\n'); }
  set innerHTML(_v) { this.ownText = ''; this.children = []; }
  all() { return [this].concat(...this.children.map((c) => c.all())); }
}

function load(file, quote) {
  const calls = [];
  const qrTexts = [];
  const ctx = {
    console, Math, JSON, Date, Number, String, Boolean, Array, Object, Error, Promise, AbortController,
    isFinite, isNaN, Node,
    setTimeout() {}, clearTimeout() {}, setInterval() {}, clearInterval() {},
    fetch: async (url) => {
      calls.push(String(url));
      return { ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(quote)) };
    },
    XRQr: { toCanvas(text) { qrTexts.push(text); return new Node('canvas'); } },
    document: {
      createElement: (t) => new Node(t), getElementById: () => null,
      querySelector: () => null, querySelectorAll: () => [], addEventListener() {},
    },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    navigator: { clipboard: { writeText: async () => {} } },
  };
  ctx.window = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(repo, 'assets/pay-pin.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(repo, file), 'utf8'), ctx);
  return { ctx, calls, qrTexts };
}

async function run(flow, quote) {
  const file = flow === 'sentinel' ? 'assets/scan-flow.js' : 'assets/telemetry-flow.js';
  const env = load(file, quote);
  const target = new Node('div');
  const p = flow === 'sentinel'
    ? env.ctx.XRSentinelScan.start(target, [TREASURY])
    : env.ctx.XRTelemetryScan.start(target);
  p.catch(() => {});
  for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r));
  const nodes = target.all();
  return {
    text: target.textContent,
    hrefs: nodes.map((n) => n.href).filter(Boolean),
    imgs: nodes.filter((n) => n.tagName === 'img').map((n) => n.src),
    qr: env.qrTexts,
    polled: env.calls.length > 1,
  };
}

const goodSentinel = {
  invoice_id: 'inv1', address_count: 1, recipient: TREASURY, destination_tag: 4242,
  amount_drops: 41000, amount_xrp: '0.041', xrp_usd_at_quote: 2.4390,
  deep_link: `xrpl://${TREASURY}?amount=0.041&dt=4242`, expires_in_seconds: 1800,
};
const goodTelemetry = {
  invoice_id: 'inv2', amount_drops: 205000, destination: TREASURY, destination_tag: 77,
  deep_link: `xrpl://${TREASURY}?amount=0.205&dt=77`,
  qr_code: 'data:image/png;base64,AAAA', expires_at: Math.floor(Date.now() / 1000) + 1800,
};

for (const [flow, good, field] of [['sentinel', goodSentinel, 'recipient'], ['telemetry', goodTelemetry, 'destination']]) {
  const ok = await run(flow, good);
  const tag = good.destination_tag;
  const expected = `xrpl://${TREASURY}?amount=${(good.amount_drops / 1e6).toString()}&dt=${tag}`;
  check(`${flow}: valid quote renders the pay button from checked values`, ok.hrefs.includes(expected), JSON.stringify(ok.hrefs));
  check(`${flow}: QR is encoded locally from the same link`, ok.qr.length === 1 && ok.qr[0] === expected, JSON.stringify(ok.qr));
  check(`${flow}: no server-supplied QR image`, ok.imgs.length === 0, JSON.stringify(ok.imgs));
  check(`${flow}: manual rows show the destination tag`, ok.text.includes('Destination Tag') && ok.text.includes(String(tag)), ok.text);
  check(`${flow}: valid quote starts polling`, ok.polled);

  const tampered = [
    ['recipient swapped', { [field]: ATTACKER, deep_link: `xrpl://${ATTACKER}?amount=0.041&dt=1` }],
    ['only the deep link swapped', { deep_link: `xrpl://${ATTACKER}?amount=0.041&dt=${tag}` }],
    ['javascript link', { deep_link: 'javascript:alert(1)' }],
    ['amount too large', { amount_drops: 99999 * 1e6, amount_xrp: '99999' }],
    ['amount negative', { amount_drops: -5, amount_xrp: '-0.000005' }],
    ['amount not a number', { amount_drops: '1e9', amount_xrp: undefined }],
    ['tag missing', { destination_tag: undefined }],
    ['tag out of range', { destination_tag: 4294967296 }],
    ['recipient case-altered', { [field]: TREASURY.replace(/^r/, 'R') }],
  ];
  if (flow === 'sentinel') tampered.push(['amounts disagree', { amount_xrp: '41' }]);
  for (const [name, patch] of tampered) {
    const q = Object.assign({}, good, patch);
    const out = await run(flow, q);
    const leaked = out.hrefs.concat(out.qr, out.imgs).some((s) => s.includes(ATTACKER) || s.startsWith('javascript'));
    const shownAttacker = out.text.includes(ATTACKER);
    if (name === 'only the deep link swapped' || name === 'javascript link') {
      check(`${flow}: ${name}: server link ignored, treasury link used`, !leaked && !shownAttacker && out.hrefs.some((h) => h.startsWith(`xrpl://${TREASURY}?`)), JSON.stringify(out.hrefs));
    } else {
      check(`${flow}: ${name}: refused`, !leaked && !shownAttacker && out.hrefs.length === 0 && out.qr.length === 0 && /was not shown/.test(out.text), out.text);
      check(`${flow}: ${name}: no polling started`, !out.polled);
    }
  }
}
process.exit(fails ? 1 : 0);
