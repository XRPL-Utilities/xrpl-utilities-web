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
    if (window.innerWidth >= 768) close();
  });
})();

// Initial values reflect Telemetry's live state as of 2026-04-28 (the
// launch day; all Tier-2 fields flipped to live, payments enabled).
// /healthz fetch on page load overwrites current_price_usd with the
// 60s-fresh oracle value; the rest stays at last-known-shipped values
// until a paid /scan returns a full TelemetryPayload.
const SNAPSHOT = {
  total_supply_xrp:        100_000_000_000,
  circulating_supply_xrp:   66_800_000_000, // total - escrow
  dormant_supply_xrp:        4_779_688_113,
  escrowed_supply_xrp:      33_200_000_000,
  // M used in Burst Math is now Modeled Active Float (additive:
  // exchange omnibus * 10% proxy + AMM + DEX). Live values land in
  // the 1.5-2B range; ~14.4B exchange omnibus * 0.10 + ~0.2B AMM +
  // ~0.001B DEX = ~1.64B. /scan results overwrite this on success.
  available_liquid_supply:   1_644_000_000,
  // Raw Active Float components. Stored separately so the slider
  // below can recompute available_liquid_supply at any ratio in the
  // 5-15% band without a backend round-trip. reanchorFromPayload
  // overwrites these with the live values from /scan.
  exchange_omnibus_xrp:     14_400_000_000,
  amm_locked_xrp:              200_000_000,
  dex_orderbook_depth_xrp:       1_000_000,
  proxy_ratio:                        0.10,
  current_price_usd:                 1.37, // overwritten by /healthz on load
};
const DEFAULTS = { Q: 10_000_000_000, V: 6 }; // $10B settlement window, velocity 6
const SNAPSHOT_AS_OF = '2026-04-28';

// ---- Burst Math ----
const fmtXrp = n => Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 }) + ' XRP';
// Standard USD display. 2 decimals once the value reaches a dollar
// (where sub-cent precision is rounding noise), up to 4 decimals for
// sub-dollar values where extra digits are real. Used everywhere the
// user is reading a market or chart number, not a calculated headline.
//   $1.1524 -> $1.15   $156.0976 -> $156.10   $0.0269 -> $0.0269
const fmtUsd4 = n => {
  const num = Number(n);
  if (!isFinite(num)) return '-';
  const opts = Math.abs(num) >= 1
    ? { minimumFractionDigits: 2, maximumFractionDigits: 2 }
    : { minimumFractionDigits: 2, maximumFractionDigits: 4 };
  return '$' + num.toLocaleString(undefined, opts);
};
// Equilibrium-price display. Looser threshold so the third/fourth
// decimal survives at the $1-$10 range where it carries meaning -
// a Burst Math floor of $1.014 vs $1.0143 is real signal at billion-
// unit M. Used for the headline equilibrium output and its mirrors
// (Burst Math P, Floor Matrix anchor / month-24 cards).
//   $1.014 -> $1.014   $9.999 -> $9.999   $10 -> $10.00   $156 -> $156.00
const fmtUsdEq = n => {
  const num = Number(n);
  if (!isFinite(num)) return '-';
  const opts = Math.abs(num) >= 10
    ? { minimumFractionDigits: 2, maximumFractionDigits: 2 }
    : { minimumFractionDigits: 2, maximumFractionDigits: 4 };
  return '$' + num.toLocaleString(undefined, opts);
};

const bmQ = document.getElementById('bm-q');
const bmV = document.getElementById('bm-v');
const bmM = document.getElementById('bm-m');           // displays M (liquid supply, XRP)
const bmP = document.getElementById('bm-p');           // displays P (implied price, USD/XRP)
const bmSpot = document.getElementById('bm-spot');
const bmSpotAsOf = document.getElementById('bm-spot-as-of');
const bmPremium = document.getElementById('bm-premium');

bmQ.value = DEFAULTS.Q;
bmV.value = DEFAULTS.V;
bmM.textContent = fmtXrp(SNAPSHOT.available_liquid_supply) + ' (as of ' + SNAPSHOT_AS_OF + ')';

// Active Float dual-card. Populate from SNAPSHOT on first paint; the
// numbers are operator-curated cached values that match the live
// additive methodology. A paid /scan path (reanchorFromPayload below)
// overwrites both with the actual derived_models.active_float values
// pulled from /results.
const afCirculatingEl = document.getElementById('af-circulating');
const afValueEl = document.getElementById('af-value');
const afDeltaEl = document.getElementById('af-delta');

function fmtXrpCompactInline(xrp) {
  const n = Number(xrp);
  if (!isFinite(n)) return '-';
  const abs = Math.abs(n);
  if (abs >= 1e9) return (n / 1e9).toFixed(2) + 'B XRP';
  if (abs >= 1e6) return (n / 1e6).toFixed(1) + 'M XRP';
  if (abs >= 1e3) return Math.round(n / 1e3) + 'k XRP';
  return Math.round(n).toLocaleString() + ' XRP';
}

function populateActiveFloatCard() {
  if (afCirculatingEl) afCirculatingEl.textContent = fmtXrpCompactInline(SNAPSHOT.circulating_supply_xrp);
  if (afValueEl) afValueEl.textContent = fmtXrpCompactInline(SNAPSHOT.available_liquid_supply);
}

function setActiveFloatDelta(deltaXrp, deltaPct) {
  if (!afDeltaEl) return;
  afDeltaEl.replaceChildren();
  // No data: leave empty (no placeholder text). Only shown after a
  // paid /scan delivers a real delta from the time-series snapshot.
  if (typeof deltaXrp !== 'number' || typeof deltaPct !== 'number') return;
  // A change that rounds to 0.00% is no change, not a red "-0.00%".
  if (Math.abs(deltaPct) < 0.005) return;
  const shrinking = deltaXrp < 0;
  const arrow = shrinking ? '↓' : '↑';
  const tone = shrinking ? 'text-bad' : 'text-good';
  const sign = shrinking ? '' : '+';
  const arrowSpan = document.createElement('span');
  arrowSpan.className = 'text-xl font-bold ' + tone;
  arrowSpan.textContent = arrow;
  afDeltaEl.appendChild(arrowSpan);
  const valSpan = document.createElement('span');
  valSpan.className = 'font-mono ' + tone;
  valSpan.textContent = sign + fmtXrpCompactInline(deltaXrp) + ' (' + sign + Number(deltaPct).toFixed(2) + '%)';
  afDeltaEl.appendChild(valSpan);
  const labelSpan = document.createElement('span');
  labelSpan.className = 'text-xs text-muted';
  labelSpan.textContent = '24h';
  afDeltaEl.appendChild(labelSpan);
}

populateActiveFloatCard();

// ---- Active Float proxy-ratio slider ----
// The 5-15% band is the empirically-defensible range for market-maker
// active orderbook depth as a fraction of custodial inventory (cited
// in burst_math.py). The slider lets a reader sweep that band and
// see the sensitivity downstream. M = (omnibus * ratio) + AMM + DEX,
// where the three components are pulled from the live /scan payload
// (or seeded from SNAPSHOT defaults until a live snapshot lands).
const afSlider = document.getElementById('af-ratio-slider');
const afRatioDisplay = document.getElementById('af-ratio-display');
const afRatioLabel = document.getElementById('af-ratio-label');
const afRatioProse = document.getElementById('af-ratio-prose');
const bmMRatio = document.getElementById('bm-m-ratio');
const bmMRatioProse = document.querySelectorAll('.bm-m-ratio-prose');

function fmtRatioPct(ratio) {
  const pct = ratio * 100;
  // Slider step is 0.5%, so one decimal is the meaningful precision.
  // Keep the trailing zero on whole numbers so "10.0%" doesn't jump
  // to "10%" mid-drag (small but visible alignment shift).
  return pct.toFixed(1) + '%';
}

function applyActiveFloatRatio(ratio) {
  SNAPSHOT.proxy_ratio = ratio;
  const af = (SNAPSHOT.exchange_omnibus_xrp * ratio)
           + SNAPSHOT.amm_locked_xrp
           + SNAPSHOT.dex_orderbook_depth_xrp;
  SNAPSHOT.available_liquid_supply = af;
  if (afValueEl) afValueEl.textContent = fmtXrpCompactInline(af);
  if (bmM) bmM.textContent = fmtXrp(af) + (ratio === 0.10 ? '' : ' (at ' + fmtRatioPct(ratio) + ')');
  const pctText = fmtRatioPct(ratio);
  if (afRatioDisplay) afRatioDisplay.textContent = (ratio * 100).toFixed(1);
  if (afRatioLabel) afRatioLabel.textContent = pctText;
  if (afRatioProse) afRatioProse.textContent = pctText;
  if (bmMRatio) bmMRatio.textContent = pctText;
  bmMRatioProse.forEach(el => { el.textContent = pctText; });
  // Recompute the Burst Math equilibrium price: P = Q / (V * M).
  recompute();
}

if (afSlider) {
  afSlider.addEventListener('input', () => {
    const ratio = Number(afSlider.value) / 100;
    if (isFinite(ratio) && ratio > 0) applyActiveFloatRatio(ratio);
  });
}
// Skeleton placeholder until /healthz fetch lands the live oracle value.
// Pulsing grey block sized to the eventual $1.3700 text so the tile has
// visual weight on first paint instead of a hyphen and 'loading…' flash.
// Static SNAPSHOT.current_price_usd is the fallback for fetch failure.
bmSpot.innerHTML = '<span class="inline-block h-10 w-36 bg-border rounded animate-pulse align-middle"></span>';
bmSpotAsOf.innerHTML = '<span class="inline-block h-3 w-24 bg-border rounded animate-pulse"></span>';

// P = Q / (V × M). Solve standard Equation of Exchange for price.
function currentP() {
  const q = Number(bmQ.value);
  const v = Number(bmV.value);
  const m = Number(SNAPSHOT.available_liquid_supply);
  if (!isFinite(q) || !isFinite(v) || !isFinite(m) || v <= 0 || m <= 0) return null;
  return q / (v * m);
}

function recompute() {
  const p = currentP();
  bmP.textContent = p == null ? '-' : fmtUsdEq(p);
  if (p == null || p <= 0) {
    bmPremium.textContent = '-';
  } else {
    const premium = SNAPSHOT.current_price_usd / p;
    bmPremium.textContent = premium.toFixed(2) + '×';
  }
  // Realized V = Q / (M × spot). The implicit velocity the
  // Equation of Exchange would require for P to equal today's
  // market spot, given the current Q + live M. When the user's
  // V input is well below this number, P diverges above market;
  // when the user's V matches, P collapses to market.
  const bmVRealized = document.getElementById('bm-v-realized');
  const bmVUseRealizedBtn = document.getElementById('bm-v-use-realized');
  if (bmVRealized) {
    const qRealized = Number(bmQ.value);
    const mRealized = SNAPSHOT.available_liquid_supply;
    const spotRealized = SNAPSHOT.current_price_usd;
    if (isFinite(qRealized) && qRealized > 0 && mRealized > 0 && spotRealized > 0) {
      const vReal = qRealized / (mRealized * spotRealized);
      bmVRealized.textContent = vReal.toFixed(1) + 'x';
      _lastRealizedV = vReal;
      if (bmVUseRealizedBtn) bmVUseRealizedBtn.disabled = false;
    } else {
      bmVRealized.textContent = '–';
      _lastRealizedV = null;
      if (bmVUseRealizedBtn) bmVUseRealizedBtn.disabled = true;
    }
  }
  updateFloorChart();
}
// Module-scoped so the click handler below can read the latest
// recomputed value without re-running the formula.
let _lastRealizedV = null;

bmQ.addEventListener('input', recompute);
bmV.addEventListener('input', recompute);

// "Use realized" loads today's realized V (Q / (M × spot)) into
// the V input so P collapses to spot. Same UX shape as the
// "Use measured" button next to Q. Rounded to 1 decimal place to
// match the displayed value.
const bmVUseRealizedBtnHandler = document.getElementById('bm-v-use-realized');
if (bmVUseRealizedBtnHandler) {
  bmVUseRealizedBtnHandler.addEventListener('click', () => {
    if (_lastRealizedV && _lastRealizedV > 0) {
      bmV.value = _lastRealizedV.toFixed(1);
      recompute();
    }
  });
}

// Restore the DEFAULTS value if the user clears Q or V to empty (or
// to a non-positive number) and tabs/clicks away. Without this, an
// accidental backspace-to-clear during testing leaves the forecast
// stuck in the empty 'Enter a positive Q and V...' state, which
// reads like a broken section even though the page is healthy.
bmQ.addEventListener('blur', () => {
  if (!bmQ.value || Number(bmQ.value) <= 0) {
    bmQ.value = DEFAULTS.Q;
    recompute();
  }
});
bmV.addEventListener('blur', () => {
  if (!bmV.value || Number(bmV.value) <= 0) {
    bmV.value = DEFAULTS.V;
    recompute();
  }
});

// ---- Measured settlement volume ----
// /settlement/totals (free) populates Box 1 + Box 2 + bootstrap badge
// and unlocks the "Use measured" button next to Q. /settlement/series
// pre-fetches all three buckets in parallel so the daily/weekly/monthly
// toggle is instant. Cache TTL is 5 min per bucket.
const TELEMETRY_API = 'https://telemetry.xrpl-utilities.io';
const SV_CACHE_TTL_MS = 5 * 60 * 1000;
const SV_BUCKETS = ['daily', 'weekly', 'monthly'];
const SV_COUNTS = { daily: 30, weekly: 12, monthly: 12 };
const svSeriesCache = {}; // bucket -> {ts, data}
let svMeasuredAnnualizedUsd = null;
let svChart = null;
let svActiveBucket = 'daily';

const sv24h = document.getElementById('sv-24h');
const sv24hSplit = document.getElementById('sv-24h-split');
const sv7d = document.getElementById('sv-7d');
const sv7dSplit = document.getElementById('sv-7d-split');
const sv30d = document.getElementById('sv-30d');
const sv30dSplit = document.getElementById('sv-30d-split');
const svAnnual = document.getElementById('sv-annual');
const svAnnualSplit = document.getElementById('sv-annual-split');
const svAnnual30d = document.getElementById('sv-annual-30d');
const svBootstrap30d = document.getElementById('sv-bootstrap-30d');
const svBootstrap = document.getElementById('sv-bootstrap');
const svUseMeasuredBtn = document.getElementById('bm-q-use-measured');

// Compact USD formatter for headline + axis ticks ($591.6M, $4.2B, $220B).
// Raw integers past 9 digits are unreadable as headlines.
// A measured zero must render as $0, never as the same dash we use for
// "no data". Conflating them is the exact failure this page's
// permissioned blocks exist to avoid: "we measured zero crossings" and
// "we have no reading" are different facts and must look different.
// Negatives are impossible for a volume and would indicate a bug, so
// they are rendered rather than hidden behind a dash.
const fmtUsdShort = n => {
  const num = Number(n);
  if (n === null || n === undefined || n === '' || !isFinite(num)) return '-';
  if (num === 0) return '$0';
  const abs = Math.abs(num);
  if (abs >= 1e12) return '$' + (num / 1e12).toFixed(2) + 'T';
  if (abs >= 1e9)  return '$' + (num / 1e9).toFixed(1) + 'B';
  if (abs >= 1e6)  return '$' + (num / 1e6).toFixed(1) + 'M';
  if (abs >= 1e3)  return '$' + (num / 1e3).toFixed(1) + 'K';
  return '$' + num.toFixed(0);
};

const fmtBucketLabel = (ts, bucket) => {
  const d = new Date(ts * 1000);
  if (bucket === 'monthly') {
    return d.toLocaleString(undefined, { month: 'short', year: '2-digit', timeZone: 'UTC' });
  }
  return d.toLocaleString(undefined, { month: 'short', day: '2-digit', timeZone: 'UTC' });
};

sv24h.innerHTML = '<span class="inline-block h-10 w-24 bg-border rounded animate-pulse align-middle"></span>';
sv7d.innerHTML = '<span class="inline-block h-10 w-24 bg-border rounded animate-pulse align-middle"></span>';
sv30d.innerHTML = '<span class="inline-block h-10 w-24 bg-border rounded animate-pulse align-middle"></span>';
svAnnual.innerHTML = '<span class="inline-block h-10 w-24 bg-border rounded animate-pulse align-middle"></span>';

fetch(TELEMETRY_API + '/settlement/totals')
  .then(r => r.ok ? r.json() : null)
  .then(d => {
    if (!d) {
      sv24h.textContent = '-';
      sv7d.textContent = '-';
      sv30d.textContent = '-';
      svAnnual.textContent = '-';
      return;
    }
    sv24h.textContent = fmtUsdShort(d.volume_24h_usd);
    sv7d.textContent = fmtUsdShort(d.volume_7d_usd);
    sv30d.textContent = typeof d.volume_30d_usd === 'number' ? fmtUsdShort(d.volume_30d_usd) : '-';
    svAnnual.textContent = fmtUsdShort(d.annualized_run_rate_usd);

    // Per-window splits + sub-lines.
    if (typeof d.volume_24h_xrp_usd === 'number' && typeof d.volume_24h_rlusd_usd === 'number') {
      sv24hSplit.textContent = fmtUsdShort(d.volume_24h_xrp_usd) + ' XRP · ' + fmtUsdShort(d.volume_24h_rlusd_usd) + ' RLUSD';
    } else {
      sv24hSplit.textContent = 'USD across XRP + RLUSD Payments';
    }
    if (typeof d.volume_7d_xrp_usd === 'number' && typeof d.volume_7d_rlusd_usd === 'number') {
      sv7dSplit.textContent = fmtUsdShort(d.volume_7d_xrp_usd) + ' XRP · ' + fmtUsdShort(d.volume_7d_rlusd_usd) + ' RLUSD';
    } else {
      sv7dSplit.textContent = '7-day total';
    }
    if (typeof d.volume_30d_xrp_usd === 'number' && typeof d.volume_30d_rlusd_usd === 'number') {
      sv30dSplit.textContent = fmtUsdShort(d.volume_30d_xrp_usd) + ' XRP · ' + fmtUsdShort(d.volume_30d_rlusd_usd) + ' RLUSD';
    } else {
      sv30dSplit.textContent = '30-day total';
    }
    if (typeof d.annualized_run_rate_xrp_usd === 'number' && typeof d.annualized_run_rate_rlusd_usd === 'number') {
      svAnnualSplit.textContent = fmtUsdShort(d.annualized_run_rate_xrp_usd) + ' XRP · ' + fmtUsdShort(d.annualized_run_rate_rlusd_usd) + ' RLUSD';
    } else {
      svAnnualSplit.textContent = '7d × 52 · pace, not a forecast';
    }
    // 30d-anchored variant as a sub-line so a visitor can compare the
    // two pace methodologies at a glance. Same arithmetic identity,
    // less burst-sensitive.
    if (typeof d.annualized_run_rate_30d_usd === 'number') {
      svAnnual30d.textContent = '30d pace: ' + fmtUsdShort(d.annualized_run_rate_30d_usd);
    }
    if (d.coverage && d.coverage.bootstrap === true) {
      svBootstrap.classList.remove('hidden');
    }
    if (d.coverage && d.coverage.bootstrap_30d === true && svBootstrap30d) {
      svBootstrap30d.classList.remove('hidden');
    }

    // Permissioned vs open-market split (schema 1.5.0+). Honest
    // rendering: when the backend hasn't shipped these fields yet
    // (older deploy), the section keeps its skeleton placeholders.
    // When share is 0%, the caveat block surfaces so a visitor
    // doesn't read "0%" as bug or stale data.
    const permPct = d.permissioned_share_24h_pct;
    const permUsd = d.volume_24h_permissioned_usd;
    const openUsd = d.volume_24h_open_market_usd;
    const permCount = d.volume_24h_permissioned_payments_count;
    const elPermPct = document.getElementById('sv-perm-pct');
    const elPermUsd = document.getElementById('sv-perm-usd');
    const elOpenUsd = document.getElementById('sv-open-usd');
    const elPermCount = document.getElementById('sv-perm-count');
    const elOpenPct = document.getElementById('sv-open-pct');
    const elPermCaveat = document.getElementById('sv-perm-caveat');
    if (typeof permPct === 'number' && elPermPct) {
      elPermPct.textContent = permPct.toFixed(2) + '%';
      if (permPct < 0.01) elPermCaveat?.classList.remove('hidden');
    } else if (elPermPct) {
      elPermPct.textContent = '–';
    }
    if (typeof permUsd === 'number' && elPermUsd) {
      elPermUsd.textContent = fmtUsdShort(permUsd);
    }
    if (typeof openUsd === 'number' && elOpenUsd) {
      elOpenUsd.textContent = fmtUsdShort(openUsd);
    }
    if (typeof permCount === 'number' && elPermCount) {
      elPermCount.textContent = permCount.toLocaleString('en-US') + ' payments';
    }

    // Permissioned DEX crossings (Telemetry 1.26.0). Rendered only when
    // the backend actually ships the fields, so an older deploy keeps its
    // skeleton rather than showing a fabricated zero.
    const pdexFills = d.permissioned_dex_24h_fill_count;
    const pdexUsd = d.permissioned_dex_24h_usd;
    const pdexUnpriced = d.permissioned_dex_24h_unpriced_fill_count;
    const pdexSince = d.permissioned_dex_measured_since_hour;
    const elPdexFills = document.getElementById('sv-pdex-fills');
    const elPdexUsd = document.getElementById('sv-pdex-usd');
    const elPdexUnpriced = document.getElementById('sv-pdex-unpriced');
    const elPdexCoverage = document.getElementById('sv-pdex-coverage');
    if (typeof pdexFills === 'number' && elPdexFills) {
      elPdexFills.textContent = pdexFills.toLocaleString('en-US');
    }
    if (typeof pdexUsd === 'number' && elPdexUsd) {
      elPdexUsd.textContent = fmtUsdShort(pdexUsd);
    }
    if (typeof pdexUnpriced === 'number' && elPdexUnpriced) {
      elPdexUnpriced.textContent = pdexUnpriced.toLocaleString('en-US')
        + (pdexUnpriced === 1 ? ' crossing' : ' crossings');
    }
    // A watermark means earlier hours were walked before this parser
    // existed. Their zeros are unmeasured, not measured zero, and saying
    // so is the whole reason the watermark is published.
    if (typeof pdexSince === 'number' && pdexSince > 0 && elPdexCoverage) {
      const since = new Date(pdexSince * 1000)
        .toISOString().replace('T', ' ').slice(0, 16);
      elPdexCoverage.textContent =
        'Crossing measurement begins ' + since + ' UTC. Hours before that were '
        + 'processed before this metric existed, so they are unmeasured rather '
        + 'than zero, and history earlier than that point is not comparable.';
      elPdexCoverage.classList.remove('hidden');
    }
    if (typeof permPct === 'number' && elOpenPct) {
      const openPctVal = Math.max(0, 100 - permPct);
      elOpenPct.textContent = openPctVal.toFixed(2) + '% of total';
    }

    // Use the XRP-only annualized run-rate for Burst Math's Q (floor-honest).
    // Fall back to combined if backend doesn't ship the split (older deploy).
    const measuredQ = (typeof d.annualized_run_rate_xrp_usd === 'number' && d.annualized_run_rate_xrp_usd > 0)
      ? d.annualized_run_rate_xrp_usd
      : d.annualized_run_rate_usd;
    if (typeof measuredQ === 'number' && measuredQ > 0) {
      svMeasuredAnnualizedUsd = measuredQ;
      if (svUseMeasuredBtn) svUseMeasuredBtn.disabled = false;
    }
  })
  .catch(() => {
    sv24h.textContent = '-';
    sv7d.textContent = '-';
    sv30d.textContent = '-';
    svAnnual.textContent = '-';
  });

if (svUseMeasuredBtn) {
  svUseMeasuredBtn.addEventListener('click', () => {
    if (svMeasuredAnnualizedUsd && svMeasuredAnnualizedUsd > 0) {
      bmQ.value = Math.round(svMeasuredAnnualizedUsd);
      recompute();
    }
  });
}

// ---- Measured DEX pair volume (schema 1.11.0+) ----
// Parallel to settlement totals but counts XRP/RLUSD order-book fills,
// not Payment deliveries. Same shape, different denominator. Renders
// gracefully when the backend hasn't shipped the endpoint yet.
const dpv24h = document.getElementById('dpv-24h');
const dpv24hSplit = document.getElementById('dpv-24h-split');
const dpvAnnual = document.getElementById('dpv-annual');
const dpvAnnualSplit = document.getElementById('dpv-annual-split');
const dpvBootstrap = document.getElementById('dpv-bootstrap');

dpv24h.innerHTML = '<span class="inline-block h-12 w-32 bg-border rounded animate-pulse align-middle"></span>';
dpvAnnual.innerHTML = '<span class="inline-block h-12 w-32 bg-border rounded animate-pulse align-middle"></span>';

// ---- Uptime (schema 1.13.0+) ----
// Pulls /uptime?days=30 and renders the 30d + 24h uptime aggregates.
// Honest bootstrap state: if backend reports bootstrap=true, the
// yellow banner surfaces with days_observed; the headline figure
// is shown as-is (possibly null on day-zero).
const sla30Pct = document.getElementById('sla-30d-pct');
const sla30Meta = document.getElementById('sla-30d-meta');
const sla24Pct = document.getElementById('sla-24h-pct');
const sla24Meta = document.getElementById('sla-24h-meta');
const slaInterval = document.getElementById('sla-interval');
const slaBootstrap = document.getElementById('sla-bootstrap');
const slaDaysObserved = document.getElementById('sla-days-observed');

const fmtPct = v => (v === null || v === undefined) ? '-' : v.toFixed(2) + '%';
const fmtSamples = w => {
  const n = w.samples_total || 0;
  if (n === 0) return 'no samples yet';
  const obs = (w.days_observed || 0).toFixed(1);
  return n.toLocaleString('en-US') + ' samples / ' + obs + 'd observed';
};

sla30Pct.innerHTML = '<span class="inline-block h-12 w-32 bg-border rounded animate-pulse align-middle"></span>';
sla24Pct.innerHTML = '<span class="inline-block h-12 w-32 bg-border rounded animate-pulse align-middle"></span>';

fetch(TELEMETRY_API + '/uptime?days=30')
  .then(r => r.ok ? r.json() : null)
  .then(d => {
    if (!d) {
      sla30Pct.textContent = '-';
      sla24Pct.textContent = '-';
      return;
    }
    sla30Pct.textContent = fmtPct(d.uptime_window_30d.uptime_pct);
    sla30Meta.textContent = fmtSamples(d.uptime_window_30d);
    sla24Pct.textContent = fmtPct(d.uptime_window_24h.uptime_pct);
    sla24Meta.textContent = fmtSamples(d.uptime_window_24h);
    const secs = Number(d.sample_interval_seconds);
    slaInterval.textContent = secs > 0 ? Math.round(secs / 60) + ' min' : '-';
    if (d.uptime_window_30d && d.uptime_window_30d.bootstrap) {
      slaBootstrap.classList.remove('hidden');
      slaDaysObserved.textContent = (d.uptime_window_30d.days_observed || 0).toFixed(2);
    }
  })
  .catch(() => {
    sla30Pct.textContent = '-';
    sla24Pct.textContent = '-';
  });

fetch(TELEMETRY_API + '/stats/dex-pair-volume?pair=XRP/RLUSD')
  .then(r => r.ok ? r.json() : null)
  .then(d => {
    if (!d) {
      dpv24h.textContent = '-';
      dpvAnnual.textContent = '-';
      return;
    }
    dpv24h.textContent = fmtUsdShort(d.volume_24h_usd);
    dpvAnnual.textContent = fmtUsdShort(d.annualized_run_rate_usd);
    const fillCount = d.volume_24h_fill_count;
    if (typeof d.volume_24h_xrp_usd === 'number' && typeof d.volume_24h_rlusd_usd === 'number') {
      dpv24hSplit.textContent = fmtUsdShort(d.volume_24h_xrp_usd) + ' XRP-side · ' + fmtUsdShort(d.volume_24h_rlusd_usd) + ' RLUSD-side'
        + (typeof fillCount === 'number' ? ' · ' + fillCount.toLocaleString('en-US') + ' fills' : '');
    }
    if (typeof d.annualized_run_rate_xrp_usd === 'number' && typeof d.annualized_run_rate_rlusd_usd === 'number') {
      dpvAnnualSplit.textContent = fmtUsdShort(d.annualized_run_rate_xrp_usd) + ' XRP-side · ' + fmtUsdShort(d.annualized_run_rate_rlusd_usd) + ' RLUSD-side';
    } else {
      dpvAnnualSplit.textContent = '7d × 52 · pace, not a forecast';
    }
    if (d.coverage && d.coverage.bootstrap === true) {
      dpvBootstrap.classList.remove('hidden');
    }
  })
  .catch(() => {
    dpv24h.textContent = '-';
    dpvAnnual.textContent = '-';
  });

function svFetchSeries(bucket) {
  return fetch(TELEMETRY_API + '/settlement/series?bucket=' + bucket + '&count=' + SV_COUNTS[bucket])
    .then(r => r.ok ? r.json() : null)
    .then(d => {
      if (d && Array.isArray(d.series)) {
        svSeriesCache[bucket] = { ts: Date.now(), data: d.series };
      }
      return d;
    })
    .catch(() => null);
}

Promise.all(SV_BUCKETS.map(svFetchSeries)).then(() => {
  svRenderChart('daily');
});

function svRenderChart(bucket) {
  const cached = svSeriesCache[bucket];
  const fresh = cached && (Date.now() - cached.ts) < SV_CACHE_TTL_MS;
  if (!fresh) {
    svFetchSeries(bucket).then(() => svRenderChart(bucket));
    return;
  }
  // Series is newest-first from the API; reverse for left-to-right time axis.
  const series = (cached.data || []).slice().reverse();
  const labels = series.map(b => fmtBucketLabel(b.bucket_start_ts, bucket));
  const values = series.map(b => Number(b.total_usd) || 0);
  svActiveBucket = bucket;
  if (svChart) {
    svChart.data.labels = labels;
    svChart.data.datasets[0].data = values;
    svChart.update();
    return;
  }
  const svCtx = document.getElementById('sv-chart').getContext('2d');
  svChart = new Chart(svCtx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'USD volume',
        data: values,
        backgroundColor: 'rgba(0, 184, 255, 0.55)',
        borderColor: '#00b8ff',
        borderWidth: 1,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#111111',
          borderColor: '#262626',
          borderWidth: 1,
          titleColor: '#fff',
          bodyColor: '#fff',
          callbacks: {
            label: (ctx) => fmtUsdShort(ctx.raw),
          },
        },
      },
      scales: {
        x: { ticks: { color: '#a3a3a3', font: { size: 10 } }, grid: { display: false } },
        y: {
          ticks: { color: '#a3a3a3', font: { size: 10 }, callback: v => fmtUsdShort(v) },
          grid: { color: 'rgba(38, 38, 38, 0.6)' },
          beginAtZero: true,
        },
      },
    },
  });
}

document.querySelectorAll('.sv-bucket-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const bucket = btn.dataset.bucket;
    if (bucket === svActiveBucket) return;
    document.querySelectorAll('.sv-bucket-btn').forEach(b => {
      const active = b === btn;
      b.classList.toggle('border-accent', active);
      b.classList.toggle('bg-accent/20', active);
      b.classList.toggle('text-accent', active);
      b.classList.toggle('border-border', !active);
      b.classList.toggle('text-muted', !active);
    });
    svRenderChart(bucket);
  });
});

// ---- Floor Scenarios (24-month what-if) ----
const fmConstriction = document.getElementById('fm-constriction');
const fmGrowth = document.getElementById('fm-growth');
const fmConstrictionVal = document.getElementById('fm-constriction-val');
const fmGrowthVal = document.getElementById('fm-growth-val');
const fmP0 = document.getElementById('fm-p0');
const fmP24 = document.getElementById('fm-p24');

fmConstriction.value = 0.5;
fmGrowth.value = 1.0;

const HORIZON = 24;
const BAND = 0.15;

const ctx = document.getElementById('floor-chart').getContext('2d');
const chart = new Chart(ctx, {
  type: 'line',
  data: {
    // Plain integer X-axis labels. Axis title "months from now" provides
    // the unit; tooltip title callback adds back the "Month X" framing.
    labels: Array.from({ length: HORIZON + 1 }, (_, i) => String(i)),
    datasets: [
      { label: 'Upper (+15%)', data: [], borderColor: 'rgba(0, 184, 255, 0.4)', backgroundColor: 'rgba(0, 184, 255, 0.10)', borderWidth: 1, fill: false, pointRadius: 0, tension: 0.25 },
      { label: 'Lower (−15%)', data: [], borderColor: 'rgba(0, 184, 255, 0.4)', backgroundColor: 'rgba(0, 184, 255, 0.10)', borderWidth: 1, fill: '-1', pointRadius: 0, tension: 0.25 },
      { label: 'Baseline', data: [], borderColor: '#00b8ff', backgroundColor: '#00b8ff', borderWidth: 2.5, fill: false, pointRadius: 0, tension: 0.25 },
      { label: 'Current spot', data: Array(HORIZON + 1).fill(SNAPSHOT.current_price_usd), borderColor: '#a3a3a3', borderDash: [6, 4], borderWidth: 1.5, fill: false, pointRadius: 0, tension: 0 },
    ],
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { labels: { color: '#a3a3a3', boxWidth: 10 } },
      tooltip: {
        backgroundColor: '#111111',
        borderColor: '#262626',
        borderWidth: 1,
        titleColor: '#fff',
        bodyColor: '#fff',
        callbacks: {
          title: (items) => {
            if (!items.length) return '';
            const m = parseInt(items[0].label, 10);
            if (m === 0) return 'Today';
            if (m === 1) return 'Month 1 from now';
            return 'Month ' + m + ' from now';
          },
          label: (ctx) => ctx.dataset.label + ': ' + fmtUsd4(ctx.parsed.y),
        },
      },
    },
    scales: {
      x: {
        ticks: { color: '#a3a3a3' },
        grid: { color: 'rgba(38, 38, 38, 0.6)' },
        title: { display: true, text: 'months from now', color: '#a3a3a3' },
      },
      y: {
        ticks: {
          color: '#a3a3a3',
          callback: (v) => fmtUsd4(v),
        },
        grid: { color: 'rgba(38, 38, 38, 0.6)' },
        title: { display: true, text: 'implied USD per XRP', color: '#a3a3a3' },
      },
    },
  },
});

function projectBaseline(p0, growthPct, constrictionPct) {
  const g = growthPct / 100;
  const c = constrictionPct / 100;
  if (c >= 1) return Array(HORIZON + 1).fill(NaN);
  const factor = (1 + g) / (1 - c);
  const out = [];
  for (let i = 0; i <= HORIZON; i++) out.push(p0 * Math.pow(factor, i));
  return out;
}

const warningEl = document.getElementById('fm-warning');
function showWarning(message) {
  if (!message) {
    warningEl.classList.add('hidden');
    warningEl.textContent = '';
  } else {
    warningEl.classList.remove('hidden');
    warningEl.textContent = message;
  }
}

function updateFloorChart() {
  const p0 = currentP();
  const cPct = Number(fmConstriction.value);
  const gPct = Number(fmGrowth.value);
  fmConstrictionVal.textContent = cPct.toFixed(1) + '%';
  fmGrowthVal.textContent = gPct.toFixed(1) + '%';
  // Keep the spot reference line synced to current SNAPSHOT each tick so
  // re-anchoring from a live payload propagates without bespoke wiring.
  chart.data.datasets[3].data = Array(HORIZON + 1).fill(SNAPSHOT.current_price_usd);
  if (p0 == null || p0 <= 0) {
    fmP0.textContent = '-';
    fmP24.textContent = '-';
    chart.data.datasets[0].data = [];
    chart.data.datasets[1].data = [];
    chart.data.datasets[2].data = [];
    chart.update('none');
    showWarning('Enter a positive Q and V in the Burst Math calculator above to anchor the scenario.');
    return;
  }
  fmP0.textContent = fmtUsdEq(p0);
  const baseline = projectBaseline(p0, gPct, cPct);
  const upper = baseline.map(v => v * (1 + BAND));
  const lower = baseline.map(v => v * (1 - BAND));
  chart.data.datasets[0].data = upper;
  chart.data.datasets[1].data = lower;
  chart.data.datasets[2].data = baseline;
  chart.update('none');
  const p24 = baseline[HORIZON];
  fmP24.textContent = isFinite(p24) ? fmtUsdEq(p24) : '-';

  // Guard rail: warn when inputs imply implausible terminal values.
  let warning = null;
  if (cPct >= 100) {
    warning = 'Constriction at or above 100% has no physical interpretation. Supply cannot shrink to zero in one month.';
  } else if (!isFinite(p24)) {
    warning = 'The scenario is undefined for these inputs.';
  } else {
    const supplyRemaining = Math.pow(1 - cPct / 100, HORIZON);
    const ratio = p24 / p0;
    if (ratio > 10) {
      warning = `These inputs imply a ${ratio.toFixed(1)}× price by month 24. That's an extreme scenario. The model assumes V is constant and ignores velocity feedback, regulatory shocks, and AMM depth.`;
    } else if (ratio > 5) {
      warning = `These inputs imply a ${ratio.toFixed(1)}× floor by month 24. Constriction cannot compound forever, so read this as a what-if, not a forecast.`;
    } else if (supplyRemaining < 0.3) {
      warning = `At this constriction rate, only ${(supplyRemaining * 100).toFixed(0)}% of liquid supply remains by month 24. Implausible without a major regime change.`;
    }
  }
  showWarning(warning);
}

fmConstriction.addEventListener('input', updateFloorChart);
fmGrowth.addEventListener('input', updateFloorChart);

recompute();

// Fetch the live XRP/USD spot from the Telemetry backend's /healthz so
// the "Current spot" tile and burst-math premium reflect reality on
// page load, without requiring the user to pay for a snapshot first.
// /healthz exposes the oracle's last-known-good price (free; CORS-allowed
// for the .com origin). Falls back silently to the static placeholder if
// the fetch fails. Re-polled on the backend oracle's cache interval while
// the tab is visible, so extra tabs never add upstream price lookups.
function refreshSpot() {
  fetch('https://telemetry.xrpl-utilities.io/healthz')
    .then(r => r.ok ? r.json() : null)
    .then(d => {
      const spot = d && d.checks && d.checks.xrp_price && d.checks.xrp_price.last_good_usd;
      if (typeof spot !== 'number' || spot <= 0) {
        bmSpot.textContent = fmtUsd4(SNAPSHOT.current_price_usd);
        bmSpotAsOf.textContent = 'as of ' + SNAPSHOT_AS_OF + ' (live fetch unavailable)';
        return;
      }
      SNAPSHOT.current_price_usd = spot;
      bmSpot.textContent = fmtUsd4(spot);
      bmSpotAsOf.textContent = 'live spot, just now';
      const ch = d.checks.xrp_price.usd_24h_change_pct;
      const bm24 = document.getElementById('bm-spot-24h');
      if (bm24 && typeof ch === 'number') {
        const arrow = ch > 0 ? '↑' : (ch < 0 ? '↓' : '·');
        const sign = ch > 0 ? '+' : '';
        bm24.textContent = arrow + ' ' + sign + ch.toFixed(2) + '% 24h';
        bm24.className = 'text-sm font-mono mt-1 ' + (ch > 0 ? 'text-good' : (ch < 0 ? 'text-bad' : 'text-muted'));
      }
      recompute();
    })
    .catch(() => {
      bmSpot.textContent = fmtUsd4(SNAPSHOT.current_price_usd);
      bmSpotAsOf.textContent = 'as of ' + SNAPSHOT_AS_OF + ' (live fetch failed)';
    });
}
refreshSpot();
let spotPollId = setInterval(refreshSpot, 60_000);
// Pause polling in background tabs; resume + immediate refresh on focus
// so a user returning to a stale tab gets a fresh value without waiting
// for the next interval tick.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    clearInterval(spotPollId);
    spotPollId = 0;
  } else if (!spotPollId) {
    refreshSpot();
    spotPollId = setInterval(refreshSpot, 60_000);
  }
});

// Development banner + payment-disabled handling. Reads /agents.json
// for service_status and payments_enabled. Banner stays up while
// service_status != "live"; payment UI hides while payments_enabled
// is false. Both flip automatically when the backend is ready (no
// page edit needed).
fetch('https://telemetry.xrpl-utilities.io/agents.json')
  .then(r => r.ok ? r.json() : null)
  .then(d => {
    if (!d) return;
    const inDev = d.service_status && d.service_status !== 'live';
    if (inDev) {
      const banner = document.createElement('div');
      banner.className = 'bg-yellow-900/20 border-b border-yellow-700/40 text-yellow-200 text-xs';
      banner.innerHTML =
        '<div class="max-w-6xl mx-auto px-4 sm:px-6 py-2 leading-relaxed text-center">' +
        'XR-Telemetry is in active development. Some payload fields use placeholder values. Live data coming soon.' +
        '</div>';
      document.body.insertBefore(banner, document.body.firstChild);
    }
    if (d.payments_enabled === false) {
      // Replace the "Run live snapshot" button with a notice.
      const btn = document.getElementById('snap-btn');
      if (btn) {
        const notice = document.createElement('div');
        notice.className = 'bg-ink border border-border rounded-lg px-4 py-3 text-sm text-muted text-center';
        notice.textContent = 'Live snapshot is temporarily disabled while Telemetry is in active development. Use the cached samples above for now.';
        btn.replaceWith(notice);
      }
    }
  })
  .catch(() => {});

// ---- Live snapshot button ----
function reanchorFromPayload(payload) {
  if (!payload) return;
  let touched = false;

  const uf = payload.utility_floor;
  if (uf) {
    if (typeof uf.current_price_usd === 'number' && isFinite(uf.current_price_usd)) {
      SNAPSHOT.current_price_usd = uf.current_price_usd;
      bmSpot.textContent = fmtUsd4(uf.current_price_usd);
      touched = true;
    }
    if (typeof uf.available_liquid_supply_xrp === 'number' && uf.available_liquid_supply_xrp > 0) {
      SNAPSHOT.available_liquid_supply = uf.available_liquid_supply_xrp;
      bmM.textContent = fmtXrp(uf.available_liquid_supply_xrp) + ' (live)';
      touched = true;
    }
  }

  // Active Float card: prefer derived_models.active_float over the
  // utility_floor alias since the derived block carries the 24h delta.
  const af = (payload.derived_models || {}).active_float;
  if (af && typeof af.value_xrp === 'number') {
    SNAPSHOT.available_liquid_supply = af.value_xrp;
    if (afValueEl) afValueEl.textContent = fmtXrpCompactInline(af.value_xrp);
    setActiveFloatDelta(af.delta_24h_xrp, af.delta_24h_pct);
    bmM.textContent = fmtXrp(af.value_xrp) + ' (live)';
    touched = true;

    // Extract the raw Active Float components from the bridge so the
    // slider can recompute at any ratio without another /scan call.
    // additions[] has three entries by contract: exchange-proxy
    // (carries _components.exchange_omnibus_xrp + proxy_ratio),
    // AMM-locked, DEX-orderbook. Match by label substring rather
    // than index so ordering changes upstream don't silently break
    // the slider.
    if (typeof af.proxy_ratio === 'number' && af.proxy_ratio > 0) {
      SNAPSHOT.proxy_ratio = af.proxy_ratio;
    }
    const additions = (af.mathematical_bridge || {}).additions || [];
    for (const a of additions) {
      const lbl = (a.label || '').toLowerCase();
      const comps = a._components || {};
      if (lbl.includes('omnibus') || lbl.includes('exchange')) {
        if (typeof comps.exchange_omnibus_xrp === 'number') {
          SNAPSHOT.exchange_omnibus_xrp = comps.exchange_omnibus_xrp;
        }
        if (typeof comps.proxy_ratio === 'number' && comps.proxy_ratio > 0) {
          SNAPSHOT.proxy_ratio = comps.proxy_ratio;
        }
      } else if (lbl.includes('amm')) {
        if (typeof a.value_xrp === 'number') {
          SNAPSHOT.amm_locked_xrp = a.value_xrp;
        }
      } else if (lbl.includes('dex') || lbl.includes('orderbook')) {
        if (typeof a.value_xrp === 'number') {
          SNAPSHOT.dex_orderbook_depth_xrp = a.value_xrp;
        }
      }
    }
    // Snap the slider to the live ratio so the UI reads what the
    // backend actually used; subsequent slider drags recompute from
    // there.
    if (afSlider) {
      const livePct = Math.max(5, Math.min(15, SNAPSHOT.proxy_ratio * 100));
      afSlider.value = livePct.toFixed(1);
      if (afRatioDisplay) afRatioDisplay.textContent = livePct.toFixed(1);
      const pctText = fmtRatioPct(SNAPSHOT.proxy_ratio);
      if (afRatioLabel) afRatioLabel.textContent = pctText;
      if (afRatioProse) afRatioProse.textContent = pctText;
      if (bmMRatio) bmMRatio.textContent = pctText;
      bmMRatioProse.forEach(el => { el.textContent = pctText; });
    }
  }
  if (payload.supply && typeof payload.supply.circulating_xrp === 'number') {
    SNAPSHOT.circulating_supply_xrp = payload.supply.circulating_xrp;
    if (afCirculatingEl) afCirculatingEl.textContent = fmtXrpCompactInline(payload.supply.circulating_xrp);
  }

  if (payload.generated_at) {
    const stamp = new Date(payload.generated_at);
    if (!isNaN(stamp.getTime())) bmSpotAsOf.textContent = 'live · ' + stamp.toLocaleDateString();
  }
  if (touched) recompute();
}

// Open on the cached live snapshot. The SNAPSHOT constants date from
// launch (2026-04-28) and only show, labelled with that date, if this read
// fails: on 2026-10-28 the page showed 66.80B circulating as current while
// the live snapshot read 68.59B.
const afAsOfEl = document.getElementById('af-as-of');
function liquidityToPayload(d) {
  const fallback = new Set(d.fallback_fields || []);
  // No generated_at: that would relabel the spot price, which comes from /healthz.
  const payload = { derived_models: { active_float: d.active_float || {} } };
  // A seeded supply figure is not a reading; leave the dated seed in place.
  if (!fallback.has('total_xrp') && !fallback.has('escrowed_xrp')) payload.supply = d.supply || {};
  return payload;
}
fetch(TELEMETRY_API + '/stats/liquidity')
  .then(r => (r.ok ? r.json() : Promise.reject(new Error('http ' + r.status))))
  .then(d => {
    const payload = liquidityToPayload(d);
    reanchorFromPayload(payload);
    const live = payload.supply && typeof (d.active_float || {}).value_xrp === 'number';
    if (afAsOfEl) {
      const t = new Date(d.generated_at);
      afAsOfEl.textContent = live && !isNaN(t.getTime())
        ? 'Snapshot taken ' + t.toISOString().slice(11, 16) + ' UTC.'
        : 'Part of the latest snapshot could not be read; older figures are dated ' + SNAPSHOT_AS_OF + '.';
    }
  })
  .catch(() => {
    if (afAsOfEl) afAsOfEl.textContent = 'Live figures unavailable right now. Showing figures as of ' + SNAPSHOT_AS_OF + '.';
  });

document.getElementById('snap-btn').addEventListener('click', () => {
  const r = document.getElementById('result');
  const btn = document.getElementById('snap-btn');
  btn.disabled = true;
  btn.textContent = 'Working…';
  r.classList.remove('hidden');
  window.XRTelemetryScan.startPreview(r)
    .then(result => { if (result) reanchorFromPayload(result.payload); })
    .finally(() => {
      btn.disabled = false;
      btn.textContent = 'Run live snapshot';
    });
});
