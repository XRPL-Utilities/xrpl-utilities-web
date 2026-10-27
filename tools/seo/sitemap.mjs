// Rewrites the <lastmod> dates in sitemap.xml from git history.
//
// The dates were typed by hand and sat at 2026-05-18 for five months while
// the pages changed weekly, so search engines had no reason to recrawl.
// Each page's date is the last commit that touched its HTML file, or today
// (UTC) when the file has uncommitted changes. Run it before committing a
// page change; tests/seo_test.mjs fails when a date falls behind.
//
//   node tools/seo/sitemap.mjs
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();

export function pageFile(loc) {
  const p = new URL(loc).pathname.replace(/^\//, '');
  return p ? p + 'index.html' : 'index.html';
}

export function lastChanged(file) {
  if (git('status', '--porcelain', '--', file)) return new Date().toISOString().slice(0, 10);
  return git('log', '-1', '--format=%cs', '--', file);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const sitemapPath = path.join(repo, 'sitemap.xml');
  const xml = fs.readFileSync(sitemapPath, 'utf8');
  const out = xml.replace(/(<loc>([^<]+)<\/loc>\s*<lastmod>)[^<]*(<\/lastmod>)/g, (m, pre, loc, post) => {
    const date = lastChanged(pageFile(loc));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`no git date for ${loc}`);
    return pre + date + post;
  });
  fs.writeFileSync(sitemapPath, out);
  console.log('sitemap.xml lastmod updated');
}
