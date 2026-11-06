// The visitor pass on paid data routes (2026-11-02).
//
// The API hosts are putting their data routes behind x402 for outside agents,
// free for this site's visitors who carry the preview token. A plain GET that
// comes back 402 must fetch the pass, retry once with it, and send it up front
// for the rest of the visit. Nothing may change while routes are still open.
//
// Run: node tests/visitor_pass_test.mjs
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = fs.readFileSync(path.join(repo, 'assets/api-resilient.js'), 'utf8');
let fails = 0;
function check(name, cond, extra = '') {
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + extra));
  if (!cond) fails++;
}

function setup({ status = () => 200, token = 'Bearer pass.jwt.sig', withLib = true, lib: customLib = null, sticky = false } = {}) {
  const calls = [];
  const scripts = [];
  let mints = 0;
  const lib = customLib || {
    authHeaders: async () => { mints++; return token ? { Authorization: token } : {}; },
  };
  const ctx = {
    console: { warn() {}, log() {} }, Promise, URL, Object, String, JSON,
    Request: class {},
    location: { href: 'https://xrpl-utilities.com/' },
    sessionStorage: { getItem: (k) => (sticky && k === 'xru_send_pass_v1' ? '1' : null), setItem() {}, removeItem() {} },
    document: {
      querySelector: () => null,
      createElement: () => ({}),
      head: { appendChild(el) { scripts.push(el.src); if (!withLib && el.src.includes('preview-token')) ctx.PreviewToken = lib; setTimeout(() => el.onload && el.onload(), 0); } },
    },
    setTimeout,
    fetch: async (url, init) => {
      calls.push([String(url), init]);
      const st = status(String(url), init);
      return { ok: st === 200, status: st };
    },
  };
  if (withLib) ctx.PreviewToken = lib;
  ctx.window = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  return { ctx, calls, scripts, mints: () => mints };
}
const auth = (init) => init && init.headers && init.headers.Authorization;

// Open route: no pass, no browser check, one call.
{
  const t = setup();
  const r = await t.ctx.fetch('https://pulse.xrpl-utilities.io/stats/whales');
  check('open route: served as before', r.status === 200 && t.calls.length === 1);
  check('open route: no pass sent', !auth(t.calls[0][1]));
  check('open route: no browser check run', t.mints() === 0);
}

// Gated route: 402, then retried once with the pass, then sticky.
{
  const t = setup({ status: (u, init) => (auth(init) ? 200 : 402) });
  const r = await t.ctx.fetch('https://pulse.xrpl-utilities.io/stats/whales', { cache: 'no-store' });
  check('gated route: retried with the pass and served', r.status === 200 && t.calls.length === 2, JSON.stringify(t.calls.map((c) => c[0])));
  check('gated route: retry carries the pass', auth(t.calls[1][1]) === 'Bearer pass.jwt.sig');
  check('gated route: retry keeps the caller options', t.calls[1][1].cache === 'no-store');
  check('gated route: later calls send the pass up front', t.ctx.XRUApiResilient.isSendingPass() === true);
  t.calls.length = 0;
  await t.ctx.fetch('https://vault.xrpl-utilities.io/stats/summary');
  check('sticky: one call, pass attached', t.calls.length === 1 && auth(t.calls[0][1]) === 'Bearer pass.jwt.sig');
}

// No pass available (blocker stopped the check): caller sees the original 402.
{
  const t = setup({ status: () => 402, token: null });
  const r = await t.ctx.fetch('https://pulse.xrpl-utilities.io/stats/whales');
  check('no pass: caller gets the 402', r.status === 402 && t.calls.length === 1);
  check('no pass: not sticky', t.ctx.XRUApiResilient.isSendingPass() === false);
}

// Pages without the token script load it (and Turnstile) on demand.
{
  const t = setup({ status: (u, init) => (auth(init) ? 200 : 402), withLib: false });
  const r = await t.ctx.fetch('https://pulse.xrpl-utilities.io/stats/whales');
  check('lazy load: token and Turnstile scripts loaded', t.scripts.some((s) => s.startsWith('/assets/preview-token.js')) && t.scripts.some((s) => s.startsWith('https://challenges.cloudflare.com/turnstile/')), JSON.stringify(t.scripts));
  check('lazy load: served after the pass', r.status === 200);
}

// Never touch paid calls, POSTs, calls that already carry a token, or other hosts.
{
  const t = setup({ status: () => 402 });
  await t.ctx.fetch('https://sentinel.xrpl-utilities.io/scan', { method: 'POST', body: '{}' });
  check('POST 402: not retried with a pass', t.calls.length === 1 && t.mints() === 0);
  t.calls.length = 0;
  await t.ctx.fetch('https://pulse.xrpl-utilities.io/stats/whales', { headers: { 'PAYMENT-SIGNATURE': 'x' } });
  check('paid GET 402: not retried', t.calls.length === 1 && t.mints() === 0);
  t.calls.length = 0;
  await t.ctx.fetch('https://example.com/data.json');
  check('other hosts: left alone', t.calls.length === 1 && t.mints() === 0);
}

// A cached pass the API refuses is dropped and replaced once (2026-11-06:
// a visitor's pass was refused for its last minutes and every figure failed).
for (const sticky of [false, true]) {
  let current = 'Bearer old.pass';
  let clears = 0;
  const lib = {
    authHeaders: async () => ({ Authorization: current }),
    _clear: () => { clears++; current = 'Bearer new.pass'; },
  };
  const t = setup({ lib, sticky, status: (u, init) => (auth(init) === 'Bearer new.pass' ? 200 : 402) });
  const urls = ['/stats/whale-flow-24h', '/stats/escrow-calendar', '/stats/rwa-summary'].map((p) => 'https://pulse.xrpl-utilities.io' + p);
  const rs = await Promise.all(urls.map((u) => t.ctx.fetch(u, { mode: 'cors' })));
  const tag = sticky ? 'sticky' : 'first visit';
  check(`refused pass (${tag}): every call served with a fresh pass`, rs.every((r) => r.status === 200), JSON.stringify(rs.map((r) => r.status)));
  check(`refused pass (${tag}): one fresh mint for all of them`, clears === 1, 'clears=' + clears);
  const after = await t.ctx.fetch(urls[0]);
  check(`refused pass (${tag}): later calls use the fresh pass`, after.status === 200);
}

// The pass mint calls /edge/ip-attest on an API host. With the pass sticky and
// nothing cached, that call used to wait for a pass, i.e. for itself, and
// every data call on the page hung for good.
{
  let lib;
  const t = setup({
    sticky: true,
    status: (u, init) => (u.includes('/edge/ip-attest') ? 200 : (auth(init) ? 200 : 402)),
    lib: (lib = {
      inflight: null,
      authHeaders() {
        if (!this.inflight) {
          this.inflight = t.ctx.fetch('https://sentinel.xrpl-utilities.io/edge/ip-attest', { method: 'GET', cache: 'no-store' })
            .then(() => ({ Authorization: 'Bearer minted.pass' }));
        }
        return this.inflight;
      },
    }),
  });
  const r = await Promise.race([
    t.ctx.fetch('https://pulse.xrpl-utilities.io/stats/whales'),
    new Promise((res) => setTimeout(() => res({ status: 'hung' }), 1000)),
  ]);
  check('pass mint: the address check never waits for a pass', r.status === 200, String(r.status));
  const attest = t.calls.find((c) => c[0].includes('/edge/ip-attest'));
  check('pass mint: the address check goes out without a pass', attest && !auth(attest[1]));
}

if (fails) { console.error(`${fails} visitor-pass check(s) failed`); process.exit(1); }
console.log('visitor pass: all checks passed');
