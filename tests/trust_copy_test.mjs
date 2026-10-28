// Trust page facts checked against the live service and the MCP server on
// 2026-10-28.
//
// - /scan's 402 offers RLUSD, XRP and USDC on Base; the page said XRP only
//   with "RLUSD coming in a follow-up".
// - The MCP lists had operator_drilldown (paid) and recent_events (free)
//   swapped (xrpl-utilities-mcp src/services/trust.ts authMode).
// - The onboarding tile summed issue and accept events but called them
//   credentials.
//
// Run: node tests/trust_copy_test.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(repo, 'trust/index.html'), 'utf8');
const js = fs.readFileSync(path.join(repo, 'assets/pages/trust-2.js'), 'utf8');
let fails = 0;
function check(name, cond) { console.log((cond ? 'PASS ' : 'FAIL ') + name); if (!cond) fails++; }

const block = (label) => {
  const i = html.indexOf(label);
  return i < 0 ? '' : html.slice(i, html.indexOf('</ul>', i));
};
const free = block('Free MCP tools');
const paid = block('Paid MCP tools');
check('drilldown is listed as paid', paid.includes('xrpl_trust_operator_drilldown') && !free.includes('xrpl_trust_operator_drilldown'));
check('recent_events is listed as free', free.includes('xrpl_trust_recent_events') && !paid.includes('xrpl_trust_recent_events'));
check('402 lists all three payment options', !html.includes('RLUSD coming') && html.includes('RLUSD, XRP and USDC on Base'));
check('tile counts events, not credentials', !js.includes("'Credentials issued or accepted (30d)'"));
check('the usage line is not built from the API narrative', js.includes('narr.textContent = usageSentence(eco)'));
// Account addresses ran past the activity cards on phones (2026-10-28).
check('activity rows wrap long addresses', js.includes('text-sm text-white break-words min-w-0 max-w-full'));
console.log(fails ? `${fails} FAILED` : 'trust copy: ok');
process.exit(fails ? 1 : 0);
