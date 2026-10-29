// Mobile nav overlay. Opens on hamburger, closes on Escape, link tap,
 // close-X tap, OR resize past the md breakpoint (so a desktop user who
 // shrinks then grows their window doesn't end up with a stuck overlay).
(function setupMobileNav() {
  const openBtn  = document.getElementById('nav-open');
  const closeBtn = document.getElementById('nav-close');
  const overlay  = document.getElementById('mobile-nav');
  if (!openBtn || !closeBtn || !overlay) return;
  const open  = () => {
    overlay.style.display = 'flex';
    openBtn.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
  };
  const close = () => {
    overlay.style.display = 'none';
    openBtn.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
  };
  openBtn.addEventListener('click', open);
  closeBtn.addEventListener('click', close);
  overlay.querySelectorAll('a[href]').forEach(a => a.addEventListener('click', close));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlay.style.display !== 'none') close();
  });
  window.addEventListener('resize', () => {
    if (window.innerWidth >= 1024) close();
  });
})();

const API_BASE = 'https://pulse.xrpl-utilities.io';

function fmtAgo(ts) {
  const secs = Math.floor((Date.now() / 1000) - ts);
  if (secs < 3600) return Math.max(1, Math.floor(secs / 60)) + 'm ago';
  if (secs < 86400) return Math.floor(secs / 3600) + 'h ago';
  return Math.floor(secs / 86400) + 'd ago';
}

// Plain message for a failed free call. The wording lives in
// preview-token.js so Pulse and Trust say the same thing.
function failureText(status) {
  return window.PreviewToken && window.PreviewToken.failureMessage
    ? window.PreviewToken.failureMessage(status)
    : 'Live data didn\u2019t load. Reload the page to try again.';
}
function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// Reject any URL scheme other than http(s) / xrpl / mailto so backend
// strings can't smuggle a javascript: URI into an href.
function safeUrl(u) {
  const s = String(u || '').trim();
  return /^(?:https?|xrpl|mailto):/i.test(s) ? s : '#';
}

function fmtPct(p) {
  if (p === null || p === undefined) return '-';
  const sign = p > 0 ? '+' : '';
  return `${sign}${p.toFixed(2)}%`;
}

function fmtUsd(n) {
  if (n === null || n === undefined || isNaN(n)) return '-';
  const a = Math.abs(n);
  if (a >= 1_000_000_000) return '$' + (n / 1_000_000_000).toFixed(2) + 'B';
  if (a >= 1_000_000) return '$' + (n / 1_000_000).toFixed(2) + 'M';
  if (a >= 1_000) return '$' + (n / 1_000).toFixed(1) + 'k';
  return '$' + n.toFixed(0);
}

function fmtXrpAmount(n) {
  if (n === null || n === undefined || isNaN(n)) return '-';
  const a = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (a >= 1_000_000_000) return sign + (a / 1_000_000_000).toFixed(2) + 'B XRP';
  if (a >= 1_000_000) return sign + (a / 1_000_000).toFixed(2) + 'M XRP';
  if (a >= 1_000) return sign + (a / 1_000).toFixed(1) + 'k XRP';
  return sign + a.toFixed(0) + ' XRP';
}

// Operator-curated RWA issuer wallet set. Populated on page load
// from XR-Pulse /stats/rwa-summary (free public endpoint). Used to
// filter token_escrow_event cards on the activity column so only
// tracked-issuer escrows (tokenized treasuries, stablecoins, etc.)
// surface, not memecoin and community-token noise.
const TRACKED_RWA_ISSUERS = new Set();
async function _hydrateTrackedIssuers() {
  try {
    const r = await fetch(`${API_BASE}/stats/rwa-summary`, { cache: 'no-store' });
    if (!r.ok) return;
    const body = await r.json();
    for (const issuer of (body.issuers || [])) {
      if (issuer && issuer.wallet) TRACKED_RWA_ISSUERS.add(issuer.wallet);
    }
  } catch (_) {
    // Network blip; leave set empty. An empty set matches nothing, so
    // every token-escrow row stays suppressed until the next page
    // load - conservative, but it never floods the column with the
    // memecoin escrow stream.
  }
}
// Kept as a promise so the activity filter can wait for the set
// before deciding which escrow rows survive. Without the wait, a
// fetch that lands first would drop tracked-issuer escrows too.
const _trackedIssuersReady = _hydrateTrackedIssuers();

function renderEvent(e) {
  // Choreography events restate whale, relay and supply events that
  // are already in the feed, so the page leaves them out. Agents
  // querying /events/recent still get them.
  if ((e.source_appearances || []).includes('choreography_watcher')) {
    return '';
  }
  // Whale events get the tier badge as their identity marker; the
  // technical 'whale_xrpl' source name on a sub-whale ($50k-$1M)
  // tier card reads as misleading, so suppress source pills entirely
  // on those rows. RSS cards keep their source pills since
  // bis_speeches / coindesk / cointelegraph_xrp etc. carry real
  // information about which feed broke a story.
  const isWhaleSrc = (e.source_appearances || []).indexOf('whale_xrpl') !== -1;
  const sources = isWhaleSrc
    ? ''
    : (e.source_appearances || []).map(s =>
        `<span class="text-xs px-2 py-0.5 rounded source-${escapeHtml(s)} border">${escapeHtml(sourceName(s))}</span>`
      ).join(' ');
  const verifiedPill = e.cross_verified
    ? `<span class="text-xs px-2 py-0.5 rounded verified-pill border">reported by 2+ sources</span>`
    : '';
  const utilityPill = e.active_utility && e.active_utility.active
    ? `<span class="text-xs px-2 py-0.5 rounded utility-pill border">● active utility</span>`
    : '';
  // Institutional-event badge. Highlights news items that match a
  // curated set of high-signal patterns: regulated exchange listings
  // (MOEX/DBAG/LSE/etc), ETF approval/launch/closure, regulatory
  // action (SEC/court rulings), central-bank or international-
  // standard-body statements specifically about XRP, Ripple
  // corporate events. Deterministic keyword match; no editorial
  // scoring. The categories array (when present) tells the reader
  // why it fired.
  const institutionalSig = (e.active_utility && Array.isArray(e.active_utility.signals))
    ? e.active_utility.signals.find(s => s.signal === 'institutional_event')
    : null;
  const institutionalPill = institutionalSig
    ? `<span class="text-xs px-2 py-0.5 rounded border bg-amber-400/10 text-amber-300 border-amber-400/30" title="${escapeHtml((institutionalSig.categories || []).join(', '))}">★ institutional</span>`
    : '';

  // Whale events use a different active_utility shape than RSS events:
  // top-level signal='whale_transfer' with usd_value, sender_label,
  // receiver_label, currency, plus a `tier` classification (Pulse
  // schema 1.14.0+):
  //   INSTITUTIONAL_FLOW - watchlisted side OR >= $10M. Gold badge.
  //   WHALE_MOVE         - $1M-$10M, both sides unwatchlisted. Cyan.
  //   EXCHANGE_LOGISTICS - same exchange family rebalancing. Muted.
  //   NORMAL_ACTIVITY    - < $1M, anonymous. Suppressed by default.
  // Legacy events without a `tier` field (pre-1.14.0 emits) fall back
  // to value-based inference matching the same thresholds.
  const isWhale = (e.source_appearances || []).indexOf('whale_xrpl') !== -1;
  // On-chain rows have appearance_count stripped server-side because
  // each event has a unique id (tx-hash-derived, or a per-watcher-pass
  // snapshot) that is always 1 and never cross-verified.
  // Test the field itself rather than a source allow-list: the server
  // strips from every source in db.ACTIVITY_SOURCES, which is 11 and
  // grows with each new watcher. The old hardcoded trio missed the
  // other eight (rwa_issuer_daily, rwa_issuer_flow, rwa_amm_pool_state,
  // relay_burst, focus_watch, choreography_watcher,
  // institutional_dispersion, sentinel_signal) and rendered
  // "appearance_count: undefined" on all of them.
  const hasAppearanceCount = typeof e.appearance_count === 'number';
  const isOnChainOnly = !hasAppearanceCount;
  const whaleAU = isWhale && e.active_utility && e.active_utility.signal === 'whale_transfer'
    ? e.active_utility : null;
  // Two other whale_xrpl sub-signals from the same source: XLS-85
  // token escrow events (EscrowCreate/Finish/Cancel on non-XRP IOUs)
  // and issuer-side TrustSet deep-freezes. Each has its own
  // active_utility shape (subtype, tx_type, currency, addresses,
  // condition, target_holder) and should render with its own
  // identity badge + detail strip so the card doesn't look empty.
  const tokenEscrowAU = isWhale && e.active_utility && e.active_utility.signal === 'token_escrow_event'
    ? e.active_utility : null;
  const deepFreezeAU  = isWhale && e.active_utility && e.active_utility.signal === 'issuer_deepfreeze'
    ? e.active_utility : null;
  // rwa_obligations_delta fires when an RWA issuer's outstanding
  // obligations jump between watcher passes. Catches DEX-mediated
  // supply changes that the per-tx Payment classifier structurally
  // misses. Source is rwa_obligations_delta; signal is
  // rwa_obligations_spike (mint) or rwa_obligations_drop (burn).
  const rwaObligationsAU = e.active_utility
    && (e.active_utility.signal === 'rwa_obligations_spike'
        || e.active_utility.signal === 'rwa_obligations_drop')
    ? e.active_utility : null;
  let tierBadge = '';
  let whaleBlock = '';
  let whaleTitle = null;  // when set, overrides e.title for cleaner rendering
  let suppressRow = false;  // true => skip rendering this row entirely (NORMAL tier)

  // Daily AMM-of-RWA pool snapshots aren't transactional activity;
  // they're once-per-UTC-day state captures. Useful on /vault/ but
  // they clutter the activity column when rendered as event cards.
  // Suppress here; the data is still in /events/recent for agents.
  if (e.active_utility && e.active_utility.signal === 'rwa_amm_pool_state') {
    return '';
  }

  // Token-escrow noise filter. The watcher emits an event for every
  // successful EscrowCreate/Finish/Cancel on any non-XRP IOU above
  // the storage threshold. In practice the feed gets dominated by
  // memecoin and community-token escrows (Tortie, ROBIN, PRSV,...)
  // that aren't institutional signal. Filter to escrows on the
  // operator-curated RWA issuer set so what surfaces here is the
  // tokenized-treasury / stablecoin / commercial-paper traffic an
  // institutional reader cares about. Memecoin escrows remain
  // queryable via /events/recent for agents that want the full
  // stream; this filter is UI-only.
  if (tokenEscrowAU && tokenEscrowAU.issuer) {
    const issuer = tokenEscrowAU.issuer;
    if (!TRACKED_RWA_ISSUERS.has(issuer)) {
      return '';
    }
  }
  if (whaleAU && typeof whaleAU.usd_value === 'number') {
    const usd = whaleAU.usd_value;
    // Read tier from server when present; fall back to value-based
    // inference for legacy events (sender/receiver_label-aware
    // identity check isn't possible client-side without the watchlist,
    // so legacy events are tier-classified by value alone).
    let tier = whaleAU.tier;
    if (!tier) {
      if (usd >= 10_000_000)      tier = 'INSTITUTIONAL_FLOW';
      else if (usd >= 1_000_000)  tier = 'WHALE_MOVE';
      else                        tier = 'NORMAL_ACTIVITY';
    }
    // Hide NORMAL_ACTIVITY rows from the activity column. The data is
    // still queryable via the API with min_whale_usd:0, but the UI
    // surface defines its own institutional-utility floor.
    if (tier === 'NORMAL_ACTIVITY') {
      suppressRow = true;
    }
    const tierStyle = {
      'INSTITUTIONAL_FLOW': { cls: 'tier-institutional', lbl: 'INSTITUTIONAL' },
      'WHALE_MOVE':         { cls: 'tier-whale',         lbl: 'WHALE'         },
      'EXCHANGE_LOGISTICS': { cls: 'tier-exchange',      lbl: 'EXCHANGE'      },
      'NORMAL_ACTIVITY':    { cls: 'tier-normal',        lbl: 'NORMAL'        },
    }[tier] || { cls: 'tier-whale', lbl: 'WHALE' };
    tierBadge = `<span class="text-xs px-2 py-0.5 rounded ${tierStyle.cls} border uppercase">${tierStyle.lbl} · ${escapeHtml(fmtUsd(usd))}</span>`;

    // Compact title: lead with the dollar amount, then either the
    // labeled venues or a generic 'transfer'. Avoids the
    // parenthesis-inside-parenthesis form of the server-side title.
    const sl = whaleAU.sender_label;
    const rl = whaleAU.receiver_label;
    const usdStr = fmtUsd(usd);
    if (sl && rl) {
      whaleTitle = `${usdStr} · ${sl} → ${rl}`;
    } else if (sl) {
      whaleTitle = `${usdStr} · ${sl} → unlabeled`;
    } else if (rl) {
      whaleTitle = `${usdStr} · unlabeled → ${rl}`;
    } else {
      whaleTitle = `${usdStr} ${whaleAU.currency || 'XRP'} transfer`;
    }

    // Detail strip is the primary content area for whale cards
    // (the brief paragraph is suppressed below since it'd just
    // restate the same fields). Shows full truncated addresses
    // alongside whatever labels resolved.
    const senderLabel   = sl ? ` (${escapeHtml(sl)})` : '';
    const receiverLabel = rl ? ` (${escapeHtml(rl)})` : '';
    const senderShort   = (whaleAU.sender_address   || '').slice(0, 10) + '…';
    const receiverShort = (whaleAU.receiver_address || '').slice(0, 10) + '…';
    whaleBlock = `<div class="text-xs text-muted mt-2 pt-2 border-t border-border break-words">
      <span class="text-white mr-2">On-chain transfer</span>
      ${escapeHtml(whaleAU.amount_display || '')} ·
      <span class="font-mono break-all">${escapeHtml(senderShort)}${senderLabel}</span> →
      <span class="font-mono break-all">${escapeHtml(receiverShort)}${receiverLabel}</span> ·
      ledger ${escapeHtml(String(whaleAU.ledger_index || '?'))}
    </div>`;

    // "Part of detected chain" cross-link to the Lineage page when
    // either party's label was synthesized by the relay_burst_
    // detector. Label format: "... relay chain (detected YYYY-MM-DD,
    // $XM, N-hop)". Parse the parenthetical and render a clickable
    // badge that jumps the reader to /lineage/ for the aggregate
    // chain view.
    const _chainRefRe = /relay chain \(detected (\d{4}-\d{2}-\d{2}), \$(\d+)M, (\d+)-hop\)/i;
    const _chainMatch = (sl && sl.match(_chainRefRe)) || (rl && rl.match(_chainRefRe));
    if (_chainMatch) {
      whaleBlock += `<div class="text-xs mt-2 pt-2 border-t border-border">
        <a href="/lineage/#bursts" class="text-accent hover:underline" title="See the aggregate chain view on the Lineage page">
          &uarr; Part of detected relay chain &middot; ${escapeHtml(_chainMatch[3])}-hop &middot; ~$${escapeHtml(_chainMatch[2])}M &middot; detected ${escapeHtml(_chainMatch[1])}
        </a>
      </div>`;
    }

    // Sentinel cross-reference enrichment (sender + receiver
    // activity classification, advisory flags, score-trajectory
    // delta when prior history exists). Skip the line entirely
    // when both sides are Unknown so we don't add empty noise.
    // The role label (Sender/Receiver) is wrapped in a click-through
    // to /sentinel/?address=rXXX so a reader can pull a fresh
    // Sentinel scan on either party in one click. The Sentinel page
    // accepts ?address= as a prefill + auto-trigger.
    const ss = whaleAU.sender_sentinel || null;
    const rs = whaleAU.receiver_sentinel || null;
    function fmtSentinelBit(role, sx, addr) {
      if (!sx || !sx.activity_level || sx.activity_level === 'Unknown') return null;
      const linkable = !!addr;
      const tip = linkable
        ? `Open Sentinel scan for ${addr}`
        : '';
      const roleHtml = linkable
        ? `<a href="/sentinel/?address=${encodeURIComponent(addr)}" target="_blank" rel="noopener noreferrer" class="text-white underline decoration-dotted underline-offset-2 hover:text-accent transition" title="${escapeHtml(tip)}">${role}</a>`
        : `<span class="text-white">${role}</span>`;
      let bit = `${roleHtml} ${escapeHtml(sx.activity_level)}`;
      if (typeof sx.activity_score === 'number') bit += ` (${sx.activity_score})`;
      if (sx.identity && sx.identity.advisory) {
        bit += ` <span class="text-bad font-semibold">&#9888; advisory</span>`;
      }
      if (sx.identity && sx.identity.verified) {
        bit += ` <span class="text-good">&#10003; verified</span>`;
      }
      if (sx.delta && typeof sx.delta.score_change === 'number' &&
          Math.abs(sx.delta.score_change) >= 5) {
        const arrow = sx.delta.score_change > 0 ? '&uarr;' : '&darr;';
        const sign = sx.delta.score_change > 0 ? '+' : '';
        bit += ` <span class="text-accent">${arrow} ${sign}${sx.delta.score_change} pts</span>`;
      }
      return bit;
    }
    const senderBit   = fmtSentinelBit('Sender',   ss, whaleAU.sender_address);
    const receiverBit = fmtSentinelBit('Receiver', rs, whaleAU.receiver_address);
    const sBits = [senderBit, receiverBit].filter(Boolean);
    if (sBits.length) {
      whaleBlock += `<div class="text-xs text-muted mt-2 pt-2 border-t border-border">
        <span class="text-white mr-2">Sentinel cross-ref</span>
        ${sBits.join(' &middot; ')}
      </div>`;
    }

    // Telemetry macro context: only render when we got a paid
    // /scan response (active_float_xrp present). /healthz fallback
    // returns price only and isn't worth a separate line since
    // it's already on the spot tile elsewhere.
    const tc = whaleAU.telemetry_context;
    if (tc && typeof tc.active_float_xrp === 'number') {
      const tcBits = [];
      tcBits.push(`Active Float ${escapeHtml(fmtXrpAmount(tc.active_float_xrp))}`);
      if (typeof tc.exchange_outflow_24h_xrp === 'number') {
        const sign = tc.exchange_outflow_24h_xrp > 0 ? '+' : '';
        tcBits.push(`24h exch outflow ${sign}${escapeHtml(fmtXrpAmount(tc.exchange_outflow_24h_xrp))}`);
      }
      whaleBlock += `<div class="text-xs text-muted mt-2 pt-2 border-t border-border">
        <span class="text-white mr-2">Macro at emit</span>
        ${tcBits.join(' &middot; ')}
      </div>`;
    }

    // Cluster context: last-1h Pulse-internal events touching each
    // side (count + signal_kinds) plus raw XRPL adjacent activity
    // counts (TrustSet / AMM / Escrow / Offer / Payment) for each
    // wallet, with the anchor whale tx excluded. Skip the whole
    // block when both sides are quiet so we don't clutter rows for
    // isolated whales (the common case).
    const cc = whaleAU.cluster_context;
    if (cc) {
      function renderClusterSide(role, side) {
        if (!side) return null;
        const aa = side.adjacent_xrpl_activity || null;
        const pulseCount = side.count || 0;
        const adjAvailable = aa && aa.available;
        const adjTotal = adjAvailable ? (aa.total_count || 0) : 0;
        if (!pulseCount && (!adjAvailable || !adjTotal)) return null;
        const bits = [];
        if (pulseCount > 0) {
          const kinds = (side.signal_kinds || []).map(escapeHtml).join(', ');
          const kindsHtml = kinds ? ` <span class="text-muted">[${kinds}]</span>` : '';
          bits.push(`${pulseCount} Pulse event${pulseCount === 1 ? '' : 's'}${kindsHtml}`);
        }
        if (adjAvailable && adjTotal > 0) {
          const cats = [];
          if (aa.trustset_count)  cats.push(`${aa.trustset_count} TrustSet`);
          if (aa.amm_op_count)    cats.push(`${aa.amm_op_count} AMM`);
          if (aa.escrow_op_count) cats.push(`${aa.escrow_op_count} Escrow`);
          if (aa.offer_op_count)  cats.push(`${aa.offer_op_count} Offer`);
          if (aa.payment_count)   cats.push(`${aa.payment_count} Pay`);
          if (aa.other_count)     cats.push(`${aa.other_count} other`);
          const totalLabel = aa.truncated ? `${adjTotal}+ XRPL tx` : `${adjTotal} XRPL tx`;
          const detail = cats.length ? ` <span class="text-muted">(${cats.join(', ')})</span>` : '';
          bits.push(`${totalLabel}${detail}`);
        }
        return `<span class="text-white">${role}:</span> ${bits.join(' &middot; ')}`;
      }
      const ccBits = [
        renderClusterSide('Sender',   cc.sender),
        renderClusterSide('Receiver', cc.receiver),
      ].filter(Boolean);
      if (ccBits.length) {
        const reciprocal = cc.reciprocal_pair_seen
          ? ' &middot; <span class="text-accent font-semibold">reciprocal pair seen</span>'
          : '';
        whaleBlock += `<div class="text-xs text-muted mt-2 pt-2 border-t border-border">
          <span class="text-white mr-2">Cluster (1h)</span>
          ${ccBits.join(' &middot; ')}${reciprocal}
        </div>`;
      }
    }
  }

  // XLS-85 token-escrow event render. Subtype is either
  // 'token_escrow' (single-leg) or 'dvp_candidate' (paired with a
  // reciprocal Condition within 1h; delivery-versus-payment
  // pattern). Detail strip surfaces the tx flow + Escrow lifecycle
  // fields; the brief explainer at the bottom is the plain-English
  // gloss for readers unfamiliar with XLS-85.
  if (tokenEscrowAU) {
    const isDvp = tokenEscrowAU.subtype === 'dvp_candidate';
    tierBadge = isDvp
      ? `<span class="text-xs px-2 py-0.5 rounded tier-institutional border uppercase">DvP candidate</span>`
      : `<span class="text-xs px-2 py-0.5 rounded tier-whale border uppercase">Token escrow</span>`;
    const txType = tokenEscrowAU.tx_type || 'EscrowCreate';
    const currency = tokenEscrowAU.currency || '';
    // amount_display already includes the currency suffix (e.g.
    // "30922500 PRSV") when the server has it; the raw `amount`
    // field is the bare numeric. Prefer amount_display verbatim
    // to avoid doubling the currency in the title.
    const amountText = tokenEscrowAU.amount_display
      ? tokenEscrowAU.amount_display
      : (tokenEscrowAU.amount ? `${tokenEscrowAU.amount} ${currency}`.trim() : currency);
    const account = (tokenEscrowAU.account || '').slice(0, 10) + (tokenEscrowAU.account ? '…' : '');
    const destination = (tokenEscrowAU.destination || '').slice(0, 10) + (tokenEscrowAU.destination ? '…' : '');
    const issuer = (tokenEscrowAU.issuer || '').slice(0, 10) + (tokenEscrowAU.issuer ? '…' : '');
    whaleTitle = `${txType} · ${amountText}${isDvp ? ' · DvP' : ''}`;
    whaleBlock = `<div class="text-xs text-muted mt-2 pt-2 border-t border-border break-words">
      <span class="text-white mr-2">XLS-85 escrow</span>
      ${escapeHtml(txType)} ·
      <span class="font-mono break-all">${escapeHtml(account)}</span> &rarr;
      <span class="font-mono break-all">${escapeHtml(destination)}</span> ·
      issuer <span class="font-mono break-all">${escapeHtml(issuer)}</span> ·
      ledger ${escapeHtml(String(tokenEscrowAU.ledger_index || '?'))}
    </div>
    <div class="text-xs text-muted mt-2 pt-2 border-t border-border">
      ${isDvp
        ? 'Delivery-versus-payment candidate: a pair of token escrows on shared Condition hashes within an hour, the on-chain pattern for atomic two-party settlement of an asset for a payment.'
        : 'XLS-85 enables time-locked or condition-locked escrow of non-XRP IOU tokens. Used for vesting, deferred settlement, and atomic two-leg trades. EscrowCreate opens the lock; Finish releases to the destination; Cancel returns to the account.'}
    </div>`;
  }

  // Issuer deep-freeze render. Sanctions-grade trustline state
  // change: a TrustSet with tfSetDeepFreeze means the issuer has
  // disabled both sending AND receiving for the target holder on
  // that currency. Stronger than the regular freeze flag.
  if (deepFreezeAU) {
    tierBadge = `<span class="text-xs px-2 py-0.5 rounded tier-institutional border uppercase">Deep-freeze</span>`;
    const issuer = (deepFreezeAU.issuer || '').slice(0, 10) + (deepFreezeAU.issuer ? '…' : '');
    const target = (deepFreezeAU.target_holder || '').slice(0, 10) + (deepFreezeAU.target_holder ? '…' : '');
    const currency = deepFreezeAU.currency || '';
    whaleTitle = `Issuer deep-froze ${currency} trustline`;
    whaleBlock = `<div class="text-xs text-muted mt-2 pt-2 border-t border-border break-words">
      <span class="text-white mr-2">Compliance action</span>
      Issuer <span class="font-mono break-all">${escapeHtml(issuer)}</span> froze holder
      <span class="font-mono break-all">${escapeHtml(target)}</span>
      on <span class="text-white">${escapeHtml(currency)}</span> ·
      ledger ${escapeHtml(String(deepFreezeAU.ledger_index || '?'))}
    </div>
    <div class="text-xs text-muted mt-2 pt-2 border-t border-border">
      TrustSet with tfSetDeepFreeze (0x00400000) on the issuer side. The holder can no longer send OR receive this IOU. Stronger than the regular freeze flag (which only blocks sends). Behavioral signal, not a verdict; issuers freeze for many reasons including court order, KYC failure, suspected fraud, and routine compliance.
    </div>`;
  }

  // rwa_obligations_delta render. Inferred mint or burn at the
  // issuer-obligations level (not a per-tx classification). Catches
  // DEX-mediated supply changes the per-tx classifier misses.
  if (rwaObligationsAU) {
    const isMint = rwaObligationsAU.direction === 'mint';
    const arrow = isMint ? '↑' : '↓';
    tierBadge = `<span class="text-xs px-2 py-0.5 rounded ${isMint ? 'tier-institutional' : 'tier-whale'} border uppercase">RWA ${isMint ? 'mint' : 'burn'} (inferred)</span>`;
    const amt = rwaObligationsAU.amount || '?';
    const cur = rwaObligationsAU.currency || '';
    const label = rwaObligationsAU.issuer_label || rwaObligationsAU.issuer_logical_label || '';
    whaleTitle = `${label}: ${arrow} ${amt} ${cur} (obligations ${isMint ? 'increased' : 'decreased'})`;
    const prior = rwaObligationsAU.prior_obligations || '?';
    const current = rwaObligationsAU.current_obligations || '?';
    const priorTs = rwaObligationsAU.prior_observed_at
      ? new Date(rwaObligationsAU.prior_observed_at * 1000).toISOString().replace('T', ' ').slice(0, 19) + ' UTC'
      : 'unknown';
    whaleBlock = `<div class="text-xs text-muted mt-2 pt-2 border-t border-border break-words">
      <span class="text-white mr-2">Supply change</span>
      obligations <span class="font-mono text-white">${escapeHtml(prior)}</span>
      → <span class="font-mono text-white">${escapeHtml(current)}</span> ${escapeHtml(cur)}
      · diff <span class="text-white">${arrow} ${escapeHtml(amt)}</span>
      · prior reading at ${escapeHtml(priorTs)}
    </div>
    <div class="text-xs text-muted mt-2 pt-2 border-t border-border">
      Inferred from <span class="gloss" data-term="obligations-delta">outstanding-obligations</span> diff between watcher passes, not from a single classified transaction. Some issuers bring supply into circulation via DEX offers rather than direct Payments, so the per-transaction mint/burn classifier structurally misses those events. This signal closes that gap by watching the supply snapshot itself. Universal across the tracked RWA issuer set.
    </div>`;
  }

  // Per-event correlation line policy: render only when there is a
  // signal worth showing to a human. A 0.00% move or a "still pending"
  // countdown is filler that adds noise without information; agents
  // who want every measurement (including the zeros) get them in the
  // JSON response. The active_utility block below already surfaces
  // any signal that did fire.
  let corrLine = '';
  const SIGNAL_THRESHOLD_PCT = 0.5;
  if (e.correlation && e.correlation.available) {
    const c = e.correlation;
    const deltaPct = c.current_price_usd_delta_pct;
    if (typeof deltaPct === 'number' && Math.abs(deltaPct) >= SIGNAL_THRESHOLD_PCT) {
      const windowH = c.window_hours || 4;
      const tooltip = 'Mechanical price measurement at ingestion vs ' + windowH + 'h later. Not a causal claim.';
      corrLine = `<div class="text-xs text-muted mt-2 pt-2 border-t border-border" title="${escapeHtml(tooltip)}">
        <span class="text-white">XRPL price ${escapeHtml(windowH)}h later</span>
        &middot; ${escapeHtml(fmtPct(deltaPct))}
      </div>`;
    }
  }

  let utilityBlock = '';
  if (e.active_utility && e.active_utility.active) {
    // Humanize each signal pill: friendly label + magnitude when the
    // payload carries one. Falls back to the raw signal name only
    // when we genuinely have no extra context to render.
    const pills = (e.active_utility.signals || []).map(s => {
      let label;
      if (s.signal === 'cross_verified') {
        label = `Cross-verified`;
      } else if (s.signal === 'price_moved' && s.delta_pct !== undefined) {
        label = `Price moved · ${fmtPct(s.delta_pct)}`;
      } else if (s.signal === 'volume_moved' && s.delta_pct !== undefined) {
        label = `Volume moved · ${fmtPct(s.delta_pct)}`;
      } else if (s.signal === 'rlusd_mint_observed' && s.mint_count) {
        label = `RLUSD minted · ${s.mint_count} tx`;
      } else if (s.signal === 'watchlist_activity_observed') {
        const txCount = s.tx_count || 0;
        const totalUsd = fmtUsd(s.total_amount_usd);
        const roles = Array.isArray(s.roles) && s.roles.length ? ` · ${s.roles.join(' + ')}` : '';
        const windowH = s.window_hours || 4;
        label = `Institutional flow · ${txCount} tx · ${totalUsd}${roles} · in ${windowH}h after publish`;
      } else if (s.signal === 'high_activity_target' && s.addresses) {
        label = `High-activity target · ${s.addresses.length} address${s.addresses.length === 1 ? '' : 'es'}`;
      } else {
        label = s.signal;
      }
      return `<span class="px-2 py-0.5 rounded signal-pill border">${escapeHtml(label)}</span>`;
    }).join(' ');
    utilityBlock = `<div class="text-xs text-muted mt-2 pt-2 border-t border-border">
      <span class="text-white mr-2">Active utility signals</span>
      ${pills}
    </div>`;
  }

  let sentinelBlock = '';
  if (Array.isArray(e.sentinel_context) && e.sentinel_context.length > 0) {
    const lines = e.sentinel_context.map(c => {
      const lvl = escapeHtml(c.activity_level || 'Unknown');
      const score = c.activity_score !== undefined ? `(${c.activity_score})` : '';
      return `<span class="opacity-80">${escapeHtml(c.address.slice(0, 10))}…</span> <span class="text-white">${lvl} ${score}</span>`;
    }).join(' &middot; ');
    sentinelBlock = `<div class="text-xs text-muted mt-2 pt-2 border-t border-border">
      <span class="text-white mr-2">Sentinel cross-ref</span>${lines}
    </div>`;
  }

  // Cross-stream link annotation (option D): when this is a news
  // event whose target_addresses intersect a recent whale event's
  // sender/receiver within 4 hours, render a small badge inviting
  // the reader to look at the linked on-chain activity. Mechanical
  // cross-reference, not a causal claim.
  let crossLinkBlock = '';
  if (!isWhale && Array.isArray(e._linked_whales) && e._linked_whales.length) {
    const lines = e._linked_whales.slice(0, 3).map(w => {
      const wau = w.active_utility || {};
      const usd = typeof wau.usd_value === 'number' ? fmtUsd(wau.usd_value) : '?';
      const sl = wau.sender_label || (wau.sender_address ? wau.sender_address.slice(0, 8) + '…' : '?');
      const rl = wau.receiver_label || (wau.receiver_address ? wau.receiver_address.slice(0, 8) + '…' : '?');
      return `${escapeHtml(usd)} &middot; ${escapeHtml(sl)} &rarr; ${escapeHtml(rl)}`;
    }).join(' &middot; ');
    crossLinkBlock = `<div class="text-xs text-muted mt-2 pt-2 border-t border-border">
      <span class="text-accent mr-2">Linked on-chain</span>
      ${lines}
    </div>`;
  }

  const link = escapeHtml(safeUrl(e.primary_url));
  const titleText = whaleTitle || e.title;
  // Brief is the article-summary line for RSS events. For whale events
  // it just restates the title + detail strip in different words and
  // makes the card feel cluttered, so suppress it on whale rows.
  const briefHtml = isWhale
    ? ''
    : `<p class="text-sm text-muted leading-relaxed mb-3 break-words">${escapeHtml(e.brief)}</p>`;
  // Plain-English one-liner generated server-side from active_utility
  // (Pulse 1.65.0). Render-only, small italic muted text below the
  // title so non-XRPL-fluent readers can decode the card at a glance.
  // Absent for signals not yet covered by the server-side template
  // registry; treat as "no TLDR available" and skip silently.
  const tldrText = (e.active_utility && typeof e.active_utility.tldr === 'string')
    ? e.active_utility.tldr
    : '';
  const tldrHtml = tldrText
    ? `<p class="text-xs text-muted italic leading-relaxed mb-2 break-words">${escapeHtml(tldrText)}</p>`
    : '';
  // NORMAL_ACTIVITY rows are suppressed entirely from the rendered
  // feed - they're sub-$1M anonymous transfers ("network noise" per
  // the tier spec). The data is still queryable via the API.
  if (suppressRow) return '';

  // min-w-0 + break-words on the article and inner blocks: long
  // monospace addresses and unbreakable URL strings would otherwise
  // expand the card past the column on narrow viewports. The grid
  // cell already has min-w-0 so the column is bounded; this just
  // tells the article + its long-string children to wrap rather
  // than grow horizontally.
  return `
    <article class="event-card bg-ink border border-border rounded-lg p-4 hover:border-accent/40 transition min-w-0 overflow-hidden">
      <div class="flex items-start justify-between gap-3 mb-2">
        <a href="${link}" target="_blank" rel="noopener noreferrer" class="text-white font-semibold hover:text-accent transition leading-snug break-words min-w-0">${escapeHtml(titleText)}</a>
        <span class="text-xs text-muted shrink-0">${escapeHtml(fmtAgo(e.published_at))}</span>
      </div>
      ${tldrHtml}
      ${briefHtml}
      <div class="flex items-center gap-2 flex-wrap">${tierBadge}${sources}${verifiedPill}${institutionalPill}${utilityPill}${isOnChainOnly ? '' : `<span class="text-xs text-muted">appearance_count: ${e.appearance_count}</span>`}</div>
      ${corrLine}
      ${utilityBlock}
      ${whaleBlock}
      ${sentinelBlock}
      ${crossLinkBlock}
    </article>
  `;
}

// Display name and one plain line per news source. The raw ids stay in the
// API; the page shows people the outlet's own name.
const SOURCES = {
  sec_press:         ['SEC', 'U.S. Securities and Exchange Commission press releases.'],
  federal_reserve:   ['Federal Reserve', 'U.S. Federal Reserve press releases.'],
  bis_speeches:      ['BIS', 'Central-bank speeches collected by the Bank for International Settlements.'],
  ecb_press:         ['ECB', 'European Central Bank press releases.'],
  bank_of_england:   ['Bank of England', 'Bank of England news.'],
  rba_australia:     ['Reserve Bank of Australia', 'Reserve Bank of Australia media releases.'],
  bank_of_japan:     ['Bank of Japan', 'Bank of Japan news in English.'],
  bank_of_canada:    ['Bank of Canada', 'Bank of Canada news.'],
  coindesk:          ['CoinDesk', 'CoinDesk stories that mention Ripple, XRP, RLUSD or the XRP Ledger.'],
  fca_uk:            ['FCA', 'UK Financial Conduct Authority news.'],
  esma_eu:           ['ESMA', 'European Securities and Markets Authority news.'],
  fsb:               ['FSB', 'Financial Stability Board publications.'],
  google_news_xrp_institutional: ['News search', 'Wider press coverage of banks and institutions using XRP.'],
  theblock:          ['The Block', 'The Block stories about XRP.'],
  decrypt:           ['Decrypt', 'Decrypt stories about XRP.'],
  utoday:            ['U.Today', 'U.Today stories about XRP.'],
  cryptobriefing:    ['Crypto Briefing', 'Crypto Briefing stories about XRP.'],
  ambcrypto:         ['AMBCrypto', 'AMBCrypto stories about XRP.'],
  beincrypto:        ['BeInCrypto', 'BeInCrypto stories about XRP.'],
  bitcoinist:        ['Bitcoinist', 'Bitcoinist stories about XRP.'],
  cointelegraph_xrp: ['Cointelegraph', 'Cointelegraph stories about XRP.'],
  crypto_news_xrp:   ['crypto.news', 'crypto.news stories about XRP.'],
  coinspeaker_xrp:   ['Coinspeaker', 'Coinspeaker stories about XRP.'],
};
function sourceName(id) {
  return SOURCES[id] ? SOURCES[id][0] : String(id).replace(/_/g, ' ');
}

function fmtCount(n) {
  if (typeof n !== 'number') return '-';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'k';
  return String(n);
}

function renderStatTiles(stats) {
  const store = stats.store || {};
  const feeds = stats.feeds || {};
  const ev = document.getElementById('stat-events');
  const oc = document.getElementById('stat-onchain');
  const sc = document.getElementById('stat-sources');
  const fr = document.getElementById('stat-fresh');
  if (ev) ev.textContent = fmtCount(store.event_count);
  if (oc) oc.textContent = fmtCount(store.watchlist_activity_count);
  const activeCount = Object.values(feeds).filter(f => f && f.is_active).length;
  if (sc) sc.textContent = String(activeCount);
  // Freshness = most recent last_run_at across all feeds. /stats reports
  // server-side timestamps in seconds; render as 'Xm ago' style.
  const lastRuns = Object.values(feeds)
    .map(f => f && f.last_status && f.last_status.last_run_at)
    .filter(t => typeof t === 'number' && t > 0);
  if (fr) {
    if (lastRuns.length === 0) {
      fr.textContent = '-';
    } else {
      const newest = Math.max(...lastRuns);
      fr.textContent = fmtAgo(newest);
    }
  }
}

function renderSourceGrid(stats) {
  const grid = document.getElementById('source-grid');
  if (!grid) return;
  const feeds = stats.feeds || {};
  // Each card: full-width on mobile, 1/3 on md+ so 3 are visible at once.
  // px-2 gives inter-card spacing without flex 'gap' (which complicates
  // pixel-based translate math in the carousel).
  const cards = Object.entries(feeds)
    .filter(([_, f]) => f.is_active || (f.last_status && f.last_status.error === null))
    .map(([name, _]) => {
      const desc = SOURCES[name] ? SOURCES[name][1] : '';
      return `<div class="flex-shrink-0 w-full md:w-1/3 px-2">
        <div class="bg-panel border border-border rounded-lg p-5 h-full">
          <div class="text-xs uppercase tracking-wider mb-2 source-${escapeHtml(name)} inline-block px-2 py-1 rounded border">${escapeHtml(sourceName(name))}</div>
          <p class="text-sm text-muted leading-relaxed mt-3">${escapeHtml(desc)}</p>
        </div>
      </div>`;
    });
  if (cards.length === 0) {
    grid.innerHTML = `<div class="bg-panel border border-border rounded-lg p-5 text-sm text-muted w-full">Source list initializing; check back in a moment.</div>`;
    return;
  }
  grid.innerHTML = cards.join('');
  setupSourceCarousel();
}

function setupSourceCarousel() {
  const viewport = document.getElementById('source-carousel');
  const track = document.getElementById('source-grid');
  if (!viewport || !track || track.children.length === 0) return;
  // Honor reduced-motion: skip auto-rotation entirely. The first 3 cards
  // stay visible; the rest are still in the DOM (off-screen) for SEO and
  // keyboard reachability.
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  let index = 0;
  let timer = null;
  const visiblePerView = () => (window.innerWidth >= 768 ? 3 : 1);
  const maxIndex = () => Math.max(0, track.children.length - visiblePerView());
  const applyOffset = () => {
    const w = track.children[0].getBoundingClientRect().width;
    track.style.transform = `translateX(-${index * w}px)`;
  };
  const advance = () => {
    index = index >= maxIndex() ? 0 : index + 1;
    applyOffset();
  };
  const start = () => { stop(); timer = setInterval(advance, 5000); };
  const stop  = () => { if (timer) { clearInterval(timer); timer = null; } };
  viewport.addEventListener('mouseenter', stop);
  viewport.addEventListener('mouseleave', start);
  viewport.addEventListener('focusin', stop);
  viewport.addEventListener('focusout', start);
  window.addEventListener('resize', () => {
    if (index > maxIndex()) index = maxIndex();
    applyOffset();
  });
  // Pause when the page tab is hidden so we don't drift while the user
  // is elsewhere; resume on return so they don't see a stale slide.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop(); else start();
  });
  start();
}

async function loadStats() {
  // Single /stats fetch feeds both the activity tiles up top and the
  // source grid in 'How it works' below. /stats is a memory read on the
  // backend, so reusing the fetch is the cheap thing to do; failure on
  // either surface is silent (main live feed is the priority surface).
  try {
    const r = await fetch(`${API_BASE}/stats`);
    if (!r.ok) return;
    const stats = await r.json();
    renderStatTiles(stats);
    renderSourceGrid(stats);
  } catch (e) {
    // Silent failure - tiles stay in skeleton state, source grid stays
    // in its placeholder. Main feed is the priority surface.
  }
}
loadStats();

// Show-more pagination. Each column shows INITIAL_VISIBLE events on
// load and reveals REVEAL_BATCH more on each click. Behind the button,
// a cursor-based fetch transparently extends the local cache when it
// runs low, so visitors can reveal arbitrarily far back without any
// visible "page" navigation. The Pulse 1.20.0 kind+before_iso knobs
// power the deep-fetch; the user-facing UI is just one button.
const INITIAL_VISIBLE = 12;
const REVEAL_BATCH = 10;
const FETCH_BATCH = 30;
// Activity fetches a buffer larger than the visible count because
// the client drops several event classes before rendering:
//   - NORMAL_ACTIVITY whale_transfer (sub-$1M anonymous)
//   - token_escrow_event whose issuer isn't in the curated RWA set
//     (memecoin escrows; usually dominant on a fresh fetch)
//   - rwa_amm_pool_state (once-daily snapshots, not transactional)
// Without the buffer, a fresh fetch dominated by memecoin escrows
// could leave the activity column nearly empty. Bumped 3 -> 5 on
// 2026-05-13 when the latter two filters shipped.
const ACTIVITY_FETCH_MULTIPLIER = 5;
const REVEAL_PREFETCH_MARGIN = 5;

const _columns = {
  news: {
    kind: 'news',
    events: [],            // local cache, grows as we reveal/fetch
    shown: 0,              // how many of events[] are currently visible
    oldestCursor: null,    // last published_at we've fetched; drives next before_iso
    exhausted: false,      // server returned 0 rows - no more history
    loading: false,
    error: null,
    listId: 'news-list',
    countId: 'news-count',
    navId: 'news-nav',
    emptyMsg: 'No news yet. New stories are added through the day; check back shortly.',
  },
  activity: {
    kind: 'activity',
    events: [],
    shown: 0,
    oldestCursor: null,
    exhausted: false,
    loading: false,
    error: null,
    listId: 'activity-list',
    countId: 'activity-count',
    navId: 'activity-nav',
    emptyMsg: 'No on-chain activity above the storage floor stored yet. New activity appears as ledgers close.',
  },
};

async function fetchEvents({ kind, before_iso, since_iso, limit }) {
  const previewHeaders = await (window.PreviewToken
    ? window.PreviewToken.authHeaders()
    : Promise.resolve({}));
  const body = { kind, limit, min_whale_usd: 0 };
  if (before_iso) body.before_iso = before_iso;
  if (since_iso) body.since_iso = since_iso;
  const ctl = new AbortController();
  const tid = setTimeout(() => ctl.abort(), 30000);
  try {
    const r = await fetch(`${API_BASE}/events/recent`, {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, previewHeaders),
      body: JSON.stringify(body),
      signal: ctl.signal,
    });
    if (!r.ok) {
      const err = new Error(`HTTP ${r.status}`);
      err.status = r.status;
      throw err;
    }
    const data = await r.json();
    return data.events || [];
  } finally {
    clearTimeout(tid);
  }
}

// Single source of truth for "does this activity event become a
// card?". renderEvent() still re-checks each rule defensively, but
// the cache must agree with it: col.shown slices col.events, so any
// row that renders to '' would otherwise consume a visible slot and
// leave a hole. When one issuer floods the stream (memecoin escrow
// bursts routinely run >90% of a fetch window) that turns a 12-card
// column into one or two cards.
function isRenderableActivityEvent(e) {
  const srcs = e.source_appearances || [];
  const au = e.active_utility || {};
  // Choreographies restate events already in the feed.
  if (srcs.includes('choreography_watcher')) return false;
  // Once-per-UTC-day AMM state captures, not transactional activity.
  if (au.signal === 'rwa_amm_pool_state') return false;
  // Escrows on non-curated issuers: memecoin and community-token noise.
  if (au.signal === 'token_escrow_event' && au.issuer
      && !TRACKED_RWA_ISSUERS.has(au.issuer)) return false;
  // Sub-$1M anonymous whales.
  if (srcs.includes('whale_xrpl') && inferWhaleTier(e) === 'NORMAL_ACTIVITY') return false;
  // XLS-81 quote refreshes: a domain-scoped market maker replacing its
  // own resting offer, filling nothing. That is one offer at successive
  // prices, not a stream of events, and it out-emits every other source
  // in this column by an order of magnitude - on 2026-08-29 the sole
  // EUROP maker ran ~2,900/day against ~330 whale events/day and the
  // column rendered nothing but "Permissioned offer placed by
  // rURtT5MM...". Pulse 1.106.0 drops these server-side; this is the
  // defensive re-check, and it also covers a stale-cached response.
  //
  // Every leg must match POSITIVELY, so a row we cannot read stays
  // visible: null execution keeps the card (unreadable is not zero), a
  // first quote keeps it (replaced_own_count 0), any fill keeps it, and
  // XLS-70/80 lifecycle rows never reach this branch at all.
  //
  // Deliberately NOT a per-emitter cap. A blanket cap would also hide a
  // genuine burst of fills from one venue, which is the signal we most
  // want; the server-side per-source allocation already bounds how much
  // of the column any one source can hold.
  if (au.signal === 'permissioned_dex_event' && au.tx_type === 'OfferCreate') {
    const x = au.execution;
    if (x && typeof x === 'object'
        && (x.replaced_own_count || 0) >= 1
        && x.consumed_offers_count === 0
        && x.executed_taker_gets_value === 0
        && x.executed_taker_pays_value === 0) return false;
  }
  return true;
}

async function filterActivityEvents(events) {
  await _trackedIssuersReady;
  return events.filter(isRenderableActivityEvent);
}

async function fetchNextBatch(key) {
  // Pull the next batch of older events into the local cache. Skip if
  // we're already loading or know there's nothing more on the server.
  // Returns the number of raw server rows consumed, which is not the
  // same as cache growth: a window can be 100% suppressed rows and
  // still be forward progress, because the cursor moved. Callers
  // topping up the cache must loop on this, not on events.length.
  const col = _columns[key];
  if (col.loading || col.exhausted) return 0;
  col.loading = true;
  try {
    const fetchSize = col.kind === 'activity' ? FETCH_BATCH * ACTIVITY_FETCH_MULTIPLIER : FETCH_BATCH;
    const raw = await fetchEvents({ kind: col.kind, before_iso: col.oldestCursor, limit: fetchSize });
    if (raw.length === 0) {
      col.exhausted = true;
      return 0;
    }
    col.oldestCursor = new Date(raw[raw.length - 1].published_at * 1000).toISOString();
    const visible = col.kind === 'activity' ? await filterActivityEvents(raw) : raw;
    // Dedupe against existing cache by event_id - cursor windows can
    // briefly overlap if events with identical published_at straddle
    // the cursor boundary.
    const seen = new Set(col.events.map(e => e.event_id));
    for (const ev of visible) {
      if (!seen.has(ev.event_id)) col.events.push(ev);
    }
    return raw.length;
  } finally {
    col.loading = false;
  }
}

// Pull windows until the cache holds `target` renderable events.
// Bounded so a long spam-only stretch can't spin the browser through
// the whole history; the Show-more button remains available.
const MAX_TOPUP_FETCHES = 6;
async function fillCacheTo(key, target) {
  const col = _columns[key];
  for (let i = 0; i < MAX_TOPUP_FETCHES; i++) {
    if (col.events.length >= target || col.exhausted) return;
    const consumed = await fetchNextBatch(key);
    if (!consumed) return;  // server had nothing more
  }
}

function annotateCrossLinks() {
  // News event whose target_addresses[] hits a currently-visible whale
  // event's sender/receiver within a 4h window gets _linked_whales[]
  // attached. Recomputed on every reveal so links pop in as the
  // activity column extends.
  const FOUR_HOURS = 4 * 60 * 60;
  const addrIndex = {};
  const visibleActivity = _columns.activity.events.slice(0, _columns.activity.shown);
  for (const w of visibleActivity) {
    if (!(w.source_appearances || []).includes('whale_xrpl')) continue;
    const au = w.active_utility || {};
    const ts = w.published_at || 0;
    if (au.sender_address)   (addrIndex[au.sender_address]   = addrIndex[au.sender_address]   || []).push({ ev: w, ts });
    if (au.receiver_address) (addrIndex[au.receiver_address] = addrIndex[au.receiver_address] || []).push({ ev: w, ts });
  }
  const visibleNews = _columns.news.events.slice(0, _columns.news.shown);
  for (const e of visibleNews) {
    delete e._linked_whales;
    const newsTs = e.published_at || 0;
    const linked = [];
    for (const addr of (e.target_addresses || [])) {
      for (const candidate of (addrIndex[addr] || [])) {
        if (Math.abs(newsTs - candidate.ts) <= FOUR_HOURS) {
          linked.push(candidate.ev);
          break;
        }
      }
    }
    if (linked.length) e._linked_whales = linked;
  }
}

async function loadColumnInitial(key) {
  const col = _columns[key];
  col.events = [];
  col.shown = 0;
  col.oldestCursor = null;
  col.exhausted = false;
  col.error = null;
  col.loading = false;
  renderColumn(key);  // skeleton
  try {
    // Top up like showMore does: one fetch window can be almost
    // entirely suppressed rows (a single issuer flooding escrows),
    // which used to leave the column showing one card.
    await fillCacheTo(key, INITIAL_VISIBLE);
    col.shown = Math.min(INITIAL_VISIBLE, col.events.length);
    annotateCrossLinks();
    renderColumn(key);
  } catch (e) {
    col.error = failureText(e && e.status);
    renderColumn(key);
  }
}

async function showMore(key) {
  const col = _columns[key];
  if (col.loading) return;
  // Top up the cache so we always have at least REVEAL_BATCH more
  // ready behind what we're about to show.
  await fillCacheTo(key, col.shown + REVEAL_BATCH + REVEAL_PREFETCH_MARGIN);
  col.shown = Math.min(col.events.length, col.shown + REVEAL_BATCH);
  annotateCrossLinks();
  renderColumn(key);
}

function renderColumn(key) {
  const col = _columns[key];
  const list = document.getElementById(col.listId);
  const nav = document.getElementById(col.navId);
  const countEl = document.getElementById(col.countId);

  if (countEl) {
    countEl.textContent = col.shown
      ? `${col.shown} event${col.shown === 1 ? '' : 's'}${col.exhausted && col.events.length === col.shown ? ' (end of feed)' : ''}`
      : '';
  }

  let body;
  if (col.loading && col.shown === 0) {
    body = `
      <div class="bg-ink border border-border rounded-lg p-4">
        <div class="skeleton-bar h-4 w-3/4 mb-3"></div>
        <div class="skeleton-bar h-3 w-1/2"></div>
      </div>
      <div class="bg-ink border border-border rounded-lg p-4">
        <div class="skeleton-bar h-4 w-2/3 mb-3"></div>
        <div class="skeleton-bar h-3 w-1/3"></div>
      </div>`;
  } else if (col.error) {
    body = `<div class="bg-ink border border-border rounded-lg p-4 text-sm text-muted">${escapeHtml(col.error)} <button data-nav="retry" data-col="${key}" class="text-accent hover:underline ml-1">Retry</button></div>`;
  } else if (col.shown === 0) {
    body = `<div class="bg-ink border border-border rounded-lg p-4 text-sm text-muted">${col.emptyMsg}</div>`;
  } else {
    body = col.events.slice(0, col.shown).map(renderEvent).join('');
  }
  list.innerHTML = body;

  // Show more button. Disabled while loading the next batch; replaced
  // by a muted End-of-feed marker once the server reports exhausted.
  const moreAvailable = !col.exhausted || col.events.length > col.shown;
  nav.className = 'mt-3';
  if (col.error || col.shown === 0) {
    nav.innerHTML = '';  // error, skeleton or empty state; no button needed
  } else if (!moreAvailable) {
    nav.innerHTML = `<div class="text-center text-xs text-muted py-3 border-t border-border">End of feed</div>`;
  } else {
    nav.innerHTML = `<button data-nav="more" data-col="${key}"
      class="w-full bg-ink border border-border hover:border-accent text-sm text-muted hover:text-white transition rounded-lg p-3"
      ${col.loading ? 'disabled' : ''}>${col.loading ? 'Loading...' : `Show ${REVEAL_BATCH} more`}</button>`;
  }
}

// Delegated handler: one listener for both columns' Show-more / Retry.
document.getElementById('feed').addEventListener('click', (ev) => {
  const btn = ev.target.closest('button[data-nav]');
  if (!btn) return;
  const key = btn.dataset.col;
  const action = btn.dataset.nav;
  if (!_columns[key]) return;
  if (action === 'more') showMore(key);
  else if (action === 'retry') loadColumnInitial(key);
});

// Ledger-wide object counts + supply. Free endpoint, no x402.
// Deliberately renders NOTHING rather than zeroes when the series is still
// bootstrapping: Pulse returns latest=null until the first daily sample
// lands, and a grid of "0 PermissionedDomains" would be a false claim about
// the ledger rather than an honest "not measured yet".
const PRIMITIVE_TILES = [
  ['PermissionedDomain', 'Permissioned domains', 'XLS-80 gated venues'],
  ['Credential', 'Credentials', 'XLS-70 issued attestations'],
  ['DID', 'DIDs', 'on-ledger identifiers'],
  ['Oracle', 'Price oracles', 'XLS-47'],
  ['MPTokenIssuance', 'MPT issuances', 'XLS-33 multi-purpose tokens'],
  ['Escrow', 'Escrows', 'time/condition locked'],
];

function fmtCount(n) {
  if (n === null || n === undefined) return '--';
  return n.toLocaleString('en-US');
}

function fmtXrp(n) {
  if (!n && n !== 0) return '--';
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return Math.round(n / 1e3) + 'K';
  return Math.round(n).toLocaleString('en-US');
}

async function loadPrimitives() {
  const meta = document.getElementById('primitives-meta');
  const grid = document.getElementById('primitives-grid');
  if (!grid) return;
  try {
    const r = await fetch(`${API_BASE}/stats/xrpl-primitives`, { cache: 'no-store' });
    if (!r.ok) { if (meta) meta.textContent = 'unavailable'; return; }
    const body = await r.json();
    const latest = body && body.latest;
    if (!latest) {
      if (meta) meta.textContent = 'first sample pending';
      return;
    }
    const counts = latest.counts || {};
    const dprev = (body.deltas && body.deltas.since_previous) || {};
    grid.innerHTML = PRIMITIVE_TILES.map(([key, label, sub]) => {
      const d = dprev[key];
      // Only show a delta when we actually measured one. A missing count on
      // either side yields null upstream, which must not render as "0".
      const chip = (typeof d === 'number' && d !== 0)
        ? `<span class="stat-tile-sub ${d > 0 ? 'text-emerald-400' : 'text-rose-400'}">${d > 0 ? '+' : '\u2212'}${Math.abs(d)}</span>`
        : '';
      return `<div class="stat-tile p-4">
        <h3 class="stat-tile-label mb-2">${label}</h3>
        <div class="flex flex-wrap items-baseline gap-x-2">
          <span class="stat-tile-value">${fmtCount(counts[key])}</span>${chip}
        </div>
        <p class="stat-tile-sub mt-2">${sub}</p>
      </div>`;
    }).join('');
    const sup = latest.supply || {};
    const amm = latest.amm || {};
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set('primitives-circulating', fmtXrp(sup.circulating_xrp));
    set('primitives-escrowed', fmtXrp(sup.escrowed_xrp));
    set('primitives-burned', fmtXrp(sup.burned_xrp));
    set('primitives-amm', fmtCount(amm.count));
    set('primitives-amm-locked', fmtXrp(amm.xrp_locked));
    if (meta) meta.textContent = latest.sample_date + ' UTC';
  } catch {
    if (meta) meta.textContent = 'unavailable';
  }
}

async function loadWhaleSummary() {
  // Pull pre-bucketed 24h aggregates from /stats/whale-flow-24h. The
  // server filters to INSTITUTIONAL_FLOW + WHALE_MOVE tiers and
  // returns 24 oldest-first hourly buckets. Free endpoint, no x402.
  // Replaces the prior /events/recent walk which got capped by the
  // bucket allocator at limit=500 and so only covered ~6h at the
  // dense $50k+ stream the chart asks for.
  try {
    const r = await fetch(`${API_BASE}/stats/whale-flow-24h`);
    if (!r.ok) return;
    const body = await r.json();
    if (!body || body.available === false) return;
    const totals = body.totals || {};
    const inst = {
      total_usd: totals.institutional_usd || 0,
      count: totals.institutional_count || 0,
    };
    const whale = {
      total_usd: totals.whale_usd || 0,
      count: totals.whale_count || 0,
    };
    const hourly = new Array(24).fill(0);
    const buckets = body.hourly || [];
    for (let i = 0; i < buckets.length && i < 24; i++) {
      const b = buckets[i] || {};
      hourly[i] = (b.institutional_usd || 0) + (b.whale_usd || 0);
    }
    renderWhaleSummary({ inst, whale, hourly });
  } catch {
    // Best-effort; the summary chart is decorative relative to the columns.
  }
}

// Derive the whale-tier for a single event, mirroring the same
// priority used by renderEvent: server-side `active_utility.tier`
// wins when present; otherwise fall back to value-based inference
// for legacy events that pre-date Pulse 1.14.0. Identity-based
// overrides (watchlist match) aren't reproducible client-side
// without the watchlist, so legacy events tier-classify by value
// alone.
function inferWhaleTier(e) {
  const au = e.active_utility || {};
  if (au.tier) return au.tier;
  if (au.signal !== 'whale_transfer') return null;
  const usd = typeof au.usd_value === 'number' ? au.usd_value : 0;
  if (usd >= 10_000_000) return 'INSTITUTIONAL_FLOW';
  if (usd >= 1_000_000)  return 'WHALE_MOVE';
  return 'NORMAL_ACTIVITY';
}

function renderWhaleSummary(stats) {
  const instUsd = document.getElementById('stat-inst-usd');
  const instCount = document.getElementById('stat-inst-count');
  const whaleUsd = document.getElementById('stat-whale-usd');
  const whaleCount = document.getElementById('stat-whale-count');
  if (instUsd) instUsd.textContent = fmtUsd(stats.inst.total_usd);
  if (instCount) instCount.textContent = stats.inst.count === 1
    ? 'across 1 transaction'
    : `across ${stats.inst.count} transactions`;
  if (whaleUsd) whaleUsd.textContent = fmtUsd(stats.whale.total_usd);
  if (whaleCount) whaleCount.textContent = stats.whale.count === 1
    ? 'across 1 transaction'
    : `across ${stats.whale.count} transactions`;
  const chart = document.getElementById('hourly-chart');
  if (!chart) return;
  const max = Math.max(...stats.hourly, 1);
  // Each bar's height is its share of the busiest hour. min-height
  // of 1px keeps zero-volume hours visually present so the timeline
  // reads correctly (vs. disappearing entirely).
  // Scale: the busiest hour's value sits at the top edge of the bars,
  // and the caption names the peak (design review 2026-10-27: the bars
  // had no scale at all).
  const peakIdx = stats.hourly.indexOf(Math.max(...stats.hourly));
  const peakVal = stats.hourly[peakIdx] || 0;
  const peakAgo = 23 - peakIdx;
  const detailEl = document.getElementById('hourly-chart-detail');
  if (detailEl && peakVal > 0) {
    const when = peakAgo === 0 ? 'this hour' : `${peakAgo}h ago`;
    detailEl.dataset.default = `Peak ${fmtUsd(peakVal)}, ${when}`;
    detailEl.textContent = detailEl.dataset.default;
  }
  const scaleLabel = peakVal > 0
    ? `<span class="absolute text-[9px] text-muted font-mono pointer-events-none" style="left: 6px; top: 1px;" aria-hidden="true">${escapeHtml(fmtUsd(peakVal))}</span>`
      + `<span class="absolute border-t border-dashed border-border pointer-events-none" style="left: 12px; right: 12px; top: 12px;" aria-hidden="true"></span>`
    : '';
  chart.innerHTML = scaleLabel + stats.hourly.map((v, i) => {
    const heightPct = (v / max) * 100;
    const hoursAgo = 23 - i;
    const label = hoursAgo === 0
      ? 'this hour'
      : hoursAgo === 1
      ? '1h ago'
      : `${hoursAgo}h ago`;
    // Direct child of the flex-items-end container with an
    // explicit height-% relative to that container's content box.
    // The previous nested flex-col approach had no resolvable
    // anchor for the inner element's height, so all bars
    // collapsed to zero regardless of value.
    // The title attribute is desktop-only (iOS Safari ignores it on
    // touch); the parent's tap handler updates the detail caption
    // above the chart so mobile users see the same info.
    const cls = v > 0 ? 'bg-accent/40 hover:bg-accent active:bg-accent cursor-pointer' : 'bg-border/40';
    const minPx = v > 0 ? 4 : 1;
    return `<div class="flex-1 ${cls} rounded-sm transition-colors"
                 style="height: ${heightPct}%; min-height: ${minPx}px;"
                 data-detail="${label} · ${fmtUsd(v)}"
                 title="${label}: ${fmtUsd(v)}"></div>`;
  }).join('');
  // Touch/click delegation: tap a bar -> update the caption above
  // the chart. The caption falls back to the default after 4s of
  // inactivity so the chart doesn't get stuck on a stale value.
  const detail = document.getElementById('hourly-chart-detail');
  if (detail && !chart._tapWired) {
    chart._tapWired = true;
    let resetTimer = null;
    const showDetail = (e) => {
      const bar = e.target.closest('[data-detail]');
      if (!bar) return;
      detail.textContent = bar.dataset.detail;
      if (resetTimer) clearTimeout(resetTimer);
      resetTimer = setTimeout(() => {
        detail.textContent = detail.dataset.default || 'US dollars, both tiers combined';
      }, 4000);
    };
    chart.addEventListener('click', showDetail);
    chart.addEventListener('touchstart', showDetail, { passive: true });
  }
}

document.getElementById('refresh-btn').addEventListener('click', () => {
  // Refresh = drop both columns' caches and reload from the most-
  // recent events, plus re-fetch the 24h whale summary.
  loadColumnInitial('news');
  loadColumnInitial('activity');
  loadWhaleSummary();
});

// ----------------------------------------------------------------------
// 24h whale strip. Pulls $1M+ XRPL transfers from the last 24 hours
// via POST /events/recent (kind=activity, min_whale_usd=1000000) and
// re-fetches on a timer. Renders one compact row per move with the
// tier badge, USD value, currency, sender -> receiver. Source is the
// same paid endpoint agents call; the marketing site reads it free
// via the preview-token JWT (Turnstile-issued by Cloudflare Pages).
// ----------------------------------------------------------------------
(function whales24h() {
  const listEl         = document.getElementById('whale-24h-list');
  const metaEl         = document.getElementById('whale-24h-meta');
  const todayUsdEl     = document.getElementById('whale-day-today-usd');
  const todayCntEl     = document.getElementById('whale-day-today-count');
  const todayCovEl     = document.getElementById('whale-day-today-coverage');
  const yestUsdEl      = document.getElementById('whale-day-yest-usd');
  const yestCntEl      = document.getElementById('whale-day-yest-count');
  const yestCovEl      = document.getElementById('whale-day-yest-coverage');
  const yestLabelEl    = document.getElementById('whale-day-yest-label');
  if (!listEl) return;

  const TELEMETRY_BASE = 'https://telemetry.xrpl-utilities.io';
  // Cache the last-seen UTC-day settlement totals across refresh
  // ticks so a transient Telemetry hiccup doesn't blank the
  // coverage line (we just keep the previous value visible).
  const settlementByDay = {};  // 'YYYY-MM-DD' -> total_usd
  // Cache the last-seen Pulse whale $ totals so coverage updates
  // can run as soon as either side's fetch lands, without waiting
  // for the other.
  const whaleByDay      = {};  // 'YYYY-MM-DD' -> { usd, count }

  const REFRESH_MS = 60000;
  const LIMIT      = 500;     // candidate budget; we filter to whales >=$1M
  const MIN_USD    = 1000000;

  function formatRel(unixSec) {
    const d = Math.max(0, Math.floor(Date.now() / 1000 - unixSec));
    if (d < 60)     return d + 's ago';
    if (d < 3600)   return Math.floor(d / 60) + 'm ago';
    if (d < 86400)  return Math.floor(d / 3600) + 'h ago';
    return Math.floor(d / 86400) + 'd ago';
  }

  function formatUsdShort(n) {
    if (typeof n !== 'number' || !isFinite(n)) return '';
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(0) + 'k';
    return '$' + n.toFixed(0);
  }

  function shortAddr(addr) {
    if (!addr || typeof addr !== 'string') return '';
    if (addr.length <= 10) return addr;
    return addr.slice(0, 5) + '...' + addr.slice(-4);
  }

  function partyLabel(label, addr) {
    if (label) return escapeHtml(label);
    return '<span class="font-mono text-muted/80">' + escapeHtml(shortAddr(addr)) + '</span>';
  }

  function tierBadgeHtml(tier) {
    const map = {
      INSTITUTIONAL_FLOW:  ['institutional', 'tier-institutional'],
      WHALE_MOVE:          ['whale',         'tier-whale'],
      EXCHANGE_LOGISTICS:  ['exchange',      'tier-exchange'],
    };
    if (!map[tier]) return '';
    return '<span class="text-[10px] px-1.5 py-0.5 rounded ' + map[tier][1] + ' border">' + map[tier][0] + '</span>';
  }

  function rowHtml(ev) {
    const au   = ev.active_utility || {};
    const usd  = formatUsdShort(au.usd_value);
    const cur  = au.currency || '';
    const amt  = au.amount_display || '';
    const tier = au.tier;
    const sndr = partyLabel(au.sender_label, au.sender_address);
    const rcvr = partyLabel(au.receiver_label, au.receiver_address);
    const when = formatRel(ev.published_at || 0);
    const explorer = ev.primary_url
      ? '<a href="' + escapeHtml(safeUrl(ev.primary_url)) + '" target="_blank" rel="noopener" class="text-muted hover:text-accent transition">tx ↗</a>'
      : '';

    return [
      '<div class="py-3 grid grid-cols-[auto_1fr_auto] items-baseline gap-3 text-sm">',
        '<div class="flex items-baseline gap-2 min-w-0">',
          '<span class="font-semibold text-white tabular-nums">', usd, '</span>',
          cur ? '<span class="text-[10px] uppercase tracking-wider text-muted">' + escapeHtml(cur) + '</span>' : '',
          tierBadgeHtml(tier),
        '</div>',
        '<div class="text-muted truncate">',
          sndr, ' <span class="text-muted">&rarr;</span> ', rcvr,
          amt ? '<span class="text-[10px] text-muted ml-2 font-mono">' + escapeHtml(amt) + '</span>' : '',
        '</div>',
        '<div class="text-[10px] text-muted font-mono whitespace-nowrap flex items-center gap-2">',
          when,
          explorer,
        '</div>',
      '</div>',
    ].join('');
  }

  async function load() {
    try {
      const headers = await (window.PreviewToken
        ? window.PreviewToken.authHeaders()
        : Promise.resolve({}));
      // Allow the Lineage page to deep-link a specific time window
      // via ?since=<unix-seconds>. Falls back to the rolling 24h
      // window when the URL param is absent or unparseable.
      let since;
      const sinceParam = new URLSearchParams(location.search).get('since');
      const sinceUnix = sinceParam ? parseInt(sinceParam, 10) : NaN;
      if (Number.isFinite(sinceUnix) && sinceUnix > 0) {
        since = new Date(sinceUnix * 1000).toISOString();
      } else {
        since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      }
      const r = await fetch(API_BASE + '/events/recent', {
        method: 'POST',
        headers: Object.assign({ 'Content-Type': 'application/json' }, headers),
        body: JSON.stringify({
          kind: 'activity',
          limit: LIMIT,
          since_iso: since,
          min_whale_usd: MIN_USD,
        }),
      });
      if (!r.ok) {
        const err = new Error('http ' + r.status);
        err.status = r.status;
        throw err;
      }
      const data  = await r.json();
      const all   = data.events || [];
      // Filter to whale_xrpl rows only; the activity bucket also
      // includes sentinel_signal, permissioned_domain, and RWA rows
      // which aren't whale transfers and don't belong here.
      const whales = all.filter(e =>
        (e.source_appearances || []).includes('whale_xrpl')
        && (e.active_utility || {}).usd_value >= MIN_USD
      );

      if (whales.length === 0) {
        listEl.innerHTML = '<div class="py-8 text-center text-sm text-muted">No XRPL transfers above $1M in the last 24 hours.</div>';
        metaEl.textContent = '0 whales';
        listEl.dataset.loaded = '1';
        return;
      }

      let totalUsd = 0;
      for (const e of whales) totalUsd += (e.active_utility || {}).usd_value || 0;
      metaEl.textContent = whales.length + ' whales · ' + formatUsdShort(totalUsd) + ' total';

      listEl.innerHTML = whales.map(rowHtml).join('');
      listEl.dataset.loaded = '1';
    } catch (e) {
      // Soft-fail: a list that loaded before stays in place, marked as
      // possibly out of date. A list that never loaded swaps its
      // skeleton for a plain message instead of shimmering forever.
      if (!listEl.dataset.loaded) {
        listEl.textContent = '';
        const msg = document.createElement('div');
        msg.className = 'py-8 text-center text-sm text-muted';
        msg.textContent = failureText(e && e.status);
        listEl.appendChild(msg);
        if (metaEl) metaEl.textContent = 'paused';
      } else if (metaEl && !metaEl.textContent.includes('stale')) {
        metaEl.textContent = (metaEl.textContent || '') + ' (stale)';
      }
    }
  }

  // ----- daily totals (today running + yesterday final) -----
  // Yesterday is sourced from /stats/whale-flow-history (authoritative
  // UTC-day rollup of WHALE_MOVE + INSTITUTIONAL_FLOW tiers, source=
  // events_rollup). Today is computed live from /events/recent since
  // 00:00 UTC, filtered strictly to whale_xrpl >= $1M so it matches
  // the framing of the list above. Both refresh on the same 60s tick.

  function utcDateStr(d) {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }

  // Donut geometry: r=42 → circumference = 2 * pi * 42 ≈ 263.89.
  const DONUT_CIRC = 263.89;
  const donutArc      = document.getElementById('coverage-donut-arc');
  const donutPctEl    = document.getElementById('coverage-donut-pct');
  const donutWhaleEl  = document.getElementById('coverage-donut-whale-usd');
  const donutTotalEl  = document.getElementById('coverage-donut-total-usd');

  function paintCoverage(key) {
    // Recompute the coverage line whenever either side updates.
    const target = key === 'today' ? todayCovEl : yestCovEl;
    if (!target) return;
    const dayKey = key === 'today' ? whaleByDay.__today_key__ : whaleByDay.__yest_key__;
    if (!dayKey) return;
    const whale = whaleByDay[dayKey];
    const total = settlementByDay[dayKey];
    if (whale === undefined || total === undefined || !total) {
      // Leave the previous text in place (or '--' on first load).
      return;
    }
    const pct = (whale.usd / total) * 100;
    target.textContent = pct.toFixed(1) + '%';

    // Donut: yesterday is the visualized number (final). Today is a
    // running snapshot so the arc would jitter if we drove it from
    // there.
    if (key === 'yesterday' && donutArc) {
      const clamped = Math.max(0, Math.min(100, pct));
      const offset  = DONUT_CIRC * (1 - clamped / 100);
      donutArc.setAttribute('stroke-dashoffset', String(offset));
      if (donutPctEl)   donutPctEl.textContent   = clamped.toFixed(0) + '%';
      if (donutWhaleEl) donutWhaleEl.textContent = formatUsdShort(whale.usd);
      if (donutTotalEl) donutTotalEl.textContent = formatUsdShort(total);
    }
  }

  async function loadSettlement() {
    try {
      const r = await fetch(TELEMETRY_BASE + '/settlement/series?days=3');
      if (!r.ok) return;
      const data = await r.json();
      for (const row of (data.series || [])) {
        const d = new Date((row.bucket_start_ts || 0) * 1000);
        const k = utcDateStr(d);
        settlementByDay[k] = row.total_usd || 0;
      }
      paintCoverage('today');
      paintCoverage('yesterday');
    } catch (_) { /* leave last good values */ }
  }

  async function loadDailyTotals() {
    const now    = new Date();
    const todayStart = new Date(Date.UTC(
      now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0,
    ));
    const todayStr = utcDateStr(now);
    const yestDate = new Date(todayStart.getTime() - 24 * 3600 * 1000);
    const yestStr  = utcDateStr(yestDate);
    if (yestLabelEl) yestLabelEl.textContent = yestStr;
    whaleByDay.__today_key__ = todayStr;
    whaleByDay.__yest_key__  = yestStr;

    const headers = await (window.PreviewToken
      ? window.PreviewToken.authHeaders()
      : Promise.resolve({}));
    const baseHeaders = Object.assign({ 'Content-Type': 'application/json' }, headers);

    // Today (running): live aggregate from events table, strict >=$1M.
    try {
      const r = await fetch(API_BASE + '/events/recent', {
        method: 'POST',
        headers: baseHeaders,
        body: JSON.stringify({
          kind: 'activity',
          limit: LIMIT,
          since_iso: todayStart.toISOString(),
          min_whale_usd: MIN_USD,
        }),
      });
      if (r.ok) {
        const data = await r.json();
        let usd = 0; let cnt = 0;
        for (const e of (data.events || [])) {
          if (!(e.source_appearances || []).includes('whale_xrpl')) continue;
          const v = (e.active_utility || {}).usd_value;
          if (typeof v !== 'number' || v < MIN_USD) continue;
          usd += v; cnt += 1;
        }
        if (todayUsdEl) todayUsdEl.textContent = cnt ? formatUsdShort(usd) : '$0';
        if (todayCntEl) {
          todayCntEl.textContent = (cnt >= LIMIT ? '≥ ' : '') + cnt + ' tx' + (cnt === 1 ? '' : 's');
        }
        whaleByDay[todayStr] = { usd, count: cnt };
        paintCoverage('today');
      }
    } catch (_) { /* leave last good values in place */ }

    // Yesterday (final): authoritative tier rollup. The endpoint also
    // sometimes includes a partial today row if the hourly rollup
    // pass has run since midnight - we pick yesterday's date
    // explicitly rather than 'last entry' so a partial today doesn't
    // get mistaken for yesterday.
    try {
      const r = await fetch(API_BASE + '/stats/whale-flow-history?days=3', { headers });
      if (r.ok) {
        const data = await r.json();
        const series = data.series || [];
        const yest = series.find(row => row.snapshot_date === yestStr);
        if (yest) {
          // Prefer the strict >=$1M aggregate when available (Pulse
          // 1.39.0+). Falls back to the tier sum when null, which
          // happens for rows whose source day predates the events-
          // retention window (the rollup loop can't backfill strict
          // fields without the raw event rows).
          const hasStrict = (yest.strict_1m_usd !== null && yest.strict_1m_usd !== undefined);
          const usd = hasStrict
            ? yest.strict_1m_usd
            : ((yest.institutional_usd || 0) + (yest.whale_usd || 0));
          const cnt = hasStrict
            ? yest.strict_1m_count
            : ((yest.institutional_count || 0) + (yest.whale_count || 0));
          if (yestUsdEl) yestUsdEl.textContent = formatUsdShort(usd);
          if (yestCntEl) {
            yestCntEl.textContent = cnt + ' tx' + (cnt === 1 ? '' : 's')
              + (hasStrict ? '' : ' (tier-approx)');
          }
          whaleByDay[yestStr] = { usd, count: cnt };
          paintCoverage('yesterday');
        } else if (yestUsdEl) {
          // The rollup writes yesterday's row shortly after UTC midnight.
          // Until it lands the total is unknown, not zero (the card read
          // zero at 00:08 UTC on 2026-10-28 for a $300M+ day).
          yestUsdEl.textContent = '--';
          if (yestCntEl) yestCntEl.textContent = 'final tally pending';
        }
      }
    } catch (_) { /* leave last good values in place */ }
  }

  function refreshAll() {
    load();
    loadDailyTotals();
    loadSettlement();
  }

  let timer = null;
  function startTimer() {
    if (timer === null) timer = setInterval(refreshAll, REFRESH_MS);
  }
  function stopTimer() {
    if (timer !== null) { clearInterval(timer); timer = null; }
  }

  refreshAll();
  startTimer();
  // Pause polling when the tab is hidden to save the preview-token
  // quota; refresh once and restart the timer on tab-show.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stopTimer();
    } else {
      refreshAll();
      startTimer();
    }
  });
})();

// ----------------------------------------------------------------------
// (previous WebSocket billboard removed - data semantics were wrong:
//  RWA daily-snapshot events carry the underlying ledger-time as
//  published_at, which made days-old activity surface as "live" rows.
//  The 24h whale strip above gives a clean fresh-data demo. Streaming
//  endpoints (/stream/purchase + /stream + /stream/preview-token)
//  stay live in the backend for agent consumers.)
// ----------------------------------------------------------------------

// ----------------------------------------------------------------------
// RWA SUPPLY TRACKER. Static panel showing current RLUSD obligations
// (from /stats/rwa-summary, the public free snapshot) plus today's
// UTC running net change derived from rwa_obligations_delta events
// (mints add, redemptions subtract). Refreshes on a timer. The whole
// panel is the static counterpart to the live event feed: instead
// of scrolling past mints in the activity column, this tile counts
// them up and shows the standing supply at a glance.
// ----------------------------------------------------------------------
(function rwaSupply() {
  const supplyEl = document.getElementById('rlusd-supply-value');
  const badgeEl  = document.getElementById('rlusd-delta-badge');
  if (!supplyEl) return;

  const REFRESH_MS = 60000;
  const RLUSD_LABEL = 'Ripple RLUSD';

  function formatBig(n) {
    if (!isFinite(n)) return '--';
    if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(2) + 'M';
    if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(0) + 'k';
    return n.toFixed(0);
  }

  async function load() {
    try {
      const r = await fetch('https://pulse.xrpl-utilities.io/stats/rwa-summary');
      if (!r.ok) return;
      const data = await r.json();
      const rlusd = (data.issuers || []).find(i => i.logical_label === RLUSD_LABEL);
      if (!rlusd) return;

      // Prefer the fresh ledger reading. live_circulating and its change
      // since the 00:00 UTC reading are published only when the reading is
      // under an hour old; otherwise fall back to the live obligations value
      // and to yesterday's whole-day change. The badge used to say "(24h)"
      // beside a live supply while carrying the change between the last two
      // daily readings, which by evening could be a day stale.
      const live = rlusd.live_circulating != null;
      const supplyVal = parseFloat(live ? rlusd.live_circulating
        : (rlusd.live_obligations || rlusd.obligations_raw || '0'));
      supplyEl.textContent = formatBig(supplyVal);
      const deltaNum = parseFloat(live ? rlusd.live_change_since_snapshot : rlusd.obligations_delta_today);
      const when = live ? 'since 00:00 UTC' : 'yesterday (UTC)';
      if (!isFinite(deltaNum) || Math.abs(deltaNum) < 1) {
        badgeEl.classList.add('hidden');
        return;
      }
      badgeEl.classList.remove('hidden');
      if (deltaNum > 0) {
        badgeEl.textContent = '↑ +' + formatBig(deltaNum) + ' net minted ' + when;
        badgeEl.className = 'text-xs px-2 py-1 rounded border font-semibold ml-2 '
          + 'text-green-400 border-green-500/50 bg-green-500/10';
      } else {
        badgeEl.textContent = '↓ -' + formatBig(Math.abs(deltaNum)) + ' net redeemed ' + when;
        badgeEl.className = 'text-xs px-2 py-1 rounded border font-semibold ml-2 '
          + 'text-red-400 border-red-500/50 bg-red-500/10';
      }
    } catch (_) {}
  }

  // One-shot Ethereum-RLUSD supply read. Single call to a public
  // Ethereum RPC for cross-chain context only; Pulse stays XRPL-
  // native data, this line just acknowledges RLUSD also lives on
  // other chains so consumers do not mistake the XRPL number for
  // total supply. Fails silently if Ethereum RPC is unreachable.
  async function loadEthereumCrossChain() {
    const el = document.getElementById('rlusd-eth-total');
    if (!el) return;
    try {
      const r = await fetch('https://ethereum-rpc.publicnode.com', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0', id: 1, method: 'eth_call',
          params: [{
            to: '0x8292Bb45bf1Ee4d140127049757C2E0fF06317eD',
            data: '0x18160ddd',
          }, 'latest'],
        }),
      });
      if (!r.ok) throw new Error('rpc-status');
      const result = (await r.json()).result;
      const total = parseInt(result, 16) / 1e18;
      if (!isFinite(total) || total <= 0) throw new Error('parse');
      el.textContent = formatBig(total);
    } catch (_) {
      el.textContent = 'unavailable';
    }
  }

  load();
  loadEthereumCrossChain();  // once on load, not on the refresh loop
  pollWhileVisible(load, REFRESH_MS);
})();

// ----------------------------------------------------------------------
// RLUSD mint->CEX distribution tile. Reads the free
// /stats/rlusd-distribution endpoint and shows where freshly minted
// RLUSD went over the trailing week: total distributed, the share that
// reached a named exchange, and the top exchange recipients. The
// to-exchange read is the corrective to mistaking a fresh RLUSD mint
// for XRP sell-pressure - RLUSD into a CEX is stablecoin provisioning.
// ----------------------------------------------------------------------
(function rlusdDistribution() {
  const totalEl  = document.getElementById('rlusd-dist-total');
  const pctEl    = document.getElementById('rlusd-dist-pct');
  const venuesEl = document.getElementById('rlusd-dist-venues');
  if (!totalEl) return;

  const REFRESH_MS = 300000;

  function fmtBig(n) {
    if (!isFinite(n)) return '--';
    if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(2) + 'M';
    if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(0) + 'k';
    return n.toFixed(0);
  }

  async function load() {
    try {
      const r = await fetch(API_BASE + '/stats/rlusd-distribution?days=7');
      if (!r.ok) return;
      const d = await r.json();
      totalEl.textContent = fmtBig(d.distributed_total_rlusd || 0);

      const pct = d.to_exchange_pct;
      if (pct !== null && pct !== undefined && isFinite(pct)) {
        pctEl.textContent = pct.toFixed(1) + '% to exchanges';
        pctEl.className = 'text-xs px-2 py-1 rounded border font-semibold ml-2 '
          + 'text-accent border-accent/40 bg-accent/10';
        pctEl.classList.remove('hidden');
      } else {
        pctEl.classList.add('hidden');
      }

      const byEx = (d.by_exchange || []).slice(0, 4);
      if (byEx.length) {
        venuesEl.innerHTML = byEx.map(e =>
          `<div class="flex items-center justify-between gap-3">`
          + `<span class="text-white">${escapeHtml(e.label || '?')}</span>`
          + `<span class="font-mono text-muted">${fmtBig(e.rlusd || 0)} RLUSD`
          + (e.tx_count ? ` <span class="opacity-60">(${e.tx_count})</span>` : '')
          + `</span></div>`
        ).join('');
      } else {
        venuesEl.innerHTML = '<div class="text-muted">No exchange-bound distribution in the last 7 days.</div>';
      }
    } catch (_) {}
  }

  load();
  pollWhileVisible(load, REFRESH_MS);
})();

loadColumnInitial('news');
loadColumnInitial('activity');
loadWhaleSummary();
loadPrimitives();
