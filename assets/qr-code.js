// Local QR rendering for XRPL payment URIs.
// Pure ES2018, no framework. Requires /assets/vendor/qrcode-generator.min.js
// to be loaded first.
//
// Why this exists: every paid flow used to point an <img> at
// api.qrserver.com, which meant a third party generated the pixels a payer's
// wallet actually scans. A compromised, DNS-hijacked or simply substituted
// image host could return a QR encoding an attacker's r-address while the
// page's own Recipient / Amount / Destination Tag rows still showed the
// correct ones, and nothing on the page compared the two. Encoding on this
// origin means the scanned bytes come from the same string the page holds.

(function (global) {
  'use strict';

  // The vendored encoder's default byte conversion is latin-1 (charCode &
  // 0xff), which silently mangles any non-ASCII character into a different
  // one - a QR that scans cleanly and pays the wrong string. Deep links are
  // ASCII today; this makes that not matter.
  //
  // Applied at call time, not load time. If a page ever lists this file before
  // the vendored encoder, a load-time swap would find global.qrcode undefined,
  // skip silently, and never retry - and nothing would throw, because the
  // vendor still loads and toCanvas still works. The only symptom would be a
  // QR encoding different bytes than the page shows.
  function useUtf8Bytes() {
    const enc = global.qrcode;
    if (enc && enc.stringToBytesFuncs && enc.stringToBytesFuncs['UTF-8']) {
      enc.stringToBytes = enc.stringToBytesFuncs['UTF-8'];
    }
  }

  // Returns a <canvas> of about sizePx square encoding text, named for
  // screen readers by label (default 'XRPL payment QR code'), or throws if
  // the encoder is missing or the payload won't fit in a QR. Callers should
  // catch and fall back to the manual-copy instructions: a missing QR is
  // recoverable, a blank white box is not.
  function toCanvas(text, sizePx, label) {
    if (typeof global.qrcode !== 'function') {
      throw new Error('qr encoder not loaded');
    }
    useUtf8Bytes();
    const qr = global.qrcode(0, 'M'); // 0 = smallest version the data fits in
    qr.addData(String(text));
    qr.make();

    const count = qr.getModuleCount();
    const cell = Math.max(1, Math.floor(sizePx / count));
    const canvas = document.createElement('canvas');
    canvas.width = count * cell;
    canvas.height = count * cell;
    canvas.style.width = sizePx + 'px';
    canvas.style.height = sizePx + 'px';
    canvas.style.display = 'block';
    // Scaling whole modules up to the requested size would blur the edges
    // on a phone camera without this.
    canvas.style.imageRendering = 'pixelated';

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas 2d context unavailable');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#000000';
    for (let r = 0; r < count; r += 1) {
      for (let c = 0; c < count; c += 1) {
        if (qr.isDark(r, c)) ctx.fillRect(c * cell, r * cell, cell, cell);
      }
    }

    // A <canvas> has no implicit role and no alt attribute, so without these
    // a screen reader announces nothing at all - and the payer never learns a
    // scannable code is on the page. The <img> this replaced carried alt text.
    // Set via setAttribute, not the role/ariaLabel reflection properties:
    // reflection for role is recent enough that older mobile browsers on the
    // payment surface would silently get neither.
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', label || 'XRPL payment QR code');
    return canvas;
  }

  global.XRQr = {
    toCanvas: toCanvas,
  };
})(window);
