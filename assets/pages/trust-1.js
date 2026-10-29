(function setupMobileNav() {
  const openBtn  = document.getElementById('nav-open');
  const closeBtn = document.getElementById('nav-close');
  const overlay  = document.getElementById('mobile-nav');
  if (!openBtn || !closeBtn || !overlay) return;
  const open  = () => { overlay.style.display = 'flex'; openBtn.setAttribute('aria-expanded', 'true'); document.body.style.overflow = 'hidden'; };
  const close = () => { overlay.style.display = 'none'; openBtn.setAttribute('aria-expanded', 'false'); document.body.style.overflow = ''; };
  openBtn.addEventListener('click', open);
  closeBtn.addEventListener('click', close);
  overlay.querySelectorAll('a[href]').forEach(a => a.addEventListener('click', close));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && overlay.style.display !== 'none') close(); });
  window.addEventListener('resize', () => { if (window.innerWidth >= 1024) close(); });
})();

// Hide the hero image if it fails to load. Replaces an inline onerror
// handler, which the CSP (no 'unsafe-inline' in script-src) would block.
document.querySelectorAll('img[data-hide-on-error]').forEach(function (img) {
  function hide() { img.style.display = 'none'; }
  if (img.complete && img.naturalWidth === 0) hide();
  else img.addEventListener('error', hide);
});
