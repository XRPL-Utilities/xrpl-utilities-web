// /follow/ page checks (2026-11-13).
//
// The page shows any wallet's history, so everything it prints is written by
// whoever sent the transactions. These checks fail if:
// - a hostile memo, domain or token name could reach the page as HTML,
// - the page script starts using innerHTML or similar,
// - plain-English sentences break on real ledger answers,
// - the page or its scripts call anyone a scam, ring, fraud and so on, or
//   lose the do-your-own-research note,
// - the CSP stops allowing the ledger servers the page reads.
//
// Run: node tests/follow_test.mjs
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const C = require(path.join(repo, 'assets/follow-core.js'));
const fx = (f) => JSON.parse(fs.readFileSync(path.join(repo, 'tests/fixtures/follow', f), 'utf8'));
let fails = 0;
const check = (name, ok, detail = '') => { if (!ok) { fails++; console.log(`FAIL ${name} ${detail}`); } };
const text = (parts) => parts.map((p) => (typeof p === 'string' ? p : p.addr ? C.shortAddr(p.addr) : p.amt != null ? p.amt : p.text)).join('');

// ---- input ------------------------------------------------------------------
check('address parses', C.parseInput(' rLQNxUZT1PraKVzpvBMXUTLk8PiQS18qqy ')?.kind === 'account');
check('hash parses upper-cased', C.parseInput('a'.repeat(64))?.value === 'A'.repeat(64));
for (const bad of ['', 'r0OIl111111111111111111111111', '<img src=x onerror=alert(1)>', 'javascript:alert(1)', 'r' + 'a'.repeat(100), 'G'.repeat(64)]) {
  check(`rejects ${JSON.stringify(bad).slice(0, 30)}`, C.parseInput(bad) === null);
}

// ---- hostile ledger text -------------------------------------------------------
const hex = (s) => Buffer.from(s, 'utf8').toString('hex').toUpperCase();
check('plain domain decodes', C.hexToText(hex('example.com')) === 'example.com');
check('right-to-left override is refused', C.hexToText(hex('moc.‮evil')) === null);
check('control characters are refused', C.hexToText(hex('a\x07b')) === null);
check('non-hex is refused', C.hexToText('ZZ') === null);
check('long text is capped', C.hexToText(hex('x'.repeat(500)), 50).length <= 51);
// Markup survives as plain text; it is the renderer's job never to parse it,
// and the script check below makes sure it never does.
check('markup stays literal text', C.hexToText(hex('<img src=x onerror=alert(1)>')) === '<img src=x onerror=alert(1)>');
check('token code with markup is not shown as a name', C.currencyName(hex('<b>X</b>').padEnd(40, '0')) === 'token');
check('ascii token code decodes', C.currencyName('43484F4C41000000000000000000000000000000') === 'CHOLA');
check('pool share code', C.currencyName('03' + '1'.repeat(38)) === 'pool share');
check('3-letter code', C.currencyName('USD') === 'USD');

const evil = {
  tx: {
    TransactionType: 'Payment', Account: 'rLQNxUZT1PraKVzpvBMXUTLk8PiQS18qqy', Destination: 'javascript:alert(1)',
    Amount: '1000000', Fee: '12', Memos: [{ Memo: { MemoData: hex('<script>alert(1)</script>') } }, { Memo: { MemoData: 'nothex' } }],
  },
  meta: { TransactionResult: 'tesSUCCESS', AffectedNodes: [] },
};
const d = C.describe(C.normalizeEntry(evil));
check('a non-address destination is never a link', !d.parts.some((p) => p && p.addr === 'javascript:alert(1)'));
check('memos come back as plain strings', C.memos(evil.tx).length === 1 && typeof C.memos(evil.tx)[0] === 'string');
check('unknown type name is sanitised', text(C.describe({ tx: { TransactionType: '<img onerror=x>', Account: 'rLQNxUZT1PraKVzpvBMXUTLk8PiQS18qqy' }, meta: null }).parts).includes('imgonerrorx'));

// ---- real ledger answers -----------------------------------------------------------
for (const [addr, file] of [['rLQNxUZT1PraKVzpvBMXUTLk8PiQS18qqy', 'account_tx_rLQNxUZT1PraKVzpvBMXUTLk8PiQS18qqy.json'], ['rfffsukWALJB1PXYk7H8xkR6UJUDT8nMJE', 'account_tx_rfffsukWALJB1PXYk7H8xkR6UJUDT8nMJE.json']]) {
  const entries = fx(file).result.transactions.map(C.normalizeEntry);
  check(`${file}: every entry normalises`, entries.every((e) => e && e.tx && e.hash && e.date));
  for (const e of entries) {
    const s = text(C.describe(e, addr).parts);
    check(`${file}: sentence for ${e.hash.slice(0, 8)}`, s.length > 5 && !/undefined|NaN|\[object/.test(s), s);
  }
  const cps = C.counterparties(entries, addr);
  check(`${file}: counterparties exclude the wallet itself`, cps.length > 0 && cps.every((c) => c.address !== addr));
  check(`${file}: names lookup list is addresses only`, C.addressesIn(entries, addr).every(C.isAddress));
}
const offer = C.normalizeEntry(fx('tx_offer.json').result);
check('single tx answer normalises', offer && offer.hash.length === 64 && offer.tx.TransactionType === 'OfferCreate');
check('offer sentence names both sides', /Offered 1\.5 XRP for 1,500 CHOLA/.test(text(C.describe(offer).parts)), text(C.describe(offer).parts));
check('memo on a real tx decodes', C.memos(offer.tx)[0] === 'Transaction initiated via xmagnetic.org;');

// Funding: a created account's first payment names the funder.
const firstFund = {
  tx: { TransactionType: 'Payment', Account: 'r3VSNEdBJRwYL1Zz7bsdySXzr9KRTE29YW', Destination: 'rLQNxUZT1PraKVzpvBMXUTLk8PiQS18qqy', Amount: '5000000', Fee: '12', date: 833475000 },
  meta: { TransactionResult: 'tesSUCCESS', delivered_amount: '5000000', AffectedNodes: [{ CreatedNode: { LedgerEntryType: 'AccountRoot', NewFields: { Account: 'rLQNxUZT1PraKVzpvBMXUTLk8PiQS18qqy', Balance: '5000000' } } }] },
  hash: '47BC4BFADAB579C637D12361AD457771519A29038F67F53954119B4D85B04E48',
};
const f = C.fundingOf(C.normalizeEntry(firstFund), 'rLQNxUZT1PraKVzpvBMXUTLk8PiQS18qqy');
check('funder found', f && f.by === 'r3VSNEdBJRwYL1Zz7bsdySXzr9KRTE29YW' && f.xrp === 5);
check('no funder when the first tx did not create the wallet', C.fundingOf(C.normalizeEntry(firstFund), 'rfffsukWALJB1PXYk7H8xkR6UJUDT8nMJE') === null);

// Trust-line direction: holder gets the change, with the issuer named.
const tl = C.balanceChanges({ AffectedNodes: [{ ModifiedNode: { LedgerEntryType: 'RippleState',
  FinalFields: { Balance: { currency: 'USD', value: '-10' }, LowLimit: { issuer: 'rLQNxUZT1PraKVzpvBMXUTLk8PiQS18qqy' }, HighLimit: { issuer: 'rfffsukWALJB1PXYk7H8xkR6UJUDT8nMJE' } },
  PreviousFields: { Balance: { currency: 'USD', value: '-4' } } } }] });
check('high side holds a negative balance', tl.length === 1 && tl[0].account === 'rfffsukWALJB1PXYk7H8xkR6UJUDT8nMJE' && tl[0].issuer === 'rLQNxUZT1PraKVzpvBMXUTLk8PiQS18qqy' && tl[0].value === 6);

// Flags: named flags win, bits are the fallback.
check('flag bits read', C.flagWords({ Flags: 2174353408 }).length === 6);
check('named flags win', C.flagWords({ Flags: 0 }, { depositAuth: true }).length === 1);

// ---- scripts and page ---------------------------------------------------------------
const pageJs = fs.readFileSync(path.join(repo, 'assets/pages/follow.js'), 'utf8');
const coreJs = fs.readFileSync(path.join(repo, 'assets/follow-core.js'), 'utf8');
for (const [name, src] of [['follow.js', pageJs], ['follow-core.js', coreJs]]) {
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  check(`${name} never parses HTML`, !/innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\(|new Function/.test(code));
}
check('follow.js links only validated addresses', /function addrLink\(addr, opts\) \{\s*if \(!C\.isAddress\(addr\)\)/.test(pageJs));

const html = fs.readFileSync(path.join(repo, 'follow/index.html'), 'utf8');
check('caveat is on the page', html.includes('Do your own research before you send money to anyone') && html.includes('We don\'t judge anyone'));
check('people are never named (stated)', html.includes('We never name people'));
// Starter stories (2026-11-13): every preset is a real address, and the
// lookalike group sits next to the real issuer so readers can compare.
const presets = [...html.matchAll(/data-example="([^"]+)"/g)].map((m) => m[1]);
check('every preset is a valid address', presets.length >= 8 && presets.every((a) => C.parseInput(a)?.kind === 'account'), presets.join(','));
check('lookalike RLUSD sits beside the real issuer', presets.includes('rLUSDfDxGQ28Dn3ZtRSTzuqfzBaacRmNm8') && presets.includes('rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De'));
check('stories say a name proves nothing', html.includes("A wallet's name and website prove nothing about who owns it"));
const WORDS = /\b(scam\w*|fraud\w*|fake|ring|suspicious|risky|criminal|launder\w*|report (this|a) wallet)\b/i;
for (const [name, src] of [['follow/index.html', html.replace(/<footer[\s\S]*<\/footer>/, '')], ['follow.js', pageJs], ['follow-core.js', coreJs]]) {
  const m = src.match(WORDS);
  check(`${name} uses no verdict words`, !m, m ? m[0] : '');
}
const headers = fs.readFileSync(path.join(repo, '_headers'), 'utf8');
const connect = (headers.match(/connect-src([^;]*)/) || [])[1] || '';
for (const host of pageJs.match(/wss:\/\/[a-z0-9.-]+/g) || []) {
  check(`CSP allows ${host}`, connect.split(/\s+/).includes(host));
}
check('names lookup host is allowed', connect.includes('https://pulse.xrpl-utilities.io'));

console.log(`follow: ${fails ? fails + ' failed' : 'all checks passed'}`);
process.exit(fails ? 1 : 0);
