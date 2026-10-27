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

// Pre-filled address shortcuts. Web is free; clicking a shortcut just
// populates the input and runs a real scan against the live API. No
// local cached classification - the live result is what gets shown.
const SAMPLE_ADDRESSES = {
  ondo:      "rHuiXXjHLpMP8ZE9sSQU5aADQVWDwv6h5p",
  sologenic: "rsoLo2S1kiGeCcn6hCUXVrCpGMWLrRrLZz",
  bithomp:   "rKontEGtDju5MCEJCwtrvTWQQqVAw5juXe",
  escrow:    "rELeasERs3m4inA1UinRLTpXemqyStqzwh",
};

// Showcase gallery. Operator-curated, organized by what each wallet
// demonstrates. Verified addresses only; no speculative entries.
// Verification date in each blurb reflects the last on-chain check.
const GALLERY = [
  {
    label: "Tokenized RWA issuers",
    blurb: "Real-world-asset tokens issued natively on XRPL. Useful for testing Sentinel's issuer-profile narrative + governance-flag signals (clawback, RequireAuth, blackholed master key, DefaultRipple).",
    wallets: [
      { address: "rHuiXXjHLpMP8ZE9sSQU5aADQVWDwv6h5p", name: "Ondo Finance · OUSG (permissioned)",          blurb: "Tokenized US Treasuries. RequireAuth + clawback. Operator-restricted distribution." },
      { address: "roUSG6gvxKGBcgGVXhPKHEgy4YyDfiSi3",  name: "Ondo Finance · OUSG (retail/public)",          blurb: "Same token family, Ripple-deployed public-distribution wallet. ~4k trustlines vs the permissioned wallet's ~20." },
      { address: "rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De", name: "Ripple · RLUSD",                               blurb: "USD stablecoin. ~93k trustlines · the largest IOU issuer on XRPL by every measure." },
      { address: "rMkEuRii9w9uBMQDnWV5AA43gvYZR9JxVK", name: "Schuman Financial · EURØP",                   blurb: "Euro-denominated RWA. XRPScan-verified, ~600 trustlines." },
      { address: "rB3y9EPnq1ZrZP3aXgfyfdXQThzdXMrLMc", name: "Braza Group · USDB",                          blurb: "Brazilian-issued USD-denominated RWA. ~95M obligations." },
      { address: "rH5CJsqvNqZGxrMyGaqLEoMWRYcVTAPZMt", name: "Braza Group · BBRL",                          blurb: "Brazilian-real-denominated RWA. Sibling issuer to USDB." },
      { address: "rUNaS5sqRuxZz6V7rBGhoSaZiVYA3ut4UL", name: "SG-FORGE · EURCV",                            blurb: "Societe Generale subsidiary, euro stablecoin. Single launch tranche, ~20 trustlines (no retail distribution yet)." },
      { address: "rnXNUqF8LuXyUdfLdezftTeEUw2UFSLw5i", name: "Guggenheim / Zeconomy · DCP",                 blurb: "Digital Commercial Paper. QIB-only. Currency codes roll forward by maturity (GDCP&lt;YYYYMMDD&gt;)." },
      { address: "r976xbKc6om7WYTFwZHByvxnYFi1y5hJXH", name: "Justoken · JMWH",                             blurb: "Real-world MWh tokens. Track in native MWh; USD AUM is issuer-stated, not attested." },
      { address: "rJNE2NNz83GJYtWVLwMvchDWEon3huWnFn", name: "OpenEden · TBL",                              blurb: "T-Bill tokens. Note: gross obligations 9.9B but net circulating ~35M after treasury subtraction." },
      { address: "rUN5Zxt3K1AnMRJgEWywDJT8QDMMeLH5ok", name: "AUDC · AUDD",                                 blurb: "Australian-dollar stablecoin (audd.digital)." },
      { address: "rKCu4CucpepQ6N89c8T5GuX2jkxzCST18Q", name: "Archax × abrdn · pre-mint",                   blurb: "Rails-set-up but zero on-chain supply. RequireAuth + clawback + DefaultRipple posture; ~30 trustlines pre-authorized." },
    ],
  },
  {
    label: "XLS-80 permissioned-domain operators",
    blurb: "Wallets operating PermissionedDomain ledger objects under the XLS-80 amendment. These are the on-chain hooks that gate XLS-81 permissioned-DEX execution to credentialed subjects.",
    wallets: [
      { address: "rGKMDUdmquUCvoXxhcJSttnVnr2NYc9fYi", name: "xrp-liquid",                                  blurb: "Early XLS-81 venue operator. On-chain DID, a permissioned domain and resting domain offers for XRP against USDC / RLUSD / EURQ. No activity since June 2026; its website no longer resolves." },
      { address: "rtaXvxk6mqixCgMETaA5jxgm3ZKB5n3FP", name: "Anonymous operator",                          blurb: "Unlabeled second-mover. 2 domains, 8 credentials issued. No self-identification on chain." },
    ],
  },
  {
    label: "Service wallets and infrastructure",
    blurb: "Operator infrastructure, validators, and IOU issuers whose cadence reflects automated services rather than discretionary trading.",
    wallets: [
      { address: "rsoLo2S1kiGeCcn6hCUXVrCpGMWLrRrLZz", name: "Sologenic · issuer",                          blurb: "Multi-currency IOU issuer. High cadence; expect High activity classification." },
      { address: "rKontEGtDju5MCEJCwtrvTWQQqVAw5juXe", name: "Bithomp · validator account",                 blurb: "Validator and explorer operator. Service-cadence pattern." },
      { address: "rELeasERs3m4inA1UinRLTpXemqyStqzwh", name: "EscrowReleasers",                             blurb: "Automated escrow-finish service. Bot-cadence with structured intervals." },
      { address: "rB56JZWRKvpWNeyqM3QYfZwW4fS9YEyPWM", name: "OpenEden · TBL treasury",                     blurb: "Counterpart to the TBL issuer wallet. Holds the un-circulated supply that nets out of obligations." },
      { address: "rKxTzCKYKPPdXEzuioEQ6KekQK26w2DBd5", name: "XRPL-Utilities · receipt wallet",             blurb: "The wallet your $0.10 scans settle to. Self-referential test case for ledger-receipt patterns." },
    ],
  },
];

// Render the gallery into #gallery-categories. Each wallet card binds
// a click to populating the address input and triggering the same
// scan code path as the sample-btn row above.
(function renderGallery() {
  const root = document.getElementById("gallery-categories");
  if (!root) return;
  GALLERY.forEach(cat => {
    const block = document.createElement("div");
    const head = document.createElement("div");
    head.className = "text-xs uppercase tracking-widest text-accent font-semibold mb-1";
    head.textContent = cat.label;
    block.appendChild(head);
    const sub = document.createElement("p");
    sub.className = "text-xs text-muted leading-relaxed mb-3";
    sub.textContent = cat.blurb;
    block.appendChild(sub);
    const grid = document.createElement("div");
    grid.className = "grid sm:grid-cols-2 gap-2";
    cat.wallets.forEach(w => {
      const btn = document.createElement("button");
      btn.className = "gallery-card text-left bg-ink border border-border hover:border-accent rounded-lg px-4 py-3 transition";
      btn.dataset.address = w.address;
      const name = document.createElement("div");
      name.className = "font-semibold text-sm text-white";
      name.textContent = w.name;
      btn.appendChild(name);
      const blurb = document.createElement("div");
      blurb.className = "text-xs text-muted leading-snug mt-1";
      blurb.innerHTML = w.blurb;
      btn.appendChild(blurb);
      const addr = document.createElement("div");
      addr.className = "font-mono text-[10px] text-muted mt-2 truncate";
      addr.textContent = w.address;
      btn.appendChild(addr);
      grid.appendChild(btn);
    });
    block.appendChild(grid);
    root.appendChild(block);
  });
  root.querySelectorAll(".gallery-card").forEach(card => {
    card.addEventListener("click", () => {
      const addr = card.dataset.address;
      if (!addr) return;
      const input = document.getElementById("address");
      input.value = addr;
      input.scrollIntoView({ behavior: "smooth", block: "center" });
      document.getElementById("scan-btn").click();
    });
  });
})();

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function renderError(message) {
  const r = document.getElementById("result");
  r.replaceChildren();
  const card = el("div", "bg-panel border border-border rounded-2xl p-8");
  card.appendChild(el("h3", "text-xl font-bold mb-2 text-red-400", "Couldn't reach the service"));
  card.appendChild(el("p", "text-muted leading-relaxed", message));
  r.appendChild(card);
  r.classList.remove("hidden");
}

document.querySelectorAll(".sample-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    const addr = SAMPLE_ADDRESSES[btn.dataset.sample];
    if (!addr) return;
    document.getElementById("address").value = addr;
    // Trigger the same code path as the user clicking Scan, so the
    // live result is rendered and there is no surprise jump from a
    // cached preview to a live read.
    document.getElementById("scan-btn").click();
  });
});

const ADDR_RE = /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/;
// Enter in the address box runs the scan, like the button.
document.getElementById("address").addEventListener("keydown", (e) => {
  if (e.key === "Enter") { e.preventDefault(); document.getElementById("scan-btn").click(); }
});
document.getElementById("scan-btn").addEventListener("click", () => {
  const input = document.getElementById("address");
  // A classic address always starts with lowercase r. Phone keyboards that
  // still capitalize the first letter would otherwise fail validation.
  let address = input.value.trim();
  if (address.charAt(0) === "R") { address = "r" + address.slice(1); input.value = address; }
  if (!ADDR_RE.test(address)) { renderError("Enter a valid XRPL address (starts with 'r', 25-35 base58 characters)."); return; }
  const btn = document.getElementById("scan-btn");
  btn.disabled = true;
  btn.textContent = "Loading…";
  const r = document.getElementById("result");
  r.classList.remove("hidden");
  window.XRSentinelScan.startSingle(r, address).finally(() => {
    btn.disabled = false;
    btn.textContent = "Scan";
  });
});

// --- Verify an origin -------------------------------------------------
// GET /verify-origin is free and unauthenticated, so unlike the scan
// widget above this needs no Turnstile preview token. CORS on the
// service and connect-src in _headers already allow this origin.
(function () {
  const input = document.getElementById("origin-input");
  const btn = document.getElementById("verify-btn");
  const out = document.getElementById("verify-result");
  if (!input || !btn || !out) return;

  const VERDICT = {
    verified:   { c: "#4ade80", t: "Verified" },
    partial:    { c: "#fbbf24", t: "Partial" },
    unverified: { c: "#f87171", t: "Unverified" },
    mismatch:   { c: "#f87171", t: "Mismatch" },
    unreadable: { c: "#94a3b8", t: "Unreadable" }
  };
  const MARK = { pass: "&#10003;", fail: "&#10007;", warn: "!", unreadable: "?", "n/a": "&ndash;" };
  const COLOR = { pass: "#4ade80", fail: "#f87171", warn: "#fbbf24", unreadable: "#94a3b8", "n/a": "#64748b" };
  const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function render(d) {
    const v = VERDICT[d.verdict] || { c: "#94a3b8", t: esc(d.verdict) };
    const rows = (d.checks || []).map((c) =>
      '<li class="flex gap-3 py-2 border-b border-border/40 last:border-0">' +
        '<span class="font-mono text-sm shrink-0 w-4" style="color:' + (COLOR[c.status] || "#94a3b8") + '">' +
          (MARK[c.status] || "&middot;") + '</span>' +
        '<span class="min-w-0">' +
          '<span class="font-mono text-xs text-white">' + esc(c.id) + '</span>' +
          '<span class="block text-xs text-muted leading-relaxed mt-0.5">' + esc(c.detail) + '</span>' +
        '</span>' +
      '</li>').join("");
    out.innerHTML =
      '<div class="bg-ink border border-border rounded-xl p-5">' +
        '<div class="flex items-baseline gap-3 flex-wrap">' +
          '<span class="text-lg font-bold" style="color:' + v.c + '">' + v.t + '</span>' +
          '<span class="text-xs font-mono text-muted">evidence tier: ' + esc(d.evidence_tier) + '</span>' +
        '</div>' +
        '<p class="text-sm text-muted leading-relaxed mt-2">' + esc(d.verdict_reason) + '</p>' +
        '<ul class="mt-4">' + rows + '</ul>' +
      '</div>';
    out.classList.remove("hidden");
  }

  function renderMsg(msg, color) {
    out.innerHTML = '<div class="bg-ink border border-border rounded-xl p-5 text-sm" style="color:' +
      (color || "#94a3b8") + '">' + esc(msg) + '</div>';
    out.classList.remove("hidden");
  }

  async function run() {
    const raw = (input.value || "").trim();
    if (!raw) { renderMsg("Enter a domain or an XRPL address.", "#f87171"); return; }
    // An r-address goes to address= (what does this account's claim rest
    // on); anything else is treated as a web origin.
    const isAddr = /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(raw);
    const qs = isAddr ? "address=" + encodeURIComponent(raw)
                      : "url=" + encodeURIComponent(raw);
    btn.disabled = true; btn.textContent = "Checking\u2026";
    renderMsg("Fetching the origin's published documents and reading the ledger\u2026");
    try {
      const r = await fetch("https://sentinel.xrpl-utilities.io/verify-origin?" + qs);
      const d = await r.json().catch(() => null);
      if (!r.ok) {
        renderMsg((d && d.detail) ? d.detail : ("Request failed (HTTP " + r.status + ")."), "#f87171");
      } else {
        render(d);
      }
    } catch (e) {
      renderMsg("Could not reach the service. That is a failure to look, not a finding about the target.", "#94a3b8");
    } finally {
      btn.disabled = false; btn.textContent = "Verify";
    }
  }

  btn.addEventListener("click", run);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") run(); });
  document.querySelectorAll(".vsample-btn").forEach((b) => {
    b.addEventListener("click", () => { input.value = b.dataset.v; run(); });
  });
})();

// URL prefill: deep links from Pulse cross-ref (Sender/Receiver
// clickthrough) and from any other surface that wants to open
// Sentinel pre-targeted at a specific wallet land here with
// ?address=rXXX. Validate against ADDR_RE, populate the input,
// then synthesise a click on the Scan button so the user lands on
// a live result without an extra interaction. Malformed values
// fall through silently and the page renders its empty state.
(function applyUrlAddressParam() {
  try {
    const qsAddr = (new URLSearchParams(window.location.search).get("address") || "").trim();
    if (!qsAddr || !ADDR_RE.test(qsAddr)) return;
    document.getElementById("address").value = qsAddr;
    document.getElementById("scan-btn").click();
  } catch (_) { /* no-op */ }
})();

// Signal glossary drift detector. Fetch /schema, compare the
// documented signal count here against the live SIGNAL_CATALOG.
// Inline "N flags" pill replaced with the live count; mismatch
// surfaces a quiet amber note ("M awaiting doc") so the next
// operator session catches the gap mechanically rather than
// remembering to sync after every backend bump.
(async function() {
  try {
    const r = await fetch("https://sentinel.xrpl-utilities.io/schema");
    if (!r.ok) return;
    const data = await r.json();
    const sigs = data.signals || {};
    const catalogCount = Object.keys(sigs).length;
    const docContainer = document.getElementById("signal-glossary");
    if (!docContainer) return;
    const docCount = docContainer.querySelectorAll("dt.font-mono").length;
    const countEl = document.getElementById("glossary-count");
    const driftEl = document.getElementById("glossary-drift");
    if (countEl) countEl.textContent = catalogCount + " flag" + (catalogCount === 1 ? "" : "s");
    const missing = catalogCount - docCount;
    if (driftEl && missing > 0) {
      driftEl.textContent = "(" + missing + " new; see /schema for the full catalog)";
      driftEl.classList.remove("hidden");
    }
  } catch (_) { /* no-op; static count remains */ }
})();

// ------------------------------------------------------------------
// Signal-glossary UX: collapse each category by default + add a
// top-of-glossary search box that filters flag names + descriptions
// in-place. Runs after DOMContentLoaded so the static markup is the
// source of truth - no HTML edits required to add or remove flags.
// ------------------------------------------------------------------
(function glossarySearchCollapse() {
  const root = document.getElementById('signal-glossary');
  if (!root) return;

  // Build collapsed-by-default category sections from each existing
  // <h4> + adjacent <dl> pair. Move the dl inside a new <details>
  // and replace the standalone h4 with a custom <summary> that
  // carries the same label + a flag-count chip.
  const headers = Array.from(root.querySelectorAll('h4'));
  headers.forEach(h4 => {
    const dl = h4.nextElementSibling;
    if (!dl || dl.tagName !== 'DL') return;
    const catName = h4.textContent.trim();
    const flagCount = dl.querySelectorAll(':scope > div').length;

    const details = document.createElement('details');
    details.className = 'signal-cat border-t border-border/40 mt-6 pt-4';
    details.dataset.category = catName;

    const summary = document.createElement('summary');
    summary.className = 'cursor-pointer list-none flex items-center justify-between gap-4 py-2';
    summary.innerHTML =
      '<div class="flex items-baseline gap-3">' +
      '<span class="text-xs uppercase tracking-widest text-accent font-semibold">' + catName + '</span>' +
      '<span class="text-[10px] text-muted font-mono">' + flagCount + ' flag' + (flagCount === 1 ? '' : 's') + '</span>' +
      '</div>' +
      '<span class="text-xl text-accent shrink-0">▾</span>';

    details.appendChild(summary);
    // Insert the new <details> where the h4 used to sit, then move
    // the <dl> into it. h4 itself is no longer needed.
    h4.parentNode.insertBefore(details, h4);
    details.appendChild(dl);
    h4.remove();
  });

  // Inject the search input right after the existing intro <p>.
  const intro = root.querySelector('p');
  if (!intro) return;
  const searchWrap = document.createElement('div');
  searchWrap.className = 'mt-2 mb-2 relative';
  searchWrap.innerHTML =
    '<input id="glossary-search" type="search" placeholder="Search flags or descriptions…" ' +
    'class="w-full bg-ink border border-border rounded-lg px-4 py-2.5 text-sm text-white ' +
    'placeholder:text-muted focus:border-accent focus:outline-none transition" />' +
    '<p id="glossary-search-status" class="text-[10px] text-muted mt-1.5 font-mono hidden"></p>';
  intro.insertAdjacentElement('afterend', searchWrap);

  const input    = document.getElementById('glossary-search');
  const status   = document.getElementById('glossary-search-status');
  const allFlags = root.querySelectorAll('dl > div');
  const allCats  = root.querySelectorAll('details.signal-cat');

  function applyFilter(q) {
    q = (q || '').trim().toLowerCase();
    if (!q) {
      allFlags.forEach(el => { el.style.display = ''; });
      allCats.forEach(d => { d.open = false; });
      status.classList.add('hidden');
      return;
    }
    let matchCount = 0;
    const matchedDls = new Set();
    allFlags.forEach(el => {
      const hit = el.textContent.toLowerCase().includes(q);
      el.style.display = hit ? '' : 'none';
      if (hit) {
        matchCount += 1;
        matchedDls.add(el.parentElement);
      }
    });
    allCats.forEach(d => {
      const dl = d.querySelector('dl');
      d.open = matchedDls.has(dl);
    });
    status.textContent = matchCount + ' flag' + (matchCount === 1 ? '' : 's') + ' match "' + q + '"';
    status.classList.remove('hidden');
  }

  input.addEventListener('input', () => applyFilter(input.value));
  // Auto-open the glossary <details> when the user starts typing,
  // otherwise the search box is invisible. (User has to click the
  // glossary title first today.)
  input.addEventListener('focus', () => { root.open = true; });
})();
