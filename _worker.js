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

// Per-IP rate limit on the mint endpoint. Soft per-pop guardrail; the
// primary defense is Turnstile gating the mint at all.
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_PER_WINDOW = 10;
const ipMintHistory = new Map();

function rateLimited(ip) {
  const now = Date.now();
  const history = (ipMintHistory.get(ip) || []).filter(
    (t) => now - t < RATE_LIMIT_WINDOW_MS,
  );
  if (history.length >= RATE_LIMIT_MAX_PER_WINDOW) {
    ipMintHistory.set(ip, history);
    return true;
  }
  history.push(now);
  ipMintHistory.set(ip, history);
  return false;
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
  const ip =
    request.headers.get("CF-Connecting-IP") ||
    request.headers.get("X-Real-IP") ||
    "unknown";
  if (rateLimited(ip)) {
    return new Response(JSON.stringify({ error: "rate_limited" }), {
      status: 429,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "retry-after": "60",
      },
    });
  }
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
  const payload = {
    iss: "xrpl-utilities.com",
    scope: "preview",
    iat: nowSec,
    nbf: nowSec - NOT_BEFORE_LEEWAY_SECONDS,
    exp: nowSec + TOKEN_TTL_SECONDS,
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
 * the API hosts — a filter that ships ON by default for the largest home
 * ISP in the US. Server side was healthy throughout: valid TLS 1.3, full
 * chain, correct SNI, every endpoint 200 from everywhere else.
 *
 * A visitor in that state sees a fully-rendered site with no numbers in
 * it and no way to know why. They conclude the product is broken.
 *
 * So: the browser can reach this domain by definition — it just loaded
 * the page from it — and this route lets the site's data ride that same
 * connection when the direct one is unreachable. It is a FALLBACK, not
 * the default path (see assets/api-resilient.js): unblocked visitors
 * keep talking to the API hosts directly, so this adds no hop, no Worker
 * request, and no single point of failure for the common case.
 *
 * Deliberately NOT a general proxy. The service name is matched against a
 * fixed map — an attacker cannot steer it at an arbitrary host — and only
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

// Returned to the page. Same reasoning in reverse — the x402 client reads
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
// gets served as a download rather than as a document — see the comment on
// hardenProxyResponse below.
const PROXY_ALLOWED_MEDIA_TYPES = [
  "application/json",
  "application/problem+json",
  "text/plain",
  "text/markdown",
  "text/event-stream",
];

async function handleApiProxy(request, url) {
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

  const headers = new Headers();
  for (const name of PROXY_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  // The API hosts key their free-preview CORS allowlist off Origin. Server
  // to server there is no browser Origin to forward, so state the one this
  // request actually came from.
  headers.set("Origin", url.origin);

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
  // protections. An upstream that answers HTML — FastAPI's /docs, an error
  // page from something in front of Railway, or any route that reflects the
  // query string (url.search is forwarded verbatim above) — would then be a
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
      return handleApiProxy(request, url);
    }

    // Everything else: static assets bound at env.ASSETS via wrangler.jsonc
    // assets.directory. Returns 404 for paths not present in the directory,
    // which is the existing pre-Worker behavior.
    return env.ASSETS.fetch(request);
  },
};
