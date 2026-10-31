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
  window.addEventListener('resize', () => { if (window.innerWidth >= 1024) close(); });
})();

// XRP whale census. One free Pulse call; every string from the API is set
// with textContent, never as HTML.
const WHALES_URL = 'https://pulse.xrpl-utilities.io/stats/whales?history_days=8';
const REFRESH_MS = 10 * 60 * 1000;

function fmtXrp(n) {
  if (typeof n !== 'number' || !isFinite(n)) return '-';
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  return Math.round(n).toLocaleString('en-US');
}
function fmtInt(n) {
  return (typeof n === 'number' && isFinite(n)) ? Math.round(n).toLocaleString('en-US') : '-';
}
function wallets(n) {
  return fmtInt(n) + (n === 1 ? ' wallet' : ' wallets');
}
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined && text !== null) e.textContent = String(text);
  return e;
}
function shortAccount(a) {
  return (typeof a === 'string' && a.length > 14) ? a.slice(0, 8) + '…' + a.slice(-4) : String(a || '');
}
function setText(id, text) {
  const e = document.getElementById(id);
  if (e) e.textContent = text;
}
function hhmmUtc(ts) {
  const d = new Date(ts * 1000);
  return d.toISOString().slice(0, 10) + ' ' + d.toISOString().slice(11, 16) + ' UTC';
}

// Day-over-day change. Up is green, down is red, no move is muted.
// `prev` is the last count of the previous UTC day (Pulse `previous`).
let SINCE = null;
function signed(d, fmt) {
  return (d > 0 ? '+' : '−') + fmt(Math.abs(d));
}
function deltaEl(cur, prev, fmt, extraCls) {
  if (typeof cur !== 'number' || typeof prev !== 'number' || !isFinite(cur) || !isFinite(prev)) return null;
  const d = cur - prev;
  const cls = (extraCls ? extraCls + ' ' : '') + 'tabular-nums whitespace-nowrap ';
  if (d === 0) {
    const z = el('span', cls + 'text-muted', 'no change');
    if (SINCE) z.title = 'No change since ' + SINCE;
    return z;
  }
  const up = d > 0;
  const e = el('span', cls + (up ? 'text-emerald-400' : 'text-red-400'), (up ? '▲ ' : '▼ ') + signed(d, fmt));
  if (SINCE) e.title = (up ? 'Up ' : 'Down ') + fmt(Math.abs(d)) + ' since ' + SINCE;
  return e;
}
function fmtXrpDelta(n) {
  return n >= 1e6 ? fmtXrp(n) : fmtInt(n);
}
function setDelta(id, cur, prev, fmt, suffix) {
  const box = document.getElementById(id);
  if (!box) return;
  box.replaceChildren();
  const d = deltaEl(cur, prev, fmt);
  if (!d) return;
  box.append(d);
  if (suffix && !d.classList.contains('text-muted')) box.append(el('span', 'text-muted', suffix));
}

// Owner icons for the top 10. The list lives in one JSON file so the health
// monitor can flag a new top-10 owner that has no icon yet.
const ICONS_URL = '/assets/img/owners/owners.json';
const ICON_FILE = /^[a-z0-9-]{1,40}\.webp$/;
let ICONS = null;
async function loadIcons() {
  if (ICONS) return ICONS;
  try {
    const r = await fetch(ICONS_URL);
    const d = r.ok ? await r.json() : null;
    const out = {};
    if (d && d.icons && typeof d.icons === 'object') {
      for (const [k, v] of Object.entries(d.icons)) {
        if (typeof k === 'string' && typeof v === 'string' && ICON_FILE.test(v)) out[k.toLowerCase()] = v;
      }
    }
    ICONS = out;
  } catch (e) {
    ICONS = {};
  }
  return ICONS;
}
function iconFor(name, icons) {
  if (typeof name !== 'string' || !name) return null;
  const n = name.trim().toLowerCase();
  for (const [k, file] of Object.entries(icons || {})) {
    if (n === k || n.startsWith(k + ' ')) return file;
  }
  return null;
}
function ownerBadge(name, icons) {
  const file = iconFor(name, icons);
  if (file) {
    const img = document.createElement('img');
    img.src = '/assets/img/owners/' + file;
    img.width = 24; img.height = 24;
    img.alt = '';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.className = 'h-6 w-6 rounded-md shrink-0 bg-white/5';
    return img;
  }
  // No icon: a letter tile for a named owner, a plain dot when unnamed.
  const letter = (typeof name === 'string' && name.trim()) ? name.trim()[0].toUpperCase() : '';
  const tile = el('span', 'h-6 w-6 rounded-md shrink-0 inline-flex items-center justify-center text-[11px] font-semibold border border-border text-muted', letter || '•');
  tile.setAttribute('aria-hidden', 'true');
  return tile;
}

function renderBands(bands, prevBands) {
  const box = document.getElementById('bands');
  box.replaceChildren();
  const prev = {};
  for (const b of prevBands || []) prev[b.band] = b;
  for (const b of bands || []) {
    const p = prev[b.band];
    const t = el('div', 'stat-tile p-4');
    t.append(el('div', 'stat-tile-label mb-2', (b.band || '') + ' XRP'));
    const v = el('div', 'flex items-baseline gap-2 flex-wrap');
    v.append(el('span', 'text-2xl font-bold tabular-nums', fmtInt(b.wallets)));
    const d = p ? deltaEl(b.wallets, p.wallets, fmtInt, 'text-xs') : null;
    if (d) v.append(d);
    t.append(v);
    const sub = el('div', 'stat-tile-sub', fmtXrp(b.xrp) + ' XRP held');
    const dx = p ? deltaEl(b.xrp, p.xrp, fmtXrpDelta) : null;
    if (dx && !dx.classList.contains('text-muted')) { sub.append(' '); sub.append(dx); }
    t.append(sub);
    box.append(t);
  }
}

function renderHolders(cats, prevCats) {
  const box = document.getElementById('holders');
  box.replaceChildren();
  const prev = {};
  for (const c of prevCats || []) prev[c.category] = c;
  const max = Math.max(1, ...(cats || []).map((c) => c.xrp || 0));
  for (const c of cats || []) {
    const row = el('div', 'flex items-center gap-3 text-sm');
    const label = (c.category || '') + ': ' + wallets(c.wallets) + ', ' + fmtXrp(c.xrp) + ' XRP';
    row.title = label;
    row.append(el('span', 'w-28 sm:w-32 shrink-0 text-muted', c.category));
    const track = el('span', 'flex-1 min-w-0 flex items-center gap-2');
    const bar = el('span', 'h-3 rounded-r bg-accent shrink-0');
    // Longest bar takes 55% of the track so its label always fits beside it.
    bar.style.width = Math.max(1, Math.round(55 * (c.xrp || 0) / max)) + '%';
    bar.setAttribute('aria-hidden', 'true');
    const txt = el('span', 'min-w-0 tabular-nums text-xs sm:text-sm', wallets(c.wallets) + ', ' + fmtXrp(c.xrp));
    const p = prev[c.category];
    const d = p ? deltaEl(c.xrp, p.xrp, fmtXrpDelta) : null;
    if (d && !d.classList.contains('text-muted')) { txt.append(' '); txt.append(d); }
    track.append(bar, txt);
    row.append(track);
    box.append(row);
  }
}

function renderTop(top, prevTop, icons) {
  const body = document.getElementById('top');
  body.replaceChildren();
  const prev = {};
  for (const t of prevTop || []) prev[t.account] = t;
  const havePrev = Array.isArray(prevTop) && prevTop.length > 0;
  for (const t of top || []) {
    const tr = el('tr', 'border-t border-border');
    tr.append(el('td', 'py-2 pr-3 text-muted tabular-nums', t.rank));
    const who = el('td', 'py-2 pr-3');
    const wrap = el('div', 'flex items-center gap-2 min-w-0');
    wrap.append(ownerBadge(t.name, icons));
    wrap.append(el('span', 'min-w-0', t.name || 'Unidentified'));
    who.append(wrap);
    tr.append(who);
    const acct = el('td', 'hidden sm:table-cell py-2 pr-3 font-mono text-xs whitespace-nowrap text-muted', shortAccount(t.account));
    acct.title = String(t.account || '');
    tr.append(acct);
    const bal = el('td', 'py-2 pr-3 text-right tabular-nums whitespace-nowrap');
    bal.append(el('div', '', fmtInt(t.balance_xrp)));
    const p = prev[t.account];
    if (p) {
      const d = deltaEl(t.balance_xrp, p.balance_xrp, fmtXrpDelta, 'text-xs');
      if (d) { const line = el('div', ''); line.append(d); bal.append(line); }
    } else if (havePrev) {
      bal.append(el('div', 'text-xs text-accent', 'new in top 10'));
    }
    tr.append(bal);
    tr.append(el('td', 'hidden sm:table-cell py-2 whitespace-nowrap text-muted', t.category));
    body.append(tr);
  }
}

async function loadWhales() {
  let ok = false;
  try {
    const iconsP = loadIcons();
    const r = await fetch(WHALES_URL);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const d = await r.json();
    const s = d && d.latest;
    if (!s || typeof s.wallet_count !== 'number') throw new Error('no snapshot');
    const p = (d.previous && typeof d.previous.wallet_count === 'number' && d.previous.sample_date !== s.sample_date) ? d.previous : null;
    SINCE = p ? (p.sample_date + "'s last count") : null;
    const ex = s.excluding_ripple || {};
    const pex = (p && p.excluding_ripple) || {};
    setText('stat-count', fmtInt(s.wallet_count));
    setText('stat-total', fmtXrp(s.total_xrp));
    setText('stat-total-ex-ripple', fmtXrp(ex.total_xrp));
    if (typeof ex.total_xrp === 'number' && s.total_xrp > 0) {
      const ripple = s.total_xrp - ex.total_xrp;
      setText('stat-total-ex-ripple-sub', 'Leaves out ' + fmtXrp(ripple) + ' XRP in Ripple’s wallets');
    }
    const since = p ? ' since ' + p.sample_date : '';
    setDelta('stat-count-delta', s.wallet_count, p && p.wallet_count, fmtInt, since);
    setDelta('stat-total-delta', s.total_xrp, p && p.total_xrp, fmtXrpDelta, since);
    setDelta('stat-total-ex-ripple-delta', ex.total_xrp, pex.total_xrp, fmtXrpDelta, since);
    renderBands(s.bands, p && p.bands);
    renderHolders(s.categories, p && p.categories);
    renderTop(s.top, p && p.top, await iconsP);
    let line = 'Last counted ' + hhmmUtc(s.captured_at) + '.';
    line += p
      ? ' Green and red show the change since the last count on ' + p.sample_date + '.'
      : ' Daily changes show in green and red once a second day has been counted.';
    if (d.stale) line += ' This count is more than a day old; a refresh is overdue.';
    setText('whales-updated', line);
    ok = true;
  } catch (e) {
    setText('whales-updated', 'The whale count could not be loaded right now. It will retry shortly.');
  }
  if (window.XRStale) ok ? window.XRStale.ok('whales') : window.XRStale.fail('whales');
}

loadWhales();
if (window.pollWhileVisible) window.pollWhileVisible(loadWhales, REFRESH_MS);
