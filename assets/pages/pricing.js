const navOpen = document.getElementById("nav-open");
const navClose = document.getElementById("nav-close");
const mobileNav = document.getElementById("mobile-nav");
if (navOpen && navClose && mobileNav) {
  navOpen.addEventListener("click", () => {
    mobileNav.style.display = "flex";
    navOpen.setAttribute("aria-expanded", "true");
  });
  navClose.addEventListener("click", () => {
    mobileNav.style.display = "none";
    navOpen.setAttribute("aria-expanded", "false");
  });
}
