// Payment + polling + results rendering for /telemetry/.
// Pure ES2018, no framework. Cloned from scan-flow.js and adapted to the
// Telemetry contract:
//   POST /quote          -> {invoice_id, amount_drops, destination, destination_tag, deep_link, qr_code, expires_at}
//   GET  /status/{id}    -> {paid: bool, tx_hash?: string}
//   GET  /results/{id}   -> TelemetryPayload

(function (global) {
  'use strict';

  const API_BASE = 'https://telemetry.xrpl-utilities.io';
  const POLL_INTERVAL_MS = 5000;
  const POLL_TIMEOUT_MS = 35 * 60 * 1000;

  const DROPS_PER_XRP = 1_000_000;

  // Every API call gets a deadline. Without one a stalled connection left
  // the scan spinner up forever. The abort is ours, so api-resilient.js
  // does not treat it as a blocked network.
  const DEFAULT_TIMEOUT_MS = 30000;
  const SCAN_TIMEOUT_MS = 60000;
  function fetchWithTimeout(url, opts, ms) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms || DEFAULT_TIMEOUT_MS);
    return fetch(url, Object.assign({}, opts, { signal: ctrl.signal }))
      .finally(() => clearTimeout(timer));
  }

  function isTimeout(e) { return !!e && e.name === 'AbortError'; }

  // Text for a failed response. Never the raw body: a 402 carries the x402
  // payment envelope, which means nothing to a visitor on the free path.
  async function failureMessage(r, what) {
    if (r.status === 402) {
      // The free preview needs a fresh browser check. Drop the cached token
      // so the next attempt mints a new one.
      if (global.PreviewToken && global.PreviewToken._clear) global.PreviewToken._clear();
      return 'The free preview check did not go through. Reload the page and try again.';
    }
    if (r.status === 429) return 'Too many requests right now. Wait a minute and try again.';
    let detail = '';
    try {
      const e = await r.json();
      if (e && typeof e.detail === 'string') detail = e.detail;
    } catch (_) { /* non-JSON body */ }
    if (detail && detail.length <= 300) return detail;
    if (r.status >= 500) return what + ' is temporarily unavailable (HTTP ' + r.status + '). Try again shortly.';
    return what + ' failed (HTTP ' + r.status + ').';
  }

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

  // Telemetry publishes null (never 0) for a field it could not measure.
  // Number(null) is 0, so every formatter below has to reject a non-finite
  // input explicitly or a degraded refresh prints a fabricated zero. UNMEASURED
  // is what the caller renders in that slot.
  const UNMEASURED = '-';

  function isNum(x) {
    return typeof x === 'number' && isFinite(x);
  }

  function fmtXrpAmount(xrp) {
    if (!isNum(xrp)) return UNMEASURED;
    return Number(xrp).toLocaleString(undefined, { maximumFractionDigits: 2 }) + ' XRP';
  }

  function fmtPct(n) {
    if (!isNum(n)) return UNMEASURED;
    return (Number(n) * 100).toFixed(2) + '%';
  }

  function fmtPctRaw(n) {
    if (!isNum(n)) return UNMEASURED;
    return Number(n).toFixed(2) + '%';
  }

  function fmtRatio(n) {
    if (!isNum(n)) return UNMEASURED;
    return Number(n).toFixed(3);
  }

  // Plain 2-decimal number, guarded like every other formatter above. The
  // Velocity (V) row used to call Number(x).toFixed(2) directly: a null V
  // printed a confident "0.00" and a missing V printed "NaN", both on the
  // surface the customer paid for.
  function fmtNum2(n) {
    if (!isNum(n)) return UNMEASURED;
    return Number(n).toFixed(2);
  }

  // Value cell for a slot Telemetry could not measure. The dash alone tells a
  // reader nothing, and the payload already carries the cause, so print the
  // cause in the slot where the number would have been. Muted sub-line, the
  // same treatment the Active Float card gives a suppressed 24h delta.
  function unmeasuredCell(reason) {
    if (!(typeof reason === 'string' && reason)) return UNMEASURED;
    const node = el('span');
    node.appendChild(document.createTextNode(UNMEASURED));
    node.appendChild(el(
      'div',
      'text-xs text-muted font-normal mt-1 leading-relaxed',
      'Not measured this refresh: ' + reason,
    ));
    return node;
  }

  function fmtUsd(n, digits) {
    if (!isNum(n)) return UNMEASURED;
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
    if (!isNum(n)) return UNMEASURED;
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
    if (!isNum(n)) return UNMEASURED;
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
    // Recipient, amount, tag and wallet link all come from the checked copy
    // (see /assets/pay-pin.js), never straight from the response. The
    // backend's qr_code image is not used: the QR is encoded here from the
    // checked link, so its pixels can't disagree with the rows below it.
    let pay;
    try {
      pay = global.XRPayPin.verifyQuote(quote, 'destination');
    } catch (e) {
      renderError(target, e.message);
      return false;
    }
    target.innerHTML = '';
    const wrap = el('div', 'bg-panel border border-border rounded-2xl p-8');
    wrap.appendChild(el('div', 'text-xs uppercase tracking-widest text-accent font-semibold mb-2', 'Payment required'));
    wrap.appendChild(el('h3', 'text-3xl font-bold mb-1', fmtXrp(pay.drops)));
    const minsLeft = minutesUntil(quote.expires_at);
    wrap.appendChild(el('div', 'text-muted text-sm mb-6',
      `Telemetry snapshot · expires in ${minsLeft != null ? minsLeft : '-'} min`));

    const linkRow = el('div', 'flex flex-col sm:flex-row gap-3 mb-6');
    const payBtn = el('a', 'flex-1 bg-accent hover:bg-accent-dim text-ink font-semibold px-6 py-4 rounded-lg transition text-center');
    payBtn.href = pay.link;
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
    try {
      qrBox.appendChild(global.XRQr.toCanvas(pay.link, 192));
      qrCol.appendChild(qrBox);
    } catch (e) {
      qrCol.appendChild(el('div', 'text-xs text-muted mt-2', 'QR rendering unavailable; use manual instructions →'));
    }
    grid.appendChild(qrCol);

    const manualCol = el('div', 'space-y-3');
    manualCol.appendChild(el('div', 'text-xs uppercase tracking-wider text-muted mb-2', 'Or send manually from any XRPL wallet'));
    [
      ['Recipient',       pay.recipient],
      ['Amount (XRP)',    pay.xrp],
      ['Destination Tag', String(pay.tag)],
    ].forEach(([k, v]) => {
      const row = el('div', 'bg-ink border border-border rounded-lg p-3 flex items-center justify-between gap-3');
      const left = el('div', 'flex-grow min-w-0');
      left.appendChild(el('div', 'text-xs text-muted', k));
      left.appendChild(el('div', 'font-mono text-sm break-all', v));
      row.appendChild(left);
      row.appendChild(copyButton(v));
      manualCol.appendChild(row);
    });
    manualCol.appendChild(el('div', 'text-xs text-muted leading-relaxed mt-2', 'The destination tag is required so we can match your payment to this snapshot. Payments without the correct tag are not credited automatically.'));
    grid.appendChild(manualCol);
    wrap.appendChild(grid);

    const statusBar = buildStatusBanner('Awaiting payment');
    statusBar.id = 'flow-status';
    statusBar.classList.add('mt-6');
    wrap.appendChild(statusBar);

    target.appendChild(wrap);
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return true;
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
      // A null delta has two very different causes and this card used to assert
      // the wrong one. "Bootstrapping" is temporary; "the measurement basis
      // changed" means the two snapshots are not comparable and differencing
      // them would print a methodology step as a market move. Telemetry says
      // which in delta_24h_unavailable_reason -- use it rather than guessing.
      const reason = af.delta_24h_unavailable_reason;
      const basisChanged = typeof reason === 'string' && reason.indexOf('basis') !== -1;
      right.appendChild(el('div', 'text-xs text-muted mt-2',
        basisChanged
          ? 'No 24h delta: the AMM-locked measurement basis changed, so today and yesterday are not comparable. Publishing a delta here would report a methodology change as a market move. Resumes once both snapshots share a basis.'
          : (typeof reason === 'string' && reason)
            ? '24h delta unavailable: ' + reason
            : '24h delta bootstrapping (first daily snapshot still rotating).'));
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
    // Plain-English legend for the less-obvious supply metrics.
    card.appendChild(el(
      'div',
      'mt-4 text-[11px] text-muted leading-relaxed',
      'AMM-locked: XRP committed to liquidity pools, swappable but not sitting on a typical order book. ' +
      'DEX orderbook depth: XRP resting in open offers on XRPL\'s native order book. ' +
      'Escrow release ÷ relock ratio: how much escrowed XRP unlocked into circulation versus how much got re-escrowed over the same window. >1 means net dilution (more escrow opening than closing); <1 means net withdrawal of float back into time-locked storage.',
    ));
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
      // the region is in the schema but none of its labeled venues has a
      // wallet large enough to be picked up yet. Surface this honestly instead of letting humans
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

  function renderUtilityFloorCard(uf, payload) {
    const card = sectionCard('Required equilibrium price');
    const hasSpot = typeof uf.current_price_usd === 'number';
    // Floor field was renamed baseline_usd -> algebraic_p_at_assumed_qv_usd at
    // schema 1.12.0; read the new name, fall back to the old for back-compat.
    const floorUsd = uf.algebraic_p_at_assumed_qv_usd ?? uf.baseline_usd;
    // Keeps the precise threshold so a $1.014 floor reads as $1.014, not $1.01.
    // Spot is a market quote where 2 decimals is plenty.
    // Unmeasured headline reads as a clean dash (plus the cause when the
    // payload gives one). Appending the unit to the dash produced "- / XRP",
    // which reads like a measured quantity whose number went missing.
    const rows = [['Required floor', isNum(floorUsd)
      ? fmtUsdEq(floorUsd) + ' / XRP'
      : unmeasuredCell(uf.algebraic_p_unavailable_reason)]];
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
      if (floorUsd > 0) {
        rows.push(['Premium', (uf.current_price_usd / floorUsd).toFixed(2) + '×']);
      }
    }
    // M is nulled by the same upstream read failure that nulls the floor, and
    // Telemetry reports that cause on the active_float model rather than on
    // utility_floor, so pull it from there.
    const afReason = (((payload || {}).derived_models || {}).active_float || {})
      .value_unavailable_reason;
    rows.push(['Active Float (M)', isNum(uf.available_liquid_supply_xrp)
      ? fmtXrpAmount(uf.available_liquid_supply_xrp)
      : unmeasuredCell(afReason)]);
    rows.push(['Volume (Q)',        fmtUsd(uf.q_assumed_usd, 0)]);
    rows.push(['Velocity (V)',      fmtNum2(uf.v_assumed)]);
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
    if (payload.utility_floor) stack.appendChild(renderUtilityFloorCard(payload.utility_floor, payload));
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
        const r = await fetchWithTimeout(`${API_BASE}/status/${invoiceId}`);
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
            const rr = await fetchWithTimeout(`${API_BASE}/results/${invoiceId}`);
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
      const previewHeaders = await (global.PreviewToken
        ? global.PreviewToken.authHeaders()
        : Promise.resolve({}));
      const r = await fetchWithTimeout(`${API_BASE}/quote`, {
        method: 'POST',
        headers: Object.assign({ 'Content-Type': 'application/json' }, previewHeaders),
        body: JSON.stringify({}),
      });
      if (!r.ok) {
        renderError(target, await failureMessage(r, 'The quote'));
        return null;
      }
      quote = await r.json();
    } catch (e) {
      renderError(target, isTimeout(e) ? 'The quote request timed out. Try again.' : 'Network error requesting quote.');
      return null;
    }

    let cancelled = false;
    if (!renderPayment(target, quote, () => { cancelled = true; updateStatus(target, 'Cancelled by user.', 'bad'); })) return null;

    const payload = await pollUntilPaid(target, quote.invoice_id, () => cancelled);
    if (payload) {
      renderResults(target, payload, quote.invoice_id);
      return { payload: payload, invoiceId: quote.invoice_id };
    }
    return null;
  }

  // Free web-preview path. Marketing site posts /scan with a short-TTL
  // preview-token JWT (Authorization: Bearer ...) minted via Turnstile;
  // the backend verifies the signature and returns the snapshot without
  // taking payment. Skips the entire /quote -> /status -> /results
  // dance the agent x402 path uses.
  async function startTelemetryPreview(target) {
    renderBuilding(target);
    let payload;
    try {
      const previewHeaders = await (global.PreviewToken
        ? global.PreviewToken.authHeaders()
        : Promise.resolve({}));
      const r = await fetchWithTimeout(`${API_BASE}/scan`, {
        method: 'POST',
        headers: Object.assign({ 'Content-Type': 'application/json' }, previewHeaders),
        body: JSON.stringify({}),
      }, SCAN_TIMEOUT_MS);
      if (!r.ok) {
        renderError(target, await failureMessage(r, 'The snapshot'));
        return null;
      }
      payload = await r.json();
    } catch (e) {
      renderError(target, isTimeout(e)
        ? 'The snapshot took too long and was stopped. Try again in a minute.'
        : 'Network error reaching Telemetry.');
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
