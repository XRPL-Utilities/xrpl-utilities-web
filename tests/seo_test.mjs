// Search basics on xrpl-utilities.com (P1 audit, 2026-10-27).
//
// The audit found: seven meta descriptions past what search results show,
// sitemap dates frozen in May, a 307 on slashless page URLs, no 404 page,
// /status/ linked from nowhere, JSON-LD without WebSite, contactPoint or
// Lineage and missing offers on two paid services, and a 438 KB PNG as the
// favicon with no apple-touch-icon. Each check below pins one of those.
//
// Run: node tests/seo_test.mjs
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { pageFile, lastChanged } from '../tools/seo/sitemap.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(repo, f), 'utf8');
const git = (...a) => execFileSync('git', a, { cwd: repo, encoding: 'utf8' }).trim();
let fails = 0;
function check(name, cond, extra = '') {
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + extra));
  if (!cond) fails++;
}
const decode = (s) => s.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

const allHtml = git('ls-files', '*.html').split('\n').filter((f) => f && !f.startsWith('tools/'));
const pages = allHtml.filter((f) => f !== '404.html');

// ---- per-page head and footer -----------------------------------------------
for (const f of allHtml) {
  const s = read(f);
  const m = s.match(/<meta name="description" content="([^"]*)"/);
  const d = m ? decode(m[1]) : '';
  check(`${f}: meta description is 50 to 160 characters`, d.length >= 50 && d.length <= 160, `got ${d.length}`);
  check(`${f}: small favicon`, s.includes('<link rel="icon" type="image/png" sizes="32x32" href="/assets/favicon-32.png" />'));
  check(`${f}: apple-touch-icon`, s.includes('<link rel="apple-touch-icon" href="/assets/apple-touch-icon.png" />'));
  check(`${f}: logo.png is not the favicon`, !/rel="(icon|apple-touch-icon)"[^>]*logo\.png/.test(s));
  const footer = s.slice(s.indexOf('<footer'));
  check(`${f}: footer links to /status/`, footer.includes('href="/status/"'));
}
for (const [f, max] of [['assets/favicon-32.png', 8 * 1024], ['assets/apple-touch-icon.png', 40 * 1024], ['favicon.ico', 16 * 1024]]) {
  const size = fs.existsSync(path.join(repo, f)) ? fs.statSync(path.join(repo, f)).size : Infinity;
  check(`${f} exists and is under ${max / 1024} KB`, size <= max, `got ${size}`);
}

// ---- sitemap ----------------------------------------------------------------
{
  const xml = read('sitemap.xml');
  const entries = [...xml.matchAll(/<loc>([^<]+)<\/loc>\s*<lastmod>([^<]+)<\/lastmod>/g)].map((m) => ({ loc: m[1], lastmod: m[2] }));
  const listed = entries.map((e) => pageFile(e.loc)).sort();
  check('sitemap lists every page and nothing else', JSON.stringify(listed) === JSON.stringify([...pages].sort()), `listed ${listed} pages ${pages}`);
  check('sitemap leaves out the 404 page', !xml.includes('/404'));
  // Dates come from git, so the history has to be there to judge them.
  check('git history is available (CI checkout uses fetch-depth: 0)', git('rev-parse', '--is-shallow-repository') === 'false');
  const DAY = 86400000;
  for (const e of entries) {
    const changed = lastChanged(pageFile(e.loc));
    // A week of slack covers a squash merge landing a few days after the
    // date was generated; the May dates this replaced were five months out.
    check(`sitemap lastmod for ${e.loc} keeps up with the page`, Date.parse(e.lastmod) >= Date.parse(changed) - 7 * DAY, `lastmod ${e.lastmod}, page changed ${changed}`);
  }
  check('robots.txt points at the sitemap', read('robots.txt').includes('Sitemap: https://xrpl-utilities.com/sitemap.xml'));
}

// ---- JSON-LD on the home page -----------------------------------------------
{
  const m = read('index.html').match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  const graph = JSON.parse(m[1])['@graph'];
  const types = graph.map((i) => i['@type']);
  check('home JSON-LD has a WebSite', types.includes('WebSite'));
  const org = graph.find((i) => i['@type'] === 'Organization');
  check('home JSON-LD Organization has a contactPoint email', !!(org && org.contactPoint && /@xrpl-utilities\.com$/.test(org.contactPoint.email)));
  const apps = graph.filter((i) => i['@type'] === 'SoftwareApplication');
  for (const name of ['XR-Sentinel', 'XR-Telemetry', 'XR-Pulse', 'XR-Trust', 'XR-Vault', 'XR-Flows', 'XR-Lineage']) {
    const app = apps.find((a) => a.name === name);
    check(`home JSON-LD lists ${name} with an offer`, !!(app && app.offers && app.offers.price !== undefined));
  }
  for (const f of pages) {
    for (const block of read(f).matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
      let ok = true;
      try { JSON.parse(block[1]); } catch { ok = false; }
      check(`${f}: JSON-LD parses`, ok);
    }
  }
}

// ---- 404 page and redirects in the Worker -----------------------------------
{
  const has404 = fs.existsSync(path.join(repo, '404.html'));
  check('404.html exists', has404);
  const s = has404 ? read('404.html') : '';
  check('404.html is noindex', s.includes('<meta name="robots" content="noindex" />'));
  check('404.html has no canonical link', !s.includes('rel="canonical"'));

  const dirs = pages.filter((f) => f !== 'index.html').map((f) => '/' + f.replace(/\/index\.html$/, ''));
  const jsonc = read('wrangler.jsonc').replace(/^\s*\/\/.*$/gm, '');
  const rwf = JSON.parse(jsonc).assets.run_worker_first;
  for (const d of dirs) check(`wrangler routes ${d} to the Worker`, rwf.includes(d));

  const worker = (await import(pathToFileURL(path.join(repo, '_worker.js')).href + '?t=' + Date.now())).default;
  const NOT_FOUND_BODY = '<title>Page not found';
  const env = {
    ASSETS: {
      async fetch(req) {
        const p = new URL(req.url).pathname;
        if (p === '/404') return new Response(NOT_FOUND_BODY, { status: 200, headers: { 'content-type': 'text/html' } });
        if (p === '/pricing/') return new Response('pricing', { status: 200 });
        return new Response('', { status: 404 });
      },
    },
  };
  for (const d of dirs) {
    const r = await worker.fetch(new Request(`https://xrpl-utilities.com${d}?a=1`), env);
    check(`${d} answers 301 to ${d}/`, r.status === 301 && r.headers.get('location') === `https://xrpl-utilities.com${d}/?a=1`, `got ${r.status} ${r.headers.get('location')}`);
  }
  let r = await worker.fetch(new Request('https://xrpl-utilities.com/pricing/'), env);
  check('a real page passes through untouched', r.status === 200 && (await r.text()) === 'pricing');
  r = await worker.fetch(new Request('https://xrpl-utilities.com/no-such-page'), env);
  check('a missing page gets the 404 page with status 404', r.status === 404 && (await r.text()) === NOT_FOUND_BODY, `got ${r.status}`);
  r = await worker.fetch(new Request('https://xrpl-utilities.com/no-such-page', { method: 'POST', body: 'x' }), env);
  check('a missing POST target keeps the plain 404', r.status === 404 && (await r.text()) === '');
}

if (fails) {
  console.error(`\n${fails} check(s) failed`);
  process.exit(1);
}
console.log('\nseo checks passed');
