# xrpl-utilities-web

Marketing + showcase site for the XRPL-Utilities portfolio. Pure static HTML
with Tailwind via CDN, no build step, no JavaScript framework, no runtime
dependencies.

## Pages

| Path | Purpose |
|---|---|
| `index.html` | Landing page for `xrpl-utilities.com`: brand intro and tools portfolio |
| `start/index.html` | New-to-XRPL plain-English onboarding (5-minute walkthrough + service router) |
| `pricing/index.html` | Pricing page for the six paid x402 endpoints + Pulse streaming subscriptions |
| `sentinel/index.html` | XR-Sentinel showcase: try-it-yourself form, sample classifications, "for agents" snippet |
| `sentinel/bulk/index.html` | Paid bulk-scan flow (up to 50 XRPL addresses, single payment, CSV download) |
| `telemetry/index.html` | XR-Telemetry showcase: cached samples, Burst Math calculator, Predictive Floor Matrix chart, live paid snapshot |
| `pulse/index.html` | XR-Pulse showcase: 24h whale strip, daily totals + coverage donut, live news+activity feed, glossary |
| `trust/index.html` | XR-Trust showcase: permissioned-domain directory + drill-down, jurisdictions, active operators |
| `vault/index.html` | XR-Vault showcase: RWA issuer dashboard, top movers, XLS-85 escrow tile, settlement chart |
| `flows/index.html` | XR-Flows showcase: ETF AUM + XRPL exchange-flow correlation, launch-window analysis |
| `terms/index.html` | Terms of service (canonical legal text including void-where-prohibited disclosure) |
| `status/index.html` | Status page |
| `contact/index.html` | Contact form (web3forms-backed, Cloudflare Turnstile spam protection) |
| `tip/index.html` | Tip jar page (XRPL Payment to the operator wallet) |
| `assets/logo.png`, `assets/xr-*.png` | Brand assets |
| `assets/preview-token.js` | Cloudflare Turnstile-issued preview-JWT minter for free in-browser API calls |
| `assets/scan-flow.js` | Single + bulk scan UI, payment polling, QR rendering, CSV export |
| `assets/telemetry-flow.js` | Telemetry payment polling + result rendering for the `/telemetry/` page |
| `assets/glossary-tooltip.js` | Shared hover-tooltip component for XRPL jargon (XLS-80, AMM, DvP, x402, etc.) |
| `assets/stat-tile.css` | Shared visual treatment for headline-number cards across the portfolio |
| `_headers` | Cloudflare Pages security + cache headers (CSP, HSTS, X-Frame-Options, Cache-Control) |
| `_redirects` | Apex/www redirect rules |
| `robots.txt` | Allow all, points crawlers at `sitemap.xml` |
| `sitemap.xml` | All public pages with lastmod and priority |
| `wrangler.jsonc`, `_worker.js` | Cloudflare Workers config + entrypoint |
| `.assetsignore` | Files excluded from a Workers asset bundle if/when Workers takes over |

## Local preview

```bash
# Any static server works. Python's built-in is fine:
python -m http.server 8000

# Then open http://localhost:8000
```

The `sentinel/` page calls `https://sentinel.xrpl-utilities.io/bulk/quote`
for the paid bulk flow and `/scan` for the single-scan flow. The
`telemetry/` page calls `https://telemetry.xrpl-utilities.io/healthz`
on load (live spot price) and `/quote` + `/status/{id}` + `/results/{id}`
for the paid invoice flow. CORS on both APIs is locked to the .com origins,
so local preview works from any localhost port. The contact form posts to
web3forms; Turnstile validation happens on web3forms' backend.

## Deploy: Cloudflare Pages

Cloudflare Pages auto-deploys on every push to `main`.

### One-time setup

1. Push this repo to GitHub.
2. Cloudflare Dashboard, Workers & Pages, Create, Pages, Connect to Git.
3. Select the repo. Build settings:
   - Framework preset: None
   - Build command: (leave empty)
   - Build output directory: `/`
4. Deploy. Cloudflare assigns a `*.pages.dev` URL.
5. Custom domains: add `xrpl-utilities.com` and `www.xrpl-utilities.com`.

`wrangler.jsonc` is currently a stub for an eventual Workers migration. Pages
ignores it, and `.assetsignore` is in place to keep repo metadata
(`.git`, `README.md`, `wrangler.jsonc` itself) out of any future Workers
asset bundle.

### Subsequent deploys

`git push origin main`, Pages picks up the change, live in ~30 seconds.

## What's intentionally NOT here

- A real free-tier demo backend. The single-scan flow goes to the live
  paid endpoint and uses the actual XRPL Payment / x402 quote dance. A
  rate-limited, IP-fingerprinted free `/demo-scan` would require backend
  work in the XR-Sentinel service. Treat as a follow-up.
- A JS framework. If a future tool page needs interactivity beyond vanilla
  JS, consider Astro at that point, not before.
- Analytics. Add Cloudflare Web Analytics from the dashboard if wanted (no
  script tag needed; CF injects it).

## Sibling repos

Each `.com` service page reads from a sibling FastAPI service that also
serves the agent-facing API:

- `XR-Sentinel` — wallet activity-pattern classifier (`sentinel.xrpl-utilities.io`)
- `XR-Telemetry` (repo: `XRPL-Utilities-XR-Telemetry`) — macro telemetry +
  Active Float + Burst Math (`telemetry.xrpl-utilities.io`)
- `XR-Pulse` — normalized signal feed + WebSocket streaming
  (`pulse.xrpl-utilities.io`)
- `XR-Trust` — permissioned-domain directory + XLS-80/81/40 explorer
  (`trust.xrpl-utilities.io`)
- `XR-Vault` — real-world asset tracker (`vault.xrpl-utilities.io`)
- `XR-Flows` — ETF AUM vs XRPL exchange-flow correlation
  (`flows.xrpl-utilities.io`)
- `xrpl-utilities-mcp` — Model Context Protocol server exposing all six
  services as MCP tools (`mcp.xrpl-utilities.io`, also published to npm
  as `@xrpl-utilities/mcp`)
