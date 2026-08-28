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

globalThis.fetch = realFetch;
console.log(fails ? `${fails} FAILED` : 'api passthrough: ok');
process.exit(fails ? 1 : 0);
