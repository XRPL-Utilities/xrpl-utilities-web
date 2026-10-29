// Sentinel page facts checked against the live /schema catalog, the
// Sentinel and Pulse code, and the ledger on 2026-10-28.
//
// - HIGH_FAILURE_RATE said "more than a third"; the rule is more than 30%.
// - WHALE_RECENT_ACTIVITY claimed a $1M floor and WHALE_INSTITUTIONAL_TIER
//   called itself a ticket-size tier; institutional-flow events are mostly
//   identity-based (a known side at $50K+, or $10M+).
// - Sweep and accumulation were described as payments; they count all
//   in and out transactions.
// - The output list said 56 signals (58 live) and the gallery said Sologenic
//   issues several tokens (it issues one) and gave stale counts (USDB ~95M).
// - Copy named the payment facilitators and said "operator-curated".
//
// Run: node tests/sentinel_copy_test.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(repo, 'sentinel/index.html'), 'utf8');
const js = fs.readFileSync(path.join(repo, 'assets/pages/sentinel.js'), 'utf8');
const code = js.replace(/\/\/.*$/gm, '');
let fails = 0;
function check(name, cond) { console.log((cond ? 'PASS ' : 'FAIL ') + name); if (!cond) fails++; }

check('failure rate is 30%, not a third', html.includes('More than 30% of its transactions') && !html.includes('More than a third'));
check('no $1M whale floor claim', !html.includes('WHALE_MOVE floor'));
check('institutional tier described by identity or $10M', html.includes('either involved a known institution or were $10M or more'));
check('sweep counts transactions', html.includes('times as many outgoing transactions as incoming'));
check('no stale signal count', !html.includes('56 entries'));
check('Sologenic issues one token', !code.includes('Issues several tokens') && code.includes('Issuer of the SOLO token.'));
check('gallery carries no stale figures', !/~\d|trustlines|obligations/i.test(code.slice(code.indexOf('const GALLERY'), code.indexOf('];', code.indexOf('const GALLERY')))));
check('payment options listed in full', html.includes('Pay in RLUSD or XRP on the XRP Ledger, or USDC on Base.'));
check('glossary has one plain line per flag', (html.match(/<dt class="font-mono/g) || []).length === 58 && !html.includes('Fires when'));
for (const leak of ['operator-curated', 'Operator-curated', 't54', 'facilitator', 'curated', 'x402 v2']) {
  check(`no "${leak}" in page copy`, !html.includes(leak) && !code.includes(leak));
}
console.log(fails ? `${fails} FAILED` : 'sentinel copy: ok');
process.exit(fails ? 1 : 0);
