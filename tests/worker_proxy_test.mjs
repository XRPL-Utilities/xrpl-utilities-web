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

// ---- visitor identity (audit P2, 2026-10-26) --------------------------------
// The vectors below are the same ones XR-Sentinel's tests/test_edge_client.py
// checks against edge_client.py, so the two sides cannot drift apart silently.
const VECTOR_SECRET = 'vector-secret';
const VECTOR_TS = 1793120000;
const VECTOR_SIG = '1793120000.AHK4rXKte4NIpbbPqysQtzFN7U9RPzgpQIgFXLPHQUs';
const VECTOR_IPB_V4 = 'KVN1vvRi-2oXA0hHSIne0w';
const VECTOR_IPB_V6 = 'p9Afw-XkbwLYYS81gIEDig';
const VECTOR_ATT = '1793120000.KVN1vvRi-2oXA0hHSIne0w.e9kCxgJedQOxvk5fjyihI7pXyI1qJ-i9fB_rutLqupQ';

const realNow = Date.now;
Date.now = () => VECTOR_TS * 1000;
let sent;
globalThis.fetch = async (_url, init) => {
  sent = init.headers;
  return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
};
const viaIp = (ip, extra = {}) => new Request('https://xrpl-utilities.com/api/x/pulse/stats', {
  headers: { 'CF-Connecting-IP': ip, ...extra },
});
const edgeEnv = { PREVIEW_TOKEN_SECRET: VECTOR_SECRET };

await worker.fetch(viaIp('198.51.100.7'), edgeEnv);
check('proxy names the visitor upstream', sent.get('x-xru-client-ip') === '198.51.100.7', String(sent.get('x-xru-client-ip')));
check('proxy signature matches the shared vector', sent.get('x-xru-client-sig') === VECTOR_SIG, String(sent.get('x-xru-client-sig')));

await worker.fetch(viaIp('198.51.100.8', { 'X-XRU-Client-IP': '1.1.1.1', 'X-XRU-Client-Sig': 'forged' }), {});
check('a caller cannot supply its own identity headers', !sent.get('x-xru-client-ip') && !sent.get('x-xru-client-sig'));

// normalizeIp must agree with Python's ipaddress on every form, or the
// signature and the token binding will not match upstream.
const ipCases = [
  '198.51.100.7', ' 198.51.100.7 ', '::ffff:198.51.100.7', '::FFFF:c633:6407',
  '2001:0DB8:0000:0000:0000:0000:0000:0001', '2001:db8::1', '2001:db8:0:0:1:0:0:1',
  '2001:db8:0:1:0:0:0:1', '2001:db8::1:0:0:1', '::', '::1', '1::', 'fe80::1:2',
  '1:0:0:2:0:0:0:3', '1:2:3:4:5:6:7:8', '1:0:3:4:5:6:7:8', '::1.2.3.4', '64:ff9b::198.51.100.7',
  '001.2.3.4', '1.2.3', '256.1.1.1', '1:2:3:4:5:6:7:8:9', '1::2::3', ':1:2:3:4:5:6:7',
  'fe80::1%eth0', 'abcd', '1.2.3.4.5', '12345::1', '::ffff:1.2.3.256', '',
];
const { execFileSync } = await import('node:child_process');
const pyOut = JSON.parse(execFileSync('python3', ['-I', '-c', `
import ipaddress, json, sys
def norm(t):
    t = t.strip()
    if not t or len(t) > 64 or '%' in t:
        return None
    try:
        a = ipaddress.ip_address(t)
    except ValueError:
        return None
    if isinstance(a, ipaddress.IPv6Address) and a.ipv4_mapped is not None:
        a = a.ipv4_mapped
    return str(a)
print(json.dumps([norm(x) for x in json.loads(sys.argv[1])]))
`, JSON.stringify(ipCases)]).toString());
const mismatches = [];
for (let k = 0; k < ipCases.length; k++) {
  sent = new Headers();
  await worker.fetch(viaIp(ipCases[k] || 'x'), edgeEnv);
  const got = sent.get('x-xru-client-ip');
  if ((got || null) !== pyOut[k]) mismatches.push(`${ipCases[k]} -> ${got} (python ${pyOut[k]})`);
}
check('address normalisation matches Python ipaddress', mismatches.length === 0, mismatches.join('; '));

// Mint: the token is bound to the visitor's own address plus a fresh, genuine
// attestation from the API side. Anything else in ip_attestation is dropped.
globalThis.fetch = async () => new Response(JSON.stringify({ success: true }), {
  headers: { 'content-type': 'application/json' },
});
const mintWith = async (ip, attestation) => {
  const res = await worker.fetch(new Request('https://xrpl-utilities.com/api/preview-token', {
    method: 'POST',
    headers: { 'CF-Connecting-IP': ip, 'content-type': 'application/json' },
    body: JSON.stringify({ turnstile_token: 'ok', ip_attestation: attestation }),
  }), { TURNSTILE_SECRET_KEY: 't', PREVIEW_TOKEN_SECRET: VECTOR_SECRET });
  if (res.status !== 200) return { status: res.status };
  const { token } = await res.json();
  const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
  return { status: 200, claims: JSON.parse(Buffer.from(b64, 'base64').toString()) };
};
let m = await mintWith('2001:db8::1', VECTOR_ATT);
check('dual-stack mint binds both addresses', JSON.stringify(m.claims && m.claims.ipb) === JSON.stringify([VECTOR_IPB_V6, VECTOR_IPB_V4]), JSON.stringify(m));
m = await mintWith('2001:db8::2', VECTOR_ATT.replace(/.$/, (c) => (c === 'A' ? 'B' : 'A')));
check('a tampered attestation is dropped', m.claims && m.claims.ipb.length === 1, JSON.stringify(m));
m = await mintWith('2001:db8::3', VECTOR_ATT.replace(String(VECTOR_TS), String(VECTOR_TS - 500)));
check('a stale or re-dated attestation is dropped', m.claims && m.claims.ipb.length === 1, JSON.stringify(m));
m = await mintWith('198.51.100.7', VECTOR_ATT);
check('a matching attestation is not listed twice', JSON.stringify(m.claims && m.claims.ipb) === JSON.stringify([VECTOR_IPB_V4]), JSON.stringify(m));
m = await mintWith('198.51.100.20', { not: 'a string' });
check('a non-string attestation is ignored', m.claims && m.claims.ipb.length === 1, JSON.stringify(m));
Date.now = realNow;

globalThis.fetch = realFetch;
console.log(fails ? `${fails} FAILED` : 'api passthrough: ok');
process.exit(fails ? 1 : 0);
