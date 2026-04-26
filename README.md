# xrpl-utilities-web

Marketing + showcase site for the XRPL-Utilities portfolio. Pure static HTML
with Tailwind via CDN — no build step, no JavaScript framework, no
runtime dependencies.

## Pages

| Path | Purpose |
|---|---|
| `index.html` | Landing page for `xrpl-utilities.com` — brand intro + tools portfolio |
| `sentinel/index.html` | Human-usable XR-Sentinel showcase — try-it-yourself form, sample classifications, "for agents" code snippet |
| `assets/logo.png` | Brand asset, served from `/assets/logo.png` |
| `_headers` | Cloudflare Pages security headers (CSP-lite, no-frame, etc.) |

## Local preview

```bash
# Any static server works. Python's built-in is fine:
python -m http.server 8000

# Then open http://localhost:8000
```

The `sentinel/index.html` page calls `https://sentinel.xrpl-utilities.io/scan`
directly. CORS is enabled on the API, so it works from `localhost`.

## Deploy — Cloudflare Pages

Cloudflare Pages auto-deploys on every push to `main`.

### One-time setup

1. Push this repo to GitHub.
2. Cloudflare Dashboard → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.
3. Select the repo. Build settings:
   - **Framework preset**: None
   - **Build command**: *(leave empty)*
   - **Build output directory**: `/`
4. Deploy. Cloudflare assigns a `*.pages.dev` URL.
5. **Custom domains** → add `xrpl-utilities.com` and `www.xrpl-utilities.com`.
   Cloudflare auto-creates the DNS records since the domain is already on
   Cloudflare DNS for the `.com` apex.

### Subsequent deploys

`git push origin main` → Pages picks up the change → live in ~30 seconds.

## What's intentionally NOT here

- **A real free-tier demo backend.** The `/sentinel` page calls the live
  `/scan` endpoint and renders the `402 Payment Required` response as an
  educational artifact. Sample-wallet buttons render pre-canned mock data
  marked as illustrative. A true free-tier (rate-limited, IP-fingerprinted,
  free scan-per-day) would require a `/demo-scan` endpoint added to the
  XR-Sentinel service. Treat that as a follow-up.
- **A JS framework.** If a future tool page needs interactivity beyond
  vanilla JS, consider Astro at that point — not before.
- **Analytics.** Add Cloudflare Web Analytics from the dashboard if wanted
  (no script tag needed; CF injects it).

## Sibling repos

- `XR-Sentinel` — the FastAPI service that powers the `/sentinel` showcase
  and the agent-facing API at `sentinel.xrpl-utilities.io`.
