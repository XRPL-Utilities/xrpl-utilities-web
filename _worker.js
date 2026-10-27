/**
 * Cloudflare Workers entrypoint for the marketing site.
 *
 * Handles a small set of API routes (currently just /api/preview-token)
 * and falls through to static assets for everything else. The static
 * assets binding is configured in wrangler.jsonc as `assets.directory: "."`.
 *
 * This file replaces the per-route Pages Functions layout (functions/api/*)
 * because the project deploys in Workers-with-static-assets mode, where
 * the functions/ directory is not auto-detected.
 *
 * Routes:
 *   GET  /.well-known/x402   - merged x402 catalog of all six API hosts.
 *   POST /api/preview-token  - mint a Turnstile-gated short-TTL JWT for
 *                              the marketing site to attach to API calls
 *                              against XR-* services.
 *   ANY  /api/x/<service>/*  - same-origin passthrough to the XR-* API
 *                              hosts, for visitors whose network blocks
 *                              *.xrpl-utilities.io directly.
 *
 * Required env (Cloudflare Pages dashboard → Settings → Variables):
 *   - TURNSTILE_SECRET_KEY  Turnstile site secret. Never embedded in HTML.
 *   - PREVIEW_TOKEN_SECRET  HMAC-SHA256 signing secret. Same value also
 *                           lives in PREVIEW_TOKEN_SECRET on each XR-*
 *                           Railway service so they can verify what we sign.
 */

const TURNSTILE_VERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

const TOKEN_TTL_SECONDS = 15 * 60;
const NOT_BEFORE_LEEWAY_SECONDS = 60;

// Per-visitor rate limits, kept in this isolate's memory. Each Cloudflare
// location runs its own isolates, so these are soft guardrails, not a global
// quota. The mint's main defense is Turnstile; the proxy's is that it only
// reaches six fixed hosts. If the API_PROXY_LIMITER binding from
// wrangler.jsonc is present the proxy also checks it, which shares counts
// across every isolate in a location.
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const MINT_MAX_PER_WINDOW = 10;
// A blocked visitor opening /trust/ or /vault/ fires about 15 calls at once,
// and the live panels then poll, so this sits well above a real page's use.
const PROXY_MAX_PER_WINDOW = 120;
// Cap on visitors tracked per isolate, so a spray of addresses can't grow
// the maps without bound.
const RATE_LIMIT_MAX_KEYS = 5000;

function makeLimiter(maxPerWindow) {
  const hits = new Map(); // key -> timestamps inside the window, oldest first
  return function limited(key, now = Date.now()) {
    const recent = (hits.get(key) || []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
    if (recent.length >= maxPerWindow) {
      hits.set(key, recent);
      return true;
    }
    recent.push(now);
    hits.delete(key); // re-insert so Map order tracks last use
    hits.set(key, recent);
    if (hits.size > RATE_LIMIT_MAX_KEYS) {
      // Least recently used first; deleting while iterating a Map is safe.
      for (const k of hits.keys()) {
        if (hits.size <= RATE_LIMIT_MAX_KEYS) break;
        if (k !== key) hits.delete(k);
      }
    }
    return false;
  };
}

const mintLimited = makeLimiter(MINT_MAX_PER_WINDOW);
const proxyLimited = makeLimiter(PROXY_MAX_PER_WINDOW);

// Cloudflare sets CF-Connecting-IP on every request that reaches a Worker
// and overwrites any value the client sent. Nothing else is trusted: a
// fallback to X-Real-IP or X-Forwarded-For would let a caller pick a fresh
// rate-limit bucket on every request.
function visitorIp(request) {
  return request.headers.get("CF-Connecting-IP") || "unknown";
}

function rateLimitedResponse() {
  return new Response(JSON.stringify({ error: "rate_limited" }), {
    status: 429,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "retry-after": "60",
      "x-content-type-options": "nosniff",
    },
  });
}

function base64UrlEncode(input) {
  let str;
  if (typeof input === "string") {
    str = input;
  } else {
    str = "";
    for (let i = 0; i < input.length; i++) str += String.fromCharCode(input[i]);
  }
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function signJwt(payload, secret) {
  const header = { alg: "HS256", typ: "JWT" };
  const headerB64 = base64UrlEncode(JSON.stringify(header));
  const payloadB64 = base64UrlEncode(JSON.stringify(payload));
  const signingInput = `${headerB64}.${payloadB64}`;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBytes = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, enc.encode(signingInput)),
  );
  return `${signingInput}.${base64UrlEncode(sigBytes)}`;
}

/* ---------------------------------------------------------------------
 * Visitor identity for the XR-* services.
 *
 * Mirrors edge_client.py in XR-Sentinel (copied into every service). The
 * fixed vectors in tests/worker_proxy_test.mjs are the same ones that file's
 * tests check, so a change on either side that breaks the other fails a test.
 *
 * Two jobs:
 *   1. /api/x calls leave Cloudflare from Cloudflare's address. The proxy
 *      names the visitor in X-XRU-Client-IP and signs it in X-XRU-Client-Sig
 *      so each visitor gets their own rate-limit bucket upstream.
 *   2. The preview token carries `ipb`: keyed hashes of the addresses it may
 *      be used from. A copied token is no good from another network.
 * Every key derives from PREVIEW_TOKEN_SECRET.
 * ------------------------------------------------------------------- */

const EDGE_IP_LABEL = "xru-edge-client-ip-v1";
const PREVIEW_IP_LABEL = "xru-preview-ip-v1";
const ATTEST_LABEL = "xru-ip-attest-v1";
const ATTEST_MAX_AGE_SECONDS = 120;
const IP_BINDING_BYTES = 16;
const MAX_IP_BINDINGS = 4;
const BINDING_RE = /^[A-Za-z0-9_-]{22}$/;

const textEncoder = new TextEncoder();

async function hmacSha256(keyBytes, message) {
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, textEncoder.encode(message)));
}

function toHex(bytes) {
  let out = "";
  for (let i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, "0");
  return out;
}

function derive(secret, label) {
  return hmacSha256(textEncoder.encode(secret), label);
}

// Same value as edge_client.edge_ip_key_hex(), used as ASCII key bytes.
// Kept per isolate so the proxy derives it once, not on every request.
let edgeKeyMemo = { secret: null, key: null };
async function edgeIpKey(secret) {
  if (edgeKeyMemo.secret !== secret) {
    edgeKeyMemo = {
      secret,
      key: textEncoder.encode(toHex(await derive(secret, EDGE_IP_LABEL))),
    };
  }
  return edgeKeyMemo.key;
}

function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function parseIpv4(text) {
  const parts = text.split(".");
  if (parts.length !== 4) return null;
  const out = [];
  for (const p of parts) {
    // Python's ipaddress refuses leading zeros, so this does too.
    if (!/^(0|[1-9][0-9]{0,2})$/.test(p)) return null;
    const n = Number(p);
    if (n > 255) return null;
    out.push(n);
  }
  return out;
}

function parseIpv6(text) {
  if (text.includes("%")) return null;
  let head = text;
  let tail = [];
  const lastColon = text.lastIndexOf(":");
  if (text.slice(lastColon + 1).includes(".")) {
    const v4 = parseIpv4(text.slice(lastColon + 1));
    if (!v4) return null;
    tail = [(v4[0] << 8) | v4[1], (v4[2] << 8) | v4[3]];
    head = text.slice(0, lastColon + 1);
    if (head.endsWith(":") && !head.endsWith("::")) head = head.slice(0, -1);
  }
  const halves = head.split("::");
  if (halves.length > 2) return null;
  const toGroups = (s) => (s === "" ? [] : s.split(":"));
  const left = toGroups(halves[0]);
  const right = halves.length === 2 ? toGroups(halves[1]) : [];
  const groups = [];
  for (const g of left.concat(right)) {
    if (!/^[0-9A-Fa-f]{1,4}$/.test(g)) return null;
  }
  const given = left.length + right.length + tail.length;
  if (halves.length === 2) {
    if (given > 7) return null;
    for (const g of left) groups.push(parseInt(g, 16));
    for (let i = 0; i < 8 - given; i++) groups.push(0);
    for (const g of right) groups.push(parseInt(g, 16));
  } else {
    if (given !== 8) return null;
    for (const g of left) groups.push(parseInt(g, 16));
  }
  return groups.concat(tail);
}

// RFC 5952 text, matching str(ipaddress.IPv6Address(...)): lowercase, no
// leading zeros, the longest run of two or more zero groups (first on a tie)
// written as "::".
function formatIpv6(groups) {
  let bestStart = -1;
  let bestLen = 0;
  for (let i = 0; i < 8; ) {
    if (groups[i] !== 0) { i++; continue; }
    let j = i;
    while (j < 8 && groups[j] === 0) j++;
    if (j - i > bestLen) { bestStart = i; bestLen = j - i; }
    i = j;
  }
  const hex = groups.map((g) => g.toString(16));
  if (bestLen < 2) return hex.join(":");
  return hex.slice(0, bestStart).join(":") + "::" + hex.slice(bestStart + bestLen).join(":");
}

// Canonical address text, or null. Same rules as edge_client.normalize_ip:
// IPv4-mapped IPv6 collapses to plain IPv4.
function normalizeIp(raw) {
  if (typeof raw !== "string") return null;
  const text = raw.trim();
  if (!text || text.length > 64) return null;
  if (!text.includes(":")) {
    const v4 = parseIpv4(text);
    return v4 ? v4.join(".") : null;
  }
  const g = parseIpv6(text);
  if (!g) return null;
  if (g[0] === 0 && g[1] === 0 && g[2] === 0 && g[3] === 0 && g[4] === 0 && g[5] === 0xffff) {
    return [g[6] >> 8, g[6] & 255, g[7] >> 8, g[7] & 255].join(".");
  }
  return formatIpv6(g);
}

async function signProxyIp(ip, ts, keyBytes) {
  return `${ts}.` + base64UrlEncode(await hmacSha256(keyBytes, `${ip}|${ts}`));
}

async function ipBinding(secret, ip) {
  const norm = normalizeIp(ip);
  if (!secret || !norm) return null;
  const key = await derive(secret, PREVIEW_IP_LABEL);
  return base64UrlEncode((await hmacSha256(key, norm)).slice(0, IP_BINDING_BYTES));
}

// The binding inside a fresh, genuine /edge/ip-attest answer, or null.
async function verifyIpAttestation(secret, attestation, nowSec) {
  if (typeof attestation !== "string" || attestation.length > 128) return null;
  const parts = attestation.split(".");
  if (parts.length !== 3) return null;
  const [tsText, binding, mac] = parts;
  if (!/^[0-9]{1,12}$/.test(tsText) || !BINDING_RE.test(binding)) return null;
  if (Math.abs(nowSec - Number(tsText)) > ATTEST_MAX_AGE_SECONDS) return null;
  const key = await derive(secret, ATTEST_LABEL);
  const expected = base64UrlEncode(await hmacSha256(key, `${tsText}.${binding}`));
  return timingSafeEqual(expected, mac) ? binding : null;
}

async function verifyTurnstile(token, secret, remoteIp) {
  const body = new FormData();
  body.append("secret", secret);
  body.append("response", token);
  if (remoteIp) body.append("remoteip", remoteIp);
  try {
    const r = await fetch(TURNSTILE_VERIFY_URL, { method: "POST", body });
    if (!r.ok) return false;
    const data = await r.json();
    return data.success === true;
  } catch {
    return false;
  }
}

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

async function handlePreviewTokenMint(request, env) {
  if (!env.TURNSTILE_SECRET_KEY || !env.PREVIEW_TOKEN_SECRET) {
    return jsonResponse(503, { error: "preview-token mint not configured" });
  }
  const ip = visitorIp(request);
  if (mintLimited(ip)) return rateLimitedResponse();
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse(400, { error: "invalid_json" });
  }
  const turnstileToken = (body && body.turnstile_token ? String(body.turnstile_token) : "").trim();
  if (!turnstileToken) {
    return jsonResponse(400, { error: "missing_turnstile_token" });
  }
  const passed = await verifyTurnstile(
    turnstileToken,
    env.TURNSTILE_SECRET_KEY,
    ip === "unknown" ? null : ip,
  );
  if (!passed) {
    return jsonResponse(403, { error: "turnstile_failed" });
  }
  const nowSec = Math.floor(Date.now() / 1000);
  // Bind the token to the address this request came from, plus the one the
  // API hosts saw if the page relayed an /edge/ip-attest answer. The site is
  // reachable over IPv6 and the API hosts only over IPv4, so a dual-stack
  // visitor needs both. An attestation that fails the check is just dropped.
  const ipb = [];
  const own = await ipBinding(env.PREVIEW_TOKEN_SECRET, ip);
  if (own) ipb.push(own);
  const attested = await verifyIpAttestation(
    env.PREVIEW_TOKEN_SECRET,
    body && body.ip_attestation,
    nowSec,
  );
  if (attested && !ipb.includes(attested)) ipb.push(attested);
  if (!ipb.length) {
    return jsonResponse(400, { error: "no_client_address" });
  }
  const payload = {
    iss: "xrpl-utilities.com",
    scope: "preview",
    iat: nowSec,
    nbf: nowSec - NOT_BEFORE_LEEWAY_SECONDS,
    exp: nowSec + TOKEN_TTL_SECONDS,
    ipb: ipb.slice(0, MAX_IP_BINDINGS),
  };
  const token = await signJwt(payload, env.PREVIEW_TOKEN_SECRET);
  return jsonResponse(200, {
    token,
    expires_at: payload.exp,
    ttl_seconds: TOKEN_TTL_SECONDS,
  });
}

/* ---------------------------------------------------------------------
 * Same-origin API passthrough.
 *
 * Why this exists: on 2026-08-10 an operator on a new Xfinity line found
 * every data panel on the site empty. The pages loaded (they come from
 * this domain, via Cloudflare) but every call to *.xrpl-utilities.io died
 * with ERR_SSL_PROTOCOL_ERROR. Cause was xFi Advanced Security blocking
 * the API hosts, a filter that ships ON by default for the largest home
 * ISP in the US. Server side was healthy throughout: valid TLS 1.3, full
 * chain, correct SNI, every endpoint 200 from everywhere else.
 *
 * A visitor in that state sees a fully-rendered site with no numbers in
 * it and no way to know why. They conclude the product is broken.
 *
 * So: the browser can reach this domain by definition, since it just
 * loaded the page from it, and this route lets the site's data ride that same
 * connection when the direct one is unreachable. It is a FALLBACK, not
 * the default path (see assets/api-resilient.js): unblocked visitors
 * keep talking to the API hosts directly, so this adds no hop, no Worker
 * request, and no single point of failure for the common case.
 *
 * Deliberately NOT a general proxy. The service name is matched against a
 * fixed map (an attacker cannot steer it at an arbitrary host), and only
 * an explicit header allowlist crosses in either direction.
 * ------------------------------------------------------------------- */

const PROXY_TARGETS = {
  sentinel: "https://sentinel.xrpl-utilities.io",
  pulse: "https://pulse.xrpl-utilities.io",
  trust: "https://trust.xrpl-utilities.io",
  telemetry: "https://telemetry.xrpl-utilities.io",
  vault: "https://vault.xrpl-utilities.io",
  flows: "https://flows.xrpl-utilities.io",
};

// Sent upstream. Authorization carries the preview token; the PAYMENT-*
// pair is x402 payment negotiation, which must survive the hop or the
// paid flows on /sentinel/ break behind the proxy.
const PROXY_REQUEST_HEADERS = [
  "accept",
  "authorization",
  "content-type",
  "payment-signature",
  "x-payment",
];

// Returned to the page. Same reasoning in reverse: the x402 client reads
// PAYMENT-REQUIRED off the 402 to build its payment.
const PROXY_RESPONSE_HEADERS = [
  "content-type",
  "cache-control",
  "payment-required",
  "payment-response",
  "x-payment-response",
  "retry-after",
];

// What the XR-* services actually answer with on this path. Anything else
// gets served as a download rather than as a document; see the comment
// above the content-type check in handleApiProxy.
const PROXY_ALLOWED_MEDIA_TYPES = [
  "application/json",
  "application/problem+json",
  "text/plain",
  "text/markdown",
  "text/event-stream",
];

async function proxyRateLimited(request, env) {
  const ip = visitorIp(request);
  if (proxyLimited(ip)) return true;
  if (env && env.API_PROXY_LIMITER && typeof env.API_PROXY_LIMITER.limit === "function") {
    try {
      const { success } = await env.API_PROXY_LIMITER.limit({ key: "api-x:" + ip });
      return success === false;
    } catch {
      // A limiter outage should not take the fallback path down with it;
      // the in-isolate check above has already run.
      return false;
    }
  }
  return false;
}

async function handleApiProxy(request, url, env) {
  // /api/x/<service>/<upstream path...>
  const rest = url.pathname.slice("/api/x/".length);
  const slash = rest.indexOf("/");
  const service = slash === -1 ? rest : rest.slice(0, slash);
  const upstreamPath = slash === -1 ? "/" : rest.slice(slash);

  const target = Object.prototype.hasOwnProperty.call(PROXY_TARGETS, service)
    ? PROXY_TARGETS[service]
    : null;
  if (!target) {
    return jsonResponse(404, { error: "unknown_service" });
  }
  if (request.method !== "GET" && request.method !== "POST") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: { allow: "GET, POST" },
    });
  }
  if (await proxyRateLimited(request, env)) return rateLimitedResponse();

  const headers = new Headers();
  for (const name of PROXY_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  // The API hosts key their free-preview CORS allowlist off Origin. Server
  // to server there is no browser Origin to forward, so state the one this
  // request actually came from.
  headers.set("Origin", url.origin);
  // Name the visitor for the upstream rate limiter and preview-token check.
  // PROXY_REQUEST_HEADERS never lets a caller's own X-XRU-* through, so the
  // only copy upstream sees is this signed one.
  const visitor = normalizeIp(visitorIp(request));
  if (visitor && env && env.PREVIEW_TOKEN_SECRET) {
    const ts = Math.floor(Date.now() / 1000);
    headers.set("X-XRU-Client-IP", visitor);
    headers.set("X-XRU-Client-Sig", await signProxyIp(visitor, ts, await edgeIpKey(env.PREVIEW_TOKEN_SECRET)));
  }

  let upstream;
  try {
    upstream = await fetch(target + upstreamPath + url.search, {
      method: request.method,
      headers,
      body: request.method === "POST" ? await request.arrayBuffer() : undefined,
    });
  } catch (err) {
    // The proxy is the fallback path; if it fails too there is nowhere
    // left to go, so say so plainly rather than surfacing a bare 500.
    return jsonResponse(502, {
      error: "upstream_unreachable",
      service,
      detail: String(err && err.message ? err.message : err),
    });
  }

  const out = new Headers();
  for (const name of PROXY_RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) out.set(name, value);
  }

  // _headers is applied by the static-assets binding only, and wrangler.jsonc
  // pins /api/* to this Worker, so a passthrough body reaches the browser on
  // xrpl-utilities.com with the upstream's content-type and none of the site's
  // protections. An upstream that answers HTML (FastAPI's /docs, an error
  // page from something in front of Railway, or any route that reflects the
  // query string, since url.search is forwarded verbatim above) would then be a
  // same-origin document with no CSP over it, on the origin that holds the
  // preview token in localStorage. So: stamp the protections here, and refuse
  // HTML rather than downgrade it. This path exists for the site's JSON data
  // panels (see assets/api-resilient.js); the .io hosts serve their own docs
  // under their own headers.
  out.set("x-content-type-options", "nosniff");
  out.set("x-frame-options", "DENY");
  out.set("referrer-policy", "strict-origin-when-cross-origin");
  // Ignored by the page for a fetch()/XHR response, so the data panels pay
  // nothing for it; it only binds the document created if someone navigates
  // to a proxy URL directly.
  out.set(
    "content-security-policy",
    "default-src 'none'; frame-ancestors 'none'; sandbox",
  );

  const rawType = upstream.headers.get("content-type");
  if (rawType) {
    const semi = rawType.indexOf(";");
    const media = (semi === -1 ? rawType : rawType.slice(0, semi))
      .trim()
      .toLowerCase();
    const params = semi === -1 ? "" : rawType.slice(semi);
    if (media === "text/html" || media === "application/xhtml+xml") {
      return jsonResponse(404, { error: "unsupported_upstream_content_type" });
    }
    if (!PROXY_ALLOWED_MEDIA_TYPES.includes(media)) {
      out.set("content-type", "application/octet-stream");
    } else {
      out.set("content-type", media + params);
    }
  }

  return new Response(upstream.body, { status: upstream.status, headers: out });
}

// ---- /.well-known/x402: one catalog for the whole site ---------------------
//
// Agent directories crawl a domain's /.well-known/x402 to find what it sells.
// Each API host already publishes its own; this merges the six into one
// document so a crawler that starts at xrpl-utilities.com finds every paid
// route. Built live from the services so it can never drift from them, and
// cached in the isolate so a crawler burst is one upstream round per service.
const CATALOG_TTL_MS = 10 * 60 * 1000;
const CATALOG_UPSTREAM_TIMEOUT_MS = 5000;
let catalogCache = null; // { at, body }

async function fetchServiceCatalog(service, origin) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), CATALOG_UPSTREAM_TIMEOUT_MS);
  try {
    const r = await fetch(origin + "/.well-known/x402", {
      headers: { accept: "application/json" },
      signal: ctrl.signal,
    });
    if (!r.ok) return null;
    const doc = await r.json();
    if (!doc || !Array.isArray(doc.resources)) return null;
    // Keep only resources that live on the service's own host, so one
    // service's document can't list routes on some other domain under
    // this site's name.
    const resources = doc.resources.filter(
      (res) => res && typeof res.url === "string" && res.url.startsWith(origin + "/"),
    );
    return {
      service,
      name: typeof doc.name === "string" ? doc.name : service,
      website: origin,
      catalog: origin + "/.well-known/x402",
      resources,
    };
  } catch (_) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function handleX402Catalog() {
  const now = Date.now();
  if (catalogCache && now - catalogCache.at < CATALOG_TTL_MS) {
    return catalogResponse(catalogCache.body);
  }
  const entries = Object.entries(PROXY_TARGETS);
  const results = await Promise.all(entries.map(([svc, origin]) => fetchServiceCatalog(svc, origin)));
  const services = results.filter(Boolean);
  if (!services.length) {
    // Serve the last good copy rather than nothing.
    if (catalogCache) return catalogResponse(catalogCache.body);
    return jsonResponse(503, { error: "catalog_unavailable" });
  }
  const body = {
    x402Version: 2,
    name: "XRPL-Utilities",
    description:
      "XRP Ledger data services, each payable per call over x402: RLUSD or XRP on the XRP Ledger, or USDC on Base. No account or API key.",
    website: "https://xrpl-utilities.com",
    services: services.map(({ resources, ...rest }) => ({ ...rest, resource_count: resources.length })),
    resources: services.flatMap((s) => s.resources),
    unavailable: entries.map(([svc]) => svc).filter((svc) => !services.some((s) => s.service === svc)),
  };
  // Only a complete catalog is cached; a partial one is retried next time.
  if (!body.unavailable.length) catalogCache = { at: now, body };
  return catalogResponse(body);
}

function catalogResponse(body) {
  return new Response(JSON.stringify(body, null, 2), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=600",
      "access-control-allow-origin": "*",
      "x-content-type-options": "nosniff",
    },
  });
}

// Every page directory on the site (each holds an index.html). Keep in step
// with the matching entries in wrangler.jsonc run_worker_first; the SEO test
// checks both against the pages in the repo.
const PAGE_DIRS = new Set([
  "/start", "/sentinel", "/sentinel/bulk", "/telemetry", "/pulse", "/trust",
  "/vault", "/flows", "/lineage", "/pricing", "/status", "/contact", "/tip", "/terms",
]);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Canonical host: 301 www.xrpl-utilities.com -> xrpl-utilities.com
    // for PAGE navigations only. /api/* paths must NOT redirect:
    // 1. A 301 on a same-origin POST causes the browser to drop the
    //    method body (POST -> GET) on follow, breaking the mint.
    // 2. The redirect target (apex) sees a different Origin header
    //    (www) and CORS-rejects the request since the mint endpoint
    //    doesn't set Access-Control-Allow-Origin: www.
    // The mint runs locally on whichever host the request lands on;
    // both hosts share this Worker so behavior is identical, and the
    // .io backends' CORS allowlists already accept both origins.
    if (
      url.hostname === "www.xrpl-utilities.com"
      && !url.pathname.startsWith("/api/")
    ) {
      const target = `https://xrpl-utilities.com${url.pathname}${url.search}`;
      return Response.redirect(target, 301);
    }

    // API routes - handled by this Worker before falling through to assets.
    if (url.pathname === "/api/preview-token") {
      if (request.method === "POST") {
        return handlePreviewTokenMint(request, env);
      }
      return new Response("Method Not Allowed", {
        status: 405,
        headers: { allow: "POST" },
      });
    }

    if (url.pathname.startsWith("/api/x/")) {
      return handleApiProxy(request, url, env);
    }

    if (url.pathname === "/.well-known/x402") {
      if (request.method !== "GET" && request.method !== "HEAD") {
        return new Response("Method Not Allowed", { status: 405, headers: { allow: "GET, HEAD" } });
      }
      return handleX402Catalog();
    }

    // A page URL without its trailing slash. The assets layer would answer
    // with a 307 (temporary), which tells search engines both URLs are live;
    // a 301 settles on the canonical one. wrangler.jsonc routes exactly
    // these paths to the Worker.
    if (PAGE_DIRS.has(url.pathname)) {
      return Response.redirect(`${url.origin}${url.pathname}/${url.search}`, 301);
    }

    // Everything else: static assets bound at env.ASSETS via wrangler.jsonc
    // assets.directory. A path with no asset gets the site's 404 page, with
    // a 404 status so it is never indexed as a real page.
    const res = await env.ASSETS.fetch(request);
    if (res.status !== 404 || (request.method !== "GET" && request.method !== "HEAD")) {
      return res;
    }
    const notFound = await env.ASSETS.fetch(new Request(new URL("/404", url), { method: request.method }));
    if (!notFound.ok) return res;
    return new Response(notFound.body, { status: 404, headers: notFound.headers });
  },
};
