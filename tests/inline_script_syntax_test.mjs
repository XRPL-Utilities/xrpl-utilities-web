// Every inline <script> on every page must parse.
//
// Most page logic lives in inline scripts that no other test loads, so a copy
// edit that breaks a quote inside a JS string would ship a dead page with CI
// green. This compiles each inline classic script with vm.Script (parse only,
// nothing runs). JSON-LD and src= scripts are skipped.
//
// Run: node tests/inline_script_syntax_test.mjs
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
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

let fails = 0, checked = 0;
for (const page of pages) {
  const html = fs.readFileSync(page, 'utf8');
  const re = /<script(\s[^>]*)?>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(html))) {
    const attrs = m[1] || '';
    if (/\ssrc=/.test(attrs) || /type=["'](application\/ld\+json|application\/json|text\/template)/.test(attrs)) continue;
    const isModule = /type=["']module["']/.test(attrs);
    const line = html.slice(0, m.index).split('\n').length;
    checked++;
    try {
      if (isModule) new vm.SourceTextModule ? new vm.SourceTextModule(m[2]) : new vm.Script(m[2]);
      else new vm.Script(m[2], { filename: `${path.relative(repo, page)}:${line}` });
    } catch (e) {
      fails++;
      console.log(`FAIL ${path.relative(repo, page)}:${line}: ${e.message}`);
    }
  }
}
console.log(`inline scripts parsed: ${checked}`);
if (checked === 0) { console.log('FAIL no inline scripts found; extractor broken'); process.exit(1); }
process.exit(fails ? 1 : 0);
