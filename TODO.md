# TODO - xrpl-utilities-web

Standing operator checklist for the `.com` marketing/showcase site.
Backend follow-ups for `XR-Sentinel` and `XR-Telemetry` live in their own
repos' `TODO.md` files. Update items as they're done; strikethrough for
~1 month before pruning so changes stay traceable.

Sibling tracking files: `XR-Sentinel/TODO.md`, `XR-Telemetry/TODO.md`.

---

## Recently shipped (2026-04-28 session)

- [x] **Mobile menu fixed on `/telemetry`** (commit `9818f96`). Five in-page anchors collapsed into a `<details>` "Sections ▾" dropdown on mobile (`sm:hidden`); desktop unchanged. Native HTML, vanilla JS, no framework. Auto-closes on link click.
- [x] **Live XRP/USD spot fetched on page load** (commit `a88d604`). The `/telemetry` "Current spot" tile now reads from the Telemetry backend's `/healthz` (free, CORS-allowed for .com) instead of being stuck on the static $0.50 placeholder. Burst Math premium ratio is now meaningful pre-payment.
- [x] **Data-freshness banner** (commit `f6ae572` → simplified `8303cac`). Yellow ribbon at top of `/telemetry` reads `agents.json` `service_status` and surfaces dev-mode disclosure. Single sentence, no field enumeration.
- [x] **"Run live snapshot" button auto-hides** when `agents.json` reports `payments_enabled: false`. Replaced with a notice card pointing to the cached samples.
- [x] **`hodl_wave_pct` renderer fix** (commit `181b2c4`). `fmtPctRaw` instead of `fmtPct` so the 0–100 backend convention renders correctly. Sample data updated 0.642 → 64.2.

## Security

- [ ] **`_headers` Cloudflare config applied** - verify Cloudflare actually serves the CSP-lite, no-frame, no-referrer headers from `_headers`. Check via `curl -sI https://xrpl-utilities.com/ | grep -iE 'frame|content-type-options|referrer|strict-transport'`.
- [ ] **Turnstile sitekey is Invisible mode** in the Cloudflare dashboard (HTML side is configured; dashboard side is the gate). Sitekey: `0x4AAAAAADD5FJFZmiQt3CM3`.
- [ ] **web3forms access key** on the contact form is a public client key but rotate if it's ever leaked into a screenshot or log.
- [ ] **No CSP violations** in browser console - load each page on `xrpl-utilities.com`, open devtools, look for CSP-violation reports; if any, tighten or expand `_headers` accordingly.
- [ ] **Inline scripts** on `/telemetry/index.html` rely on Tailwind CDN + Chart.js CDN - both currently allowed by the open CSP. If/when CSP tightens, allowlist only the specific CDN origins.

## Functioning properly (regression coverage + ongoing validation)

- [ ] After each Pages deploy: `curl -sI https://xrpl-utilities.com/` returns `Cache-Control: public, max-age=300, must-revalidate`.
- [ ] Validate JSON-LD on `/` with [Google's Rich Results Test](https://search.google.com/test/rich-results).
- [ ] Validate `sitemap.xml` at <https://www.xml-sitemaps.com/validate-xml-sitemap.html>.
- [ ] Submit `https://xrpl-utilities.com/sitemap.xml` to Google Search Console.
- [ ] Cross-browser smoke test the mobile header at **375px** on Android Chrome and Firefox (already confirmed on iOS Safari).
- [ ] **Functional walkthroughs:**
  - [ ] Bulk scan: paste 3-5 r-addresses, complete payment, download CSV, open in Excel and confirm leading-`=`/`+`/`-`/`@` cells render as text (not formulas).
  - [ ] Contact form: submit a real test message after Turnstile sitekey is Invisible; confirm the user sees the success state and the message lands in web3forms.
  - [ ] Single scan: walk the full payment flow on mobile, confirm QR renders, document.title updates during scan, no stuck "Scanning..." title.
  - [ ] **Telemetry single snapshot** *(re-verify when Telemetry payments come back online; currently the button is auto-hidden by the `agents.json payments_enabled: false` flag)*: walk the `/telemetry` "Run live snapshot" flow on mobile, confirm QR renders, status polling updates, results render with all four cards (supply, liquidity, AMM, utility floor).
  - [x] ~~Telemetry sample buttons render with `hodl_wave_pct` as 0-100~~ - verified after commit `181b2c4`.
  - [ ] **Telemetry data-freshness banner** appears at top of `/telemetry` on page load *(automatically disappears when backend flips `service_status: "live"`)*.
  - [ ] **Telemetry "Run live snapshot" button is HIDDEN** while `agents.json payments_enabled: false`. Should reappear automatically once the backend re-enables payments.

## Fix suggestions (known issues)

- [x] ~~Mobile menu overcrowded on `/telemetry`~~ - fixed in commit `9818f96` (Sections dropdown on mobile, desktop unchanged).
- [ ] **Sentinel mobile menu still has 6 items** (Home / Try it / How it works / XR-Telemetry / Terms / Contact). Less severe than Telemetry's 7+ but the same `<details>` collapse pattern would clean it up if you want consistency across the portfolio.
- [ ] **Sibling repos** section in `README.md` mentions only `XR-Sentinel`. Add `XR-Telemetry` line.
- [ ] Drop unused `compatibility_flags: ["nodejs_compat"]` from `wrangler.jsonc` (pure static site, no Node runtime).
- [ ] Decide long-term: keep `wrangler.jsonc` (commit to a Workers migration) or delete it (Pages-only). Currently mitigated by `.assetsignore`.
- [ ] If Workers migration: move static files into `public/` and point `assets.directory` at it; reduces blast radius even with `.assetsignore`.

## Health checks

- [ ] **Cloudflare Pages deployment status** - last build green, no failures in the dashboard.
- [ ] **DNS resolution** - `dig +short xrpl-utilities.com` returns Cloudflare IPs; `dig +short www.xrpl-utilities.com` resolves; `dig +short telemetry.xrpl-utilities.io` resolves to Railway (DNS-only, gray cloud).
- [ ] **TLS cert validity** - Cloudflare auto-renews; verify expiry > 30 days via `curl -vI https://xrpl-utilities.com/ 2>&1 | grep -E 'expire|notAfter'`.
- [ ] **Backend health** referenced by the showcase pages - confirm `https://sentinel.xrpl-utilities.io/healthz` and `https://telemetry.xrpl-utilities.io/healthz` are both 200 (the .com pages call those API endpoints from the browser).

## New ideas (future improvements)

- [ ] **Enable Preview deployments** on the Cloudflare Pages project so future feature branches get a `*.pages.dev` preview URL before merging.
- [ ] **Optional: enable Cloudflare Web Analytics** (no script tag needed, CF injects it).
- [ ] **Real free-tier `/demo-scan`** - currently the `/sentinel` page renders pre-canned mock data on sample-button clicks (intentionally; per `README.md`). A free-tier rate-limited endpoint on the Sentinel backend would let real on-chain data drive the showcase. Tracked also in `XR-Sentinel/TODO.md`.
- [ ] **Astro consideration** - if a future tool page needs interactivity beyond vanilla JS, evaluate Astro at that point. Not before - current vanilla + Tailwind CDN + per-page JS scales fine to a half-dozen tool pages.
- [ ] **Per-app brand-mark consolidation** - `/assets/` already has `xr-sentinel.png` and `xr-telemetry.png`. If/when a third XR-* app launches, codify the brand-mark sizing convention in a shared CSS class so each new page picks it up consistently.
