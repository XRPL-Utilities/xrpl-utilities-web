/* /build/ page: use-case tabs and the JSON answer shown in each.
 *
 * The trading bot tab asks Pulse for a live market briefing. That bundle is
 * free to site visitors on the visitor pass (api-resilient.js attaches it
 * after the first 402). The other bundles are paid even here, so their tabs
 * show the stored answers in build-samples.js, with the capture date.
 *
 * Everything from the API is written with textContent, never as HTML: bundle
 * summaries quote on-chain names that anyone can set.
 */
(function () {
  'use strict';

  var LIVE_BUNDLE = 'xrp-market-briefing';
  var LIVE_URL = 'https://pulse.xrpl-utilities.io/bundles/xrp-market-briefing';
  var TRIM = '__xru_trimmed__';
  var store = window.XRU_BUILD_SAMPLES || { bundles: {} };

  function etDate(iso, withTime) {
    var d = new Date(iso);
    if (!iso || isNaN(d.getTime())) return null;
    var opts = { timeZone: 'America/New_York', month: 'short', day: 'numeric', year: 'numeric' };
    if (withTime) { opts.hour = 'numeric'; opts.minute = '2-digit'; }
    return d.toLocaleString('en-US', opts) + (withTime ? ' ET' : '');
  }

  // Same shape the stored samples have: headline fields in full, each
  // section shortened to its label. A live answer also keeps provenance.
  function shorten(doc) {
    var out = {
      bundle: doc.bundle,
      generated_at: doc.generated_at,
      summary: doc.summary,
      key_numbers: doc.key_numbers,
      sections: {},
    };
    var secs = doc.sections && typeof doc.sections === 'object' ? doc.sections : {};
    Object.keys(secs).forEach(function (name) {
      var s = secs[name] || {};
      out.sections[name] = { source: s.source, status: s.status, as_of: s.as_of, data: TRIM };
    });
    if (doc.provenance) out.provenance = doc.provenance;
    out.schema_version = doc.schema_version;
    return out;
  }

  function render(panel, doc, statusText) {
    var pre = panel.querySelector('.answer');
    var status = panel.querySelector('.answer-status');
    if (!doc || typeof doc.summary !== 'string' || !doc.key_numbers) {
      if (pre) pre.textContent = 'This answer could not be loaded. Try again in a minute.';
      if (status) status.textContent = '';
      return;
    }
    var text = JSON.stringify(shorten(doc), null, 2).split('"' + TRIM + '"').join('{ … }');
    if (pre) pre.textContent = text;
    if (status) status.textContent = statusText;
    if (doc.bundle === 'xrpl-network-snapshot') {
      var agent = document.getElementById('agent-answer');
      if (agent) agent.textContent = doc.summary;
    }
  }

  function stored(name) {
    var doc = store.bundles && store.bundles[name];
    var when = etDate(store.captured_at, false);
    return { doc: doc, label: when ? 'Stored answer from ' + when : 'Stored answer' };
  }

  function loadPanels() {
    var panels = document.querySelectorAll('.case-panel');
    for (var i = 0; i < panels.length; i++) {
      var name = panels[i].getAttribute('data-bundle');
      if (name === LIVE_BUNDLE) continue;
      var s = stored(name);
      render(panels[i], s.doc, s.label);
    }
    var live = document.querySelector('.case-panel[data-bundle="' + LIVE_BUNDLE + '"]');
    if (!live) return;
    var fallback = stored(LIVE_BUNDLE);
    var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 20000) : null;
    fetch(LIVE_URL, ctrl ? { signal: ctrl.signal } : undefined)
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (doc) {
        var when = etDate(doc.generated_at, true);
        render(live, doc, when ? 'Live answer, ' + when : 'Live answer');
      })
      .catch(function () { render(live, fallback.doc, fallback.label); })
      .then(function () { if (timer) clearTimeout(timer); });
  }

  // ---- tabs (WAI-ARIA tabs pattern, with a shareable #hash per tab) ----
  var tabs = Array.prototype.slice.call(document.querySelectorAll('#case-tabs [role="tab"]'));

  function select(tab, focus) {
    tabs.forEach(function (t) {
      var on = t === tab;
      t.setAttribute('aria-selected', on ? 'true' : 'false');
      t.setAttribute('tabindex', on ? '0' : '-1');
      var panel = document.getElementById(t.getAttribute('aria-controls'));
      if (panel) panel.hidden = !on;
    });
    if (focus) tab.focus();
  }

  function slug(tab) { return tab.id.replace(/^tab-/, ''); }

  tabs.forEach(function (tab, i) {
    tab.addEventListener('click', function () {
      select(tab, false);
      try { history.replaceState(null, '', '#' + slug(tab)); } catch (_) {}
    });
    tab.addEventListener('keydown', function (e) {
      var next = null;
      if (e.key === 'ArrowRight') next = tabs[(i + 1) % tabs.length];
      else if (e.key === 'ArrowLeft') next = tabs[(i - 1 + tabs.length) % tabs.length];
      else if (e.key === 'Home') next = tabs[0];
      else if (e.key === 'End') next = tabs[tabs.length - 1];
      if (!next) return;
      e.preventDefault();
      select(next, true);
      try { history.replaceState(null, '', '#' + slug(next)); } catch (_) {}
    });
  });

  function fromHash() {
    var want = (location.hash || '').replace(/^#/, '');
    for (var i = 0; i < tabs.length; i++) {
      if (slug(tabs[i]) === want) {
        select(tabs[i], false);
        var box = document.getElementById('use-cases');
        if (box && box.scrollIntoView) box.scrollIntoView();
        return;
      }
    }
  }

  fromHash();
  window.addEventListener('hashchange', fromHash);
  loadPanels();
})();
