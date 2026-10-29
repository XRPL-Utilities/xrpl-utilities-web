// Lineage exits on 2026-10-29 listed 8 exchanges and missed Robinhood,
// Uphold, Upbit and every other exchange we did not already track. Pulse
// now returns every publicly named exchange. The page must give the
// exchanges our flows reach their own card, show the full named count
// rather than the length of the capped address list, and group the rest.
//
// Run: node tests/lineage_exits_test.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = fs.readFileSync(path.join(repo, 'assets/pages/lineage.js'), 'utf8');
let fails = 0;
const fail = (m) => { fails++; console.log('FAIL ' + m); };

const grab = (re, what) => {
  const m = src.match(re);
  if (!m) { fail('lineage.js: ' + what + ' not found'); return ''; }
  return m[0];
};
const code = [
  grab(/function fmtInt\([\s\S]*?\n}\n/, 'fmtInt'),
  grab(/function truncAddr\([\s\S]*?\n}\n/, 'truncAddr'),
  grab(/function escapeHtml\([\s\S]*?\n}\n/, 'escapeHtml'),
  grab(/const SOURCE_WALLET_NOTES = \{[\s\S]*?\n};\n/, 'SOURCE_WALLET_NOTES'),
  grab(/const PIPELINE_ROLE_CARDS = \{[\s\S]*?\n};\n/, 'PIPELINE_ROLE_CARDS'),
  grab(/async function loadTopology\(\) \{[\s\S]*?\n}\n/, 'loadTopology'),
].join('\n');

const addr = (c) => 'r' + c.repeat(30);
const body = {
  source: { wallets: [] },
  pipeline: { role_counts: { mm: 3 } },
  exits: { entities: [
    { entity: 'Robinhood', wallet_count: 9, tracked_wallet_count: 5, inferred_wallet_count: 0,
      wallets: 'ABCDEFGHJ'.split('').map(c => ({ address: addr(c), label: 'Robinhood' })) },
    { entity: 'OKX', wallet_count: 1, tracked_wallet_count: 0, inferred_wallet_count: 21,
      wallets: [{ address: addr('K'), label: 'OKX' }] },
    { entity: 'bitFlyer', wallet_count: 96, tracked_wallet_count: 0, inferred_wallet_count: 0,
      wallets: [{ address: addr('M'), label: 'bitFlyer' }] },
    { entity: '<b>Upbit</b>', wallet_count: 27, tracked_wallet_count: 0, inferred_wallet_count: 0, wallets: [] },
  ] },
};
const els = {};
const document = { getElementById: (id) => (els[id] ||= { innerHTML: '' }) };
const fetch = async () => ({ ok: true, json: async () => body });
const run = new Function('document', 'fetch', 'API_BASE', 'console', code + '\nreturn loadTopology();');
await run(document, fetch, '', { warn: (...a) => fail('topology threw: ' + a.join(' ')) });
const html = (els['topology-exits'] || {}).innerHTML || '';

if (!/Robinhood<\/div>\s*<div[^>]*>9 publicly named/.test(html)) fail('Robinhood card must show all 9 named wallets');
if (!/and 5 more/.test(html)) fail('capped address list must say how many more are named');
if ((html.match(/xrpscan\.com\/account\/rA/g) || []).length !== 1) fail('Robinhood addresses missing');
if (/xrpscan\.com\/account\/rH/.test(html)) fail('more than 4 addresses shown on one card');
if (!/21 more we attribute/.test(html)) fail('OKX attributed count missing');
if (!/2 more exchanges/.test(html)) fail('exchanges outside our flows must share one card');
if (!/bitFlyer <span[^>]*>96</.test(html)) fail('grouped card must show each named count');
if (/<b>Upbit/.test(html)) fail('entity names must be escaped');

console.log('lineage exits: ' + (fails ? fails + ' failure(s)' : 'ok'));
process.exit(fails ? 1 : 0);
