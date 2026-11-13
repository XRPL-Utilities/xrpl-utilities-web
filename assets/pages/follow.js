/* /follow/: look up any XRP Ledger wallet or transaction and follow it.
 *
 * The visitor's browser reads the public XRP Ledger directly (Ripple's
 * public servers, then a backup), so the page costs nothing to run and puts
 * no load on our services. The one call to our side is the names lookup on
 * XR-Pulse, which names public exchanges and known organizations and is
 * allowed for this site's visitors only.
 *
 * Ledger text is attacker-written. Everything reaches the page through
 * textContent or a DOM attribute set from a validated address; no
 * innerHTML anywhere in this file (tests/follow_test.mjs checks).
 */
(function () {
  'use strict';

  var C = window.FollowCore;
  var NODES = ['wss://s1.ripple.com/', 'wss://s2.ripple.com/', 'wss://xrplcluster.com/'];
  var NAMES_URL = 'https://pulse.xrpl-utilities.io/names/lookup';
  var REQUEST_TIMEOUT_MS = 15000;
  var PAGE_SIZE = 25;
  var CALL_BUDGET = 60;          // ledger calls per wallet view, older pages included
  var FUNDING_CHECKS = 6;        // top counterparties checked for "funded by this wallet"
  var NAME_BATCH = 40;

  // ---- ledger connection --------------------------------------------------
  var ws = null, wsReady = null, nodeIndex = 0, nextId = 1, pending = {};
  var callsLeft = CALL_BUDGET;

  function failAll(err) {
    Object.keys(pending).forEach(function (id) {
      var p = pending[id];
      delete pending[id];
      clearTimeout(p.timer);
      p.reject(err);
    });
  }

  function connect() {
    if (wsReady) return wsReady;
    wsReady = new Promise(function (resolve, reject) {
      var tried = 0;
      function attempt() {
        if (tried >= NODES.length) { wsReady = null; reject(new Error('no_ledger_connection')); return; }
        tried += 1;
        var url = NODES[nodeIndex % NODES.length];
        var sock;
        try { sock = new WebSocket(url); } catch (_) { nodeIndex += 1; attempt(); return; }
        var opened = false;
        var t = setTimeout(function () { if (!opened) { try { sock.close(); } catch (_) {} } }, 8000);
        sock.onopen = function () { opened = true; clearTimeout(t); ws = sock; resolve(sock); };
        sock.onmessage = function (ev) {
          var msg;
          try { msg = JSON.parse(ev.data); } catch (_) { return; }
          var p = msg && pending[msg.id];
          if (!p) return;
          delete pending[msg.id];
          clearTimeout(p.timer);
          if (msg.status === 'success' && msg.result) p.resolve(msg.result);
          else p.reject(Object.assign(new Error('ledger_error'), { code: (msg.error || (msg.result && msg.result.error) || 'error') }));
        };
        sock.onclose = function () {
          clearTimeout(t);
          if (!opened) { nodeIndex += 1; attempt(); return; }
          if (ws === sock) { ws = null; wsReady = null; nodeIndex += 1; }
          failAll(new Error('connection_closed'));
        };
        sock.onerror = function () { /* onclose follows */ };
      }
      attempt();
    });
    return wsReady;
  }

  function call(req) {
    if (callsLeft <= 0) return Promise.reject(Object.assign(new Error('budget'), { code: 'budget' }));
    callsLeft -= 1;
    return connect().then(function (sock) {
      return new Promise(function (resolve, reject) {
        var id = nextId++;
        var body = Object.assign({ id: id }, req);
        pending[id] = { resolve: resolve, reject: reject, timer: setTimeout(function () {
          if (pending[id]) { delete pending[id]; reject(Object.assign(new Error('timeout'), { code: 'timeout' })); }
        }, REQUEST_TIMEOUT_MS) };
        try { sock.send(JSON.stringify(body)); } catch (e) { delete pending[id]; reject(e); }
      });
    });
  }

  // ---- names ----------------------------------------------------------------
  var names = {};          // address -> {name, kind}
  var namesAsked = {};

  function lookupNames(addrs) {
    var want = addrs.filter(function (a) { return C.isAddress(a) && !namesAsked[a]; }).slice(0, NAME_BATCH);
    if (!want.length) return Promise.resolve();
    want.forEach(function (a) { namesAsked[a] = 1; });
    var lib = window.PreviewToken;
    if (!lib || typeof lib.authHeaders !== 'function') return Promise.resolve();
    return lib.authHeaders().then(function (h) {
      if (!h || !h.Authorization) return null;
      return fetch(NAMES_URL + '?addresses=' + encodeURIComponent(want.join(',')), { headers: h });
    }).then(function (r) {
      if (!r || !r.ok) return null;
      return r.json();
    }).then(function (body) {
      var got = body && body.names && typeof body.names === 'object' ? body.names : {};
      Object.keys(got).forEach(function (a) {
        var n = got[a];
        if (!C.isAddress(a) || !n || typeof n.name !== 'string') return;
        names[a] = { name: n.name.slice(0, 60), kind: typeof n.kind === 'string' ? n.kind.slice(0, 30) : '' };
      });
      refreshNameChips();
    }).catch(function () { /* names are a nice-to-have */ });
  }

  // ---- DOM helpers ------------------------------------------------------------
  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function clear(node) { while (node && node.firstChild) node.removeChild(node.firstChild); }
  function fmtDate(d) {
    if (!d || isNaN(d.getTime())) return '';
    return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  }

  var chipNodes = [];
  function addrLink(addr, opts) {
    if (!C.isAddress(addr)) return el('span', 'text-muted', 'another wallet');
    var a = el('a', 'follow-addr');
    a.href = '/follow/?a=' + addr;
    a.dataset.addr = addr;
    a.title = addr;
    a.addEventListener('click', function (ev) {
      if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.button === 1) return;
      ev.preventDefault();
      go({ kind: 'account', value: addr }, true);
    });
    paintChip(a, opts && opts.full);
    chipNodes.push(a);
    return a;
  }
  function paintChip(a, full) {
    var addr = a.dataset.addr;
    var n = names[addr];
    clear(a);
    if (n) {
      a.appendChild(el('span', 'follow-name', n.name));
      if (n.kind) a.appendChild(el('span', 'follow-kind', n.kind));
    } else {
      a.appendChild(el('span', 'font-mono', full ? addr : C.shortAddr(addr)));
    }
  }
  function refreshNameChips() {
    chipNodes = chipNodes.filter(function (a) { return a.isConnected; });
    chipNodes.forEach(function (a) { paintChip(a, a.classList.contains('follow-addr-full')); });
  }

  function renderParts(parts) {
    var frag = document.createDocumentFragment();
    parts.forEach(function (p) {
      if (typeof p === 'string') frag.appendChild(document.createTextNode(p));
      else if (p && p.addr) frag.appendChild(addrLink(p.addr));
      else if (p && p.amt != null) frag.appendChild(el('strong', 'text-white tabular-nums', p.amt));
      else if (p && p.text != null) frag.appendChild(el('span', 'text-white', p.text));
    });
    return frag;
  }

  function setStatus(text, isError) {
    var s = $('follow-status');
    s.textContent = text || '';
    s.className = 'text-sm mt-3 ' + (isError ? 'text-red-400' : 'text-muted');
  }

  function tile(label, value, sub) {
    var t = el('div', 'stat-tile p-5');
    t.appendChild(el('div', 'stat-tile-label mb-2', label));
    var v = el('div', 'stat-tile-value tabular-nums');
    if (typeof value === 'string') v.textContent = value; else v.appendChild(value);
    t.appendChild(v);
    if (sub) {
      var s = el('div', 'stat-tile-sub mt-1');
      if (typeof sub === 'string') s.textContent = sub; else s.appendChild(sub);
      t.appendChild(s);
    }
    return t;
  }

  function section(title, note) {
    var s = el('section', 'follow-card bg-panel border border-border rounded-2xl p-5 sm:p-6 mb-4');
    s.appendChild(el('h2', 'text-lg font-semibold mb-1', title));
    if (note) s.appendChild(el('p', 'text-sm text-muted mb-4', note));
    return s;
  }

  // ---- trail ------------------------------------------------------------------
  var trail = [];
  function pushTrail(item) {
    var last = trail[trail.length - 1];
    if (last && last.kind === item.kind && last.value === item.value) return;
    var at = -1;
    trail.forEach(function (t, i) { if (t.kind === item.kind && t.value === item.value) at = i; });
    if (at >= 0) trail = trail.slice(0, at + 1); else trail.push(item);
    if (trail.length > 12) trail = trail.slice(-12);
    renderTrail();
  }
  function renderTrail() {
    var box = $('follow-trail');
    clear(box);
    if (trail.length < 2) { box.hidden = true; return; }
    box.hidden = false;
    box.appendChild(el('span', 'text-muted mr-2', 'Your path:'));
    trail.forEach(function (t, i) {
      if (i) box.appendChild(el('span', 'text-muted mx-1', '→'));
      if (t.kind === 'account') box.appendChild(addrLink(t.value));
      else {
        var b = el('a', 'follow-addr font-mono', 'tx ' + t.value.slice(0, 6) + '…');
        b.href = '/follow/?tx=' + t.value;
        b.addEventListener('click', function (ev) { ev.preventDefault(); go(t, true); });
        box.appendChild(b);
      }
    });
  }

  // ---- account view ------------------------------------------------------------
  var current = null;   // {kind, value, marker, entries}
  var seq = 0;          // drops answers from a view the visitor already left

  function friendlyError(err) {
    var code = err && err.code;
    if (code === 'budget') return 'That is as far back as this page goes in one visit. Refresh to start again.';
    if (code === 'timeout' || (err && err.message === 'no_ledger_connection') || (err && err.message === 'connection_closed')) {
      return 'The XRP Ledger servers are busy right now. Try again in a minute.';
    }
    if (code === 'txnNotFound') return 'No transaction with that ID was found on the XRP Ledger.';
    return 'Something went wrong reading the XRP Ledger. Try again in a minute.';
  }

  function showAccount(address) {
    var my = ++seq;
    callsLeft = CALL_BUDGET;
    current = { kind: 'account', value: address, marker: null, entries: [] };
    var out = $('follow-results');
    clear(out);
    setStatus('Reading the XRP Ledger…');

    var info = call({ command: 'account_info', account: address, ledger_index: 'validated' })
      .catch(function (e) { if (e && e.code === 'actNotFound') return null; throw e; });
    var first = call({ command: 'account_tx', account: address, forward: true, limit: 1 })
      .catch(function () { return null; });
    var recent = call({ command: 'account_tx', account: address, limit: PAGE_SIZE });

    Promise.all([info, first, recent]).then(function (r) {
      if (my !== seq) return;
      var acct = r[0], firstRes = r[1], recentRes = r[2];
      var firstEntry = firstRes && firstRes.transactions && firstRes.transactions[0] ? C.normalizeEntry(firstRes.transactions[0]) : null;
      var funding = C.fundingOf(firstEntry, address);
      var entries = (recentRes.transactions || []).map(C.normalizeEntry).filter(Boolean);
      current.entries = entries;
      current.marker = recentRes.marker || null;
      current.funding = funding;
      if (!acct && !entries.length) {
        setStatus('This wallet has never been used on the XRP Ledger, or the address has a typo.', true);
        return;
      }
      setStatus('');
      renderSummary(out, address, acct, funding);
      var issued = el('div'); out.appendChild(issued);
      var held = el('div'); out.appendChild(held);
      renderActivity(out, address);
      renderCounterparties(out, address);
      var toName = C.addressesIn(entries, address);
      if (funding && funding.by) toName.unshift(funding.by);
      toName.unshift(address);
      lookupNames(toName);
      loadTokens(my, address, acct, issued, held);
      checkFunding(my, address);
    }).catch(function (e) {
      if (my !== seq) return;
      setStatus(friendlyError(e), true);
    });
  }

  function renderSummary(out, address, acct, funding) {
    var head = el('div', 'mb-4');
    var line = el('div', 'flex flex-wrap items-center gap-2 mb-1');
    var self = addrLink(address, { full: true });
    self.classList.add('follow-addr-full');
    line.appendChild(self);
    head.appendChild(line);
    out.appendChild(head);

    var grid = el('div', 'grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4');
    var data = acct && acct.account_data;
    if (data) {
      grid.appendChild(tile('XRP balance', C.trimNumber(C.dropsToXrpNumber(data.Balance)), 'Total, including the part the ledger keeps in reserve'));
    } else {
      grid.appendChild(tile('XRP balance', '0', 'This account has been closed'));
    }
    if (funding && funding.date) {
      grid.appendChild(tile('Created', funding.date.toLocaleDateString(undefined, { dateStyle: 'medium' }), fmtDate(funding.date)));
    } else {
      grid.appendChild(tile('Created', 'Unknown', 'Its first record is not on the public servers'));
    }
    if (funding && funding.by) {
      var sub = document.createDocumentFragment();
      sub.appendChild(document.createTextNode(funding.how === 'pool' ? 'Created as a trading pool' : (funding.xrp != null ? 'Sent ' + C.trimNumber(funding.xrp) + ' XRP to open it' : 'Opened it')));
      var by = el('div');
      by.appendChild(addrLink(funding.by));
      grid.appendChild(tile(funding.how === 'pool' ? 'Created by' : 'First funded by', by, sub));
    } else {
      grid.appendChild(tile('First funded by', 'Unknown'));
    }
    out.appendChild(grid);

    var facts = [];
    var dom = data && data.Domain ? C.hexToText(data.Domain, 80) : null;
    if (dom) facts.push(['Says its website is ', { text: dom }, ' (the wallet set this itself; we have not checked it)']);
    C.flagWords(data, acct && acct.account_flags).forEach(function (w) { facts.push([w]); });
    if (data && Number(data.OwnerCount) > 0) facts.push(['Has ' + Number(data.OwnerCount).toLocaleString('en-US') + ' open items on the ledger (token lines, orders, offers and so on)']);
    if (facts.length) {
      var s = section('About this wallet');
      var ul = el('ul', 'space-y-2 text-sm');
      facts.forEach(function (f) { var li = el('li', 'follow-fact'); li.appendChild(renderParts(f)); ul.appendChild(li); });
      s.appendChild(ul);
      out.appendChild(s);
    }
  }

  function loadTokens(my, address, acct, issuedBox, heldBox) {
    var flags = acct && acct.account_flags;
    var bits = acct && acct.account_data ? Number(acct.account_data.Flags) >>> 0 : 0;
    var issuer = flags ? !!flags.defaultRipple : (bits & 0x00800000) !== 0;
    var jobs = [];
    if (issuer) {
      jobs.push(call({ command: 'gateway_balances', account: address, ledger_index: 'validated' }).then(function (g) {
        if (my !== seq) return;
        var ob = g && g.obligations && typeof g.obligations === 'object' ? g.obligations : {};
        var codes = Object.keys(ob).slice(0, 20);
        if (!codes.length) return;
        var s = section('Tokens it created', 'How much of each token other wallets hold right now.');
        var ul = el('ul', 'space-y-1 text-sm');
        codes.forEach(function (c) {
          ul.appendChild(el('li', '', C.trimNumber(Number(ob[c]) || 0) + ' ' + C.currencyName(c)));
        });
        s.appendChild(ul);
        issuedBox.appendChild(s);
      }).catch(function () {}));
    }
    jobs.push(call({ command: 'account_lines', account: address, ledger_index: 'validated', limit: 200 }).then(function (res) {
      if (my !== seq) return;
      var lines = (res && Array.isArray(res.lines) ? res.lines : []).filter(function (l) { return Number(l.balance) > 0; })
        .sort(function (a, b) { return Number(b.balance) - Number(a.balance); }).slice(0, 15);
      if (!lines.length) return;
      var s = section('Tokens it holds', 'Largest balances first. Token names are set by whoever created the token.');
      var ul = el('ul', 'space-y-2 text-sm');
      lines.forEach(function (l) {
        var li = el('li', 'flex flex-wrap items-center gap-x-2');
        li.appendChild(el('strong', 'text-white tabular-nums', C.trimNumber(Number(l.balance)) + ' ' + C.currencyName(l.currency)));
        if (C.isAddress(l.account)) { li.appendChild(document.createTextNode('issued by')); li.appendChild(addrLink(l.account)); }
        ul.appendChild(li);
      });
      s.appendChild(ul);
      heldBox.appendChild(s);
      lookupNames(lines.map(function (l) { return l.account; }));
    }).catch(function () {}));
    return Promise.all(jobs);
  }

  var activityList = null, moreBtn = null, cpBox = null;

  function renderActivity(out, address) {
    var s = section('What it did', 'Newest first. Times are shown in your time zone.');
    var bar = el('div', 'follow-bar');
    var refresh = el('button', 'follow-btn-ghost', 'Refresh');
    refresh.type = 'button';
    refresh.addEventListener('click', function () { showAccount(address); });
    bar.appendChild(refresh);
    s.appendChild(bar);
    activityList = el('ol', 'follow-timeline');
    s.appendChild(activityList);
    appendEntries(current.entries, address);
    moreBtn = el('button', 'follow-btn-ghost mt-4', 'Show older activity');
    moreBtn.type = 'button';
    moreBtn.hidden = !current.marker;
    moreBtn.addEventListener('click', function () { loadOlder(address); });
    s.appendChild(moreBtn);
    if (!current.entries.length) s.appendChild(el('p', 'text-sm text-muted', 'No activity found.'));
    out.appendChild(s);
  }

  function appendEntries(entries, me) {
    entries.forEach(function (e, i) {
      var d = C.describe(e, me);
      var li = el('li', 'follow-step' + (d.ok ? '' : ' follow-step-failed'));
      li.style.animationDelay = Math.min(i, 12) * 40 + 'ms';
      li.appendChild(el('div', 'follow-when', fmtDate(e.date)));
      var p = el('p', 'follow-what');
      p.appendChild(renderParts(d.parts));
      li.appendChild(p);
      if (e.hash) {
        var link = el('a', 'follow-tx', 'Details');
        link.href = '/follow/?tx=' + e.hash;
        link.addEventListener('click', function (ev) {
          if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.button === 1) return;
          ev.preventDefault();
          go({ kind: 'tx', value: e.hash }, true);
        });
        li.appendChild(link);
      }
      activityList.appendChild(li);
    });
  }

  function loadOlder(address) {
    var my = seq;
    if (!current || current.kind !== 'account' || !current.marker) return;
    moreBtn.disabled = true;
    moreBtn.textContent = 'Loading…';
    call({ command: 'account_tx', account: address, limit: PAGE_SIZE, marker: current.marker }).then(function (res) {
      if (my !== seq) return;
      var more = (res.transactions || []).map(C.normalizeEntry).filter(Boolean);
      current.entries = current.entries.concat(more);
      current.marker = res.marker || null;
      appendEntries(more, address);
      renderCounterpartyRows(address);
      lookupNames(C.addressesIn(more, address));
      moreBtn.disabled = false;
      moreBtn.textContent = 'Show older activity';
      moreBtn.hidden = !current.marker;
    }).catch(function (e) {
      if (my !== seq) return;
      moreBtn.disabled = false;
      moreBtn.textContent = 'Show older activity';
      setStatus(friendlyError(e), true);
    });
  }

  var fundedBy = {};   // counterparty -> its first funder (or null)

  function renderCounterparties(out, address) {
    var s = section('Who it dealt with most', 'Across the activity loaded above. Load older activity to look further back.');
    cpBox = el('div', 'space-y-2');
    s.appendChild(cpBox);
    out.appendChild(s);
    renderCounterpartyRows(address);
  }

  function renderCounterpartyRows(address) {
    if (!cpBox) return;
    clear(cpBox);
    var rows = C.counterparties(current.entries, address).slice(0, 10);
    if (!rows.length) { cpBox.appendChild(el('p', 'text-sm text-muted', 'Nobody yet.')); return; }
    rows.forEach(function (r) {
      var row = el('div', 'follow-cp');
      var left = el('div', 'flex flex-wrap items-center gap-2 min-w-0');
      left.appendChild(addrLink(r.address));
      var f = fundedBy[r.address];
      if (f && f === address) left.appendChild(el('span', 'follow-badge', 'First funded by this wallet'));
      if (current.funding && current.funding.by === r.address) left.appendChild(el('span', 'follow-badge', 'Funded this wallet'));
      row.appendChild(left);
      var bits = [r.count + (r.count === 1 ? ' transaction' : ' transactions')];
      if (r.xrpOut) bits.push(C.trimNumber(r.xrpOut) + ' XRP sent to it');
      if (r.xrpIn) bits.push(C.trimNumber(r.xrpIn) + ' XRP received from it');
      row.appendChild(el('div', 'text-xs text-muted', bits.join(' · ')));
      cpBox.appendChild(row);
    });
  }

  function checkFunding(my, address) {
    var rows = C.counterparties(current.entries, address).slice(0, FUNDING_CHECKS)
      .filter(function (r) { return !(r.address in fundedBy); });
    var chain = Promise.resolve();
    rows.forEach(function (r) {
      chain = chain.then(function () {
        if (my !== seq) return;
        return call({ command: 'account_tx', account: r.address, forward: true, limit: 1 }).then(function (res) {
          var e = res && res.transactions && res.transactions[0] ? C.normalizeEntry(res.transactions[0]) : null;
          var f = C.fundingOf(e, r.address);
          fundedBy[r.address] = f && f.by ? f.by : null;
        }).catch(function () { fundedBy[r.address] = null; });
      });
    });
    return chain.then(function () { if (my === seq) renderCounterpartyRows(address); });
  }

  // ---- transaction view ----------------------------------------------------------
  function showTx(hash) {
    var my = ++seq;
    callsLeft = CALL_BUDGET;
    current = { kind: 'tx', value: hash };
    var out = $('follow-results');
    clear(out);
    setStatus('Reading the XRP Ledger…');
    call({ command: 'tx', transaction: hash }).then(function (res) {
      if (my !== seq) return;
      var e = C.normalizeEntry(res);
      if (!e) { setStatus('No transaction with that ID was found on the XRP Ledger.', true); return; }
      if (!e.hash) e.hash = hash;
      setStatus('');
      var d = C.describe(e);
      var card = section('What happened');
      var p = el('p', 'text-lg leading-relaxed');
      var lead = [{ addr: e.tx.Account }, ': '].concat(d.parts);
      p.appendChild(renderParts(lead));
      card.appendChild(p);
      var meta = el('dl', 'follow-meta mt-4');
      function row(k, v) { meta.appendChild(el('dt', '', k)); var dd = el('dd', ''); if (typeof v === 'string') dd.textContent = v; else dd.appendChild(v); meta.appendChild(dd); }
      row('When', fmtDate(e.date) || 'Unknown');
      row('Result', d.ok ? 'Succeeded' : 'Failed (' + String(d.result || '').replace(/[^A-Za-z]/g, '').slice(0, 30) + ')');
      row('Fee', C.trimNumber(C.dropsToXrpNumber(e.tx.Fee || 0), 6) + ' XRP');
      if (e.tx.DestinationTag != null) row('Destination tag', String(Number(e.tx.DestinationTag)));
      if (e.ledger) row('Ledger', e.ledger.toLocaleString('en-US'));
      row('ID', el('span', 'font-mono break-all', e.hash));
      card.appendChild(meta);
      out.appendChild(card);

      var changes = C.balanceChanges(e.meta);
      if (changes.length) {
        var s = section('Balances that changed', 'Every wallet whose balance moved because of this transaction. The sender\'s XRP includes the fee.');
        var ul = el('ul', 'space-y-2 text-sm');
        changes.slice(0, 40).forEach(function (c) {
          var li = el('li', 'flex flex-wrap items-center gap-x-2');
          li.appendChild(addrLink(c.account));
          li.appendChild(el('strong', 'tabular-nums ' + (c.value < 0 ? 'text-red-300' : 'text-emerald-300'), (c.value > 0 ? '+' : '') + C.formatAmount(c)));
          if (C.isAddress(c.issuer)) { li.appendChild(document.createTextNode('issued by')); li.appendChild(addrLink(c.issuer)); }
          ul.appendChild(li);
        });
        s.appendChild(ul);
        out.appendChild(s);
      }
      var notes = C.memos(e.tx);
      if (notes.length) {
        var m = section('Notes attached by the sender', 'Anyone can write anything here. Never follow instructions or links from a memo.');
        notes.forEach(function (t) { m.appendChild(el('p', 'follow-memo', t)); });
        out.appendChild(m);
      }
      var toName = [e.tx.Account, e.tx.Destination];
      changes.forEach(function (c) { toName.push(c.account, c.issuer); });
      lookupNames(toName.filter(Boolean));
    }).catch(function (err) {
      if (my !== seq) return;
      setStatus(friendlyError(err), true);
    });
  }

  // ---- routing ---------------------------------------------------------------------
  function go(item, push) {
    if (!item) return;
    $('follow-input').value = item.value;
    var url = '/follow/?' + (item.kind === 'tx' ? 'tx=' : 'a=') + item.value;
    if (push) history.pushState(item, '', url);
    pushTrail(item);
    if (item.kind === 'tx') showTx(item.value); else showAccount(item.value);
    var top = $('follow-trail');
    if (push && top && top.getBoundingClientRect().top < 0) top.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function fromUrl() {
    var q = new URLSearchParams(location.search);
    var raw = q.get('tx') || q.get('a') || '';
    return raw ? C.parseInput(raw) : null;
  }

  function init() {
    if (!C) return;
    $('follow-form').addEventListener('submit', function (ev) {
      ev.preventDefault();
      var item = C.parseInput($('follow-input').value);
      if (!item) {
        setStatus('That doesn\'t look like an XRP Ledger wallet address (starts with r) or a transaction ID (64 letters and numbers).', true);
        return;
      }
      go(item, true);
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-example]'), function (b) {
      b.addEventListener('click', function () {
        var item = C.parseInput(b.getAttribute('data-example'));
        if (item) go(item, true);
      });
    });
    window.addEventListener('popstate', function (ev) {
      var item = ev.state && ev.state.kind ? C.parseInput(ev.state.value) : fromUrl();
      if (item) go(item, false);
    });
    var start = fromUrl();
    if (start) { history.replaceState(start, '', location.href); go(start, false); }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
