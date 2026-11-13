// Rules for the /cases/ section ("Case files", 2026-11-13).
//
// A case file replays a ledger event from public records. The operator's
// rules for them: facts only and no allegations, no people's names, no
// deposit tags (each one points at one customer's account), nothing about
// how a trace was done, no talk of reporting anyone, times in US Eastern,
// and no AI-sounding copy. Each check below holds the pages to one of those,
// so a later case that slips fails CI instead of going out.
//
// Run: node tests/cases_test.mjs
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildAll, speedPct, fmtM } from '../tools/cases/build.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(repo, f), 'utf8');
let fails = 0;
function check(name, cond, extra = '') {
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + extra));
  if (!cond) fails++;
}

const { out, cases } = buildAll();

// ---- built files match the sources -------------------------------------------
for (const [rel, text] of out) {
  const cur = fs.existsSync(path.join(repo, rel)) ? read(rel) : null;
  check(`${rel} is up to date with tools/cases (run node tools/cases/build.mjs)`, cur === text);
}
const tracked = execFileSync('git', ['ls-files', 'cases'], { cwd: repo, encoding: 'utf8' }).split('\n').filter(Boolean);
const untracked = execFileSync('git', ['ls-files', '--others', '--exclude-standard', 'cases'], { cwd: repo, encoding: 'utf8' }).split('\n').filter(Boolean);
for (const f of [...tracked, ...untracked]) check(`${f} is built from tools/cases`, out.has(f));

// ---- words that make an allegation, name a group, leak method or suggest reporting
const ALLEGATION = /\b(launder\w*|attacker\w*|hacker\w*|thie(f|ves)|criminal\w*|scam\w*|fraud\w*|stolen|steal\w*|culprit\w*|perpetrator\w*|guilty)\b/i;
const GROUPS = /\b(DPRK|North Korea\w*|Lazarus|TraderTraitor|Kim\s+Jong)\b/i;
const REPORTING = /\b(report(ed|ing|s)? (it|them|this|to)|abuse report|tip[- ]off|law enforcement|police|FBI|freez(e|ing) (the|their))\b/i;
const METHOD = /\b(account_tx|account_info|xrplcluster|s1\.ripple|QuickNode|threshold|our method|how we traced|we traced it by|Elasticsearch|via XRPS(can|CAN)|from XRPS(can|CAN))\b/i;
const AI_TELLS = /\b(delve\w*|dive into|deep dive|unlock\w*|unleash\w*|leverag\w*|landscape|realm|robust|seamless\w*|game[- ]changer|revolution\w*|tapestry|journey|embark|elevate|empower|harness|paradigm|synergy|cutting-edge|testament to|in conclusion|in summary|massive|insane|skyrocket\w*)\b/i;

for (const [rel, text] of out) {
  const body = rel.endsWith('.html')
    ? text.slice(text.indexOf('<main'), text.indexOf('</main>')).replace(/<[^>]+>/g, ' ')
    : text;
  const head = rel.endsWith('.html') ? text.slice(0, text.indexOf('<body')) : '';
  const all = body + ' ' + head;
  for (const [name, re] of [['allegation words', ALLEGATION], ['group or person names', GROUPS], ['reporting talk', REPORTING], ['method words', METHOD], ['AI-sounding words', AI_TELLS]]) {
    const m = all.match(re);
    check(`${rel}: no ${name}`, !m, m && m[0]);
  }
  check(`${rel}: no em or en dashes`, !/[—–]/.test(text));
  check(`${rel}: times in Eastern, never UTC or GMT`, !/\b(UTC|GMT|Z\b)/.test(body.replace(/r[1-9A-HJ-NP-Za-km-z]{24,34}/g, '')));
  // Deposit tags are long bare integers. Figures on the page are formatted
  // (233.5M, 233,461,943), so any 6+ digit run in the visible text is a tag.
  if (rel.endsWith('.html')) {
    const visible = body.replace(/r[1-9A-HJ-NP-Za-km-z]{24,34}/g, '');
    const tag = visible.match(/\b\d{6,}\b/);
    check(`${rel}: no deposit tags or other long bare numbers`, !tag, tag && tag[0]);
    for (const m of text.matchAll(/href="([^"]+)"/g)) {
      const ok = /^https:\/\/[^\s"'<>]+$/.test(m[1]) || /^\/[A-Za-z0-9/_#.?=-]*$/.test(m[1]) || /^#[a-z0-9-]+$/.test(m[1]);
      check(`${rel}: link ${m[1]} is https or on this site`, ok);
    }
    check(`${rel}: footer links to /cases/`, text.slice(text.indexOf('<footer')).includes('href="/cases/"'));
    check(`${rel}: uses the shared footer disclaimer`, text.includes('Not investment, legal or compliance advice.'));
  }
}

// ---- each case's figures add up ----------------------------------------------
for (const c of cases) {
  const json = JSON.stringify(c);
  check(`${c.slug}: data has no tag fields`, !/"[^"]*tag[^"]*"\s*:/i.test(json));
  const sum = c.exchanges.reduce((a, e) => a + e.xrp, 0);
  check(`${c.slug}: exchange rows add up to the headline total (within 0.5%)`, Math.abs(sum - c.headline.to_exchanges_xrp) / c.headline.to_exchanges_xrp < 0.005, `rows ${sum} headline ${c.headline.to_exchanges_xrp}`);
  const share = c.headline.to_exchanges_xrp / c.headline.taken_xrp;
  check(`${c.slug}: headline share matches the two totals`, Math.round(share * 100) === Math.round(c.headline.to_exchanges_share * 100), `${share}`);
  check(`${c.slug}: headline never says fully traced`, !/fully traced/i.test(json));
  for (const l of c.legs) {
    check(`${c.slug}: leg "${l.name}" has a measured stay`, typeof l.stay_minutes === 'number' && l.stay_minutes > 0 && !/TBD/.test(l.stay + l.note), l.stay);
  }
  check(`${c.slug}: timeline times are written in ET form`, c.timeline.every((t) => /^(Oct|Nov|Dec|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep) \d{1,2}/.test(t.when)));
  check(`${c.slug}: as-of label is Eastern`, / ET$/.test(c.as_of_label));
}

// ---- helpers -------------------------------------------------------------------
check('speed bar is longer for a longer stay', speedPct(4) < speedPct(4783) && speedPct(4783) < speedPct(10080));
check('speed bar stays inside 4..100', speedPct(0.1) === 4 && speedPct(1e9) === 100 && speedPct(null) === null);
check('fmtM rounds big figures to one decimal', fmtM(233461943.1) === '233.5M' && fmtM(2790000) === '2.79M');

// ---- every page footer points at the section ----------------------------------
const pages = execFileSync('git', ['ls-files', '*.html'], { cwd: repo, encoding: 'utf8' }).split('\n')
  .filter((f) => f && !f.startsWith('tools/') && !f.startsWith('learn/') && f !== '404.html');
for (const f of pages) {
  const s = read(f);
  if (!s.includes('<footer')) continue;
  check(`${f}: footer links to /cases/`, s.slice(s.indexOf('<footer')).includes('href="/cases/"'));
}

if (fails) {
  console.error(`\n${fails} check(s) failed`);
  process.exit(1);
}
console.log('\ncases checks passed');
