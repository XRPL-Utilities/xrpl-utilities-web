// Mobile nav. Same logic as the other XR-* pages.
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
  window.addEventListener('resize', () => { if (window.innerWidth >= 768) close(); });
})();

const API_BASE = 'https://pulse.xrpl-utilities.io';

// Display helpers. Native units only, no USD conversion. Large
// amounts get a compact form (1.23M, 4.56K). Small fractional
// values render with up to 4 decimals. Zero stays zero.
function fmtNumber(n) {
  const num = typeof n === 'string' ? parseFloat(n) : n;
  if (!isFinite(num) || num === 0) return '0';
  const abs = Math.abs(num);
  if (abs >= 1_000_000_000) return (num / 1_000_000_000).toFixed(2).replace(/\.?0+$/, '') + 'B';
  if (abs >= 1_000_000)     return (num / 1_000_000).toFixed(2).replace(/\.?0+$/, '') + 'M';
  if (abs >= 10_000)        return (num / 1_000).toFixed(1).replace(/\.?0+$/, '') + 'K';
  if (abs >= 1)             return num.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return num.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

// Human-readable label for an asset_class slug. Returns short upper-
// case text that fits the pill width. Longer aliases (e.g.
// "BRL stablecoin") are spelled out so a lay reader doesn't have to
// decode "fiat_stable_brl" or guess what MMF stands for.
function fmtAssetClass(c) {
  const map = {
    treasuries:        'TREASURIES',
    fiat_stable_usd:   'USD STABLE',
    fiat_stable_eur:   'EUR STABLE',
    fiat_stable_brl:   'BRL STABLE',
    fiat_stable_aud:   'AUD STABLE',
    commercial_paper:  'C-PAPER',
    money_market:      'MMF',
    commodity_energy:  'ENERGY',
    commodity:         'COMMODITY',
    private_credit:    'PVT CREDIT',
    structured_product: 'STRUCTURED',
    gateway_iou:       'GATEWAY IOU',
    real_estate:       'REAL ESTATE',
  };
  return map[c] || (c || '').toUpperCase();
}

function fmtAddrShort(addr) {
  if (!addr || addr.length <= 12) return addr || '';
  return addr.slice(0, 6) + '..' + addr.slice(-4);
}

function fmtRelative(ts) {
  if (!ts) return '';
  const diff = (Date.now() / 1000) - ts;
  if (diff < 60)        return Math.max(1, Math.floor(diff)) + 's ago';
  if (diff < 3600)      return Math.floor(diff / 60) + 'm ago';
  if (diff < 86400)     return Math.floor(diff / 3600) + 'h ago';
  return Math.floor(diff / 86400) + 'd ago';
}

function deltaClass(value) {
  const n = typeof value === 'string' ? parseFloat(value) : value;
  if (!isFinite(n) || n === 0) return 'delta-zero';
  return n > 0 ? 'delta-positive' : 'delta-negative';
}

function deltaSign(value) {
  const n = typeof value === 'string' ? parseFloat(value) : value;
  if (!isFinite(n) || n === 0) return '';
  return n > 0 ? '+' : '';
}

function renderIssuerActivityChips(i) {
  const esc = i.token_escrow_24h || {};
  const df  = i.deepfreeze_24h || {};
  const escCount = parseInt(esc.count || 0, 10);
  const dvp = parseInt(esc.dvp_candidate_count || 0, 10);
  const dfTx = parseInt(df.tx_count || 0, 10);
  const dfHolders = parseInt(df.unique_holders_count || 0, 10);
  if (!escCount && !dfTx) return '';
  const chips = [];
  if (escCount) {
    const pct = esc.pct_of_net_circulating;
    const pctText = (pct !== null && pct !== undefined) ? ` · ${pct}% of supply` : '';
    chips.push(`<span class="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded border border-amber-500/40 text-amber-300 whitespace-nowrap" title="EscrowCreate/Finish/Cancel on this token in the last 24h${pctText}">${escCount} escrow${escCount === 1 ? '' : 's'}${pctText}</span>`);
  }
  if (dvp) {
    chips.push(`<span class="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded border border-accent/40 text-accent whitespace-nowrap" title="DvP candidates: shared Condition + reciprocal direction within 1h. Candidate not confirmed.">${dvp} DvP candidate${dvp === 1 ? '' : 's'}</span>`);
  }
  if (dfTx) {
    chips.push(`<span class="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded border border-red-500/50 text-red-300 whitespace-nowrap" title="TrustSet with tfSetDeepFreeze fired by this issuer in the last 24h. Deep-freeze blocks both send and receive.">${dfHolders} deep-frozen holder${dfHolders === 1 ? '' : 's'}</span>`);
  }
  return `<div class="flex flex-wrap gap-1.5 mt-3">${chips.join('')}</div>`;
}

async function loadSummary() {
  try {
    const r = await fetch(`${API_BASE}/stats/rwa-summary`);
    if (!r.ok) return;
    const body = await r.json();
    if (!body || body.available === false) return;
    _topMoversLastBody = body;
    renderSummary(body);
    applyTopMoversWindow();
    renderIssuerTiles(body.issuers || []);
    renderCandidates(body.candidates || []);
    overlayTokenHealth();
  } catch (err) {
    // Best-effort. Dashboard skeletons stay visible if Pulse is unreachable.
  }
}

function renderSummary(body) {
  const t = body.totals || {};
  const cls = body.by_asset_class || {};
  const trackedEl = document.getElementById('stat-tracked');
  const trackedDetail = document.getElementById('stat-tracked-detail');
  const mintsEl = document.getElementById('stat-mints');
  const burnsEl = document.getElementById('stat-burns');
  const ammEl = document.getElementById('stat-amm-pools');
  const ammDetail = document.getElementById('stat-amm-pools-detail');
  if (trackedEl)     trackedEl.textContent = String(t.tracked_issuers ?? '…');
  if (trackedDetail) {
    const pending = t.candidates_pending ?? 0;
    // dormant is only shown when non-zero so the line stays short in
    // the normal case; it is real outstanding supply that stopped moving,
    // NOT the same thing as rails-only (which never issued at all).
    const dormant = t.dormant_issuers ?? 0;
    const base = `${t.live_issuers ?? 0} live${dormant > 0 ? ` · ${dormant} dormant` : ''} · ${t.rails_only_issuers ?? 0} rails-only`;
    trackedDetail.textContent = pending > 0 ? `${base} · +${pending} unverified` : base;
  }
  if (mintsEl)       mintsEl.textContent = String(t.mints_24h_total ?? 0);
  if (burnsEl)       burnsEl.textContent = String(t.burns_24h_total ?? 0);
  if (ammEl)         ammEl.textContent = String(t.amm_pools_tracked ?? 0);
  if (ammDetail) {
    const classCount = Object.keys(cls).length;
    const base = classCount ? `across ${classCount} asset classes` : 'RWA-touching XLS-30';
    // A bare "20" is a numerator with no denominator -- a reader cannot
    // tell whether that is every pool or a fraction. Pulse now reports how
    // many exist ledger-wide. The gap is deliberate: the unmeasured
    // remainder is overwhelmingly memecoins opening a nominal pair against
    // a regulated ticker, so we count them but do not measure them.
    // null (never readable) is NOT rendered as 0.
    const onLedger = t.amm_pools_on_ledger;
    if (typeof onLedger === 'number' && onLedger > 0) {
      const stale = t.amm_pools_on_ledger_stale ? ' (cached)' : '';
      ammDetail.textContent = `${base} · measured, of ${onLedger} on-ledger${stale}`;
      ammDetail.title =
        'We measure pools with live reserves via a curated per-issuer probe. ' +
        'The ledger-wide count includes every pool holding a tracked issuer\'s ' +
        'token, mostly nominal pairs holding trivial amounts. Count is not exposure.';
    } else {
      ammDetail.textContent = base;
    }
  }

  // USD-pegged aggregate (Pulse 1.62.0). Sum over USD-denominated
  // issuers + treasuries-at-NAV + commercial-paper-at-par + MMF;
  // excluded EUR/BRL/AUD/MWh issuers are surfaced separately so
  // the no-fabricated-USD brand stance is preserved.
  const usdAgg = body.usd_pegged_aggregate || {};
  const usdTotalEl  = document.getElementById('stat-usd-pegged-total');
  const usdDetailEl = document.getElementById('stat-usd-pegged-detail');
  const usdExclEl   = document.getElementById('stat-usd-pegged-excluded-summary');
  if (usdTotalEl) {
    const total = usdAgg.total_usd || 0;
    // Format $1.23B / $456M / $7.8M as appropriate.
    let formatted;
    if (total >= 1e9) formatted = '$' + (total / 1e9).toFixed(2) + 'B';
    else if (total >= 1e6) formatted = '$' + (total / 1e6).toFixed(1) + 'M';
    else if (total >= 1e3) formatted = '$' + (total / 1e3).toFixed(0) + 'K';
    else formatted = '$' + Math.round(total);
    usdTotalEl.textContent = formatted;
  }
  if (usdDetailEl) {
    const inc = usdAgg.issuer_count_included || 0;
    const exc = usdAgg.issuer_count_excluded || 0;
    usdDetailEl.textContent = `${inc} issuer${inc === 1 ? '' : 's'} converted into the total · ${exc} no-peg native issuer${exc === 1 ? '' : 's'} shown separately`;
  }
  if (usdExclEl) {
    const nonUsd = usdAgg.non_usd_pegged_natives || [];
    if (nonUsd.length) {
      const parts = nonUsd.slice(0, 6).map(row => {
        const amt = row.native_amount || 0;
        let fmt;
        if (amt >= 1e9) fmt = (amt / 1e9).toFixed(2) + 'B';
        else if (amt >= 1e6) fmt = (amt / 1e6).toFixed(1) + 'M';
        else if (amt >= 1e3) fmt = (amt / 1e3).toFixed(0) + 'K';
        else fmt = String(Math.round(amt));
        return `${fmt} ${row.currency || '?'}`;
      });
      usdExclEl.textContent = 'Native-unit: ' + parts.join(' · ') + '.';
    } else {
      usdExclEl.textContent = '';
    }
  }
}

// Track current window so the toggle can re-render against the
// last fetched summary body without a second roundtrip. Default to
// 30d because institutional issuers mint in discrete monthly chunks
// that flicker in and out of the 7d window as they cross the rolling
// boundary; 30d smooths that into stable rankings.
let _topMoversWindow = '30d';
let _topMoversLastBody = null;

const _MOVER_NET_FIELD = { '24h': 'net_24h', '7d': 'net_7d', '30d': 'net_30d' };
const _MOVER_LABEL = { '24h': 'net 24h flow', '7d': 'net 7d flow', '30d': 'net 30d flow' };
const _MOVER_EMPTY = {
  '24h': 'No measurable RWA flow in the last 24 hours.',
  '7d':  'No measurable RWA flow in the last 7 days.',
  '30d': 'No measurable RWA flow in the last 30 days.',
};
const _MOVER_PROSE = {
  '24h': "The issuers with the biggest net change in circulating supply over the last 24 hours, in either direction. A positive number means more tokens were minted than burned (capital flowed in); a negative number means more were redeemed than issued (capital flowed out). Ranked by absolute size so a $1M outflow ranks alongside a $1M inflow.",
  '7d':  "The issuers with the biggest net change in circulating supply over the last 7 days, in either direction. A positive number means more tokens were minted than burned (capital flowed in); a negative number means more were redeemed than issued (capital flowed out). Ranked by absolute size so a $1M outflow ranks alongside a $1M inflow. Institutional issuers (Justoken JMWH, Ondo OUSG, Schuman EURØP) mint in discrete monthly chunks so they can drop out of this window unpredictably; the 30d view is steadier if you care about that cohort.",
  '30d': "The issuers with the biggest net change in circulating supply over the last 30 days, in either direction. A positive number means more tokens were minted than burned (capital flowed in); a negative number means more were redeemed than issued (capital flowed out). Ranked by absolute size so a $1M outflow ranks alongside a $1M inflow. The default view because institutional issuers (Justoken JMWH, Ondo OUSG, Schuman EURØP) mint infrequently in large discrete amounts; a 30-day window keeps them on the list between mint events rather than flickering in and out of a 7d boundary.",
};

function renderTopMovers(movers, windowKey) {
  const el = document.getElementById('top-movers-list');
  const empty = document.getElementById('top-movers-empty');
  if (!el) return;
  const w = windowKey || _topMoversWindow || '30d';
  const netField = _MOVER_NET_FIELD[w] || 'net_30d';
  const labelText = _MOVER_LABEL[w] || 'net 30d flow';
  if (!movers.length) {
    el.innerHTML = '';
    if (empty) {
      empty.textContent = _MOVER_EMPTY[w] || _MOVER_EMPTY['30d'];
      empty.classList.remove('hidden');
    }
    return;
  }
  if (empty) empty.classList.add('hidden');
  el.innerHTML = movers.map(m => {
    const cls = m.asset_class || '';
    const net = m[netField];
    return `
      <div class="flex items-center justify-between gap-4 bg-ink border border-border rounded-lg p-4">
        <div class="min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="font-semibold text-white truncate">${escapeHtml(m.logical_label || m.label || '')}</span>
            <span class="class-${cls} text-[10px] px-2 py-0.5 rounded border uppercase tracking-wider">${escapeHtml(fmtAssetClass(cls))}</span>
          </div>
          <div class="text-[11px] text-muted mt-0.5">${labelText}</div>
        </div>
        <div class="text-right shrink-0">
          <div class="text-2xl font-bold font-mono ${deltaClass(net)}">${escapeHtml(deltaSign(net) + fmtNumber(net))}</div>
          <div class="text-[10px] text-muted font-mono uppercase">${escapeHtml(m.currency || '')}</div>
        </div>
      </div>
    `;
  }).join('');
}

function applyTopMoversWindow() {
  if (!_topMoversLastBody) return;
  const w = _topMoversWindow;
  const arr = w === '30d' ? (_topMoversLastBody.top_movers_30d || [])
    : w === '7d' ? (_topMoversLastBody.top_movers_7d || [])
    : (_topMoversLastBody.top_movers_24h || []);
  renderTopMovers(arr, w);
}

// Wire the 24h/7d/30d toggle buttons.
document.querySelectorAll('.mover-window-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const w = btn.getAttribute('data-mover-window');
    if (!w || w === _topMoversWindow) return;
    _topMoversWindow = w;
    document.querySelectorAll('.mover-window-btn').forEach(b => {
      const active = b === btn;
      b.classList.toggle('border-accent', active);
      b.classList.toggle('text-white', active);
      b.classList.toggle('border-border', !active);
      b.classList.toggle('text-muted', !active);
      b.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    const proseEl = document.getElementById('top-movers-prose');
    if (proseEl && _MOVER_PROSE[w]) {
      proseEl.textContent = _MOVER_PROSE[w];
    }
    applyTopMoversWindow();
  });
});

function renderIssuerTiles(issuers) {
  const el = document.getElementById('issuer-tiles');
  if (!el) return;
  if (!issuers.length) {
    el.innerHTML = '<div class="text-xs text-muted">No issuers loaded.</div>';
    return;
  }
  // Sort by status band, then circulating desc within a band:
  // live first, then dormant (real supply, just static), then
  // rails_only (never issued). Ranking dormant with rails_only would
  // bury a programme that still has money outstanding.
  const statusRank = (s) => (s === 'live' ? 2 : s === 'dormant' ? 1 : 0);
  const sorted = issuers.slice().sort((a, b) => {
    const aLive = statusRank(a.mint_status);
    const bLive = statusRank(b.mint_status);
    if (aLive !== bLive) return bLive - aLive;
    const aCirc = parseFloat(a.circulating || '0') || 0;
    const bCirc = parseFloat(b.circulating || '0') || 0;
    return bCirc - aCirc;
  });
  el.innerHTML = sorted.map(i => {
    const cls = i.asset_class || '';
    const status = i.mint_status || 'live';
    const isMpt = i.token_standard === 'mpt';
    const caveat = i.caveat ? `<div class="text-[10px] text-muted mt-3 leading-snug border-t border-border pt-3">${escapeHtml(i.caveat)}</div>` : '';
    const net = i.net_24h || '0';
    // MPTs (XLS-33) use MPToken holder objects, not trustlines, and the
    // snapshot doesn't enumerate holders, so show n/a rather than a
    // misleading "0".
    const trustlines = isMpt ? 'n/a'
      : ((i.trustline_count !== null && i.trustline_count !== undefined) ? String(i.trustline_count) : '…');
    const mptBadge = isMpt ? '<span class="badge-mpt text-[9px] px-2 py-0.5 rounded border uppercase tracking-wider whitespace-nowrap">MPT</span>' : '';
    // Holder spread. An issuance parked in one or two wallets is not a
    // float, and the circulating figure above reads the same either way.
    // Absent block means not measurable (very large trustline sets, MPTs),
    // so show nothing rather than implying the supply is spread out.
    const fc = i.float_concentration || null;
    const fcFlag = fc && fc.flag;
    const fcPct = fc && typeof fc.top_holder_pct === 'number'
      ? (fc.top_holder_pct * 100).toFixed(1) + '%' : null;
    const fcBadge = (fcFlag === 'single_holder' || fcFlag === 'concentrated')
      ? `<span class="badge-concentrated text-[9px] px-2 py-0.5 rounded border uppercase tracking-wider whitespace-nowrap" title="Top holder holds ${escapeHtml(fcPct || '')} of supply across ${escapeHtml(String((fc && fc.holders_nonzero) || 0))} holders. Circulating counts every issued unit regardless of who holds it.">${fcFlag === 'single_holder' ? '1 HOLDER' : 'CONCENTRATED'}</span>`
      : '';
    const xrpscan = `https://xrpscan.com/account/${encodeURIComponent(i.wallet || '')}`;
    return `
      <a href="${xrpscan}" target="_blank" rel="noopener noreferrer" class="issuer-tile bg-ink border border-border rounded-xl p-5 block" data-wallet="${escapeHtml(i.wallet || '')}">
        <div class="flex items-start justify-between gap-2 mb-3">
          <div class="min-w-0">
            <div class="font-semibold text-white truncate">${escapeHtml(i.logical_label || i.label || '')}</div>
            <div class="text-[11px] text-muted truncate">${escapeHtml(i.label || '')}</div>
          </div>
          <div class="flex items-center gap-1 flex-shrink-0">
            ${fcBadge}
            ${mptBadge}
            <span class="status-${status} text-[9px] px-2 py-0.5 rounded border uppercase tracking-wider whitespace-nowrap">${escapeHtml(status === 'rails_only' ? 'rails' : status)}</span>
          </div>
        </div>
        <div class="flex items-baseline gap-2 mb-1">
          <span class="text-2xl font-bold font-mono">${escapeHtml(fmtNumber(i.circulating || '0'))}</span>
          <span class="text-xs text-muted font-mono uppercase">${escapeHtml(i.currency || '')}</span>
        </div>
        <div class="text-[11px] text-muted mb-3">circulating</div>
        <div class="grid grid-cols-3 gap-2 text-[11px]">
          <div>
            <div class="text-muted uppercase tracking-wider mb-0.5">24h Δ</div>
            <div class="font-mono ${deltaClass(net)}">${escapeHtml(deltaSign(net) + fmtNumber(net))}</div>
          </div>
          <div>
            <div class="text-muted uppercase tracking-wider mb-0.5">Trustlines</div>
            <div class="font-mono text-white">${escapeHtml(trustlines)}</div>
          </div>
          <div>
            <div class="text-muted uppercase tracking-wider mb-0.5">Class</div>
            <div><span class="class-${cls} text-[9px] px-1.5 py-0.5 rounded border uppercase tracking-wider whitespace-nowrap">${escapeHtml(fmtAssetClass(cls))}</span></div>
          </div>
        </div>
        ${renderIssuerActivityChips(i)}
        ${caveat}
      </a>
    `;
  }).join('');
}

const _HEALTH_COLORS = { green: 'bg-green-500', yellow: 'bg-yellow-500', red: 'bg-red-500' };
const _HEALTH_LABELS = {
  sovereignty: 'Sov',
  distribution: 'Dist',
  liquidity: 'Liq',
  transparency: 'Trans',
  demand_pipeline: 'Demand',
};

async function overlayTokenHealth() {
  try {
    const r = await fetch(`${API_BASE}/stats/token-health?limit=200`);
    if (!r.ok) return;
    const body = await r.json();
    if (!body || body.available === false) return;
    const byIssuer = {};
    for (const t of (body.tokens || [])) {
      if (t.issuer) byIssuer[t.issuer] = t;
    }
    const tiles = document.querySelectorAll('.issuer-tile[data-wallet]');
    for (const tile of tiles) {
      const wallet = tile.getAttribute('data-wallet');
      const token = byIssuer[wallet];
      if (!token || !token.health) continue;
      const h = token.health;
      const dots = Object.entries(_HEALTH_LABELS).map(([dim, label]) => {
        const d = h[dim] || {};
        const color = _HEALTH_COLORS[d.rating] || 'bg-zinc-600';
        return `<span class="inline-flex items-center gap-1 text-[9px] text-muted" title="${label}: ${d.score}/10 (${d.rating})"><span class="inline-block w-1.5 h-1.5 rounded-full ${color}"></span>${label}</span>`;
      }).join('');
      const totalColor = _HEALTH_COLORS[h.overall_rating] || 'bg-zinc-600';
      const badge = `<div class="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-border">`
        + `<span class="inline-flex items-center gap-1 text-[10px] font-semibold text-white" title="Health score ${h.total}/50"><span class="inline-block w-2 h-2 rounded-full ${totalColor}"></span>${h.total}/50</span>`
        + dots + `</div>`;
      const caveatEl = tile.querySelector('.border-t.border-border.pt-3');
      if (caveatEl) {
        caveatEl.insertAdjacentHTML('beforebegin', badge);
      } else {
        tile.insertAdjacentHTML('beforeend', badge);
      }
    }
  } catch {
    // Best-effort overlay; tiles render fine without it.
  }
}

// Headless meme/RWA classifier. Mirrors XR-Vault's _classify_candidate.
// A candidate is "noise" when BOTH the wallet is vanity-generated AND
// the currency code is a cute all-caps short word, AND it lacks the
// strong institutional flag (RequireAuth). allow-clawback is NOT used
// as an institutional signal; meme tokens set it too.
function classifyCandidate(c) {
  const wallet = (c.wallet || '').trim();
  const currency = (c.currency_ascii || '').trim();
  const requireAuth = !!c.require_auth;

  let vanityWallet = false;
  if (wallet.length > 8) {
    const tail = wallet.slice(1, 9);
    let lowers = 0, digits = 0;
    for (const ch of tail) {
      if (/[a-z]/.test(ch)) lowers++;
      else if (/[0-9]/.test(ch)) digits++;
    }
    vanityWallet = lowers >= 5 && digits <= 1;
  }

  let cuteCurrency = false;
  if (currency) {
    const isShortCaps = currency.length <= 5 && /^[A-Z]+$/.test(currency);
    const hasSeparator = /[-_0-9]/.test(currency);
    const fiatSuffixes = ['USD','EUR','GBP','AUD','BRL','CHF','JPY','MWH','Q'];
    const hasFiatSuffix = fiatSuffixes.some(s => currency.toUpperCase().endsWith(s));
    cuteCurrency = isShortCaps && !hasSeparator && !hasFiatSuffix;
  }

  const isNoise = vanityWallet && cuteCurrency && !requireAuth;
  return isNoise ? 'noise' : 'provisional';
}

function candidateTile(c) {
  const wallet = c.wallet || '';
  const label = c.label || wallet.slice(0, 10);
  const cur = c.currency_ascii || c.currency_on_ledger || '';
  const oblig = c.obligations_amount || '0';
  const obligF = parseFloat(oblig);
  const obligDisplay = isFinite(obligF) ? fmtNumber(obligF) : oblig;
  const tlines = c.trustline_count !== null && c.trustline_count !== undefined
    ? String(c.trustline_count) + (c.trustline_truncated ? '+' : '')
    : '…';
  const domain = c.domain
    ? `<a href="https://${escapeHtml(c.domain)}" target="_blank" rel="noopener noreferrer" class="text-accent hover:underline">${escapeHtml(c.domain)}</a>`
    : '<span class="text-muted">no domain</span>';
  const xrpscan = `https://xrpscan.com/account/${encodeURIComponent(wallet)}`;
  const firstSeen = c.first_seen ? fmtAgo(c.first_seen) : '';
  const flagBadges = [];
  if (c.allow_clawback) flagBadges.push('clawback');
  if (c.require_auth)   flagBadges.push('require-auth');
  const flagsHtml = flagBadges.length
    ? flagBadges.map(f => `<span class="text-[9px] uppercase tracking-wider text-muted border border-border rounded px-1.5 py-0.5">${f}</span>`).join(' ')
    : '';
  return `
    <a href="${xrpscan}" target="_blank" rel="noopener noreferrer" class="block bg-ink border border-amber-500/20 hover:border-amber-500/60 rounded-xl p-5 transition">
      <div class="flex items-start justify-between gap-2 mb-3">
        <div class="min-w-0">
          <div class="font-semibold text-white truncate">${escapeHtml(label)}</div>
          <div class="text-[10px] text-muted font-mono mt-0.5 truncate">${escapeHtml(fmtAddrShort(wallet))}</div>
        </div>
        <span class="text-[9px] uppercase tracking-wider text-amber-400 border border-amber-500/40 rounded px-1.5 py-0.5 shrink-0">Unverified</span>
      </div>
      <div class="mb-3">
        <div class="text-xl font-bold font-mono">${escapeHtml(obligDisplay)}</div>
        <div class="text-[10px] text-muted font-mono uppercase mt-0.5">${escapeHtml(cur)} obligations</div>
      </div>
      <div class="text-[11px] text-muted space-y-1">
        <div><span class="text-white">${tlines}</span> trustlines</div>
        <div>${domain}</div>
        ${flagsHtml ? `<div class="pt-1 flex gap-1 flex-wrap">${flagsHtml}</div>` : ''}
        ${firstSeen ? `<div class="text-[10px] pt-1 border-t border-border mt-2">First seen ${firstSeen}</div>` : ''}
      </div>
    </a>
  `;
}

function renderCandidates(candidates) {
  const section = document.getElementById('recently-discovered');
  const provEl = document.getElementById('candidate-tiles');
  const provHeader = document.getElementById('candidate-provisional-header');
  const provCount = document.getElementById('candidate-provisional-count');
  const noiseEl = document.getElementById('candidate-noise-tiles');
  const noiseHeader = document.getElementById('candidate-noise-header');
  const noiseCount = document.getElementById('candidate-noise-count');
  const empty = document.getElementById('candidate-empty');
  const counter = document.getElementById('candidates-count');
  const callout = document.getElementById('discovery-callout');
  const calloutText = document.getElementById('discovery-callout-text');
  if (!section || !provEl || !noiseEl) return;
  if (!candidates.length) {
    section.classList.add('hidden');
    if (callout) callout.classList.add('hidden');
    return;
  }
  section.classList.remove('hidden');
  if (empty) empty.classList.add('hidden');

  const provisional = [];
  const noise = [];
  for (const c of candidates) {
    // Prefer server-side tier when present (Vault /stats/daily-flow);
    // fall back to client classification when reading raw Pulse data.
    const tier = c.tier || classifyCandidate(c);
    (tier === 'noise' ? noise : provisional).push(c);
  }

  if (counter) counter.textContent = `${provisional.length} provisional · ${noise.length} noise`;

  // Show the top-of-page callout when there's at least one provisional
  // candidate (operator-review-worthy). Noise-only doesn't surface a
  // banner; those are filtered meme tokens, not interesting signal.
  if (callout && calloutText) {
    if (provisional.length > 0) {
      callout.classList.remove('hidden');
      const labels = provisional.slice(0, 3).map(c => c.label || c.wallet?.slice(0, 8) || '?').join(', ');
      const more = provisional.length > 3 ? ` + ${provisional.length - 3} more` : '';
      calloutText.textContent = `${provisional.length} RWA candidate${provisional.length === 1 ? '' : 's'} auto-discovered: ${labels}${more}`;
    } else {
      callout.classList.add('hidden');
    }
  }

  if (provisional.length) {
    provHeader.classList.remove('hidden');
    provCount.textContent = `· ${provisional.length}`;
    provEl.innerHTML = provisional.map(candidateTile).join('');
  } else {
    provHeader.classList.add('hidden');
    provEl.innerHTML = '';
  }

  if (noise.length) {
    noiseHeader.classList.remove('hidden');
    noiseCount.textContent = `· ${noise.length}`;
    noiseEl.innerHTML = noise.map(candidateTile).join('');
  } else {
    noiseHeader.classList.add('hidden');
    noiseEl.innerHTML = '';
  }
}

function renderAmmPools(pools) {
  const el = document.getElementById('amm-pool-tiles');
  const empty = document.getElementById('amm-pool-empty');
  if (!el) return;
  if (!pools.length) {
    el.innerHTML = '';
    if (empty) empty.classList.remove('hidden');
    return;
  }
  if (empty) empty.classList.add('hidden');
  el.innerHTML = pools.map(p => {
    const cls = p.rwa_asset_class || '';
    const xrpscan = `https://xrpscan.com/account/${encodeURIComponent(p.pool_account || '')}`;
    return `
      <a href="${xrpscan}" target="_blank" rel="noopener noreferrer" class="issuer-tile bg-ink border border-border rounded-xl p-5 block">
        <div class="flex items-start justify-between gap-2 mb-3">
          <div class="min-w-0">
            <div class="font-semibold text-white truncate">${escapeHtml(p.rwa_logical_label || '')} <span class="text-muted">/</span> ${escapeHtml(p.counterparty_label || '')}</div>
            <div class="text-[11px] text-muted truncate font-mono">${escapeHtml(fmtAddrShort(p.pool_account))}</div>
          </div>
          <span class="class-${cls} text-[9px] px-2 py-0.5 rounded border uppercase tracking-wider whitespace-nowrap">${escapeHtml(fmtAssetClass(cls))}</span>
        </div>
        <div class="grid grid-cols-2 gap-3 mb-3">
          <div>
            <div class="text-[10px] text-muted uppercase tracking-wider mb-0.5">${escapeHtml(p.rwa_currency || '')}</div>
            <div class="text-lg font-bold font-mono">${escapeHtml(fmtNumber(p.rwa_amount || '0'))}</div>
          </div>
          <div>
            <div class="text-[10px] text-muted uppercase tracking-wider mb-0.5">${escapeHtml(p.counterparty_label || '')}</div>
            <div class="text-lg font-bold font-mono">${escapeHtml(fmtNumber(p.counterparty_amount || '0'))}</div>
          </div>
        </div>
        <div class="text-[10px] text-muted">LP supply: <span class="font-mono text-white">${escapeHtml(fmtNumber(p.lp_supply || '0'))}</span></div>
      </a>
    `;
  }).join('');
}

// ---- Recent flow log -----------------------------------------------------
// Drives the "Recent flow" section by reading rwa_issuer_flow events from
// the latest /stats/rwa-summary embed... actually we don't embed events
// there. Pull a small page from /events/recent without auth would 402;
// instead we render a compact list from /stats/rwa-summary's per-issuer
// mints/burns counts. For Phase 1 we keep this simple. Show the per-
// issuer 24h aggregates as "flow rows" since that's what the summary
// endpoint gives us cheaply.
function renderFlowLog(issuers) {
  const el = document.getElementById('flow-list');
  if (!el) return;
  const rows = (issuers || [])
    .filter(i => (i.mints_24h_count || 0) > 0 || (i.burns_24h_count || 0) > 0)
    .sort((a, b) => (b.mints_24h_count + b.burns_24h_count) - (a.mints_24h_count + a.burns_24h_count));
  if (!rows.length) {
    el.innerHTML = '<div class="bg-ink border border-border rounded-lg p-4 text-xs text-muted">No mints or burns recorded in the last 24 hours.</div>';
    return;
  }
  el.innerHTML = rows.map(i => {
    const minted = parseFloat(i.minted_24h || '0') || 0;
    const burned = parseFloat(i.burned_24h || '0') || 0;
    const net = i.net_24h || '0';
    return `
      <div class="bg-ink border border-border rounded-lg p-4 flex items-center justify-between gap-4">
        <div class="min-w-0">
          <div class="font-semibold text-white truncate">${escapeHtml(i.logical_label || i.label || '')}</div>
          <div class="text-[11px] text-muted mt-0.5">
            <span class="delta-positive">+${fmtNumber(minted)}</span>
            <span class="text-muted mx-1">·</span>
            <span class="delta-negative">-${fmtNumber(burned)}</span>
            <span class="text-muted ml-1">${escapeHtml(i.currency || '')}</span>
          </div>
          <div class="text-[10px] text-muted mt-1">${i.mints_24h_count} mint${i.mints_24h_count === 1 ? '' : 's'} · ${i.burns_24h_count} burn${i.burns_24h_count === 1 ? '' : 's'} · last 24h</div>
        </div>
        <div class="text-right shrink-0">
          <div class="text-lg font-bold font-mono ${deltaClass(net)}">${escapeHtml(deltaSign(net) + fmtNumber(net))}</div>
          <div class="text-[10px] text-muted font-mono uppercase">net</div>
        </div>
      </div>
    `;
  }).join('');
}

// Report a loader's outcome to the stale-data notice (assets/stale-banner.js).
function markStale(source, good) {
  if (window.XRStale) good ? window.XRStale.ok(source) : window.XRStale.fail(source);
}

// Re-call summary so flow log renders too.
async function loadAll() {
  try {
    const r = await fetch(`${API_BASE}/stats/rwa-summary`);
    if (!r.ok) { markStale('rwa-summary', false); return; }
    const body = await r.json();
    if (!body || body.available === false) { markStale('rwa-summary', false); return; }
    markStale('rwa-summary', true);
    _topMoversLastBody = body;
    renderSummary(body);
    applyTopMoversWindow();
    renderIssuerTiles(body.issuers || []);
    renderAmmPools(body.amm_pools || []);
    renderFlowLog(body.issuers || []);
    overlayTokenHealth();
  } catch {
    markStale('rwa-summary', false);
  }
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);
}

document.getElementById('flow-refresh')?.addEventListener('click', loadAll);
loadAll();
// Poll on a timer so the dashboard stays current without page reload.
setInterval(loadAll, 60000);

// XLS-85 all-time + windowed counter. Free passthrough call to
// Pulse's /stats/xls85-totals; refresh on the same 60s cadence as
// the rest of the dashboard so the headline stays current.
async function loadXls85Totals() {
  try {
    const r = await fetch('https://pulse.xrpl-utilities.io/stats/xls85-totals');
    if (!r.ok) { markStale('xls85', false); return; }
    const body = await r.json();
    markStale('xls85', true);
    const fmt = (n) => (typeof n === 'number') ? n.toLocaleString() : '0';
    const setText = (id, v) => {
      const el = document.getElementById(id);
      if (el) el.textContent = v;
    };
    // Lead with the organic counts. A raw event count is not an
    // adoption measure: one issuer looping conditional escrows on its
    // own token moves it as much as a whole ecosystem would, and on
    // 2026-08-12 one reached 77% of the all-time record in a day.
    // The API separates the two; older payloads without `organic`
    // fall back to raw so a stale deploy still renders.
    const org = body.organic || {};
    const pick = (o, r) => (typeof o === 'number') ? o : r;
    setText('xls85-all-time', fmt(pick(org.all_time, body.all_time)));
    setText('xls85-7d',       fmt(pick(org.last_7d,  body.last_7d)));
    setText('xls85-24h',      fmt(pick(org.last_24h, body.last_24h)));
    setText('xls85-issuers',  fmt(pick(org.distinct_issuers, body.distinct_issuers)));
    setText('xls85-dvp-sub',  fmt(body.dvp_all_time) + ' DvP candidates');

    // Sub-line shows the raw total only where it actually differs, so
    // the tile never displays two numbers without saying why.
    const rawLine = (id, orgVal, rawVal) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.textContent = (typeof orgVal === 'number' && typeof rawVal === 'number' && rawVal > orgVal)
        ? fmt(rawVal) + ' incl. automated'
        : '';
    };
    rawLine('xls85-all-time-raw', org.all_time, body.all_time);
    rawLine('xls85-7d-raw',       org.last_7d,  body.last_7d);
    rawLine('xls85-24h-raw',      org.last_24h, body.last_24h);

    // Deliberately does not render body.data_note verbatim: that
    // string names the flagged issuer, which is fine for an API
    // consumer but is not something to publish on a marketing page
    // about a party nobody has worked up.
    const caveatEl = document.getElementById('xls85-caveat');
    if (caveatEl) {
      const n = (body.high_rate_issuers || []).length;
      if (n > 0) {
        const hidden = (body.all_time || 0) - (org.all_time || 0);
        caveatEl.textContent =
          'Counts above exclude ' + fmt(hidden) + ' events from ' + n +
          ' high-rate automated ' + (n === 1 ? 'issuer' : 'issuers') +
          '. Repetition on a single token is throughput, not adoption, so it is reported separately rather than folded into the headline.';
        caveatEl.classList.remove('hidden');
      } else {
        caveatEl.textContent = '';
        caveatEl.classList.add('hidden');
      }
    }
    const sinceEl = document.getElementById('xls85-since');
    if (sinceEl && body.earliest_event_at) {
      const d = new Date(body.earliest_event_at * 1000);
      if (!isNaN(d.getTime())) {
        sinceEl.textContent = 'since ' + d.toISOString().slice(0, 10);
      }
    }
  } catch {
    // Tile keeps '…' (or the last good figure) rather than showing '0';
    // the stale notice says the counter stopped updating.
    markStale('xls85', false);
  }
}
loadXls85Totals();
setInterval(loadXls85Totals, 60000);

// ============================================================
// Settlement activity over time; /stats/daily-flow on Vault.
// ============================================================
const VAULT_API = 'https://vault.xrpl-utilities.io';

// Deterministic per-label color so each issuer keeps the same hue
// across re-renders. Hash on the logical_label so new issuers
// (added via Pulse registry promotion) get a stable color without
// any hardcoded map here.
function labelColor(label) {
  let h = 0;
  for (let i = 0; i < label.length; i++) {
    h = (h * 31 + label.charCodeAt(i)) >>> 0;
  }
  const hue = h % 360;
  return `hsl(${hue}, 65%, 58%)`;
}

let settlementChart = null;
let usdFlowChart = null;
let currentFlowRange = 30;

async function loadDailyFlow(days) {
  const url = `${VAULT_API}/stats/daily-flow?days=${encodeURIComponent(days)}`;
  let body;
  try {
    const r = await fetch(url);
    if (!r.ok) {
      console.error('[vault daily-flow] http', r.status);
      markStale('daily-flow', false);
      return;
    }
    body = await r.json();
  } catch (e) {
    console.error('[vault daily-flow] fetch failed:', e);
    markStale('daily-flow', false);
    return;
  }
  markStale('daily-flow', true);
  const events = body.settlement_events_daily || [];
  const usd = body.usd_pegged_net_flow_daily || [];
  const tracked = body.tracked_issuers || [];

  const emptyEl = document.getElementById('settlement-empty');
  if (!events.length) {
    emptyEl?.classList.remove('hidden');
    return;
  }
  emptyEl?.classList.add('hidden');

  try {
    renderSettlementEventsChart(events, tracked);
  } catch (e) {
    console.error('[vault settlement chart] render failed:', e);
    const totalEl = document.getElementById('settlement-events-total');
    if (totalEl) totalEl.textContent = 'chart unavailable';
  }
  try {
    renderUsdPeggedChart(usd, body.usd_pegged_asset_classes || [], tracked);
  } catch (e) {
    console.error('[vault usd-pegged chart] render failed:', e);
    const covEl = document.getElementById('usd-flow-coverage');
    if (covEl) covEl.textContent = 'chart unavailable';
  }
}

function renderSettlementEventsChart(daily, tracked) {
  if (typeof Chart === 'undefined') return;
  const ctx = document.getElementById('chart-settlement-events');
  if (!ctx) return;
  const labels = daily.map(d => d.snapshot_date);

  // Offer-pattern issuers (e.g. Ripple RLUSD) bring supply into
  // circulation via DEX offers, not direct Payments, so their
  // mint/burn EVENT counts are structurally 0. Exclude them from
  // the event-count chart so we don't render a misleading flatline,
  // and surface them in the offer-issuance caveat below.
  const offerLabels = new Set(
    tracked.filter(t => t.mint_pattern === 'offer').map(t => t.logical_label)
  );

  // Collect every label that ever shows a nonzero event count over
  // the window so the legend reflects the period, not just today.
  // Skip offer-pattern issuers regardless of their data.
  const seen = new Set();
  daily.forEach(d => {
    Object.entries(d.by_logical_label || {}).forEach(([lbl, n]) => {
      if (n > 0 && !offerLabels.has(lbl)) seen.add(lbl);
    });
  });
  const orderedLabels = Array.from(seen).sort();
  const datasets = orderedLabels.map(lbl => ({
    label: lbl,
    data: daily.map(d => (d.by_logical_label || {})[lbl] || 0),
    backgroundColor: labelColor(lbl),
    borderWidth: 0,
  }));

  const total = daily.reduce((acc, d) => {
    const labels = d.by_logical_label || {};
    let s = 0;
    for (const [lbl, n] of Object.entries(labels)) {
      if (!offerLabels.has(lbl)) s += (n || 0);
    }
    return acc + s;
  }, 0);
  const totalEl = document.getElementById('settlement-events-total');
  if (totalEl) {
    totalEl.textContent =
      `${total.toLocaleString()} events · ${daily.length} day${daily.length === 1 ? '' : 's'} · ${orderedLabels.length} issuer${orderedLabels.length === 1 ? '' : 's'}`;
  }

  // Caveat row for offer-pattern issuers.
  const offerCaveatEl = document.getElementById('offer-issuance-caveat');
  if (offerCaveatEl) {
    if (offerLabels.size) {
      const names = Array.from(offerLabels).sort().join(', ');
      offerCaveatEl.textContent =
        `Not shown in the event chart: ${names}. These issuers bring supply into circulation via offers on the XRPL DEX rather than direct Payments, so mint and burn event counts are structurally zero. Obligations are tracked separately.`;
      offerCaveatEl.classList.remove('hidden');
    } else {
      offerCaveatEl.classList.add('hidden');
    }
  }

  if (settlementChart) settlementChart.destroy();
  settlementChart = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { color: '#a0a8b0', font: { size: 10 }, boxWidth: 10, boxHeight: 10 },
        },
        tooltip: {
          backgroundColor: '#0a0d10',
          titleColor: '#ffffff',
          bodyColor: '#c8d0d8',
          borderColor: '#2a3038',
          borderWidth: 1,
        },
      },
      scales: {
        x: {
          stacked: true,
          ticks: { color: '#7a8088', font: { size: 9 }, maxRotation: 0, autoSkipPadding: 12 },
          grid: { color: 'rgba(255,255,255,0.04)' },
        },
        y: {
          stacked: true,
          ticks: { color: '#7a8088', font: { size: 10 }, precision: 0 },
          grid: { color: 'rgba(255,255,255,0.04)' },
        },
      },
    },
  });
}

function renderUsdPeggedChart(daily, usdClasses, tracked) {
  if (typeof Chart === 'undefined') return;
  const ctx = document.getElementById('chart-usd-pegged-flow');
  if (!ctx) return;
  const labels = daily.map(d => d.snapshot_date);
  const netData = daily.map(d => d.net_usd || 0);

  // Headline coverage: how many tracked issuers are USD-pegged vs total.
  const usdCount = tracked.filter(t => t.is_usd_pegged).length;
  const totalCount = tracked.length;
  const coverageEl = document.getElementById('usd-flow-coverage');
  if (coverageEl) {
    coverageEl.textContent =
      `${usdCount} of ${totalCount} issuer${totalCount === 1 ? '' : 's'} included`;
  }

  // Caveat lists the EUR/BRL/AUD/MWh issuers that don't roll up here.
  const excluded = tracked.filter(t => !t.is_usd_pegged).map(t => t.logical_label).sort();
  const caveatEl = document.getElementById('usd-flow-caveat');
  if (caveatEl) {
    if (excluded.length) {
      caveatEl.textContent =
        `Excluded from dollar aggregate (native unit only): ${excluded.join(', ')}.`;
    } else {
      caveatEl.textContent = '';
    }
  }

  if (usdFlowChart) usdFlowChart.destroy();
  usdFlowChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Net USD flow',
        data: netData,
        backgroundColor: netData.map(v => v >= 0 ? 'rgba(74, 222, 128, 0.65)' : 'rgba(248, 113, 113, 0.65)'),
        borderColor: netData.map(v => v >= 0 ? 'rgb(74, 222, 128)' : 'rgb(248, 113, 113)'),
        borderWidth: 1,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#0a0d10',
          titleColor: '#ffffff',
          bodyColor: '#c8d0d8',
          borderColor: '#2a3038',
          borderWidth: 1,
          callbacks: {
            label: (item) => {
              const v = item.parsed.y || 0;
              const sign = v >= 0 ? '+' : '−';
              return `${sign}$${Math.abs(v).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
            },
          },
        },
      },
      scales: {
        x: {
          ticks: { color: '#7a8088', font: { size: 9 }, maxRotation: 0, autoSkipPadding: 12 },
          grid: { color: 'rgba(255,255,255,0.04)' },
        },
        y: {
          ticks: {
            color: '#7a8088',
            font: { size: 10 },
            callback: (v) => {
              const abs = Math.abs(v);
              const sign = v < 0 ? '-' : '';
              if (abs >= 1_000_000) return `${sign}$${(abs/1_000_000).toFixed(1)}M`;
              if (abs >= 1_000) return `${sign}$${(abs/1_000).toFixed(0)}K`;
              return `${sign}$${abs}`;
            },
          },
          grid: { color: 'rgba(255,255,255,0.04)' },
        },
      },
    },
  });
}

document.querySelectorAll('.flow-range-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const d = parseInt(btn.getAttribute('data-flow-range'), 10) || 30;
    if (d === currentFlowRange) return;
    currentFlowRange = d;
    document.querySelectorAll('.flow-range-btn').forEach(b => {
      const active = b === btn;
      b.classList.toggle('border-accent', active);
      b.classList.toggle('text-white', active);
      b.classList.toggle('border-border', !active);
      b.classList.toggle('text-muted', !active);
      if (active) b.setAttribute('aria-pressed', 'true');
      else b.removeAttribute('aria-pressed');
    });
    loadDailyFlow(d);
  });
});

// Defer to allow Chart.js to load.
let _chartWaitCount = 0;
function bootDailyFlow() {
  if (typeof Chart === 'undefined') {
    _chartWaitCount += 1;
    if (_chartWaitCount > 50) {
      console.error('[vault] Chart.js still undefined after 10s; bailing on daily-flow render. Check CSP / network for cdn.jsdelivr.net.');
      return;
    }
    setTimeout(bootDailyFlow, 200);
    return;
  }
  loadDailyFlow(currentFlowRange);
  // Refresh once per hour; the underlying data updates on the
  // UTC-day cadence so polling faster is wasted work.
  setInterval(() => loadDailyFlow(currentFlowRange), 3600 * 1000);
}
bootDailyFlow();
