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

function setup({ status = () => 200, token = 'Bearer pass.jwt.sig', withLib = true } = {}) {
  const calls = [];
  const scripts = [];
  let mints = 0;
  const lib = {
    authHeaders: async () => { mints++; return token ? { Authorization: token } : {}; },
  };
  const ctx = {
    console: { warn() {}, log() {} }, Promise, URL, Object, String, JSON,
    Request: class {},
    location: { href: 'https://xrpl-utilities.com/' },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
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

if (fails) { console.error(`${fails} visitor-pass check(s) failed`); process.exit(1); }
console.log('visitor pass: all checks passed');
