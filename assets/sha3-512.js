/* SHA3-512 (FIPS 202) for the Verify page. Browsers' Web Crypto has no SHA3,
 * so this is a small, dependency-free Keccak-f[1600] using BigInt lanes.
 * Checked against Node's crypto sha3-512 in tests/verify_sha3_test.mjs.
 * Exposes window.sha3_512(Uint8Array) -> Uint8Array(64). MIT license. */
(function (root) {
  "use strict";
  var M = (1n << 64n) - 1n;
  var RC = [
    0x0000000000000001n, 0x0000000000008082n, 0x800000000000808an, 0x8000000080008000n,
    0x000000000000808bn, 0x0000000080000001n, 0x8000000080008081n, 0x8000000000008009n,
    0x000000000000008an, 0x0000000000000088n, 0x0000000080008009n, 0x000000008000000an,
    0x000000008000808bn, 0x800000000000008bn, 0x8000000000008089n, 0x8000000000008003n,
    0x8000000000008002n, 0x8000000000000080n, 0x000000000000800an, 0x800000008000000an,
    0x8000000080008081n, 0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n
  ];
  // Rotation offsets r[x + 5y].
  var R = [0, 1, 62, 28, 27, 36, 44, 6, 55, 20, 3, 10, 43, 25, 39, 41, 45, 15, 21, 8, 18, 2, 61, 56, 14];
  function rot(v, n) { n = BigInt(n); return n === 0n ? v : ((v << n) | (v >> (64n - n))) & M; }
  function keccakF(A) {
    var C = new Array(5), D = new Array(5), B = new Array(25), x, y;
    for (var round = 0; round < 24; round++) {
      for (x = 0; x < 5; x++) C[x] = A[x] ^ A[x + 5] ^ A[x + 10] ^ A[x + 15] ^ A[x + 20];
      for (x = 0; x < 5; x++) D[x] = C[(x + 4) % 5] ^ rot(C[(x + 1) % 5], 1);
      for (x = 0; x < 25; x++) A[x] ^= D[x % 5];
      for (x = 0; x < 5; x++) for (y = 0; y < 5; y++) B[y + 5 * ((2 * x + 3 * y) % 5)] = rot(A[x + 5 * y], R[x + 5 * y]);
      for (x = 0; x < 5; x++) for (y = 0; y < 5; y++) A[x + 5 * y] = B[x + 5 * y] ^ ((~B[(x + 1) % 5 + 5 * y] & M) & B[(x + 2) % 5 + 5 * y]);
      A[0] ^= RC[round];
    }
  }
  function sha3_512(msg) {
    if (Object.prototype.toString.call(msg) !== "[object Uint8Array]") throw new TypeError("sha3_512 needs a Uint8Array");
    var rate = 72, A = new Array(25).fill(0n);
    var padLen = rate - (msg.length % rate);
    var p = new Uint8Array(msg.length + padLen);
    p.set(msg);
    p[msg.length] ^= 0x06;
    p[p.length - 1] ^= 0x80;
    for (var off = 0; off < p.length; off += rate) {
      for (var i = 0; i < rate / 8; i++) {
        var lane = 0n;
        for (var b = 7; b >= 0; b--) lane = (lane << 8n) | BigInt(p[off + 8 * i + b]);
        A[i] ^= lane;
      }
      keccakF(A);
    }
    var out = new Uint8Array(64);
    for (var j = 0; j < 8; j++) {
      var v = A[j];
      for (var k = 0; k < 8; k++) { out[8 * j + k] = Number(v & 0xffn); v >>= 8n; }
    }
    return out;
  }
  root.sha3_512 = sha3_512;
})(typeof window !== "undefined" ? window : globalThis);
