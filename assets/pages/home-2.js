(function () {
  const TELEMETRY = 'https://telemetry.xrpl-utilities.io';
  const PULSE     = 'https://pulse.xrpl-utilities.io';
  const TRUST     = 'https://trust.xrpl-utilities.io';
  const SENTINEL  = 'https://sentinel.xrpl-utilities.io';
  const FLOWS     = 'https://flows.xrpl-utilities.io';

  const elRunrate    = document.getElementById('ls-runrate');
  const elWallets    = document.getElementById('ls-wallets');
  const elWalletsDelta = document.getElementById('ls-wallets-delta');
  const elEvents     = document.getElementById('ls-events');
  const elDomains    = document.getElementById('ls-domains');
  const elScans      = document.getElementById('ls-scans');
  const elRwaIssuers = document.getElementById('ls-rwa-issuers');
  const elEtfAum     = document.getElementById('ls-etf-aum');
  const elEtfDelta   = document.getElementById('ls-etf-delta');
  const elAsOf       = document.getElementById('live-state-asof');

  // Compact USD: $123M / $4.2B / $1.05T. Keeps the box width stable
  // across orders of magnitude. Below $1M we still show full digits
  // because the run-rate would be a soft signal at that scale.
  function fmtUsd(n) {
    if (typeof n !== 'number' || !isFinite(n)) return '–';
    const sign = n < 0 ? '-' : '';
    const abs = Math.abs(n);
    if (abs >= 1e12) return sign + '$' + (abs / 1e12).toFixed(2) + 'T';
    if (abs >= 1e9)  return sign + '$' + (abs / 1e9).toFixed(2)  + 'B';
    if (abs >= 1e6)  return sign + '$' + (abs / 1e6).toFixed(1)  + 'M';
    if (abs >= 1e3)  return sign + '$' + Math.round(abs / 1e3)   + 'k';
    return sign + '$' + Math.round(abs).toString();
  }
  function fmtCount(n) {
    if (typeof n !== 'number' || !isFinite(n)) return '–';
    return n.toLocaleString('en-US');
  }
  function setText(el, txt) { if (el) el.textContent = txt; }

  // Each tile's source reports to the stale-data notice
  // (assets/stale-banner.js), keyed by URL, so a dead service is visible
  // instead of leaving a dash or an old number with a fresh "as of".
  async function fetchJson(url) {
    let body = null;
    try {
      const r = await fetch(url, { mode: 'cors' });
      if (r.ok) body = await r.json();
    } catch (e) {
      body = null;
    }
    if (window.XRStale) body ? window.XRStale.ok(url) : window.XRStale.fail(url);
    return body;
  }

  async function refresh() {
    const [tel, pulseHc, trustStats, sentinelStats, rwaSummary, flowsCorr, pulseNet] = await Promise.all([
      fetchJson(TELEMETRY + '/settlement/totals'),
      fetchJson(PULSE     + '/healthz'),
      fetchJson(TRUST     + '/stats'),
      fetchJson(SENTINEL  + '/stats'),
      fetchJson(PULSE     + '/stats/rwa-summary'),
      fetchJson(FLOWS     + '/stats/correlation?days=1'),
      fetchJson(PULSE     + '/stats/network?window_days=2'),
    ]);

    if (tel && typeof tel.annualized_run_rate_usd === 'number') {
      setText(elRunrate, fmtUsd(tel.annualized_run_rate_usd));
    }

    if (pulseNet && pulseNet.latest && typeof pulseNet.latest.total_addresses === 'number') {
      setText(elWallets, fmtCount(pulseNet.latest.total_addresses));
      const prev = pulseNet.deltas && pulseNet.deltas.since_previous;
      if (prev && typeof prev.addresses === 'number' && elWalletsDelta) {
        const sign = prev.addresses >= 0 ? '+' : '−';
        const cls = prev.addresses >= 0 ? 'text-emerald-400' : 'text-rose-400';
        elWalletsDelta.className = cls;
        elWalletsDelta.textContent = sign + fmtCount(Math.abs(prev.addresses)) + ' since prior day';
      }
    }

    const evCount = pulseHc && pulseHc.checks && pulseHc.checks.db && pulseHc.checks.db.event_count;
    if (typeof evCount === 'number') {
      setText(elEvents, fmtCount(evCount));
    }

    const domSize = trustStats && trustStats.caches && trustStats.caches.domains_list_size;
    if (typeof domSize === 'number') {
      setText(elDomains, fmtCount(domSize));
    }

    const scanRows = sentinelStats && sentinelStats.scan_recorder && sentinelStats.scan_recorder.row_count;
    if (typeof scanRows === 'number') {
      setText(elScans, fmtCount(scanRows));
    }

    const rwaTracked = rwaSummary && rwaSummary.totals && rwaSummary.totals.tracked_issuers;
    if (typeof rwaTracked === 'number') {
      setText(elRwaIssuers, fmtCount(rwaTracked));
    }

    // Flows: latest day of etf_total_aum_daily across both tiers
    // (spot + indirect-basket slice). Day-over-day delta also
    // computed when we have two consecutive non-null rows; the
    // tile subtitle flips to green/red `+$X.XM today` framing so
    // direction is visible at a glance.
    if (flowsCorr && Array.isArray(flowsCorr.etf_total_aum_daily)) {
      const rows = flowsCorr.etf_total_aum_daily.filter(
        r => r && typeof r.aum_usd_total === 'number'
      );
      if (rows.length) {
        const latest = rows[rows.length - 1];
        setText(elEtfAum, fmtUsd(latest.aum_usd_total));
        if (rows.length >= 2 && elEtfDelta) {
          const prior = rows[rows.length - 2];
          const delta = latest.aum_usd_total - prior.aum_usd_total;
          const sign = delta >= 0 ? '+' : '-';
          const cls = delta >= 0 ? 'text-emerald-400' : 'text-rose-400';
          const dollarStr = fmtUsd(Math.abs(delta));
          elEtfDelta.className = cls;
          elEtfDelta.textContent = sign + dollarStr + ' since prior day';
        } else if (elEtfDelta) {
          elEtfDelta.className = 'text-muted';
          // Pull live tracked count from the same response so the
          // subtitle stays in sync when new ETFs surface upstream.
          const n = Array.isArray(flowsCorr.tracked_etfs) ? flowsCorr.tracked_etfs.length : null;
          elEtfDelta.textContent = n
            ? `XRP-attributable across ${n} tracked ETFs`
            : 'XRP-attributable across tracked ETFs';
        }
      }
    }

    // "as of" is the time of the last refresh that reached every source.
    // A partial or failed refresh leaves the previous stamp in place.
    if (tel && pulseHc && trustStats && sentinelStats && rwaSummary && flowsCorr && pulseNet) {
      const now = new Date();
      const hh = String(now.getUTCHours()).padStart(2, '0');
      const mm = String(now.getUTCMinutes()).padStart(2, '0');
      setText(elAsOf, 'as of ' + hh + ':' + mm + ' UTC');
    }
  }

  refresh();
  setInterval(refresh, 60000);
})();
