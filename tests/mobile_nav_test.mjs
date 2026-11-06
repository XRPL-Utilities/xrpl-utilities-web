// Mobile menu guard (added 2026-11-06).
//
// /build/ and /verify/ shipped with a menu button that did nothing: the
// open/close code lives in each page's own script, and those two pages'
// scripts never had it. a11y.js only moves focus, it does not open the menu.
// This fails when any page with #mobile-nav loads no code that opens it, and
// checks that the shared assets/mobile-nav.js really opens and closes it.
//
// Run: node tests/mobile_nav_test.mjs
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(repo, f), 'utf8');
let fails = 0;
const check = (name, cond) => { console.log((cond ? 'PASS ' : 'FAIL ') + name); if (!cond) fails++; };

function pages(dir = repo, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.') || e.name === 'node_modules' || e.name === 'tools' || e.name === 'tests') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) pages(p, out);
    else if (e.name.endsWith('.html')) out.push(path.relative(repo, p));
  }
  return out;
}

const OPENS = /getElementById\('nav-open'\)[\s\S]*?style\.display\s*=\s*'flex'/;
let withMenu = 0;
for (const page of pages()) {
  const html = read(page);
  if (!html.includes('id="mobile-nav"')) continue;
  withMenu++;
  const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n');
  const local = [...html.matchAll(/<script[^>]*\bsrc="\/([^"?]+\.js)/g)].map((m) => m[1])
    .filter((s) => fs.existsSync(path.join(repo, s))).map(read).join('\n');
  check(`${page}: a loaded script opens the mobile menu`, OPENS.test(inline + '\n' + local));
}
check('found pages with a mobile menu', withMenu > 10);

// Behaviour of the shared script in a small fake DOM.
function el() {
  const handlers = {};
  return {
    style: { display: 'none' }, attrs: {}, handlers,
    setAttribute(k, v) { this.attrs[k] = v; },
    addEventListener(t, f) { (handlers[t] ||= []).push(f); },
    querySelectorAll() { return [link]; },
  };
}
const link = el();
const openBtn = el(), closeBtn = el(), overlay = el();
const ids = { 'nav-open': openBtn, 'nav-close': closeBtn, 'mobile-nav': overlay };
const docHandlers = {};
const ctx = {
  document: {
    getElementById: (id) => ids[id] || null,
    body: { style: {} },
    addEventListener: (t, f) => { (docHandlers[t] ||= []).push(f); },
  },
  window: { innerWidth: 390, addEventListener() {} },
};
vm.runInNewContext(read('assets/mobile-nav.js'), ctx);
openBtn.handlers.click[0]();
check('menu button opens the overlay', overlay.style.display === 'flex' && openBtn.attrs['aria-expanded'] === 'true');
closeBtn.handlers.click[0]();
check('close button hides it', overlay.style.display === 'none' && openBtn.attrs['aria-expanded'] === 'false');
openBtn.handlers.click[0]();
docHandlers.keydown[0]({ key: 'Escape' });
check('Escape hides it', overlay.style.display === 'none');
openBtn.handlers.click[0]();
link.handlers.click[0]();
check('a menu link hides it', overlay.style.display === 'none');

if (fails) { console.error(`${fails} mobile nav check(s) failed`); process.exit(1); }
