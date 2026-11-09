// Rules for the /learn/ lesson pages (XRP Ledger Education Month, 2026-11-09).
//
// The Foundation's rules make an entry ineligible if it promotes a project or
// talks price, and they score accuracy against xrpl.org. The operator also
// wants every lesson to read like a person wrote it. Each check below holds
// the pages to one of those, so a later lesson that slips fails CI instead of
// going out.
//
// Run: node tests/learn_test.mjs
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildAll, inline, parseLesson } from '../tools/learn/build.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(repo, f), 'utf8');
let fails = 0;
function check(name, cond, extra = '') {
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + extra));
  if (!cond) fails++;
}

// Words and patterns that make copy read as machine-written. Matched as whole
// words, case-insensitive, across the lesson sources and the built pages.
const AI_TELLS = [
  'delve', 'delves', 'delving', 'dive in', 'dive into', 'deep dive', 'unlock', 'unlocks', 'unleash', 'leverage',
  'leverages', 'landscape', 'realm', 'robust', 'seamless', 'seamlessly', 'game-changer', 'game changer',
  'revolutionize', 'revolutionizes', 'revolutionary', 'tapestry', 'journey', 'in today\'s world',
  'it\'s important to note', 'it is important to note', 'let\'s break it down', 'here\'s the kicker',
  'navigate the', 'embark', 'elevate', 'empower', 'harness', 'paradigm', 'synergy', 'cutting-edge',
  'ever-evolving', 'testament to', 'in conclusion', 'in summary', 'massive', 'insane', 'skyrocket',
];
const tellRe = new RegExp(`\\b(${AI_TELLS.map((w) => w.replace(/[-']/g, (c) => '\\' + c)).join('|')})\\b`, 'i');
const notJustRe = /\bnot just\b[^.]{0,60}\bit'?s\b/i;

// Price and promotion talk the Foundation's rules rule out.
const PROMO = /\$\s?\d|\$XRP|\$RLUSD|\bprice[sd]?\b|\binvest(ment|ing|or)?s?\b|\bprofit|\bbullish|\bbearish|\bto the moon\b|\bbuy\b|\bhodl\b/i;

// Our own product pages and APIs. A lesson page may not link to any of them.
const PRODUCT = /^\/(start|sentinel|telemetry|pulse|trust|vault|flows|lineage|pricing|build|whales|tip|verify)\b|xrpl-utilities\.io/;
const ALLOWED_LOCAL = /^\/(learn\/[a-z0-9-]*\/?|contact\/|privacy\/|terms\/|status\/)?$/;

const { out, lessons, manifest } = buildAll();

// ---- built pages match the sources ------------------------------------------
for (const [rel, html] of out) {
  const cur = fs.existsSync(path.join(repo, rel)) ? read(rel) : null;
  check(`${rel} is up to date with tools/learn (run node tools/learn/build.mjs)`, cur === html);
}
const tracked = execFileSync('git', ['ls-files', 'learn'], { cwd: repo, encoding: 'utf8' }).split('\n').filter(Boolean);
const untracked = execFileSync('git', ['ls-files', '--others', '--exclude-standard', 'learn'], { cwd: repo, encoding: 'utf8' }).split('\n').filter(Boolean);
for (const f of [...tracked, ...untracked]) check(`${f} is built from a published lesson`, out.has(f));

// ---- every page --------------------------------------------------------------
for (const [rel, html] of out) {
  const main = html.slice(html.indexOf('<main'), html.indexOf('</main>'));
  const text = html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, ' ');
  const tell = text.match(tellRe);
  check(`${rel}: no AI-sounding words`, !tell, tell && tell[0]);
  check(`${rel}: no "not just X, it's Y" lines`, !notJustRe.test(text));
  check(`${rel}: no em or en dashes`, !/[–—]|&mdash;|&ndash;|&#821[12];/.test(html));
  const promo = main.replace(/<[^>]+>/g, ' ').match(PROMO);
  check(`${rel}: no price or promotion talk in the lesson`, !promo, promo && promo[0]);
  for (const m of html.matchAll(/href="([^"]+)"/g)) {
    const href = m[1];
    if (href.startsWith('/assets/') || href.startsWith('#')) continue;
    const ok = href.startsWith('https://') ? !PRODUCT.test(href) : ALLOWED_LOCAL.test(href) && !PRODUCT.test(href);
    check(`${rel}: link ${href} is not a product page`, ok);
  }
  check(`${rel}: footer carries ${manifest.hashtag}`, html.slice(html.indexOf('<footer')).includes(manifest.hashtag));
  check(`${rel}: footer says it is not financial advice`, /not financial advice/.test(html.slice(html.indexOf('<footer'))));
  const scripts = [...html.matchAll(/<script\b([^>]*)>/g)].map((m) => m[1]);
  check(`${rel}: no inline or third-party scripts`, scripts.every((a) => /type="application\/ld\+json"/.test(a) || /^ src="\/assets\/pages\/learn\.js\?v=\d+" defer$/.test(a)));
  check(`${rel}: loads learn.js only when it has a widget`, scripts.some((a) => a.includes('learn.js')) === /data-widget="/.test(html));
  const ld = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  let graph = [];
  try { graph = JSON.parse(ld[1])['@graph']; } catch { /* reported below */ }
  check(`${rel}: JSON-LD parses and has a breadcrumb`, graph.some((g) => g['@type'] === 'BreadcrumbList'));
  const title = (html.match(/<title>([^<]*)<\/title>/) || [])[1] || '';
  check(`${rel}: title is 30 to 60 characters`, title.length >= 30 && title.length <= 60, `got ${title.length}`);
  check(`${rel}: one h1`, (html.match(/<h1\b/g) || []).length === 1);
}

// ---- lesson pages ------------------------------------------------------------
for (const l of manifest.lessons.filter((x) => x.published)) {
  const rel = `learn/${l.slug}/index.html`;
  const html = out.get(rel);
  const lesson = lessons.get(l.slug);
  const graph = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1])['@graph'];
  const art = graph.find((g) => g['@type'] === 'Article');
  check(`${rel}: Article has publish and update dates`, !!(art && art.datePublished === l.date && /^\d{4}-\d{2}-\d{2}$/.test(art.dateModified)));
  const faq = graph.find((g) => g['@type'] === 'FAQPage');
  check(`${rel}: common questions are in FAQPage data`, !!faq && faq.mainEntity.length === lesson.faq.length && lesson.faq.length >= 3);
  check(`${rel}: short answer is 50 words or fewer`, lesson.meta.short.split(/\s+/).length <= 50);
  check(`${rel}: has a "See it for yourself" section`, /<h2 id="see-it-for-yourself">/.test(html));
  check(`${rel}: has a glossary`, /<h2 id="words-used-in-this-lesson">/.test(html));
  const sources = html.slice(html.indexOf('<h2 id="sources">'));
  check(`${rel}: sources cite xrpl.org`, /href="https:\/\/xrpl\.org\//.test(sources));
  const sentences = lesson.html.join('').split(/<\/(?:p|li|h\d)>/).flatMap((b) => b.replace(/<[^>]+>/g, ' ').split(/(?<=[.?!])\s+/));
  const long = sentences.filter((s) => s.split(/\s+/).filter(Boolean).length > 30);
  check(`${rel}: no sentence over 30 words`, long.length === 0, long[0]);
  check(`${rel}: listed in the sitemap`, read('sitemap.xml').includes(`https://xrpl-utilities.com/learn/${l.slug}/`));
}
check('the hub is in the sitemap', read('sitemap.xml').includes('<loc>https://xrpl-utilities.com/learn/</loc>'));
check('unpublished lessons have no page', manifest.lessons.filter((x) => !x.published).every((x) => !out.has(`learn/${x.slug}/index.html`) || manifest.lessons.some((y) => y.published && y.slug === x.slug)));
check('lesson numbers run 1..n', manifest.lessons.every((l, i) => l.n === i + 1));
check('lesson slugs are unique', new Set(manifest.lessons.map((l) => l.slug)).size === manifest.lessons.length);

// ---- widget script -----------------------------------------------------------
// learn.js shows data from a third-party explorer, so it must only ever write
// text: no innerHTML, insertAdjacentHTML or document.write.
{
  const js = read('assets/pages/learn.js');
  check('learn.js writes no HTML strings', !/innerHTML|outerHTML|insertAdjacentHTML|document\.write/.test(js));
  check('learn.js only calls the one explorer host', [...js.matchAll(/https:\/\/[a-z0-9.-]+/g)].every((m) => ['https://api.xrpscan.com', 'https://livenet.xrpl.org'].includes(m[0])));
  for (const w of fs.readdirSync(path.join(repo, 'tools/learn/widgets'))) {
    const h = read(`tools/learn/widgets/${w}`);
    check(`widget ${w} has no script or inline handler`, !/<script|\son[a-z]+=/i.test(h));
  }
}

// ---- the markdown converter escapes and refuses bad links -------------------
check('inline escapes HTML', inline('<img src=x onerror=alert(1)>') === '&lt;img src=x onerror=alert(1)&gt;');
check('inline escapes inside link text', inline('[<b>x</b>](https://xrpl.org/)').includes('&lt;b&gt;'));
let threw = false;
try { inline('[x](javascript:alert(1))'); } catch { threw = true; }
check('inline refuses a javascript: link', threw);
threw = false;
try { inline('[x](https://xrpl.org/" onmouseover="a)'); } catch { threw = true; }
check('inline refuses a link that breaks out of the attribute', threw || !inline('[x](https://xrpl.org/" onmouseover="a)').includes('onmouseover="'));
threw = false;
try { parseLesson('title: x\n---\nbody'); } catch { threw = true; }
check('a lesson missing its head fields does not build', threw);

if (fails) {
  console.error(`\n${fails} learn check(s) failed`);
  process.exit(1);
}
console.log('\nlearn checks passed');
