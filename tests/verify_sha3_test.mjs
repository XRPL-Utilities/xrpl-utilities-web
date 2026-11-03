// The Verify page's own SHA3-512 must match Node's (OpenSSL) for every
// padding edge (rate 72 bytes) and a large record.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import crypto from "node:crypto";

const ctx = {};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(new URL("../assets/sha3-512.js", import.meta.url), "utf8"), ctx);
const hex = (u8) => Buffer.from(u8).toString("hex");

test("matches node sha3-512 across padding edges", () => {
  for (const n of [0, 1, 63, 64, 65, 70, 71, 72, 73, 129, 143, 144, 145, 1000, 4096]) {
    const b = crypto.randomBytes(n);
    assert.equal(hex(ctx.sha3_512(new Uint8Array(b))),
      crypto.createHash("sha3-512").update(b).digest("hex"), `length ${n}`);
  }
});

test("known answer for the empty string (FIPS 202)", () => {
  assert.equal(hex(ctx.sha3_512(new Uint8Array(0))),
    "a69f73cca23a9ac5c8b567dc185a756e97c982164fe25859e0d1dcc1475c80a6" +
    "15b2123af1f5f94c11e3e9402c3ac558f500199d95b6d3e301758586281dcd26");
});

test("leaf and node prefixes match the documented scheme", () => {
  const rec = Buffer.from('{"a":1}');
  const leaf = ctx.sha3_512(new Uint8Array(Buffer.concat([Buffer.from([0]), rec])));
  assert.equal(hex(leaf),
    crypto.createHash("sha3-512").update(Buffer.concat([Buffer.from([0]), rec])).digest("hex"));
});

test("rejects non-bytes input", () => {
  assert.throws(() => ctx.sha3_512("text"));
});
