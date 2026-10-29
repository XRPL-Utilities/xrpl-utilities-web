// Failure handling on the live pages (P1 audit, 2026-10-27).
//
// Each check pins one way a page used to fail badly:
// - api-resilient.js treated a caller's own abort as a blocked network,
//   retried it through the proxy and switched the whole session to proxy mode.
// - The free Sentinel scan had no deadline, so a stalled request spun forever.
// - A 402 or a non-string error detail was shown to the visitor as raw JSON.
// - Home stamped "as of <now>" even when every source had failed, and Vault,
//   Home and Flows gave no sign that their numbers had stopped updating.
// - The Flows map waited forever for d3 if the CDN was blocked.
//
// Run: node tests/resilience_test.mjs
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(repo, f), 'utf8');
let fails = 0;
function check(name, cond, extra = '') {
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + extra));
  if (!cond) fails++;
}
const tick = async (n = 30) => { for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r)); };

class Node {
  constructor(tag = 'div') {
    this.tagName = tag; this.children = []; this.ownText = ''; this.attrs = {}; this.style = {};
    this.dataset = {}; this.className = ''; this.id = '';
    const self = this;
    this.classList = {
      add(c) { if (!self.className.split(' ').includes(c)) self.className = (self.className + ' ' + c).trim(); },
      remove(c) { self.className = self.className.split(' ').filter((x) => x !== c).join(' '); },
      contains(c) { return self.className.split(' ').includes(c); },
    };
  }
  appendChild(c) { this.children.push(c); return c; }
  replaceChildren() { this.children = []; this.ownText = ''; }
  addEventListener() {}
  setAttribute(k, v) { this.attrs[k] = v; }
  removeAttribute(k) { delete this.attrs[k]; }
  remove() {} replaceWith() {} scrollIntoView() {}
  querySelector() { return null; }
  querySelectorAll() { return []; }
  set textContent(v) { this.ownText = v == null ? '' : String(v); this.children = []; }
  get textContent() { return [this.ownText].concat(this.children.map((c) => c.textContent)).filter(Boolean).join('\n'); }
  set innerHTML(_v) { this.ownText = ''; this.children = []; }
}

function context(extra) {
  const byId = {};
  const ctx = Object.assign({
    console, Math, JSON, Date, Number, String, Boolean, Array, Object, Error, Promise, Set,
    isFinite, isNaN, URL, AbortController,
    setTimeout, clearTimeout, setInterval: () => 0, clearInterval() {},
    document: {
      title: '', body: new Node('body'),
      createElement: (t) => new Node(t),
      getElementById: (id) => byId[id] || null,
      querySelector: () => null, querySelectorAll: () => [], addEventListener() {},
    },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    location: { href: 'https://xrpl-utilities.com/' },
  }, extra);
  ctx.byId = byId;
  ctx.window = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  return ctx;
}

// ---- api-resilient.js ------------------------------------------------------
{
  const calls = [];
  const ctx = context({
    Request: class {},
    fetch: async (url, init) => {
      calls.push(String(url));
      if (String(url).startsWith('https://')) {
        if (init && init.signal && init.signal.aborted) { const e = new Error('aborted'); e.name = 'AbortError'; throw e; }
        throw new TypeError('Failed to fetch');
      }
      return { ok: true, status: 200 };
    },
  });
  vm.runInContext(read('assets/api-resilient.js'), ctx);
  const ctrl = new AbortController(); ctrl.abort();
  let aborted = null;
  try { await ctx.fetch('https://sentinel.xrpl-utilities.io/scan', { signal: ctrl.signal }); } catch (e) { aborted = e; }
  check('resilient: a caller abort is rethrown', aborted && aborted.name === 'AbortError', String(aborted));
  check('resilient: a caller abort is not retried through the proxy', !calls.some((u) => u.startsWith('/api/x/')), JSON.stringify(calls));
  check('resilient: a caller abort does not switch the session to proxy mode', ctx.XRUApiResilient.isProxyMode() === false);
  calls.length = 0;
  const r = await ctx.fetch('https://pulse.xrpl-utilities.io/healthz');
  check('resilient: a real network failure still falls back to the proxy', r.ok && calls[1] === '/api/x/pulse/healthz', JSON.stringify(calls));
}

// A free-preview 402 on the direct path (the token was minted from another
// address, as on carrier NAT pools or iCloud Private Relay) is retried once
// through /api/x, which rides the connection the token was minted on. A paid
// call's 402 is never replayed.
{
  const calls = [];
  let proxyStatus = 200;
  const ctx = context({
    Request: class {},
    fetch: async (url, init) => {
      calls.push([String(url), init]);
      if (String(url).startsWith('https://')) return { ok: false, status: 402 };
      return { ok: proxyStatus === 200, status: proxyStatus };
    },
  });
  vm.runInContext(read('assets/api-resilient.js'), ctx);
  const bearer = { 'Content-Type': 'application/json', Authorization: 'Bearer abc.def.ghi' };
  let r = await ctx.fetch('https://telemetry.xrpl-utilities.io/scan', { method: 'POST', headers: bearer, body: '{}' });
  check('preview 402: retried through the proxy', r.status === 200 && calls.length === 2 && calls[1][0] === '/api/x/telemetry/scan', JSON.stringify(calls.map((c) => c[0])));
  check('preview 402: the retry keeps method, token and body', calls[1][1].method === 'POST' && calls[1][1].headers.Authorization === bearer.Authorization && calls[1][1].body === '{}');
  check('preview 402: later preview calls go straight to the proxy', ctx.XRUApiResilient.isPreviewViaProxy() === true);
  calls.length = 0;
  await ctx.fetch('https://trust.xrpl-utilities.io/domains', { headers: { Authorization: 'Bearer abc.def.ghi' } });
  check('preview 402: sticky mode skips the failing direct call', calls.length === 1 && calls[0][0] === '/api/x/trust/domains', JSON.stringify(calls.map((c) => c[0])));
  check('preview 402: sticky mode does not switch unauthenticated calls', ctx.XRUApiResilient.isProxyMode() === false);

  ctx.XRUApiResilient._reset(); calls.length = 0;
  r = await ctx.fetch('https://sentinel.xrpl-utilities.io/scan', { method: 'POST', headers: { 'PAYMENT-SIGNATURE': 'x', Authorization: 'Bearer abc' }, body: '{}' });
  check('paid 402: never replayed', r.status === 402 && calls.length === 1, JSON.stringify(calls.map((c) => c[0])));
  calls.length = 0;
  r = await ctx.fetch('https://sentinel.xrpl-utilities.io/scan', { method: 'POST', body: '{}' });
  check('no-token 402: never replayed', r.status === 402 && calls.length === 1);

  proxyStatus = 402; calls.length = 0;
  r = await ctx.fetch('https://pulse.xrpl-utilities.io/events/recent', { headers: { Authorization: 'Bearer abc.def.ghi' } });
  check('preview 402 twice: the caller sees the 402', r.status === 402 && calls.length === 2);
  check('preview 402 twice: proxy mode is not made sticky', ctx.XRUApiResilient.isPreviewViaProxy() === false);
}

// ---- scan-flow.js / telemetry-flow.js error paths ------------------------------
async function runFlow(file, start, fetchImpl, opts = {}) {
  let cleared = 0;
  const ctx = context({
    fetch: fetchImpl,
    PreviewToken: { authHeaders: async () => ({}), _clear() { cleared++; } },
    // Deadlines fire at once so the hang path finishes inside the test.
    setTimeout: opts.instantTimers ? (fn) => setImmediate(fn) : setTimeout,
    Blob: class {}, navigator: { clipboard: { writeText: async () => {} } },
  });
  vm.runInContext(read(file), ctx);
  const target = new Node('div');
  start(ctx, target).catch(() => {});
  await tick();
  return { text: target.textContent, cleared };
}
const startSentinel = (ctx, t) => ctx.XRSentinelScan.startSingle(t, 'rKxTzCKYKPPdXEzuioEQ6KekQK26w2DBd5');
const startTelemetry = (ctx, t) => ctx.XRTelemetryScan.startPreview(t);
const hang = (url, init) => new Promise((_, reject) => {
  init.signal.addEventListener('abort', () => { const e = new Error('aborted'); e.name = 'AbortError'; reject(e); });
});
const envelope = { x402Version: 1, error: 'payment required', accepts: [{ scheme: 'exact', network: 'xrpl', payTo: 'rKxTzCKYKPPdXEzuioEQ6KekQK26w2DBd5' }] };
const respond = (status, body) => async () => ({ ok: status < 400, status, json: async () => body });

for (const [name, file, start] of [['sentinel', 'assets/scan-flow.js', startSentinel], ['telemetry', 'assets/telemetry-flow.js', startTelemetry]]) {
  const timedOut = await runFlow(file, start, hang, { instantTimers: true });
  check(`${name}: a stalled request ends with a timeout message`, /took too long/.test(timedOut.text), timedOut.text);

  const paid = await runFlow(file, start, respond(402, envelope));
  check(`${name}: a 402 does not show the payment envelope`, !/accepts|payTo|x402Version|\{/.test(paid.text), paid.text);
  check(`${name}: a 402 says to reload and try again`, /Reload the page and try again/.test(paid.text), paid.text);
  check(`${name}: a 402 drops the cached preview token`, paid.cleared === 1);

  const listDetail = await runFlow(file, start, respond(422, { detail: [{ loc: ['body', 'address'], msg: 'bad' }] }));
  check(`${name}: a non-string detail is not stringified`, !/\{|\[/.test(listDetail.text) && /HTTP 422/.test(listDetail.text), listDetail.text);

  const down = await runFlow(file, start, respond(503, { detail: 'ai_provider_unavailable: upstream timeout' }));
  check(`${name}: a short string detail is still shown`, /ai_provider_unavailable/.test(down.text), down.text);
}

// ---- stale-banner.js -----------------------------------------------------------
{
  const ctx = context({});
  vm.runInContext(read('assets/stale-banner.js'), ctx);
  const box = () => ctx.document.body.children.find((c) => c.id === 'stale-notice');
  ctx.XRStale.fail('a');
  check('stale: a source that never loaded raises the notice', box() && !box().classList.contains('hidden') && /could not be loaded/.test(box().textContent), box() && box().textContent);
  check('stale: the notice is announced politely', box().attrs['aria-live'] === 'polite' && box().attrs.role === 'status');
  ctx.XRStale.ok('a');
  check('stale: recovery hides the notice', box().classList.contains('hidden'));
  ctx.XRStale.fail('a');
  check('stale: a source that loaded before says when', /delayed.*last update from \d\d:\d\d UTC/.test(box().textContent), box().textContent);
  ctx.XRStale.ok('a');
}

// ---- home: "as of" only on a full refresh ---------------------------------------
{
  const ctx = context({ fetch: async () => { throw new TypeError('Failed to fetch'); } });
  vm.runInContext(read('assets/stale-banner.js'), ctx);
  const asOf = new Node('span'); asOf.textContent = 'as of 09:00 UTC';
  ctx.byId['live-state-asof'] = asOf;
  vm.runInContext(read('assets/poll.js'), ctx); // loaded before home-2.js, as on the page
  vm.runInContext(read('assets/pages/home-2.js'), ctx);
  await tick();
  check('home: a failed refresh keeps the old "as of"', asOf.textContent === 'as of 09:00 UTC', asOf.textContent);
  check('home: every failed source reaches the stale notice', ctx.XRStale.failing().length === 8, JSON.stringify(ctx.XRStale.failing()));
}

// ---- pages load the notice and report to it ----------------------------------------
for (const [page, script] of [['index.html', 'assets/pages/home-2.js'], ['vault/index.html', 'assets/pages/vault.js'], ['flows/index.html', 'assets/pages/flows.js']]) {
  const html = read(page);
  const a = html.indexOf('/assets/stale-banner.js'), b = html.indexOf('/' + script);
  check(`${page}: loads stale-banner.js before its page script`, a !== -1 && b !== -1 && a < b);
  check(`${script}: reports failures to the stale notice`, /XRStale\.fail/.test(read(script)));
}

// ---- flows: the map start loop has a deadline -------------------------------------
{
  const src = read('assets/pages/flows.js');
  const loop = src.slice(src.indexOf('const startInterval'), src.indexOf('}, 200);', src.indexOf('const startInterval')));
  check('flows: the d3 wait gives up after a deadline', /MAP_WAIT_MS/.test(loop) && /else if/.test(loop), loop.slice(0, 200));
  check('flows: corridors still load without d3', /else if[\s\S]*start\(\)/.test(loop));
}

process.exit(fails ? 1 : 0);
