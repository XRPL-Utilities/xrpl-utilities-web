// Builds the /cases/ section ("Case files") from tools/cases/*.json.
//
// A case file is a dated, facts-only replay of something that happened on the
// XRP Ledger. Each case's figures live in one JSON file. The build writes:
//   cases/index.html            the list of cases
//   cases/<slug>/index.html     the case page
//   cases/<slug>/data.json      the same figures, served as data
// The nightly Verified Record fingerprints data.json, so a figure on the page
// can be checked against the copy written to the ledger that night.
//
// Rules for every case (tests/cases_test.mjs holds the pages to them): ledger
// facts only, no people's names, no deposit tags, nothing about how the
// trace was done, no talk of reporting anyone, and times in US Eastern.
//
//   node tools/cases/build.mjs          write the pages
//   node tools/cases/build.mjs --check  exit 1 if a page is out of date
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const SITE = 'https://xrpl-utilities.com';
const EXPLORER = 'https://xrpscan.com/account/';
const CSS_V = '2';
const JS_V = '1';

export function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const ADDRESS = /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/;
const SLUG = /^[a-z0-9][a-z0-9-]{0,62}$/;

export function fmtM(n) {
  if (typeof n !== 'number' || !Number.isFinite(n)) throw new Error(`not a number: ${n}`);
  if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e8 ? 1 : 2).replace(/\.0+$/, '') + 'M';
  return Math.round(n).toLocaleString('en-US');
}

function read(f) {
  return fs.readFileSync(path.join(here, f), 'utf8');
}

export function loadCases() {
  return fs.readdirSync(here)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      const c = JSON.parse(read(f));
      if (!SLUG.test(c.slug) || `${c.slug}.json` !== f) throw new Error(`bad slug in ${f}`);
      for (const k of ['title', 'path_caption', 'seo_title', 'description', 'short', 'as_of', 'as_of_label', 'published', 'updated']) {
        if (!c[k]) throw new Error(`${f} is missing "${k}"`);
      }
      for (const g of Object.values(c.wallets)) {
        for (const a of g.addresses) if (!ADDRESS.test(a)) throw new Error(`bad address ${a} in ${f}`);
      }
      return c;
    })
    .sort((a, b) => a.case_number - b.case_number);
}

function head({ title, description, url, ld }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link rel="icon" type="image/png" sizes="32x32" href="/assets/favicon-32.png" />
  <link rel="apple-touch-icon" href="/assets/apple-touch-icon.png" />
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}" />
  <meta property="og:title" content="${esc(title)}" />
  <meta property="og:description" content="${esc(description)}" />
  <meta property="og:image" content="${SITE}/assets/social-card.png" />
  <meta property="og:url" content="${esc(url)}" />
  <meta property="og:type" content="article" />
  <meta property="og:site_name" content="XRPL-Utilities" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:site" content="@XRPL_Utilities" />
  <meta name="twitter:title" content="${esc(title)}" />
  <meta name="twitter:description" content="${esc(description)}" />
  <meta name="twitter:image" content="${SITE}/assets/social-card.png" />
  <link rel="canonical" href="${esc(url)}" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="/assets/tailwind.css?v=1" />
  <link rel="stylesheet" href="/assets/cases.css?v=${CSS_V}" />
  <style>
    html, body { background: #0a0a0a; overflow-x: clip; }
    body { min-width: 0; }
    .logo-glow { box-shadow: 0 0 18px rgba(0, 184, 255, 0.18); transition: box-shadow 0.25s ease; }
    .logo-glow:hover { box-shadow: 0 0 28px rgba(0, 184, 255, 0.45); }
    .nav-link { letter-spacing: 0.2em; text-transform: uppercase; font-size: 0.7rem; }
  </style>
  <script type="application/ld+json">
${JSON.stringify(ld, null, 2).replace(/</g, '\\u003c')}
  </script>
</head>
<body class="bg-ink text-white font-sans antialiased">
${read('chrome-header.html').trimEnd()}
`;
}

function foot() {
  return `${read('chrome-footer.html').trimEnd()}

  <script src="/assets/pages/cases.js?v=${JS_V}"></script>
  <script src="/assets/a11y.js?v=1"></script>
</body>
</html>
`;
}

const org = { '@type': 'Organization', '@id': `${SITE}/#org`, name: 'XRPL-Utilities', url: `${SITE}/` };

// Speed bar: log scale from one minute to 14 days, so four minutes and three
// days both read on the same bar.
export function speedPct(minutes) {
  if (typeof minutes !== 'number' || !(minutes > 0)) return null;
  const max = Math.log(14 * 24 * 60);
  return Math.max(4, Math.min(100, Math.round((Math.log(Math.max(1, minutes)) / max) * 100)));
}

function caseBody(c) {
  const h = c.headline;
  const exMax = Math.max(...c.exchanges.map((e) => e.xrp));
  const url = `${SITE}/cases/${c.slug}/`;

  const stops = c.timeline.map((t, i) => `
          <li class="stop reveal" style="--i:${i}">
            <span class="when">${esc(t.when)}</span>
            <h3>${esc(t.title)}</h3>
            <p>${esc(t.text)}</p>
          </li>`).join('');

  const legs = c.legs.map((l, i) => {
    const pct = speedPct(l.stay_minutes);
    return `
          <li class="leg reveal" style="--i:${i}">
            <div class="leg-top">
              <span class="leg-n">${i + 1}</span>
              <h3>${esc(l.name)}</h3>
            </div>
            <dl class="leg-facts">
              <div><dt>Wallets</dt><dd>${esc(l.wallets)}</dd></div>
              ${l.xrp == null ? '' : `<div><dt>XRP</dt><dd>${esc(fmtM(l.xrp))}</dd></div>`}
              <div><dt>How long it stayed</dt><dd>${esc(l.stay)}</dd></div>
            </dl>
            ${pct == null ? '' : `<div class="speed" role="img" aria-label="${esc(l.stay)}"><i style="--w:${pct}%"></i></div>`}
            <p class="leg-note">${esc(l.note)}</p>
          </li>`;
  }).join('');

  const bars = c.exchanges.map((e, i) => `
          <li class="ex reveal" style="--i:${i}">
            <span class="ex-name">${esc(e.name)}${e.label_note ? `<small>${esc(e.label_note)}</small>` : ''}</span>
            <span class="ex-bar"><i style="--w:${Math.max(1, Math.round((e.xrp / exMax) * 100))}%"></i></span>
            <span class="ex-val">${esc(fmtM(e.xrp))}</span>
          </li>`).join('');

  const groups = ['breach', 'split', 'hubs'].map((k) => {
    const g = c.wallets[k];
    return `
          <div class="wgroup">
            <h3>${esc(g.label)}</h3>
            <ul>${g.addresses.map((a) => `
              <li><a href="${EXPLORER}${esc(a)}" target="_blank" rel="noopener noreferrer"><code>${esc(a)}</code></a></li>`).join('')}
            </ul>
          </div>`;
  }).join('');

  const pctTxt = Math.round(h.to_exchanges_share * 100);
  return `
  <main id="main" class="case">
    <article class="cwrap">
      <nav class="crumbs" aria-label="Breadcrumb"><a href="/cases/">Case files</a> <span aria-hidden="true">/</span> Case ${esc(c.case_number)}</nav>
      <div class="hero">
        <div class="hero-text">
          <p class="kicker">Case file ${esc(c.case_number)}</p>
          <h1>${esc(c.title)}</h1>
        </div>
        <img src="/assets/img/xr-cases-512.webp" width="176" height="176" loading="eager" decoding="async" alt="Case files" class="hero-art" />
      </div>
      <p class="meta">Traced to exchange deposits as of ${esc(c.as_of_label)}. Published ${esc(fmtDate(c.published))}.</p>
      <p class="short">${esc(c.short)}</p>

      <section class="stats" aria-label="The case in three numbers">
        <div class="stat reveal" style="--i:0"><span class="n">${esc(fmtM(h.taken_xrp))}</span><span class="l">XRP taken on Oct 29</span></div>
        <div class="stat reveal" style="--i:1"><span class="n">about ${esc(Math.round(h.to_exchanges_xrp / 1e6))}M</span><span class="l">reached exchange deposits, about ${esc(pctTxt)}%</span></div>
        <div class="stat reveal" style="--i:2"><span class="n">${esc(h.days)} days</span><span class="l">from the first payment to the last</span></div>
      </section>

      <section aria-labelledby="t-path">
        <h2 id="t-path">The path at a glance</h2>
        <p class="sub">How many wallets the XRP passed through at each step.</p>
        <ol class="path">${c.legs.filter((l) => l.path_label).map((l, i) => `
          <li class="node reveal" style="--i:${i}"><span class="count">${esc(l.wallets)}</span><span class="what">${esc(l.path_label)}</span><span class="when">${esc(l.path_when)}</span></li>`).join('')}
          <li class="node end reveal" style="--i:${c.legs.filter((l) => l.path_label).length}"><span class="count">${esc(c.headline.venues)}</span><span class="what">exchanges and swap services</span><span class="when">${esc(c.headline.venues_when)}</span></li>
        </ol>
        <p class="fine">${esc(c.path_caption)}</p>
      </section>

      <section aria-labelledby="t-timeline">
        <h2 id="t-timeline">How it went, day by day</h2>
        <p class="sub">All times are US Eastern.</p>
        <ol class="timeline">${stops}
        </ol>
      </section>

      <section aria-labelledby="t-legs">
        <h2 id="t-legs">How fast it moved</h2>
        <p class="sub">Each step of the path, in order. The bar shows how long the money sat there before it moved on: short means minutes, long means days.</p>
        <ol class="legs">${legs}
        </ol>
      </section>

      <section aria-labelledby="t-where">
        <h2 id="t-where">Where it landed</h2>
        <p class="sub">XRP paid into deposit accounts at each exchange or swap service, Nov 5 to Nov 12.</p>
        <ul class="exchanges">${bars}
        </ul>
        <p class="fine">Exchange names come from public wallet labels, except where marked. Total about ${esc(Math.round(h.to_exchanges_xrp / 1e6))} million XRP.</p>
      </section>

      <section aria-labelledby="t-unknown">
        <h2 id="t-unknown">What we don't know</h2>
        <ul class="unknowns">${c.unknowns.map((u) => `
          <li>${esc(u)}</li>`).join('')}
        </ul>
      </section>

      <section aria-labelledby="t-wallets">
        <h2 id="t-wallets">The wallets</h2>
        <p class="sub">Every address below opens in a public ledger explorer, so you can check each step yourself.</p>
        <div class="wallets">${groups}
        </div>
      </section>

      <section aria-labelledby="t-check" class="check">
        <h2 id="t-check">Check these figures</h2>
        <p>Every figure on this page is in one data file, <a href="/cases/${esc(c.slug)}/data.json">data.json</a>. Each night we write a fingerprint of that file to the XRP Ledger, so anyone can confirm later that these numbers were published on that date and have not been changed. <a href="/verify/">Check any day on the Verify page</a>.</p>
      </section>

      <aside class="dyor">
        <p><strong>Do your own research.</strong> This page reports what public XRP Ledger records show. It does not say who controls any wallet or why the money moved. If you are thinking of dealing with any wallet named here, look into it yourself first.</p>
        <p>Spot a mistake? <a href="/contact/">Tell us</a>.</p>
      </aside>
    </article>
  </main>
`;
}

function fmtDate(iso) {
  const d = new Date(`${iso}T12:00:00Z`);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

function casePage(c) {
  const url = `${SITE}/cases/${c.slug}/`;
  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      org,
      {
        '@type': 'Article',
        '@id': `${url}#article`,
        headline: c.title,
        description: c.description,
        url,
        datePublished: c.published,
        dateModified: c.updated,
        inLanguage: 'en',
        author: { '@id': `${SITE}/#org` },
        publisher: { '@id': `${SITE}/#org` },
        image: `${SITE}/assets/social-card.png`,
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE}/` },
          { '@type': 'ListItem', position: 2, name: 'Case files', item: `${SITE}/cases/` },
          { '@type': 'ListItem', position: 3, name: c.title, item: url },
        ],
      },
    ],
  };
  return head({ title: c.seo_title, description: c.description, url, ld }) + caseBody(c) + '\n' + foot();
}

function hubPage(cases) {
  const url = `${SITE}/cases/`;
  const title = 'Case Files: XRP Ledger Events, Traced Step by Step';
  const description = 'Dated, facts-only replays of big moves on the XRP Ledger: where the money went, how fast it moved and what is still unknown.';
  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      org,
      {
        '@type': 'CollectionPage',
        '@id': `${url}#page`,
        name: title,
        description,
        url,
        inLanguage: 'en',
        publisher: { '@id': `${SITE}/#org` },
        mainEntity: {
          '@type': 'ItemList',
          itemListElement: cases.map((c, i) => ({ '@type': 'ListItem', position: i + 1, url: `${SITE}/cases/${c.slug}/`, name: c.title })),
        },
      },
    ],
  };
  const items = cases.map((c) => `
          <li><a href="/cases/${esc(c.slug)}/">
            <span class="num">Case ${esc(c.case_number)} &middot; ${esc(fmtDate(c.published))}</span>
            <span class="name">${esc(c.title)}</span>
            <span class="blurb">${esc(c.description)}</span>
          </a></li>`).join('');
  const body = `
  <main id="main" class="case">
    <article class="cwrap">
      <div class="hero">
        <div class="hero-text">
          <p class="kicker">Case files</p>
          <h1>Case files</h1>
        </div>
        <img src="/assets/img/xr-cases-512.webp" width="224" height="224" loading="eager" decoding="async" alt="Case files" class="hero-art big" />
      </div>
      <p class="short">Big moves on the XRP Ledger, replayed step by step from public records: where the money went, how fast it moved and what is still unknown. Facts only. We do not say who is behind any wallet.</p>
      <ul class="caselist">${items}
      </ul>
    </article>
  </main>
`;
  return head({ title, description, url, ld }) + body + '\n' + foot();
}

export function buildAll() {
  const cases = loadCases();
  const out = new Map();
  out.set('cases/index.html', hubPage(cases));
  for (const c of cases) {
    out.set(`cases/${c.slug}/index.html`, casePage(c));
    out.set(`cases/${c.slug}/data.json`, JSON.stringify(c, null, 2) + '\n');
  }
  return { out, cases };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { out } = buildAll();
  const check = process.argv.includes('--check');
  let stale = 0;
  for (const [rel, text] of out) {
    const p = path.join(repo, rel);
    const cur = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
    if (cur === text) continue;
    if (check) { console.error(`out of date: ${rel}`); stale++; continue; }
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, text);
    console.log(`wrote ${rel}`);
  }
  if (stale) process.exit(1);
}
