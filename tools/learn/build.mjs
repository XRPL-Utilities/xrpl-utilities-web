// Builds the /learn/ lesson pages from tools/learn/lessons/*.md.
//
// Each lesson is written in a small markdown subset (## headings, paragraphs,
// "- " and "1. " lists, **bold**, [text](url) links, and "?? question" lines
// for the common-questions section, and "::: name" to drop in a figure or
// hands-on widget from tools/learn/widgets/name.html). Keeping the copy in one plain file per
// lesson means the words can be reviewed on their own, and every page gets
// the same head, structured data and layout.
//
// The lesson pages leave out the product menu, pricing and product links on
// purpose: they are entries for XRP Ledger Education Month, whose rules bar
// promoting a project. tests/learn_test.mjs holds them to that.
//
// Publishing a lesson: set "published": true in lessons.json, run this, then
// add the page to sitemap.xml and its slashless path to PAGE_DIRS in
// _worker.js and run_worker_first in wrangler.jsonc (tests/seo_test.mjs
// fails until all three are done).
//
//   node tools/learn/build.mjs          write learn/**/index.html
//   node tools/learn/build.mjs --check  exit 1 if a page is out of date
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const SITE = 'https://xrpl-utilities.com';
const manifest = JSON.parse(fs.readFileSync(path.join(here, 'lessons.json'), 'utf8'));

export function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Links may only point at https pages or at this site. Anything else (a
// javascript: URL, say) is a mistake in the source and stops the build.
function safeHref(url) {
  if (/^https:\/\/[^\s"'<>]+$/.test(url) || /^\/[A-Za-z0-9/_#.-]*$/.test(url)) return url;
  throw new Error(`refusing link target: ${url}`);
}

export function inline(text) {
  let out = '';
  const re = /\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    out += esc(text.slice(last, m.index));
    if (m[1] !== undefined) {
      const href = safeHref(m[2]);
      // Links inside a lesson open in a new tab so the reader keeps their place.
      out += `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(m[1])}</a>`;
    } else {
      out += `<strong>${esc(m[3])}</strong>`;
    }
    last = m.index + m[0].length;
  }
  return out + esc(text.slice(last));
}

const plain = (text) => text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/\*\*([^*]+)\*\*/g, '$1');

function widget(name) {
  if (!/^[a-z0-9-]+$/.test(name)) throw new Error(`bad widget name: ${name}`);
  const file = path.join(here, 'widgets', `${name}.html`);
  if (!fs.existsSync(file)) throw new Error(`no widget ${name} in tools/learn/widgets`);
  return fs.readFileSync(file, 'utf8').trim();
}

export function parseLesson(src) {
  const [headRaw, ...rest] = src.split(/^---$/m);
  const meta = {};
  for (const line of headRaw.split('\n')) {
    const m = line.match(/^(\w+):\s*(.+)$/);
    if (m) meta[m[1]] = m[2].trim();
  }
  for (const k of ['title', 'description', 'h1', 'updated', 'short']) {
    if (!meta[k]) throw new Error(`lesson is missing "${k}"`);
  }
  // The picture at the top of the page: "hero: name" in the head, or the
  // shared chain picture.
  const hero = widget(meta.hero || 'hero-chain');
  const body = rest.join('---');
  const blocks = body.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  const html = [];
  const faq = [];
  const toc = [];
  let scripted = false;
  let words = meta.short.split(/\s+/).length;
  for (const b of blocks) {
    words += plain(b).split(/\s+/).length;
    if (b.startsWith('## ')) {
      const title = b.slice(3).trim();
      const id = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      toc.push({ id, title: plain(title) });
      html.push(`<h2 id="${id}">${inline(title)}</h2>`);
    } else if (b.startsWith('::: ')) {
      const w = widget(b.slice(4).trim());
      if (/data-widget=/.test(w)) scripted = true;
      words += plain(w.replace(/<[^>]+>/g, ' ')).split(/\s+/).length;
      html.push(w.replace(/\n/g, '\n      '));
    } else if (b.startsWith('?? ')) {
      const [q, ...a] = b.slice(3).split('\n');
      const answer = a.join(' ').trim();
      if (!answer) throw new Error(`question has no answer: ${q}`);
      faq.push({ q: plain(q.trim()), a: plain(answer) });
      const open = faq.length === 1 ? ' open' : '';
      html.push(`<details class="faq"${open}><summary><h3>${inline(q.trim())}</h3><span class="plus" aria-hidden="true"></span></summary><p>${inline(answer)}</p></details>`);
    } else if (/^- /.test(b)) {
      const items = b.split(/\n(?=- )/).map((i) => `<li>${inline(i.replace(/^- /, '').replace(/\n/g, ' '))}</li>`);
      html.push(`<ul>${items.join('')}</ul>`);
    } else if (/^\d+\. /.test(b)) {
      const items = b.split(/\n(?=\d+\. )/).map((i) => `<li>${inline(i.replace(/^\d+\. /, '').replace(/\n/g, ' '))}</li>`);
      html.push(`<ol>${items.join('')}</ol>`);
    } else {
      html.push(`<p>${inline(b.replace(/\n/g, ' '))}</p>`);
    }
  }
  return { meta, html, faq, toc, hero, scripted: scripted || /data-widget=/.test(hero), minutes: Math.max(1, Math.round(words / 200)) };
}

const longDate = (iso) => new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
const fullDate = (iso) => new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

// JSON inside <script> must not be able to close the tag.
const ld = (obj) => JSON.stringify(obj, null, 2).replace(/</g, '\\u003c');

function head({ title, description, url, type, published, modified, graph, scripted, image = `${SITE}/assets/social-card.png` }) {
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
  <meta property="og:image" content="${image}" />
  <meta property="og:url" content="${url}" />
  <meta property="og:type" content="${type}" />
  <meta property="og:site_name" content="XRPL-Utilities" />${published ? `
  <meta property="article:published_time" content="${published}" />
  <meta property="article:modified_time" content="${modified}" />` : ''}
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:site" content="@XRPL_Utilities" />
  <meta name="twitter:title" content="${esc(title)}" />
  <meta name="twitter:description" content="${esc(description)}" />
  <meta name="twitter:image" content="${image}" />
  <link rel="canonical" href="${url}" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="/assets/learn.css?v=5" />${scripted ? '\n  <script src="/assets/pages/learn.js?v=5" defer></script>' : ''}
  <script type="application/ld+json">
${ld({ '@context': 'https://schema.org', '@graph': graph })}
  </script>
</head>
<body>
  <a href="#main" class="skip">Skip to content</a>
  <header class="site">
    <div class="wide bar">
      <a href="/learn/" class="brand">
        <img src="/assets/img/logo-mark-128.webp" width="32" height="32" loading="eager" decoding="async" alt="" />
        <span>XRPL-Utilities <em>Learn</em></span>
      </a>
      <nav aria-label="Lessons"><a href="/learn/">All lessons</a></nav>
    </div>
  </header>
`;
}

const FOOT = `  <footer class="site">
    <div class="wide">
      <p>Written by XRPL-Utilities for XRP Ledger Education Month. ${esc(manifest.hashtag)}</p>
      <p>For learning only. This is not financial advice, and nothing here is a reason to buy anything.</p>
      <p class="links"><a href="/learn/">All lessons</a> <a href="/contact/">Contact</a> <a href="/privacy/">Privacy</a> <a href="/terms/">Terms</a> <a href="/status/">Site status</a></p>
    </div>
  </footer>
</body>
</html>
`;

const ORG = { '@type': 'Organization', '@id': `${SITE}/#org`, name: 'XRPL-Utilities', url: `${SITE}/` };
const crumbs = (items) => ({
  '@type': 'BreadcrumbList',
  itemListElement: items.map(([name, url], i) => ({ '@type': 'ListItem', position: i + 1, name, item: url })),
});

function lessonPage(entry, lesson) {
  const url = `${SITE}/learn/${entry.slug}/`;
  // A lesson's own share card, when tools/learn/card.mjs has made one.
  const card = `assets/img/learn/${entry.slug}.png`;
  const image = fs.existsSync(path.join(repo, card)) ? `${SITE}/${card}` : `${SITE}/assets/social-card.png`;
  const { meta, html, faq, toc, hero, minutes, scripted } = lesson;
  const total = manifest.lessons.length;
  const prev = manifest.lessons.find((l) => l.n === entry.n - 1);
  const next = manifest.lessons.find((l) => l.n === entry.n + 1);
  const pager = [];
  if (prev) pager.push(`<a class="prev" href="/learn/${prev.slug}/"><span>Previous lesson</span>${esc(prev.name)}</a>`);
  if (next) {
    pager.push(next.published
      ? `<a class="next" href="/learn/${next.slug}/"><span>Next lesson</span>${esc(next.name)}</a>`
      : `<div class="next soon"><span>Next lesson, ${esc(longDate(next.date))}</span>${esc(next.name)}</div>`);
  }
  const graph = [
    ORG,
    {
      '@type': 'Article',
      '@id': `${url}#article`,
      headline: meta.h1,
      description: meta.description,
      url,
      mainEntityOfPage: url,
      datePublished: entry.date,
      dateModified: meta.updated,
      inLanguage: 'en',
      author: { '@id': `${SITE}/#org` },
      publisher: { '@id': `${SITE}/#org` },
      image,
      isPartOf: { '@type': 'Course', name: 'Learn the XRP Ledger', url: `${SITE}/learn/` },
    },
    crumbs([['Learn', `${SITE}/learn/`], [meta.h1, url]]),
  ];
  if (faq.length) {
    graph.push({
      '@type': 'FAQPage',
      '@id': `${url}#faq`,
      mainEntity: faq.map(({ q, a }) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
    });
  }
  return head({ title: meta.title, description: meta.description, url, type: 'article', published: entry.date, modified: meta.updated, graph, scripted, image })
    + `  <main id="main">
    <div class="hero">
      <div class="wide hero-grid">
        <div class="hero-text">
          <nav class="crumbs" aria-label="Breadcrumb"><a href="/learn/">Learn</a> <span aria-hidden="true">/</span> Lesson ${entry.n}</nav>
          <p class="kicker">Lesson ${entry.n} of ${total} <span aria-hidden="true">&middot;</span> ${esc(manifest.series)}</p>
          <h1>${inline(meta.h1)}</h1>
          <p class="meta">Updated <time datetime="${meta.updated}">${fullDate(meta.updated)}</time> <span aria-hidden="true">&middot;</span> ${minutes} minute read</p>
          <div class="short"><strong>The short answer:</strong> ${inline(meta.short)}</div>
        </div>
        <div class="hero-art">
          ${hero.replace(/\n/g, '\n          ')}
        </div>
      </div>
    </div>
    <div class="wide body-grid">
      <article class="lesson">
        ${html.join('\n        ')}
        <nav class="pager" aria-label="More lessons">${pager.join('')}</nav>
      </article>
      <nav class="toc" aria-label="On this page">
        <p>On this page</p>
        <ol>${toc.map((t) => `<li><a href="#${t.id}">${esc(t.title)}</a></li>`).join('')}</ol>
      </nav>
    </div>
  </main>
` + FOOT;
}

function hubPage(lessons) {
  const url = `${SITE}/learn/`;
  const title = 'Learn the XRP Ledger: Free Plain-English Lessons';
  const description = 'Free lessons on how the XRP Ledger works, written for people who have only heard of Bitcoin. No jargon, no price talk, just how it works.';
  const live = manifest.lessons.filter((l) => l.published);
  const graph = [
    ORG,
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
        itemListElement: live.map((l, i) => ({ '@type': 'ListItem', position: i + 1, url: `${SITE}/learn/${l.slug}/`, name: l.name })),
      },
    },
    crumbs([['Learn', url]]),
  ];
  const items = manifest.lessons.map((l) => {
    const blurb = l.published ? esc(lessons.get(l.slug).meta.short) : '';
    return l.published
      ? `<li><a href="/learn/${l.slug}/"><span class="num">Lesson ${l.n}</span><span class="name">${esc(l.name)}</span><span class="blurb">${blurb}</span></a></li>`
      : `<li class="soon"><div><span class="num">Lesson ${l.n}, coming ${esc(longDate(l.date))}</span><span class="name">${esc(l.name)}</span></div></li>`;
  });
  return head({ title, description, url, type: 'website', graph })
    + `  <main id="main">
    <div class="wrap hub">
      <p class="kicker">XRP Ledger Education Month</p>
      <h1>Learn the XRP Ledger</h1>
      <p class="lead">Eight short lessons on how the XRP Ledger works, written for anyone who has heard of Bitcoin and wants to know what else is out there. Every fact links to the official XRP Ledger docs, and every lesson shows you something real on the ledger that you can check yourself.</p>
      <ol class="lessons">
        ${items.join('\n        ')}
      </ol>
    </div>
  </main>
` + FOOT;
}

export function buildAll() {
  const out = new Map();
  const lessons = new Map();
  for (const entry of manifest.lessons.filter((l) => l.published)) {
    const src = fs.readFileSync(path.join(here, 'lessons', `${entry.slug}.md`), 'utf8');
    lessons.set(entry.slug, parseLesson(src));
    out.set(`learn/${entry.slug}/index.html`, lessonPage(entry, lessons.get(entry.slug)));
  }
  out.set('learn/index.html', hubPage(lessons));
  return { out, lessons, manifest };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes('--check');
  let stale = 0;
  for (const [rel, html] of buildAll().out) {
    const file = path.join(repo, rel);
    const cur = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
    if (cur === html) continue;
    if (check) { stale++; console.log(`out of date: ${rel}`); continue; }
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, html);
    console.log(`wrote ${rel}`);
  }
  if (check && stale) { console.error('run: node tools/learn/build.mjs'); process.exit(1); }
}
