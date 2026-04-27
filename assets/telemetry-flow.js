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
      `Telemetry snapshot · expires in ${minsLeft != null ? minsLeft : '—'} min`));

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

    const statusBar = el('div', 'mt-6 flex items-center gap-3 text-sm text-muted', null);
    const spinner = el('span', 'inline-block h-3 w-3 rounded-full bg-accent animate-pulse');
    statusBar.appendChild(spinner);
    statusBar.id = 'flow-status';
    statusBar.appendChild(el('span', null, 'Awaiting payment…'));
    wrap.appendChild(statusBar);

    target.appendChild(wrap);
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function updateStatus(target, message, tone) {
    const bar = target.querySelector('#flow-status');
    if (!bar) return;
    bar.innerHTML = '';
    const dotColor = tone === 'good' ? 'bg-good' : tone === 'bad' ? 'bg-bad' : 'bg-accent';
    const dot = el('span', 'inline-block h-3 w-3 rounded-full ' + dotColor + (tone ? '' : ' animate-pulse'));
    bar.appendChild(dot);
    bar.appendChild(el('span', null, message));
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
      cell.appendChild(el('div', 'font-medium break-all', String(v)));
      grid.appendChild(cell);
    });
    return grid;
  }

  function renderSupplyCard(supply) {
    const card = sectionCard('Supply');
    card.appendChild(kvGrid([
      ['Total XRP',                     fmtXrpAmount(supply.total_xrp)],
      ['Dormant',                       fmtXrpAmount(supply.dormant_xrp)],
      ['Escrowed',                      fmtXrpAmount(supply.escrowed_xrp)],
      ['HODL wave',                     fmtPct(supply.hodl_wave_pct)],
      ['24h exchange outflow',          fmtXrpAmount(supply.exchange_outflow_24h_xrp)],
      ['Escrow release ÷ relock ratio', fmtRatio(supply.escrow_release_vs_relock_ratio)],
    ], 3));
    return card;
  }

  function renderLiquidityCard(liquidity) {
    const card = sectionCard('Regional liquidity (24h)');
    const table = el('div', 'overflow-x-auto');
    const inner = el('div', 'min-w-full');
    const header = el('div', 'grid grid-cols-5 gap-3 text-xs text-muted uppercase tracking-wider pb-2 border-b border-border');
    ['Region', 'Inflow', 'Outflow', 'Net', 'Top venues'].forEach(h => header.appendChild(el('div', null, h)));
    inner.appendChild(header);
    (liquidity || []).forEach(row => {
      const r = el('div', 'grid grid-cols-5 gap-3 py-2 border-b border-border/50 text-sm items-start');
      r.appendChild(el('div', 'font-mono', row.region));
      r.appendChild(el('div', null, fmtXrpAmount(row.inflow_24h_xrp)));
      r.appendChild(el('div', null, fmtXrpAmount(row.outflow_24h_xrp)));
      const netClass = Number(row.net_flow_24h_xrp) >= 0 ? 'text-good' : 'text-bad';
      r.appendChild(el('div', netClass, (Number(row.net_flow_24h_xrp) >= 0 ? '+' : '') + fmtXrpAmount(row.net_flow_24h_xrp)));
      const venuesCell = el('div', 'flex flex-wrap gap-1');
      (row.top_venues || []).forEach(v => venuesCell.appendChild(el('span', 'font-mono text-[11px] bg-ink border border-border rounded px-1.5 py-0.5', v)));
      r.appendChild(venuesCell);
      inner.appendChild(r);
    });
    table.appendChild(inner);
    card.appendChild(table);
    return card;
  }

  function renderAmmCard(amm) {
    const card = sectionCard('AMM');
    const wrap = el('div', 'grid md:grid-cols-2 gap-6');

    const pairsCol = el('div');
    pairsCol.appendChild(el('div', 'text-xs uppercase tracking-wider text-muted mb-2', 'Top pairs'));
    (amm.pairs || []).forEach(p => {
      const row = el('div', 'flex items-center justify-between gap-3 py-2 border-b border-border/50 text-sm');
      row.appendChild(el('div', 'font-mono', p.pair));
      const right = el('div', 'flex items-center gap-4 text-xs text-muted');
      right.appendChild(el('span', null, 'TVL ' + fmtUsd(p.tvl_usd, 0)));
      right.appendChild(el('span', null, '1% depth ' + fmtXrpAmount(p.depth_1pct_xrp)));
      right.appendChild(el('span', 'text-white font-medium', fmtPctRaw(p.apr_pct) + ' APR'));
      row.appendChild(right);
      pairsCol.appendChild(row);
    });
    wrap.appendChild(pairsCol);

    const vaultsCol = el('div');
    vaultsCol.appendChild(el('div', 'text-xs uppercase tracking-wider text-muted mb-2', 'Vaults'));
    (amm.vaults || []).forEach(v => {
      const row = el('div', 'flex items-center justify-between gap-3 py-2 border-b border-border/50 text-sm');
      row.appendChild(el('div', 'font-mono', v.asset));
      const right = el('div', 'flex items-center gap-4 text-xs text-muted');
      right.appendChild(el('span', null, 'TVL ' + fmtXrpAmount(v.tvl_xrp_equivalent)));
      right.appendChild(el('span', null, 'util ' + fmtPctRaw(v.utilization_pct)));
      right.appendChild(el('span', 'text-white font-medium', fmtPctRaw(v.supply_apy_pct) + ' APY'));
      row.appendChild(right);
      vaultsCol.appendChild(row);
    });
    wrap.appendChild(vaultsCol);

    card.appendChild(wrap);
    return card;
  }

  function renderUtilityFloorCard(uf) {
    const card = sectionCard('Utility floor');
    card.appendChild(kvGrid([
      ['Baseline',         fmtUsd(uf.baseline_usd, 4) + ' / XRP'],
      ['Liquid supply (P)', fmtXrpAmount(uf.available_liquid_supply_xrp)],
      ['Volume (Q)',        fmtUsd(uf.q_assumed_usd, 0)],
      ['Velocity (V)',      Number(uf.v_assumed).toFixed(2)],
    ], 4));
    card.appendChild(el('div', 'text-xs text-muted mt-3 leading-relaxed', 'M = Q ÷ (V × P) — implied USD per XRP at the assumed institutional volume and velocity.'));
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
    if (payload.supply)        stack.appendChild(renderSupplyCard(payload.supply));
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
            updateStatus(target, 'Payment received. Building snapshot…', 'good');
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
        return;
      }
      quote = await r.json();
    } catch (e) {
      renderError(target, 'Network error requesting quote.');
      return;
    }

    let cancelled = false;
    renderPayment(target, quote, () => { cancelled = true; updateStatus(target, 'Cancelled by user.', 'bad'); });

    const payload = await pollUntilPaid(target, quote.invoice_id, () => cancelled);
    if (payload) renderResults(target, payload, quote.invoice_id);
  }

  global.XRTelemetryScan = { start: startTelemetryFlow, renderResults: renderResults };
})(window);
