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

  function utcDay(iso) {
    var d = new Date(iso);
    if (!iso || isNaN(d.getTime())) return null;
    return d.toLocaleString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' });
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

  // ---- table view: what a person would see after their agent reads it ----
  // Plain labels and units for each key_numbers field. A field missing here
  // (a later schema) still shows, under its own name.
  var FIELDS = {
    market_posture: ['Market posture', 'text'],
    whale_wallets_1m_plus: ['Wallets holding 1M+ XRP', 'count'],
    whale_wallets_change: ['Change since the last count', 'signed'],
    exchange_net_flow_24h_usd: ['Net XRP leaving exchanges, 24h', 'usd_delta'],
    exchange_net_direction_24h: ['Exchange flow, 24h', 'text'],
    rlusd_circulating_xrpl: ['RLUSD in circulation on XRPL', 'rlusd'],
    next_escrow_unlock_date: ['Next Ripple escrow unlock', 'date'],
    next_escrow_unlock_xrp: ['Next unlock size', 'xrp'],
    xrp_funds_xrp_held: ['XRP held by funds', 'xrp'],
    sell_10m_usd_slippage_bps_xrp_rlusd: ['Price impact of a $10M XRP sell (XRP/RLUSD)', 'bps'],
    address: ['Address', 'text'],
    activity_level: ['Activity level', 'text'],
    activity_score: ['Activity score (0 to 100)', 'count'],
    transaction_count: ['Transactions scanned', 'count'],
    known_as: ['Known as', 'text'],
    role: ['Role', 'text'],
    domain_verdict: ['Website check', 'text'],
    tx_count_90d: ['Transactions, last 90 days', 'count'],
    xrp_net_90d: ['Net XRP, last 90 days', 'xrp_delta'],
    statement_partial: ['Statement covers only part of the 90 days', 'bool'],
    pulse_events: ['Events on our feed', 'count'],
    is_domain_operator: ['Runs a permissioned domain', 'bool'],
    is_credential_issuer: ['Issues credentials', 'bool'],
    issuer: ['Issuer', 'text'],
    currency: ['Currency code', 'text'],
    name: ['Name', 'text'],
    asset_class: ['Asset class', 'text'],
    status: ['Status', 'text'],
    circulating: ['In circulation', 'token'],
    holders: ['Holders', 'count'],
    growth_pct_7d: ['Supply change, 7 days', 'pct'],
    growth_pct_30d: ['Supply change, 30 days', 'pct'],
    top_holder_pct: ['Largest holder\'s share', 'share'],
    mints_24h: ['Mints, 24h', 'count'],
    burns_24h: ['Burns, 24h', 'count'],
    supply_net_change_30d: ['Net supply change, 30 days', 'token_delta'],
    amm_pools: ['AMM pools', 'count'],
    issuer_runs_permissioned_domain: ['Issuer runs a permissioned domain', 'bool'],
    issuer_tx_count_90d: ['Issuer transactions, 90 days', 'count'],
    window_days: ['Window', 'days'],
    funds_total_aum_usd: ['Fund assets', 'usd'],
    funds_aum_change_usd: ['Change in fund assets, prices included', 'usd_delta'],
    funds_aum_change_direction: ['Fund direction', 'text'],
    xrp_held_by_funds: ['XRP held by funds', 'xrp'],
    net_xrp_left_exchanges: ['Net XRP leaving exchanges', 'xrp_delta'],
    same_direction: ['Funds and ledger point the same way', 'bool'],
    rolling_pearson_r: ['Correlation (r)', 'r'],
    correlation: ['Correlation type', 'text'],
    operator: ['Operator', 'text'],
    jurisdiction: ['Jurisdiction', 'text'],
    domains: ['Permissioned domains', 'count'],
    credentials_outstanding: ['Credentials outstanding', 'count'],
    credential_subjects: ['Credential holders', 'count'],
    permissioned_offers_24h: ['Permissioned offers, 24h', 'count'],
    unique_traders_24h: ['Traders, 24h', 'count'],
    amm_events_24h: ['AMM events, 24h', 'count'],
    first_seen: ['First seen', 'date'],
    last_active: ['Last active', 'datetime'],
    funded_accounts: ['Funded accounts', 'count'],
    new_accounts_7d: ['New accounts, 7 days', 'count'],
    active_accounts_24h: ['Active accounts, 24h', 'count'],
    transactions_24h: ['Transactions, 24h', 'count'],
    trustlines: ['Trust lines', 'count'],
    circulating_xrp: ['XRP circulating', 'xrp'],
    escrowed_xrp: ['XRP in escrow', 'xrp'],
    ripple_escrowed_xrp: ['XRP in Ripple\'s escrow', 'xrp'],
    escrow_scope: [null, 'note'],
    payment_volume_24h_usd: ['Payment volume, 24h', 'usd'],
    payments_24h: ['Payments, 24h', 'count'],
  };
  var TEXT_VALUES = { heuristic_only: 'Measurement only, not cause and effect' };

  function compact(n, digits) {
    var a = Math.abs(n);
    if (a >= 1e9) return (n / 1e9).toFixed(2) + 'B';
    if (a >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    return n.toLocaleString('en-US', { maximumFractionDigits: digits == null ? 2 : digits });
  }

  function sign(n) { return n > 0 ? '+' : n < 0 ? '\u2212' : ''; }

  // What an empty field means, said plainly. A blank here is usually a fact
  // (no public name, no role on file), not a failure, so the table says which.
  var EMPTY = {
    role: function () { return 'None on file'; },
    known_as: function () { return 'No public label'; },
    xrp_net_90d: function (kn) { return kn && kn.statement_partial ? 'Not counted, history is partial' : 'Not available'; },
    name: function () { return 'No public name'; },
    jurisdiction: function () { return 'Not disclosed'; },
  };

  function formatValue(kind, v, kn, key) {
    if (v === null || v === undefined || v === '') {
      return Object.prototype.hasOwnProperty.call(EMPTY, key) ? EMPTY[key](kn) : 'Not available';
    }
    if (kind === 'bool') return v ? 'Yes' : 'No';
    if (typeof v !== 'number' || !isFinite(v)) {
      var t = String(v);
      if (TEXT_VALUES[t]) return TEXT_VALUES[t];
      // A calendar date (an escrow unlock) is a UTC day; shown in Eastern it
      // would land on the day before. A moment (last active) is shown in ET.
      if (kind === 'date') return utcDay(t) || t;
      if (kind === 'datetime') return etDate(t, true) || t;
      return t.length && /^[a-z]/.test(t) && !/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(t)
        ? t.charAt(0).toUpperCase() + t.slice(1).replace(/_/g, ' ') : t;
    }
    var abs = Math.abs(v);
    switch (kind) {
      case 'usd': return '$' + compact(v);
      case 'usd_delta': return sign(v) + '$' + compact(abs);
      case 'xrp': return compact(v) + ' XRP';
      case 'xrp_delta': return sign(v) + compact(abs) + ' XRP';
      case 'rlusd': return compact(v) + ' RLUSD';
      case 'token': return compact(v) + (kn && kn.currency ? ' ' + kn.currency : '');
      case 'token_delta': return sign(v) + compact(abs) + (kn && kn.currency ? ' ' + kn.currency : '');
      case 'signed': return sign(v) + abs.toLocaleString('en-US');
      case 'pct': return sign(v) + abs.toLocaleString('en-US', { maximumFractionDigits: 2 }) + '%';
      case 'share': return (v * 100).toLocaleString('en-US', { maximumFractionDigits: 1 }) + '%';
      case 'bps': return (v / 100).toLocaleString('en-US', { maximumFractionDigits: 1 }) + '% (' + Math.round(v).toLocaleString('en-US') + ' bps)';
      case 'days': return v + (v === 1 ? ' day' : ' days');
      case 'r': return v.toFixed(2);
      default: return v.toLocaleString('en-US', { maximumFractionDigits: 2 });
    }
  }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function buildTable(box, doc) {
    if (!box) return;
    var kn = doc.key_numbers || {};
    var nodes = [el('p', 't-summary', doc.summary)];
    var table = el('table');
    var body = el('tbody');
    var notes = [];
    Object.keys(kn).forEach(function (key) {
      var spec = FIELDS[key] || [key.replace(/_/g, ' '), 'auto'];
      if (spec[1] === 'note') { if (kn[key]) notes.push(String(kn[key])); return; }
      var tr = el('tr');
      var th = el('th', null, spec[0]);
      th.setAttribute('scope', 'row');
      tr.appendChild(th);
      tr.appendChild(el('td', null, formatValue(spec[1], kn[key], kn, key)));
      body.appendChild(tr);
    });
    table.appendChild(body);
    nodes.push(table);
    var secs = doc.sections && typeof doc.sections === 'object' ? doc.sections : {};
    var srcs = Object.keys(secs).map(function (n) {
      var s = secs[n] || {};
      return String(s.source || n) + (s.status && s.status !== 'ok' ? ' (' + s.status + ')' : '');
    });
    if (srcs.length) notes.push('From: ' + srcs.join(', ') + '.');
    var led = doc.provenance && doc.provenance.ledger;
    if (led && led.index) notes.push('Served at validated XRP Ledger #' + Number(led.index).toLocaleString('en-US') + '.');
    notes.forEach(function (n) { nodes.push(el('p', 't-note', n)); });
    if (box.replaceChildren) box.replaceChildren.apply(box, nodes);
    else { while (box.firstChild) box.removeChild(box.firstChild); nodes.forEach(function (n) { box.appendChild(n); }); }
  }

  // One choice for every tab, kept for the visit.
  var VIEW_KEY = 'xru_build_view_v1';
  var view = 'json';
  try { if (sessionStorage.getItem(VIEW_KEY) === 'table') view = 'table'; } catch (_) {}

  function applyView() {
    var btns = document.querySelectorAll('.view-btn');
    for (var i = 0; i < btns.length; i++) {
      btns[i].setAttribute('aria-pressed', btns[i].getAttribute('data-view') === view ? 'true' : 'false');
    }
    var pres = document.querySelectorAll('.answer');
    for (var j = 0; j < pres.length; j++) pres[j].hidden = view !== 'json';
    var tables = document.querySelectorAll('.answer-table');
    for (var k = 0; k < tables.length; k++) tables[k].hidden = view !== 'table';
  }

  function bindViews() {
    var btns = document.querySelectorAll('.view-btn');
    for (var i = 0; i < btns.length; i++) {
      btns[i].addEventListener('click', function (e) {
        view = e.currentTarget.getAttribute('data-view') === 'table' ? 'table' : 'json';
        try { sessionStorage.setItem(VIEW_KEY, view); } catch (_) {}
        applyView();
      });
    }
    applyView();
  }

  function render(panel, doc, statusText) {
    var pre = panel.querySelector('.answer');
    var status = panel.querySelector('.answer-status');
    if (!doc || typeof doc.summary !== 'string' || !doc.key_numbers) {
      if (pre) pre.textContent = 'This answer could not be loaded. Try again in a minute.';
      var tb = panel.querySelector('.answer-table');
      if (tb) tb.textContent = 'This answer could not be loaded. Try again in a minute.';
      if (status) status.textContent = '';
      return;
    }
    var text = JSON.stringify(shorten(doc), null, 2).split('"' + TRIM + '"').join('{ … }');
    if (pre) pre.textContent = text;
    if (status) status.textContent = statusText;
    buildTable(panel.querySelector('.answer-table'), doc);
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

  bindViews();
  fromHash();
  window.addEventListener('hashchange', fromHash);
  loadPanels();
})();
