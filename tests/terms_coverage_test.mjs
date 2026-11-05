// Terms coverage, from the 2026-11-04 readiness check:
// - XR-Ledger and the MCP server were not named in the terms, and the
//   machine-readable /tos list had no XR-Ledger entry.
// - Owner names on the whale page had no note saying they are attributions
//   that can be wrong, and no way to report a mistake.
//
// Run: node tests/terms_coverage_test.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const terms = fs.readFileSync(path.join(repo, 'terms/index.html'), 'utf8');
const whales = fs.readFileSync(path.join(repo, 'whales/index.html'), 'utf8');
const text = (h) => h.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ');
let fails = 0;
function check(name, cond) { console.log((cond ? 'PASS ' : 'FAIL ') + name); if (!cond) fails++; }

const scope = text(terms.slice(terms.indexOf('1. Scope of Service'), terms.indexOf('2. Nature of Data')));
check('scope names XR-Ledger', scope.includes('XR-Ledger'));
check('scope names the MCP server', /MCP server/.test(scope));
check('terms link the XR-Ledger /tos', terms.includes('https://ledger.xrpl-utilities.io/tos'));
check('terms cover account statements', /not tax, accounting or audit documents/.test(text(terms)));
check('terms say owner names can be wrong', /Owner names and labels\. .*can be wrong/.test(text(terms)));
check('whale page says owner names can be wrong', /Owner names are our attribution .*can be wrong/.test(text(whales)));
check('whale page links a way to report a mistake', /href="\/contact\/"[^>]*>Tell us</.test(whales));
check('no em dashes added', !terms.includes('—') && !whales.includes('—'));

// 2026-11-05: Aaron chose to publish a privacy policy and the standard
// clauses (warranty disclaimer, liability cap, indemnity, arbitration body,
// class waiver, agent acceptance, sanctions, changes).
const privacyPath = path.join(repo, 'privacy/index.html');
check('privacy page exists', fs.existsSync(privacyPath));
const privacy = fs.existsSync(privacyPath) ? fs.readFileSync(privacyPath, 'utf8') : '';
const pt = text(privacy);
for (const [name, re] of [
  ['privacy names Turnstile', /Cloudflare Turnstile/],
  ['privacy names Sentry', /Sentry/],
  ['privacy names the contact form provider', /Web3Forms/],
  ['privacy covers payment records', /paying wallet address/],
  ['privacy says no selling of data', /do not sell personal information/],
]) check(name, re.test(pt));
check('privacy canonical', privacy.includes('<link rel="canonical" href="https://xrpl-utilities.com/privacy/"'));
check('no em dashes on privacy page', !privacy.includes('\u2014'));
const tt = text(terms);
for (const [name, re] of [
  ['terms: as is disclaimer', /provided "as is" and "as available"/],
  ['terms: liability cap', /greater of \(a\) the amount you paid Us in the 12 months/],
  ['terms: indemnity', /defend and indemnify/],
  ['terms: arbitration body', /American Arbitration Association/],
  ['terms: class waiver', /class or representative action/],
  ['terms: agent acceptance', /paying a 402 payment request means you/],
  ['terms: sanctions', /U\.S\. sanctions list/],
  ['terms link the privacy policy', /Privacy Policy/],
]) check(name, re.test(tt));
for (const f of fs.readdirSync(repo, { recursive: true })) {
  if (!String(f).endsWith('index.html') && String(f) !== '404.html') continue;
  if (String(f).includes('node_modules') || String(f).startsWith('tests')) continue;
  const h = fs.readFileSync(path.join(repo, String(f)), 'utf8');
  if (h.includes('href="/terms/"   class="text-muted hover:text-white transition">Terms</a>')) {
    check(`footer links Privacy: ${f}`, h.includes('href="/privacy/" class="text-muted hover:text-white transition">Privacy</a>'));
  }
}
check('sitemap lists /privacy/', fs.readFileSync(path.join(repo, 'sitemap.xml'), 'utf8').includes('https://xrpl-utilities.com/privacy/'));

if (fails) { console.error(`${fails} check(s) failed`); process.exit(1); }
