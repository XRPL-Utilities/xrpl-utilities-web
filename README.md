# xrpl-utilities-web

Marketing + showcase site for the XRPL-Utilities portfolio. Pure static HTML
with Tailwind via CDN, no build step, no JavaScript framework, no runtime
dependencies.

## Pages

| Path | Purpose |
|---|---|
| `index.html` | Landing page for `xrpl-utilities.com`: brand intro and tools portfolio |
| `sentinel/index.html` | XR-Sentinel showcase: try-it-yourself form, sample classifications, "for agents" snippet |
| `sentinel/bulk/index.html` | Paid bulk-scan flow (up to 50 XRPL addresses, single payment, CSV download) |
| `telemetry/index.html` | XR-Telemetry showcase: cached samples, Burst Math calculator, Predictive Floor Matrix chart, live paid snapshot |
| `terms/index.html` | Terms of service |
| `status/index.html` | Status page |
| `manifest/index.html` | Human-friendly index of `/manifest`, `/schema`, `/openapi.json`, `/agents.json` developer endpoints |
| `contact/index.html` | Contact form (web3forms-backed, Cloudflare Turnstile spam protection) |
| `assets/logo.png` | Brand asset, served from `/assets/logo.png` |
| `assets/scan-flow.js` | Single + bulk scan UI, payment polling, QR rendering, CSV export |
| `assets/telemetry-flow.js` | Telemetry payment polling + result rendering for the `/telemetry/` page |
| `_headers` | Cloudflare Pages security + cache headers (CSP, HSTS, X-Frame-Options, Cache-Control) |
| `_redirects` | (none currently) |
| `robots.txt` | Allow all, points crawlers at `sitemap.xml` |
| `sitemap.xml` | All public pages with lastmod and priority |
| `wrangler.jsonc` | Cloudflare Workers config (currently unused; Pages is the live deployment) |
| `.assetsignore` | Files excluded from a Workers asset bundle if/when Workers takes over |

## Local preview

```bash
# Any static server works. Python's built-in is fine:
python -m http.server 8000

# Then open http://localhost:8000
```

The `sentinel/` page calls `https://sentinel.xrpl-utilities.io/scan` directly.
CORS is enabled on the API, so it works from `localhost`. The contact form
posts to web3forms; Turnstile validation happens on web3forms' backend.

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

- `XR-Sentinel`: the FastAPI service that powers the `/sentinel` showcase
  and the agent-facing API at `sentinel.xrpl-utilities.io`.
