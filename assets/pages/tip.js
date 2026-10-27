const ADDR = "rKxTzCKYKPPdXEzuioEQ6KekQK26w2DBd5";
const DT = 90210;
const XAMAN_BASE = "https://xaman.app/detect/request:";

// ----------- QR code -----------
// xrpl: URI is the canonical standard most wallets understand for
// pay-to-address. dt = destination tag. Amount is updated dynamically
// by the amount selector below.
//
// Encoded on this origin by /assets/qr-code.js. It used to be an <img>
// from api.qrserver.com, which put the donation address a wallet
// actually scans in a third party's hands - the address printed below
// would still read correctly while the QR paid someone else.
function makeUri(amtXrp) {
  const params = ["dt=" + DT];
  if (amtXrp && amtXrp > 0) params.push("amount=" + amtXrp);
  return "xrpl:" + ADDR + "?" + params.join("&");
}
function renderQr(uri) {
  const box = document.getElementById("qr");
  box.textContent = "";
  // The catch below repurposes the container as failure text; the amount
  // buttons re-render on every click, so without this reset a later
  // successful QR would still be wearing the failure styling.
  box.className = "";
  try {
    box.appendChild(window.XRQr.toCanvas(uri, 136, "XRPL payment QR"));
  } catch (e) {
    // The address + tag are on the card in copyable form, so say so
    // rather than leaving an empty white square.
    box.className = "text-[11px] text-ink text-center px-1";
    box.textContent = "QR unavailable - copy the address and tag below.";
  }
}

// ----------- Amount selector -----------
let currentAmt = 10;
function setAmt(v) {
  currentAmt = v;
  // Update Xaman link
  document.getElementById("xaman-btn").href =
    XAMAN_BASE + ADDR + "?amount=" + v + "&dt=" + DT;
  // Update QR
  renderQr(makeUri(v));
  // Visual: highlight active button
  document.querySelectorAll(".amt-btn").forEach(b => {
    if (parseFloat(b.dataset.amt) === v) {
      b.classList.add("border-accent", "text-accent");
      b.classList.remove("text-white");
    } else {
      b.classList.remove("border-accent", "text-accent");
      b.classList.add("text-white");
    }
  });
}
document.querySelectorAll(".amt-btn").forEach(b => {
  b.addEventListener("click", () => setAmt(parseFloat(b.dataset.amt)));
});
document.getElementById("amt-custom").addEventListener("input", (e) => {
  const v = parseFloat(e.target.value);
  if (isFinite(v) && v > 0) setAmt(v);
});
setAmt(10);

// ----------- Copy helpers -----------
function copyTo(text, btn) {
  navigator.clipboard.writeText(text).then(() => {
    const original = btn.textContent;
    btn.textContent = "Copied";
    setTimeout(() => { btn.textContent = original; }, 1500);
  }).catch(() => {
    btn.textContent = "Copy failed";
  });
}
document.getElementById("copy-addr").addEventListener("click", (e) => {
  copyTo(ADDR, e.currentTarget);
});
document.getElementById("copy-uri").addEventListener("click", (e) => {
  copyTo(makeUri(currentAmt), e.currentTarget);
});

// ----------- Crossmark sign request -----------
// Crossmark exposes window.xrpl (after install) with a sign API.
// If not installed, send the user to the install page.
document.getElementById("crossmark-btn").addEventListener("click", async () => {
  const btn = document.getElementById("crossmark-btn");
  if (!window.xrpl || !window.xrpl.signAndSubmit) {
    window.open("https://crossmark.io/", "_blank", "noopener");
    return;
  }
  btn.textContent = "Awaiting Crossmark…";
  try {
    await window.xrpl.signAndSubmit({
      TransactionType: "Payment",
      Destination: ADDR,
      DestinationTag: DT,
      Amount: String(Math.round(currentAmt * 1_000_000)),
    });
    btn.textContent = "Sent; thank you";
  } catch (e) {
    btn.textContent = "Cancelled";
    setTimeout(() => { btn.textContent = "Sign with Crossmark"; }, 2000);
  }
});

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
