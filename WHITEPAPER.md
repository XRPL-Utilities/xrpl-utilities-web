# XRPL-Utilities

**Data infrastructure for the XRP Ledger, agent-payable over x402**

Version 1.0 · May 2026

---

## Executive Summary

XRPL-Utilities is a portfolio of six on-chain data services that read the XRP Ledger and surface institutional-grade signals: wallet behavioral classification, real-time signal feeds, supply telemetry, permissioned-domain directories, real-world asset tracking, and ETF flow correlation. Every endpoint is free to use from the marketing site and agent-payable over the x402 protocol at ten cents per call, settled either in XRP or RLUSD on XRPL or USDC on Base mainnet through a Coinbase x402 facilitator. The entire portfolio is built, deployed, and operated by XRPL-Utilities LLC (Wyoming) and is currently live in production at xrpl-utilities.com.

The strategic thesis is that the agentic economy will need clean, decoupled, agent-payable data infrastructure for every public blockchain it touches. XRPL is one of the chains where institutional capital, tokenized real-world assets, and US-listed ETFs are converging. XRPL-Utilities is the data layer for that convergence.

Three things distinguish the portfolio from generic chain analytics:

1. Operator-curated data, not raw scrape. Issuer registries, watchlists, ETF tickers, and signal catalogs are maintained as deliberate decisions rather than algorithmic discovery dumps. Auto-discovery feeds the queue; promotion stays manual.
2. Verify-then-work-then-settle x402 ordering. A buyer is only billed after a successful response is computed. Failed AI calls or upstream timeouts do not trigger settlement.
3. Multi-rail payment, XRPL-native data. The data moat is what makes XRPL-Utilities distinctive. The payment layer is rail-agnostic so AgentCore agents, MCP clients, and any x402-aware buyer can transact regardless of which chain their wallet lives on.

As of May 18, 2026, the portfolio serves six live services plus a Model Context Protocol server published to npm, with USDC-on-Base settlement validated end-to-end across all six on Base mainnet.

---

## 1. Background

The XRP Ledger has been a production payment network since 2012. Over the past three years it has gained four properties that change the data-infrastructure question: a regulated stablecoin (RLUSD), tokenized US Treasuries and other real-world assets from named issuers, US-listed spot XRP ETFs, and the XLS-70/80/81 permissioned-domain stack for institutional venues on a public ledger.

Reading the ledger to answer institutional questions about these properties is technically possible but operationally expensive. The naive path requires running an XRPL node, knowing which transaction shapes correspond to which institutional events (an EscrowFinish on a DvP candidate looks identical to an EscrowFinish on a vesting unlock until you cross-reference the Condition hash), maintaining an operator-curated watchlist of labeled wallets, and translating raw ledger objects into the dashboards a treasury or compliance team actually wants.

XRPL-Utilities is the operator-curated layer that does this work once and exposes it as six narrow APIs.

The agent-payable surface emerged from the x402 protocol launched in May 2025. Coinbase, AWS Bedrock AgentCore (announced May 2026), Stripe, and Cloudflare have all converged on x402 as the HTTP-native payment standard for autonomous agents. Coinbase's facilitator has processed over a hundred million machine-native payments across hundreds of thousands of buyers and sellers since launch (live counters are published on the x402 ecosystem page at x402.org/ecosystem). The standard is past the speculative-future phase.

---

## 2. The Portfolio

Six services. Each is its own independent deployment with its own .io subdomain, agents.json manifest, and isolated data store. They communicate backend-to-backend through a shared sister-product key when they need each other's data.

### 2.1 XR-Sentinel

Wallet behavioral pattern classifier. Reads an XRPL address's transaction history over a 90-day window and returns an activity score (0 to 100), an activity-level tier (Low, Medium, High, Dormant, Unknown), a signal catalog (35-plus deterministic on-chain heuristics covering automation patterns, institutional flow, dormancy reawakening, permissioned-domain operation, etc.), and an AI-generated narrative explaining the pattern.

Not a risk score, not an AML verdict, not a compliance certification. Behavioral classification only. The signals fire on patterns like tight median time between transactions (bot fingerprint), high counterparty diversity with labeled exchanges (institutional flow), or genesis-chain proximity to a known activator (cluster identification). Each call returns the raw signal flags so consumers run their own logic on top.

Endpoint: `POST /scan` with `{address: r...}`. Free preview from the marketing site; ten cents per scan over the agent API.

### 2.2 XR-Pulse

Normalized event feed combining public-source news with on-chain whale activity, real-world asset issuance, permissioned-domain lifecycle, and XLS-85 token-escrow events. One time-ordered JSON stream. The news side ingests regulatory feeds (SEC, FCA, ESMA), central bank feeds (Fed, ECB, BoE, BoJ, BoC, RBA, BIS), and crypto press filtered to XRP/RLUSD/XRPL coverage only. The on-chain side runs four watchers in parallel: whale Payments above an institutional-tier USD floor, real-world asset issuer mint and burn flow, permissioned-domain creation and credential events, and XLS-85 token-escrow plus issuer-side deep-freeze events.

A two-track real-world asset supply detection system catches mints and burns by both the per-transaction Payment classifier and an obligations-delta watcher that polls gateway_balances and fires events when an issuer's outstanding supply shifts by more than a configurable threshold. This catches DEX-mediated mints (Ripple brings RLUSD into circulation via OfferCreate on the XRPL DEX rather than direct Payments) that the per-transaction classifier structurally misses.

Endpoints: `POST /events/recent` and `POST /events/by-address` for snapshot queries (ten cents per call). `POST /stream/purchase` mints a time-boxed JWT for a live WebSocket subscription on `WS /stream` (one-hour fifty cents, six-hour two dollars fifty, twenty-four hour seven dollars fifty). Free preview-token surface for the marketing site.

### 2.3 XR-Telemetry

XRPL macro snapshot in a single call. Total supply, dormant supply, escrowed XRP, AMM-locked XRP, regional liquidity flow (with operator-curated exchange wallet maps spanning eighteen countries), settlement volume split between permissioned and open-market, ETF-custody XRP attributable from XR-Flows, and an implied utility-floor projection derived from the equation of exchange (M times V equals P times Q with M anchored at modeled active float).

The snapshot refreshes every five minutes server-side; per-call requests are cache reads. Per-field provenance lives in a `data_status` block of the response so consumers can audit which fields are fresh, which are stale, and which are operator-stated rather than on-chain attested.

Endpoint: `POST /scan` for the full snapshot. Also a `POST /quote` invoice flow for buyers who want to pay against a fixed destination tag instead of an inline x402 envelope.

### 2.4 XR-Trust

Permissioned-domain directory and explorer for XLS-70/80/81 ledger objects. Lists every active PermissionedDomain on mainnet, the credentials each accepts, the credential issuers and their identities (when on-chain DIDs and well-known TOMLs are published), and the live permissioned-DEX offers and AMMs operating inside each domain. Drill into a domain by domain_id or owner_address to surface lifecycle, member counts, credential issuer reputation, and on-chain trading activity.

Browsing the directory is free from the marketing site. Drill-down deep-dives are paid via x402. The first four PermissionedDomain owners on mainnet (verified May 2026) are tracked and surface in the directory at launch.

### 2.5 XR-Vault

Real-world asset tracker. Per-issuer deep dive for any tokenized asset on XRPL: lookup by wallet, logical label, or currency code. Returns circulating supply (treasury-subtracted where applicable), trustline count, 24-hour mint and burn flow, AMM-of-RWA pool exposure (every XLS-30 pool whose asset or asset2 includes the issuer's IOU), token-escrow activity, deep-freeze events, and an XLS-80 fingerprint when the issuer also operates a permissioned domain.

The tracked issuer set as of May 2026 covers tokenized US Treasuries (Ondo OUSG public and permissioned), money-market funds (Archax abrdn USD Liquidity), fiat stablecoins (RLUSD, Braza USDB and BBRL, Schuman EURØP, SG-FORGE EURCV, AUDD), commercial paper (Guggenheim DCP via Zeconomy SPV, currency code rolls forward by maturity), and energy commodities (Justoken JMWH, reported in megawatt-hours, not USD).

Native unit-of-account only. No fabricated USD valuation. Justoken JMWH stays in MWh. OUSG stays in OUSG. Schuman EURØP stays in EURØP. Consumers who need fiat translation pair this data with their own price feed.

Auto-discovery runs once per UTC day against XRPL issuer wallets with the AllowTrustLineClawback flag and non-zero gateway_balances obligations. Candidates surface at `/stats/daily-flow` for operator review. Promotion to the tracked registry remains a manual code edit; auto-promotion is reserved for the most conservative criteria (RequireAuth plus verified TOML at the issuer domain plus seven days of visibility).

### 2.6 XR-Flows

ETF AUM and XRPL on-chain flow correlation. Tracks every US-listed XRP-exposure ETF in two tiers: six spot funds (Bitwise XRP, Canary XRPC, Franklin Templeton XRPZ, Grayscale GXRP, 21Shares TOXR, REX-Osprey XRPR) and six indirect-basket funds (Bitwise BITW, Grayscale GDLC, Franklin EZPZ, Hashdex NCIQ, 21Shares TTOP, 21Shares TXBC) where only the XRP-attributable slice is persisted. Combined coverage roughly $1.26 billion XRP-attributable AUM as of May 2026.

Daily AUM is scraped from each issuer's public dashboard, Yahoo Finance, or third-party aggregators depending on what is reachable without paid API spend. Source lineage is preserved on each snapshot so consumers can audit which path produced each reading. A correlation view at `/stats/correlation` overlays the summed ETF AUM delta against XRPL exchange-flow delta from XR-Pulse and reports a rolling seven-day Pearson coefficient. The framing is explicit: correlation, never causation, because ETFs settle creations and redemptions off-chain through pooled institutional custodians.

A second view at `/stats/cross-border-flow` surfaces XRPL institutional cross-border settlement edges derived from labeled-wallet whale Payments. When both sender and receiver labels resolve to different operator-curated jurisdictions, the Payment counts as one cross-border edge. The map seeds eighteen countries across forty-seven XRPScan labels.

An auto-discovery loop at `/stats/etf-candidates` watches the SEC public ticker index for new XRP-related ETF tickers and surfaces them as a pre-review queue.

### 2.7 MCP Server

`@xrpl-utilities/mcp` is the Model Context Protocol server that exposes every paid endpoint as an MCP tool. Hosted at `mcp.xrpl-utilities.io` for HTTP/SSE clients and published to npm as `@xrpl-utilities/mcp` for stdio clients (Claude Desktop, Cursor, any MCP-aware host). Eighteen tools across the six services.

Stateless passthrough. The MCP server forwards the caller's own x402 payment header to the underlying service; there is no billing aggregation, no payment intermediation, and no caller-state retention beyond the request lifecycle.

This is the easiest entry point for AI agents that already speak MCP. One npm install (`npm i @xrpl-utilities/mcp`), one MCP host configuration, eighteen tool calls available.

---

## 3. Payment Model

Every paid endpoint speaks the x402 v2 specification. The HTTP 402 status code that was reserved in the original HTTP spec is the trigger for a Payment-Required response carrying one or more accepted payment options. The buyer signs a payment authorization, base64-encodes the envelope, and resends the original request with a PAYMENT-SIGNATURE header. The server verifies the signature, performs the work, settles the payment, and returns the response with a PAYMENT-RESPONSE header carrying the on-chain transaction hash.

Three rails are advertised on every 402 response when the deployment is configured for all three. Same ten-cent USD price across rails.

| Rail | Network | Buyer signing | Facilitator | Buyer wallet types |
|---|---|---|---|---|
| XRP on XRPL | xrpl:0 | XRPL Payment | t54 XRPL facilitator | Any XRPL classic-address wallet with XRP |
| RLUSD on XRPL | xrpl:0 | XRPL Payment | t54 XRPL facilitator | XRPL classic-address with RLUSD trustline |
| USDC on Base | eip155:8453 | EIP-3009 transferWithAuthorization | Coinbase x402 facilitator | Any EVM EOA holding USDC on Base mainnet |

The buyer picks whichever rail their wallet supports. For the EVM rail, the buyer signs an EIP-3009 transferWithAuthorization off-chain; the Coinbase facilitator submits the signed authorization on-chain and pays gas. The buyer never needs to hold ETH on Base. This is the same flow that AWS Bedrock AgentCore Payments uses by default, so any AgentCore-built agent can pay any XRPL-Utilities endpoint without code-level adapter work.

The ordering on every paid call is verify-then-work-then-settle. A buyer is only billed after the work succeeds. Failed AI generations, upstream timeouts, or oracle staleness return HTTP 503 or 502 with no settlement. The presigned authorization is never submitted on-chain when the work fails.

A defense-in-depth check covers a known facilitator misreport class on the XRPL rail. When the t54 facilitator returns tefPAST_SEQ on a transaction that actually settled, the server independently queries XRPL for the deterministic transaction hash and honors the on-chain success. This recovery path is gated to XRPL rails only.

---

## 4. Architecture

Every service follows the same pattern: an async HTTP service with isolated per-service persistence, deployed independently so a watcher slowdown in one service does not cascade. The marketing site is static-asset hosted at the edge. The MCP server is a stateless passthrough.

Service-to-service communication uses a shared sister-product key over HTTPS, not the public x402 paywall, when one XR-* service needs data from another. This avoids billing loops and keeps internal observability clean. Public callers still hit the same endpoints via the paid surface.

Background watchers run as in-process tasks on configurable intervals. The cadence per watcher is tuned for the underlying data: high-frequency on whale activity, moderate on real-world asset supply, low for daily aggregates. Polling fans out across multiple XRPL node sources so a single upstream outage does not stall the feed.

Schema versioning is strict. Every API response carries a `schema_version` field. The MCP server maintains a `knownSchemaVersions` array per service and warns when a service reports a version not in the array. A pre-commit hook blocks unbumped agents.json edits to prevent silent schema drift.

The verify-then-work-then-settle ordering is intentional and load-bearing. Settlement only occurs after the handler successfully completes the work; failed AI generations, upstream timeouts, or oracle staleness return without billing the buyer. This ordering matters because the alternative (settle-then-work) charges buyers for failures that were the seller's responsibility.

---

## 5. Brand Positioning

XRPL-Utilities is XRPL-native data infrastructure. The data is the moat. The payment layer is rail-agnostic.

This distinction is structural. Reading XRPL on-chain, maintaining operator-curated registries of issuers and venues, classifying institutional patterns, and exposing them as narrow APIs is the work that produces value. Whether a buyer pays in XRP, RLUSD, or USDC on Base is incidental to that value. Gatekeeping payment to XRPL-only would have foreclosed the AgentCore funnel without adding any moat.

The decision to add USDC-on-Base as a third rail in May 2026 was a direct response to the AWS Bedrock AgentCore Payments launch on May 7. Coinbase wallets default to USDC on Base. An XRPL-only paywall would have bounced every AgentCore-built buyer at the 402 challenge. Adding the rail preserved the data-moat positioning while opening the largest x402-aware buyer pool to date.

The branding hierarchy reflects this. The headline "XRPL Data Infrastructure" on the homepage names what is distinctive. The payment line "Agent-payable via x402: XRP/RLUSD on XRPL or USDC on Base" names what is convenient.

---

## 6. Differentiation

**Versus commercial chain analytics vendors (Chainalysis, Elliptic, TRM, etc.):**
- These products bundle XRPL with dozens of chains and charge enterprise prices.
- XRPL-Utilities is XRPL-only, $0.10 per call, no contract, no account, no sales call.
- Coverage of XRPL-native primitives (XLS-30 AMMs, XLS-40 DIDs, XLS-70/80/81 permissioned domains, XLS-85 token escrows) is deeper than the generic vendors because they are built into the signal catalogs from the start, not retrofitted.
- The trade-off is single-chain scope. A buyer who needs Bitcoin and Ethereum coverage too will still pay the enterprise vendor for those chains. XRPL-Utilities does not try to displace them; it complements them at the XRPL data layer.

**Versus do-it-yourself XRPL nodes:**
- Running an XRPL node is technically free but operationally expensive (sync, storage, monitoring, watcher logic).
- A team that needs five wallet classifications a month is not going to amortize the operational cost. XRPL-Utilities at ten cents per scan is fifty cents per month for that team.
- A team that runs ten thousand scans per month at one dollar each in cost would justify a node. XRPL-Utilities can still be the right choice when the value is in the signal logic (operator-curated watchlists, institutional flow tiers, RWA issuer registry) rather than the raw ledger access.

**Versus competing XRPL data services:**
- Most XRPL data products are either explorers (XRPScan, Bithomp) or DeFi-specific (XPMarket, Sologenic charts).
- XRPL-Utilities is purpose-built for institutional and agent consumers: no chart UIs, no community widgets, no token launchpad. API-first; the dashboards are a thin wrapper for human readers.
- The MCP server makes it the only XRPL data service that is one configuration line away from any MCP-aware AI agent.

**Versus generic agent-payable services:**
- The x402 ecosystem in 2026 is roughly half generic content APIs (weather, jokes, image generation). Few of those services have a coherent product around their paywall.
- XRPL-Utilities is six distinct paid surfaces around one ledger, with operator-curated registries, schema discipline, and verifiable on-chain settlement.

---

## 7. Limitations and Honest Caveats

This is the section most product documentation skips. Reading it is the right thing to do before integrating.

**Single-chain scope.** Everything XRPL-Utilities surfaces is XRPL-native. RLUSD circulating supply on the marketing site reads roughly 436 million as of May 2026; the cross-chain total including Ethereum is closer to 1.6 billion. The site labels this explicitly. Consumers who need cross-chain views of multi-chain assets will need to combine XRPL-Utilities with a separate Ethereum or Solana data source.

**Operator-curated registries are deliberate but not exhaustive.** The RWA issuer set, the institutional watchlist, the ETF ticker registry, and the regional exchange map are all operator-maintained. Newly launched issuers and ETFs surface in auto-discovery candidates but require manual promotion before they enter the canonical registries. This is the right tradeoff for institutional consumers who care about precision, but it does mean a brand-new issuer launching today will not be in the registry today.

**Daily snapshots lag intra-day reality.** Real-world asset obligations are captured once per UTC day. Intra-day mints are caught by a separate obligations-delta watcher on a ten-minute polling interval; below the configurable threshold (defaulting to one million native units) supply changes do not fire individual events but still update the live obligations field. Consumers wanting per-transaction granularity should use the event feed; consumers wanting end-of-day stability should use the daily snapshot.

**ETF AUM data has structural delays.** Issuer dashboards publish daily after market close, third-party aggregators usually lag by one trading session, and indirect-basket funds have explicit `xrp_weight_pct` values that are point-in-time and may drift between operator updates. The data is accurate within these constraints; the response carries source lineage so consumers can audit.

**No NAV reconciliation against off-chain.** XR-Vault reports on-chain obligations and AMM-pool balances. It does not attempt to reconcile against issuer-reported NAV, custody attestations, or fund-administrator filings. A token's on-chain supply can diverge from its off-chain backing for reasons XR-Vault cannot see (off-XRPL redemption queues, attestation timing, force majeure).

**13F-style institutional disclosure flows are not tracked.** When a large institutional holder rotates an ETF position on the secondary market, total fund AUM may not change and XRPL-Utilities sees no signal. The trade is invisible to the platform until and unless the institutional filer's 13F is parsed by an external source. Whether to build a 13F tracker is an open question on the roadmap.

**Single-jurisdiction LLC.** XRPL-Utilities LLC is a Wyoming entity. Service is provided as-is, no SLA, no fiduciary relationship. The terms-of-service page documents the legal posture in detail. Operators in California and Colorado are jurisdictions where automated decisioning regulations apply more aggressively; the marketing site renders an explicit "void in CA/CO" wording for the AI narrative on those surfaces, and consumers in those jurisdictions are responsible for their own compliance with the local automated-decisioning frameworks.

**AI-generated narratives are not deterministic.** XR-Sentinel returns an AI-generated reasoning string alongside the deterministic signal catalog. The string is for human readability; agents should branch on the signal flags, not the narrative. The response carries an `ai_narrative_provenance` block listing the model, prompt version, and inference parameters so consumers can audit which model produced which narrative.

**No real-time guarantees beyond what the underlying XRPL ledger provides.** XRPL closes a ledger every three to five seconds in normal operation. XRPL-Utilities watchers poll on intervals (60 seconds for whales, 600 seconds for RWA, etc.) so the freshness floor is the polling cadence, not the ledger cadence. Streaming subscribers on Pulse get events as the watcher emits them, which is still on the polling cadence.

---

## 8. Roadmap

Items on the roadmap as of May 2026:

- **XRPL Payment Channels (v2 billing model for streaming).** The current Pulse streaming subscription uses HS256 JWT minted by a time-boxed x402 payment. The native XRPL primitive for streaming payments is the Payment Channel: a sender locks XRP into a unidirectional channel and submits per-message signed off-chain claims, settled in batches. The agent-native demo of a real payment channel against an x402 server is a credibility moat. Roughly six to eight sessions of engineering work.

- **13F institutional-holdings tracker.** Discussed in May 2026 after the Goldman Sachs Q1 2026 13F surfaced rotated positions in XRP-exposure ETFs. The decision is whether to build it as a standalone XR-* service, a new event source inside XR-Flows, or to defer. 13F data is delayed by 45 days from quarter end and intermittent (quarterly filings only), so the value depends on whether consumers want the slow-signal aggregation. Pending operator review.

- **Cross-chain RLUSD reference.** XR-Pulse currently surfaces XRPL-only RLUSD obligations. A reference line acknowledging Ethereum's portion of supply (currently roughly 1.16 billion via Ripple's ERC-20 contract) would clarify the multi-chain context without requiring Pulse to absorb Ethereum data dependencies.

- **Per-service social cards.** The marketing site currently uses a single shared social card across every page. Per-service variants (each with the service's logo and headline) would polish the share previews on X / Facebook / LinkedIn.

- **Discoverability surface for AgentCore.** Coinbase's Bazaar (the x402 discovery endpoint) is one of the channels through which Bedrock AgentCore buyers find paid endpoints. Listing every XR-* service in Bazaar, with accurate capability tags and pricing, is a free-distribution play.

---

## Appendix A: Endpoint Inventory

Public domain: `xrpl-utilities.com` (marketing + dashboards). Per-service API domains:

| Service | Domain | Paid endpoints | Free endpoints |
|---|---|---|---|
| Sentinel | sentinel.xrpl-utilities.io | `POST /scan`, `POST /scan/history`, `POST /bulk/quote` | `/agents.json`, `/schema`, `/tos`, `/healthz`, `/openapi.json` |
| Pulse | pulse.xrpl-utilities.io | `POST /events/recent`, `POST /events/by-address`, `POST /stream/purchase`, `WS /stream` | `/stats/*`, `/stream/preview-token`, `/agents.json`, `/schema` |
| Telemetry | telemetry.xrpl-utilities.io | `POST /scan`, `POST /quote` invoice flow | `/agents.json`, `/schema`, `/healthz` |
| Trust | trust.xrpl-utilities.io | `POST /scan` (paid for domain_id; free until directory has data for owner_address) | `/events`, `/permissioned-domains/*`, `/agents.json` |
| Vault | vault.xrpl-utilities.io | `POST /scan` | `/stats/rwa-summary`, `/stats/daily-flow`, `/agents.json` |
| Flows | flows.xrpl-utilities.io | `POST /scan` | `/stats/correlation`, `/stats/launch-impact`, `/stats/etf-aggregate-xrp-held`, `/stats/cross-border-flow`, `/stats/etf-candidates`, `/agents.json` |
| MCP | mcp.xrpl-utilities.io | 18 tools (stateless passthrough) | n/a |

Every service exposes `/agents.json` and `/.well-known/agents.json` (identical machine-readable manifest), `/schema` (response-shape contract), `/llms.txt` (LLM-crawler context), `/openapi.json` (OpenAPI 3 spec), and `/healthz` (liveness check).

## Appendix B: Wallet Addresses

| Wallet | Purpose | Address |
|---|---|---|
| XRPL treasury | x402 settlement, XRP and RLUSD rails | `rKxTzCKYKPPdXEzuioEQ6KekQK26w2DBd5` |
| Base treasury | x402 settlement, USDC-on-Base rail | `0xADB77e932516298660C47e390676c2F053D7f3c8` |

All paid endpoints settle to the wallet on the corresponding rail. The XRPL wallet has a 32-bit DestinationTag partition (top 8 bits encode the service that minted the tag) so off-chain reconciliation per service is trivial. The Base wallet is shared across all services since EIP-3009 authorizations do not carry destination tags and per-invoice attribution lives in the `invoiceId` field of the x402 payment payload.

## Appendix C: Live Schema Versions (May 18, 2026)

| Service | Schema | Notes |
|---|---|---|
| XR-Sentinel | 2.22.0 | USDC-on-Base rail added |
| XR-Pulse | 1.46.2 | RWA obligations-delta watcher + live_obligations field + obligations_delta_today |
| XR-Telemetry | 1.15.0 | USDC-on-Base rail added |
| XR-Trust | 2026-33 | USDC-on-Base rail added |
| XR-Vault | 1.10.0 | USDC-on-Base rail added |
| XR-Flows | 1.21.0 | USDC-on-Base rail added |
| MCP | 0.2.69 | knownSchemaVersions synced through 1.46.2 |

Schema versions follow semantic versioning per service. Major bump on breaking response-shape changes; minor on additive fields; patch on documentation or formatting changes. The MCP server's `knownSchemaVersions` array is updated within the same session as any backend schema bump to prevent silent drift.

---

## Appendix D: XLS Reference

XRPL Standards (XLS) are versioned protocol specifications. Several are referenced throughout this document and the underlying signal catalogs. One-line summaries below; full specs live at github.com/XRPLF/XRPL-Standards.

- **XLS-30** Automated Market Maker. Native AMM pools on XRPL with pair balances + LP shares. XR-Vault tracks every AMM-of-RWA pool through this primitive.
- **XLS-40** Decentralized Identifier. On-chain DID ledger object that points at a self-published TOML manifest. XR-Trust + XR-Sentinel resolve DIDs to surface institutional identity behind wallet addresses.
- **XLS-70** PermissionedDomain. The domain ledger object that defines which on-chain credentials are required to participate in a regulated venue. XR-Trust indexes every active domain on mainnet.
- **XLS-80** Accepted credentials inside a permissioned domain. A domain declares a list of credential issuers whose attestations are accepted for membership. XR-Trust surfaces the list and the issuers' identities.
- **XLS-81** Permissioned DEX. Offer and AMM ledger objects scoped to a specific permissioned domain (only credential-holding accounts can fill them). XR-Trust surfaces the live offers and AMMs per domain.
- **XLS-85** TokenEscrow. Time-locked or condition-locked escrow for non-XRP IOU tokens. XR-Pulse fires events for EscrowCreate, EscrowFinish, EscrowCancel transactions and flags delivery-versus-payment candidates when two escrows share a Condition hash within an hour.

## Contact

`hello@xrpl-utilities.com` for partnership, integration, or enterprise inquiries.
`https://github.com/XRPL-Utilities` for the source repositories of each service and the MCP server.

XRPL-Utilities LLC, Wyoming, USA.

---

*This document describes the production state of XRPL-Utilities as of May 18, 2026. Schemas, rails, and watcher cadences evolve. The agents.json file at each service's root carries the live manifest and supersedes anything stated here when they conflict.*
