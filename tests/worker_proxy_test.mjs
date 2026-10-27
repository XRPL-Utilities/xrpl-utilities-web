// Regression test for the /api/x/* passthrough in _worker.js.
//
// _headers is applied by the static-assets binding only, and wrangler.jsonc
// pins /api/* to the Worker, so anything this handler returns lands on
// xrpl-utilities.com with no CSP and no nosniff over it. An upstream that
// answered HTML would have become a same-origin document on the origin that
// holds the preview token. These checks pin the hardening without breaking
// the JSON data panels or the x402 402 handshake.
//
// Run: node tests/worker_proxy_test.mjs

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const worker = (await import(pathToFileURL(path.join(repo, '_worker.js')).href)).default;

const realFetch = globalThis.fetch;
function mockUpstream(contentType, status = 200, body = 'x') {
  globalThis.fetch = async () => new Response(contentType ? body : null, {
    status,
    headers: contentType
      ? { 'content-type': contentType, 'cache-control': 'max-age=5' }
      : { 'cache-control': 'max-age=5' },
  });
}
const req = (p) => new Request('https://xrpl-utilities.com' + p);

let fails = 0;
function check(name, cond, extra = '') {
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + extra));
  if (!cond) fails++;
}

mockUpstream('application/json; charset=utf-8');
let r = await worker.fetch(req('/api/x/pulse/stats'), {});
check('json passthrough keeps its status', r.status === 200, String(r.status));
check('json content-type preserved', r.headers.get('content-type') === 'application/json; charset=utf-8', String(r.headers.get('content-type')));
check('nosniff stamped', r.headers.get('x-content-type-options') === 'nosniff');
check('csp stamped', /default-src 'none'/.test(r.headers.get('content-security-policy') || ''));
check('cache-control still crosses the hop', r.headers.get('cache-control') === 'max-age=5');

mockUpstream('text/html; charset=utf-8', 200, '<script>alert(1)</script>');
r = await worker.fetch(req('/api/x/pulse/docs'), {});
check('upstream html is refused', r.status === 404, String(r.status));
check('refusal says why', (await r.json()).error === 'unsupported_upstream_content_type');
mockUpstream('TEXT/HTML', 502);
r = await worker.fetch(req('/api/x/vault/healthz'), {});
check('html match is case-insensitive', r.status === 404, String(r.status));
mockUpstream('application/xhtml+xml');
r = await worker.fetch(req('/api/x/vault/healthz'), {});
check('xhtml is refused too', r.status === 404, String(r.status));

mockUpstream('image/svg+xml');
r = await worker.fetch(req('/api/x/flows/map.svg'), {});
check('off-allowlist type served as a download', r.headers.get('content-type') === 'application/octet-stream', String(r.headers.get('content-type')));

globalThis.fetch = async () => new Response('{}', {
  status: 402,
  headers: { 'content-type': 'application/json', 'payment-required': 'x402 ...' },
});
r = await worker.fetch(req('/api/x/sentinel/scan'), {});
check('402 survives the hop', r.status === 402, String(r.status));
check('payment-required survives the hop', r.headers.get('payment-required') === 'x402 ...');

mockUpstream('text/event-stream');
r = await worker.fetch(req('/api/x/pulse/stream'), {});
check('sse is on the allowlist', r.headers.get('content-type') === 'text/event-stream', String(r.headers.get('content-type')));

mockUpstream(null, 200, '');
r = await worker.fetch(req('/api/x/pulse/ping'), {});
check('absent content-type is not invented', r.headers.get('content-type') === null, String(r.headers.get('content-type')));

r = await worker.fetch(req('/api/x/evil/'), {});
check('unknown service still 404s first', r.status === 404 && (await r.json()).error === 'unknown_service');

// ---- per-visitor rate limit (audit P2: the proxy had none) ----
const fromIp = (p, ip, extra = {}) => new Request('https://xrpl-utilities.com' + p, {
  headers: { 'CF-Connecting-IP': ip, ...extra },
});
mockUpstream('application/json');
let statuses = [];
for (let k = 0; k < 121; k++) {
  statuses.push((await worker.fetch(fromIp('/api/x/pulse/stats', '203.0.113.7'), {})).status);
}
check('120 calls a minute pass', statuses.slice(0, 120).every((s) => s === 200), statuses.slice(0, 120).join(','));
r = await worker.fetch(fromIp('/api/x/pulse/stats', '203.0.113.7'), {});
check('call 122 from one visitor is refused', r.status === 429, String(r.status));
check('429 says when to retry', r.headers.get('retry-after') === '60');
check('429 is json', (await r.json()).error === 'rate_limited');
r = await worker.fetch(fromIp('/api/x/pulse/stats', '203.0.113.7', { 'X-Real-IP': '198.51.100.1', 'X-Forwarded-For': '198.51.100.2' }), {});
check('a spoofed X-Real-IP or X-Forwarded-For does not reset the bucket', r.status === 429, String(r.status));
r = await worker.fetch(fromIp('/api/x/pulse/stats', '203.0.113.8'), {});
check('another visitor is unaffected', r.status === 200, String(r.status));

let limiterKey = null;
r = await worker.fetch(fromIp('/api/x/pulse/stats', '203.0.113.9'), {
  API_PROXY_LIMITER: { limit: async ({ key }) => { limiterKey = key; return { success: false }; } },
});
check('location-wide limiter is honoured when bound', r.status === 429, String(r.status));
check('limiter is keyed on the visitor IP', limiterKey === 'api-x:203.0.113.9', String(limiterKey));
r = await worker.fetch(fromIp('/api/x/pulse/stats', '203.0.113.10'), {
  API_PROXY_LIMITER: { limit: async () => { throw new Error('down'); } },
});
check('a limiter outage does not take the proxy down', r.status === 200, String(r.status));

// The mint limiter used to fall back to X-Real-IP when CF-Connecting-IP was
// absent, so rotating that header gave a fresh bucket on every call.
const mintEnv = { TURNSTILE_SECRET_KEY: 't', PREVIEW_TOKEN_SECRET: 'p' };
const mintReq = (realIp) => new Request('https://xrpl-utilities.com/api/preview-token', {
  method: 'POST', headers: { 'X-Real-IP': realIp }, body: 'not json',
});
statuses = [];
for (let k = 0; k < 11; k++) statuses.push((await worker.fetch(mintReq('198.51.100.' + k), mintEnv)).status);
check('mint limit ignores a rotating X-Real-IP', statuses[10] === 429 && statuses.slice(0, 10).every((s) => s === 400), statuses.join(','));

globalThis.fetch = realFetch;
console.log(fails ? `${fails} FAILED` : 'api passthrough: ok');
process.exit(fails ? 1 : 0);
