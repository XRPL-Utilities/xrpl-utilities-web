/* Marketing-site preview-token client.
 *
 * Replaces the spoofable Origin header that XR-* API services used to
 * trust as a free-preview credential. Now every API call from the
 * marketing site carries a short-TTL JWT signed by /api/preview-token,
 * which only mints after a successful Turnstile challenge.
 *
 * Public surface:
 *   window.PreviewToken.getToken()   -> Promise<string|null>
 *   window.PreviewToken.authHeaders() -> Promise<{Authorization?: string}>
 *
 * Both are safe to call from any number of concurrent fetches; under
 * the hood there's exactly one in-flight mint per page-load.
 *
 * Failure mode: if Turnstile or /api/preview-token is unreachable,
 * getToken() resolves to null. Callers attach no Authorization header
 * and the API returns 402 (paid path) - the existing x402 payment UI
 * still works as a fallback.
 */

(function (global) {
  'use strict';

  // Public Site Key. Safe to commit; meant for HTML embed.
  const TURNSTILE_SITE_KEY = '0x4AAAAAADKZRldTKu6Mcd7l';
  const MINT_ENDPOINT = '/api/preview-token';
  const STORAGE_KEY = 'xru_preview_token_v1';
  // Refresh a few seconds before the server's exp so we don't race the
  // clock and ship an expired token.
  const REFRESH_BUFFER_SECONDS = 30;

  let inflightPromise = null;

  function nowSec() { return Math.floor(Date.now() / 1000); }

  function loadCached() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed.token !== 'string' || typeof parsed.expires_at !== 'number') {
        return null;
      }
      if (parsed.expires_at - nowSec() <= REFRESH_BUFFER_SECONDS) return null;
      return parsed;
    } catch (_) { return null; }
  }

  function saveCached(token, expires_at) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ token: token, expires_at: expires_at }));
    } catch (_) { /* private browsing / quota - non-fatal */ }
  }

  function clearCached() {
    try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
  }

  // Wait for the global turnstile object to be ready. The Turnstile
  // script loads async; if a page calls getToken() before the script
  // arrives we poll briefly.
  function waitForTurnstile(timeoutMs) {
    return new Promise(function (resolve, reject) {
      const start = Date.now();
      function tick() {
        if (global.turnstile && typeof global.turnstile.execute === 'function') {
          resolve(global.turnstile);
          return;
        }
        if (Date.now() - start > timeoutMs) {
          reject(new Error('turnstile_unavailable'));
          return;
        }
        setTimeout(tick, 100);
      }
      tick();
    });
  }

  // Run an invisible Turnstile challenge and resolve with the cf-turnstile-response.
  function solveTurnstile() {
    return new Promise(function (resolve, reject) {
      waitForTurnstile(5000).then(function (turnstile) {
        // Use a transient container; turnstile.render returns a widget id.
        const container = document.createElement('div');
        container.style.display = 'none';
        document.body.appendChild(container);
        let widgetId = null;
        try {
          widgetId = turnstile.render(container, {
            sitekey: TURNSTILE_SITE_KEY,
            size: 'invisible',
            callback: function (token) {
              resolve(token);
              try { turnstile.remove(widgetId); } catch (_) {}
              container.remove();
            },
            'error-callback': function (err) {
              reject(new Error('turnstile_error: ' + (err || 'unknown')));
              try { turnstile.remove(widgetId); } catch (_) {}
              container.remove();
            },
            'timeout-callback': function () {
              reject(new Error('turnstile_timeout'));
              try { turnstile.remove(widgetId); } catch (_) {}
              container.remove();
            },
          });
          // Invisible widget needs an explicit execute to fire.
          turnstile.execute(widgetId);
        } catch (e) {
          reject(e);
          try { container.remove(); } catch (_) {}
        }
      }).catch(reject);
    });
  }

  async function mintFresh() {
    const turnstileToken = await solveTurnstile();
    const r = await fetch(MINT_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ turnstile_token: turnstileToken }),
    });
    if (!r.ok) {
      let detail = '';
      try { const e = await r.json(); detail = e.error || ''; } catch (_) {}
      throw new Error('mint_failed_' + r.status + (detail ? ':' + detail : ''));
    }
    const body = await r.json();
    if (!body.token || !body.expires_at) throw new Error('mint_response_invalid');
    saveCached(body.token, body.expires_at);
    return body.token;
  }

  // Coalesce concurrent callers onto a single in-flight mint. Useful on
  // pages that fire multiple API calls in parallel right after load.
  function getToken() {
    const cached = loadCached();
    if (cached) return Promise.resolve(cached.token);
    if (inflightPromise) return inflightPromise;
    inflightPromise = mintFresh()
      .catch(function (err) {
        clearCached();
        // Bubble up null so callers can degrade gracefully (no token =
        // no Authorization header = API returns 402 = existing payment
        // UI takes over).
        if (global.console && console.warn) {
          console.warn('preview-token mint failed:', err.message || err);
        }
        return null;
      })
      .finally(function () { inflightPromise = null; });
    return inflightPromise;
  }

  async function authHeaders() {
    const token = await getToken();
    if (!token) return {};
    return { 'Authorization': 'Bearer ' + token };
  }

  global.PreviewToken = {
    getToken: getToken,
    authHeaders: authHeaders,
    // Exposed for debugging; not part of the public contract.
    _clear: clearCached,
  };
})(window);
