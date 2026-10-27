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

const ADDR_RE = /\br[1-9A-HJ-NP-Za-km-z]{24,34}\b/g;
const MAX = 50;
const PRICE_PER = 0.10;

function parseAddresses(raw) {
  const matches = raw.match(ADDR_RE) || [];
  const seen = new Set();
  const ordered = [];
  matches.forEach(a => { if (!seen.has(a)) { seen.add(a); ordered.push(a); } });
  return ordered;
}

const ta = document.getElementById('addresses');
const counter = document.getElementById('counter');
const validation = document.getElementById('validation');
const btn = document.getElementById('get-quote');
const flow = document.getElementById('flow');

function refresh() {
  const addrs = parseAddresses(ta.value);
  const count = Math.min(addrs.length, MAX);
  const cost = (count * PRICE_PER).toFixed(2);
  counter.textContent = `${count} ${count === 1 ? 'address' : 'addresses'} · $${cost} USD`;
  btn.disabled = count === 0;
  if (addrs.length > MAX) {
    validation.textContent = `Limit is ${MAX} addresses per quote. Only the first ${MAX} will be quoted.`;
    validation.className = 'text-xs mt-4 text-yellow-400 leading-relaxed';
  } else if (addrs.length === 0 && ta.value.trim().length > 0) {
    validation.textContent = "No valid XRPL addresses found. Each address starts with 'r' and is 25-35 characters of base58.";
    validation.className = 'text-xs mt-4 text-yellow-400 leading-relaxed';
  } else {
    validation.textContent = '';
    validation.className = 'text-xs mt-4 text-muted leading-relaxed';
  }
}
ta.addEventListener('input', refresh);
refresh();

btn.addEventListener('click', () => {
  const addrs = parseAddresses(ta.value).slice(0, MAX);
  if (!addrs.length) return;
  btn.disabled = true;
  btn.textContent = 'Loading…';
  window.XRSentinelScan.start(flow, addrs).finally(() => {
    btn.disabled = false;
    btn.textContent = 'Get quote & pay →';
  });
});
