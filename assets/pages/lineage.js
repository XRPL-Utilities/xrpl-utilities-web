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

function fmtUSD(n) {
  const num = typeof n === 'string' ? parseFloat(n) : (n || 0);
  if (!isFinite(num)) return '$0';
  const abs = Math.abs(num);
  const sign = num < 0 ? '-' : '';
  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000)     return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000)         return `${sign}$${(abs / 1_000).toFixed(0)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}
function fmtInt(n) {
  const num = typeof n === 'string' ? parseFloat(n) : (n || 0);
  return isFinite(num) ? Math.round(num).toLocaleString('en-US') : '0';
}
function fmtRel(unixTs) {
  if (!unixTs) return '';
  const diffSec = Math.max(0, (Date.now() / 1000) - Number(unixTs));
  if (diffSec < 60)    return `${Math.round(diffSec)}s ago`;
  if (diffSec < 3600)  return `${Math.round(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.round(diffSec / 3600)}h ago`;
  return `${Math.round(diffSec / 86400)}d ago`;
}
function fmtSetDelta(el, n) {
  if (!isFinite(n) || n === 0) { el.textContent = fmtUSD(0); el.classList.add('delta-zero'); return; }
  const sign = n >= 0 ? '+' : '-';
  el.textContent = `${sign}${fmtUSD(Math.abs(n))}`;
  el.classList.add(n >= 0 ? 'delta-positive' : 'delta-negative');
}

// Address-keyed marketing notes for the Source column.
// Operator-curated copy that the API doesn't carry. Keys are the
// first 14 chars of a wallet address so partial-prefix matches
// still resolve. Falls back to the API's `label` when no match.
const SOURCE_WALLET_NOTES = {
  'rMxCKbEDwqr76Q': { display: 'Ripple RLUSD Issuer',  note: 'mint origin · burn destination' },
  'r9c6A65SmhhZAL': { display: 'RLUSD Distribution',    note: 'XRPScan well-known: RLUSD' },
  'rJqiMb94hyz41S': { display: 'Ripple XRPL MM Hub',   note: 'institutional liquidity' },
  'rBg2FuZT91C52N': { display: 'Ripple Root Treasury', note: 'XRPScan well-known: Ripple' },
  'rhzVLsX7yA57th': { display: 'Ripple Treasury (alt)', note: 'supplementary Ripple wallet' },
  'rGpaXxcBQFCkEL': { display: 'RLUSD Redemption / Burn Agent', note: 'multisig · DepositAuth · on-chain inferred' },
};

// Role-keyed pipeline-card copy. Operator-curated wallets are
// grouped into role-buckets the API returns; the descriptions
// below are the publicly-safe role descriptions matching the
// moat protection on the API side.
const PIPELINE_ROLE_CARDS = {
  mm: {
    title: 'Market-maker tier',
    sub: (n) => `${n} operator-tracked wallet${n === 1 ? '' : 's'}`,
    note: 'specific addresses curated · receive flow from Ripple MM hub',
  },
  other: {
    title: 'Mid-pipeline relays',
    sub: (n) => `${n} operator-tracked wallet${n === 1 ? '' : 's'}`,
    note: 'specific addresses curated · Payment-only routing',
  },
  treasury: {
    title: 'Treasury / accumulation',
    sub: (n) => `${n} operator-tracked wallet${n === 1 ? '' : 's'}`,
    note: 'specific addresses curated · accumulation pattern',
  },
  custody: {
    title: 'Custody-style',
    sub: (n) => `${n} operator-tracked wallet${n === 1 ? '' : 's'}`,
    note: 'specific addresses curated',
  },
  issuer: {
    title: 'Inferred issuer-side',
    sub: (n) => `${n} operator-tracked wallet${n === 1 ? '' : 's'}`,
    note: 'specific addresses curated',
  },
};

function truncAddr(a) {
  return a && a.length > 18 ? `${a.slice(0, 14)}…${a.slice(-4)}` : (a || '?');
}

async function loadTopology() {
  const sourceEl   = document.getElementById('topology-source');
  const pipelineEl = document.getElementById('topology-pipeline');
  const exitsEl    = document.getElementById('topology-exits');
  try {
    const r = await fetch(`${API_BASE}/stats/ripple-topology`);
    if (!r.ok) throw new Error(`status ${r.status}`);
    const j = await r.json();

    // ===== SOURCE COLUMN =====
    // Group escrow wallets (label starts with "Ripple Escrow") into
    // a single card. Render publicly-attested singletons inline.
    const sourceCards = [];
    const escrowWallets = [];
    for (const w of (j.source && j.source.wallets) || []) {
      if ((w.label || '').toLowerCase().startsWith('ripple escrow')) {
        escrowWallets.push(w);
      } else {
        sourceCards.push(w);
      }
    }
    let html = '';
    for (const w of sourceCards) {
      const key = (w.address || '').slice(0, 14);
      const meta = SOURCE_WALLET_NOTES[key] || { display: w.label, note: w.note || '' };
      html += `
        <a href="https://xrpscan.com/account/${escapeHtml(w.address)}" target="_blank" rel="noopener noreferrer" class="block bg-ink border border-amber-500/30 hover:border-amber-500 rounded-lg p-3 transition">
          <div class="text-xs font-semibold text-white">${escapeHtml(meta.display)}</div>
          <div class="text-[10px] text-muted font-mono mt-1">${escapeHtml(truncAddr(w.address))}</div>
          ${meta.note ? `<div class="text-[10px] text-amber-400 mt-1">${escapeHtml(meta.note)}</div>` : ''}
        </a>`;
    }
    if (escrowWallets.length > 0) {
      html += `
        <div class="bg-ink border border-amber-500/30 rounded-lg p-3">
          <div class="text-xs font-semibold text-white">Ripple Escrow Wallets</div>
          <div class="text-[10px] text-muted mt-1">${escrowWallets.length} wallets, TOML-attested</div>
          <div class="text-[10px] text-amber-400 mt-1">ripple.com/.well-known/xrp-ledger.toml</div>
        </div>`;
    }
    sourceEl.innerHTML = html || '<div class="text-[11px] text-muted">No source wallets returned.</div>';

    // ===== PIPELINE COLUMN =====
    // Render role buckets in a fixed order so the layout is stable
    // even when role_counts changes over time.
    const roles = (j.pipeline && j.pipeline.role_counts) || {};
    const ROLE_ORDER = ['mm', 'other', 'treasury', 'custody', 'issuer'];
    let pHtml = '';
    for (const role of ROLE_ORDER) {
      const count = roles[role] || 0;
      if (count === 0) continue;
      const card = PIPELINE_ROLE_CARDS[role] || { title: role, sub: (n) => `${n} wallets`, note: 'operator-curated' };
      pHtml += `
        <div class="bg-ink border border-accent/30 rounded-lg p-3">
          <div class="text-xs font-semibold text-white">${escapeHtml(card.title)}</div>
          <div class="text-[10px] text-muted mt-1">${escapeHtml(card.sub(count))}</div>
          <div class="text-[10px] text-accent mt-1">${escapeHtml(card.note)}</div>
        </div>`;
    }
    if (!pHtml) pHtml = '<div class="text-[11px] text-muted">No pipeline wallets curated yet.</div>';
    pipelineEl.innerHTML = pHtml;

    // ===== EXITS COLUMN =====
    let eHtml = '';
    for (const ent of (j.exits && j.exits.entities) || []) {
      const linksHtml = (ent.wallets || []).map(w =>
        `<a href="https://xrpscan.com/account/${escapeHtml(w.address)}" target="_blank" rel="noopener noreferrer" class="font-mono text-[10px] text-muted hover:text-emerald-400 transition">${escapeHtml(truncAddr(w.address))}</a>`
      ).join('<span class="text-muted/40">, </span>');
      eHtml += `
        <div class="bg-ink border border-emerald-500/30 rounded-lg p-3">
          <div class="text-xs font-semibold text-white">${escapeHtml(ent.entity)}</div>
          <div class="text-[10px] text-muted mt-1">${ent.wallet_count} hot wallet${ent.wallet_count === 1 ? '' : 's'} attributed</div>
          <div class="text-[10px] mt-1">${linksHtml}</div>
        </div>`;
    }
    eHtml += `
      <div class="bg-ink border border-border rounded-lg p-3">
        <div class="text-xs font-semibold text-white">Additional CEX / OTC</div>
        <div class="text-[10px] text-muted mt-1">surfaced as detection fires</div>
        <div class="text-[10px] text-muted mt-1">resolved via XRPScan well-known on miss</div>
      </div>`;
    exitsEl.innerHTML = eHtml;
  } catch (e) {
    console.warn('[lineage] topology fetch failed', e);
    for (const el of [sourceEl, pipelineEl, exitsEl]) {
      if (el) el.innerHTML = '<div class="text-[11px] text-muted">Data temporarily unavailable.</div>';
    }
  }
}

async function loadRlusdToday() {
  try {
    const r = await fetch(`${API_BASE}/stats/rwa-summary`);
    if (!r.ok) throw new Error(`status ${r.status}`);
    const j = await r.json();
    const issuers = j.per_issuer || j.issuers || [];
    const rlusd = issuers.find(x => (x.label || '').includes('RLUSD') && (x.wallet || '').startsWith('rMxCKb'));
    if (!rlusd) return;
    const live = parseFloat(rlusd.live_obligations || 0);
    const delta = parseFloat(rlusd.obligations_delta_today || 0);
    const hist = rlusd.daily_obligations_history || [];
    const priorRow = hist.length >= 2 ? hist[hist.length - 2] : null;
    const prior = priorRow ? parseFloat(priorRow.obligations_raw || 0) : 0;
    const tlc = priorRow ? parseFloat(priorRow.trustline_count || 0) : 0;

    document.getElementById('rlusd-outstanding').textContent = fmtUSD(live);
    fmtSetDelta(document.getElementById('rlusd-delta'), delta);
    document.getElementById('rlusd-prior').textContent = fmtUSD(prior);
    document.getElementById('rlusd-trustlines').textContent = fmtInt(tlc) + (rlusd.trustline_count_truncated || priorRow?.trustline_count_truncated ? '+' : '');
    document.getElementById('rlusd-asof').textContent = `as of ${new Date().toISOString().replace('T',' ').slice(0,19)}Z`;
  } catch (e) {
    console.warn('[lineage] rwa-summary fetch failed', e);
    const elIds = ['rlusd-outstanding','rlusd-delta','rlusd-prior','rlusd-trustlines'];
    elIds.forEach(id => { const el = document.getElementById(id); if (el) el.textContent = '–'; });
    document.getElementById('rlusd-asof').textContent = 'data temporarily unavailable';
  }
}

async function loadCounterparties() {
  try {
    const r = await fetch(`${API_BASE}/stats/ripple-counterparties`);
    if (!r.ok) throw new Error(`status ${r.status}`);
    const j = await r.json();
    document.getElementById('cp-candidates').textContent = fmtInt(j.candidate_count);
    document.getElementById('cp-promoted').textContent = fmtInt(j.promoted_count);
    document.getElementById('cp-rlusd').textContent = fmtInt(j.rlusd_pre_approval_count);
    document.getElementById('cp-bursts').textContent = fmtInt((j.relay_bursts_recent || []).length);

    const tierGrid = document.getElementById('cp-tier-grid');
    const tiers = j.tier_distribution || {};
    const tierLabels = {
      promoted_70_plus: 'Promoted (70+)',
      high_50_69: 'High (50-69)',
      mid_30_49: 'Mid (30-49)',
      low_under_30: 'Low (<30)',
    };
    const tierOrder = ['promoted_70_plus','high_50_69','mid_30_49','low_under_30'];
    tierGrid.innerHTML = '';
    tierOrder.forEach(key => {
      const count = tiers[key] || 0;
      const wrap = document.createElement('div');
      wrap.className = `tier-${key} border rounded-lg p-3`;
      wrap.innerHTML = `
        <div class="text-2xl font-bold">${fmtInt(count)}</div>
        <div class="text-[10px] uppercase tracking-wider mt-1 opacity-80">${tierLabels[key]}</div>`;
      tierGrid.appendChild(wrap);
    });

    const sourceGrid = document.getElementById('cp-source-grid');
    const sources = Object.entries(j.funding_source_distribution || {});
    if (sources.length === 0) {
      sourceGrid.innerHTML = '<div class="text-xs text-muted">No candidates surfaced yet. The discovery loop checks back on a recurring basis.</div>';
    } else {
      sources.sort((a, b) => b[1] - a[1]);
      sourceGrid.innerHTML = sources.map(([label, count]) => `
        <div class="bg-ink border border-border rounded-lg p-3 flex items-center justify-between gap-3">
          <span class="text-sm text-white truncate">${escapeHtml(label)}</span>
          <span class="text-sm font-mono text-accent shrink-0">${fmtInt(count)}</span>
        </div>`).join('');
    }

    // Today's largest chain visualization. Pick the burst with the
    // highest total_usd in the response; render hops_public as a
    // step-by-step flow with arrows + per-hop amounts.
    renderLargestChain(j.relay_bursts_recent || []);

    // Bursts table
    const burstList = document.getElementById('burst-list');
    const burstEmpty = document.getElementById('burst-empty');
    const bursts = j.relay_bursts_recent || [];
    if (bursts.length === 0) {
      burstList.innerHTML = '';
      burstEmpty.classList.remove('hidden');
    } else {
      burstEmpty.classList.add('hidden');
      // Sort by when the chain actually happened on-chain, newest first.
      // chain_started_at is the timestamp of the first hop; detected_at
      // is when our state machine fired (can be much later when the
      // chain was reconstructed via the historical backfill).
      const sortedBursts = bursts.slice().sort((a, b) => (b.chain_started_at || 0) - (a.chain_started_at || 0));
      burstList.innerHTML = sortedBursts.slice(0, 15).map(b => {
        const chainTs = b.chain_started_at || b.detected_at;
        const chainDate = chainTs ? new Date(chainTs * 1000).toISOString().replace('T', ' ').slice(0, 16) + ' UTC' : '?';
        // Build the inline hop-value progression: $100M → $82M → $82M
        const hops = b.hops_public || [];
        const hopFlow = hops.length
          ? hops.map(h => `<span class="text-white font-mono">${fmtUSD(h.value || 0)}</span>`)
                .join('<span class="text-accent mx-1">&rarr;</span>')
          : '';
        // Inline currency badge to make the chain type read at a glance
        const currency = (b.chain_currency || '?').toUpperCase();
        const isXrp = currency === 'XRP';
        const isRlusd = currency === 'RLUSD' || currency.startsWith('524C5553');
        const curClass = isXrp ? 'border-blue-500/40 text-blue-300 bg-blue-500/10'
                      : isRlusd ? 'border-emerald-500/40 text-emerald-300 bg-emerald-500/10'
                      : 'border-border text-muted';
        const curDisplay = isRlusd ? 'RLUSD' : currency;
        return `
        <div class="burst-row bg-ink border border-border rounded-lg p-4">
          <div class="flex items-start justify-between gap-4 flex-wrap">
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2 mb-1 flex-wrap">
                <span class="text-[10px] uppercase tracking-widest font-semibold px-2 py-0.5 rounded border ${curClass}">${curDisplay}</span>
                <span class="text-sm font-semibold text-white">${b.hop_count}-hop chain &middot; ${fmtUSD(b.total_usd || 0)}</span>
              </div>
              ${b.chain_summary ? `<div class="text-[12px] text-white mt-1 mb-1">${escapeHtml(b.chain_summary)}</div>` : ''}
              ${hopFlow ? `<div class="text-[12px] mt-2 mb-1">Flow: ${hopFlow}</div>` : ''}
              <div class="text-[11px] text-muted mt-2">
                On-chain: <span class="text-white">${chainDate}</span> (${fmtRel(chainTs)})
              </div>
              <div class="text-[11px] text-muted mt-1">
                Anchor: <span class="text-accent">${escapeHtml(b.anchor_label || 'unlabeled')}</span>
                ${b.news_correlation_count > 0 ? `&middot; <span class="text-amber-400">${b.news_correlation_count} news event${b.news_correlation_count === 1 ? '' : 's'} in window</span>` : ''}
              </div>
              ${chainTs ? `<div class="text-[11px] mt-2"><a href="/pulse/?since=${Math.floor(chainTs - 60)}&kind=activity" class="text-accent hover:underline">View live whale events in this window &rarr;</a></div>` : ''}
            </div>
          </div>
        </div>`;
      }).join('');
    }
  } catch (e) {
    console.warn('[lineage] ripple-counterparties fetch failed', e);
    ['cp-candidates','cp-promoted','cp-rlusd','cp-bursts'].forEach(id => {
      const el = document.getElementById(id); if (el) el.textContent = '–';
    });
    const burstList = document.getElementById('burst-list');
    if (burstList) burstList.innerHTML = '<div class="text-xs text-muted">Data temporarily unavailable.</div>';
  }
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function renderLargestChain(bursts) {
  const flowEl = document.getElementById('largest-chain-flow');
  const whenEl = document.getElementById('largest-chain-when');
  const totalsEl = document.getElementById('largest-chain-totals');
  const titleEl = document.getElementById('largest-chain-title');
  if (!flowEl || !whenEl || !totalsEl) return;

  if (!bursts || bursts.length === 0) {
    if (titleEl) titleEl.textContent = "Today's largest chain";
    flowEl.innerHTML = '<div class="text-xs text-muted">No chains detected yet. Detection requires three or more hops, twenty million dollars total movement, and at least one labeled anchor wallet.</div>';
    whenEl.textContent = '';
    totalsEl.innerHTML = '';
    return;
  }

  // Peak hop = largest single Payment in the chain. Honest "money
  // that moved" signal vs sum(hop_usd) which triple-counts when the
  // same dollars relay through each node.
  const peakOf = (b) => {
    const hs = b.hops_public || [];
    return hs.length ? Math.max(...hs.map(h => h.value || 0)) : 0;
  };

  // Filter to actual today (UTC). Without this, the picker grabbed
  // the all-time-largest burst in the response window and labeled
  // it "today's" -- the May 20 $230M RLUSD mint chain stayed pinned
  // as "today's largest" for 8 days post-event.
  const todayUtc = new Date().toISOString().slice(0, 10);
  const isToday = (ts) => {
    if (!ts) return false;
    return new Date(ts * 1000).toISOString().slice(0, 10) === todayUtc;
  };
  const todaysBursts = (bursts || []).filter(b => isToday(b.chain_started_at || b.detected_at));

  let top;
  let isFallback = false;
  if (todaysBursts.length > 0) {
    top = todaysBursts.reduce((a, b) => (peakOf(b) > peakOf(a) ? b : a));
    if (titleEl) titleEl.textContent = "Today's largest chain";
  } else {
    // No chain today -- fall back to the most recent detected
    // chain. Keeps the panel useful on quiet days; visitors see
    // the actual largest-chain shape rather than an empty card.
    top = bursts.slice().sort((a, b) =>
      (b.chain_started_at || b.detected_at || 0) - (a.chain_started_at || a.detected_at || 0))[0];
    const ts = top && (top.chain_started_at || top.detected_at);
    const tsDate = ts ? new Date(ts * 1000).toISOString().slice(0, 10) : '?';
    if (titleEl) titleEl.textContent = `Last detected chain (${tsDate})`;
    isFallback = true;
  }
  if (!top) {
    flowEl.innerHTML = '<div class="text-xs text-muted">No chain data available.</div>';
    whenEl.textContent = '';
    totalsEl.innerHTML = '';
    return;
  }
  const hops = top.hops_public || [];
  const chainTs = top.chain_started_at || top.detected_at;
  const chainDate = chainTs ? new Date(chainTs * 1000).toISOString().replace('T', ' ').slice(0, 16) + ' UTC' : '?';
  whenEl.textContent = `${chainDate} (${fmtRel(chainTs)})`;

  // Build the flow: [Anchor]  →  [Hop 1 $X]  →  [Hop 2 $Y]  →  ...
  const anchorBox = `
    <div class="flex flex-col items-center">
      <div class="bg-ink border border-amber-500/40 rounded-lg px-3 py-2 text-center min-w-[120px] sm:min-w-[140px]">
        <div class="text-[9px] uppercase tracking-widest text-amber-400 font-semibold">Anchor</div>
        <div class="text-xs text-white font-semibold mt-1">${escapeHtml(top.anchor_label || 'unlabeled')}</div>
      </div>
    </div>`;
  const arrow = (label) => `
    <div class="flex flex-col items-center justify-center min-w-[44px] sm:min-w-[80px]">
      <div class="text-[10px] text-accent font-mono whitespace-nowrap">${label}</div>
      <svg class="h-3 w-full" viewBox="0 0 60 10" fill="none" preserveAspectRatio="none">
        <line x1="0" y1="5" x2="55" y2="5" stroke="#00b8ff" stroke-width="1.5" />
        <polygon points="55,1 60,5 55,9" fill="#00b8ff" />
      </svg>
    </div>`;
  const hopBox = (i, isLast) => `
    <div class="flex flex-col items-center">
      <div class="bg-ink border ${isLast ? 'border-emerald-500/40' : 'border-accent/40'} rounded-lg px-3 py-2 text-center min-w-[90px] sm:min-w-[110px]">
        <div class="text-[9px] uppercase tracking-widest ${isLast ? 'text-emerald-400' : 'text-accent'} font-semibold">${isLast ? 'Terminal recipient' : `Hop ${i}`}</div>
        <div class="text-xs text-white font-semibold mt-1">${isLast ? 'Holding wallet' : 'Routing node'}</div>
      </div>
    </div>`;
  const fallbackNotice = isFallback
    ? `<div class="w-full text-xs text-amber-400/90 bg-amber-500/5 border border-amber-500/20 rounded-md px-3 py-2 mb-3">No multi-hop chain detected today. Showing the last detected chain for context.</div>`
    : '';
  let html = fallbackNotice + anchorBox;
  hops.forEach((h, i) => {
    html += arrow(fmtUSD(h.value || 0));
    html += hopBox(i + 1, i === hops.length - 1);
  });
  flowEl.innerHTML = html;

  // Totals tiles below. Peak hop = largest single Payment value
  // observed in the chain. This is the honest "money that moved"
  // figure; the per-hop values aggregated together (still surfaced
  // separately) overstate because the same dollars typically move
  // through each relay node sequentially.
  const peakHop = hops.length ? Math.max(...hops.map(h => h.value || 0)) : 0;
  const aggregateHopUsd = top.total_usd || 0;
  const newsCount = top.news_correlation_count || 0;
  totalsEl.innerHTML = `
    <div class="bg-ink border border-border rounded-lg p-3">
      <div class="text-[10px] uppercase tracking-widest text-muted" title="Largest single Payment observed across the chain. The honest 'money that moved' figure.">Peak hop</div>
      <div class="text-base font-semibold text-white mt-1">${fmtUSD(peakHop)}</div>
    </div>
    <div class="bg-ink border border-border rounded-lg p-3">
      <div class="text-[10px] uppercase tracking-widest text-muted">Hops</div>
      <div class="text-base font-semibold text-white mt-1">${top.hop_count}</div>
    </div>
    <div class="bg-ink border border-border rounded-lg p-3">
      <div class="text-[10px] uppercase tracking-widest text-muted" title="Sum of per-hop Payment values. Overstates actual money moved when the same dollars flow through each relay node.">Aggregate hop value</div>
      <div class="text-base font-semibold text-muted mt-1">${fmtUSD(aggregateHopUsd)}</div>
    </div>
    <div class="bg-ink border border-border rounded-lg p-3">
      <div class="text-[10px] uppercase tracking-widest text-muted">News in window</div>
      <div class="text-base font-semibold ${newsCount > 0 ? 'text-amber-400' : 'text-muted'} mt-1">${newsCount}</div>
    </div>`;
}

loadTopology();
loadRlusdToday();
loadCounterparties();
// Refresh every 5 minutes; underlying data updates on minute cadences.
setInterval(loadRlusdToday, 5 * 60 * 1000);
setInterval(loadCounterparties, 5 * 60 * 1000);
