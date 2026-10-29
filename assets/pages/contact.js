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

const form = document.getElementById('contact-form');
const status = document.getElementById('contact-status');
const submitBtn = document.getElementById('contact-submit');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  submitBtn.disabled = true;
  submitBtn.textContent = 'Sending…';
  status.classList.add('hidden');

  const formData = new FormData(form);
  const payload = Object.fromEntries(formData.entries());

  try {
    const res = await fetch('https://api.web3forms.com/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.success) {
      status.textContent = 'Thanks! Your message is on its way. We typically reply within two business days.';
      status.className = 'text-sm text-good';
      form.reset();
    } else {
      status.textContent = data.message || 'Submission failed. Please try again, or email hello@xrpl-utilities.com directly.';
      status.className = 'text-sm text-red-400';
    }
  } catch (err) {
    status.textContent = 'Network error. Please try again, or email hello@xrpl-utilities.com directly.';
    status.className = 'text-sm text-red-400';
  } finally {
    status.classList.remove('hidden');
    submitBtn.disabled = false;
    submitBtn.textContent = 'Send message';
  }
});
