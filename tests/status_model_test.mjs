// Drives assets/status-model.js with real /healthz payloads captured from all
// six services on 2026-10-26 (tests/fixtures/healthz), so the status page
// cannot contradict what the services report.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ctx = {}; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(repo, 'assets/status-model.js'), 'utf8'), ctx);
const { summarize, normalizeStatus } = ctx.StatusModel;
const fx = n => JSON.parse(fs.readFileSync(path.join(repo, 'tests/fixtures/healthz', n + '.json'), 'utf8'));

let fails = 0;
const check = (name, cond, extra = '') => { if (!cond) { fails++; console.log('FAIL', name, extra); } else console.log('PASS', name); };

const sen = fx('sentinel');
const s = summarize(sen._http_status, sen);
check('sentinel 503 body is read as degraded, not unreachable', sen._http_status === 503 && s.overall === 'degraded', s.overall);
check('sentinel AI check renders as bad', s.checks.some(c => c.key === 'ai' && c.state === 'bad'));

const tr = fx('trust');
check('trust "ok" maps to active', summarize(200, tr).overall === 'active', summarize(200, tr).overall);

const pu = summarize(200, fx('pulse'));
check('pulse watchers without a health field are not drawn', !pu.checks.some(c => c.key === 'rwa_issuer_watcher'));
check('pulse headline never contradicts a bad card', !(pu.overall === 'active' && pu.checks.some(c => c.state === 'bad')));

const fl = summarize(200, fx('flows'));
check('flows boolean flag is not drawn as a check', !fl.checks.some(c => c.key === 'etf_units_violation_pending'));

for (const n of ['telemetry', 'vault']) {
  const r = summarize(200, fx(n));
  check(`${n} known-healthy payload reads active`, r.overall === 'active', r.overall);
}
check('network failure stays unknown', summarize(null, null).overall === 'unknown');
check('active + bad check is downgraded', summarize(200, { status: 'active', checks: { db: { ok: false } } }).overall === 'degraded');
check('failed watcher pass is a warning', summarize(200, { status: 'active', checks: { w: { last_pass_status: 'fetch_failed' } } }).checks[0].state === 'warn');
check('active + warning check is not shown as all-operational', summarize(200, { status: 'active', checks: { whale_watcher: { last_pass_status: 'fetch_failed' } } }).overall === 'attention');
check('bad outranks warning', summarize(200, { status: 'active', checks: { a: { ok: false }, b: { last_pass_status: 'fetch_failed' } } }).overall === 'degraded');
check('status page has a headline for the attention state', fs.readFileSync(path.join(repo, 'assets/pages/status.js'), 'utf8').includes('status === "attention"'));
check('unknown status word is not mistaken for healthy', normalizeStatus('weird') === 'unknown');
process.exit(fails ? 1 : 0);
