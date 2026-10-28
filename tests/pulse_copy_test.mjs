// Pulse page facts checked against the live service on 2026-10-28.
//
// - The RLUSD badge said "(24h)" next to a live supply while carrying the
//   change between the last two daily readings.
// - The feed's default floor is $1M (WHALE_FEED_MIN_USD), not $100k.
// - The ESMA feed has been down (HTTP 403) and is not a live source.
// - Choreography dollar figures used to sum the same money at every hop.
//
// Run: node tests/pulse_copy_test.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(repo, 'pulse/index.html'), 'utf8');
const js = fs.readFileSync(path.join(repo, 'assets/pages/pulse.js'), 'utf8');
let fails = 0;
function check(name, cond) { console.log((cond ? 'PASS ' : 'FAIL ') + name); if (!cond) fails++; }

check('badge uses the change since the midnight reading', js.includes('live_change_since_snapshot') && js.includes("'since 00:00 UTC'"));
check('badge no longer labels the daily-reading change as 24h', !js.includes("net minted (24h)") && !js.includes("net redeemed (24h)"));
check('feed default floor stated as $1M', html.includes('(default $1M;') && !html.includes('default $100k'));
check('ESMA not listed as a source', !/ESMA/.test(html));
check('no developer endpoint text in the page body', !html.includes('Need more than 24 hours?'));
console.log(fails ? `${fails} FAILED` : 'pulse copy: ok');
process.exit(fails ? 1 : 0);
