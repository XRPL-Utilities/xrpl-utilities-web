// Payment + polling + results rendering for /telemetry/.
// Pure ES2018, no framework. Cloned from scan-flow.js and adapted to the
// Telemetry contract:
//   POST /quote          -> {invoice_id, amount_drops, destination, deep_link, qr_code, expires_at}
//   GET  /status/{id}    -> {paid: bool, tx_hash?: string}
//   GET  /results/{id}   -> TelemetryPayload

(function (global) {
  'use strict';

  const API_BASE = 'https://telemetry.xrpl-utilities.io';
  const POLL_INTERVAL_MS = 5000;
  const POLL_TIMEOUT_MS = 35 * 60 * 1000;

  const DROPS_PER_XRP = 1_000_000;

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function fmtXrp(drops) {
    const xrp = Number(drops) / DROPS_PER_XRP;
    return xrp.toLocaleString(undefined, { maximumFractionDigits: 6 }) + ' XRP';
  }

  function fmtXrpAmount(xrp) {
    return Number(xrp).toLocaleString(undefined, { maximumFractionDigits: 2 }) + ' XRP';
  }

  function fmtPct(n) {
    return (Number(n) * 100).toFixed(2) + '%';
  }

  function fmtPctRaw(n) {
    return Number(n).toFixed(2) + '%';
  }

  function fmtRatio(n) {
    return Number(n).toFixed(3);
  }

  function fmtUsd(n, digits) {
    return '$' + Number(n).toLocaleString(undefined, {
      minimumFractionDigits: digits != null ? digits : 2,
      maximumFractionDigits: digits != null ? digits : 2,
    });
  }

  // Standard USD price display. 2 decimals once the value reaches a
  // dollar (sub-cent precision is rounding noise at that scale), up to
  // 4 decimals for sub-dollar values where the extra digits are real.
  // $1.1524 -> $1.15, $156.0976 -> $156.10, $0.0269 -> $0.0269.
  // For prices only - aggregates use fmtUsd(n, 0).
  function fmtUsdPrice(n) {
    const num = Number(n);
    const opts = Math.abs(num) >= 1
      ? { minimumFractionDigits: 2, maximumFractionDigits: 2 }
      : { minimumFractionDigits: 2, maximumFractionDigits: 4 };
    return '$' + num.toLocaleString(undefined, opts);
  }

  // Equilibrium-price display. Looser threshold so the third/fourth
  // decimal survives at the $1-$10 range where it carries meaning - a
  // Burst Math floor of $1.014 vs $1.0143 is real signal at billion-
  // unit M. Used for the Required-floor row in renderUtilityFloorCard.
  // $1.014 -> $1.014, $9.999 -> $9.999, $10 -> $10.00, $156 -> $156.00.
  function fmtUsdEq(n) {
    const num = Number(n);
    const opts = Math.abs(num) >= 10
      ? { minimumFractionDigits: 2, maximumFractionDigits: 2 }
      : { minimumFractionDigits: 2, maximumFractionDigits: 4 };
    return '$' + num.toLocaleString(undefined, opts);
  }

  // Compact human formatting for very large XRP totals (Active Float card).
  // ~62B -> "62.02B XRP", ~1.64B -> "1.64B XRP", ~92M -> "92.9M XRP".
  function fmtXrpCompact(xrp) {
    const n = Number(xrp);
    if (!isFinite(n)) return '-';
    const abs = Math.abs(n);
    if (abs >= 1e9) return (n / 1e9).toFixed(2) + 'B XRP';
    if (abs >= 1e6) return (n / 1e6).toFixed(1) + 'M XRP';
    if (abs >= 1e3) return Math.round(n / 1e3) + 'k XRP';
    return Math.round(n).toLocaleString() + ' XRP';
  }

  function fmtIso(s) {
    if (!s) return '';
    const d = new Date(s);
    if (isNaN(d.getTime())) return s;
    return d.toLocaleString();
  }

  function minutesUntil(iso) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return null;
    return Math.max(0, Math.round((d.getTime() - Date.now()) / 60000));
  }

  function copyButton(text) {
    const btn = el('button', 'text-xs text-accent hover:underline', 'Copy');
    btn.type = 'button';
    btn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(text);
        btn.textContent = 'Copied!';
        setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
      } catch (e) { btn.textContent = 'Copy failed'; }
    });
    return btn;
  }

  function renderError(target, message) {
    target.innerHTML = '';
    const card = el('div', 'bg-panel border border-red-900 rounded-2xl p-6');
    card.appendChild(el('div', 'text-red-400 font-semibold mb-2', 'Something went wrong'));
    card.appendChild(el('div', 'text-muted text-sm leading-relaxed', message));
    target.appendChild(card);
  }

  function renderPayment(target, quote, onCancel) {
    target.innerHTML = '';
    const wrap = el('div', 'bg-panel border border-border rounded-2xl p-8');
    wrap.appendChild(el('div', 'text-xs uppercase tracking-widest text-accent font-semibold mb-2', 'Payment required'));
    wrap.appendChild(el('h3', 'text-3xl font-bold mb-1', fmtXrp(quote.amount_drops)));
    const minsLeft = minutesUntil(quote.expires_at);
    wrap.appendChild(el('div', 'text-muted text-sm mb-6',
      `Telemetry snapshot · expires in ${minsLeft != null ? minsLeft : '-'} min`));

    const linkRow = el('div', 'flex flex-col sm:flex-row gap-3 mb-6');
    const payBtn = el('a', 'flex-1 bg-accent hover:bg-accent-dim text-ink font-semibold px-6 py-4 rounded-lg transition text-center');
    payBtn.href = quote.deep_link;
    payBtn.textContent = 'Open in XRPL wallet';
    linkRow.appendChild(payBtn);

    if (typeof onCancel === 'function') {
      const cancelBtn = el('button', 'border border-border hover:border-red-900 hover:text-red-400 text-muted px-6 py-4 rounded-lg transition');
      cancelBtn.type = 'button';
      cancelBtn.textContent = 'Cancel';
      cancelBtn.addEventListener('click', onCancel);
      linkRow.appendChild(cancelBtn);
    }
    wrap.appendChild(linkRow);

    const grid = el('div', 'grid md:grid-cols-2 gap-6 items-start');
    const qrCol = el('div');
    qrCol.appendChild(el('div', 'text-xs uppercase tracking-wider text-muted mb-2', 'Scan with Xaman / mobile wallet'));
    const qrBox = el('div', 'bg-white p-3 rounded-lg inline-block');
    const qrImg = document.createElement('img');
    qrImg.alt = 'XRPL payment QR code';
    qrImg.width = 192;
    qrImg.height = 192;
    qrImg.style.display = 'block';
    qrImg.src = quote.qr_code ||
      ('https://api.qrserver.com/v1/create-qr-code/?size=192x192&margin=0&data=' +
       encodeURIComponent(quote.deep_link));
    qrImg.onerror = () => {
      qrBox.remove();
      qrCol.appendChild(el('div', 'text-xs text-muted mt-2', 'QR rendering unavailable; use manual instructions →'));
    };
    qrBox.appendChild(qrImg);
    qrCol.appendChild(qrBox);
    grid.appendChild(qrCol);

    const manualCol = el('div', 'space-y-3');
    manualCol.appendChild(el('div', 'text-xs uppercase tracking-wider text-muted mb-2', 'Or send manually from any XRPL wallet'));
    [
      ['Recipient',    quote.destination],
      ['Amount (XRP)', String(Number(quote.amount_drops) / DROPS_PER_XRP)],
      ['Invoice ID',   quote.invoice_id],
    ].forEach(([k, v]) => {
      const row = el('div', 'bg-ink border border-border rounded-lg p-3 flex items-center justify-between gap-3');
      const left = el('div', 'flex-grow min-w-0');
      left.appendChild(el('div', 'text-xs text-muted', k));
      left.appendChild(el('div', 'font-mono text-sm break-all', v));
      row.appendChild(left);
      row.appendChild(copyButton(v));
      manualCol.appendChild(row);
    });
    manualCol.appendChild(el('div', 'text-xs text-muted leading-relaxed mt-2', 'The deep link encodes everything your wallet needs. Use the manual fields if you prefer to enter them by hand.'));
    grid.appendChild(manualCol);
    wrap.appendChild(grid);

    const statusBar = buildStatusBanner('Awaiting payment');
    statusBar.id = 'flow-status';
    statusBar.classList.add('mt-6');
    wrap.appendChild(statusBar);

    target.appendChild(wrap);
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function buildStatusBanner(message, tone) {
    const dotColor = tone === 'good' ? 'bg-good' : tone === 'bad' ? 'bg-bad' : 'bg-accent';
    const borderClass = tone === 'good' ? 'border-good/40' : tone === 'bad' ? 'border-bad/40' : 'border-accent/40';
    const banner = el('div', 'bg-ink border ' + borderClass + ' rounded-lg p-4 flex items-start gap-4');

    const dotWrap = el('span', 'relative flex h-3 w-3 shrink-0 mt-1.5');
    if (!tone) {
      dotWrap.appendChild(el('span', 'animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75'));
    }
    dotWrap.appendChild(el('span', 'relative inline-flex rounded-full h-3 w-3 ' + dotColor));
    banner.appendChild(dotWrap);

    const textWrap = el('div', 'flex-grow min-w-0');
    textWrap.appendChild(el('div', 'text-base font-semibold text-white', message));
    if (!tone) {
      textWrap.appendChild(el('div', 'text-xs text-muted mt-1 leading-relaxed', "We're watching XRPL for your transaction. This page updates automatically once it lands - usually within a few seconds of broadcast."));
    }
    banner.appendChild(textWrap);
    return banner;
  }

  function updateStatus(target, message, tone) {
    const old = target.querySelector('#flow-status');
    if (!old) return;
    const replacement = buildStatusBanner(message, tone);
    replacement.id = 'flow-status';
    replacement.classList.add('mt-6');
    old.replaceWith(replacement);
  }

  // After payment is confirmed and before /results lands, show a bold
  // bridge panel matching the Sentinel-bulk "Scanning your wallets" UX.
  // /results is usually sub-second since the snapshot is pre-built; if
  // the cache happens to be cold and the rebuild takes longer, the
  // pulsing skeleton cards reassure the user the page is alive.
  function renderBuilding(target) {
    target.replaceChildren();
    const wrap = el('div', 'bg-panel border-2 border-accent rounded-2xl p-8');

    wrap.appendChild(el('div', 'text-xs uppercase tracking-widest text-good font-semibold mb-2', '✓ Payment received'));
    wrap.appendChild(el('h3', 'text-3xl md:text-4xl font-bold mb-2', 'Building telemetry snapshot'));
    wrap.appendChild(el('p', 'text-muted mb-8', 'Pulling live XRPL state. Usually lands in under a second.'));

    const stack = el('div', 'space-y-3');
    ['Active Float', 'Supply', 'Regional liquidity', 'AMM', 'Required equilibrium price'].forEach(label => {
      const card = el('div', 'bg-ink border border-border rounded-lg p-4');
      card.appendChild(el('div', 'text-xs uppercase tracking-wider text-muted font-semibold mb-3', label));
      const blocks = el('div', 'space-y-2');
      blocks.appendChild(el('div', 'h-3 bg-border rounded animate-pulse w-full'));
      blocks.appendChild(el('div', 'h-3 bg-border rounded animate-pulse w-3/4'));
      card.appendChild(blocks);
      stack.appendChild(card);
    });
    wrap.appendChild(stack);

    target.appendChild(wrap);
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function downloadButton(label, filename, contentType, body) {
    const btn = el('button', 'border border-border hover:border-accent text-white text-sm px-3 py-2 rounded-lg transition');
    btn.type = 'button';
    btn.textContent = label;
    btn.addEventListener('click', () => {
      const blob = new Blob([body], { type: contentType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
    return btn;
  }

  function sectionCard(title) {
    const card = el('div', 'bg-panel border border-border rounded-2xl p-6');
    card.appendChild(el('div', 'text-xs uppercase tracking-widest text-accent font-semibold mb-4', title));
    return card;
  }

  function kvGrid(rows, cols) {
    const grid = el('div', `grid grid-cols-2 sm:grid-cols-${cols || 3} gap-4 text-sm`);
    rows.forEach(([k, v]) => {
      const cell = el('div');
      cell.appendChild(el('div', 'text-xs text-muted mb-1', k));
      // Allow callers to pass a pre-built DOM node when the value needs
      // styled inline pieces (e.g. a colored 24h-change arrow on the spot
      // row). Plain strings still go through textContent for safety.
      if (v instanceof Node) {
        const wrap = el('div', 'font-medium break-all');
        wrap.appendChild(v);
        cell.appendChild(wrap);
      } else {
        cell.appendChild(el('div', 'font-medium break-all', String(v)));
      }
      grid.appendChild(cell);
    });
    return grid;
  }

  // Two-up Active Float dual-card. Left: neutral Total Circulating Supply
  // (= total - escrow). Right: accent-bordered Active Float with red ↓
  // arrow on shrinkage. Accepts the full payload because it pulls from
  // both supply and derived_models.
  function renderActiveFloatCard(payload) {
    const supply = payload.supply || {};
    const af = (payload.derived_models || {}).active_float || {};
    const card = sectionCard('Active Float (3-second settlement supply)');

    const grid = el('div', 'grid sm:grid-cols-2 gap-4');

    // Left: Total Circulating Supply (neutral).
    const left = el('div', 'bg-ink border border-border rounded-xl p-5');
    left.appendChild(el('div', 'text-xs uppercase tracking-wider text-muted mb-2', 'Total Circulating Supply'));
    left.appendChild(el('div', 'text-3xl sm:text-4xl font-bold tracking-tight font-mono',
      typeof supply.circulating_xrp === 'number' ? fmtXrpCompact(supply.circulating_xrp) : '-'));
    left.appendChild(el('div', 'text-xs text-muted mt-2', 'Total XRPL supply minus Ripple escrow.'));
    grid.appendChild(left);

    // Right: Modeled Active Float (accent + delta arrow).
    const right = el('div', 'bg-ink border-2 border-accent rounded-xl p-5');
    right.appendChild(el('div', 'text-xs uppercase tracking-wider text-accent font-semibold mb-2', 'Modeled Active Float'));
    right.appendChild(el('div', 'text-3xl sm:text-4xl font-bold tracking-tight font-mono',
      typeof af.value_xrp === 'number' ? fmtXrpCompact(af.value_xrp) : '-'));

    const deltaXrp = af.delta_24h_xrp;
    const deltaPct = af.delta_24h_pct;
    if (typeof deltaXrp === 'number' && typeof deltaPct === 'number') {
      const shrinking = deltaXrp < 0;
      const arrow = shrinking ? '↓' : '↑';
      const tone = shrinking ? 'text-bad' : 'text-good';
      const sign = shrinking ? '' : '+';
      const deltaWrap = el('div', 'mt-2 flex items-center gap-2 text-sm');
      deltaWrap.appendChild(el('span', 'text-xl font-bold ' + tone, arrow));
      deltaWrap.appendChild(el('span', 'font-mono ' + tone,
        sign + fmtXrpCompact(deltaXrp) + ' (' + sign + Number(deltaPct).toFixed(2) + '%)'));
      deltaWrap.appendChild(el('span', 'text-xs text-muted', '24h'));
      right.appendChild(deltaWrap);
    } else {
      right.appendChild(el('div', 'text-xs text-muted mt-2',
        '24h delta bootstrapping (first daily snapshot still rotating).'));
    }

    if (typeof af.proxy_ratio === 'number') {
      right.appendChild(el('div', 'text-xs text-muted mt-2',
        'Hot/warm exchange omnibus × ' + (af.proxy_ratio * 100).toFixed(1) +
        '% active-depth proxy + AMM-locked + DEX orderbook depth.'));
    }
    grid.appendChild(right);

    card.appendChild(grid);

    // Plain disclosure. The bridge data ships in the JSON payload itself
    // for agents that want to inspect it; no need to link out.
    const disc = el('div', 'mt-4 text-xs text-muted leading-relaxed',
      'Active Float is a model output, not a measurement. The 10% multiplier is a midpoint estimate; market-structure researchers commonly cite a 5-15% range. Every input number ships in supply.* and the full breakdown ships in derived_models.active_float.mathematical_bridge.');
    card.appendChild(disc);

    return card;
  }

  function renderSupplyCard(supply) {
    const card = sectionCard('Supply');
    const rows = [
      ['Total XRP',                     fmtXrpAmount(supply.total_xrp)],
      ['Circulating (- escrow)',        typeof supply.circulating_xrp === 'number' ? fmtXrpAmount(supply.circulating_xrp) : '-'],
      ['Escrowed',                      fmtXrpAmount(supply.escrowed_xrp)],
      ['Dormant (>12mo)',               fmtXrpAmount(supply.dormant_xrp)],
      ['HODL wave',                     fmtPctRaw(supply.hodl_wave_pct)],
      ['24h exchange outflow',          fmtXrpAmount(supply.exchange_outflow_24h_xrp)],
    ];
    if (typeof supply.exchange_omnibus_xrp === 'number') {
      rows.push(['Exchange omnibus (raw)', fmtXrpAmount(supply.exchange_omnibus_xrp)]);
    }
    if (typeof supply.amm_locked_xrp === 'number') {
      rows.push(['AMM-locked',          fmtXrpAmount(supply.amm_locked_xrp)]);
    }
    if (typeof supply.dex_orderbook_depth_xrp === 'number') {
      rows.push(['DEX orderbook depth', fmtXrpAmount(supply.dex_orderbook_depth_xrp)]);
    }
    rows.push(['Escrow release ÷ relock ratio', fmtRatio(supply.escrow_release_vs_relock_ratio)]);
    card.appendChild(kvGrid(rows, 3));
    return card;
  }

  function renderBridgeFlowsCard(supply) {
    // Cross-chain flow strip: outflow (XRP leaving XRPL via bridges),
    // inflow (XRP arriving from other chains), net. Renders only when
    // the snapshot carries the bridge_*_24h_xrp fields (Telemetry slow-
    // task may be cold on first deploy, in which case all three are 0).
    if (typeof supply.bridge_outflow_24h_xrp !== 'number' &&
        typeof supply.bridge_inflow_24h_xrp !== 'number') {
      return null;
    }
    const card = sectionCard('Cross-chain flow (24h)');
    const outflow = Number(supply.bridge_outflow_24h_xrp) || 0;
    const inflow = Number(supply.bridge_inflow_24h_xrp) || 0;
    const net = Number(supply.bridge_net_flow_24h_xrp);
    const netSafe = isFinite(net) ? net : (inflow - outflow);
    const exchOutflow = Number(supply.exchange_outflow_24h_xrp) || 0;

    const grid = el('div', 'grid grid-cols-3 gap-3 mb-3');
    [
      ['Outflow', outflow, 'XRP leaving XRPL'],
      ['Inflow',  inflow,  'XRP arriving from other chains'],
      ['Net',     netSafe, netSafe > 0 ? 'XRPL net-receiver' : (netSafe < 0 ? 'XRPL net-sender' : 'Balanced')],
    ].forEach(([k, v, sub], idx) => {
      const cell = el('div', 'bg-ink border border-border rounded-lg p-3');
      cell.appendChild(el('div', 'text-[10px] uppercase tracking-wider text-muted mb-1', k));
      const colorClass = idx === 2
        ? (v > 0 ? 'text-good' : (v < 0 ? 'text-bad' : 'text-white'))
        : 'text-white';
      const sign = idx === 2 && v > 0 ? '+' : '';
      cell.appendChild(el('div', 'font-mono text-base ' + colorClass, sign + fmtXrpAmount(v)));
      cell.appendChild(el('div', 'text-[11px] text-muted mt-1', sub));
      grid.appendChild(cell);
    });
    card.appendChild(grid);

    // Honest framing line. Compare to exchange outflow magnitude so a
    // reader can see whether bridge flow is a meaningful share or a
    // rounding error today. Hidden when exchange data is missing.
    let footer;
    if (exchOutflow > 0) {
      const totalBridge = outflow + inflow;
      const ratio = (totalBridge / exchOutflow) * 100;
      footer = `Total bridge magnitude is ${ratio.toFixed(2)}% of 24h exchange outflow. ` +
               `XRPL is bridge-poor today; this signal grows if/when cross-chain settlement does.`;
    } else {
      footer = 'Bridge flow is one signal among many. Cross-chain volume is historically modest on XRPL.';
    }
    card.appendChild(el('div', 'text-xs text-muted leading-relaxed', footer));
    return card;
  }

  function renderLiquidityCard(liquidity) {
    const card = sectionCard('Regional liquidity (24h)');
    // Stacked region cards. 1-up on mobile, 2-up at sm+. Each region gets
    // its own card with header (region + net flow) + inflow/outflow grid +
    // venue chips. Avoids the 5-column horizontal-scroll trap on narrow
    // viewports.
    const list = el('div', 'grid sm:grid-cols-2 gap-3');
    (liquidity || []).forEach(row => {
      const r = el('div', 'bg-ink border border-border rounded-lg p-4');

      const header = el('div', 'flex items-baseline justify-between gap-3 mb-3');
      header.appendChild(el('div', 'font-mono font-semibold text-base', row.region));
      const net = Number(row.net_flow_24h_xrp);
      const netClass = net >= 0 ? 'text-good' : 'text-bad';
      const netEl = el('div', 'text-sm ' + netClass);
      netEl.appendChild(el('span', 'font-mono', (net >= 0 ? '+' : '') + fmtXrpAmount(net)));
      netEl.appendChild(el('span', 'text-muted ml-1', 'net'));
      header.appendChild(netEl);
      r.appendChild(header);

      const flow = el('div', 'grid grid-cols-2 gap-3 mb-3');
      const inCol = el('div');
      inCol.appendChild(el('div', 'text-[10px] uppercase tracking-wider text-muted mb-0.5', 'Inflow'));
      inCol.appendChild(el('div', 'font-mono text-sm', fmtXrpAmount(row.inflow_24h_xrp)));
      flow.appendChild(inCol);
      const outCol = el('div');
      outCol.appendChild(el('div', 'text-[10px] uppercase tracking-wider text-muted mb-0.5', 'Outflow'));
      outCol.appendChild(el('div', 'font-mono text-sm', fmtXrpAmount(row.outflow_24h_xrp)));
      flow.appendChild(outCol);
      r.appendChild(flow);

      // Coverage caveat: when both flows are zero AND no venues are listed,
      // the region is in the schema but the labeled venues don't have any
      // wallets large enough to surface in XRPSCAN's holder-list discovery
      // cutoff. Currently the case for MENA (Rain / BitOasis / CoinMENA all
      // below the cutoff). Surface this honestly instead of letting humans
      // read 0 / 0 as 'no activity'.
      const inflowZero = Number(row.inflow_24h_xrp) === 0;
      const outflowZero = Number(row.outflow_24h_xrp) === 0;
      const noVenues = !(row.top_venues && row.top_venues.length);
      if (inflowZero && outflowZero && noVenues) {
        r.appendChild(el('div', 'text-[10px] text-muted leading-relaxed', 'No labeled wallets here clear the holder-list discovery cutoff. Zero reflects coverage, not absence of activity.'));
      }

      if (row.top_venues && row.top_venues.length) {
        const venuesWrap = el('div');
        venuesWrap.appendChild(el('div', 'text-[10px] uppercase tracking-wider text-muted mb-1', 'Top venues'));
        const venues = el('div', 'flex flex-wrap gap-1');
        row.top_venues.forEach(v => venues.appendChild(el('span', 'font-mono text-[11px] bg-panel border border-border rounded px-1.5 py-0.5', v)));
        venuesWrap.appendChild(venues);
        r.appendChild(venuesWrap);
      }

      list.appendChild(r);
    });
    card.appendChild(list);
    return card;
  }

  function renderAmmCard(amm) {
    const card = sectionCard('AMM');
    const wrap = el('div', 'grid md:grid-cols-2 gap-6');

    // Pairs column: stacked pair cards, mobile-friendly. Header row is the
    // pair name + APR (most useful at a glance); body is a 3-up grid of
    // TVL / 1% depth / fee_pct so nothing overflows on a 375px viewport.
    const pairsCol = el('div');
    pairsCol.appendChild(el('div', 'text-xs uppercase tracking-wider text-muted mb-2', 'Top pairs'));
    const pairsList = el('div', 'space-y-2');
    (amm.pairs || []).forEach(p => {
      const r = el('div', 'bg-ink border border-border rounded-lg p-3');
      const header = el('div', 'flex items-baseline justify-between gap-3 mb-2');
      header.appendChild(el('div', 'font-mono font-semibold text-sm', p.pair));
      header.appendChild(el('div', 'text-sm text-white font-medium', fmtPctRaw(p.apr_pct) + ' APR'));
      r.appendChild(header);

      const grid = el('div', 'grid grid-cols-3 gap-2');
      const cells = [
        ['TVL',       fmtUsd(p.tvl_usd, 0)],
        ['1% depth',  fmtXrpAmount(p.depth_1pct_xrp)],
        ['Fee',       fmtPctRaw(p.fee_pct)],
      ];
      cells.forEach(([k, v]) => {
        const c = el('div');
        c.appendChild(el('div', 'text-[10px] uppercase tracking-wider text-muted mb-0.5', k));
        c.appendChild(el('div', 'font-mono text-xs text-white break-all', v));
        grid.appendChild(c);
      });
      r.appendChild(grid);
      pairsList.appendChild(r);
    });
    if (!(amm.pairs || []).length) {
      pairsList.appendChild(el('div', 'bg-ink border border-border rounded-lg p-3 text-xs text-muted', 'No pair data this snapshot.'));
    }
    pairsCol.appendChild(pairsList);
    wrap.appendChild(pairsCol);

    // Vaults column: same stacked-card pattern. When empty, show an explicit
    // placeholder so the column does not look broken (vault tracking is
    // gated on the SingleAssetVault amendment which is not yet active).
    const vaultsCol = el('div');
    vaultsCol.appendChild(el('div', 'text-xs uppercase tracking-wider text-muted mb-2', 'Vaults'));
    const vaultsList = el('div', 'space-y-2');
    (amm.vaults || []).forEach(v => {
      const r = el('div', 'bg-ink border border-border rounded-lg p-3');
      const header = el('div', 'flex items-baseline justify-between gap-3 mb-2');
      header.appendChild(el('div', 'font-mono font-semibold text-sm', v.asset));
      header.appendChild(el('div', 'text-sm text-white font-medium', fmtPctRaw(v.supply_apy_pct) + ' APY'));
      r.appendChild(header);

      const grid = el('div', 'grid grid-cols-2 gap-2');
      const cells = [
        ['TVL',  fmtXrpAmount(v.tvl_xrp_equivalent)],
        ['Util', fmtPctRaw(v.utilization_pct)],
      ];
      cells.forEach(([k, val]) => {
        const c = el('div');
        c.appendChild(el('div', 'text-[10px] uppercase tracking-wider text-muted mb-0.5', k));
        c.appendChild(el('div', 'font-mono text-xs text-white break-all', val));
        grid.appendChild(c);
      });
      r.appendChild(grid);
      vaultsList.appendChild(r);
    });
    if (!(amm.vaults || []).length) {
      const empty = el('div', 'bg-ink border border-border border-dashed rounded-lg p-4 text-xs text-muted leading-relaxed');
      empty.appendChild(el('div', 'text-white font-semibold mb-1', 'No active vaults yet'));
      empty.appendChild(el('div', null, 'XRPL single-asset vaults are gated on the SingleAssetVault amendment. This card auto-populates once vaults go live on-chain.'));
      vaultsList.appendChild(empty);
    }
    vaultsCol.appendChild(vaultsList);
    wrap.appendChild(vaultsCol);

    card.appendChild(wrap);
    return card;
  }

  function renderUtilityFloorCard(uf) {
    const card = sectionCard('Required equilibrium price');
    const hasSpot = typeof uf.current_price_usd === 'number';
    // Baseline (= P from Burst Math) keeps the precise threshold so a
    // $1.014 floor reads as $1.014, not $1.01. Spot is a market quote
    // where 2 decimals is plenty.
    const rows = [['Required floor', fmtUsdEq(uf.baseline_usd) + ' / XRP']];
    if (hasSpot) {
      // Build the spot row as a DOM node so the 24h arrow + change % can
      // carry its own color (green up, red down, muted on zero), matching
      // the Burst Math hero tile. Plain text rows in kvGrid go through
      // textContent and can't carry colored spans.
      const spotNode = el('span');
      spotNode.appendChild(document.createTextNode(fmtUsdPrice(uf.current_price_usd) + ' / XRP'));
      const ch = uf.current_price_usd_24h_change_pct;
      if (typeof ch === 'number' && isFinite(ch)) {
        const arrow = ch > 0 ? '↑' : (ch < 0 ? '↓' : '·');
        const sign  = ch > 0 ? '+' : '';
        const cls   = ch > 0 ? 'text-good' : (ch < 0 ? 'text-bad' : 'text-muted');
        spotNode.appendChild(document.createTextNode(' · '));
        spotNode.appendChild(el('span', cls, arrow + ' ' + sign + ch.toFixed(2) + '% 24h'));
      }
      rows.push(['Current spot', spotNode]);
      if (uf.baseline_usd > 0) {
        rows.push(['Premium', (uf.current_price_usd / uf.baseline_usd).toFixed(2) + '×']);
      }
    }
    rows.push(['Active Float (M)', fmtXrpAmount(uf.available_liquid_supply_xrp)]);
    rows.push(['Volume (Q)',        fmtUsd(uf.q_assumed_usd, 0)]);
    rows.push(['Velocity (V)',      Number(uf.v_assumed).toFixed(2)]);
    card.appendChild(kvGrid(rows, hasSpot ? 3 : 4));
    card.appendChild(el('div', 'text-xs text-muted mt-3 leading-relaxed',
      'P = Q ÷ (V × M) - the equilibrium USD-per-XRP price the math requires under the assumed Q, V, and modeled Active Float. Not a price prediction.'));
    return card;
  }

  function renderResults(target, payload, invoiceId) {
    target.innerHTML = '';
    const summary = el('div', 'bg-panel border border-border rounded-2xl p-6 mb-4');
    const top = el('div', 'flex items-center justify-between gap-4 mb-2');
    const heading = el('div');
    heading.appendChild(el('div', 'text-xs uppercase tracking-widest text-good font-semibold mb-1', 'Complete'));
    heading.appendChild(el('h3', 'text-2xl font-bold', 'Telemetry snapshot'));
    top.appendChild(heading);
    const downloads = el('div', 'flex gap-2 shrink-0');
    downloads.appendChild(downloadButton(
      'JSON',
      `xr-telemetry-${invoiceId || 'snapshot'}.json`,
      'application/json',
      JSON.stringify(payload, null, 2)
    ));
    top.appendChild(downloads);
    summary.appendChild(top);
    summary.appendChild(el('div', 'text-xs text-muted',
      'Generated ' + fmtIso(payload.generated_at) + (invoiceId ? ' · Invoice ' + invoiceId : '')));
    target.appendChild(summary);

    const stack = el('div', 'space-y-4');
    // Active Float dual-card removed from this render stack: the hero tiles
    // at the top of the page (Total Circulating Supply + Modeled Active
    // Float, populated by populateActiveFloatCard() / setActiveFloatDelta()
    // when a snapshot loads) already carry the same data. Re-rendering it
    // here was duplicating headline content. Snapshot stack now starts
    // straight at Supply.
    if (payload.supply)        stack.appendChild(renderSupplyCard(payload.supply));
    if (payload.supply) {
      const bridgeCard = renderBridgeFlowsCard(payload.supply);
      if (bridgeCard) stack.appendChild(bridgeCard);
    }
    if (payload.liquidity)     stack.appendChild(renderLiquidityCard(payload.liquidity));
    if (payload.amm)           stack.appendChild(renderAmmCard(payload.amm));
    if (payload.utility_floor) stack.appendChild(renderUtilityFloorCard(payload.utility_floor));
    target.appendChild(stack);

    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function pollUntilPaid(target, invoiceId, getCancelled) {
    const originalTitle = document.title;
    const restore = () => { document.title = originalTitle; };

    document.title = '⏳ Awaiting payment · XR-Telemetry';

    const start = Date.now();
    while (Date.now() - start < POLL_TIMEOUT_MS) {
      if (getCancelled()) { restore(); return null; }
      try {
        const r = await fetch(`${API_BASE}/status/${invoiceId}`);
        if (r.status === 404) {
          updateStatus(target, 'Invoice not found (may have expired)', 'bad');
          restore();
          return null;
        }
        if (r.ok) {
          const status = await r.json();
          if (status.paid) {
            document.title = '✓ Payment received · XR-Telemetry';
            renderBuilding(target);
            const rr = await fetch(`${API_BASE}/results/${invoiceId}`);
            if (rr.ok) {
              setTimeout(restore, 5000);
              return await rr.json();
            }
            renderError(target, 'Payment confirmed but results fetch failed. Try refreshing.');
            restore();
            return null;
          }
          updateStatus(target, 'Awaiting payment…');
        }
      } catch (e) {
        // transient; keep polling
      }
      await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
    }
    updateStatus(target, 'Polling timeout. If you paid, refresh and re-fetch the invoice.', 'bad');
    restore();
    return null;
  }

  async function startTelemetryFlow(target) {
    target.innerHTML = '';
    target.appendChild(el('div', 'bg-panel border border-border rounded-2xl p-6 text-muted', 'Requesting quote…'));
    let quote;
    try {
      const r = await fetch(`${API_BASE}/quote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        renderError(target, err.detail || `Quote failed (HTTP ${r.status}).`);
        return null;
      }
      quote = await r.json();
    } catch (e) {
      renderError(target, 'Network error requesting quote.');
      return null;
    }

    let cancelled = false;
    renderPayment(target, quote, () => { cancelled = true; updateStatus(target, 'Cancelled by user.', 'bad'); });

    const payload = await pollUntilPaid(target, quote.invoice_id, () => cancelled);
    if (payload) {
      renderResults(target, payload, quote.invoice_id);
      return { payload: payload, invoiceId: quote.invoice_id };
    }
    return null;
  }

  // Free web-preview path. Marketing site posts /scan directly with no
  // PAYMENT-SIGNATURE; the backend's web-origin check returns the
  // snapshot without taking payment. Skips the entire /quote ->
  // /status -> /results dance the agent x402 path uses.
  async function startTelemetryPreview(target) {
    renderBuilding(target);
    let payload;
    try {
      const r = await fetch(`${API_BASE}/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!r.ok) {
        let detail = '';
        try { const e = await r.json(); detail = e.detail || JSON.stringify(e); } catch (_) {}
        renderError(target, detail || `Snapshot fetch failed (HTTP ${r.status}).`);
        return null;
      }
      payload = await r.json();
    } catch (e) {
      renderError(target, 'Network error reaching Telemetry.');
      return null;
    }
    renderResults(target, payload, null);
    return { payload };
  }

  global.XRTelemetryScan = {
    start: startTelemetryFlow,        // paid x402 path (kept for reference)
    startPreview: startTelemetryPreview, // free web-origin path
    renderResults: renderResults,
  };
})(window);
