// Regression test for the payment QR.
//
// The QR used to be an <img> from api.qrserver.com, which meant a third party
// generated the pixels a payer's wallet scans: a substituted image pays an
// attacker's r-address while the Recipient / Amount / Destination Tag rows on
// the page still read correctly, and nothing compares the two. These checks
// pin that the QR is encoded on this origin, from the string the page holds,
// and that no page has drifted back to the image host.
//
// Writes tests/qr_rendered.json for the optional cross-check in
// tests/qr_matrix_crosscheck.py.
//
// Run: node tests/qr_render_test.mjs

import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..');
const TEXT = 'xrpl:rKxTzCKYKPPdXEzuioEQ6KekQK26w2DBd5?dt=90210&amount=10';

let fails = 0;
function check(name, cond, extra = '') {
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + extra));
  if (!cond) fails++;
}

// Nothing may reach for the image host again.
const surfaces = [
  'assets/scan-flow.js', 'assets/telemetry-flow.js', 'tip/index.html',
  'sentinel/index.html', 'sentinel/bulk/index.html', 'telemetry/index.html',
  '_headers',
];
for (const f of surfaces) {
  const body = fs.readFileSync(path.join(repo, f), 'utf8');
  // The prose comments explaining why it was removed name the host; only
  // live references matter.
  const live = body.split('\n').filter((l) => l.includes('api.qrserver.com')
    && !/^\s*(\/\/|\*|<!--|#)/.test(l));
  check(`${f} does not call the image host`, live.length === 0, live.join(' | '));
}

// /assets/*.js is cached for 300s with the ?v= token in the cache key, so a
// page can pair a fresh CSP with a stale script body. Two things must hold:
// the two pages that load the same scan-flow.js must agree on one token, or
// they drift apart into separate stale copies; and any page loading a flow
// script must load the encoder with it, or global.XRQr is undefined there and
// the paid flow silently falls through to the manual instructions.
const flowPages = {
  'sentinel/index.html': 'scan-flow.js',
  'sentinel/bulk/index.html': 'scan-flow.js',
  'telemetry/index.html': 'telemetry-flow.js',
};
const tokens = {};
for (const [page, script] of Object.entries(flowPages)) {
  const body = fs.readFileSync(path.join(repo, page), 'utf8');
  const m = body.match(new RegExp('/assets/' + script.replace('.', '\\.') + '\\?v=([^"\'>]*)'));
  check(`${page} loads ${script} with a cache-bust token`, !!m && !!m[1], String(m));
  check(`${page} loads the local QR encoder alongside ${script}`,
    body.includes('/assets/qr-code.js?v=')
    && body.includes('/assets/vendor/qrcode-generator.min.js?v='));
  if (m) (tokens[script] = tokens[script] || []).push(m[1]);
}
check('both scan-flow.js pages share one cache-bust token',
  new Set(tokens['scan-flow.js'] || []).size === 1,
  JSON.stringify(tokens['scan-flow.js']));

const rects = [];
function fakeCanvas() {
  const attrs = {};
  return {
    width: 0, height: 0, style: {}, attrs,
    setAttribute(k, v) { attrs[k] = v; },
    getContext: () => ({
      set fillStyle(v) { this._fill = v; },
      get fillStyle() { return this._fill; },
      fillRect(x, y, w, h) { rects.push([x, y, w, h, this._fill]); },
    }),
  };
}
const ctx = {
  console, Math, JSON,
  document: { createElement: (t) => (t === 'canvas' ? fakeCanvas() : {}) },
};
ctx.window = ctx;
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(repo, 'assets/vendor/qrcode-generator.min.js'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(path.join(repo, 'assets/qr-code.js'), 'utf8'), ctx);

ctx.TEXT = TEXT;
const canvas = vm.runInContext('XRQr.toCanvas(TEXT, 192)', ctx);
check('canvas fills the page slot', canvas.style.width === '192px' && canvas.style.height === '192px');
// A bare <canvas> has no role and no alt, so a screen reader on the payment
// page announces nothing where the scannable code is.
check('canvas carries an accessible name',
  canvas.attrs.role === 'img' && !!canvas.attrs['aria-label'], JSON.stringify(canvas.attrs));
check('white ground painted first', rects[0][4] === '#ffffff' && rects[0][2] === canvas.width);

const cell = rects[1] ? rects[1][2] : 0;
const count = cell ? canvas.width / cell : 0;
check('module count is a valid QR size', Number.isInteger(count) && count >= 21 && (count - 17) % 4 === 0, String(count));

const matrix = Array.from({ length: count }, () => new Array(count).fill('0'));
for (const [x, y, , , fill] of rects.slice(1)) {
  matrix[y / cell][x / cell] = fill === '#000000' ? '1' : '0';
}
// Finder patterns in three corners - cheap proof the drawn modules are a QR
// and not, say, an all-dark rectangle.
const finder = (r0, c0) => [0, 1, 2, 3, 4, 5, 6].every((i) =>
  matrix[r0][c0 + i] === '1' && matrix[r0 + 6][c0 + i] === '1'
  && matrix[r0 + i][c0] === '1' && matrix[r0 + i][c0 + 6] === '1');
check('finder patterns present', finder(0, 0) && finder(0, count - 7) && finder(count - 7, 0));
fs.writeFileSync(path.join(here, 'qr_rendered.json'),
  JSON.stringify({ text: TEXT, count, rows: matrix.map((r) => r.join('')) }));

// A missing encoder must throw so the caller falls through to the manual
// instructions; a blank white square that looks scannable is worse.
vm.runInContext('qrcode = undefined;', ctx);
let threw = false;
try { vm.runInContext('XRQr.toCanvas(TEXT, 192)', ctx); } catch (e) { threw = true; }
check('throws when the encoder is absent', threw);

console.log(fails ? `${fails} FAILED` : 'payment qr: ok');
process.exit(fails ? 1 : 0);
