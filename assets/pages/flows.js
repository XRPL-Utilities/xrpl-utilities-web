// ============================================================
// Tracked ETF AUM + chain-flow chart, /stats/correlation feed.
// ============================================================
const FLOWS_API = 'https://flows.xrpl-utilities.io';

function fmtUsd(n) {
  if (n == null) return '-';
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return '$' + (n / 1_000_000_000).toFixed(2) + 'B';
  if (abs >= 1_000_000) return '$' + (n / 1_000_000).toFixed(1) + 'M';
  if (abs >= 1_000) return '$' + (n / 1_000).toFixed(0) + 'K';
  return '$' + n.toFixed(2);
}

// Fixed labels for the non-US region field. Looked up, never echoed,
// so an unexpected value from the API renders as nothing.
const REGION_LABEL = { europe: 'Europe', canada: 'Canada', brazil: 'Brazil' };

// Add two daily {snapshot_date, aum_usd_total} series by date. A date
// is null only when neither series has a number for it.
function sumSeries(a, b) {
  const byDate = new Map();
  for (const r of [...(a || []), ...(b || [])]) {
    if (!r || !r.snapshot_date) continue;
    const prev = byDate.get(r.snapshot_date);
    const v = typeof r.aum_usd_total === 'number' ? r.aum_usd_total : null;
    byDate.set(r.snapshot_date, prev == null ? v : (v == null ? prev : prev + v));
  }
  return [...byDate.keys()].sort().map(d => ({ snapshot_date: d, aum_usd_total: byDate.get(d) }));
}

// Escape backend strings before injecting via innerHTML. Mirrors
// the helper used on sibling pages.
function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);
}
// Reject non-http(s) schemes so a malicious source_url can't ride
// a javascript: URI into an anchor href.
function safeUrl(u) {
  const s = String(u || '').trim();
  return /^(?:https?|xrpl|mailto):/i.test(s) ? s : '#';
}

let aumChart = null;
let chainChart = null;
let currentRange = 30;

// Report a loader's outcome to the stale-data notice (assets/stale-banner.js).
function markStale(source, good) {
  if (window.XRStale) good ? window.XRStale.ok(source) : window.XRStale.fail(source);
}

async function loadCorrelation(days) {
  const url = `${FLOWS_API}/stats/correlation?days=${encodeURIComponent(days)}`;
  let body;
  // A failed fetch is not "no accrued data yet" (#flows-empty), so it only
  // raises the stale notice and leaves whatever is on screen.
  try {
    const r = await fetch(url);
    if (!r.ok) { markStale('correlation', false); return; }
    body = await r.json();
  } catch {
    markStale('correlation', false);
    return;
  }
  markStale('correlation', true);
  const series = body.etf_aum_per_ticker_daily || {};
  const totals = body.etf_total_aum_daily || [];
  const chainFlow = body.chain_flow_daily || [];
  const tracked = body.tracked_etfs || [];
  const correlation = body.correlation || {};
  const moex = body.moex_index || { available: false, history: [], snapshot: null };

  const emptyEl = document.getElementById('flows-empty');
  if (!totals.length) {
    emptyEl?.classList.remove('hidden');
  } else {
    emptyEl?.classList.add('hidden');
  }

  // Non-US subline: European ETPs plus Canada and Brazil (schema 1.30.0).
  const euTotals = sumSeries(
    body.etf_european_total_aum_daily || [],
    body.etf_international_total_aum_daily || [],
  );

  renderEtfAumChart(series, totals, tracked);
  renderEtfAumDeltaChart(series, totals, tracked);
  renderChainFlowChart(chainFlow, correlation, days);
  renderMoexIndexPanel(moex);
  renderSummaryTiles(series, totals, tracked, euTotals);
}

let moexChart = null;
function renderMoexIndexPanel(moex) {
  const wrap = document.getElementById('moex-index-panel');
  const snapEl = document.getElementById('moex-index-snapshot');
  const ctx = document.getElementById('chart-moex-index');
  const futEl = document.getElementById('moex-futures-strip');
  if (!wrap || !ctx) return;
  const snap = moex && moex.snapshot;
  const history = (moex && moex.history) || [];
  const futures = (moex && moex.futures) || [];
  if (!moex || !moex.available || !snap) {
    wrap.classList.add('opacity-50');
    if (snapEl) snapEl.textContent = 'upstream pending';
    if (futEl) futEl.textContent = '';
    // Tear down any prior chart so a stale frame doesn't sit
    // behind the dim overlay on transition from available -> not.
    if (moexChart) { moexChart.destroy(); moexChart = null; }
    return;
  }
  wrap.classList.remove('opacity-50');
  if (futEl) {
    if (futures.length) {
      const chips = futures.map(f =>
        `<span class="inline-block bg-ink/60 border border-border rounded px-1.5 py-0.5 mr-1.5 mb-1">${escapeHtml(f.short_name || f.secid || '')} $${escapeHtml(Number(f.prev_settle_price ?? 0).toFixed(4))}</span>`
      ).join('');
      futEl.innerHTML = `<span class="text-white">MOEX XRP futures, previous settlement:</span> ${chips}`;
    } else {
      futEl.textContent = '';
    }
  }
  const fmtUsd = (v) => (typeof v === 'number' ? '$' + v.toFixed(4) : '-');
  const fmtPct = (v) => (typeof v === 'number' ? (v >= 0 ? '+' : '') + v.toFixed(2) + '%' : '-');
  const cls = (snap.change_pct ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400';
  if (snapEl) {
    snapEl.innerHTML = `<span class="text-white font-mono text-xl">${escapeHtml(fmtUsd(snap.current_value ?? snap.last_value))}</span>
      <span class="${cls} font-mono text-xs ml-2">${escapeHtml(fmtPct(snap.change_pct))}</span>
      <span class="text-muted text-[10px] ml-2">as of ${escapeHtml(snap.systime || snap.trade_date || '')} MSK</span>`;
  }
  if (typeof Chart === 'undefined') return;
  if (!history.length) {
    if (moexChart) { moexChart.destroy(); moexChart = null; }
    return;
  }
  const labels = history.map(r => r.trade_date);
  const closes = history.map(r => r.close);
  if (moexChart) moexChart.destroy();
  moexChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'MOEXXRP close (USD)',
        data: closes,
        borderColor: 'rgb(0, 184, 255)',
        backgroundColor: 'rgba(0, 184, 255, 0.12)',
        pointRadius: 2,
        pointBackgroundColor: 'rgb(0, 184, 255)',
        borderWidth: 1.5,
        fill: true,
        tension: 0.18,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: '#7a8088', font: { size: 9 }, maxRotation: 0, autoSkipPadding: 12 }, grid: { color: 'rgba(255,255,255,0.04)' } },
        y: { ticks: { color: '#7a8088', font: { size: 10 }, callback: (v) => '$' + Number(v).toFixed(2) }, grid: { color: 'rgba(255,255,255,0.04)' } },
      },
    },
  });
}

async function renderSummaryTiles(series, totals, tracked, euTotals) {
  // Headline AUM + day-over-day delta read from the correlation
  // payload we already fetched. XRP-attributable comes from a
  // separate cheap call to /stats/etf-aggregate-xrp-held so the
  // page doesn't need to derive it client-side.
  const elAum    = document.getElementById('stat-flows-aum');
  const elAumEu  = document.getElementById('stat-flows-aum-european');
  const elDelta  = document.getElementById('stat-flows-delta');
  const elDeltaD = document.getElementById('stat-flows-delta-detail');
  const elXrp    = document.getElementById('stat-flows-xrp');
  const elTickers = document.getElementById('stat-flows-tickers');
  const elTickersD = document.getElementById('stat-flows-tickers-detail');

  const nonNull = (totals || []).filter(r => r && typeof r.aum_usd_total === 'number');
  const euNonNull = (euTotals || []).filter(r => r && typeof r.aum_usd_total === 'number');
  if (nonNull.length && elAum) {
    const latest = nonNull[nonNull.length - 1];
    const latestEu = euNonNull.length ? euNonNull[euNonNull.length - 1] : null;
    // etf_total_aum_daily already includes the European tier (the
    // backend sums all tickers into all_total regardless of asset
    // class). Render the headline as-is and surface the EU
    // contribution in the subline for context, no extra addition.
    elAum.textContent = fmtUsd(latest.aum_usd_total);
    if (elAumEu) {
      elAumEu.textContent = latestEu
        ? `includes ${fmtUsd(latestEu.aum_usd_total)} from funds outside the US`
        : '';
    }
    if (nonNull.length >= 2 && elDelta) {
      const prior = nonNull[nonNull.length - 2];
      const delta = latest.aum_usd_total - prior.aum_usd_total;
      const sign = delta >= 0 ? '+' : '-';
      const cls = delta >= 0 ? 'text-emerald-400' : 'text-rose-400';
      elDelta.className = `text-2xl font-bold font-mono ${cls}`;
      elDelta.textContent = sign + fmtUsd(Math.abs(delta));
      if (elDeltaD) elDeltaD.textContent = `${latest.snapshot_date} vs ${prior.snapshot_date}`;
    } else if (elDelta) {
      elDelta.textContent = '-';
      if (elDeltaD) elDeltaD.textContent = 'awaiting a second day';
    }
  }

  try {
    const r = await fetch(`${FLOWS_API}/stats/etf-aggregate-xrp-held`);
    markStale('etf-xrp-held', r.ok);
    if (r.ok) {
      const body = await r.json();
      if (elXrp) {
        const xrp = body.xrp_held_attributable_total;
        elXrp.textContent = xrp != null
          ? (xrp >= 1e9 ? (xrp / 1e9).toFixed(2) + 'B' : (xrp / 1e6).toFixed(0) + 'M')
          : '-';
      }
    }
  } catch {
    markStale('etf-xrp-held', false);
  }

  if (elTickers && tracked) {
    elTickers.textContent = String(tracked.length);
    if (elTickersD) {
      const liveCount = Object.values(series || {}).filter(
        s => Array.isArray(s) && s.some(r => r.aum_usd != null)
      ).length;
      if (liveCount && liveCount < tracked.length) {
        elTickersD.textContent = `${liveCount} with figures · ${tracked.length - liveCount} not yet`;
      } else {
        elTickersD.textContent = `${liveCount || tracked.length} live across spot + indirect tiers`;
      }
    }
  }
}

let aumDeltaChart = null;

function renderEtfAumDeltaChart(series, totals, tracked) {
  if (typeof Chart === 'undefined') return;
  const ctx = document.getElementById('chart-etf-aum-delta');
  if (!ctx) return;

  // Use the per-ticker series' aum_delta_usd field already computed
  // server-side. Union of all dates seen; skip the first per-ticker
  // entry where delta is null (no prior reference).
  const dateSet = new Set();
  Object.values(series).forEach(rows => rows.forEach(r => {
    if (r.aum_delta_usd != null) dateSet.add(r.snapshot_date);
  }));
  const dates = Array.from(dateSet).sort();

  // One net bar per day. Per-ticker segments in a single green or red
  // carried no information (design review 2026-10-27); the split by fund
  // moves to the tooltip.
  const orderedTickers = tracked.length ? tracked : Object.keys(series).sort();
  const perDay = dates.map(d => {
    const moves = [];
    orderedTickers.forEach(t => {
      const row = (series[t] || []).find(r => r.snapshot_date === d);
      if (row && row.aum_delta_usd != null && row.aum_delta_usd !== 0) moves.push([t, row.aum_delta_usd]);
    });
    moves.sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
    return { net: moves.reduce((acc, m) => acc + m[1], 0), moves };
  });
  const netData = perDay.map(p => p.net);
  const datasets = [{
    label: 'Net change',
    data: netData,
    backgroundColor: netData.map(v => (v >= 0 ? XRChart.UP : XRChart.DOWN)),
    borderWidth: 0,
    borderRadius: 2,
    // Keep a real but small move visible next to large days.
    minBarLength: 2,
  }];

  // Daily net total for the headline.
  let totalAbsMoved = 0;
  let netLatest = null;
  dates.forEach(d => {
    let sum = 0; let any = false;
    orderedTickers.forEach(t => {
      const row = (series[t] || []).find(r => r.snapshot_date === d);
      if (row && row.aum_delta_usd != null) { sum += row.aum_delta_usd; any = true; }
    });
    if (any) {
      totalAbsMoved += Math.abs(sum);
      netLatest = sum;
    }
  });
  const headlineEl = document.getElementById('aum-delta-headline');
  if (headlineEl) {
    if (netLatest != null) {
      const sign = netLatest >= 0 ? '+' : '-';
      headlineEl.textContent = `latest day net: ${sign}${fmtUsd(Math.abs(netLatest))} · ${dates.length} days`;
    } else {
      headlineEl.textContent = 'awaiting day-over-day deltas';
    }
  }

  if (aumDeltaChart) aumDeltaChart.destroy();
  aumDeltaChart = new Chart(ctx, {
    type: 'bar',
    data: { labels: dates, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#0a0d10', titleColor: '#ffffff', bodyColor: '#c8d0d8',
          borderColor: '#2a3038', borderWidth: 1,
          callbacks: {
            label: (item) => {
              const v = item.parsed.y;
              if (v == null) return null;
              return `Net: ${v >= 0 ? '+' : '-'}${fmtUsd(Math.abs(v))}`;
            },
            afterBody: (items) => {
              const p = items.length ? perDay[items[0].dataIndex] : null;
              if (!p) return [];
              return p.moves.slice(0, 8).map(([t, v]) => `  ${t}: ${v >= 0 ? '+' : '-'}${fmtUsd(Math.abs(v))}`);
            },
          },
        },
      },
      scales: {
        x: { ticks: { color: '#7a8088', font: { size: 9 }, maxRotation: 0, autoSkipPadding: 12 }, grid: { color: 'rgba(255,255,255,0.04)' } },
        y: { title: { display: true, text: 'US dollars', color: '#7a8088', font: { size: 10 } }, ticks: { color: '#7a8088', font: { size: 10 }, callback: (v) => XRChart.compact(v, '$') }, grid: { color: 'rgba(255,255,255,0.04)' } },
      },
    },
  });
}

function renderEtfAumChart(series, totals, tracked) {
  if (typeof Chart === 'undefined') return;
  const ctx = document.getElementById('chart-etf-aum');
  if (!ctx) return;

  // Date axis = only days that actually have data. Per-ticker rows are
  // real readings; the totals series can carry null-valued rows for days
  // with no snapshot (e.g. the 2026-05-09/10 weekend, when the scraper
  // did not persist). Plotting those as empty bars reads as broken, and
  // the values are not recoverable after the fact (no weekend price
  // prints to derive from). Omit no-data days entirely - matching the
  // delta chart and the standard convention of not plotting non-data days.
  const dateSet = new Set();
  Object.values(series).forEach(rows => rows.forEach(r => {
    if (r.aum_usd != null) dateSet.add(r.snapshot_date);
  }));
  totals.forEach(r => { if (r.aum_usd_total != null) dateSet.add(r.snapshot_date); });
  const dates = Array.from(dateSet).sort();

  const orderedTickers = tracked.length ? tracked : Object.keys(series).sort();

  // Top 5 funds by latest AUM in fixed colors, the rest in one grey
  // "Other" band (design review 2026-10-27: 15 stacked colors could not be
  // told apart). The tooltip still names every fund.
  const byTicker = {};
  orderedTickers.forEach(t => {
    byTicker[t] = Object.fromEntries((series[t] || []).map(r => [r.snapshot_date, r.aum_usd]));
  });
  const latestAum = (t) => {
    for (let k = dates.length - 1; k >= 0; k--) {
      const v = byTicker[t][dates[k]];
      if (v != null) return v;
    }
    return 0;
  };
  // Only funds with at least one figure in the window go in the chart, so
  // the "Other N funds" label does not count funds that have no data.
  const chartTickers = orderedTickers.filter(t => dates.some(d => byTicker[t][d] != null));
  const { top, rest } = XRChart.topN(chartTickers, latestAum);
  const datasets = top.map((ticker, k) => ({
    label: ticker,
    data: dates.map(d => byTicker[ticker][d] ?? null),
    backgroundColor: XRChart.SERIES[k],
    borderColor: XRChart.GAP,
    borderWidth: { top: 2 },
  }));
  if (rest.length) {
    datasets.push({
      label: `Other ${rest.length} funds`,
      data: dates.map(d => {
        let sum = 0; let any = false;
        rest.forEach(t => { const v = byTicker[t][d]; if (v != null) { sum += v; any = true; } });
        return any ? sum : null;
      }),
      backgroundColor: XRChart.OTHER,
      borderColor: XRChart.GAP,
      borderWidth: { top: 2 },
      otherTickers: rest,
    });
  }

  // Headline: latest total + ticker count contributing
  const headlineEl = document.getElementById('aum-total-headline');
  if (headlineEl) {
    // Count only tickers that actually have AUM data (TTOP/TXBC/GXRP.DE
    // are pending), and pick the most recent row with a non-null total so
    // the headline matches the bars and its own coverage caveat below.
    const liveCount = orderedTickers.filter(t => (series[t] || []).some(r => r.aum_usd != null)).length;
    const latest = totals.length ? [...totals].reverse().find(r => r && r.aum_usd_total != null) : null;
    if (latest) {
      headlineEl.textContent = `latest ${latest.snapshot_date}: ${fmtUsd(latest.aum_usd_total)} across ${liveCount} tickers`;
    } else {
      headlineEl.textContent = `no AUM rows persisted yet`;
    }
  }

  // Coverage caveat; distinguishes "no data ever" from "no historical
  // backfill but accruing forward". A ticker with rows on only a few
  // recent dates is in the accruing-forward bucket (forward scraper
  // captures it daily; backfill couldn't fill it because Yahoo lacked
  // shares_outstanding for it or it's an indirect-basket fund where the
  // close*shares formula would yield the full basket, not the XRP slice).
  const liveTickers = orderedTickers.filter(t => (series[t] || []).some(r => r.aum_usd != null));
  const backfilledTickers = orderedTickers.filter(t => {
    const rows = series[t] || [];
    return rows.filter(r => r.aum_usd != null).length >= 7;
  });
  const caveatEl = document.getElementById('aum-coverage-caveat');
  if (caveatEl) {
    const parts = [];
    if (liveTickers.length < orderedTickers.length) {
      const missing = orderedTickers.filter(t => !liveTickers.includes(t));
      parts.push(`${liveTickers.length} of ${orderedTickers.length} funds have figures; ${missing.join(', ')} not yet.`);
    }
    if (backfilledTickers.length < liveTickers.length) {
      const fwdOnly = liveTickers.filter(t => !backfilledTickers.includes(t));
      parts.push(`${fwdOnly.join(', ')} start from when tracking began, so their history is shorter.`);
    }
    caveatEl.textContent = parts.join(' ');
  }

  if (aumChart) aumChart.destroy();
  aumChart = new Chart(ctx, {
    type: 'bar',
    data: { labels: dates, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { color: '#a0a8b0', font: { size: 10 }, boxWidth: 10, boxHeight: 10 } },
        tooltip: {
          backgroundColor: '#0a0d10', titleColor: '#ffffff', bodyColor: '#c8d0d8',
          borderColor: '#2a3038', borderWidth: 1,
          callbacks: {
            label: (item) => `${item.dataset.label}: ${fmtUsd(item.parsed.y)}`,
            afterLabel: (item) => {
              const others = item.dataset.otherTickers;
              if (!others) return [];
              const d = dates[item.dataIndex];
              return others
                .map(t => [t, byTicker[t][d]])
                .filter(([, v]) => v != null)
                .sort((a, b) => b[1] - a[1])
                .map(([t, v]) => `  ${t}: ${fmtUsd(v)}`);
            },
          },
        },
      },
      scales: {
        x: { stacked: true, ticks: { color: '#7a8088', font: { size: 9 }, maxRotation: 0, autoSkipPadding: 12 }, grid: { color: 'rgba(255,255,255,0.04)' } },
        y: { stacked: true, title: { display: true, text: 'US dollars', color: '#7a8088', font: { size: 10 } }, ticks: { color: '#7a8088', font: { size: 10 }, callback: (v) => XRChart.compact(v, '$') }, grid: { color: 'rgba(255,255,255,0.04)' } },
      },
    },
  });
}

function renderChainFlowChart(chainFlow, correlation, requestedDays) {
  if (typeof Chart === 'undefined') return;
  const ctx = document.getElementById('chart-chain-flow');
  if (!ctx) return;

  const statusEl = document.getElementById('chain-flow-status');
  const caveatEl = document.getElementById('chain-flow-caveat');

  if (!correlation.available || !chainFlow.length) {
    if (statusEl) statusEl.textContent = 'upstream pending';
    if (caveatEl) caveatEl.textContent = (correlation.note || 'XR-Pulse /stats/exchange-flow-delta is the on-chain upstream; until it ships, this chart is empty.');
    if (chainChart) { chainChart.destroy(); chainChart = null; }
    return;
  }

  const todayUtc = new Date().toISOString().slice(0, 10);
  const labels = chainFlow.map(r => r.snapshot_date);
  const data = chainFlow.map(r => r.net_flow_xrp ?? r.net ?? null);
  const inProgress = labels.map(d => d === todayUtc);
  const hasInProgress = inProgress.some(Boolean);

  if (statusEl) {
    // Fit the label to actual coverage: show the real date span the chart
    // covers, not the selected range (the on-chain window can be shorter).
    const span = labels.length
      ? `${labels[0]} to ${labels[labels.length - 1]} `
      : '';
    const base = `${span}(${chainFlow.length}d)`;
    statusEl.textContent = hasInProgress ? `${base} - today in-progress` : base;
  }
  if (caveatEl) {
    const parts = [];
    if (hasInProgress) {
      parts.push(`Today's bar (${todayUtc} UTC) is still filling in and updates through the day.`);
    }
    // When the on-chain history is shorter than the selected range (the
    // AUM series above can reach further back), the chart fits to actual
    // coverage instead of padding the axis with empty space. Say so, so a
    // shorter window doesn't read as missing data.
    if (requestedDays && chainFlow.length < requestedDays) {
      parts.push(`Exchange-flow history covers ${chainFlow.length} days, shorter than the selected ${requestedDays}-day range. That is all the history there is, not missing data.`);
    }
    if (correlation.note) parts.push(correlation.note);
    caveatEl.textContent = parts.join(' ');
  }

  const fillFor = (v, ip) => {
    const pos = (v ?? 0) >= 0;
    const c = pos ? XRChart.UP : XRChart.DOWN;
    return ip ? c + '38' : c;
  };
  const strokeFor = (v) => ((v ?? 0) >= 0 ? XRChart.UP : XRChart.DOWN);

  if (chainChart) chainChart.destroy();
  chainChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Net XRP flow',
        data,
        backgroundColor: data.map((v, i) => fillFor(v, inProgress[i])),
        borderColor: data.map(v => strokeFor(v)),
        borderWidth: data.map((_, i) => (inProgress[i] ? 2 : 1)),
        // Floor the bar height so a real but tiny net (e.g. 2026-05-18 at
        // -0.2M XRP against a +/-40M scale) still renders a visible nub
        // instead of looking like a gap. Only affects non-zero values;
        // genuine zero days stay flat.
        minBarLength: 3,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            afterLabel: (ctx) => (inProgress[ctx.dataIndex] ? 'in-progress (UTC day not closed)' : ''),
          },
        },
      },
      scales: {
        x: {
          ticks: {
            color: '#7a8088',
            font: { size: 9 },
            maxRotation: 0,
            autoSkipPadding: 12,
            callback: function(value, index) {
              const lbl = this.getLabelForValue(value);
              return inProgress[index] ? `${lbl} *` : lbl;
            },
          },
          grid: { color: 'rgba(255,255,255,0.04)' },
        },
        y: { title: { display: true, text: 'XRP', color: '#7a8088', font: { size: 10 } }, ticks: { color: '#7a8088', font: { size: 10 }, callback: (v) => XRChart.compact(v, 'XRP') }, grid: { color: 'rgba(255,255,255,0.04)' } },
      },
    },
  });
}

document.querySelectorAll('.flow-range-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const d = parseInt(btn.getAttribute('data-flow-range'), 10) || 30;
    if (d === currentRange) return;
    currentRange = d;
    document.querySelectorAll('.flow-range-btn').forEach(b => {
      const active = b === btn;
      b.classList.toggle('border-accent', active);
      b.classList.toggle('text-white', active);
      b.classList.toggle('border-border', !active);
      b.classList.toggle('text-muted', !active);
      if (active) b.setAttribute('aria-pressed', 'true'); else b.removeAttribute('aria-pressed');
    });
    loadCorrelation(d);
  });
});

function bootFlows() {
  if (typeof Chart === 'undefined') { setTimeout(bootFlows, 200); return; }
  loadCorrelation(currentRange);
  // Hourly refresh matches the scrape cadence on the backend.
  pollWhileVisible(() => loadCorrelation(currentRange), 3600 * 1000);
}
bootFlows();

// Tracked ETFs grid: render dynamically from /stats/launch-impact
// so the page picks up newly promoted issuers without a code edit.
// launch-impact carries ticker + issuer + listing_exchange +
// launch_date + expense_ratio + source_url + asset_class + caveat
// straight from the operator-curated registry.
async function loadTrackedEtfsGrid() {
  const grid = document.getElementById('flows-etf-grid');
  const empty = document.getElementById('flows-etf-grid-empty');
  if (!grid) return;
  let body;
  try {
    const r = await fetch(`${FLOWS_API}/stats/launch-impact`);
    if (!r.ok) throw new Error('http ' + r.status);
    body = await r.json();
  } catch {
    empty?.classList.remove('hidden');
    markStale('launch-impact', false);
    return;
  }
  markStale('launch-impact', true);
  empty?.classList.add('hidden');
  const launches = body.launches || [];
  if (!launches.length) { empty?.classList.remove('hidden'); return; }
  // Sync the hero-pill count to the live registry length so the
  // page never claims a specific number that's stale.
  const heroPill = document.getElementById('hero-pill-count');
  if (heroPill) heroPill.textContent = `${launches.length} tracked ETFs`;
  // Group spot before indirect-basket so the headline tier stays
  // visually first; within tier keep registry order so featured
  // funds (highest-AUM, oldest) lead.
  const tierOrder = { spot_xrp_etf: 0, indirect_basket_exposure: 1, european_spot_xrp_etp: 2, international_spot_xrp_etf: 3 };
  const ordered = [...launches].sort((a, b) => {
    const ta = tierOrder[a.asset_class] ?? 2;
    const tb = tierOrder[b.asset_class] ?? 2;
    return ta - tb;
  });
  grid.innerHTML = ordered.map(etf => {
    const region = REGION_LABEL[etf.region] ? ' · ' + REGION_LABEL[etf.region] : '';
    const tier = etf.asset_class === 'indirect_basket_exposure'
      ? '<span class="text-[9px] uppercase tracking-wider text-amber-300/80">Indirect</span>'
      : `<span class="text-[9px] uppercase tracking-wider text-emerald-300/80">Spot${escapeHtml(region)}</span>`;
    const exp = etf.expense_ratio != null
      ? (etf.expense_ratio * 100).toFixed(2).replace(/\.?0+$/, '') + '%'
      : 'not disclosed';
    const launched = escapeHtml(etf.launch_date || '–');
    const href = escapeHtml(safeUrl(etf.source_url));
    const issuer = escapeHtml(etf.issuer || '');
    const ticker = escapeHtml(etf.ticker || '');
    return `
      <a href="${href}" target="_blank" rel="noopener" class="bg-panel border border-border hover:border-accent rounded-xl p-5 transition flex flex-col">
        <div class="flex items-baseline justify-between mb-2 gap-2">
          <span class="text-2xl font-bold text-white font-mono">${ticker}</span>
          <span class="text-[10px] uppercase tracking-wider text-muted text-right">${issuer}</span>
        </div>
        <div class="flex items-center gap-2 mb-2">${tier}</div>
        <div class="text-xs text-muted mb-1">Launched ${launched}</div>
        <div class="text-xs text-muted">Expense ${escapeHtml(exp)}</div>
      </a>
    `;
  }).join('');
}
loadTrackedEtfsGrid();
pollWhileVisible(loadTrackedEtfsGrid, 3600 * 1000);

// -----------------------------------------------------------------
// Cross-border world heatmap. Uses d3 + topojson-client + world-atlas
// TopoJSON. Choropleth on country.total_usd; right rail lists the
// top corridors (origin -> destination) from the same response.
// Range buttons swap window_days; map redraws in-place. Tooltip on
// country hover. Honest empty-state: when bootstrap=true OR
// total countries 0, the map renders neutral fill and the right
// rail says "no cross-border edges yet".
// -----------------------------------------------------------------
(function setupCrossBorderHeatmap() {
  const mapEl = document.getElementById('xb-map');
  if (!mapEl) return;
  // Note: we DO NOT check `typeof d3 === 'undefined'` here. d3 and
  // topojson load via `defer`, so they're guaranteed-undefined at
  // the moment this inline IIFE executes. The startInterval poll at
  // the bottom is the actual readiness gate.
  const TOPOJSON_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-110m.json';
  // ISO-3166 numeric -> alpha-2. world-atlas tags each country with
  // a numeric `id` (UN M49). Our backend returns alpha-2. We need
  // the cross-walk to look up totals per feature. Trimmed to the
  // 18 countries currently in wallet_jurisdiction.py; fast to
  // extend when the operator adds entries.
  // ISO numeric (M49) -> alpha-2. Covers every country currently in
  // wallet_jurisdiction.py PLUS the world's largest economies so the
  // unshaded continental backdrop reads as a real map rather than
  // selective country outlines. Each entry: 'NUM':'A2'. Duplicate
  // numeric keys are a silent dict-overwrite bug; this table is
  // hand-checked unique.
  const ISO_NUM_TO_A2 = {
    // The 18 countries currently in wallet_jurisdiction.py:
    '048':'BH','060':'BM','076':'BR','092':'VG','136':'KY','250':'FR',
    '276':'DE','372':'IE','376':'IL','392':'JP','410':'KR','442':'LU',
    '484':'MX','528':'NL','690':'SC','702':'SG','784':'AE','826':'GB',
    '832':'JE','840':'US',
    // World context (continental backdrop):
    '004':'AF','008':'AL','012':'DZ','024':'AO','032':'AR','036':'AU',
    '040':'AT','050':'BD','056':'BE','068':'BO','100':'BG','104':'MM',
    '116':'KH','124':'CA','144':'LK','152':'CL','156':'CN','158':'TW',
    '170':'CO','188':'CR','192':'CU','196':'CY','203':'CZ','208':'DK',
    '214':'DO','218':'EC','222':'SV','231':'ET','233':'EE','242':'FJ',
    '246':'FI','262':'DJ','268':'GE','288':'GH','300':'GR','320':'GT',
    '340':'HN','344':'HK','348':'HU','352':'IS','356':'IN','360':'ID',
    '364':'IR','368':'IQ','380':'IT','388':'JM','398':'KZ','400':'JO',
    '404':'KE','414':'KW','417':'KG','418':'LA','422':'LB','428':'LV',
    '430':'LR','434':'LY','440':'LT','450':'MG','454':'MW','458':'MY',
    '462':'MV','466':'ML','478':'MR','480':'MU','496':'MN','498':'MD',
    '504':'MA','508':'MZ','512':'OM','516':'NA','524':'NP','554':'NZ',
    '558':'NI','562':'NE','566':'NG','578':'NO','586':'PK','591':'PA',
    '598':'PG','600':'PY','604':'PE','608':'PH','616':'PL','620':'PT',
    '624':'GW','626':'TL','630':'PR','634':'QA','642':'RO','643':'RU',
    '646':'RW','662':'LC','682':'SA','686':'SN','688':'RS','694':'SL',
    '703':'SK','704':'VN','705':'SI','706':'SO','710':'ZA','716':'ZW',
    '724':'ES','728':'SS','729':'SD','740':'SR','748':'SZ','752':'SE',
    '756':'CH','760':'SY','762':'TJ','764':'TH','768':'TG','780':'TT',
    '788':'TN','792':'TR','795':'TM','800':'UG','804':'UA','858':'UY',
    '860':'UZ','862':'VE','882':'WS','886':'YE','894':'ZM'
  };

  const elHeadline   = document.getElementById('xb-headline');
  const elCorridors  = document.getElementById('xb-corridors');
  const elCoverage   = document.getElementById('xb-coverage');
  const elCaveat     = document.getElementById('xb-caveat');
  const XB_NOTE = 'Read country totals as a direction, not an exact count. Most XRPL wallets have no known location, so this shows exchange, custodian and issuer flow, and a company with offices in several countries is counted where it is based.';
  const elTooltip    = document.getElementById('xb-tooltip');

  function fmtUsdCompact(n) {
    if (typeof n !== 'number' || !isFinite(n) || n === 0) return '$0';
    const abs = Math.abs(n);
    if (abs >= 1e9) return '$' + (abs / 1e9).toFixed(2) + 'B';
    if (abs >= 1e6) return '$' + (abs / 1e6).toFixed(1) + 'M';
    if (abs >= 1e3) return '$' + Math.round(abs / 1e3) + 'k';
    return '$' + Math.round(abs);
  }

  let worldFeatures = null;
  let currentWindow = 30;

  async function loadWorld() {
    if (worldFeatures) return worldFeatures;
    try {
      const topo = await d3.json(TOPOJSON_URL);
      worldFeatures = topojson.feature(topo, topo.objects.countries).features;
      return worldFeatures;
    } catch (e) {
      return null;
    }
  }

  function setHeadline(coverage, windowDays) {
    if (!elHeadline) return;
    if (!coverage) { elHeadline.textContent = ''; return; }
    const xb = coverage.cross_border_events || 0;
    const usd = coverage.cross_border_usd || 0;
    elHeadline.textContent = `${xb.toLocaleString('en-US')} edges · ${fmtUsdCompact(usd)} · ${windowDays}d window`;
  }

  // Country codes read as jargon on a public page; show the English
  // country name and keep the code for hover.
  let _regionNames = null;
  try { _regionNames = new Intl.DisplayNames(['en'], { type: 'region' }); } catch { _regionNames = null; }
  function countryName(iso) {
    const code = String(iso || '').toUpperCase();
    if (!/^[A-Z]{2}$/.test(code) || !_regionNames) return code;
    try { return _regionNames.of(code) || code; } catch { return code; }
  }

  function renderCorridors(corridors) {
    if (!elCorridors) return;
    if (!corridors || corridors.length === 0) {
      elCorridors.innerHTML = '<div class="text-muted">No cross-border payments in this window yet.</div>';
      return;
    }
    elCorridors.innerHTML = corridors.slice(0, 10).map(c =>
      `<div class="flex items-baseline justify-between gap-2 border-b border-border/40 pb-1">` +
        `<span><span class="text-white" title="${escapeHtml(c.origin_iso)}">${escapeHtml(countryName(c.origin_iso))}</span> <span class="text-muted">&rarr;</span> <span class="text-white" title="${escapeHtml(c.dest_iso)}">${escapeHtml(countryName(c.dest_iso))}</span></span>` +
        `<span class="text-emerald-400">${escapeHtml(fmtUsdCompact(c.usd_total))}</span>` +
      `</div>`
    ).join('');
  }

  function renderCoverage(coverage) {
    if (!elCoverage) return;
    if (!coverage) { elCoverage.textContent = ''; return; }
    const seen = coverage.whale_events_seen || 0;
    const labeled = coverage.both_sides_labeled || 0;
    const labeledPct = coverage.labeled_pct_of_seen;
    const pct = typeof labeledPct === 'number' ? ' (' + labeledPct.toFixed(0) + '%)' : '';
    elCoverage.textContent = `${seen.toLocaleString('en-US')} large payments seen; ${labeled.toLocaleString('en-US')}${pct} could be placed in a country at both ends.`;
  }

  function renderMap(perCountry, corridors) {
    const features = worldFeatures;
    if (!features) return;
    const totals = new Map();
    (perCountry || []).forEach(c => totals.set(c.iso_country, c.total_usd || 0));
    const maxUsd = Math.max(1, ...Array.from(totals.values()));
    const positive = Array.from(totals.values()).filter(v => v > 0);
    const minUsd = positive.length ? Math.min(maxUsd, ...positive) : 1;
    // Sequential color scale: dark slate (no data) -> orange-700 (low)
    // -> orange-500 (mid) -> yellow-300 (high). Log scale so small
    // corridors are still visible alongside outliers. The legend shows the
    // dollar value at each stop, from the smallest country to the largest.
    const colorScale = d3.scaleLog()
      .domain(minUsd < maxUsd ? [minUsd, maxUsd] : [1, maxUsd])
      .range(['#7c2d12', '#fde047'])
      .clamp(true);
    const legend = { low: minUsd, mid: Math.sqrt(minUsd * maxUsd), high: maxUsd };
    for (const k of Object.keys(legend)) {
      const el = document.getElementById('xb-legend-' + k);
      if (!el) continue;
      el.textContent = positive.length ? fmtUsdCompact(legend[k]) : k;
      // Swatch shows the colour the map actually draws for that value.
      if (positive.length && el.previousElementSibling) el.previousElementSibling.style.background = colorScale(legend[k]);
    }

    const svg = d3.select(mapEl);
    const bbox = mapEl.getBoundingClientRect();
    const w = bbox.width || 800;
    const h = bbox.height || 400;
    svg.selectAll('*').remove();
    svg.attr('viewBox', `0 0 ${w} ${h}`);
    const projection = d3.geoNaturalEarth1()
      .fitSize([w, h], { type: 'FeatureCollection', features: features });
    const path = d3.geoPath(projection);

    svg.append('g')
      .selectAll('path')
      .data(features)
      .join('path')
      .attr('d', path)
      .attr('fill', d => {
        const a2 = ISO_NUM_TO_A2[String(d.id).padStart(3, '0')];
        const v = a2 ? totals.get(a2) : 0;
        return (v && v > 0) ? colorScale(v) : '#1f2937';
      })
      .attr('stroke', '#0f172a')
      .attr('stroke-width', 0.4)
      .on('mousemove', function(evt, d) {
        if (!elTooltip) return;
        const a2 = ISO_NUM_TO_A2[String(d.id).padStart(3, '0')];
        const v = a2 ? totals.get(a2) : 0;
        const name = (d.properties && d.properties.name) || a2 || '?';
        const valueStr = (v && v > 0) ? fmtUsdCompact(v) : 'no labeled flow';
        elTooltip.innerHTML = `<span class="text-white">${escapeHtml(name)}</span> <span class="text-muted">${escapeHtml(a2 || '')}</span><br/><span class="text-emerald-400">${escapeHtml(valueStr)}</span>`;
        const rect = mapEl.getBoundingClientRect();
        const offX = evt.clientX - rect.left + 12;
        const offY = evt.clientY - rect.top + 12;
        elTooltip.style.left = offX + 'px';
        elTooltip.style.top  = offY + 'px';
        elTooltip.classList.remove('hidden');
      })
      .on('mouseleave', function() {
        if (elTooltip) elTooltip.classList.add('hidden');
      });

    renderArcs(svg, features, projection, corridors || []);
  }

  // Render the top 6 cross-border corridors as curved arcs over the
  // choropleth, with a small glowing pulse traveling each arc on a
  // stagger so directional flow is visible at a glance. Respects
  // prefers-reduced-motion: skips the moving pulse but keeps the
  // static arcs + endpoint markers.
  //
  // Fallback centroid map for jurisdictions that the 110m world-atlas
  // TopoJSON omits (small offshore finance centers like Cayman, BVI,
  // Bermuda, Jersey, Seychelles). Without this map the top corridors
  // are silently filtered out (most institutional XRPL flow routes
  // through these jurisdictions, so missing them = empty arc layer).
  const SMALL_JURISDICTION_CENTROIDS = {
    'KY': [-80.5,  19.4],  // Cayman Islands
    'VG': [-64.5,  18.4],  // British Virgin Islands
    'BM': [-64.8,  32.3],  // Bermuda
    'JE': [ -2.1,  49.2],  // Jersey
    'SC': [ 55.5,  -4.7],  // Seychelles
  };

  function renderArcs(svg, features, projection, corridors) {
    // alpha-2 -> centroid resolver. Tries world-atlas feature first;
    // falls back to the small-jurisdiction map above for territories
    // the 110m atlas omits.
    const a2ToFeature = {};
    features.forEach(f => {
      const a2 = ISO_NUM_TO_A2[String(f.id).padStart(3, '0')];
      if (a2) a2ToFeature[a2] = f;
    });
    function resolveCentroid(a2) {
      if (a2ToFeature[a2]) return d3.geoCentroid(a2ToFeature[a2]);
      if (SMALL_JURISDICTION_CENTROIDS[a2]) return SMALL_JURISDICTION_CENTROIDS[a2];
      return null;
    }
    const top = (corridors || []).slice(0, 6).filter(c =>
      resolveCentroid(c.origin_iso) && resolveCentroid(c.dest_iso)
    );
    if (!top.length) return;

    const reduceMotion = window.matchMedia
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // Rank-ordered cyan ramp; brightest = #1 corridor by USD volume
    const colors = ['#67e8f9', '#22d3ee', '#06b6d4', '#0891b2', '#0e7490', '#155e75'];

    const arcGroup = svg.append('g').attr('class', 'arcs').attr('pointer-events', 'none');

    top.forEach((c, i) => {
      const origGeo = resolveCentroid(c.origin_iso);
      const destGeo = resolveCentroid(c.dest_iso);
      const p1 = projection(origGeo);
      const p2 = projection(destGeo);
      if (!p1 || !p2) return;
      const [x1, y1] = p1, [x2, y2] = p2;
      if (![x1, y1, x2, y2].every(Number.isFinite)) return;

      // Quadratic Bezier midpoint lifted toward the top of the map
      // for arc-on-globe feel. Lift proportional to distance so short
      // corridors (intra-Europe) read as gentle curves and long ones
      // (JP -> US) read as broad arcs.
      const mx = (x1 + x2) / 2;
      const my = (y1 + y2) / 2 - Math.hypot(x2 - x1, y2 - y1) * 0.25;
      const pathD = `M ${x1} ${y1} Q ${mx} ${my} ${x2} ${y2}`;
      const color = colors[i] || '#155e75';

      // Static arc + endpoint dots. Halo + bright stroke so the
      // line reads against the orange choropleth fill below.
      arcGroup.append('path')
        .attr('d', pathD)
        .attr('fill', 'none')
        .attr('stroke', '#0a0a0a')
        .attr('stroke-width', 5)
        .attr('stroke-opacity', 0.7)
        .attr('stroke-linecap', 'round');
      arcGroup.append('path')
        .attr('d', pathD)
        .attr('fill', 'none')
        .attr('stroke', color)
        .attr('stroke-width', 2.5)
        .attr('stroke-opacity', 0.95)
        .attr('stroke-linecap', 'round')
        .style('filter', `drop-shadow(0 0 3px ${color})`);
      arcGroup.append('circle')
        .attr('cx', x1).attr('cy', y1).attr('r', 4)
        .attr('fill', color).attr('fill-opacity', 1)
        .attr('stroke', '#0a0a0a').attr('stroke-width', 1.5);
      arcGroup.append('circle')
        .attr('cx', x2).attr('cy', y2).attr('r', 4)
        .attr('fill', color).attr('fill-opacity', 1)
        .attr('stroke', '#0a0a0a').attr('stroke-width', 1.5);

      // Traveling pulse (SVG animateMotion). Skip when reduce-motion
      // preference is set or when the corridor is so short the
      // animation would be sub-pixel jitter.
      const dist = Math.hypot(x2 - x1, y2 - y1);
      if (reduceMotion || dist < 24) return;

      const pulse = arcGroup.append('circle')
        .attr('r', 3.5)
        .attr('cx', 0).attr('cy', 0)
        .attr('fill', color)
        .attr('fill-opacity', 0.95)
        .style('filter', `drop-shadow(0 0 6px ${color})`);

      const animate = document.createElementNS('http://www.w3.org/2000/svg', 'animateMotion');
      animate.setAttribute('path', pathD);
      animate.setAttribute('dur', (3.2 + i * 0.35) + 's');
      animate.setAttribute('repeatCount', 'indefinite');
      animate.setAttribute('begin', (i * 0.45) + 's');
      animate.setAttribute('rotate', 'auto');
      pulse.node().appendChild(animate);
    });
  }

  async function refresh(windowDays) {
    currentWindow = windowDays || currentWindow;
    const [features, body] = await Promise.all([
      loadWorld(),
      (async () => {
        try {
          const r = await fetch(`${FLOWS_API}/stats/cross-border-flow?window_days=${currentWindow}`);
          if (!r.ok) return null;
          return await r.json();
        } catch (e) { return null; }
      })(),
    ]);
    if (!body) {
      if (elCorridors) elCorridors.innerHTML = '<div class="text-muted">Service unreachable.</div>';
      markStale('cross-border', false);
      return;
    }
    markStale('cross-border', true);
    setHeadline(body.coverage, currentWindow);
    renderCorridors(body.top_corridors || []);
    renderCoverage(body.coverage);
    // The API's caveat field explains the method; the page keeps a
    // plain reading note instead.
    if (elCaveat) elCaveat.textContent = XB_NOTE;
    if (features) {
      document.getElementById('xb-map-unavailable')?.remove();
      renderMap(body.per_country || [], body.top_corridors || []);
    }
  }

  // Range button wiring (matches the existing flow-range-btn UX)
  document.querySelectorAll('.xb-range-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.xb-range-btn').forEach(b => {
        b.classList.remove('border-accent', 'text-white');
        b.classList.add('border-border', 'text-muted');
        b.removeAttribute('aria-pressed');
      });
      btn.classList.add('border-accent', 'text-white');
      btn.classList.remove('border-border', 'text-muted');
      btn.setAttribute('aria-pressed', 'true');
      refresh(parseInt(btn.dataset.xbRange, 10));
    });
  });

  // Defer first render until d3 + topojson are actually loaded.
  // Both are deferred CDN scripts so they may not be ready when this
  // IIFE runs; poll briefly then fire. If the CDN is blocked they never
  // arrive, so after MAP_WAIT_MS the corridor list and headline load
  // anyway (they need no d3) and the map says why it is empty.
  const MAP_WAIT_MS = 10000;
  const mapLibsReady = () => typeof d3 !== 'undefined' && typeof topojson !== 'undefined';
  function start() {
    refresh(currentWindow);
    pollWhileVisible(() => refresh(currentWindow), 5 * 60 * 1000);
  }
  // d3 and topojson (about 300 KB) load only when the map is close to the
  // screen; the map sits far down the page. Same pinned URLs and SRI
  // hashes as before, and the CSP script-src already lists both.
  const MAP_LIBS = [
    ['https://cdn.jsdelivr.net/npm/d3@7.8.5/dist/d3.min.js', 'sha384-su5kReKyYlIFrI62mbQRKXHzFobMa7BHp1cK6julLPbnYcCW9NIZKJiTODjLPeDh'],
    ['https://cdn.jsdelivr.net/npm/topojson-client@3.1.0/dist/topojson-client.min.js', 'sha384-Ukv1p/xTma6P4/2bY5KzWBw+ydSpXmhCMtyciIQVDJ1RmOxtCYNMF1uXT9T63H67'],
  ];
  function loadMapLibs() {
    for (const [src, sri] of MAP_LIBS) {
      const s = document.createElement('script');
      s.src = src; s.integrity = sri; s.crossOrigin = 'anonymous';
      document.head.appendChild(s);
    }
    waitForLibs();
  }
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      if (entries.some(e => e.isIntersecting)) { io.disconnect(); loadMapLibs(); }
    }, { rootMargin: '800px 0px' });
    io.observe(mapEl);
  } else {
    loadMapLibs();
  }
  function waitForLibs() {
    const waitStarted = Date.now();
    const startInterval = setInterval(() => {
      if (mapLibsReady()) {
        clearInterval(startInterval);
        start();
      } else if (Date.now() - waitStarted > MAP_WAIT_MS) {
        clearInterval(startInterval);
        const note = document.createElement('div');
        note.id = 'xb-map-unavailable';
        note.className = 'absolute inset-0 flex items-center justify-center text-xs text-muted text-center px-4';
        note.textContent = 'The map could not load in this browser. The corridor list is still live.';
        mapEl?.parentElement?.appendChild(note);
        start();
      }
    }, 200);
  }
})();

(function setupMobileNav() {
  const openBtn  = document.getElementById('nav-open');
  const closeBtn = document.getElementById('nav-close');
  const overlay  = document.getElementById('mobile-nav');
  if (!openBtn || !closeBtn || !overlay) return;
  const open  = () => { overlay.style.display = 'flex'; openBtn.setAttribute('aria-expanded','true'); document.body.style.overflow = 'hidden'; };
  const close = () => { overlay.style.display = 'none'; openBtn.setAttribute('aria-expanded','false'); document.body.style.overflow = ''; };
  openBtn.addEventListener('click', open);
  closeBtn.addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  overlay.querySelectorAll('a').forEach(a => a.addEventListener('click', close));
  document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
  window.addEventListener('resize', () => { if (window.innerWidth >= 1024) close(); });
})();
