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
  // Guided: one button walks the steps in order so the story reads top to bottom.
  function trust(root) {
    const LIMIT = 1000;
    const empty = root.querySelector('[data-role="empty"]');
    const line = root.querySelector('[data-role="line"]');
    const nums = root.querySelector('[data-role="nums"]');
    const bar = root.querySelector('[data-role="bar"]');
    const msg = root.querySelector('[data-role="msg"]');
    const next = root.querySelector('[data-role="next"]');
    const reset = root.querySelector('[data-role="reset"]');
    const STEPS = [
      { btn: 'Step 1: Bob sends you 50 USD', run: (s) => (s.line ? null : ['Refused. You haven\'t said yes to this token, so the ledger sends it back to Bob.', 'bad']) },
      { btn: 'Step 2: Say yes, up to 1,000 USD', run: (s) => { s.line = true; return ['Done. Your wallet now has a spot for this token, up to 1,000 USD.', 'ok']; } },
      { btn: 'Step 3: Bob tries 50 USD again', run: (s) => { s.balance += 50; return ['Arrived. 50 USD from Example Bank is in your wallet.', 'ok']; } },
      { btn: 'Step 4: Bob sends you 2,000 USD', run: (s) => ['Refused. That would take you to ' + (s.balance + 2000).toLocaleString('en-US') + ' USD, over your 1,000 USD limit.', 'bad'] },
    ];
    let state;
    let step;
    function draw(text, cls) {
      line.hidden = !state.line;
      empty.hidden = state.line;
      nums.textContent = state.balance.toLocaleString('en-US') + ' of your 1,000 limit';
      bar.style.width = Math.min(100, (state.balance / LIMIT) * 100) + '%';
      msg.textContent = text;
      msg.className = 'tr-msg' + (cls ? ' ' + cls : '');
      if (step < STEPS.length) {
        next.hidden = false;
        next.textContent = STEPS[step].btn;
      } else {
        next.hidden = true;
      }
    }
    function start() {
      state = { line: false, balance: 0 };
      step = 0;
      draw('Press the button to start.', '');
    }
    next.addEventListener('click', () => {
      if (step >= STEPS.length) return;
      const out = STEPS[step].run(state) || ['', ''];
      step += 1;
      if (step === STEPS.length) out[0] += ' That\'s a trust line at work.';
      draw(out[0], out[1]);
    });
    reset.addEventListener('click', start);
    start();
  }

  // ---- try it: follow one dollar token through the issuer ------------------------
  function tokenLife(root) {
    const cells = {};
    root.querySelectorAll('[data-cell]').forEach((c) => { cells[c.getAttribute('data-cell')] = c; });
    const msg = root.querySelector('[data-role="msg"]');
    const next = root.querySelector('[data-role="next"]');
    const reset = root.querySelector('[data-role="reset"]');
    // Each state: where the dollar and the token are, the two counters, the message,
    // and the label for the button that moves to the following state.
    const STATES = [
      { cash: 'you-cash', tok: null, vault: 0, out: 0, msg: 'You have a real dollar. The issuer\'s vault is empty.', btn: 'Step 1: Hand the issuer your dollar' },
      { cash: 'vault', tok: null, vault: 1, out: 0, msg: 'The issuer puts your dollar in its vault, off the ledger.', btn: 'Step 2: The issuer sends you a token' },
      { cash: 'vault', tok: 'you-tok', vault: 1, out: 1, msg: 'You get one dollar token on the ledger. One dollar in, one token out.', btn: 'Step 3: Pay your friend with it' },
      { cash: 'vault', tok: 'friend-tok', vault: 1, out: 1, msg: 'The token moves to your friend in seconds. The dollar never left the vault.', btn: 'Step 4: Your friend cashes it in' },
      { cash: 'friend-cash', tok: null, vault: 0, out: 0, msg: 'Your friend hands the token back and gets the dollar. Both counts are back to zero.', btn: null },
    ];
    let i = 0;
    // Chips are cloned from <template> elements in the widget, so no markup is built here.
    function chip(kind) {
      const t = root.querySelector('template[data-tpl="' + kind + '"]');
      return t ? t.content.firstElementChild.cloneNode(true) : document.createTextNode('');
    }
    function draw(flash) {
      const st = STATES[i];
      ['you-cash', 'friend-cash', 'you-tok', 'friend-tok'].forEach((k) => { cells[k].textContent = ''; });
      const slot = cells.vault.querySelector('[data-slot="vault"]');
      if (slot) slot.textContent = '';
      if (st.cash !== 'vault') cells[st.cash].appendChild(chip('cash'));
      else if (slot) { const c = chip('cash'); const lbl = c.lastChild; if (lbl && lbl.nodeType === 3) c.removeChild(lbl); slot.appendChild(c); }
      if (st.tok) cells[st.tok].appendChild(chip('tok'));
      cells.vault.querySelector('b').textContent = st.vault === 1 ? '1 dollar' : '0 dollars';
      cells.out.querySelector('b').textContent = String(st.out);
      msg.textContent = st.msg;
      if (st.btn) { next.hidden = false; next.textContent = st.btn; } else { next.hidden = true; }
      if (flash) {
        root.querySelectorAll('.tl-cell').forEach((c) => {
          c.classList.remove('fresh');
          void c.offsetWidth;
        });
        flash.forEach((k) => cells[k] && cells[k].classList.add('fresh'));
      }
    }
    next.addEventListener('click', () => {
      if (i >= STATES.length - 1) return;
      const a = STATES[i];
      i += 1;
      const b = STATES[i];
      const changed = [a.cash, b.cash, a.tok, b.tok].filter(Boolean).map((k) => (k === 'vault' ? 'vault' : k));
      if (a.out !== b.out) changed.push('out');
      draw(changed);
    });
    reset.addEventListener('click', () => { i = 0; draw([]); });
    draw(null);
  }

  // ---- try it: vote a feature in (amendments) -----------------------------------
  // Rules from xrpl.org Amendments: 80% of trusted validators for two weeks,
  // and the two-week period restarts if support drops below 80%.
  // The story is a pretend run; MPTokensV1 (XLS-33) really switched on 2025-10-01.
  function amendVote(root) {
    const TOTAL = 35;
    const NEED = 28;
    const DAYS = 14;
    const STORY = [
      { yes: 20, days: 0, text: 'MPTs come out in a new server version, switched off. 20 of 35 validators say yes so far. It needs 28.' },
      { yes: 29, days: 0, cls: 'ok', text: 'More validators upgrade and say yes. 29 of 35 is over 80%, so the two-week clock starts.' },
      { yes: 29, days: 5, text: 'Five days go by and support holds. Day 5 of 14.' },
      { yes: 27, days: 0, cls: 'bad', text: 'Two validators change their minds. 27 is under 80%. The clock doesn’t pause. It goes back to day 0.' },
      { yes: 29, days: 0, text: 'A few days later they say yes again. Back over 80%, but the clock starts fresh from day 0.' },
      { yes: 29, days: 14, text: 'This time support holds for two full weeks. Day 14 of 14.' },
      { yes: 29, days: 14, on: true, cls: 'ok', text: 'MPTs switch on for every server, on the same page. The real vote ended that way on October 1, 2025.' },
    ];
    const NEXT = ['Next', 'Let five days pass', 'Two validators say no', 'They say yes again', 'Let two weeks pass', 'Switch it on'];
    const dotsEl = root.querySelector('[data-role="dots"]');
    const daysEl = root.querySelector('[data-role="days"]');
    const count = root.querySelector('[data-role="count"]');
    const daylbl = root.querySelector('[data-role="daylbl"]');
    const msg = root.querySelector('[data-role="msg"]');
    const minus = root.querySelector('[data-role="minus"]');
    const plus = root.querySelector('[data-role="plus"]');
    const next = root.querySelector('[data-role="next"]');
    const day = root.querySelector('[data-role="day"]');
    const tryBtn = root.querySelector('[data-role="try"]');
    const reset = root.querySelector('[data-role="reset"]');
    const cap = root.querySelector('[data-role="cap"]');
    const capStory = cap ? cap.textContent : '';
    const dots = [];
    const cells = [];
    for (let i = 0; i < TOTAL; i++) { const d = document.createElement('span'); dotsEl.appendChild(d); dots.push(d); }
    for (let i = 0; i < DAYS; i++) { const d = document.createElement('span'); daysEl.appendChild(d); cells.push(d); }
    let yes;
    let days;
    let on;
    let step;
    let free;
    function draw(text, cls) {
      dots.forEach((d, i) => { d.className = i < yes ? 'yes' : ''; });
      cells.forEach((c, i) => { c.className = i < days ? 'done' : ''; });
      count.textContent = yes + ' of 35 say yes';
      count.className = 'av-count' + (yes >= NEED ? ' ok' : '');
      daylbl.textContent = on ? 'Switched on' : 'Two-week clock: day ' + days + ' of 14';
      daylbl.className = 'av-daylbl' + (on ? ' ok' : '');
      msg.textContent = text;
      msg.className = 'av-msg' + (cls ? ' ' + cls : '');
      minus.hidden = !free;
      plus.hidden = !free;
      minus.disabled = on || yes === 0;
      plus.disabled = on || yes === TOTAL;
      day.hidden = !free || on;
      next.hidden = free || step >= STORY.length - 1;
      if (!next.hidden) next.textContent = NEXT[step];
      tryBtn.hidden = free || step < STORY.length - 1;
    }
    function showStep() {
      const s = STORY[step];
      yes = s.yes; days = s.days; on = !!s.on;
      draw(s.text, s.cls || '');
    }
    function story() {
      free = false; step = 0;
      if (cap) cap.textContent = capStory;
      showStep();
    }
    function status() {
      if (yes >= NEED) return 'Day ' + days + ' of 14. Enough yes votes. Keep it there.';
      return 'Day ' + days + ' of 14. Not enough yes votes yet.';
    }
    next.addEventListener('click', () => { if (!free && step < STORY.length - 1) { step += 1; showStep(); } });
    tryBtn.addEventListener('click', () => {
      free = true; yes = 20; days = 0; on = false;
      if (cap) cap.textContent = 'Your turn. Use − and + to set the yes votes, then let the days go by.';
      draw(status(), '');
    });
    minus.addEventListener('click', () => { if (free && yes > 0) { yes -= 1; draw(status(), ''); } });
    plus.addEventListener('click', () => { if (free && yes < TOTAL) { yes += 1; draw(status(), ''); } });
    day.addEventListener('click', () => {
      if (!free || on) return;
      if (yes < NEED) {
        const had = days;
        days = 0;
        return draw(had ? 'Support fell below 80%, so the clock went back to day 0.' : 'Another day with too few yes votes. The clock stays at day 0.', 'bad');
      }
      days += 1;
      if (days >= DAYS) {
        on = true;
        return draw('Two weeks at 80% or more. The feature is now on for every server, starting on the same page.', 'ok');
      }
      return draw(status(), '');
    });
    reset.addEventListener('click', story);
    story();
  }

  // ---- live: features being voted on right now -----------------------------------
  function liveAmend(root) {
    const status = root.querySelector('[data-role="status"]');
    const list = root.querySelector('[data-role="list"]');
    const total = root.querySelector('[data-role="total"]');
    const refresh = root.querySelector('[data-role="refresh"]');
    const recentWrap = root.querySelector('[data-role="recent-wrap"]');
    const recent = root.querySelector('[data-role="recent"]');
    const URL_ = 'https://api.xrpscan.com/api/v1/amendments';
    const RECENT_DAYS = 30;
    const XLS = /^XLS-\d{1,4}$/;
    // Plain names for features a reader might meet in these lessons.
    const PLAIN = {
      LendingProtocol: 'Lending: loans on the ledger',
      LendingProtocolV1_1: 'Lending, first update',
      SingleAssetVault: 'Vaults: shared pools of one asset',
      ConfidentialTransfer: 'Confidential transfers: private amounts',
      DynamicMPT: 'MPTs whose settings can change later',
      Sponsor: 'Sponsors: someone else covers your fees and reserve',
      XChainBridge: 'Bridges to other blockchains',
      Batch: 'Batch: several transactions sent as one',
      PermissionDelegation: 'Letting another account act for you',
    };
    function plain(n) {
      if (PLAIN[n]) return PLAIN[n];
      return n.indexOf('fix') === 0 ? 'A bug fix' : n;
    }
    function head(a) {
      const name = document.createElement('p');
      name.className = 'lam-name';
      name.appendChild(document.createTextNode(plain(a.name)));
      const tagText = typeof a.xls === 'string' && XLS.test(a.xls) ? a.xls : '';
      if (tagText) {
        const tag = document.createElement('span');
        tag.className = 'lam-xls';
        tag.textContent = tagText;
        name.appendChild(tag);
      }
      return name;
    }
    function onDate(a) {
      const t = typeof a.enabled_on === 'string' ? Date.parse(a.enabled_on) : NaN;
      return Number.isFinite(t) ? t : null;
    }
    function recentRow(a) {
      const li = document.createElement('li');
      li.appendChild(head(a));
      const when = document.createElement('p');
      when.className = 'lam-nums lam-on';
      when.textContent = 'Switched on ' + new Date(onDate(a)).toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'long', day: 'numeric', year: 'numeric' }) + '.';
      li.appendChild(when);
      return li;
    }
    let busy = false;
    let loaded = false;
    function row(a) {
      const li = document.createElement('li');
      const name = head(a);
      const bar = document.createElement('div');
      bar.className = 'lam-bar';
      const fill = document.createElement('span');
      fill.style.width = Math.min(100, (a.count / a.validations) * 100) + '%';
      if (a.count >= a.threshold) fill.className = 'met';
      const need = document.createElement('i');
      need.style.left = Math.min(100, (a.threshold / a.validations) * 100) + '%';
      bar.appendChild(fill);
      bar.appendChild(need);
      const nums = document.createElement('p');
      nums.className = 'lam-nums';
      nums.textContent = a.count + ' of ' + a.validations + ' say yes. Needs ' + a.threshold + '.' + (a.majority ? ' Over 80% now, so the two-week clock is running.' : '');
      li.appendChild(name);
      li.appendChild(bar);
      li.appendChild(nums);
      return li;
    }
    async function load() {
      if (busy) return;
      busy = true;
      status.textContent = 'Checking the latest votes...';
      try {
        const r = await fetch(URL_, { headers: { accept: 'application/json' } });
        if (!r.ok) throw new Error('status ' + r.status);
        const all = await r.json();
        if (!Array.isArray(all)) throw new Error('shape');
        const ok = (a) => a && typeof a.name === 'string' && Number.isInteger(a.count) && Number.isInteger(a.threshold) && Number.isInteger(a.validations) && a.validations > 0;
        const enabled = all.filter((a) => a && a.enabled === true && typeof a.name === 'string');
        const names = enabled.map((a) => a.name);
        // Skip an old version when a newer one with a longer name is already on (Batch vs BatchV1_1).
        const open = all.filter((a) => ok(a) && a.enabled !== true && a.count > 0 && !names.some((n) => n !== a.name && n.indexOf(a.name) === 0));
        open.sort((x, y) => y.count - x.count);
        list.textContent = '';
        open.slice(0, 6).forEach((a) => list.appendChild(row(a)));
        if (!open.length) list.appendChild(Object.assign(document.createElement('li'), { textContent: 'Nothing is being voted on right now.' }));
        const cutoff = Date.now() - RECENT_DAYS * 86400000;
        const fresh = enabled.filter((a) => onDate(a) !== null && onDate(a) >= cutoff).sort((x, y) => onDate(y) - onDate(x));
        recent.textContent = '';
        fresh.slice(0, 3).forEach((a) => recent.appendChild(recentRow(a)));
        recentWrap.hidden = !fresh.length;
        total.textContent = enabled.length + ' features have been switched on so far.';
        status.textContent = 'Latest count of yes votes from the trusted validators.';
        loaded = true;
      } catch (e) {
        status.textContent = loaded
          ? 'Couldn’t reach the ledger just now. These are the last votes we got.'
          : 'Couldn’t reach the ledger just now. Press the button in a moment.';
      }
      busy = false;
    }
    if (refresh) refresh.addEventListener('click', load);
    load();
  }

  // ---- live: what's inside the newest page ----------------------------------------
  function liveTokens(root) {
    const status = root.querySelector('[data-role="status"]');
    const out = {
      xrp: root.querySelector('[data-role="xrp"]'),
      tok: root.querySelector('[data-role="tok"]'),
      trust: root.querySelector('[data-role="trust"]'),
      swap: root.querySelector('[data-role="swap"]'),
    };
    const also = root.querySelector('[data-role="also"]');
    // Plain names for the rest of the page, grouped by transaction type prefix.
    const KINDS = [
      [/^Batch$/, ['bundle of transactions sent as one', 'bundles of transactions sent as one']],
      [/^AMM/, ['trading pool move', 'trading pool moves']],
      [/^NFToken/, ['NFT move', 'NFT moves']],
      [/^Escrow/, ['escrow move', 'escrow moves']],
      [/^Check/, ['check', 'checks']],
      [/^MPToken/, ['MPT move', 'MPT moves']],
      [/^(AccountSet|SetRegularKey|SignerListSet|DepositPreauth|TicketCreate)$/, ['account setting change', 'account setting changes']],
      [/^Oracle/, ['data feed update', 'data feed updates']],
    ];
    function kindOf(type) {
      for (let i = 0; i < KINDS.length; i++) if (KINDS[i][0].test(type)) return KINDS[i][1];
      return ['other', 'other'];
    }
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
          const n = { xrp: 0, tok: 0, trust: 0, swap: 0 };
          const rest = {};
          const more = (k) => { const key = k.join('|'); rest[key] = (rest[key] || 0) + 1; };
          txs.forEach((t) => {
            if (!t || typeof t.TransactionType !== 'string') return;
            const ok = t.meta && t.meta.TransactionResult === 'tesSUCCESS';
            if (!ok) return;
            if (t.TransactionType === 'Payment') {
              const d = t.meta.delivered_amount || t.Amount;
              const cur = d && typeof d === 'object' ? (d.currency || (d.mpt_issuance_id ? 'MPT' : null)) : (typeof d === 'string' || typeof d === 'number' ? 'XRP' : null);
              if (cur === 'XRP') n.xrp++; else if (cur) n.tok++; else more(['other', 'other']);
            } else if (t.TransactionType === 'TrustSet' || t.TransactionType === 'MPTokenAuthorize') n.trust++;
            else if (t.TransactionType === 'OfferCreate' || t.TransactionType === 'OfferCancel') n.swap++;
            else more(kindOf(t.TransactionType));
          });
          const parts = Object.keys(rest)
            .sort((x, y) => (x === 'other|other') - (y === 'other|other') || rest[y] - rest[x])
            .map((k) => rest[k].toLocaleString('en-US') + ' ' + k.split('|')[rest[k] === 1 ? 0 : 1]);
          if (also) also.textContent = parts.length ? 'Also on this page: ' + parts.join(', ') + '.' : 'Nothing else on this page.';
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

  const WIDGETS = { 'amend-vote': amendVote, 'live-amend': liveAmend, 'token-life': tokenLife, tamper, 'live-chain': liveChain, race, vote, reserve, supply, trust, 'live-tokens': liveTokens };
  document.querySelectorAll('[data-widget]').forEach((root) => {
    const fn = WIDGETS[root.getAttribute('data-widget')];
    if (fn) fn(root);
  });
})();
