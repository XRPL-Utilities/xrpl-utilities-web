// Mobile nav open/close (shared shape with other pages).
const navOpen = document.getElementById('nav-open');
const navClose = document.getElementById('nav-close');
const mobileNav = document.getElementById('mobile-nav');
function openNav() {
  mobileNav.style.display = 'flex';
  mobileNav.classList.add('flex');
  navOpen.setAttribute('aria-expanded', 'true');
  document.body.style.overflow = 'hidden';
}
function closeNav() {
  mobileNav.style.display = 'none';
  mobileNav.classList.remove('flex');
  navOpen.setAttribute('aria-expanded', 'false');
  document.body.style.overflow = '';
}
if (navOpen) navOpen.addEventListener('click', openNav);
if (navClose) navClose.addEventListener('click', closeNav);
mobileNav.addEventListener('click', (e) => { if (e.target === mobileNav) closeNav(); });
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && mobileNav.style.display === 'flex') closeNav();
});
mobileNav.querySelectorAll('a').forEach(a => a.addEventListener('click', closeNav));
window.addEventListener('resize', () => {
  if (window.innerWidth >= 1024 && mobileNav.style.display === 'flex') closeNav();
});
