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

  // Plain-English caption for the activity level so first-time readers
  // see immediately that "High" is a behavioral classification, not a
  // risk score. Vocabulary mirrors the long-form disclaimer at the
  // bottom of /sentinel/.
  function levelMeaning(level) {
    const m = {
      High:    'Bot / Exchange / AMM Cadence',
      Medium:  'Active Wallet — Mixed Cadence',
      Low:     'Occasional Retail-Pattern Activity',
      Dormant: 'Inactive — No Recent On-Chain Activity',
      Unknown: 'Insufficient Data to Classify',
    };
    return m[level] || '';
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
    const qrBox = el('div', 'bg-white p-3 rounded-lg inline-block');
    const qrImg = document.createElement('img');
    qrImg.alt = 'XRPL payment QR code';
    qrImg.width = 192;
    qrImg.height = 192;
    qrImg.style.display = 'block';
    qrImg.src =
      'https://api.qrserver.com/v1/create-qr-code/?size=192x192&margin=0&data=' +
      encodeURIComponent(quote.deep_link);
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

    // Status banner - prominent so visitors don't miss it on mobile
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

  function renderReport(report) {
    const isError = report.error;
    const card = el('div', 'bg-panel border border-border rounded-2xl p-6');

    // Identity banner (only renders when XRPScan has labeled the address).
    // Surfaced from /scan response's top-level `identity` block (schema 2.4.0+).
    // Renders display_name, watchlist role pill, verified badge, and optional
    // domain. Hidden cleanly for unlabeled wallets so retail addresses don't
    // get a half-empty header.
    if (!isError && report.identity && report.identity.labeled) {
      const id = report.identity;
      const banner = el('div', 'flex flex-wrap items-center gap-2 mb-4 pb-3 border-b border-border');
      banner.appendChild(el('div', 'text-xs text-muted uppercase tracking-wider mr-1', 'Identity'));
      banner.appendChild(el('span', 'font-semibold text-white text-base', id.display_name));
      if (id.role) {
        banner.appendChild(el('span', 'border border-accent/40 text-accent text-xs uppercase tracking-wider px-2 py-0.5 rounded', id.role));
      }
      if (id.verified) {
        banner.appendChild(el('span', 'text-xs text-green-400', '✓ Verified'));
      }
      if (id.domain) {
        banner.appendChild(el('span', 'font-mono text-xs text-muted', id.domain));
      }
      // Surface XRPScan advisory in the identity banner so a viewer who
      // only skims the header still sees the warning. The TARGET_ADVISORY
      // signal in the signals list also covers it, but identity-banner
      // placement is much harder to miss. Tooltip carries the full
      // provider/category/trusted shape so an analyst can judge weight
      // (CHAINABUSE phishing reports against a verified exchange wallet
      // are typically `trusted: false` and represent a depositor losing
      // funds upstream, not the exchange itself being compromised).
      if (id.advisory) {
        const adv = id.advisory;
        const cat = adv.scamCategory || adv.report?.scamCategory || adv.type || 'advisory';
        const provider = adv.provider || adv.report?.provider || 'unknown';
        const trusted = (adv.trusted ?? adv.report?.trusted) === true ? 'trusted' : 'untrusted reporter';
        const tip = `${provider} ${cat.toLowerCase()} report (${trusted}). Source: XRPScan advisory.`;
        const pill = el('span', 'border border-red-500/50 text-red-300 text-xs uppercase tracking-wider px-2 py-0.5 rounded font-semibold');
        pill.title = tip;
        pill.textContent = '⚠ ' + cat.toLowerCase();
        banner.appendChild(pill);
      }
      banner.appendChild(el('span', 'text-xs text-muted ml-auto', 'via XRPScan'));
      card.appendChild(banner);
    }

    const head = el('div', 'flex items-start justify-between gap-4 mb-4');
    const left = el('div', 'min-w-0');
    left.appendChild(el('div', 'text-xs text-muted mb-1', 'Address'));
    left.appendChild(el('div', 'font-mono text-sm break-all', report.address || '(unknown)'));
    head.appendChild(left);

    if (!isError) {
      const right = el('div', 'flex flex-col items-end gap-1 shrink-0');
      const rightTop = el('div', 'flex items-center gap-3');
      rightTop.appendChild(el('span', 'border ' + levelBadgeClass(report.activity_level) + ' rounded-full px-3 py-1 text-xs font-semibold', report.activity_level));
      const score = el('span', 'text-2xl font-bold', String(report.activity_score));
      const scoreSuffix = el('span', 'text-muted text-sm', '/100');
      score.appendChild(scoreSuffix);
      rightTop.appendChild(score);
      right.appendChild(rightTop);
      const meaning = levelMeaning(report.activity_level);
      if (meaning) {
        right.appendChild(el('div', 'text-xs text-muted text-right max-w-[200px] leading-snug', meaning));
      }
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

    // Trajectory block. Renders only when the API response carries a
    // _delta block (Sentinel populates it when the address has a prior
    // recorded scan). For stable institutional wallets the deltas are
    // typically zero / null between back-to-back scans, so a row of
    // "+0 / — / +0 / +0" reads as "broken" rather than "no drift".
    // Branch on whether anything actually moved: if not, render a
    // single-line "no detected drift" framing with the prior anchor.
    // If yes, render the four-cell directional grid.
    const delta = report._delta;
    if (delta && typeof delta === 'object') {
      const trajWrap = el('div', 'bg-ink border border-border rounded-lg p-4 mb-4');
      const head = el('div', 'flex items-baseline justify-between mb-3');
      head.appendChild(el('div', 'text-xs uppercase tracking-wider text-accent font-semibold', 'Since prior scan'));
      const since = (delta.hours_since_prior_scan != null)
        ? (delta.hours_since_prior_scan + 'h ago')
        : '';
      if (since) head.appendChild(el('div', 'text-xs text-muted', since));
      trajWrap.appendChild(head);

      const score = delta.score_delta;
      const txc = delta.tx_count_delta;
      const cad = delta.median_seconds_between_tx_delta;
      const lvl = delta.level_change;
      const movedNumeric = (typeof score === 'number' && score !== 0)
                       || (typeof txc === 'number'   && txc   !== 0)
                       || (typeof cad === 'number'   && cad   !== 0);
      const movedLevel = (lvl != null && lvl !== '');
      const moved = movedNumeric || movedLevel;

      if (!moved) {
        // No-drift path: anchor the panel with current score + level so
        // it's clearly "scan ran and matched the prior read" rather than
        // "panel is empty / data missing".
        const line = el('div', 'text-sm text-muted leading-relaxed');
        const stableNote = el('span', '', 'No detected drift. ');
        const anchor = el('span', 'text-white');
        const anchorParts = [];
        if (typeof report.activity_score === 'number') {
          anchorParts.push('Score ' + report.activity_score + ' (unchanged)');
        }
        if (report.activity_level) {
          anchorParts.push('Level ' + report.activity_level + ' (unchanged)');
        }
        if (typeof report.transaction_count === 'number') {
          anchorParts.push(report.transaction_count.toLocaleString() + ' tx (unchanged)');
        }
        anchor.textContent = anchorParts.join(' · ');
        line.appendChild(stableNote);
        line.appendChild(anchor);
        trajWrap.appendChild(line);
      } else {
        const cells = el('div', 'grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm');
        function deltaCell(label, value, opts) {
          opts = opts || {};
          const c = el('div');
          c.appendChild(el('div', 'text-xs text-muted mb-0.5', label));
          if (value == null || (typeof value === 'number' && value === 0)) {
            c.appendChild(el('div', 'font-medium text-muted', value == null ? '—' : '0'));
            return c;
          }
          // Positive = "more automated / more activity" - Sentinel narrates
          // this as tone-good for analysts watching bot onboarding etc, but
          // it's neutral information, not "good for the user". Accent (blue)
          // for positive moves, muted-red for negative so the directional
          // cue is clear without implying moral valence.
          let tone = 'text-white';
          let arrow = '';
          if (opts.directional && typeof value === 'number') {
            if (value > 0) { tone = 'text-accent'; arrow = '↑ '; }
            else if (value < 0) { tone = 'text-red-400'; arrow = '↓ '; }
          }
          const sign = (typeof value === 'number' && value > 0) ? '+' : '';
          const display = (typeof value === 'number')
            ? (arrow + sign + value)
            : String(value);
          c.appendChild(el('div', 'font-medium ' + tone, display));
          return c;
        }
        cells.appendChild(deltaCell('Score Δ', score, { directional: true }));
        cells.appendChild(deltaCell('Level', lvl));
        cells.appendChild(deltaCell('Tx count Δ', txc, { directional: true }));
        // Negative cadence delta = tighter cadence (faster). For the
        // analyst this is the "interesting" direction so flip the tone:
        // negative renders accent (notable), positive renders muted-red
        // (cadence loosened).
        const cadenceCell = el('div');
        cadenceCell.appendChild(el('div', 'text-xs text-muted mb-0.5', 'Cadence Δ (s)'));
        if (cad == null || cad === 0) {
          cadenceCell.appendChild(el('div', 'font-medium text-muted', cad == null ? '—' : '0'));
        } else {
          const tighter = cad < 0;
          const tone = tighter ? 'text-accent' : 'text-red-400';
          const arrow = tighter ? '↓ ' : '↑ ';
          const sign = cad > 0 ? '+' : '';
          cadenceCell.appendChild(el('div', 'font-medium ' + tone, arrow + sign + cad));
        }
        cells.appendChild(cadenceCell);
        trajWrap.appendChild(cells);
      }
      // One-line legend defining each metric so the abbreviated cell
      // labels (Score Δ, Cadence Δ, etc.) read clearly without a hover.
      // Applies to both drift and no-drift renderings - the metrics
      // themselves are the same regardless of whether they moved.
      const legend = el(
        'div',
        'text-xs text-muted mt-3 leading-relaxed',
        'Score (0-100 activity index) · Level (behavior band) · ' +
          'Tx count (transactions in scan window) · ' +
          'Cadence (median seconds between transactions, lower = tighter)',
      );
      trajWrap.appendChild(legend);
      card.appendChild(trajWrap);
    }

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
    // Optional second narrative block, only present when the target wallet
    // is a token issuer (Sentinel schema 2.5.0+). Sourced exclusively from
    // on-chain account_info + gateway_balances + the XRPScan domain - no
    // off-ledger context. Rendered with a margin-top so it visually pairs
    // with Reasoning rather than blending into it.
    if (report.issuer_profile) {
      card.appendChild(el('div', 'text-xs text-muted uppercase tracking-wider mb-2 mt-4', 'Issuer profile'));
      card.appendChild(el('p', 'text-white text-sm leading-relaxed', report.issuer_profile));
    }
    return card;
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

  function csvEscape(v) {
    if (v == null) return '';
    let s = String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function reportsToCsv(reports) {
    const cols = ['address', 'activity_level', 'activity_score', 'confidence', 'window_days', 'transaction_count', 'signals', 'reasoning', 'error', 'error_detail'];
    const rows = [cols.join(',')];
    (reports || []).forEach(r => {
      rows.push([
        csvEscape(r.address),
        csvEscape(r.activity_level),
        csvEscape(r.activity_score),
        csvEscape(r.confidence),
        csvEscape(r.window_days),
        csvEscape(r.transaction_count),
        csvEscape((r.signals || []).join('; ')),
        csvEscape(r.reasoning),
        csvEscape(r.error),
        csvEscape(r.detail),
      ].join(','));
    });
    return rows.join('\n') + '\n';
  }

  function renderResults(target, results) {
    target.innerHTML = '';
    const summary = el('div', 'bg-panel border border-border rounded-2xl p-6 mb-4');
    const top = el('div', 'flex items-center justify-between gap-4 mb-2');
    const heading = el('div');
    heading.appendChild(el('div', 'text-xs uppercase tracking-widest text-good font-semibold mb-1', 'Complete'));
    heading.appendChild(el('h3', 'text-2xl font-bold', `${results.scans_complete} of ${results.scans_total} scans`));
    top.appendChild(heading);
    const downloads = el('div', 'flex gap-2 shrink-0');
    downloads.appendChild(downloadButton(
      'CSV',
      `xr-sentinel-${results.invoice_id}.csv`,
      'text/csv;charset=utf-8',
      reportsToCsv(results.reports)
    ));
    downloads.appendChild(downloadButton(
      'JSON',
      `xr-sentinel-${results.invoice_id}.json`,
      'application/json',
      JSON.stringify(results, null, 2)
    ));
    top.appendChild(downloads);
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
    wrap.appendChild(el('p', 'text-muted mb-8', 'Building reports. Keep this tab open. Should take under a minute per wallet.'));

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
          else { renderError(target, 'Could not fetch results. Try refreshing.'); }
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
        // transient; keep polling
      }
      await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
    }
    updateStatus(target, 'Polling timeout. Scan may still complete; check back later.', 'bad');
    restore();
    return null;
  }

  // Free single-wallet scan path. Marketing site posts /scan directly
  // (no x402 dance) and the backend's web-origin check returns the
  // report without taking payment. Bulk scans (startScanFlow below)
  // remain paid via /bulk/quote -> /bulk/results.
  async function startSingleScan(target, address) {
    target.replaceChildren();
    const wrap = el('div', 'bg-panel border-2 border-accent rounded-2xl p-8');
    const header = el('div', 'flex items-center gap-3 mb-2');
    header.appendChild(el('span', 'scanning-pulse'));
    header.appendChild(el('div', 'text-xs uppercase tracking-widest text-accent font-semibold', 'Scanning live ledger'));
    wrap.appendChild(header);
    wrap.appendChild(el('h3', 'text-2xl md:text-3xl font-bold mb-6', 'Reading 90 days of on-chain activity'));
    const stack = el('div', 'space-y-3');
    ['Activity', 'Signals', 'Reasoning'].forEach(label => {
      const card = el('div', 'bg-ink border border-border rounded-lg p-4');
      card.appendChild(el('div', 'text-xs uppercase tracking-wider text-muted font-semibold mb-3', label));
      const blocks = el('div', 'space-y-2');
      blocks.appendChild(el('div', 'skeleton-bar h-3 w-full'));
      blocks.appendChild(el('div', 'skeleton-bar h-3 w-3/4'));
      card.appendChild(blocks);
      stack.appendChild(card);
    });
    wrap.appendChild(stack);
    target.appendChild(wrap);
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });

    let report;
    try {
      const previewHeaders = await (global.PreviewToken
        ? global.PreviewToken.authHeaders()
        : Promise.resolve({}));
      const r = await fetch(`${API_BASE}/scan`, {
        method: 'POST',
        headers: Object.assign({ 'Content-Type': 'application/json' }, previewHeaders),
        body: JSON.stringify({ address }),
      });
      if (!r.ok) {
        let detail = '';
        try { const e = await r.json(); detail = e.detail || JSON.stringify(e); } catch (_) {}
        renderError(target, detail || `Scan failed (HTTP ${r.status}).`);
        return null;
      }
      report = await r.json();
    } catch (e) {
      renderError(target, 'Network error reaching the scanner.');
      return null;
    }

    target.replaceChildren();
    const summary = el('div', 'bg-panel border border-border rounded-2xl p-6 mb-4');
    const top = el('div', 'flex items-center justify-between gap-4 mb-2');
    const heading = el('div');
    heading.appendChild(el('div', 'text-xs uppercase tracking-widest text-good font-semibold mb-1', 'Complete'));
    heading.appendChild(el('h3', 'text-2xl font-bold', 'Scan report'));
    top.appendChild(heading);
    const downloads = el('div', 'flex gap-2 shrink-0');
    downloads.appendChild(downloadButton(
      'JSON',
      'xr-sentinel-' + (report.address || 'scan') + '.json',
      'application/json',
      JSON.stringify(report, null, 2),
    ));
    top.appendChild(downloads);
    summary.appendChild(top);
    target.appendChild(summary);
    target.appendChild(renderReport(report));
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return report;
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
      const previewHeaders = await (global.PreviewToken
        ? global.PreviewToken.authHeaders()
        : Promise.resolve({}));
      const r = await fetch(`${API_BASE}/bulk/quote`, {
        method: 'POST',
        headers: Object.assign({ 'Content-Type': 'application/json' }, previewHeaders),
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

  global.XRSentinelScan = {
    start: startScanFlow,        // bulk: /bulk/quote -> /bulk/results (paid)
    startSingle: startSingleScan, // single: /scan direct (free for .com origin)
  };
})(window);
