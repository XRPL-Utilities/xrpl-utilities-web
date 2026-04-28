# TODO — xrpl-utilities-web

Standing operator checklist for the `.com` marketing/showcase site.
Backend follow-ups for `XR-Sentinel` and `XR-Telemetry` live in their own
repos' `TODO.md` files. Update items as they're done; strikethrough for
~1 month before pruning so changes stay traceable.

Sibling tracking files: `XR-Sentinel/TODO.md`, `XR-Telemetry/TODO.md`.

---

## Security

- [ ] **`_headers` Cloudflare config applied** — verify Cloudflare actually serves the CSP-lite, no-frame, no-referrer headers from `_headers`. Check via `curl -sI https://xrpl-utilities.com/ | grep -iE 'frame|content-type-options|referrer|strict-transport'`.
- [ ] **Turnstile sitekey is Invisible mode** in the Cloudflare dashboard (HTML side is configured; dashboard side is the gate). Sitekey: `0x4AAAAAADD5FJFZmiQt3CM3`.
- [ ] **web3forms access key** on the contact form is a public client key but rotate if it's ever leaked into a screenshot or log.
- [ ] **No CSP violations** in browser console — load each page on `xrpl-utilities.com`, open devtools, look for CSP-violation reports; if any, tighten or expand `_headers` accordingly.
- [ ] **Inline scripts** on `/telemetry/index.html` rely on Tailwind CDN + Chart.js CDN — both currently allowed by the open CSP. If/when CSP tightens, allowlist only the specific CDN origins.

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
  - [ ] **Telemetry single snapshot:** walk the `/telemetry` "Run live snapshot" flow on mobile, confirm QR renders, status polling updates, results render with all four cards (supply, liquidity, AMM, utility floor).
  - [ ] **Telemetry sample buttons** on `/telemetry` render the four cached samples without errors and the `hodl_wave_pct` shows as a 0-100 percentage (not 0-1) since the renderer fix in commit `181b2c4`.

## Fix suggestions (known issues)

- [ ] **Mobile menu is overcrowded on `/telemetry`.** Header has 8 nav items (Home, Samples, Burst Math, Floor Matrix, Try it, How it works, XR-Sentinel, Terms). At narrow widths the wrap-and-stack falls apart. **Priority for next session.** Likely fix: collapse the cross-section anchors (Samples / Burst Math / Floor Matrix / Try it / How it works) into a hamburger or "On this page" dropdown on mobile, keep only top-level (Home / XR-Sentinel / Terms) as always-visible.
- [ ] **Sibling repos** section in `README.md` mentions only `XR-Sentinel`. Add `XR-Telemetry` line.
- [ ] Drop unused `compatibility_flags: ["nodejs_compat"]` from `wrangler.jsonc` (pure static site, no Node runtime).
- [ ] Decide long-term: keep `wrangler.jsonc` (commit to a Workers migration) or delete it (Pages-only). Currently mitigated by `.assetsignore`.
- [ ] If Workers migration: move static files into `public/` and point `assets.directory` at it; reduces blast radius even with `.assetsignore`.

## Health checks

- [ ] **Cloudflare Pages deployment status** — last build green, no failures in the dashboard.
- [ ] **DNS resolution** — `dig +short xrpl-utilities.com` returns Cloudflare IPs; `dig +short www.xrpl-utilities.com` resolves; `dig +short telemetry.xrpl-utilities.io` resolves to Railway (DNS-only, gray cloud).
- [ ] **TLS cert validity** — Cloudflare auto-renews; verify expiry > 30 days via `curl -vI https://xrpl-utilities.com/ 2>&1 | grep -E 'expire|notAfter'`.
- [ ] **Backend health** referenced by the showcase pages — confirm `https://sentinel.xrpl-utilities.io/healthz` and `https://telemetry.xrpl-utilities.io/healthz` are both 200 (the .com pages call those API endpoints from the browser).

## New ideas (future improvements)

- [ ] **Enable Preview deployments** on the Cloudflare Pages project so future feature branches get a `*.pages.dev` preview URL before merging.
- [ ] **Optional: enable Cloudflare Web Analytics** (no script tag needed, CF injects it).
- [ ] **Real free-tier `/demo-scan`** — currently the `/sentinel` page renders pre-canned mock data on sample-button clicks (intentionally; per `README.md`). A free-tier rate-limited endpoint on the Sentinel backend would let real on-chain data drive the showcase. Tracked also in `XR-Sentinel/TODO.md`.
- [ ] **Astro consideration** — if a future tool page needs interactivity beyond vanilla JS, evaluate Astro at that point. Not before — current vanilla + Tailwind CDN + per-page JS scales fine to a half-dozen tool pages.
- [ ] **Per-app brand-mark consolidation** — `/assets/` already has `xr-sentinel.png` and `xr-telemetry.png`. If/when a third XR-* app launches, codify the brand-mark sizing convention in a shared CSS class so each new page picks it up consistently.
