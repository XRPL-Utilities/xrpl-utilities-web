# TODO

Follow-ups for **xrpl-utilities-web** (the `.com` marketing/showcase site).
Items related to the `XR-Sentinel` API service (`.io`) live in that repo's own TODO.

## Verification (do once after each Pages deploy)

- [ ] `curl -sI https://xrpl-utilities.com/` returns `Cache-Control: public, max-age=300, must-revalidate`.
- [ ] Validate JSON-LD on `/` with [Google's Rich Results Test](https://search.google.com/test/rich-results).
- [ ] Validate `sitemap.xml` at <https://www.xml-sitemaps.com/validate-xml-sitemap.html>.
- [ ] Submit `https://xrpl-utilities.com/sitemap.xml` to Google Search Console.
- [ ] Cross-browser smoke test the mobile header at 375px on Android Chrome and Firefox (already confirmed on iOS Safari).

## Functional walkthroughs

- [ ] Bulk scan: paste 3-5 r-addresses, complete payment, download CSV, open in Excel and confirm leading-`=`/`+`/`-`/`@` cells render as text (not formulas).
- [ ] Contact form: submit a real test message after the Turnstile sitekey is set to Invisible (see Cloudflare dashboard list below); confirm the user sees the success state and the message lands in web3forms.
- [ ] Single scan: walk the full payment flow on mobile, confirm QR renders, document.title updates during scan, no stuck "Scanning..." title.

## Code follow-ups

- [ ] Drop unused `compatibility_flags: ["nodejs_compat"]` from `wrangler.jsonc` (pure static site, no Node runtime).
- [ ] Decide long-term: keep `wrangler.jsonc` (commit to a Workers migration) or delete it (Pages-only). Currently mitigated by `.assetsignore`.
- [ ] If Workers migration: move static files into `public/` and point `assets.directory` at it; reduces blast radius even with `.assetsignore`.

## Cloudflare dashboard (account-level, not repo)

- [ ] Set Turnstile sitekey `0x4AAAAAADD5FJFZmiQt3CM3` to **Invisible** mode (HTML side is set; dashboard side is the gate).
- [ ] Enable **Preview deployments** on the Pages project so future feature branches get a `*.pages.dev` preview URL before merging.
- [ ] Verify web3forms access key on the contact form isn't leaked elsewhere (it's a public client key, but rotate if you ever paste it into a screenshot/log).
- [ ] Optional: enable Cloudflare Web Analytics (no script tag needed, CF injects it).
