// Verify page (Verified Record phase 5). Network data must never reach the
// DOM as HTML, the checker must not name a node, and the page must load its
// own SHA3 before the page script.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { execFileSync } from "node:child_process";

const read = (p) => fs.readFileSync(new URL("../" + p, import.meta.url), "utf8");
const js = read("assets/pages/verify.js");
const html = read("verify/index.html");

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
});

test("no downloadable script is offered (Aaron, 2026-11-03)", () => {
  assert.doesNotMatch(html, /\.py"|download>|Download the checker/);
  assert.equal(fs.existsSync(new URL("../verify/check_record.py", import.meta.url)), false);
});

test("no Python source or bytecode is tracked where the site deploys from", () => {
  // A cached .pyc of the removed checker stayed tracked and was served live
  // until 2026-11-04; nothing outside tests/ and tools/ may be Python.
  const tracked = execFileSync("git", ["ls-files"], { cwd: new URL("..", import.meta.url) })
    .toString().split("\n")
    .filter((f) => /(\.pyc?$|__pycache__\/)/.test(f) && !/^(tests|tools)\//.test(f));
  assert.deepEqual(tracked, []);
  const ignore = fs.readFileSync(new URL("../.assetsignore", import.meta.url), "utf8");
  assert.match(ignore, /^\*\.pyc$/m);
  assert.match(ignore, /^__pycache__\/$/m);
});

test("page states the 7-day release", () => {
  assert.match(html, /open up 7 days later/);
});
