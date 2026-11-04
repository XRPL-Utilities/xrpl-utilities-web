// Terms coverage, from the 2026-11-04 readiness check:
// - XR-Ledger and the MCP server were not named in the terms, and the
//   machine-readable /tos list had no XR-Ledger entry.
// - Owner names on the whale page had no note saying they are attributions
//   that can be wrong, and no way to report a mistake.
//
// Run: node tests/terms_coverage_test.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const terms = fs.readFileSync(path.join(repo, 'terms/index.html'), 'utf8');
const whales = fs.readFileSync(path.join(repo, 'whales/index.html'), 'utf8');
const text = (h) => h.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ');
let fails = 0;
function check(name, cond) { console.log((cond ? 'PASS ' : 'FAIL ') + name); if (!cond) fails++; }

const scope = text(terms.slice(terms.indexOf('1. Scope of Service'), terms.indexOf('2. Nature of Data')));
check('scope names XR-Ledger', scope.includes('XR-Ledger'));
check('scope names the MCP server', /MCP server/.test(scope));
check('terms link the XR-Ledger /tos', terms.includes('https://ledger.xrpl-utilities.io/tos'));
check('terms cover account statements', /not tax, accounting or audit documents/.test(text(terms)));
check('terms say owner names can be wrong', /Owner names and labels\. .*can be wrong/.test(text(terms)));
check('whale page says owner names can be wrong', /Owner names are our attribution .*can be wrong/.test(text(whales)));
check('whale page links a way to report a mistake', /href="\/contact\/"[^>]*>Tell us</.test(whales));
check('no em dashes added', !terms.includes('—') && !whales.includes('—'));

if (fails) { console.error(`${fails} check(s) failed`); process.exit(1); }
