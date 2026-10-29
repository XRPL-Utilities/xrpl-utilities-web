// Fixes from the second design review, 2026-10-29.
//
// - Pulse and Trust showed "Couldn't load this column (HTTP 402)" and
//   "(HTTP 402)" when the browser check failed, and the Pulse whale list
//   shimmered forever with "Loading... (stale)".
// - Status showed the raw key "ripple_counterparty_discovery", let long
//   text run past the card, named the RPC node and the payment facilitator,
//   and printed "Last checked" in local time while the site uses UTC.
// - The top nav had no Pricing link and called the Start page "Foundation".
//   With nine links the md (768 px) nav squeezed the logo to nothing.
// - Terms promised a refund policy it didn't have, said XR-Vault never
//   shows USD while Vault leads with a dollar total, and used phrases like
//   "dual-infrastructure ecosystem" and "Reputation Oracle".
//
// Run: node tests/review_round2_test.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(repo, p), 'utf8');
let fails = 0;
function check(name, cond, extra = '') { console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + extra)); if (!cond) fails++; }

// ---- error copy -----------------------------------------------------------
const token = read('assets/preview-token.js');
const pulse = read('assets/pages/pulse.js');
const trust = read('assets/pages/trust-2.js');
check('preview-token exposes failureMessage', /failureMessage: failureMessage/.test(token));
if (/failureMessage: failureMessage/.test(token)) {
  const ctx = { window: {}, localStorage: { getItem() { return null; } } };
  new Function('window', 'localStorage', token)(ctx.window, ctx.localStorage);
  const m402 = ctx.window.PreviewToken.failureMessage(402);
  const m500 = ctx.window.PreviewToken.failureMessage(500);
  check('402 message names the browser check, no HTTP code', /browser check/.test(m402) && !/HTTP|402/.test(m402), m402);
  check('other failures get a plain retry message', /Reload the page/.test(m500) && !/HTTP|500/.test(m500), m500);
}
check('Pulse column error shows no HTTP code', !/Couldn't load this column \(\$\{col\.error\}\)/.test(pulse) && /col\.error = failureText/.test(pulse));
check('Pulse hides Show more while a column has an error', /if \(col\.error \|\| col\.shown === 0\)/.test(pulse));
check('Pulse whale list replaces its skeleton on a first-load failure', /listEl\.dataset\.loaded/.test(pulse) && /failureText\(e && e\.status\)/.test(pulse));
check('Trust shows no HTTP code', !/\(HTTP ' \+ r\.status/.test(trust) && /failureText\(r\.status\)/.test(trust));
check('Trust drops "Error." and endpoint names', !/'Error\.'/.test(trust) && !/operators endpoint|rollup endpoint/.test(trust));

// ---- status ---------------------------------------------------------------
const status = read('assets/pages/status.js');
check('Status names counterparty discovery', /ripple_counterparty_discovery:\s*\{ name: "Counterparty discovery"/.test(status));
check('Status never shows a raw snake_case key', /function labelFor/.test(status) && !/\{ name: key, desc: "" \}/.test(status));
check('Status does not name the RPC node or facilitator', !/XRPL RPC node|x402 Facilitator|SQLite/.test(status));
check("Status right column wraps without splitting words", /"text-right shrink-0"/.test(status) && /right.style.maxWidth = "50%"/.test(status));
check('Status time is UTC', !/toLocaleTimeString/.test(status));

// ---- nav --------------------------------------------------------------------
const pages = [];
(function walk(dir) {
  for (const e of fs.readdirSync(path.join(repo, dir), { withFileTypes: true })) {
    if (['tools', 'node_modules', '.git', 'tests'].includes(e.name)) continue;
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) walk(rel); else if (e.name.endsWith('.html')) pages.push(rel);
  }
})('');
for (const p of pages) {
  const html = read(p);
  if (!html.includes('id="nav-open"')) continue;
  check(`${p}: nav says Start here, not Foundation`, !html.includes('>Foundation</a>') && !html.includes('>XR-Foundation</a>') && (html.match(/>Start here<\/a>/g) || []).length >= 3);
  check(`${p}: desktop and mobile nav link Pricing`, (html.match(/href="\/pricing\/"\s+class="[^"]*">Pricing<\/a>/g) || []).length >= 2);
  check(`${p}: desktop nav starts at lg`, html.includes('<nav class="hidden lg:flex items-center gap-x-6 xl:gap-x-8 nav-link whitespace-nowrap">') && html.includes('id="nav-open" class="lg:hidden '));
}
for (const f of fs.readdirSync(path.join(repo, 'assets/pages'))) {
  const src = read('assets/pages/' + f);
  if (/nav-open|mobileNav/.test(src)) check(`${f}: menu closes at the lg breakpoint`, !/innerWidth >= 768\)? *(close|&&)/.test(src));
}
const css = read('assets/tailwind.css');
check('tailwind.css has lg:flex and lg:hidden', css.includes('.lg\\:flex{') && css.includes('.lg\\:hidden{'));

// ---- terms ------------------------------------------------------------------
const terms = read('terms/index.html');
check('Terms has a refunds paragraph', /<strong class="text-white">Refunds\.<\/strong>/.test(terms) && /Fees, Payments &amp; Refunds/.test(terms));
check('Terms lists the fees', terms.includes('Most paid calls cost $0.10') && terms.includes('$7.50 for 24 hours'));
check('Terms matches Vault dollar totals', !terms.includes('native unit-of-account only') && terms.includes('Dollar totals on the dashboard are estimates') && terms.includes('tokens in other currencies at recent exchange rates') && !terms.includes('dollar-denominated tokens only'));
for (const phrase of ['dual-infrastructure', 'Reputation Oracle', 'Reputation Signal', 'execution layer', 'US-listed', 'AllowTrustLineClawback', 'operator-curated', 'verify-then-work-then-settle']) {
  check(`Terms has no "${phrase}"`, !terms.includes(phrase));
}

// ---- consistency pass ------------------------------------------------------
// No reduced-motion rule anywhere (8 animations kept running on the home
// page); Vault and Lineage jumped by 0.10 and 0.16 CLS on phones when data
// loaded; Sentinel, Trust and Telemetry used narrower hero containers, so
// the logo sat at a different x on each product page.
const input = read('tools/tailwind/input.css');
check('reduced-motion rule in the Tailwind source', /prefers-reduced-motion: reduce[\s\S]*animation-duration/.test(input));
check('reduced-motion rule in the built CSS', /prefers-reduced-motion:reduce\)\{\*,:after,:before\{animation-duration/.test(css));
check('charts skip animation under reduced motion', /prefers-reduced-motion: reduce[\s\S]*Chart\.defaults\.animation = false/.test(read('assets/chart-palette.js')) && /Chart\.defaults\.animation = false/.test(read('assets/pages/telemetry.js')));
check('Lineage as-of keeps its own line on phones', read('lineage/index.html').includes('id="rlusd-asof" class="text-[10px] text-muted font-mono w-full sm:w-auto"'));
check('Vault summary reserves its loaded height on phones', /id="stat-usd-pegged-detail" class="[^"]*min-h-\[2\.6em\]/.test(read('vault/index.html')) && read('vault/index.html').includes('min-h-[7.75rem] sm:min-h-0'));
check('built CSS has the reserved-height classes', css.includes('min-h-\\[7\\.75rem\\]') && css.includes('sm\\:w-auto'));
for (const slug of ['sentinel', 'telemetry', 'pulse', 'trust', 'vault', 'flows', 'lineage']) {
  check(`${slug}: hero uses the 6xl container`, read(slug + '/index.html').includes('<div class="max-w-6xl mx-auto px-4 sm:px-6 pt-10 pb-8">'));
}
for (const slug of ['trust', 'telemetry']) {
  check(`${slug}: no 4xl or 5xl sections left`, !/max-w-(4|5)xl mx-auto px-/.test(read(slug + '/index.html')));
}

// Polish 2026-10-29: Status was six large banners, 4,700 px tall, and left out
// XR-Ledger. Now one row per service, folded while operational.
const statusHtml = read('status/index.html');
check('Status lists XR-Ledger', /\["ledger",\s+"XR-Ledger"\]/.test(status) && statusHtml.includes('XR-Ledger'));
check('Status rows fold while operational', /det\.open = status !== "active"/.test(status));
check('Status has no per-service banner blocks', !/id="overall-sentinel"/.test(statusHtml));

check('one price noun: per call', ['sentinel','telemetry','pulse','trust'].every(p => !/\$0\.10 per (scan|snapshot|query)/.test(read(p + '/index.html'))));
check('Tip copy has no internal accounting note', !read('tip/index.html').includes('operator accounting'));
// #54 added XR-Ledger to Status but the CSP blocked the fetch, so it read
// "Unknown" live. Every host Status checks must be in connect-src.
const csp = (read('_headers').match(/connect-src[^;]*/) || [''])[0];
const hosts = [...status.matchAll(/\["([a-z]+)",\s+"XR-/g)].map(m => `https://${m[1]}.xrpl-utilities.io`);
check('Status checks 7 services', hosts.length === 7);
check('CSP allows every host Status checks', hosts.every(h => csp.split(/\s+/).includes(h)));
// Footer polish: headings skipped from h2 to h4, "Tip the maker" was the
// only coloured link, the trademark line carried seven tiny marks, and the
// columns stacked into 900 px on a phone.
for (const p of ['index.html', 'status/index.html', 'flows/index.html', 'trust/index.html']) {
  const ft = read(p).split('<footer')[1] || '';
  check(`${p}: footer headings are h2`, !/<h4/.test(ft) && /<h2[^>]*>Products<\/h2>/.test(ft));
  check(`${p}: Tip link styled like the others`, /href="\/tip\/"\s+class="text-muted/.test(ft));
  check(`${p}: trademark line has no marks`, !/<sup[^>]*>&trade;<\/sup>[^<]*(?:<sup[^>]*>&trade;<\/sup>[^<]*)*are trademarks/.test(ft) && /grid-cols-2 gap-x-6/.test(ft));
}
// Code blocks scroll sideways, so each scroll box takes keyboard focus.
for (const p of ['index.html', 'pricing/index.html', 'pulse/index.html', 'trust/index.html', 'telemetry/index.html']) {
  const html = read(p);
  const boxes = [...html.matchAll(/<(?:div|pre)\b[^>]*overflow-x-auto[^>]*>(?=\s*(?:<div[^>]*>[^<]*<\/div>\s*)?<pre|[^<]*)/g)].filter(m => /<pre/.test(html.slice(m.index, m.index + 400)));
  check(`${p}: code scroll boxes are focusable`, boxes.length > 0 && boxes.every(m => /tabindex="0"/.test(m[0])));
}
console.log(fails ? `${fails} FAILED` : 'review round 2: ok');
process.exit(fails ? 1 : 0);
