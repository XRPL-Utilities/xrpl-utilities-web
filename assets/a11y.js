// Keyboard and screen-reader handling for the mobile menu. Pure ES2018.
//
// Each page's own script opens and closes #mobile-nav by setting its
// style.display. That left keyboard users behind: focus stayed on the page
// under the overlay, Tab walked through links they could not see, and closing
// the menu dropped focus at the top of the document. This watches the overlay
// and, while it is open, moves focus into it and keeps Tab inside it; when it
// closes, focus goes back to the menu button.

(function () {
  'use strict';

  const overlay = document.getElementById('mobile-nav');
  const opener = document.getElementById('nav-open');
  if (!overlay || !opener) return;

  const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';
  const isOpen = () => overlay.style.display !== 'none' && overlay.style.display !== '';
  let wasOpen = isOpen();
  // A menu link closes the overlay on its way to a new page or section;
  // pulling focus back to the button then would fight the navigation.
  let followedLink = false;
  overlay.addEventListener('click', function (e) {
    followedLink = !!(e.target.closest && e.target.closest('a[href]'));
  }, true);

  function focusables() {
    return Array.prototype.filter.call(overlay.querySelectorAll(FOCUSABLE), function (el) {
      return el.offsetParent !== null || el === document.activeElement;
    });
  }

  function onChange() {
    const open = isOpen();
    if (open === wasOpen) return;
    wasOpen = open;
    if (open) {
      const first = document.getElementById('nav-close') || focusables()[0];
      if (first) first.focus();
    } else if (!followedLink && (overlay.contains(document.activeElement) || document.activeElement === document.body)) {
      opener.focus();
    }
    followedLink = false;
  }

  new MutationObserver(onChange).observe(overlay, { attributes: true, attributeFilter: ['style', 'class'] });

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Tab' || !isOpen()) return;
    const items = focusables();
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && (document.activeElement === first || !overlay.contains(document.activeElement))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (document.activeElement === last || !overlay.contains(document.activeElement))) {
      e.preventDefault();
      first.focus();
    }
  });
})();
