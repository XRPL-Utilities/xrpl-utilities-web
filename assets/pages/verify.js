/* Verify page: rebuilds a day's Verified Record root in the browser and
 * compares it with the memo written to the XRP Ledger. Every value from the
 * network is untrusted: it is validated, and only ever reaches the page as
 * textContent or as an attribute built from a checked pattern. */
(function () {
  "use strict";
  var PROOF = "https://sentinel.xrpl-utilities.io/proof";
  var LEDGER_TX = "https://api.xrpscan.com/api/v1/tx/";
  var EXPLORER_TX = "https://xrpscan.com/tx/";
  var ACCOUNT = "rwty5XRq5zrqTZ7XMLgk3EqQ76V3SY8Gwy";
  var MEMO_TYPE = "xrpl-utilities/verified-record";
  var DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  var NAME_RE = /^[a-z0-9][a-z0-9-]{0,62}$/;
  var HEX128 = /^[0-9a-f]{128}$/;
  var TXHASH = /^[0-9A-F]{64}$/;

  var $ = function (id) { return document.getElementById(id); };
  var daySel = $("vr-day"), runBtn = $("vr-run"), steps = $("vr-steps"),
      summary = $("vr-summary"), tbody = $("vr-records"), release = $("vr-release"),
      fileIn = $("vr-file"), fileOut = $("vr-file-result");
  var current = null;

  function hexOf(u8) {
    var s = "";
    for (var i = 0; i < u8.length; i++) s += (u8[i] < 16 ? "0" : "") + u8[i].toString(16);
    return s;
  }
  function fromHex(h) {
    var out = new Uint8Array(h.length / 2);
    for (var i = 0; i < out.length; i++) out[i] = parseInt(h.substr(2 * i, 2), 16);
    return out;
  }
  function concat(prefix, a, b) {
    var out = new Uint8Array(1 + a.length + (b ? b.length : 0));
    out[0] = prefix; out.set(a, 1); if (b) out.set(b, 1 + a.length);
    return out;
  }
  function leafHash(bytes) { return window.sha3_512(concat(0, bytes)); }
  function merkleRoot(leaves) {
    var level = leaves.slice();
    if (!level.length) return null;
    while (level.length > 1) {
      var next = [];
      for (var i = 0; i + 1 < level.length; i += 2) next.push(window.sha3_512(concat(1, level[i], level[i + 1])));
      if (level.length % 2) next.push(level[level.length - 1]);
      level = next;
    }
    return level[0];
  }

  function getJSON(url) {
    return fetch(url, { headers: { Accept: "application/json" }, credentials: "omit" })
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); });
  }

  function step(state, text) {
    var li = document.createElement("li");
    li.className = state === "pass" ? "step-pass" : state === "fail" ? "step-fail" : "step-wait";
    li.textContent = (state === "pass" ? "✓ " : state === "fail" ? "✗ " : "… ") + text;
    steps.appendChild(li);
    return li;
  }
  function settle(li, ok, text) {
    li.className = ok ? "step-pass" : "step-fail";
    li.textContent = (ok ? "✓ " : "✗ ") + text;
  }
  function link(href, text) {
    var a = document.createElement("a");
    a.href = href; a.textContent = text; a.target = "_blank"; a.rel = "noopener noreferrer";
    a.className = "underline hover:text-white";
    return a;
  }

  function decodeMaybeHex(s) {
    if (typeof s !== "string") return null;
    if (/^([0-9A-Fa-f]{2})+$/.test(s)) {
      try { return new TextDecoder("utf-8", { fatal: true }).decode(fromHex(s.toLowerCase())); }
      catch (e) { return s; }
    }
    return s;
  }
  function ledgerMemo(tx) {
    var memos = (tx && tx.Memos) || [];
    for (var i = 0; i < memos.length; i++) {
      var m = (memos[i] && memos[i].Memo) || {};
      if (decodeMaybeHex(m.MemoType) !== MEMO_TYPE) continue;
      try { return JSON.parse(decodeMaybeHex(m.MemoData)); } catch (e) { return null; }
    }
    return null;
  }

  function renderRecords(day) {
    tbody.textContent = "";
    var released = day.records_released === true;
    release.textContent = released
      ? "The saved figures for this day are open. Download any record and check it above."
      : "The saved figures for this day open on " + day.release_date + ". Until then the fingerprints are public and the figures are not.";
    day.records.forEach(function (e) {
      var tr = document.createElement("tr");
      tr.className = "border-b border-border/50";
      var td1 = document.createElement("td"); td1.className = "py-2 pr-3 mono";
      if (released) td1.appendChild(link(PROOF + "/" + day.date + "/records/" + e.name, e.name));
      else td1.textContent = e.name;
      var td2 = document.createElement("td"); td2.className = "py-2 pr-3";
      td2.textContent = e.status === "ok" ? "yes" : "could not be read";
      var td3 = document.createElement("td"); td3.className = "py-2 mono hash text-muted text-xs";
      td3.textContent = e.leaf_sha3_512;
      tr.appendChild(td1); tr.appendChild(td2); tr.appendChild(td3);
      tbody.appendChild(tr);
    });
  }

  function validDay(day, date) {
    if (!day || day.date !== date || !Array.isArray(day.records) || !HEX128.test(day.root || "")) return false;
    var names = day.records.map(function (e) { return e && e.name; });
    var sorted = names.slice().sort();
    for (var i = 0; i < day.records.length; i++) {
      var e = day.records[i];
      if (!NAME_RE.test(e.name || "") || !HEX128.test(e.leaf_sha3_512 || "") || names[i] !== sorted[i]) return false;
    }
    return DATE_RE.test(day.release_date || "");
  }

  function run() {
    var date = daySel.value;
    if (!DATE_RE.test(date)) return;
    steps.textContent = ""; summary.textContent = ""; current = null;
    fileIn.disabled = true; fileOut.textContent = "";
    runBtn.disabled = true;
    var s1 = step("wait", "Reading the day's fingerprints");
    getJSON(PROOF + "/" + date).then(function (day) {
      if (!validDay(day, date)) throw new Error("malformed");
      var root = merkleRoot(day.records.map(function (e) { return fromHex(e.leaf_sha3_512); }));
      var rootHex = root ? hexOf(root) : null;
      var ok1 = rootHex === day.root;
      settle(s1, ok1, day.records.length + " fingerprints rebuild the published root " + String(rootHex).slice(0, 16) + "…");
      current = day; renderRecords(day); fileIn.disabled = false;
      var a = day.anchor || {};
      if (!TXHASH.test(a.tx_hash || "")) {
        step("fail", "No ledger transaction is recorded for this day yet.");
        summary.textContent = "Not verified";
        return;
      }
      var s2 = step("wait", "Reading the transaction from the XRP Ledger");
      return getJSON(LEDGER_TX + a.tx_hash).then(function (tx) {
        var memo = ledgerMemo(tx);
        var good = tx && tx.Account === ACCOUNT && tx.TransactionType === "AccountSet" &&
          tx.meta && tx.meta.TransactionResult === "tesSUCCESS" &&
          memo && memo.date === date && memo.root === rootHex;
        settle(s2, !!good, good
          ? "The XRP Ledger holds the same root, written by " + ACCOUNT.slice(0, 8) + "… in ledger " + tx.ledger_index + "."
          : "The ledger transaction does not match this day's root.");
        var li = document.createElement("li");
        li.className = "text-muted";
        li.appendChild(link(EXPLORER_TX + a.tx_hash, "View the transaction"));
        steps.appendChild(li);
        summary.textContent = ok1 && good ? "Verified" : "Not verified";
        summary.className = "text-lg font-semibold " + (ok1 && good ? "step-pass" : "step-fail");
      }, function () {
        settle(s2, false, "Could not read the ledger transaction right now. Try again shortly.");
        summary.textContent = "Not checked";
      });
    }).catch(function () {
      settle(s1, false, "Could not read this day's fingerprints.");
      summary.textContent = "Not checked";
    }).then(function () { runBtn.disabled = false; });
  }

  fileIn.addEventListener("change", function () {
    var f = fileIn.files && fileIn.files[0];
    fileOut.textContent = ""; fileOut.className = "text-sm";
    if (!f || !current) return;
    if (f.size > 16 * 1024 * 1024) { fileOut.textContent = "That file is too large to be a record."; return; }
    fileOut.textContent = "Hashing…";
    f.arrayBuffer().then(function (buf) {
      var leaf = hexOf(leafHash(new Uint8Array(buf)));
      var hit = current.records.filter(function (e) { return e.leaf_sha3_512 === leaf; })[0];
      fileOut.className = "text-sm " + (hit ? "step-pass" : "step-fail");
      fileOut.textContent = hit
        ? "✓ Matches record " + hit.name + " for " + current.date + ", byte for byte."
        : "✗ This file does not match any record for " + current.date + ".";
    });
  });

  runBtn.addEventListener("click", run);
  getJSON(PROOF).then(function (j) {
    var days = (j && Array.isArray(j.days) ? j.days : []).filter(function (d) { return d && DATE_RE.test(d.date || ""); });
    daySel.textContent = "";
    if (!days.length) {
      var o = document.createElement("option"); o.textContent = "No days yet"; daySel.appendChild(o);
      return;
    }
    days.forEach(function (d) {
      var o = document.createElement("option"); o.value = d.date; o.textContent = d.date; daySel.appendChild(o);
    });
    daySel.disabled = false; runBtn.disabled = false;
  }).catch(function () {
    daySel.textContent = "";
    var o = document.createElement("option"); o.textContent = "Could not load days"; daySel.appendChild(o);
  });
})();
