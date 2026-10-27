// Cache-Control checks for _headers.
//
// 2026-10-26 audit: Cloudflare joins the values when more than one _headers
// rule sets the same header, so /assets/logo.png went out as
// "public, max-age=300, must-revalidate, public, max-age=3600, public,
// max-age=31536000, immutable". Browsers act on that mix differently, and
// "immutable" for a year on a file name that never changes meant a replaced
// image could stay stale in a visitor's cache for a year.
//
// This replays the _headers matching rules and checks each kind of file ends up with exactly one policy.
//
// Run: node tests/cache_headers_test.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const text = fs.readFileSync(path.join(repo, '_headers'), 'utf8');

const rules = [];
let cur = null;
for (const line of text.split('\n')) {
  if (!line.trim() || line.trim().startsWith('#')) continue;
  if (!/^\s/.test(line)) { cur = { pattern: line.trim(), set: [], detach: [] }; rules.push(cur); continue; }
  const t = line.trim();
  if (t.startsWith('! ')) cur.detach.push(t.slice(2).trim().toLowerCase());
  else { const i = t.indexOf(':'); cur.set.push([t.slice(0, i).trim().toLowerCase(), t.slice(i + 1).trim()]); }
}
const toRe = (p) => new RegExp('^' + p.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');

// Rules apply in file order. A matching rule first drops any "! Name"
// headers gathered so far, then adds its own. That is what wrangler dev
// produced for this file on 2026-10-27, and what production showed after
// deploy; it is why the narrower rules sit below the broader ones.
function headerValues(urlPath, name) {
  let out = [];
  for (const r of rules) {
    if (!toRe(r.pattern).test(urlPath)) continue;
    if (r.detach.includes(name)) out = [];
    for (const [n, v] of r.set) if (n === name) out.push(v);
  }
  return out;
}

let fails = 0;
function check(name, cond, extra = '') {
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + extra));
  if (!cond) fails++;
}

const expect = {
  '/': 'public, max-age=300, must-revalidate',
  '/vault/': 'public, max-age=300, must-revalidate',
  '/assets/pages/vault.js': 'public, max-age=300, must-revalidate',
  '/assets/vendor/qrcode-generator.min.js': 'public, max-age=300, must-revalidate',
  '/assets/tailwind.css': 'public, max-age=300, must-revalidate',
  '/assets/logo.png': 'public, max-age=86400',
  '/assets/img/logo-512.webp': 'public, max-age=86400',
  '/assets/apple-touch-icon.png': 'public, max-age=86400',
};
for (const [p, want] of Object.entries(expect)) {
  const got = headerValues(p, 'cache-control');
  check(`${p} has one Cache-Control`, got.length === 1, JSON.stringify(got));
  check(`${p} is "${want}"`, got.join(', ') === want, JSON.stringify(got));
}

// No file on this site has a content hash in its name, so nothing may be
// marked immutable. Revisit this only together with hashed asset names.
check('nothing is marked immutable', !/immutable/i.test(text));

// Every real file under assets/ resolves to exactly one policy.
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
const multi = walk(path.join(repo, 'assets'))
  .map((f) => '/' + path.relative(repo, f).split(path.sep).join('/'))
  .filter((p) => headerValues(p, 'cache-control').length !== 1);
check('every file in assets/ gets exactly one Cache-Control', multi.length === 0, multi.slice(0, 5).join(' '));

// Security headers must still reach assets after the detach lines.
check('assets keep the CSP', headerValues('/assets/logo.png', 'content-security-policy').length === 1);
check('assets keep nosniff', headerValues('/assets/pages/vault.js', 'x-content-type-options').length === 1);

console.log(fails ? `${fails} FAILED` : 'cache headers: ok');
process.exit(fails ? 1 : 0);
