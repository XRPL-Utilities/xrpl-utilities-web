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
    if (e.name.startsWith('.') || e.name === 'node_modules') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.html')) pages.push(p);
  }
})(repo);

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
];

let fails = 0;
for (const page of pages) {
  const rel = path.relative(repo, page);
  const html = fs.readFileSync(page, 'utf8');
  if (/Independent project not affiliated/.test(html) && !html.includes(FOOTER)) {
    fails++; console.log(`FAIL ${rel}: footer disclaimer differs from the canonical sentence`);
  }
  html.split('\n').forEach((line, i) => {
    for (const rule of BANNED) {
      if (rule.re.test(line)) { fails++; console.log(`FAIL ${rel}:${i + 1}: ${rule.why}`); }
    }
  });
}
console.log(`content rules: ${pages.length} pages, ${BANNED.length} banned patterns + canonical footer`);
process.exit(fails ? 1 : 0);
