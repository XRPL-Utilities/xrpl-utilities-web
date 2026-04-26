// Shared payment + polling + results rendering for /sentinel/ and /sentinel/bulk/.
// Pure ES2018, no framework. Loads QR generation from a CDN (window.QRCode).

(function (global) {
  'use strict';

  const API_BASE = 'https://sentinel.xrpl-utilities.io';
  const POLL_INTERVAL_MS = 5000;
  const POLL_TIMEOUT_MS = 35 * 60 * 1000; // 35 min, slightly past invoice expiry

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function fmtXrp(s) { return s + ' XRP'; }

  function levelBadgeClass(level) {
    const m = { Low: 'badge-low', Medium: 'badge-medium', High: 'badge-high', Dormant: 'badge-dormant', Unknown: 'badge-unknown' };
    return m[level] || 'badge-unknown';
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
    wrap.appendChild(el('h3', 'text-3xl font-bold mb-1', fmtXrp(quote.amount_xrp)));
    wrap.appendChild(el('div', 'text-muted text-sm mb-6',
      `${quote.address_count} ${quote.address_count === 1 ? 'address' : 'addresses'} · $${(quote.address_count * 0.10).toFixed(2)} USD at $${quote.xrp_usd_at_quote.toFixed(4)}/XRP · expires in ${Math.round(quote.expires_in_seconds / 60)} min`));

    // Primary action: deep link button
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

    // QR code + manual instructions
    const grid = el('div', 'grid md:grid-cols-2 gap-6 items-start');
    const qrCol = el('div');
    qrCol.appendChild(el('div', 'text-xs uppercase tracking-wider text-muted mb-2', 'Scan with Xaman / mobile wallet'));
    const qrBox = el('div', 'bg-white p-4 rounded-lg inline-block');
    const qrCanvas = el('canvas');
    qrBox.appendChild(qrCanvas);
    qrCol.appendChild(qrBox);
    grid.appendChild(qrCol);

    if (global.QRCode && typeof global.QRCode.toCanvas === 'function') {
      global.QRCode.toCanvas(qrCanvas, quote.deep_link, { width: 192, margin: 0, color: { dark: '#000000', light: '#ffffff' } }).catch(() => {
        qrCol.appendChild(el('div', 'text-xs text-muted mt-2', 'QR rendering unavailable; use manual instructions →'));
      });
    } else {
      qrCol.appendChild(el('div', 'text-xs text-muted mt-2', 'QR rendering unavailable; use manual instructions →'));
    }

    const manualCol = el('div', 'space-y-3');
    manualCol.appendChild(el('div', 'text-xs uppercase tracking-wider text-muted mb-2', 'Or send manually from any XRPL wallet'));
    [
      ['Recipient',          quote.recipient],
      ['Amount (XRP)',       quote.amount_xrp],
      ['Destination Tag',    String(quote.destination_tag)],
    ].forEach(([k, v]) => {
      const row = el('div', 'bg-ink border border-border rounded-lg p-3 flex items-center justify-between gap-3');
      const left = el('div', 'flex-grow min-w-0');
      left.appendChild(el('div', 'text-xs text-muted', k));
      left.appendChild(el('div', 'font-mono text-sm break-all', v));
      row.appendChild(left);
      row.appendChild(copyButton(v));
      manualCol.appendChild(row);
    });
    manualCol.appendChild(el('div', 'text-xs text-muted leading-relaxed mt-2', 'The destination tag is required so we can match your payment to this scan request. Payments without the correct tag are not credited automatically.'));
    grid.appendChild(manualCol);
    wrap.appendChild(grid);

    // Status indicator
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

  function renderReport(report) {
    const isError = report.error;
    const card = el('div', 'bg-panel border border-border rounded-2xl p-6');

    const head = el('div', 'flex items-start justify-between gap-4 mb-4');
    const left = el('div', 'min-w-0');
    left.appendChild(el('div', 'text-xs text-muted mb-1', 'Address'));
    left.appendChild(el('div', 'font-mono text-sm break-all', report.address || '(unknown)'));
    head.appendChild(left);

    if (!isError) {
      const right = el('div', 'flex items-center gap-3 shrink-0');
      right.appendChild(el('span', 'border ' + levelBadgeClass(report.activity_level) + ' rounded-full px-3 py-1 text-xs font-semibold', report.activity_level));
      const score = el('span', 'text-2xl font-bold', String(report.activity_score));
      const scoreSuffix = el('span', 'text-muted text-sm', '/100');
      score.appendChild(scoreSuffix);
      right.appendChild(score);
      head.appendChild(right);
    } else {
      head.appendChild(el('span', 'text-xs uppercase tracking-wider text-red-400', report.error));
    }
    card.appendChild(head);

    if (isError) {
      card.appendChild(el('p', 'text-sm text-muted', report.detail || 'No detail available.'));
      return card;
    }

    const meta = el('div', 'grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4 text-sm');
    [
      ['Confidence', report.confidence],
      ['Window', (report.window_days || 90) + ' days'],
      ['Tx in window', report.transaction_count],
      ['Signals', (report.signals || []).length],
    ].forEach(([k, v]) => {
      const cell = el('div');
      cell.appendChild(el('div', 'text-xs text-muted mb-0.5', k));
      cell.appendChild(el('div', 'font-medium', String(v)));
      meta.appendChild(cell);
    });
    card.appendChild(meta);

    if ((report.signals || []).length) {
      card.appendChild(el('div', 'text-xs text-muted uppercase tracking-wider mb-2', 'Signals'));
      const pills = el('div', 'flex flex-wrap gap-2 mb-4');
      report.signals.forEach(s => pills.appendChild(el('span', 'font-mono text-xs bg-ink border border-border rounded px-2 py-1', s)));
      card.appendChild(pills);
    }

    if (report.reasoning) {
      card.appendChild(el('div', 'text-xs text-muted uppercase tracking-wider mb-2', 'Reasoning'));
      card.appendChild(el('p', 'text-white text-sm leading-relaxed', report.reasoning));
    }
    return card;
  }

  function downloadJsonButton(filename, dataObj) {
    const btn = el('button', 'border border-border hover:border-accent text-white text-sm px-4 py-2 rounded-lg transition');
    btn.type = 'button';
    btn.textContent = 'Download JSON';
    btn.addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(dataObj, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
    return btn;
  }

  function renderResults(target, results) {
    target.innerHTML = '';
    const summary = el('div', 'bg-panel border border-border rounded-2xl p-6 mb-4');
    const top = el('div', 'flex items-center justify-between gap-4 mb-2');
    const heading = el('div');
    heading.appendChild(el('div', 'text-xs uppercase tracking-widest text-good font-semibold mb-1', 'Complete'));
    heading.appendChild(el('h3', 'text-2xl font-bold', `${results.scans_complete} of ${results.scans_total} scans`));
    top.appendChild(heading);
    top.appendChild(downloadJsonButton(`xr-sentinel-${results.invoice_id}.json`, results));
    summary.appendChild(top);
    summary.appendChild(el('div', 'text-xs text-muted', 'Invoice ' + results.invoice_id));
    target.appendChild(summary);

    const list = el('div', 'space-y-3');
    (results.reports || []).forEach(r => list.appendChild(renderReport(r)));
    target.appendChild(list);

    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderScanning(target, status) {
    target.replaceChildren();
    const wrap = el('div', 'bg-panel border-2 border-accent rounded-2xl p-8');
    wrap.appendChild(el('div', 'text-xs uppercase tracking-widest text-good font-semibold mb-2', '✓ Payment received'));
    wrap.appendChild(el('h3', 'text-3xl md:text-4xl font-bold mb-2', 'Scanning your wallets'));
    wrap.appendChild(el('p', 'text-muted mb-8', 'Building reports — keep this tab open. Should take under a minute per wallet.'));

    const total = status.scans_total || 1;
    const done = status.scans_complete || 0;

    const counterRow = el('div', 'flex items-end justify-between mb-3');
    const counter = el('div', 'text-4xl md:text-5xl font-bold');
    counter.id = 'flow-counter';
    counter.textContent = `${done} / ${total}`;
    counterRow.appendChild(counter);
    counterRow.appendChild(el('div', 'text-muted text-sm pb-2', 'wallets scanned'));
    wrap.appendChild(counterRow);

    const trackWrap = el('div', 'bg-ink border border-border rounded-full h-4 overflow-hidden');
    const bar = el('div', 'bg-accent h-full transition-all duration-700 rounded-full');
    bar.id = 'flow-progress';
    bar.style.width = Math.max(3, Math.round((done / total) * 100)) + '%';
    trackWrap.appendChild(bar);
    wrap.appendChild(trackWrap);

    target.appendChild(wrap);
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function updateScanningProgress(target, status) {
    const bar = target.querySelector('#flow-progress');
    const counter = target.querySelector('#flow-counter');
    const total = status.scans_total || 1;
    const done = status.scans_complete || 0;
    if (bar) bar.style.width = Math.max(3, Math.round((done / total) * 100)) + '%';
    if (counter) counter.textContent = `${done} / ${total}`;
  }

  async function pollUntilDone(target, invoiceId, getCancelled) {
    const originalTitle = document.title;
    let scanningShown = false;
    const restore = () => { document.title = originalTitle; };

    const start = Date.now();
    while (Date.now() - start < POLL_TIMEOUT_MS) {
      if (getCancelled()) { restore(); return null; }
      try {
        const r = await fetch(`${API_BASE}/bulk/status/${invoiceId}`);
        if (r.status === 404) {
          updateStatus(target, 'Invoice not found (may have expired)', 'bad');
          restore();
          return null;
        }
        const status = await r.json();
        if (status.state === 'awaiting_payment') {
          updateStatus(target, 'Awaiting payment…');
          document.title = '⏳ Awaiting payment · XR-Sentinel';
        } else if (status.state === 'paid' || status.state === 'scanning') {
          if (!scanningShown) { renderScanning(target, status); scanningShown = true; }
          else { updateScanningProgress(target, status); }
          document.title = `[${status.scans_complete}/${status.scans_total}] Scanning · XR-Sentinel`;
        } else if (status.state === 'complete') {
          document.title = '✓ Scans complete · XR-Sentinel';
          const rr = await fetch(`${API_BASE}/bulk/results/${invoiceId}`);
          if (rr.ok) { setTimeout(restore, 5000); return await rr.json(); }
          if (scanningShown) { updateStatus(target, 'Could not fetch results', 'bad'); }
          else { renderError(target, 'Could not fetch results — try refreshing.'); }
          restore();
          return null;
        } else if (status.state === 'failed') {
          renderError(target, 'Scan job failed: ' + (status.error || 'unknown'));
          restore();
          return null;
        } else if (status.state === 'expired') {
          renderError(target, 'Invoice expired without payment. Generate a fresh quote and try again.');
          restore();
          return null;
        }
      } catch (e) {
        // transient — keep polling
      }
      await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
    }
    updateStatus(target, 'Polling timeout — scan may still complete; check back later.', 'bad');
    restore();
    return null;
  }

  async function startScanFlow(target, addresses) {
    if (!Array.isArray(addresses) || addresses.length === 0) {
      renderError(target, 'No addresses provided.');
      return;
    }
    target.innerHTML = '';
    target.appendChild(el('div', 'bg-panel border border-border rounded-2xl p-6 text-muted', 'Requesting quote…'));
    let quote;
    try {
      const r = await fetch(`${API_BASE}/bulk/quote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ addresses }),
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

    const results = await pollUntilDone(target, quote.invoice_id, () => cancelled);
    if (results) renderResults(target, results);
  }

  global.XRSentinelScan = { start: startScanFlow };
})(window);
