// Shared chart colors for every page. One fixed order, validated for
// color-blind separation on the dark panel (#111111): every adjacent pair
// clears CVD delta E 13 and normal-vision delta E 19. A sixth series never
// gets a new hue; it folds into the grey "Other" slot.
(function () {
  const SERIES = ['#0a9fdc', '#d95926', '#9085e9', '#c98500', '#d55181'];
  const OTHER = '#6b6b6b';
  const UP = '#22c55e';
  const DOWN = '#ef4444';
  // Panel color, drawn as a 2px seam between stacked segments.
  const GAP = '#0a0a0a';

  // Rank keys by size, keep the top `n`, and fold the rest into Other.
  // sizeOf(key) returns a number; ties keep the input order.
  function topN(keys, sizeOf, n) {
    const limit = n == null ? SERIES.length : n;
    const ranked = keys
      .map((k, i) => ({ k, i, v: Number(sizeOf(k)) || 0 }))
      .sort((a, b) => (b.v - a.v) || (a.i - b.i))
      .map((x) => x.k);
    if (ranked.length <= limit) return { top: ranked, rest: [] };
    return { top: ranked.slice(0, limit), rest: ranked.slice(limit) };
  }

  // Compact number with an explicit unit: 80000000 -> "80M XRP".
  function compact(v, unit) {
    const n = Number(v);
    if (!isFinite(n)) return '';
    const a = Math.abs(n);
    const s = n < 0 ? '-' : '';
    let out;
    if (a >= 1e9) out = (a / 1e9).toFixed(a >= 1e10 ? 0 : 1) + 'B';
    else if (a >= 1e6) out = (a / 1e6).toFixed(a >= 1e7 ? 0 : 1) + 'M';
    else if (a >= 1e3) out = (a / 1e3).toFixed(a >= 1e4 ? 0 : 1) + 'K';
    else out = String(Math.round(a));
    out = out.replace(/\.0(?=[BMK])/, '');
    return unit === '$' ? s + '$' + out : s + out + (unit ? ' ' + unit : '');
  }

  window.XRChart = { SERIES, OTHER, UP, DOWN, GAP, topN, compact };
})();
