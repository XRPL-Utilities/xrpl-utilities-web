// Public pages show plain names and plain copy, not research notes or
// method details (design review, 2026-10-27). The Vault tiles printed each
// issuer's internal caveat, Pulse cluster cards printed watchlist labels with
// their research notes and repeated the same hub wallet, the Flows map named
// the label source, and Telemetry called a what-if a "projection".
//
// Run: node tests/public_copy_test.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(repo, p), 'utf8');
let fails = 0;
const fail = (m) => { fails++; console.log('FAIL ' + m); };

const vault = read('assets/pages/vault.js');
if (/i\.caveat\b/.test(vault)) fail('vault.js: issuer tiles must not render the internal caveat note');

const telemetry = read('telemetry/index.html') + read('assets/pages/telemetry.js');
for (const re of [/Predictive/i, /Projected price/i, /\bprojection\b/i]) {
  if (re.test(telemetry)) fail(`telemetry: "${re.source}" frames a what-if as a forecast`);
}

const pulseHtml = read('pulse/index.html');
if (/inference_method/.test(pulseHtml)) fail('pulse/index.html: names an internal field in public copy');

const flows = read('assets/pages/flows.js') + read('flows/index.html');
for (const s of ['Jurisdiction map:', 'labeled-wallet whale Payments']) {
  if (flows.includes(s)) fail(`flows: "${s}" describes the method, not the data`);
}
if (/coverage_caveat/.test(read('assets/pages/flows.js'))) fail('flows.js: prints the API method note under the map');
if (/wallet_jurisdiction|ISO-3166|well-known label/.test(read('assets/glossary-tooltip.js'))) fail('glossary: names internal tables or the label source');
if (read('flows/index.html').includes('operator-curated')) fail('flows/index.html: "operator-curated" describes the method, not the data');

// Pulse card helpers, run against the live labels that showed on 2026-10-27.
const pulse = read('assets/pages/pulse.js');
const grab = (name) => {
  const m = pulse.match(new RegExp('function ' + name + '\\([\\s\\S]*?\\n}\\n'));
  if (!m) { fail('pulse.js: ' + name + ' not found'); return (x) => x; }
  return new Function(m[0] + '; return ' + name + ';')();
};
const plain = grab('_plainLabel');
const cases = [
  ['Ripple RLUSD issuer (RLUSD stablecoin; inbound = RLUSD burn/redemption)', 'Ripple RLUSD issuer'],
  ['RLUSD mint/burn hub, second channel (33.3M minted; activated by Ripple ops rP7jPqEB)', 'RLUSD mint/burn hub, second channel'],
  ['Binance-bound relay off Ripple RLUSD-distribution hop rLoD9U2g (created 2026-10-05)', 'Binance-bound relay off Ripple RLUSD-distribution hop'],
  ['Outer (inner (deep) note) name', 'Outer name'],
  ['Ripple RLUSD redemption whitelist member', 'Ripple RLUSD redemption whitelist member'],
  [null, ''],
];
for (const [inp, want] of cases) {
  const got = plain(inp);
  if (got !== want) fail(`_plainLabel(${JSON.stringify(inp)}) = ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
}
const dedupe = grab('_dedupeByHub');
const rows = dedupe([{ hub_wallet: 'rA' }, { hub_wallet: 'rB' }, { hub_wallet: 'rA' }]);
if (rows.length !== 2) fail(`_dedupeByHub kept ${rows.length} cards for 2 hubs`);
if (/narrativeFull|r\.narrative/.test(pulse)) fail('pulse.js: cluster cards must not print the server narrative (it embeds raw labels)');

console.log('public copy: ' + (fails ? fails + ' failure(s)' : 'ok'));
process.exit(fails ? 1 : 0);
