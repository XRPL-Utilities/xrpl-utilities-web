// Payment quote pinning for the browser invoice flows (Sentinel bulk and
// Telemetry). Pure ES2018, no framework.
//
// A quote comes back from our API with a recipient, an amount, a destination
// tag and a ready-made wallet link. The page used to render all of it as
// given, so a tampered response (compromised backend, hostile proxy, injected
// script) could send the payer's XRP anywhere while the page looked normal.
// Here the recipient must equal the treasury address hardcoded below, the
// amount and tag must be well-formed, and the wallet link and QR text are
// rebuilt on this origin from the checked values. Anything else is refused.

(function (global) {
  'use strict';

  // The one XRPL treasury every XR-* service settles to.
  const TREASURY = 'rKxTzCKYKPPdXEzuioEQ6KekQK26w2DBd5';
  const DROPS_PER_XRP = 1000000;
  // Far above any real invoice (bulk Sentinel is $0.10 per address), low
  // enough that a tampered amount can't ask for a wallet's whole balance.
  const MAX_DROPS = 5000 * DROPS_PER_XRP;
  const MAX_TAG = 4294967295;

  function intField(v) {
    if (typeof v === 'number') return Number.isSafeInteger(v) ? v : null;
    if (typeof v === 'string' && /^\d{1,16}$/.test(v)) return Number(v);
    return null;
  }

  // Exact decimal XRP from integer drops, no floating point.
  function dropsToXrp(drops) {
    const whole = Math.floor(drops / DROPS_PER_XRP);
    const frac = String(drops % DROPS_PER_XRP).padStart(6, '0').replace(/0+$/, '');
    return frac ? whole + '.' + frac : String(whole);
  }

  // Returns {recipient, drops, xrp, tag, link} or throws with a message that
  // is safe to show the payer.
  function verifyQuote(quote, recipientField) {
    if (!quote || typeof quote !== 'object') throw new Error('The payment quote was empty.');
    const recipient = quote[recipientField];
    if (recipient !== TREASURY) {
      throw new Error('The payment quote named an unexpected recipient address, so it was not shown. Do not send funds; reload the page and try again.');
    }
    const drops = intField(quote.amount_drops);
    if (drops == null || drops <= 0 || drops > MAX_DROPS) {
      throw new Error('The payment quote had an invalid amount, so it was not shown.');
    }
    if (quote.amount_xrp != null && Math.round(Number(quote.amount_xrp) * DROPS_PER_XRP) !== drops) {
      throw new Error('The payment quote amounts did not agree, so it was not shown.');
    }
    const tag = intField(quote.destination_tag);
    if (tag == null || tag < 0 || tag > MAX_TAG) {
      throw new Error('The payment quote had an invalid destination tag, so it was not shown.');
    }
    const xrp = dropsToXrp(drops);
    return {
      recipient: TREASURY,
      drops: drops,
      xrp: xrp,
      tag: tag,
      link: 'xrpl://' + TREASURY + '?amount=' + xrp + '&dt=' + tag,
    };
  }

  global.XRPayPin = { TREASURY: TREASURY, verifyQuote: verifyQuote, dropsToXrp: dropsToXrp };
})(typeof window !== 'undefined' ? window : globalThis);
