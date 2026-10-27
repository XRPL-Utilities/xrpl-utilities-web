// Stale-data notice for the live dashboards (Home, Vault, Flows).
// Pure ES2018, no framework.
//
// Panels used to swallow fetch failures, so a visitor saw skeletons that
// never filled, or numbers from an earlier refresh, with nothing saying the
// data had stopped updating. Each loader now reports its outcome here:
//   XRStale.ok('vault-summary')   after a successful refresh
//   XRStale.fail('vault-summary') after a failed one
// While any source is failing, a small notice says so: either when the page
// last loaded data, or that nothing has loaded yet. It clears itself once
// every failing source recovers.

(function (global) {
  'use strict';

  const failing = new Set();
  const lastOk = {};   // source -> Date of its last good refresh
  let box = null;

  function hhmm(d) {
    return String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0') + ' UTC';
  }

  function ensureBox() {
    if (box || !global.document || !document.body) return box;
    box = document.createElement('div');
    box.id = 'stale-notice';
    box.setAttribute('role', 'status');
    box.setAttribute('aria-live', 'polite');
    box.className = 'hidden fixed bottom-4 left-4 right-4 sm:left-auto sm:max-w-sm z-50 rounded-lg border border-amber-500/40 bg-panel px-4 py-3 text-xs leading-relaxed text-amber-200 shadow-lg';
    document.body.appendChild(box);
    return box;
  }

  function render() {
    const b = ensureBox();
    if (!b) return;
    if (!failing.size) {
      b.classList.add('hidden');
      b.textContent = '';
      return;
    }
    // The oldest data on screen decides the message. A failing source that
    // never loaded has nothing on screen, which is worse than old data.
    let oldest = null;
    let neverLoaded = false;
    failing.forEach(function (src) {
      const t = lastOk[src];
      if (!t) neverLoaded = true;
      else if (!oldest || t < oldest) oldest = t;
    });
    b.textContent = neverLoaded
      ? 'Some live data could not be loaded. Retrying automatically.'
      : 'Some live data is delayed. Parts of this page show the last update from ' + hhmm(oldest) + '. Retrying automatically.';
    b.classList.remove('hidden');
  }

  function ok(source) {
    lastOk[source] = new Date();
    if (failing.delete(source)) render();
  }

  function fail(source) {
    if (!failing.has(source)) {
      failing.add(source);
      render();
    }
  }

  global.XRStale = {
    ok: ok,
    fail: fail,
    failing: function () { return Array.from(failing); },
  };
})(typeof window !== 'undefined' ? window : globalThis);
