// Content rules for every public page. Each rule records the incident that
// created it, so a later edit that brings the mistake back fails CI with the
// reason attached instead of shipping quietly.
//
// Run: node tests/content_rules_test.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pages = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.') || e.name === 'node_modules' || e.name === 'tools') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.html')) pages.push(p);
  }
})(repo);
// Page copy that JS renders lives in assets/ since the scripts moved out of the
// HTML (2026-10-27), so the banned patterns cover those files too.
const scripts = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.js')) scripts.push(p);
  }
})(path.join(repo, 'assets'));

// One disclaimer, everywhere. 2026-10-26: footers had drifted into five
// variants, two of which said "deterministic data only" while XR-Sentinel
// sells AI-generated narratives.
const FOOTER = 'Independent project not affiliated with Ripple Labs. On-chain data and heuristic analytics; '
  + 'XR-Sentinel&trade; narratives are AI-generated. Not investment, legal or compliance advice.';

const BANNED = [
  { re: /\bFounder\s+[A-Z][a-z]+\s+[A-Z]/, why: 'names a private individual (2026-10-26: "Founder Evan Wyn Evans" on /sentinel/)' },
  { re: /Deterministic heuristic data only/i, why: 'false: Sentinel narratives are AI-generated (terms + footer fix 2026-10-26)' },
  { re: /Verified identity/i, why: 'self-published TOML/DID is not verified by us (Trust badge fix 2026-10-26)' },
  { re: /label: 'INSTITUTIONAL'/, why: 'tier badge must say SELF-DECLARED ORG, not vouch for the wallet' },
  { re: /\btwo (payment )?options\b/i, why: 'every 402 offers three rails: RLUSD, USDC on Base, XRP' },
  { re: /one of six tools|Six on-chain services/i, why: 'seven tools: six agent-payable APIs plus the free Lineage view' },
  { re: /rwA8orrV[^\n]*(squat|impersonat)|(squat|impersonat)[^\n]*rwA8orrV/i, why: 'rwA8orrV is Franklin Templeton\'s genuine sgBENJI issuer (reversed 2026-10-26)' },
  { re: /payment_requirements_selector\s*=\s*(<[^>]+>)?["']/, why: 'x402-xrpl calls the selector as a function; a string silently returns the unpaid 402' },
  // Methodology stays off public pages and served JS, comments included
  // (2026-10-27 audit). Linking to an explorer is fine; naming it as our
  // data source, or naming nodes, RPC methods, vendors or cadences, is not.
  { re: /XRPS(can|CAN)('s)?[ -](well-known|labels?|advisory|per-account|holder|verified|attested|labeled|resolution|names)|(via|from) XRPS(can|CAN)\b/, why: 'names the third-party label source (methodology leak)' },
  { re: /\b(gateway_balances|account_tx|account_lines|account_info|account_objects|book_offers)\b/, why: 'names an XRPL RPC method (methodology leak)' },
  { re: /\bs[12]\.ripple\.com|xrplcluster|QuickNode|CoinGecko/, why: 'names a node or data vendor (methodology leak)' },
  { re: /\bis the moat\b|\(moat\)/i, why: 'the curated wallet list is not something to advertise (methodology leak)' },
  { re: /\bevery \d+ ?(s|sec|secs|seconds|min|mins|minutes)\b/i, why: 'names a polling cadence (methodology leak)' },
  { re: /twenty million dollars total movement|three or more hops, twenty/, why: 'names an internal detection threshold (methodology leak)' },
];

let fails = 0;
for (const page of [...pages, ...scripts]) {
  const rel = path.relative(repo, page);
  const html = fs.readFileSync(page, 'utf8');
  if (page.endsWith('.html') && /Independent project not affiliated/.test(html) && !html.includes(FOOTER)) {
    fails++; console.log(`FAIL ${rel}: footer disclaimer differs from the canonical sentence`);
  }
  html.split('\n').forEach((line, i) => {
    for (const rule of BANNED) {
      if (rule.re.test(line)) { fails++; console.log(`FAIL ${rel}:${i + 1}: ${rule.why}`); }
    }
  });
}
// ---- consistency rules (2026-10-27 audit, item 9) ---------------------------
const ownScripts = scripts.filter((f) => !f.includes(`${path.sep}vendor${path.sep}`));
const extra = ['llms.txt', '.well-known/security.txt'].map((f) => path.join(repo, f));
function fail(msg) { fails++; console.log('FAIL ' + msg); }

// No em dashes in anything served, comments included (house style).
for (const f of [...pages, ...ownScripts, ...extra]) {
  fs.readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
    if (/—|&mdash;|&#8212;/.test(line)) fail(`${path.relative(repo, f)}:${i + 1}: em dash`);
  });
}

// One contact address. The contact page said hello@ while security.txt
// said a proton.me address.
const CONTACT = 'hello@xrpl-utilities.com';
for (const f of [...pages, ...ownScripts, ...extra]) {
  for (const m of fs.readFileSync(f, 'utf8').matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g)) {
    if (m[0] !== CONTACT) fail(`${path.relative(repo, f)}: email ${m[0]} (use ${CONTACT})`);
  }
}

// Same nav on every page: the 404, bulk, status, terms and tip pages had
// lost Foundation and Lineage.
const navLinks = (html, re) => { const m = html.match(re); return m ? [...m[0].matchAll(/href="([^"]+)"/g)].map((x) => x[1]).join(' ') : ''; };
const DESK = /<nav class="hidden md:flex[\s\S]*?<\/nav>/;
const MOB = /<nav class="flex-1 flex flex-col[\s\S]*?<\/nav>/;
const NAV = '/start/ /sentinel/ /telemetry/ /pulse/ /trust/ /vault/ /flows/ /lineage/';
for (const f of pages) {
  const html = fs.readFileSync(f, 'utf8');
  if (navLinks(html, DESK) !== NAV) fail(`${path.relative(repo, f)}: desktop nav differs from the standard links`);
  if (navLinks(html, MOB) !== NAV) fail(`${path.relative(repo, f)}: mobile nav differs from the standard links`);
  const tm = html.match(/<div>[^\n]*are trademarks of XRPL-Utilities LLC\.<\/div>/);
  if (!tm || !tm[0].includes('XR-Lineage')) fail(`${path.relative(repo, f)}: footer trademark line omits XR-Lineage`);
}
const terms = fs.readFileSync(path.join(repo, 'terms/index.html'), 'utf8');
if ((terms.match(/XR-Lineage/g) || []).length < 3) fail('terms: XR-Lineage missing from the scope or trademark lists');

// Pulse handed permissioned-domain activity to Trust on 2026-09-06; its
// page kept advertising it as part of the feed.
const pulse = fs.readFileSync(path.join(repo, 'pulse/index.html'), 'utf8');
if (/permissioned_domain_lifecycle|permissioned-domain<\/span> events|Permissioned-domain lifecycle events/.test(pulse)) {
  fail('pulse: describes permissioned-domain events as part of the Pulse feed (moved to Trust 2026-09-06)');
}

// The settlement shown on /start/ was paid by our own reference agent.
const start = fs.readFileSync(path.join(repo, 'start/index.html'), 'utf8');
if (!start.includes('our reference agent')) fail('start: the live-proof settlement must say it was our reference agent');

console.log(`content rules: ${pages.length} pages + ${scripts.length} scripts, ${BANNED.length} banned patterns + canonical footer`);
process.exit(fails ? 1 : 0);
