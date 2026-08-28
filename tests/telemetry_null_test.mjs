// Regression test for the null-on-unmeasured contract in /telemetry/.
//
// XR-Telemetry publishes null - never 0 - for a field it could not measure on
// a degraded refresh, and the paid /scan preview renders that payload. Every
// formatter in assets/telemetry-flow.js coerces with Number(), and Number(null)
// is 0, so an unguarded formatter turns "we could not measure this" into a
// confident "0 XRP" / "$0.00" on the surface the customer paid for. This test
// drives renderResults() with a payload whose utility_floor fields are null and
// pins that none of those slots print a fabricated zero, while a healthy
// payload still formats normally.
//
// Run: node tests/telemetry_null_test.mjs [path-to-telemetry-flow.js]
// The optional path argument exists so the fix can be mutation-proofed against
// an older copy of the script without touching the working tree.

import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scriptPath = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(repo, 'assets/telemetry-flow.js');

// Mirrors the module-private UNMEASURED constant in telemetry-flow.js.
const UNMEASURED_MARK = '-';

let fails = 0;
function check(name, cond, extra = '') {
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + extra));
  if (!cond) fails++;
}

// Minimal DOM. Nodes keep their own text plus their children so a rendered
// card can be read back as a label -> value table.
class Node {
  constructor(tag = 'div') {
    this.tagName = tag;
    this.children = [];
    this.ownText = '';
    this.attrs = {};
    this.style = {};
    this.dataset = {};
    this.classList = { add() {}, remove() {}, contains() { return false; } };
  }
  appendChild(c) { this.children.push(c); return c; }
  removeChild(c) {
    const i = this.children.indexOf(c);
    if (i >= 0) this.children.splice(i, 1);
  }
  addEventListener() {}
  setAttribute(k, v) { this.attrs[k] = v; }
  removeAttribute(k) { delete this.attrs[k]; }
  remove() {}
  scrollIntoView() {}
  click() {}
  querySelector() { return null; }
  querySelectorAll() { return []; }
  set textContent(v) { this.ownText = v == null ? '' : String(v); this.children = []; }
  get textContent() {
    return [this.ownText]
      .concat(this.children.map((c) => c.textContent))
      .filter((s) => s !== '')
      .join('\n');
  }
  set innerHTML(_v) { this.ownText = ''; this.children = []; }
  get innerHTML() { return this.textContent; }
}

const ctx = {
  console, Math, JSON, Date, Number, String, Boolean, Array, Object, isFinite, isNaN,
  Node,
  setTimeout, clearTimeout, setInterval, clearInterval,
  fetch: async () => { throw new Error('no network in this test'); },
  Blob: class {},
  URL: { createObjectURL: () => 'blob:x', revokeObjectURL() {} },
  document: {
    title: '',
    body: new Node('body'),
    createElement: (t) => new Node(t),
    createTextNode: (s) => { const n = new Node('#text'); n.ownText = String(s); return n; },
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener() {},
  },
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
};
ctx.window = ctx;
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(scriptPath, 'utf8'), ctx);

// Walk the rendered tree and pull the value cell that sits under a label cell.
// kvGrid builds each cell as [label node, value node].
function rowValue(root, label) {
  const stack = [root];
  while (stack.length) {
    const n = stack.pop();
    for (let i = 0; i < n.children.length; i += 1) {
      const c = n.children[i];
      if (c.ownText === label && n.children[i + 1]) {
        return n.children[i + 1].textContent;
      }
      stack.push(c);
    }
  }
  return null;
}

function render(payload) {
  const target = new Node('div');
  ctx.TARGET = target;
  ctx.PAYLOAD = payload;
  vm.runInContext('XRTelemetryScan.renderResults(TARGET, PAYLOAD, null)', ctx);
  return target;
}

// A degraded refresh: every utility_floor number Telemetry could not measure
// comes back null, and the payload carries the reason strings instead.
const degraded = render({
  generated_at: '2026-08-27T00:00:00Z',
  utility_floor: {
    algebraic_p_at_assumed_qv_usd: null,
    algebraic_p_unavailable_reason: 'active float unmeasured this refresh',
    available_liquid_supply_xrp: null,
    q_assumed_usd: null,
    v_assumed: 5.5,
    current_price_usd: null,
  },
});

const floorRow = rowValue(degraded, 'Required floor');
const floatRow = rowValue(degraded, 'Active Float (M)');
const volumeRow = rowValue(degraded, 'Volume (Q)');

check('utility floor card rendered', floorRow !== null && floatRow !== null, degraded.textContent);
check('null floor price is not printed as $0.00',
  !!floorRow && !/\$\s*0\.00/.test(floorRow), String(floorRow));
check('null floor price renders as unmeasured',
  !!floorRow && floorRow.startsWith('-'), String(floorRow));
check('null active float is not printed as 0 XRP',
  !!floatRow && !/\b0 XRP\b/.test(floatRow), String(floatRow));
check('null active float renders as unmeasured', floatRow === '-', String(floatRow));
check('null volume is not printed as $0', !!volumeRow && !/^\$0$/.test(volumeRow), String(volumeRow));

// No slot anywhere in the degraded card may show a zero-valued quantity.
const degradedText = degraded.textContent;
check('degraded card prints no fabricated zero anywhere',
  !/\b0 XRP\b/.test(degradedText) && !/\$0\.00(?!\d)/.test(degradedText),
  degradedText);

// The guards must not swallow real numbers, including a legitimate 0.
const healthy = render({
  generated_at: '2026-08-27T00:00:00Z',
  utility_floor: {
    algebraic_p_at_assumed_qv_usd: 1.014,
    available_liquid_supply_xrp: 24500.5,
    q_assumed_usd: 1200000,
    v_assumed: 5.5,
    current_price_usd: 2.31,
    current_price_usd_24h_change_pct: -1.25,
  },
});
check('healthy floor price still formats',
  rowValue(healthy, 'Required floor') === '$1.014 / XRP', String(rowValue(healthy, 'Required floor')));
check('healthy active float still formats',
  /^24,?500\.5 XRP$/.test(String(rowValue(healthy, 'Active Float (M)'))),
  String(rowValue(healthy, 'Active Float (M)')));
check('healthy spot price still formats',
  String(rowValue(healthy, 'Current spot')).includes('$2.31 / XRP'),
  String(rowValue(healthy, 'Current spot')));

const zeroed = render({
  generated_at: '2026-08-27T00:00:00Z',
  utility_floor: {
    algebraic_p_at_assumed_qv_usd: 1.0,
    available_liquid_supply_xrp: 0,
    q_assumed_usd: 0,
    v_assumed: 5.5,
    current_price_usd: null,
  },
});
check('a measured zero is still printed as zero',
  rowValue(zeroed, 'Active Float (M)') === '0 XRP',
  String(rowValue(zeroed, 'Active Float (M)')));

// ---------------------------------------------------------------------------
// Unmeasured slots must name their cause, and no slot may reach a raw sink.
//
// Three separate regressions, all on the Required-equilibrium-price card:
//   (a) Velocity (V) called Number(x).toFixed(2) directly, bypassing every
//       hardened formatter. null printed "0.00" (a fabricated zero on a paid
//       surface) and a missing field printed "NaN".
//   (b) The headline concatenated the unit onto the dash, so an unmeasured
//       floor read "- / XRP", which looks like a measured quantity whose
//       number went missing.
//   (c) Telemetry ships the cause of every suppression, and nothing surfaced
//       it. These fields are unavailable for real and for days at a time when
//       an upstream input degrades, so a bare dash is not enough.
const reasoned = render({
  generated_at: '2026-08-28T00:00:00Z',
  derived_models: {
    active_float: { value_unavailable_reason: 'rich list unreadable this refresh' },
  },
  utility_floor: {
    algebraic_p_at_assumed_qv_usd: null,
    algebraic_p_unavailable_reason: 'on-ledger liquidity unreadable this refresh',
    available_liquid_supply_xrp: null,
    q_assumed_usd: null,
    v_assumed: null,
    current_price_usd: null,
  },
});

const rFloor = String(rowValue(reasoned, 'Required floor'));
const rFloat = String(rowValue(reasoned, 'Active Float (M)'));
const rVel = String(rowValue(reasoned, 'Velocity (V)'));

check('null velocity is not printed as a fabricated 0.00', rVel !== '0.00', rVel);
check('null velocity renders as unmeasured', rVel === UNMEASURED_MARK, rVel);
check('unmeasured floor does not print a dash with a unit stuck to it',
  !/^-\s*\/\s*XRP/.test(rFloor), rFloor);
check('unmeasured floor leads with the unmeasured marker',
  rFloor.split('\n')[0].trim() === UNMEASURED_MARK, rFloor);
check('unmeasured floor names its cause',
  rFloor.includes('on-ledger liquidity unreadable this refresh'), rFloor);
check('unmeasured active float names its cause',
  rFloat.includes('rich list unreadable this refresh'), rFloat);

// A field absent from the payload, not merely null, is the case that used to
// print the literal string NaN.
const missing = render({
  generated_at: '2026-08-28T00:00:00Z',
  utility_floor: {
    algebraic_p_at_assumed_qv_usd: null,
    available_liquid_supply_xrp: null,
    q_assumed_usd: null,
    current_price_usd: null,
  },
});
const mVel = String(rowValue(missing, 'Velocity (V)'));
check('a missing velocity never prints NaN', !/NaN/.test(mVel), mVel);
check('the whole card never prints NaN anywhere',
  !/NaN/.test(missing.textContent) && !/NaN/.test(reasoned.textContent),
  missing.textContent + ' | ' + reasoned.textContent);

// Reasons are only shown in place of a value. A measured card must not grow
// an explanatory sub-line, and the guards must not swallow a real velocity.
check('healthy velocity still formats to 2 decimals',
  String(rowValue(healthy, 'Velocity (V)')) === '5.50',
  String(rowValue(healthy, 'Velocity (V)')));
check('healthy card carries no unmeasured explanation',
  !healthy.textContent.includes('Not measured this refresh'),
  healthy.textContent);

console.log(fails ? `${fails} FAILED` : 'telemetry null contract: ok');
process.exit(fails ? 1 : 0);
