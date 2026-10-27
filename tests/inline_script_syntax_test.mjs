// No executable inline script on any page, and every first-party script parses.
//
// The CSP sets script-src without 'unsafe-inline' and script-src-attr 'none'
// (2026-10-27), so an inline <script> block or an on*= handler would be blocked
// in the browser and the page would go dead with CI green. Page logic lives in
// assets/pages/*.js; this test fails on any inline classic script or handler
// attribute, and compiles every /assets/ script a page loads with vm.Script
// (parse only, nothing runs). JSON-LD data blocks are allowed.
//
// Run: node tests/inline_script_syntax_test.mjs
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKIP = new Set(['node_modules', 'tools']);
const pages = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.') || SKIP.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.html')) pages.push(p);
  }
})(repo);

let fails = 0;
const parsed = new Set();
for (const page of pages) {
  const rel = path.relative(repo, page);
  const html = fs.readFileSync(page, 'utf8');
  const lineOf = (i) => html.slice(0, i).split('\n').length;
  const re = /<script(\s[^>]*)?>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(html))) {
    const attrs = m[1] || '';
    const src = attrs.match(/\ssrc=["']([^"']+)["']/);
    if (src) {
      if (m[2].trim()) { fails++; console.log(`FAIL ${rel}:${lineOf(m.index)}: script with src also has a body`); }
      const url = src[1];
      if (!url.startsWith('/')) continue;
      const file = path.join(repo, url.split('?')[0]);
      if (!fs.existsSync(file)) { fails++; console.log(`FAIL ${rel}:${lineOf(m.index)}: ${url} does not exist`); continue; }
      if (parsed.has(file)) continue;
      parsed.add(file);
      try { new vm.Script(fs.readFileSync(file, 'utf8'), { filename: path.relative(repo, file) }); }
      catch (e) { fails++; console.log(`FAIL ${path.relative(repo, file)}: ${e.message}`); }
      continue;
    }
    if (/type=["']application\/ld\+json["']/.test(attrs)) continue;
    fails++;
    console.log(`FAIL ${rel}:${lineOf(m.index)}: inline <script> is blocked by the CSP; move it to assets/pages/`);
  }
  const handler = /<[a-zA-Z][^>]*\son[a-z]+\s*=/g;
  while ((m = handler.exec(html))) {
    fails++;
    console.log(`FAIL ${rel}:${lineOf(m.index)}: on*= handler attribute is blocked by script-src-attr 'none'`);
  }
}
console.log(`pages: ${pages.length}, first-party scripts parsed: ${parsed.size}`);
if (parsed.size === 0) { console.log('FAIL no first-party scripts found; extractor broken'); process.exit(1); }
process.exit(fails ? 1 : 0);
