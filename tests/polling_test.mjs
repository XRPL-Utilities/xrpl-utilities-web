// Background-tab polling guard.
//
// 2026-10-26 audit: data pages kept polling the APIs from hidden tabs (the
// Status page alone made 12 calls a minute). Repeating refreshes now go
// through assets/poll.js, which skips ticks while the tab is hidden and
// catches up once on return. This checks that helper's behaviour, that no
// page script starts a bare setInterval outside the vetted list, and that
// every page whose script calls pollWhileVisible loads poll.js first.
//
// Run: node tests/polling_test.mjs
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let fails = 0;
function check(name, cond, extra = '') {
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + extra));
  if (!cond) fails++;
}

// ---- helper behaviour, with a fake clock and a fake document ----
let now = 0;
const timers = [];
const listeners = {};
const document = {
  hidden: false,
  addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
};
const ctx = {
  window: {}, document,
  Date: { now: () => now },
  setInterval(fn, ms) { timers.push({ fn, ms, next: now + ms }); return timers.length; },
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(repo, 'assets/poll.js'), 'utf8'), ctx);
const advance = (ms) => {
  const end = now + ms;
  for (;;) {
    const t = timers.filter((x) => x.next <= end).sort((a, b) => a.next - b.next)[0];
    if (!t) break;
    now = t.next; t.next += t.ms; t.fn();
  }
  now = end;
};
const setHidden = (h) => { document.hidden = h; (listeners.visibilitychange || []).forEach((f) => f()); };

let calls = 0;
ctx.window.pollWhileVisible(() => { calls++; }, 60000);
advance(60000);
check('polls while visible', calls === 1, String(calls));
setHidden(true);
advance(10 * 60000);
check('no calls while hidden', calls === 1, String(calls));
setHidden(false);
check('one catch-up call on return after a full interval', calls === 2, String(calls));
advance(60000);
check('normal ticks resume', calls === 3, String(calls));
setHidden(true);
advance(1000);
setHidden(false);
check('no catch-up after a short absence', calls === 3, String(calls));

// ---- page scripts: no unguarded setInterval ----
// Each entry is vetted by hand: it either pauses itself on visibilitychange
// or is not a network poll.
const VETTED = [
  ['pulse.js', 'timer = setInterval(advance, 5000)'],            // carousel, stopped when hidden
  ['pulse.js', 'timer = setInterval(refreshAll, REFRESH_MS)'],   // stopped when hidden
  ['flows.js', 'const startInterval = setInterval(() => {'],    // waits up to 10s for d3, then clears
  ['status.js', 'setInterval(() => { if (!document.hidden) refresh(); }, 60000)'],
  ['telemetry.js', 'setInterval(refreshSpot, 60_000)'],         // cleared when hidden
];
const pagesDir = path.join(repo, 'assets/pages');
for (const f of fs.readdirSync(pagesDir).filter((n) => n.endsWith('.js'))) {
  const src = fs.readFileSync(path.join(pagesDir, f), 'utf8');
  src.split('\n').forEach((line, i) => {
    if (!line.includes('setInterval(') || /^\s*\/\//.test(line)) return;
    const ok = VETTED.some(([file, snippet]) => file === f && line.includes(snippet));
    check(`${f}:${i + 1} setInterval is vetted or uses pollWhileVisible`, ok, line.trim());
  });
}

// ---- pages that use the helper load it first ----
const htmlFiles = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
  const p = path.join(d, e.name);
  if (e.isDirectory()) return ['.git', 'node_modules', 'tests'].includes(e.name) ? [] : htmlFiles(p);
  return e.name.endsWith('.html') ? [p] : [];
});
for (const file of htmlFiles(repo)) {
  const html = fs.readFileSync(file, 'utf8');
  const scripts = [...html.matchAll(/<script[^>]*\bsrc="([^"?]+)/g)].map((m) => m[1]);
  const users = scripts.filter((s) => s.startsWith('/assets/') &&
    fs.existsSync(path.join(repo, s)) &&
    fs.readFileSync(path.join(repo, s), 'utf8').includes('pollWhileVisible(') &&
    s !== '/assets/poll.js');
  if (!users.length) continue;
  const at = scripts.indexOf('/assets/poll.js');
  const rel = path.relative(repo, file);
  check(`${rel} loads poll.js before ${users.join(', ')}`,
    at !== -1 && users.every((u) => scripts.indexOf(u) > at),
    scripts.join(' '));
}

console.log(fails ? `${fails} FAILED` : 'polling: ok');
process.exit(fails ? 1 : 0);
