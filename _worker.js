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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

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

    // Everything else: static assets bound at env.ASSETS via wrangler.jsonc
    // assets.directory. Returns 404 for paths not present in the directory,
    // which is the existing pre-Worker behavior.
    return env.ASSETS.fetch(request);
  },
};
