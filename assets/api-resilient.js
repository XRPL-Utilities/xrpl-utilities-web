/* Same-origin fallback for API calls that a visitor's network blocks.
 *
 * Background: 2026-08-10, a visitor on a new Xfinity line saw every data
 * panel on the site empty. Pages rendered fine (they come from this
 * domain), but every request to *.xrpl-utilities.io failed with
 * ERR_SSL_PROTOCOL_ERROR. The cause was xFi Advanced Security, which
 * ships enabled by default for the largest home ISP in the US, blocking
 * the API hosts. Nothing was wrong with the services: valid TLS 1.3,
 * complete chain, every endpoint healthy from every other vantage point.
 *
 * The failure mode is the problem. A blocked visitor gets a complete,
 * confident-looking site with no numbers in it and no error they could
 * act on, so they conclude the product is broken. Ad blockers, DNS
 * filters, corporate proxies and antivirus TLS inspection all produce
 * the same silence; this is a class of failure, not one ISP.
 *
 * The fix: the browser can obviously reach THIS origin, since it just
 * loaded the page from it. On a network-level failure, retry the same
 * request through /api/x/<service>/... on this domain, which the Worker
 * passes through to the API host server-side.
 *
 * Direct-first, on purpose. Unblocked visitors (nearly everyone) keep
 * talking to the API hosts with no extra hop, no Worker request, and no
 * new single point of failure. The proxy only enters the picture for a
 * visitor who would otherwise have seen nothing at all.
 *
 * Load this BEFORE any page script that fetches. It wraps window.fetch
 * so existing call sites need no changes.
 */

(function (global) {
  'use strict';

  var SERVICE_BY_HOST = {
    'sentinel.xrpl-utilities.io': 'sentinel',
    'pulse.xrpl-utilities.io': 'pulse',
    'trust.xrpl-utilities.io': 'trust',
    'telemetry.xrpl-utilities.io': 'telemetry',
    'vault.xrpl-utilities.io': 'vault',
    'flows.xrpl-utilities.io': 'flows',
  };

  var PROXY_PREFIX = '/api/x/';
  // Once one call has proven the direct path is blocked, the rest of the
  // page-load goes straight to the proxy. Without this every single panel
  // pays its own failed request first, which on a page like /pulse/ is a
  // dozen timeouts before anything renders.
  var STICKY_KEY = 'xru_api_proxy_mode_v1';

  // The free-preview token is bound to the visitor's address as the site's
  // Worker saw it at mint time (plus the address one API host saw). On some
  // mobile networks and relays (carrier NAT pools, iCloud Private Relay) each
  // new connection can leave from a different address, so a direct call to
  // another API host arrives from an address the token does not list and
  // gets a 402. The same call through /api/x rides this site's connection,
  // the one the token was minted on, so it matches. After one such rescue
  // the rest of the page-load sends preview calls through the proxy.
  var PREVIEW_STICKY_KEY = 'xru_preview_via_proxy_v1';

  var proxyMode = false;
  var previewViaProxy = false;
  try {
    proxyMode = sessionStorage.getItem(STICKY_KEY) === '1';
    previewViaProxy = sessionStorage.getItem(PREVIEW_STICKY_KEY) === '1';
  } catch (_) { /* private mode: degrade to per-request fallback */ }

  var nativeFetch = global.fetch && global.fetch.bind(global);
  if (!nativeFetch) return;

  function proxyUrlFor(rawUrl) {
    var u;
    try {
      u = new URL(rawUrl, global.location.href);
    } catch (_) {
      return null;
    }
    var service = SERVICE_BY_HOST[u.hostname];
    if (!service) return null;
    return PROXY_PREFIX + service + u.pathname + u.search;
  }

  function requestUrl(input) {
    if (typeof input === 'string') return input;
    if (input instanceof Request) return input.url;
    if (input && typeof input.url === 'string') return input.url;
    if (input && typeof input.toString === 'function') return input.toString();
    return null;
  }

  // A Request carries its own method/headers/body, so rebuilding it against
  // the proxy URL has to clone those across rather than pass a bare string.
  function reissue(input, init, url) {
    if (input instanceof Request) return new Request(url, input);
    return nativeFetch(url, init);
  }

  function sendTo(url, input, init) {
    if (input instanceof Request) return nativeFetch(reissue(input, init, url), init);
    return nativeFetch(url, init);
  }

  function isAbort(err, input, init) {
    if (err && err.name === 'AbortError') return true;
    var signal = (init && init.signal) || (input instanceof Request ? input.signal : null);
    return !!(signal && signal.aborted);
  }

  function headerValue(headers, name) {
    if (!headers) return null;
    if (typeof headers.get === 'function') return headers.get(name);
    var want = name.toLowerCase();
    for (var k in headers) {
      if (Object.prototype.hasOwnProperty.call(headers, k) && k.toLowerCase() === want) return headers[k];
    }
    return null;
  }

  // A free-preview call: it carries the site's Bearer token and no x402
  // payment. Only these are replayed after a 402. A paid call's 402 is the
  // payment challenge doing its job and goes back to the caller untouched.
  // Request objects are left alone too: their body may already be spent.
  function isPreviewCall(input, init) {
    if (input instanceof Request || !init) return false;
    var auth = headerValue(init.headers, 'authorization');
    if (!auth || !/^Bearer\s+\S+/.test(auth)) return false;
    if (headerValue(init.headers, 'payment-signature') || headerValue(init.headers, 'x-payment')) return false;
    var body = init.body;
    return body == null || typeof body === 'string';
  }

  function markPreviewViaProxy() {
    previewViaProxy = true;
    try { sessionStorage.setItem(PREVIEW_STICKY_KEY, '1'); } catch (_) {}
  }

  function markBlocked() {
    proxyMode = true;
    try { sessionStorage.setItem(STICKY_KEY, '1'); } catch (_) {}
  }

  global.fetch = function (input, init) {
    var url = requestUrl(input);
    var proxied = url ? proxyUrlFor(url) : null;

    // Not one of our API hosts (fonts, Turnstile, same-origin assets):
    // leave it completely alone.
    if (!proxied) return nativeFetch(input, init);

    if (proxyMode) return sendTo(proxied, input, init);
    var preview = isPreviewCall(input, init);
    if (preview && previewViaProxy) return sendTo(proxied, input, init);

    return nativeFetch(input, init).then(function (res) {
      if (res.status !== 402 || !preview) return res;
      if (isAbort(null, input, init)) return res;
      if (global.console && console.warn) {
        console.warn('[xru] preview call got 402 directly; retrying same-origin via ' + PROXY_PREFIX);
      }
      return sendTo(proxied, input, init).then(function (viaProxy) {
        if (viaProxy.status !== 402) markPreviewViaProxy();
        return viaProxy;
      }, function () { return res; });
    }, function (err) {
      // A caller's own abort (a timeout, a cancelled scan) is not a blocked
      // network. Retrying it would ignore the cancel, and marking the session
      // blocked would send every later call through the proxy for no reason.
      if (isAbort(err, input, init)) throw err;
      // Only network-level failures land here: DNS block, TLS reset,
      // blocked-by-extension, offline. HTTP errors resolve above, and the
      // only one ever replayed is a free-preview 402 (see isPreviewCall).
      markBlocked();
      if (global.console && console.warn) {
        console.warn(
          '[xru] direct API call failed (' + (err && err.message) + '); ' +
          'retrying same-origin via ' + PROXY_PREFIX
        );
      }
      return sendTo(proxied, input, init);
    });
  };

  // Exposed for debugging and for the tests; not a public contract.
  global.XRUApiResilient = {
    proxyUrlFor: proxyUrlFor,
    isProxyMode: function () { return proxyMode; },
    isPreviewViaProxy: function () { return previewViaProxy; },
    _reset: function () {
      proxyMode = false;
      previewViaProxy = false;
      try { sessionStorage.removeItem(STICKY_KEY); } catch (_) {}
      try { sessionStorage.removeItem(PREVIEW_STICKY_KEY); } catch (_) {}
    },
  };
})(window);
