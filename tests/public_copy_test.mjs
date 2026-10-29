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

// The Pulse cluster cards were removed on 2026-10-29: every card restated
// feed events for the same few Ripple and Binance wallets, and the labels
// carried research notes. Keep them off the public page.
const pulse = read('assets/pages/pulse.js');
if (/id="choreographies"|choreo-grid/.test(pulseHtml)) fail('pulse/index.html: cluster card section is back');
if (/recent-choreographies\?/.test(pulse)) fail('pulse.js: fetches cluster cards for the public page');
if (/narrativeFull|r\.narrative/.test(pulse)) fail('pulse.js: must not print the server narrative (it embeds raw labels)');

console.log('public copy: ' + (fails ? fails + ' failure(s)' : 'ok'));
process.exit(fails ? 1 : 0);
