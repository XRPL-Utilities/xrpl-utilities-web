/* Follow page core: pure functions that turn raw XRP Ledger answers into
 * plain-English facts. No DOM, no network, so tests/follow_test.mjs can run
 * every line in node.
 *
 * Everything that comes off the ledger (memos, domains, token codes,
 * addresses) is written by whoever sent the transaction, so treat it as
 * hostile. Functions here return plain strings and {addr} parts; the page
 * script puts them on screen with textContent only.
 *
 * A sentence is an array of parts: a string, or {addr: "r..."} for a wallet
 * the visitor can click to follow, or {amt: "1,500 XRP"} for an amount.
 */
(function (root) {
  'use strict';

  var RIPPLE_EPOCH = 946684800;
  var DROPS = 1000000n;
  var ADDRESS_RE = /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/;
  var HASH_RE = /^[0-9A-Fa-f]{64}$/;

  // AccountRoot flag bits, checked against a live account on 2026-11-13.
  var FLAG_WORDS = [
    [0x00020000, 'requireDestinationTag', 'Needs a destination tag on payments sent to it'],
    [0x00100000, 'disableMasterKey', 'Its main key is turned off'],
    [0x01000000, 'depositAuth', 'Only accepts money from wallets it has approved'],
    [0x80000000, 'allowTrustLineClawback', 'Can take back tokens it has issued'],
    [0x00800000, 'defaultRipple', 'Set up to issue tokens'],
    [0x00400000, 'globalFreeze', 'Has frozen all tokens it issued'],
    [0x00200000, 'noFreeze', 'Has given up the right to freeze its tokens'],
    [0x00040000, 'requireAuthorization', 'Must approve each holder of its tokens'],
    [0x00080000, 'disallowIncomingXRP', 'Asks not to be sent XRP'],
  ];

  function parseInput(raw) {
    var s = String(raw == null ? '' : raw).trim();
    if (s.length > 80) return null;
    if (ADDRESS_RE.test(s)) return { kind: 'account', value: s };
    if (HASH_RE.test(s)) return { kind: 'tx', value: s.toUpperCase() };
    return null;
  }

  function isAddress(s) { return typeof s === 'string' && ADDRESS_RE.test(s); }

  function shortAddr(a) {
    return isAddress(a) ? a.slice(0, 6) + '…' + a.slice(-4) : '';
  }

  // Printable ASCII only. Anything else (control characters, right-to-left
  // overrides, binary) comes back as null so a wallet can't dress its
  // domain or memo up as something it isn't.
  function hexToText(hex, max) {
    if (typeof hex !== 'string' || !/^([0-9A-Fa-f]{2})+$/.test(hex)) return null;
    var out = '';
    for (var i = 0; i < hex.length; i += 2) {
      var c = parseInt(hex.slice(i, i + 2), 16);
      if (c === 0) continue;
      if (c === 9 || c === 10 || c === 13) { out += ' '; continue; }
      if (c < 0x20 || c > 0x7e) return null;
      out += String.fromCharCode(c);
    }
    out = out.replace(/\s+/g, ' ').trim();
    if (!out) return null;
    var limit = max || 200;
    return out.length > limit ? out.slice(0, limit) + '…' : out;
  }

  function currencyName(code) {
    if (typeof code !== 'string') return 'token';
    if (code === 'XRP') return 'XRP';
    if (/^[A-Za-z0-9?!@#$%^&*<>(){}\[\]|]{3}$/.test(code)) return code;
    if (/^[0-9A-Fa-f]{40}$/.test(code)) {
      if (code.slice(0, 2) === '03') return 'pool share';
      var t = hexToText(code, 20);
      if (t && /^[A-Za-z0-9 ._\-$+]{1,20}$/.test(t)) return t;
    }
    return 'token';
  }

  function trimNumber(n, maxDecimals) {
    if (!isFinite(n)) return '0';
    var abs = Math.abs(n);
    var d = maxDecimals != null ? maxDecimals : (abs >= 1000 ? 0 : abs >= 1 ? 2 : 6);
    return n.toLocaleString('en-US', { maximumFractionDigits: d });
  }

  function dropsToXrpNumber(drops) {
    try {
      var b = BigInt(String(drops));
      var neg = b < 0n;
      if (neg) b = -b;
      var whole = Number(b / DROPS);
      var frac = Number(b % DROPS) / 1e6;
      return (neg ? -1 : 1) * (whole + frac);
    } catch (_) { return 0; }
  }

  // {value: number, currency, issuer} for any amount shape the ledger uses.
  function readAmount(a) {
    if (a == null) return null;
    if (typeof a === 'string' || typeof a === 'number') {
      return { value: dropsToXrpNumber(a), currency: 'XRP', issuer: null };
    }
    if (typeof a === 'object') {
      if (a.mpt_issuance_id) return { value: Number(a.value) || 0, currency: 'MPT', issuer: null, mpt: String(a.mpt_issuance_id) };
      if (a.currency) return { value: Number(a.value) || 0, currency: String(a.currency), issuer: a.issuer || null };
    }
    return null;
  }

  function formatAmount(a, opts) {
    var r = a && a.currency && 'value' in a && typeof a.value === 'number' ? a : readAmount(a);
    if (!r) return '';
    var v = opts && opts.abs ? Math.abs(r.value) : r.value;
    var name = r.currency === 'MPT' ? 'MPT tokens' : currencyName(r.currency);
    return trimNumber(v) + ' ' + name;
  }

  function rippleTimeToDate(sec) {
    var n = Number(sec);
    if (!isFinite(n) || n <= 0) return null;
    return new Date((n + RIPPLE_EPOCH) * 1000);
  }

  // History and single-transaction answers come in two shapes (API v1: tx
  // with the hash inside; v2: tx_json with the hash beside it). Return
  // {tx, meta, hash, date}.
  function normalizeEntry(e) {
    if (!e || typeof e !== 'object') return null;
    var tx = e.tx_json || e.tx || (e.TransactionType ? e : null);
    if (!tx || typeof tx !== 'object') return null;
    var meta = e.meta || e.metaData || null;
    if (meta && typeof meta !== 'object') meta = null;
    var hash = e.hash || tx.hash || '';
    var date = rippleTimeToDate(tx.date != null ? tx.date : e.date);
    return { tx: tx, meta: meta, hash: HASH_RE.test(hash) ? hash.toUpperCase() : '', date: date,
      ledger: Number(e.ledger_index || tx.ledger_index || 0) || null };
  }

  function nodesOf(meta) {
    var list = meta && Array.isArray(meta.AffectedNodes) ? meta.AffectedNodes : [];
    var out = [];
    list.forEach(function (n) {
      if (!n || typeof n !== 'object') return;
      var kind = n.CreatedNode ? 'created' : n.ModifiedNode ? 'modified' : n.DeletedNode ? 'deleted' : null;
      if (!kind) return;
      var body = n.CreatedNode || n.ModifiedNode || n.DeletedNode;
      out.push({ kind: kind, type: body.LedgerEntryType,
        final: body.FinalFields || body.NewFields || {}, prev: body.PreviousFields || {} });
    });
    return out;
  }

  // Every balance that moved: [{account, currency, issuer, value}] where
  // value is the change for that account. A trust line is reported once,
  // for the holder, with the token's issuer.
  function balanceChanges(meta) {
    var out = [];
    nodesOf(meta).forEach(function (n) {
      if (n.type === 'AccountRoot') {
        var acct = n.final.Account;
        if (!isAddress(acct)) return;
        var before = n.kind === 'created' ? '0' : n.prev.Balance;
        var after = n.kind === 'deleted' ? (n.final.Balance || '0') : n.final.Balance;
        if (before == null || after == null) return;
        var d;
        try { d = BigInt(String(after)) - BigInt(String(before)); } catch (_) { return; }
        if (d === 0n) return;
        out.push({ account: acct, currency: 'XRP', issuer: null, value: dropsToXrpNumber(d) });
      } else if (n.type === 'RippleState') {
        var fb = n.final.Balance, pb = n.prev.Balance;
        var lo = n.final.LowLimit && n.final.LowLimit.issuer;
        var hi = n.final.HighLimit && n.final.HighLimit.issuer;
        if (!isAddress(lo) || !isAddress(hi) || !fb) return;
        var cur = fb.currency;
        var after2 = Number(fb.value) || 0;
        var before2 = n.kind === 'created' ? 0 : pb ? (Number(pb.value) || 0) : after2;
        if (n.kind === 'deleted') before2 = pb ? (Number(pb.value) || 0) : after2;
        if (after2 === before2) return;
        // Positive balance: the low side holds tokens the high side issued.
        var ref = after2 !== 0 ? after2 : before2;
        var lowHolds = ref > 0;
        out.push({ account: lowHolds ? lo : hi, currency: cur, issuer: lowHolds ? hi : lo,
          value: lowHolds ? after2 - before2 : before2 - after2 });
      } else if (n.type === 'MPToken') {
        var holder = n.final.Account;
        if (!isAddress(holder)) return;
        var a = Number(n.final.MPTAmount || 0), b = n.kind === 'created' ? 0 : Number(n.prev.MPTAmount != null ? n.prev.MPTAmount : (n.final.MPTAmount || 0));
        if (a === b) return;
        out.push({ account: holder, currency: 'MPT', issuer: null, value: a - b, mpt: n.final.MPTokenIssuanceID || null });
      }
    });
    return out;
  }

  function changesFor(changes, account, fee) {
    return changes.filter(function (c) { return c.account === account; }).map(function (c) {
      // The sender's XRP change includes the fee; take it out so a swap
      // reads as the swap.
      if (c.currency === 'XRP' && fee) {
        var v = c.value + fee;
        return { account: c.account, currency: c.currency, issuer: c.issuer, value: Math.abs(v) < 1e-9 ? 0 : v };
      }
      return c;
    }).filter(function (c) { return c.value !== 0; });
  }

  function amt(a) { return { amt: formatAmount(a, { abs: true }) }; }
  function who(a) { return isAddress(a) ? { addr: a } : 'another wallet'; }

  function deliveredOf(tx, meta) {
    if (meta && meta.delivered_amount != null && meta.delivered_amount !== 'unavailable') return meta.delivered_amount;
    if (meta && meta.DeliveredAmount != null) return meta.DeliveredAmount;
    return tx.DeliverMax != null ? tx.DeliverMax : tx.Amount;
  }

  function gaveGot(list) {
    var gave = list.filter(function (c) { return c.value < 0; });
    var got = list.filter(function (c) { return c.value > 0; });
    return { gave: gave, got: got };
  }

  function joinAmounts(list) {
    var parts = [];
    list.forEach(function (c, i) {
      if (i > 0) parts.push(i === list.length - 1 ? ' and ' : ', ');
      parts.push(amt(c));
    });
    return parts;
  }

  // One sentence about one transaction, from the point of view of `me` (the
  // wallet being followed). Without `me` it reads from the sender's side.
  function describe(entry, me) {
    var tx = entry.tx, meta = entry.meta;
    var type = String(tx.TransactionType || 'Unknown');
    var S = tx.Account, D = tx.Destination;
    var view = isAddress(me) ? me : S;
    var mine = view === S;
    var fee = mine ? dropsToXrpNumber(tx.Fee || 0) : 0;
    var changes = balanceChanges(meta);
    var myChanges = changesFor(changes, view, fee);
    var p;

    switch (type) {
      case 'Payment': {
        var del = readAmount(deliveredOf(tx, meta));
        var sendMax = readAmount(tx.SendMax);
        if (S === D) {
          var gg = gaveGot(myChanges);
          if (gg.gave.length && gg.got.length) {
            p = ['Swapped '].concat(joinAmounts(gg.gave), [' for '], joinAmounts(gg.got));
          } else {
            p = ['Paid itself ', amt(del)];
          }
          if (!mine) {
            var theirs = gaveGot(changesFor(changes, S, dropsToXrpNumber(tx.Fee || 0)));
            p = theirs.gave.length && theirs.got.length
              ? [who(S), ' swapped '].concat(joinAmounts(theirs.gave), [' for '], joinAmounts(theirs.got), [', passing through this wallet'])
              : [who(S), ' swapped with itself, passing through this wallet'];
          }
        } else if (del && del.issuer && del.issuer === S) {
          p = mine ? ['Issued ', amt(del), ' to ', who(D)] : ['Received ', amt(del), ', newly issued by ', who(S)];
        } else if (del && del.issuer && del.issuer === D) {
          p = mine ? ['Sent ', amt(del), ' back to its issuer ', who(D)] : ['Got back ', amt(del), ' it had issued, from ', who(S)];
        } else if (view === D) {
          p = ['Received ', amt(del), ' from ', who(S)];
        } else if (mine) {
          p = ['Sent ', amt(del), ' to ', who(D)];
          if (sendMax && del && sendMax.currency !== del.currency) {
            var spent = gaveGot(myChanges).gave;
            if (spent.length) p = p.concat([', paid for with '], joinAmounts(spent));
          }
        } else {
          p = [who(S), ' paid ', amt(del), ' to ', who(D), ' through this wallet'];
        }
        if (tx.Flags && (Number(tx.Flags) & 0x00020000)) p.push(' (partial payment)');
        break;
      }
      case 'OfferCreate': {
        var g2 = gaveGot(myChanges);
        if (mine) {
          p = ['Offered ', amt(tx.TakerGets), ' for ', amt(tx.TakerPays), ' on the exchange'];
          if (g2.gave.length && g2.got.length) p = p.concat(['; traded '], joinAmounts(g2.gave), [' for '], joinAmounts(g2.got));
        } else if (g2.gave.length && g2.got.length) {
          p = ['Traded '].concat(joinAmounts(g2.gave), [' for '], joinAmounts(g2.got), [' with ', who(S)]);
        } else {
          p = [who(S), ' placed an exchange order that touched this wallet'];
        }
        break;
      }
      case 'OfferCancel': p = ['Cancelled an exchange order']; break;
      case 'TrustSet': {
        var lim = tx.LimitAmount || {};
        var name = currencyName(lim.currency);
        var removing = String(lim.value) === '0';
        if (view === lim.issuer && !mine) {
          p = [who(S), removing ? ' stopped holding ' : ' set up to hold ', name, ' from this wallet'];
        } else {
          p = [removing ? 'Removed its line for ' : 'Set up to hold ', name, ' from ', who(lim.issuer)];
        }
        break;
      }
      case 'AccountSet': {
        var dom = tx.Domain != null ? hexToText(tx.Domain, 80) : null;
        p = dom ? ['Set its website to ', { text: dom }] : ['Changed its account settings'];
        break;
      }
      case 'AccountDelete': p = mine ? ['Closed its account and sent what was left to ', who(D)] : ['Received what was left when ', who(S), ' closed its account']; break;
      case 'SetRegularKey': p = [tx.RegularKey ? 'Set a second signing key' : 'Removed its second signing key']; break;
      case 'SignerListSet': p = ['Set up shared control over the wallet (multi-signing)']; break;
      case 'EscrowCreate': p = mine ? ['Locked ', amt(tx.Amount), ' in escrow for ', who(D)] : [who(S), ' locked ', amt(tx.Amount), ' in escrow for this wallet']; break;
      case 'EscrowFinish': p = ['Released an escrow']; if (myChanges.length && myChanges[0].value > 0) p = ['Received ', amt(myChanges[0]), ' from an escrow']; break;
      case 'EscrowCancel': p = ['Cancelled an escrow']; break;
      case 'CheckCreate': p = mine ? ['Wrote a check for up to ', amt(tx.SendMax), ' to ', who(D)] : [who(S), ' wrote this wallet a check for up to ', amt(tx.SendMax)]; break;
      case 'CheckCash': p = ['Cashed a check']; break;
      case 'CheckCancel': p = ['Cancelled a check']; break;
      case 'PaymentChannelCreate': p = mine ? ['Opened a payment channel to ', who(D), ' with ', amt(tx.Amount)] : [who(S), ' opened a payment channel to this wallet']; break;
      case 'PaymentChannelFund': p = ['Added ', amt(tx.Amount), ' to a payment channel']; break;
      case 'PaymentChannelClaim': p = ['Claimed from a payment channel']; break;
      case 'NFTokenMint': p = ['Created an NFT']; break;
      case 'NFTokenBurn': p = ['Destroyed an NFT']; break;
      case 'NFTokenCreateOffer': p = [(Number(tx.Flags) & 1) ? 'Put an NFT up for sale' : 'Made an offer on an NFT']; break;
      case 'NFTokenCancelOffer': p = ['Cancelled an NFT offer']; break;
      case 'NFTokenAcceptOffer': p = ['Completed an NFT trade']; break;
      case 'AMMCreate': p = ['Created a trading pool for ', amt(tx.Amount), ' and ', amt(tx.Amount2)]; break;
      case 'AMMDeposit': p = ['Added money to a trading pool']; break;
      case 'AMMWithdraw': p = ['Took money out of a trading pool']; break;
      case 'AMMVote': p = ['Voted on a trading pool fee']; break;
      case 'AMMBid': p = ['Bid for a trading pool discount slot']; break;
      case 'AMMDelete': p = ['Closed an empty trading pool']; break;
      case 'Clawback': {
        var cb = readAmount(tx.Amount);
        p = ['Took back ', amt(tx.Amount), ' it had issued'];
        if (cb && isAddress(cb.issuer)) p = p.concat([' from ', who(cb.issuer)]);
        break;
      }
      case 'DepositPreauth':
        p = tx.Authorize ? ['Allowed ', who(tx.Authorize), ' to send it money'] : tx.Unauthorize ? ['Stopped allowing ', who(tx.Unauthorize), ' to send it money'] : ['Changed who may send it money'];
        break;
      case 'TicketCreate': p = ['Reserved transaction slots for later']; break;
      case 'MPTokenIssuanceCreate': p = ['Created a new token (MPT)']; break;
      case 'MPTokenIssuanceSet': p = ['Changed settings on a token it issued (MPT)']; break;
      case 'MPTokenIssuanceDestroy': p = ['Retired a token it issued (MPT)']; break;
      case 'MPTokenAuthorize': p = ['Opted in to hold a token (MPT)']; break;
      case 'CredentialCreate': p = ['Issued a credential to ', who(tx.Subject)]; break;
      case 'CredentialAccept': p = ['Accepted a credential from ', who(tx.Issuer)]; break;
      case 'CredentialDelete': p = ['Removed a credential']; break;
      case 'PermissionedDomainSet': p = ['Set up a permissioned domain']; break;
      case 'PermissionedDomainDelete': p = ['Removed a permissioned domain']; break;
      case 'DIDSet': p = ['Updated its on-chain ID']; break;
      case 'DIDDelete': p = ['Removed its on-chain ID']; break;
      case 'OracleSet': p = ['Posted price data']; break;
      case 'OracleDelete': p = ['Removed a price feed']; break;
      case 'Batch': p = ['Sent a batch of transactions']; break;
      case 'DelegateSet': p = ['Let ', who(tx.Authorize), ' act for it']; break;
      default: p = ['Sent a ', type.replace(/[^A-Za-z0-9]/g, '').slice(0, 40), ' transaction'];
    }
    var result = meta && typeof meta.TransactionResult === 'string' ? meta.TransactionResult : null;
    var ok = !result || result === 'tesSUCCESS';
    if (!ok) p = ['Tried and failed: '].concat(p);
    return { parts: p, ok: ok, result: result, type: type };
  }

  // Wallets this one dealt with across loaded activity, busiest first.
  function counterparties(entries, me) {
    var map = {};
    function bump(addr, field, v) {
      if (!isAddress(addr) || addr === me) return;
      var r = map[addr] || (map[addr] = { address: addr, count: 0, xrpIn: 0, xrpOut: 0, _seen: null });
      if (field === 'count') r.count += 1; else r[field] += v;
    }
    entries.forEach(function (e) {
      var tx = e.tx;
      var seen = {};
      var touch = function (a) { if (isAddress(a) && a !== me && !seen[a]) { seen[a] = 1; bump(a, 'count'); } };
      if (tx.Account !== me) touch(tx.Account);
      if (tx.Destination && tx.Destination !== me && tx.Account === me) touch(tx.Destination);
      if (tx.TransactionType === 'Payment' && (!e.meta || e.meta.TransactionResult === 'tesSUCCESS')) {
        var del = readAmount(deliveredOf(tx, e.meta));
        if (del && del.currency === 'XRP') {
          if (tx.Account === me && tx.Destination !== me) bump(tx.Destination, 'xrpOut', del.value);
          if (tx.Destination === me && tx.Account !== me) bump(tx.Account, 'xrpIn', del.value);
        }
      }
    });
    return Object.keys(map).map(function (k) { var r = map[k]; delete r._seen; return r; })
      .sort(function (a, b) { return b.count - a.count || (b.xrpIn + b.xrpOut) - (a.xrpIn + a.xrpOut); });
  }

  // From an account's first transaction: which wallet created it, and how.
  function fundingOf(firstEntry, address) {
    if (!firstEntry) return null;
    var created = nodesOf(firstEntry.meta).some(function (n) {
      return n.kind === 'created' && n.type === 'AccountRoot' && n.final.Account === address;
    });
    if (!created) return null;
    var tx = firstEntry.tx;
    var mine = changesFor(balanceChanges(firstEntry.meta), address, 0);
    var xrp = mine.filter(function (c) { return c.currency === 'XRP'; })[0];
    return {
      by: isAddress(tx.Account) && tx.Account !== address ? tx.Account : null,
      how: tx.TransactionType === 'AMMCreate' ? 'pool' : 'payment',
      xrp: xrp ? xrp.value : null,
      date: firstEntry.date,
      hash: firstEntry.hash,
    };
  }

  function flagWords(accountData, accountFlags) {
    var out = [];
    var bits = Number(accountData && accountData.Flags) >>> 0;
    FLAG_WORDS.forEach(function (f) {
      var on = accountFlags && typeof accountFlags[f[1]] === 'boolean' ? accountFlags[f[1]] : ((bits & f[0]) >>> 0) !== 0;
      if (on) out.push(f[2]);
    });
    return out;
  }

  function memos(tx) {
    var list = Array.isArray(tx && tx.Memos) ? tx.Memos : [];
    var out = [];
    list.slice(0, 5).forEach(function (m) {
      var memo = m && m.Memo;
      if (!memo) return;
      var text = hexToText(memo.MemoData, 300);
      if (text) out.push(text);
    });
    return out;
  }

  // Every wallet a list of sentences or changes mentions, for the name lookup.
  function addressesIn(entries, me) {
    var set = {};
    entries.forEach(function (e) {
      [e.tx.Account, e.tx.Destination].forEach(function (a) { if (isAddress(a) && a !== me) set[a] = 1; });
      balanceChanges(e.meta).forEach(function (c) {
        if (isAddress(c.account) && c.account !== me) set[c.account] = 1;
        if (isAddress(c.issuer) && c.issuer !== me) set[c.issuer] = 1;
      });
    });
    return Object.keys(set);
  }

  var api = {
    parseInput: parseInput, isAddress: isAddress, shortAddr: shortAddr, hexToText: hexToText,
    currencyName: currencyName, readAmount: readAmount, formatAmount: formatAmount,
    dropsToXrpNumber: dropsToXrpNumber, rippleTimeToDate: rippleTimeToDate,
    normalizeEntry: normalizeEntry, balanceChanges: balanceChanges, describe: describe,
    counterparties: counterparties, fundingOf: fundingOf, flagWords: flagWords, memos: memos,
    addressesIn: addressesIn, trimNumber: trimNumber,
  };
  root.FollowCore = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
