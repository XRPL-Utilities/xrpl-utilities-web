// Hands-on pieces for the /learn/ lessons. Each widget is found by its
// data-widget attribute, so a page only runs the ones it carries. Everything
// is written with textContent, never as an HTML string.
(function () {
  'use strict';

  // ---- fingerprints (SHA-512Half, as the XRP Ledger uses) -------------------
  async function sha512Half(text) {
    const bytes = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest('SHA-512', bytes);
    return Array.from(new Uint8Array(digest).slice(0, 32), (b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
  }
  const short = (h) => (h ? h.slice(0, 6) + '...' + h.slice(-4) : '');

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  // ---- try it: change an old page ------------------------------------------
  function tamper(root) {
    const input = root.querySelector('#tamper-amount');
    const fp1 = root.querySelector('[data-role="fp1"]');
    const prev2 = root.querySelector('[data-role="prev2"]');
    const prev3 = root.querySelector('[data-role="prev3"]');
    const check2 = root.querySelector('[data-role="check2"]');
    const reset = root.querySelector('[data-role="reset"]');
    const page2 = root.querySelector('[data-page="2"]');
    const START = '25';
    const page1Text = (amt) => 'Page 1|Alice pays Bob ' + amt + ' XRP|prev:none';
    let agreed = null;

    async function seal() {
      const h1 = await sha512Half(page1Text(START));
      const h2 = await sha512Half('Page 2|Bob pays Carol 10 XRP|prev:' + h1);
      agreed = h1;
      prev2.textContent = short(h1);
      prev3.textContent = short(h2);
      await update();
    }
    async function update() {
      const raw = String(input.value).replace(/[^0-9]/g, '').slice(0, 7) || '0';
      const h = await sha512Half(page1Text(raw));
      fp1.textContent = short(h);
      const ok = h === agreed;
      page2.classList.toggle('broken', !ok);
      check2.textContent = ok
        ? 'Matches page 1. The chain holds.'
        : 'Doesn’t match page 1 anymore. Every copy of the ledger would spot this and reject it.';
      reset.hidden = ok;
    }
    input.addEventListener('input', update);
    reset.addEventListener('click', () => { input.value = START; update(); input.focus(); });
    if (!window.crypto || !crypto.subtle) {
      check2.textContent = 'Your browser blocked the fingerprint maker, so this demo cannot run here.';
      input.disabled = true;
      return;
    }
    seal();
  }

  // ---- the XRP Ledger right now ---------------------------------------------
  // Shows the newest three pages in a row and how each one names the
  // fingerprint of the page before it. Refreshes while the tab is visible and
  // stops after a few minutes so an idle tab does not keep calling.
  function liveChain(root) {
    const status = root.querySelector('[data-role="status"]');
    const list = root.querySelector('[data-role="chain"]');
    const URL_LEDGERS = 'https://api.xrpscan.com/api/v1/ledgers';
    const PAUSE_MS = 8000;
    const STOP_AFTER_MS = 5 * 60 * 1000;
    let started = Date.now();
    let timer = null;
    const refresh = root.querySelector('[data-role="refresh"]');
    const HEX64 = /^[0-9A-F]{64}$/;

    function pickRun(ledgers) {
      // Three pages in a row whose parent links check out.
      for (let i = 0; i + 2 < ledgers.length; i++) {
        const a = ledgers[i], b = ledgers[i + 1], c = ledgers[i + 2];
        if (a.ledger_index - b.ledger_index === 1 && b.ledger_index - c.ledger_index === 1
          && a.parent_hash === b.ledger_hash && b.parent_hash === c.ledger_hash) return [a, b, c];
      }
      return null;
    }
    function valid(l) {
      return l && Number.isInteger(l.ledger_index) && l.ledger_index > 0
        && HEX64.test(l.ledger_hash) && HEX64.test(l.parent_hash)
        && Number.isInteger(l.tx_count) && l.tx_count >= 0 && l.tx_count < 100000;
    }
    function render(run) {
      list.textContent = '';
      run.forEach((l, i) => {
        const li = el('li', 'page' + (i === 0 ? ' newest' : ''));
        const a = el('a', 'page-num', 'Page ' + l.ledger_index.toLocaleString('en-US'));
        a.href = 'https://livenet.xrpl.org/ledgers/' + l.ledger_index;
        a.rel = 'noopener';
        li.appendChild(a);
        // Close times are rounded on the ledger itself, so they are left out
        // here: they would make neighbouring pages look seconds apart or tied.
        li.appendChild(el('span', 'tx', (i === 0 ? 'Newest page. ' : '') + l.tx_count.toLocaleString('en-US') + ' transactions'));
        const fp = el('span', 'fp', 'Fingerprint ');
        fp.appendChild(el('code', null, short(l.ledger_hash)));
        li.appendChild(fp);
        const prev = el('span', 'fp prev', 'Page before had ');
        prev.appendChild(el('code', null, short(l.parent_hash)));
        li.appendChild(prev);
        list.appendChild(li);
      });
      status.textContent = 'Live. New pages keep arriving while this tab is open.';
    }
    let busy = false;
    async function tick() {
      timer = null;
      if (document.hidden || busy) return;
      busy = true;
      try {
        const r = await fetch(URL_LEDGERS, { headers: { accept: 'application/json' } });
        if (!r.ok) throw new Error('status ' + r.status);
        const body = await r.json();
        const ledgers = Array.isArray(body && body.ledgers) ? body.ledgers.filter(valid) : [];
        const run = pickRun(ledgers);
        if (run) render(run);
        else if (!list.children.length) status.textContent = 'Waiting for three pages in a row...';
      } catch (e) {
        status.textContent = list.children.length
          ? 'Couldn’t reach the live ledger just now. These are the last pages we got.'
          : 'Couldn’t reach the live ledger just now. You can still watch it at livenet.xrpl.org.';
      }
      busy = false;
      if (timer) clearTimeout(timer);
      if (Date.now() - started < STOP_AFTER_MS) timer = setTimeout(tick, PAUSE_MS);
      else status.textContent = 'Paused. Press "Show the newest pages" to start again.';
    }
    // The button restarts the clock and fetches straight away.
    if (refresh) refresh.addEventListener('click', () => {
      if (busy) return;
      if (timer) { clearTimeout(timer); timer = null; }
      started = Date.now();
      status.textContent = 'Loading the latest pages...';
      tick();
    });
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && !timer && Date.now() - started < STOP_AFTER_MS) tick();
    });
    tick();
  }

  // ---- the ten-minute race --------------------------------------------------
  // Ten minutes played back in fifteen seconds. The XRP Ledger takes about
  // four seconds a page (so about 150 in ten minutes) and Bitcoin about ten
  // minutes a block. Starts when the figure scrolls into view. Without JavaScript, or
  // with reduced motion, the finished picture shows.
  function race(root) {
    const squares = Array.from(root.querySelectorAll('[data-role="grid"] rect'));
    const btc = root.querySelector('[data-role="btc"]');
    const btcCount = root.querySelector('[data-role="btc-count"]');
    const mine = root.querySelector('[data-role="mine"]');
    const guess = root.querySelector('[data-role="guess"]');
    let lastGuess = 0;
    // A made-up guess, just to show the work. Real miners make far more guesses than this.
    const hex = () => Math.floor(Math.random() * 0x1000000).toString(16).toUpperCase().padStart(6, '0');
    const xrplCount = root.querySelector('[data-role="xrpl-count"]');
    const clock = root.querySelector('[data-role="clock"]');
    const replay = root.querySelector('[data-role="replay"]');
    const PLAY_MS = 15000;
    const REAL_S = 600;
    let raf = null;
    const fmt = (s) => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
    function draw(t) {
      const s = Math.min(REAL_S, t * REAL_S);
      const pages = Math.min(squares.length, Math.floor((s / REAL_S) * squares.length));
      squares.forEach((q, i) => q.classList.toggle('off', i >= pages));
      const blockIn = s >= REAL_S;
      btc.classList.toggle('off', !blockIn);
      mine.classList.toggle('off', blockIn);
      btcCount.textContent = blockIn ? '1 block. One guess finally fit.' : 'Mining. Trying guess after guess...';
      if (blockIn) guess.textContent = '';
      else if (performance.now() - lastGuess > 90) { lastGuess = performance.now(); guess.textContent = 'Guess ' + hex() + '... no good'; }
      xrplCount.textContent = pages + (pages === 1 ? ' page' : ' pages');
      clock.textContent = fmt(s);
    }
    function play() {
      if (raf) cancelAnimationFrame(raf);
      replay.disabled = true;
      const t0 = performance.now();
      const step = (now) => {
        const t = (now - t0) / PLAY_MS;
        draw(t);
        if (t < 1) raf = requestAnimationFrame(step);
        else { raf = null; replay.disabled = false; }
      };
      raf = requestAnimationFrame(step);
    }
    replay.addEventListener('click', play);
    if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    draw(0);
    if (!('IntersectionObserver' in window)) { play(); return; }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { io.disconnect(); play(); }
    }, { threshold: 0.5 });
    io.observe(root);
  }

  // ---- validators voting a page in ------------------------------------------
  // 35 validators, as on the recommended lists, and the 80% bar (28 of 35).
  // The slider takes some offline or makes them cheat. Closing a page shows
  // the honest ones agreeing one at a time, then what the rules do next.
  function vote(root) {
    const dots = Array.from(root.querySelectorAll('[data-role="grid"] circle'));
    const range = root.querySelector('#vote-bad');
    const badCount = root.querySelector('[data-role="bad-count"]');
    const bar = root.querySelector('[data-role="bar"]');
    const meter = bar.parentNode;
    const status = root.querySelector('[data-role="status"]');
    const go = root.querySelector('[data-role="go"]');
    const TOTAL = dots.length;
    const NEED = Math.ceil(TOTAL * 0.8);
    const STEP_MS = 45;
    const still = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    // A fixed shuffle, so the same validators go bad each time.
    const order = dots.map((_, i) => i);
    let seed = 7;
    for (let i = order.length - 1; i > 0; i--) {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      const j = seed % (i + 1);
      [order[i], order[j]] = [order[j], order[i]];
    }
    let timer = null;

    function bad() { return Math.max(0, Math.min(TOTAL, parseInt(range.value, 10) || 0)); }
    function setStatus(text, cls) { status.textContent = text; status.className = 'vote-status ' + cls; }
    function reset() {
      if (timer) { clearInterval(timer); timer = null; }
      const n = bad();
      badCount.textContent = String(n);
      const badSet = new Set(order.slice(0, n));
      dots.forEach((d, i) => { d.classList.toggle('bad', badSet.has(i)); d.classList.remove('yes'); });
      bar.style.width = '0%';
      meter.classList.remove('red');
      setStatus('Press "Close a page" to see what happens.', '');
      return badSet;
    }
    function finish(n) {
      const good = TOTAL - n;
      if (n >= NEED) {
        meter.classList.add('red');
        bar.style.width = (n / TOTAL * 100) + '%';
        setStatus('If all ' + n + ' of these were cheating together, they would reach ' + NEED + ' on their own. Only then could a bad page get through. It would take that many validators, run by different groups, all cheating the same way.', 'bad');
      } else if (good >= NEED) {
        setStatus(good + ' of ' + TOTAL + ' agree. That clears ' + NEED + ', so the page is locked in.', 'ok');
      } else {
        setStatus('Only ' + good + ' of ' + TOTAL + ' agree, short of ' + NEED + '. The network pauses instead of guessing. Nothing wrong gets written, and it picks back up when enough validators return.', 'stuck');
      }
      go.disabled = false;
    }
    function play() {
      const badSet = reset();
      const n = badSet.size;
      const honest = order.filter((i) => !badSet.has(i)).reverse();
      go.disabled = true;
      if (still) {
        honest.forEach((i) => dots[i].classList.add('yes'));
        bar.style.width = (honest.length / TOTAL * 100) + '%';
        finish(n);
        return;
      }
      let k = 0;
      setStatus('Comparing notes...', '');
      timer = setInterval(() => {
        if (k < honest.length) {
          dots[honest[k]].classList.add('yes');
          k++;
          bar.style.width = (k / TOTAL * 100) + '%';
        } else {
          clearInterval(timer); timer = null;
          finish(n);
        }
      }, STEP_MS);
    }
    range.addEventListener('input', () => { reset(); go.disabled = false; });
    go.addEventListener('click', play);
    reset();
    if (!('IntersectionObserver' in window)) { play(); return; }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { io.disconnect(); play(); }
    }, { threshold: 0.4 });
    io.observe(root);
  }

  // ---- try it: the account reserve --------------------------------------------
  // Mainnet figures on xrpl.org (Reserves page): 1 XRP base, 0.2 XRP per item.
  function reserve(root) {
    const BASE = 1, ITEM = 0.2, MAX = 10;
    const counts = { token: 0, offer: 0, escrow: 0 };
    const total = root.querySelector('[data-role="total"]');
    const bar = root.querySelector('[data-role="bar"]');
    const fmt = (n) => n.toLocaleString('en-US', { maximumFractionDigits: 1 });
    function draw() {
      const items = counts.token + counts.offer + counts.escrow;
      const locked = Math.round((BASE + items * ITEM) * 10) / 10;
      Object.keys(counts).forEach((k) => {
        root.querySelector('[data-count="' + k + '"]').textContent = String(counts[k]);
        root.querySelectorAll('[data-item="' + k + '"]').forEach((b) => {
          b.disabled = b.getAttribute('data-step') === '1' ? counts[k] >= MAX : counts[k] <= 0;
        });
      });
      bar.style.width = (items * ITEM / (BASE + 3 * MAX * ITEM) * 100) + '%';
      total.textContent = items === 0
        ? 'Locked: 1 XRP. That\'s the base amount every account needs.'
        : 'Locked: ' + fmt(locked) + ' XRP. That\'s 1 XRP for the account plus 0.2 XRP for each of your ' + items + (items === 1 ? ' item.' : ' items.');
    }
    root.querySelectorAll('[data-item]').forEach((b) => {
      b.addEventListener('click', () => {
        const k = b.getAttribute('data-item');
        if (!(k in counts)) return;
        const next = counts[k] + (b.getAttribute('data-step') === '1' ? 1 : -1);
        counts[k] = Math.max(0, Math.min(MAX, next));
        draw();
      });
    });
    draw();
  }

  // ---- live: how much XRP is left ----------------------------------------------
  // Every ledger page carries total_coins in drops. The ledger began with
  // exactly 100 billion XRP, so 100 billion minus total_coins is what fees
  // have destroyed.
  function supply(root) {
    const status = root.querySelector('[data-role="status"]');
    const totalEl = root.querySelector('[data-role="total"]');
    const goneEl = root.querySelector('[data-role="gone"]');
    const sinceEl = root.querySelector('[data-role="since"]');
    const refresh = root.querySelector('[data-role="refresh"]');
    const URL_LEDGERS = 'https://api.xrpscan.com/api/v1/ledgers';
    const START_DROPS = 100000000000n * 1000000n;
    const PAUSE_MS = 10000;
    const STOP_AFTER_MS = 5 * 60 * 1000;
    let started = Date.now();
    let timer = null;
    let busy = false;
    let first = null;
    let lastIndex = 0;
    const xrp = (drops, digits) => {
      const whole = drops / 1000000n;
      const frac = Number(drops % 1000000n) / 1e6;
      const w = whole.toLocaleString('en-US');
      return digits ? w + frac.toFixed(digits).slice(1) : w;
    };
    // total_coins is past 2^53, so JSON.parse would round off its last
    // digits. The digits are read straight from the text instead. Each
    // ledger in the answer is a flat object, and only digits are captured.
    const LEDGER_RE = /\{[^{}]*?"ledger_index":\s*(\d{1,12})[^{}]*?"total_coins":\s*"?(\d{1,18})"?[^{}]*\}/g;
    function pick(text) {
      let best = null;
      for (const m of text.matchAll(LEDGER_RE)) {
        const idx = Number(m[1]);
        if (idx > 0 && (!best || idx > best.ledger_index)) best = { ledger_index: idx, total_coins: m[2] };
      }
      return best;
    }
    const card = root.querySelector('.sp-grid');
    async function tick(clicked) {
      timer = null;
      if (document.hidden || busy) return;
      busy = true;
      if (clicked) status.textContent = 'Checking the newest page...';
      try {
        const r = await fetch(URL_LEDGERS, { headers: { accept: 'application/json' } });
        if (!r.ok) throw new Error('status ' + r.status);
        const l = pick(await r.text());
        if (clicked && l && l.ledger_index === lastIndex) {
          // New pages close a few seconds apart, so a quick second
          // click usually finds the same one. Say so instead of looking stuck.
          status.textContent = 'Still page ' + l.ledger_index.toLocaleString('en-US') + '. New pages come a few seconds apart, so try again in a moment.';
        } else if (l && l.ledger_index >= lastIndex) {
          const left = BigInt(l.total_coins);
          if (left > 0n && left <= START_DROPS) {
            lastIndex = l.ledger_index;
            if (!first) first = left;
            totalEl.textContent = xrp(left, 0) + ' XRP';
            goneEl.textContent = xrp(START_DROPS - left, 0) + ' XRP';
            const since = first - left;
            sinceEl.textContent = since > 0n ? xrp(since, 6) + ' XRP (' + since.toLocaleString('en-US') + ' drops)' : 'Nothing yet. Give it a few seconds.';
            status.textContent = 'From page ' + l.ledger_index.toLocaleString('en-US') + '. Updates while this tab is open.';
            if (card) { card.classList.remove('fresh'); void card.offsetWidth; card.classList.add('fresh'); }
          }
        }
      } catch (e) {
        status.textContent = first
          ? 'Couldn’t reach the live ledger just now. These are the last numbers we got.'
          : 'Couldn’t reach the live ledger just now. Press "Check again" in a moment.';
      }
      busy = false;
      if (timer) clearTimeout(timer);
      if (Date.now() - started < STOP_AFTER_MS) timer = setTimeout(tick, PAUSE_MS);
      else status.textContent = 'Paused. Press "Check again" to start again.';
    }
    if (refresh) refresh.addEventListener('click', () => {
      started = Date.now();
      if (timer) { clearTimeout(timer); timer = null; }
      tick(true);
    });
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && !timer && !busy && Date.now() - started < STOP_AFTER_MS) tick();
    });
    tick();
  }

  // ---- try it: say yes to a token (trust lines) ---------------------------------
  // Rules from xrpl.org Trust Line Tokens: no balance without a trust line,
  // and a payment can't push the balance past the holder's limit.
  function trust(root) {
    const LIMIT = 1000;
    const bal = root.querySelector('[data-role="bal"]');
    const lim = root.querySelector('[data-role="limit"]');
    const res = root.querySelector('[data-role="res"]');
    const msg = root.querySelector('[data-role="msg"]');
    let state = { line: false, balance: 0 };
    function draw(text, cls) {
      bal.textContent = state.balance.toLocaleString('en-US') + ' USD from Example Bank';
      lim.textContent = state.line ? LIMIT.toLocaleString('en-US') + ' USD' : 'None. You haven\'t said yes.';
      res.textContent = state.line ? '0.2 XRP' : '0 XRP';
      msg.textContent = text;
      msg.className = 'tr-msg' + (cls ? ' ' + cls : '');
    }
    function send(n) {
      if (!state.line) return draw('Refused. You haven\'t said yes to this token, so the ledger won\'t put it in your account.', 'bad');
      if (state.balance + n > LIMIT) return draw('Refused. That would take you to ' + (state.balance + n).toLocaleString('en-US') + ' USD, over your 1,000 USD limit.', 'bad');
      state.balance += n;
      return draw('Arrived. ' + n.toLocaleString('en-US') + ' USD from Example Bank is in your account.', 'ok');
    }
    const acts = {
      send50: () => send(50),
      send2000: () => send(2000),
      trust: () => {
        if (state.line) return draw('You already said yes, up to 1,000 USD.', '');
        state.line = true;
        return draw('Done. You\'ll now accept up to 1,000 USD from Example Bank. That locks 0.2 XRP of your reserve.', 'ok');
      },
      reset: () => { state = { line: false, balance: 0 }; draw('Nothing sent yet.', ''); },
    };
    root.querySelectorAll('[data-act]').forEach((b) => {
      b.addEventListener('click', () => {
        const fn = acts[b.getAttribute('data-act')];
        if (fn) fn();
      });
    });
    draw('Nothing sent yet.', '');
  }

  // ---- live: what's inside the newest page ----------------------------------------
  function liveTokens(root) {
    const status = root.querySelector('[data-role="status"]');
    const out = {
      xrp: root.querySelector('[data-role="xrp"]'),
      tok: root.querySelector('[data-role="tok"]'),
      trust: root.querySelector('[data-role="trust"]'),
      other: root.querySelector('[data-role="other"]'),
    };
    const refresh = root.querySelector('[data-role="refresh"]');
    const card = root.querySelector('.sp-grid');
    const BASE = 'https://api.xrpscan.com/api/v1/';
    let busy = false;
    let lastIndex = 0;
    async function newestIndex() {
      const r = await fetch(BASE + 'ledgers', { headers: { accept: 'application/json' } });
      if (!r.ok) throw new Error('status ' + r.status);
      const body = await r.json();
      let best = 0;
      (Array.isArray(body && body.ledgers) ? body.ledgers : []).forEach((l) => {
        if (l && Number.isInteger(l.ledger_index) && l.ledger_index > best) best = l.ledger_index;
      });
      if (!best) throw new Error('no ledger');
      return best;
    }
    async function load(clicked) {
      if (busy) return;
      busy = true;
      status.textContent = 'Opening the newest page...';
      try {
        const idx = await newestIndex();
        if (clicked && idx === lastIndex) {
          status.textContent = 'Still page ' + idx.toLocaleString('en-US') + '. New pages come a few seconds apart, so try again in a moment.';
        } else {
          const r = await fetch(BASE + 'ledger/' + idx + '/transactions', { headers: { accept: 'application/json' } });
          if (!r.ok) throw new Error('status ' + r.status);
          const txs = await r.json();
          if (!Array.isArray(txs)) throw new Error('shape');
          const n = { xrp: 0, tok: 0, trust: 0, other: 0 };
          txs.forEach((t) => {
            if (!t || typeof t.TransactionType !== 'string') return;
            const ok = t.meta && t.meta.TransactionResult === 'tesSUCCESS';
            if (!ok) return;
            if (t.TransactionType === 'Payment') {
              const d = t.meta.delivered_amount || t.Amount;
              const cur = d && typeof d === 'object' ? d.currency : (typeof d === 'string' || typeof d === 'number' ? 'XRP' : null);
              if (cur === 'XRP') n.xrp++; else if (cur) n.tok++; else n.other++;
            } else if (t.TransactionType === 'TrustSet') n.trust++;
            else n.other++;
          });
          Object.keys(n).forEach((k) => { out[k].textContent = n[k].toLocaleString('en-US'); });
          lastIndex = idx;
          status.textContent = 'Page ' + idx.toLocaleString('en-US') + '. Only transactions that went through are counted.';
          if (card) { card.classList.remove('fresh'); void card.offsetWidth; card.classList.add('fresh'); }
        }
      } catch (e) {
        status.textContent = lastIndex
          ? 'Couldn’t reach the live ledger just now. These are the last numbers we got.'
          : 'Couldn’t reach the live ledger just now. Press the button in a moment.';
      }
      busy = false;
    }
    if (refresh) refresh.addEventListener('click', () => load(true));
    load(false);
  }

  const WIDGETS = { tamper, 'live-chain': liveChain, race, vote, reserve, supply, trust, 'live-tokens': liveTokens };
  document.querySelectorAll('[data-widget]').forEach((root) => {
    const fn = WIDGETS[root.getAttribute('data-widget')];
    if (fn) fn(root);
  });
})();
