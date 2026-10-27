// CSP and page wiring checks for _headers and every page.
//
// 2026-10-27: the site loaded Tailwind's runtime CDN and every page ran inline
// scripts, so script-src carried 'unsafe-inline' plus a bare jsdelivr origin
// (any package on npm could run here). Styles are now a static build and page
// logic is external. These checks fail if any of that comes back, or if a page
// loads an external script the CSP would block.
//
// Run: node tests/csp_headers_test.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const headers = fs.readFileSync(path.join(repo, '_headers'), 'utf8');
let fails = 0;
const fail = (msg) => { fails++; console.log(`FAIL ${msg}`); };

const cspLine = headers.split('\n').find((l) => /^\s*Content-Security-Policy:/.test(l));
if (!cspLine) { console.log('FAIL _headers has no Content-Security-Policy'); process.exit(1); }
const directives = {};
for (const part of cspLine.replace(/^\s*Content-Security-Policy:\s*/, '').split(';')) {
  const [name, ...values] = part.trim().split(/\s+/);
  if (name) directives[name] = values;
}

for (const d of ['script-src', 'script-src-elem']) {
  const v = directives[d] || [];
  if (!v.length) fail(`${d} missing`);
  if (v.includes("'unsafe-inline'")) fail(`${d} allows 'unsafe-inline'`);
  if (v.includes("'unsafe-eval'")) fail(`${d} allows 'unsafe-eval'`);
  if (v.some((s) => s.includes('cdn.tailwindcss.com'))) fail(`${d} still allows the Tailwind runtime CDN`);
}
if ((directives['script-src-attr'] || []).join(' ') !== "'none'") fail("script-src-attr is not 'none'");
for (const [d, v] of Object.entries(directives)) {
  if (v.some((s) => /^https:\/\/cdn\.jsdelivr\.net\/?$/.test(s))) fail(`${d} allows all of cdn.jsdelivr.net; pin the exact file`);
}
if (!/^\s*Cross-Origin-Opener-Policy:\s*same-origin\s*$/m.test(headers)) fail('Cross-Origin-Opener-Policy: same-origin missing');

const allowed = new Set(directives['script-src-elem'] || directives['script-src'] || []);
// CSP source matching: a bare origin or a path ending in / matches by prefix,
// any other path must match exactly.
const allowedHost = (url) => [...allowed].some((s) => {
  if (!s.startsWith('https://')) return false;
  if (/^https:\/\/[^/]+$/.test(s)) return url === s || url.startsWith(s + '/');
  return s.endsWith('/') ? url.startsWith(s) : url === s;
});

const pages = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.') || e.name === 'node_modules' || e.name === 'tools') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.html')) pages.push(p);
  }
})(repo);

for (const page of pages) {
  const rel = path.relative(repo, page);
  const html = fs.readFileSync(page, 'utf8');
  if (html.includes('cdn.tailwindcss.com')) fail(`${rel} references the Tailwind runtime CDN`);
  if (/class=["'][^"']*\b(bg|text|grid|flex)-/.test(html) && !html.includes('href="/assets/tailwind.css')) fail(`${rel} uses Tailwind classes but does not link /assets/tailwind.css`);
  for (const m of html.matchAll(/<script[^>]*\ssrc=["'](https?:\/\/[^"']+)["']/g)) {
    if (!allowedHost(m[1])) fail(`${rel} loads ${m[1]}, which the CSP blocks`);
  }
}
if (!fs.existsSync(path.join(repo, 'assets/tailwind.css'))) fail('assets/tailwind.css is not built');

console.log(`csp: ${Object.keys(directives).length} directives, ${pages.length} pages checked`);
process.exit(fails ? 1 : 0);
