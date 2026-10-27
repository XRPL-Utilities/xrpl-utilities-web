// Guard for the 2026-10-26 audit finding "unescaped server-curated values"
// on the lineage, flows, vault and trust pages.
//
// Those pages build markup by string and hand it to innerHTML. Every value
// that comes back from an API (labels, currency codes, counts, asset classes,
// timestamps) is treated as hostile, because several of them trace back to
// on-chain data or to a TOML file that anyone can publish. This test reads
// each page script and fails on any interpolation into an HTML string that
// is not one of:
//   - wrapped in escapeHtml(...) or esc(...)
//   - a ternary that picks between two literals (plural "s", fixed classes)
//   - an expression listed in SAFE below, each one a fragment or constant
//     that the page builds itself from fixed strings or already escapes.
// It covers both template literals (`...${x}...`) and the older
// '...' + x + '...' concatenation style used on /trust/.
//
// It also checks that each page's escapeHtml keeps a 0, since counts now go
// through it and `String(s || '')` would print nothing for zero.
//
// Run: node tests/html_escape_lint_test.mjs

import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const SAFE = {
  'assets/pages/lineage.js': new Set([
    'escrowWallets.length',   // local array length
    'linksHtml',              // built from escaped addresses
    'hopFlow',                // built from escaped amounts
    'curClass',               // one of three fixed class strings
  ]),
  'assets/pages/flows.js': new Set([
    'chips',                  // built from escaped futures names
    'cls',                    // fixed class from a comparison
    'href', 'ticker', 'issuer', 'launched', // escaped just above their use
    'tier',                   // one of two fixed badge strings
  ]),
  'assets/pages/vault.js': new Set([
    'pctText',                // built from an escaped percentage
    "chips.join('')",         // built from escaped chip strings
    'deltaClass(net)',        // returns one of three fixed classes
    'xrpscan',                // fixed prefix + encodeURIComponent
    'fcBadge', 'mptBadge',    // fixed badges with escaped titles
    'caveat',                 // escaped just above its use
    'renderIssuerActivityChips(i)', // escapes its own values
    'color', 'totalColor',    // looked up in _HEALTH_COLORS
    'flagsHtml',              // built from escaped flag names
    'domain',                 // escaped link or a fixed placeholder
  ]),
  'assets/pages/trust-2.js': new Set([
    'xrpscan',                // fixed prefix + encodeURIComponent
    'jurBadge',               // escaped just above its use
    'meta.c',                 // colour from the fixed CAT map or a constant
    'badge',                  // built from an escaped count
    'fmtAmountShort(top.gets_value, top.gets_currency)', // escapes internally
    'fmtAmountShort(top.pays_value, top.pays_currency)',
  ]),
};

// Walk a source file and return every template literal with its ${...}
// expressions. Comments and quoted strings are skipped; nested templates
// inside an expression are returned on their own.
function templates(src) {
  const out = [];
  let i = 0;
  const n = src.length;
  const lineAt = (pos) => src.slice(0, pos).split('\n').length;
  function skipQuoted(q) {
    i++;
    while (i < n && src[i] !== q) { if (src[i] === '\\') i++; i++; }
    i++;
  }
  function readTemplate() {
    i++;
    let text = '';
    const exprs = [];
    while (i < n && src[i] !== '`') {
      if (src[i] === '\\') { text += src.slice(i, i + 2); i += 2; continue; }
      if (src[i] === '$' && src[i + 1] === '{') {
        i += 2;
        const start = i;
        let depth = 1;
        while (i < n) {
          const c = src[i];
          if (c === '`') { readTemplate(); continue; }
          if (c === '"' || c === "'") { skipQuoted(c); continue; }
          if (c === '{') depth++;
          else if (c === '}' && --depth === 0) break;
          i++;
        }
        exprs.push({ expr: src.slice(start, i).trim(), line: lineAt(start) });
        i++;
        continue;
      }
      text += src[i];
      i++;
    }
    i++;
    out.push({ text, exprs });
  }
  while (i < n) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') { i = src.indexOf('*/', i + 2) + 2; continue; }
    if (c === '"' || c === "'") { skipQuoted(c); continue; }
    if (c === '`') { readTemplate(); continue; }
    i++;
  }
  return out;
}

// True when the whole expression is one call to fn(...).
function wholeCall(expr, fn) {
  if (!expr.startsWith(fn + '(') || !expr.endsWith(')')) return false;
  let depth = 0;
  for (let k = fn.length; k < expr.length; k++) {
    if (expr[k] === '(') depth++;
    else if (expr[k] === ')' && --depth === 0) return k === expr.length - 1;
  }
  return false;
}

const LIT = String.raw`(?:'[^']*'|"[^"]*"|\x60[^\x60]*\x60)`;
const LITERAL_TERNARY = new RegExp(String.raw`^[^?]+\?\s*${LIT}\s*:\s*${LIT}$`);

function allowed(file, expr) {
  if (wholeCall(expr, 'escapeHtml') || wholeCall(expr, 'esc')) return true;
  if (LITERAL_TERNARY.test(expr)) return true;
  return SAFE[file].has(expr);
}

let fails = 0;
function check(name, cond, extra = '') {
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + extra));
  if (!cond) fails++;
}

for (const file of Object.keys(SAFE)) {
  const src = fs.readFileSync(path.join(repo, file), 'utf8');
  const bad = [];
  for (const t of templates(src)) {
    if (!/<[a-z\/]|="/i.test(t.text)) continue; // not an HTML string
    for (const e of t.exprs) if (!allowed(file, e.expr)) bad.push(`${file}:${e.line}  \${${e.expr}}`);
  }
  // '...<tag>' + expr + '...' on one line.
  src.split('\n').forEach((line, idx) => {
    if (!line.includes('<') || /^\s*\/\//.test(line)) return;
    const re = /'\s*\+\s*([^'+\n][^'\n]*?)\s*\+\s*'/g;
    let m;
    while ((m = re.exec(line))) {
      const expr = m[1].trim();
      if (!allowed(file, expr)) bad.push(`${file}:${idx + 1}  ' + ${expr} + '`);
    }
  });
  check(`${file}: every value in an HTML string is escaped`, bad.length === 0, '\n  ' + bad.join('\n  '));

  // The page's own escapeHtml must keep falsy-but-real values.
  const fnSrc = src.match(/^function escapeHtml\(s\) \{[\s\S]*?^\}/m);
  check(`${file}: has a top-level escapeHtml`, !!fnSrc);
  if (fnSrc) {
    const ctx = {};
    vm.createContext(ctx);
    vm.runInContext(fnSrc[0], ctx);
    check(`${file}: escapeHtml(0) is "0"`, ctx.escapeHtml(0) === '0', JSON.stringify(ctx.escapeHtml(0)));
    check(`${file}: escapeHtml escapes quotes and tags`,
      ctx.escapeHtml(`"><img src=x onerror='1'>`) === '&quot;&gt;&lt;img src=x onerror=&#39;1&#39;&gt;');
  }
}

console.log(fails ? `${fails} FAILED` : 'html escape lint: ok');
process.exit(fails ? 1 : 0);
