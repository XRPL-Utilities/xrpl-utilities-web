/**
 * Cloudflare Pages Function: POST /api/preview-token
 *
 * Mints a short-TTL JWT that the marketing site attaches to API calls
 * against Sentinel/Trust/Pulse/Telemetry. Replaces the spoofable
 * `Origin: https://xrpl-utilities.com` header gate that those services
 * previously trusted as auth.
 *
 * Flow:
 *   1. Marketing-site JS solves an invisible Turnstile challenge.
 *   2. JS POSTs the cf-turnstile-response to this endpoint.
 *   3. We verify the Turnstile token against Cloudflare's siteverify API.
 *   4. On success, we sign a JWT with HS256 using PREVIEW_TOKEN_SECRET and
 *      return { token, expires_at }.
 *   5. The four API services verify the JWT signature and accept it as a
 *      free-preview credential.
 *
 * Required environment variables (Cloudflare Pages → Settings → Variables):
 *   - TURNSTILE_SECRET_KEY  Turnstile site secret. Never embedded in HTML.
 *   - PREVIEW_TOKEN_SECRET  HMAC-SHA256 signing secret. Same value also
 *                           lives in PREVIEW_TOKEN_SECRET on each XR-*
 *                           Railway service so they can verify what we sign.
 *
 * Bot-resistance posture:
 *   - The mint endpoint is gated by a Turnstile challenge (humans pass
 *     invisibly; headless bots without Turnstile solving fail at step 3).
 *   - Per-IP rate limit on the mint endpoint via an in-memory Map below
 *     caps how many tokens a single IP can mint even if it does solve
 *     Turnstile (e.g. paid challenge-solving services).
 *   - Tokens have a 15-minute TTL; replays within that window are
 *     equivalent to "the same legitimate user using their token", which
 *     is the intended behavior.
 *
 * Defense in depth:
 *   - HMAC verified with subtle.crypto (constant-time at the WebCrypto
 *     layer; we never compare the signature ourselves in JS).
 *   - JWT carries iss + scope so a token minted for this preview path
 *     can't be reused as some other future token type.
 */

interface Env {
  TURNSTILE_SECRET_KEY: string;
  PREVIEW_TOKEN_SECRET: string;
}

const TURNSTILE_VERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

const TOKEN_TTL_SECONDS = 15 * 60; // 15 min
const NOT_BEFORE_LEEWAY_SECONDS = 60; // tolerate API-service clock skew

// Per-IP rate limit on the mint endpoint. A single Pages Function instance
// has its own copy of this Map; with CF's request distribution this is a
// soft per-pop limit, not a global one. Good enough as a guardrail against
// trivial abuse; not a primary defense (Turnstile is).
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_PER_WINDOW = 10;
const ipMintHistory = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
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

function base64UrlEncode(bytes: Uint8Array | string): string {
  let str: string;
  if (typeof bytes === "string") {
    str = bytes;
  } else {
    str = "";
    for (let i = 0; i < bytes.length; i++) {
      str += String.fromCharCode(bytes[i]);
    }
  }
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function signJwt(
  payload: Record<string, unknown>,
  secret: string,
): Promise<string> {
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
  const sigB64 = base64UrlEncode(sigBytes);
  return `${signingInput}.${sigB64}`;
}

async function verifyTurnstile(
  token: string,
  secret: string,
  remoteIp: string | null,
): Promise<boolean> {
  const body = new FormData();
  body.append("secret", secret);
  body.append("response", token);
  if (remoteIp) body.append("remoteip", remoteIp);
  try {
    const r = await fetch(TURNSTILE_VERIFY_URL, { method: "POST", body });
    if (!r.ok) return false;
    const data = (await r.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  if (!env.TURNSTILE_SECRET_KEY || !env.PREVIEW_TOKEN_SECRET) {
    return jsonResponse(503, { error: "preview-token mint not configured" });
  }

  const ip =
    request.headers.get("CF-Connecting-IP") ||
    request.headers.get("X-Real-IP") ||
    "unknown";

  if (rateLimited(ip)) {
    return new Response(
      JSON.stringify({ error: "rate_limited" }),
      {
        status: 429,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "retry-after": "60",
        },
      },
    );
  }

  let body: { turnstile_token?: string };
  try {
    body = await request.json();
  } catch {
    return jsonResponse(400, { error: "invalid_json" });
  }

  const turnstileToken = (body.turnstile_token || "").trim();
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
};

// Block any non-POST method explicitly so accidental GETs don't leak
// implementation details via the default 405 handler.
export const onRequest: PagesFunction<Env> = async ({ request }) => {
  if (request.method === "POST") {
    // Should never reach here - onRequestPost handles POST. Defensive.
    return jsonResponse(500, { error: "routing_misconfig" });
  }
  return new Response("Method Not Allowed", {
    status: 405,
    headers: { allow: "POST" },
  });
};
