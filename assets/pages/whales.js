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

function renderBands(bands) {
  const box = document.getElementById('bands');
  box.replaceChildren();
  for (const b of bands || []) {
    const t = el('div', 'stat-tile p-4');
    t.append(el('div', 'stat-tile-label mb-2', (b.band || '') + ' XRP'));
    t.append(el('div', 'text-2xl font-bold tabular-nums', fmtInt(b.wallets)));
    t.append(el('div', 'stat-tile-sub', fmtXrp(b.xrp) + ' XRP held'));
    box.append(t);
  }
}

function renderHolders(cats) {
  const box = document.getElementById('holders');
  box.replaceChildren();
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
    track.append(bar, el('span', 'min-w-0 tabular-nums text-xs sm:text-sm', wallets(c.wallets) + ', ' + fmtXrp(c.xrp)));
    row.append(track);
    box.append(row);
  }
}

function renderTop(top) {
  const body = document.getElementById('top');
  body.replaceChildren();
  for (const t of top || []) {
    const tr = el('tr', 'border-t border-border');
    tr.append(el('td', 'py-2 pr-3 text-muted tabular-nums', t.rank));
    const acct = el('td', 'hidden sm:table-cell py-2 pr-3 font-mono text-xs whitespace-nowrap', shortAccount(t.account));
    acct.title = String(t.account || '');
    tr.append(acct);
    tr.append(el('td', 'py-2 pr-3 text-right tabular-nums whitespace-nowrap', fmtInt(t.balance_xrp)));
    tr.append(el('td', 'py-2 pr-3 whitespace-nowrap', t.category));
    tr.append(el('td', 'py-2 text-muted', t.name || ''));
    body.append(tr);
  }
}

function weekChange(history, latest) {
  // Change against the oldest point in the window, once one exists.
  if (!Array.isArray(history) || history.length < 2) return null;
  const first = history[0];
  if (typeof first.wallet_count !== 'number') return null;
  return { delta: latest.wallet_count - first.wallet_count, since: first.date };
}

async function loadWhales() {
  let ok = false;
  try {
    const r = await fetch(WHALES_URL);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const d = await r.json();
    const s = d && d.latest;
    if (!s || typeof s.wallet_count !== 'number') throw new Error('no snapshot');
    setText('stat-count', fmtInt(s.wallet_count));
    setText('stat-total', fmtXrp(s.total_xrp));
    const ex = s.excluding_ripple || {};
    setText('stat-total-ex-ripple', fmtXrp(ex.total_xrp));
    if (typeof ex.total_xrp === 'number' && s.total_xrp > 0) {
      const ripple = s.total_xrp - ex.total_xrp;
      setText('stat-total-ex-ripple-sub', 'Leaves out ' + fmtXrp(ripple) + ' XRP in Ripple\u2019s wallets');
    }
    renderBands(s.bands);
    renderHolders(s.categories);
    renderTop(s.top);
    let line = 'Last counted ' + hhmmUtc(s.captured_at) + '.';
    const wk = weekChange(d.history, s);
    if (wk) line += ' ' + (wk.delta >= 0 ? '+' : '') + fmtInt(wk.delta) + ' whale wallets since ' + wk.since + '.';
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
