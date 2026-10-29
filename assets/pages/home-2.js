(function () {
  const TELEMETRY = 'https://telemetry.xrpl-utilities.io';
  const PULSE     = 'https://pulse.xrpl-utilities.io';
  const TRUST     = 'https://trust.xrpl-utilities.io';
  const FLOWS     = 'https://flows.xrpl-utilities.io';

  const $ = (id) => document.getElementById(id);
  const elAsOf = $('live-state-asof');

  // Compact USD: $123M / $4.2B / $1.05T. Keeps the box width stable
  // across orders of magnitude.
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
  // 1000000000 -> "1B", 250000000 -> "250M". Escrow releases are round.
  function fmtXrp(n) {
    if (n >= 1e9) return +(n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return +(n / 1e6).toFixed(1) + 'M';
    return fmtCount(Math.round(n));
  }
  function setText(el, txt) { if (el) el.textContent = txt; }

  // Each source reports to the stale-data notice (assets/stale-banner.js),
  // keyed by URL, so a dead service is visible instead of leaving a dash or
  // an old number with a fresh "as of".
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

  // ---- hero bars --------------------------------------------------------
  const barsEl = $('hero-bars');
  function drawBars(values) {
    if (!barsEl || !barsEl.ownerDocument) return;
    while (barsEl.firstChild) barsEl.removeChild(barsEl.firstChild);
    const max = values ? Math.max.apply(null, values.concat([1])) : 1;
    for (let i = 0; i < 24; i++) {
      const bar = document.createElement('div');
      if (!values) {
        bar.className = 'home-bar home-bar-skeleton';
        bar.style.height = (20 + ((i * 37) % 50)) + '%';
      } else {
        const v = values[i] || 0;
        bar.className = 'home-bar' + (i === 23 ? ' home-bar-now' : '');
        bar.style.height = Math.max(1.5, (v / max) * 100) + '%';
        bar.title = (23 - i === 0 ? 'This hour' : (23 - i) + 'h ago') + ': ' + fmtUsd(v);
      }
      barsEl.appendChild(bar);
    }
  }
  drawBars(null);

  function renderLarge(flow) {
    if (!flow || !flow.totals || !Array.isArray(flow.hourly)) return;
    const t = flow.totals;
    const usd = (t.institutional_usd || 0) + (t.whale_usd || 0);
    const count = (t.institutional_count || 0) + (t.whale_count || 0);
    setText($('hero-large-usd'), fmtUsd(usd));
    setText($('hero-large-count'), 'across ' + fmtCount(count) + (count === 1 ? ' transfer' : ' transfers'));
    // hourly[] runs from hour_offset -23 (oldest) to 0 (this hour).
    const values = new Array(24).fill(0);
    for (const b of flow.hourly) {
      const idx = 23 + (b && typeof b.hour_offset === 'number' ? b.hour_offset : NaN);
      if (idx >= 0 && idx < 24) values[idx] = (b.institutional_usd || 0) + (b.whale_usd || 0);
    }
    drawBars(values);
    let peak = 0;
    for (let i = 1; i < 24; i++) if (values[i] > values[peak]) peak = i;
    setText($('hero-bars-summary'), 'Busiest hour: ' + fmtUsd(values[peak]) + ', ' +
      (23 - peak === 0 ? 'this hour.' : (23 - peak) + ' hours ago.'));
  }

  function renderSettled(tel) {
    if (!tel || typeof tel.volume_24h_usd !== 'number') return;
    setText($('ls-settled'), fmtUsd(tel.volume_24h_usd));
    if (typeof tel.volume_24h_payments_count === 'number') {
      setText($('ls-settled-sub'), fmtCount(tel.volume_24h_payments_count) + ' XRP and RLUSD payments');
    }
  }

  // Holder-centric sign: XRP leaving exchanges counts as positive. Read the
  // two directions straight from flow_direction so the wording can't drift
  // from the sign convention.
  function renderNetFlow(net) {
    const fd = net && net.flow_direction;
    if (!fd || typeof fd.exchange_to_wallet_usd !== 'number' || typeof fd.wallet_to_exchange_usd !== 'number') return;
    const diff = fd.exchange_to_wallet_usd - fd.wallet_to_exchange_usd;
    setText($('ls-netflow-label'), diff >= 0 ? 'Net XRP off exchanges, 24h' : 'Net XRP onto exchanges, 24h');
    setText($('ls-netflow'), fmtUsd(Math.abs(diff)));
    if (typeof net.exchange_count === 'number') {
      setText($('ls-netflow-sub'), 'across ' + fmtCount(net.exchange_count) + ' exchanges');
    }
  }

  function renderEscrow(cal) {
    const next = cal && cal.next_unlock;
    if (!next || typeof next.total_xrp !== 'number' || typeof next.unlock_date !== 'string') return;
    const when = new Date(next.unlock_date);
    if (isNaN(when.getTime())) return;
    setText($('ls-escrow'), fmtXrp(next.total_xrp) + ' XRP');
    // Count UTC calendar days, so a release at 00:00 on Nov 1 reads
    // "in 3 days" all through Oct 29, matching the date shown beside it.
    const now = new Date();
    const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const day = Date.UTC(when.getUTCFullYear(), when.getUTCMonth(), when.getUTCDate());
    const days = Math.round((day - today) / 86400000);
    const date = when.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
    const rel = days <= 0 ? 'today' : days === 1 ? 'tomorrow' : 'in ' + days + ' days';
    setText($('ls-escrow-sub'), date + ' UTC, ' + rel);
  }

  function renderWallets(pulseNet) {
    if (!pulseNet || !pulseNet.latest || typeof pulseNet.latest.total_addresses !== 'number') return;
    setText($('ls-wallets'), fmtCount(pulseNet.latest.total_addresses));
    const prev = pulseNet.deltas && pulseNet.deltas.since_previous;
    const el = $('ls-wallets-delta');
    if (prev && typeof prev.addresses === 'number' && el) {
      el.className = prev.addresses >= 0 ? 'text-emerald-400' : 'text-rose-400';
      el.textContent = (prev.addresses >= 0 ? '+' : '−') + fmtCount(Math.abs(prev.addresses)) + ' since prior day';
    }
  }

  // Flows: latest day of etf_total_aum_daily across both tiers. With two
  // consecutive rows the subtitle shows the day-over-day change; otherwise
  // it counts only funds with a figure on the latest day, because some
  // tracked tickers are listed but not yet reporting.
  function renderEtf(flowsCorr) {
    if (!flowsCorr || !Array.isArray(flowsCorr.etf_total_aum_daily)) return;
    const rows = flowsCorr.etf_total_aum_daily.filter(r => r && typeof r.aum_usd_total === 'number');
    if (!rows.length) return;
    const latest = rows[rows.length - 1];
    const el = $('ls-etf-delta');
    setText($('ls-etf-aum'), fmtUsd(latest.aum_usd_total));
    if (!el) return;
    if (rows.length >= 2) {
      const delta = latest.aum_usd_total - rows[rows.length - 2].aum_usd_total;
      el.className = delta >= 0 ? 'text-emerald-400' : 'text-rose-400';
      el.textContent = (delta >= 0 ? '+' : '-') + fmtUsd(Math.abs(delta)) + ' since prior day';
      return;
    }
    el.className = 'text-muted';
    const perTicker = flowsCorr.etf_aum_per_ticker_daily;
    let n = 0;
    if (perTicker && typeof perTicker === 'object') {
      for (const rowsT of Object.values(perTicker)) {
        const last = Array.isArray(rowsT) ? rowsT[rowsT.length - 1] : null;
        if (last && last.snapshot_date === latest.snapshot_date && typeof last.aum_usd === 'number') n++;
      }
    }
    el.textContent = n ? `XRP exposure across ${n} reporting funds` : 'XRP exposure across reporting funds';
  }

  async function refresh() {
    const sources = await Promise.all([
      fetchJson(TELEMETRY + '/settlement/totals'),
      fetchJson(PULSE     + '/stats/whale-flow-24h'),
      fetchJson(PULSE     + '/stats/exchange-net-flow'),
      fetchJson(PULSE     + '/stats/escrow-calendar'),
      fetchJson(PULSE     + '/stats/network?window_days=2'),
      fetchJson(TRUST     + '/stats'),
      fetchJson(PULSE     + '/stats/rwa-summary'),
      fetchJson(FLOWS     + '/stats/correlation?days=1'),
    ]);
    const [tel, flow, net, escrow, pulseNet, trustStats, rwaSummary, flowsCorr] = sources;

    renderLarge(flow);
    renderSettled(tel);
    renderNetFlow(net);
    renderEscrow(escrow);
    renderWallets(pulseNet);
    renderEtf(flowsCorr);

    const domSize = trustStats && trustStats.caches && trustStats.caches.domains_list_size;
    if (typeof domSize === 'number') setText($('ls-domains'), fmtCount(domSize));

    const rwaTracked = rwaSummary && rwaSummary.totals && rwaSummary.totals.tracked_issuers;
    if (typeof rwaTracked === 'number') setText($('ls-rwa-issuers'), fmtCount(rwaTracked));

    // "Updated" is the time of the last refresh that reached every source.
    // A partial or failed refresh leaves the previous stamp in place.
    if (sources.every(Boolean)) {
      const now = new Date();
      const hh = String(now.getUTCHours()).padStart(2, '0');
      const mm = String(now.getUTCMinutes()).padStart(2, '0');
      setText(elAsOf, 'updated ' + hh + ':' + mm + ' UTC');
    }
  }

  refresh();
  pollWhileVisible(refresh, 60000);
})();
