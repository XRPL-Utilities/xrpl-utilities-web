// Accessibility basics on every page (P1 audit, 2026-10-27).
//
// The audit found no <main> or skip link on 14 pages, a mobile menu that
// left keyboard focus behind the overlay, data text at 40-70% opacity, charts
// with no text alternative, no aria-live on results, unlabeled inputs, and a
// Sentinel address box that iOS capitalized into a failing "R...". Each check
// below fails if one of those comes back.
//
// Run: node tests/a11y_test.mjs
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(repo, f), 'utf8');
let fails = 0;
function check(name, cond, extra = '') {
  if (!cond) { fails++; console.log('FAIL ' + name + (extra ? '  ' + extra : '')); }
}

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
  const body = html.indexOf('<body');
  const firstLink = html.indexOf('<a ', body);
  check(`${rel}: has exactly one <main id="main">`, (html.match(/<main\b/g) || []).length === 1 && /<main id="main"/.test(html));
  check(`${rel}: first link in the body is the skip link`, html.slice(firstLink, firstLink + 40).startsWith('<a href="#main"'));
  const main = html.indexOf('<main'), footer = html.indexOf('<footer'), nav = html.indexOf('id="mobile-nav"');
  check(`${rel}: <main> sits between the menu and the footer`, nav < main && main < footer && html.indexOf('</main>') < footer);
  if (html.includes('id="mobile-nav"')) check(`${rel}: loads the menu focus handler`, html.includes('src="/assets/a11y.js'));
  for (const m of html.matchAll(/<canvas\b[^>]*>/g)) {
    check(`${rel}: chart has a text alternative: ${m[0].slice(0, 40)}`, /role="img"/.test(m[0]) && /aria-label="[^"]{20,}"/.test(m[0]));
  }
  for (const m of html.matchAll(/<(input|textarea|select)\b[^>]*>/g)) {
    if (/type="(hidden|checkbox|radio|submit|button)"/.test(m[0])) continue;
    const id = (m[0].match(/\sid="([^"]+)"/) || [])[1];
    check(`${rel}: input has a label: ${id || m[0].slice(0, 40)}`, /aria-label=/.test(m[0]) || (id && html.includes(`for="${id}"`)));
  }
}

// Data text dimmed below readable contrast (muted #a3a3a3 at /70 or lower on
// near-black is under 4.5:1 for small text).
for (const f of pages.concat(fs.readdirSync(path.join(repo, 'assets/pages')).map((n) => path.join(repo, 'assets/pages', n)), [path.join(repo, 'assets/scan-flow.js'), path.join(repo, 'assets/telemetry-flow.js')])) {
  const src = fs.readFileSync(f, 'utf8');
  const hit = src.match(/(?<![:\w-])text-muted\/[1-7]0\b/);
  check(`${path.relative(repo, f)}: no muted text below /80`, !hit, hit && hit[0]);
}

// Results that appear after an action are announced.
for (const [page, id] of [['sentinel/index.html', 'result'], ['telemetry/index.html', 'result'], ['sentinel/bulk/index.html', 'flow'], ['trust/index.html', 'q-status']]) {
  const tag = (read(page).match(new RegExp(`<[^>]*id="${id}"[^>]*>`)) || [''])[0];
  check(`${page}: #${id} is an aria-live region`, /aria-live="polite"/.test(tag), tag);
}

// The Sentinel address box: no auto-capitalization, Enter scans, a leading R is fixed.
{
  const tag = (read('sentinel/index.html').match(/<input\s+id="address"[\s\S]*?\/>/) || [''])[0];
  check('sentinel: address input turns off autocapitalize', /autocapitalize="off"/.test(tag), tag);
  const src = read('assets/pages/sentinel.js');
  check('sentinel: Enter in the address box runs the scan', /getElementById\("address"\)\.addEventListener\("keydown"/.test(src));
  check('sentinel: a leading capital R is lowered before validation', /charAt\(0\) === "R"/.test(src));
}

// The menu focus handler: opening moves focus in, Tab stays inside, closing returns it.
{
  const listeners = {};
  const mk = (id) => ({ id, offsetParent: {}, focus() { doc.activeElement = this; }, contains: () => false });
  const opener = mk('nav-open'), closer = mk('nav-close'), link = mk('link');
  let observerCb = null;
  const overlay = {
    style: { display: 'none' },
    contains: (el) => el === closer || el === link,
    querySelectorAll: () => [closer, link],
    addEventListener() {},
  };
  const doc = {
    activeElement: null, body: {},
    getElementById: (id) => ({ 'mobile-nav': overlay, 'nav-open': opener, 'nav-close': closer })[id] || null,
    addEventListener: (t, fn) => { listeners[t] = fn; },
  };
  doc.activeElement = doc.body;
  const ctx = { document: doc, MutationObserver: class { constructor(cb) { observerCb = cb; } observe() {} }, Array };
  vm.createContext(ctx);
  vm.runInContext(read('assets/a11y.js'), ctx);
  opener.focus();
  overlay.style.display = 'flex'; observerCb();
  check('menu: opening moves focus to the close button', doc.activeElement === closer);
  let prevented = false;
  doc.activeElement = link;
  listeners.keydown({ key: 'Tab', shiftKey: false, preventDefault() { prevented = true; } });
  check('menu: Tab from the last item wraps to the first', prevented && doc.activeElement === closer);
  overlay.style.display = 'none'; observerCb();
  check('menu: closing returns focus to the menu button', doc.activeElement === opener);
}

console.log(`a11y: ${pages.length} pages checked`);
process.exit(fails ? 1 : 0);
