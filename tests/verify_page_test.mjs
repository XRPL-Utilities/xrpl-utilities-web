// Verify page (Verified Record phase 5). Network data must never reach the
// DOM as HTML, the checker must not name a node, and the page must load its
// own SHA3 before the page script.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (p) => fs.readFileSync(new URL("../" + p, import.meta.url), "utf8");
const js = read("assets/pages/verify.js");
const html = read("verify/index.html");
const py = read("verify/check_record.py");

test("page script never writes HTML from network data", () => {
  assert.doesNotMatch(js, /innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(|new Function/);
});

test("links built from network data use checked patterns only", () => {
  assert.match(js, /TXHASH\.test\(a\.tx_hash/);
  assert.match(js, /NAME_RE\.test\(e\.name/);
});

test("sha3 loads before the page script, no third-party script", () => {
  const a = html.indexOf("/assets/sha3-512.js"), b = html.indexOf("/assets/pages/verify.js");
  assert.ok(a > 0 && b > a);
  assert.doesNotMatch(html, /<script[^>]+src="https?:/);
});

test("only the anchor account's own AccountSet counts", () => {
  assert.match(js, /tx\.Account === ACCOUNT && tx\.TransactionType === "AccountSet"/);
  assert.match(py, /tx\.get\("Account"\) != ANCHOR_ACCOUNT or tx\.get\("TransactionType"\) != "AccountSet"/);
});

test("checker names no node and needs one chosen by the user", () => {
  assert.doesNotMatch(py, /xrplcluster|ripple\.com|quicknode/i);
  assert.match(py, /"--node", required=True/);
});

test("page states the 7-day release", () => {
  assert.match(html, /open up 7 days later/);
});
