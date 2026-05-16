/**
 * Glossary tooltip component for XRPL-Utilities .com pages.
 *
 * Drop-in script: include via <script src="/assets/glossary-tooltip.js"
 * defer></script>. Markup pattern: any <span class="gloss" data-term="XLS-30">
 * (or any other key from the GLOSSARY map below) gets a small dotted
 * underline, a "?" affordance on hover, and a popover with a plain-English
 * definition. Hover-only (with keyboard focus support); no JS state, no
 * external deps, no layout shift.
 *
 * Designed for the "new to XRPL" persona without compromising the
 * institutional voice for readers who already know the terms.
 */
(function () {
  const GLOSSARY = {
    "xrpl": {
      title: "XRPL (XRP Ledger)",
      body: "Open-source public blockchain in continuous operation since 2012. Native token is XRP. 3-5 second settlement, built-in DEX, native multi-asset issuance, no smart-contract VM."
    },
    "xrp": {
      title: "XRP",
      body: "The native token of the XRP Ledger. 100B fixed supply at genesis, used to pay tiny transaction fees (~0.00001 XRP each) and to bridge currencies through the on-ledger DEX."
    },
    "rlusd": {
      title: "RLUSD",
      body: "Ripple's regulated USD stablecoin, issued on XRPL by rMxCKb…m5De. Pegged 1:1 to USD. Most XR-Utilities paid endpoints accept it as a payment alternative to XRP."
    },
    "x402": {
      title: "x402 (HTTP 402 Payment Required)",
      body: "Open standard for machine-payable APIs. Endpoint returns HTTP 402 with payment options; client signs a payment and resends with a PAYMENT-SIGNATURE header; server verifies, runs the work, then settles. Lets agents pay without API keys or accounts."
    },
    "amm": {
      title: "AMM (Automated Market Maker)",
      body: "On-chain liquidity pool that lets traders swap two assets at an algorithmic price. XRPL has native AMM support (XLS-30) so any token pair can have a pool without a third-party DEX contract."
    },
    "xls-30": {
      title: "XLS-30",
      body: "XRPL standard for native AMM pools. Each pool is a ledger object holding reserves of two assets; trades adjust the reserves along an x*y=k curve."
    },
    "xls-70": {
      title: "XLS-70 (Credentials)",
      body: "XRPL standard for on-chain attestations issued by one address to another (e.g., 'KYC verified', 'accredited investor'). Foundation for permissioned domains."
    },
    "xls-80": {
      title: "XLS-80 (PermissionedDomains)",
      body: "XRPL standard for membership domains: an owner address declares which credentials are required, and other addresses join by holding any accepted credential. Used to gate access to liquidity venues."
    },
    "xls-81": {
      title: "XLS-81 (Permissioned DEX)",
      body: "XRPL standard for offers and AMM pools that only accept counterparties who are members of a specified permissioned domain. Lets institutions run regulated trading venues on the same public ledger as the open DEX."
    },
    "xls-85": {
      title: "XLS-85 (Token Escrow)",
      body: "XRPL standard for time-locked or condition-locked escrow of non-XRP IOU tokens. Used for vesting schedules, deferred settlement, and atomic two-leg trades."
    },
    "permissioned-domain": {
      title: "Permissioned domain",
      body: "An on-chain membership group (XLS-80) where the owner declares the credentials required to join. Used by institutions to run regulated venues — only credentialed counterparties can trade inside."
    },
    "permissioned-dex": {
      title: "Permissioned DEX",
      body: "DEX offers (XLS-81) that only fill against counterparties who are members of a specified permissioned domain. Same XRPL DEX engine, restricted access."
    },
    "rwa": {
      title: "RWA (Real-World Asset)",
      body: "A token on a blockchain that represents an off-chain asset: a US Treasury bill, a money-market fund share, a barrel of oil, a stablecoin redeemable for fiat. On XRPL, examples include OUSG (Ondo tokenized Treasuries), TBL (OpenEden T-Bills), EURCV (Société Générale euro stablecoin)."
    },
    "did": {
      title: "DID (Decentralized Identifier)",
      body: "Self-sovereign on-chain identity standard (W3C). An XRPL address can publish a DID document linking to a TOML file with org_name, principals, and operator-signed attestations. XR-Trust resolves these to surface institutional identity behind raw wallet addresses."
    },
    "dvp": {
      title: "DvP (Delivery vs Payment)",
      body: "Atomic two-leg trade where the delivery of an asset and the payment for it settle together (or neither does). XR-Pulse flags XLS-85 escrow pairs that share a Condition hash within an hour as DvP candidates — strong indicator of a real two-party settlement, not a confirmation."
    },
    "active-float": {
      title: "Active Float",
      body: "XR-Telemetry's measure of XRP that can actually clear inside a single ledger close (~3-5 seconds). Subset of total circulating supply: most XRP held at exchanges is sitting in customer balances, not posted on order books. Active Float applies a multiplier to estimate the genuinely-tradeable slice."
    },
    "burst-math": {
      title: "Burst Math",
      body: "XR-Telemetry's settlement-floor calculator. Uses the equation-of-exchange identity M·V = P·Q with M anchored at Modeled Active Float. Set Q (assumed annual settlement volume) and V (turnover rate); returns P (per-XRP price the math requires). Not a forecast — a floor."
    },
    "whale-tier": {
      title: "Whale tier",
      body: "XR-Pulse's four-tier classification of XRPL Payments: NORMAL_ACTIVITY (under $1M, both sides anonymous), WHALE_MOVE ($1M-$10M, both sides anonymous), INSTITUTIONAL_FLOW (over $10M OR at least one side watchlisted), EXCHANGE_LOGISTICS (Hot↔Cold inside same venue, maintenance not sentiment)."
    },
    "etf-aum": {
      title: "ETF AUM (Assets Under Management)",
      body: "Total dollar value of an ETF's holdings. For spot XRP ETFs, this is the dollar value of the XRP the fund holds in custody. XR-Flows tracks AUM per US-listed XRP ETF and plots it alongside on-chain XRPL flow."
    },
    "mcp": {
      title: "MCP (Model Context Protocol)",
      body: "Open standard from Anthropic for connecting AI assistants to external data sources and tools. The xrpl-utilities-mcp server exposes all six XR-* paid endpoints as MCP tools, so Claude Desktop (or any MCP host) can pay and call them through one configured XRPL wallet."
    },
    "facilitator": {
      title: "x402 facilitator",
      body: "Third-party service that verifies and settles x402 payments without the seller having to run its own XRPL node integration. XR-Utilities uses the t54 facilitator at xrpl-facilitator-mainnet.t54.ai."
    },
    "ledger-close": {
      title: "Ledger close",
      body: "XRPL produces a new validated ledger every 3-5 seconds. A transaction is final once it's included in a closed ledger — no probabilistic confirmation, no waiting for N blocks of confirmation."
    },
    "trustline": {
      title: "Trustline",
      body: "An XRPL ledger object expressing one address's willingness to hold a specific token issued by another address, up to a stated limit. Required before you can receive any non-XRP token."
    }
  };

  // Default styling — injected once, no external CSS file required.
  const STYLE_ID = "glossary-tooltip-style";
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .gloss {
        border-bottom: 1px dotted rgba(0, 184, 255, 0.55);
        cursor: help;
        position: relative;
        white-space: nowrap;
      }
      .gloss:focus { outline: none; border-bottom-color: rgba(0, 184, 255, 1); }
      .gloss-pop {
        position: absolute;
        z-index: 100;
        bottom: calc(100% + 0.5rem);
        left: 0;
        width: 18rem;
        max-width: calc(100vw - 2rem);
        background: rgba(15, 15, 15, 0.98);
        border: 1px solid rgba(0, 184, 255, 0.3);
        border-radius: 0.5rem;
        padding: 0.75rem 0.9rem;
        font-size: 0.75rem;
        line-height: 1.5;
        color: rgba(229, 231, 235, 0.92);
        font-weight: 400;
        white-space: normal;
        box-shadow: 0 4px 24px rgba(0, 0, 0, 0.4);
        pointer-events: none;
        opacity: 0;
        transform: translateY(4px);
        transition: opacity 120ms ease, transform 120ms ease;
      }
      .gloss-pop.show {
        opacity: 1;
        transform: translateY(0);
      }
      .gloss-pop-title {
        display: block;
        font-size: 0.6875rem;
        text-transform: uppercase;
        letter-spacing: 0.12em;
        color: rgba(0, 184, 255, 0.9);
        font-weight: 600;
        margin-bottom: 0.35rem;
      }
      @media (max-width: 640px) {
        .gloss-pop { width: 14rem; left: 0; right: auto; }
      }
    `;
    document.head.appendChild(style);
  }

  // Attach hover + focus handlers to every .gloss element. Idempotent —
  // running twice (e.g. after a re-render) won't double-attach.
  function attach(el) {
    if (el.dataset.glossInit === "1") return;
    el.dataset.glossInit = "1";

    const key = (el.dataset.term || el.textContent || "").trim().toLowerCase();
    const entry = GLOSSARY[key];
    if (!entry) {
      // Term not in glossary - quietly remove the affordance so the
      // missing entry isn't visible to the reader.
      el.classList.remove("gloss");
      return;
    }

    // Make focusable for keyboard users.
    if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "0");
    el.setAttribute("aria-describedby", "gloss-pop-" + Math.random().toString(36).slice(2, 8));

    let pop = null;

    function show() {
      if (!pop) {
        pop = document.createElement("span");
        pop.className = "gloss-pop";
        pop.id = el.getAttribute("aria-describedby");
        pop.innerHTML =
          '<span class="gloss-pop-title">' + entry.title + '</span>' +
          entry.body;
        el.appendChild(pop);
      }
      // Allow a tick for the DOM insertion before adding the transition class.
      requestAnimationFrame(() => pop.classList.add("show"));
    }

    function hide() {
      if (pop) pop.classList.remove("show");
    }

    el.addEventListener("mouseenter", show);
    el.addEventListener("mouseleave", hide);
    el.addEventListener("focus", show);
    el.addEventListener("blur", hide);
  }

  function init() {
    document.querySelectorAll(".gloss").forEach(attach);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  // Expose for any page that re-renders content (Pulse live feed,
  // Vault tile refresh, Trust drill-down, etc.) so they can re-init
  // after injecting new markup.
  window.GlossaryTooltip = { init };
})();
