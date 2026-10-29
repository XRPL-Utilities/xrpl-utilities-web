// The buyer path on xrpl-utilities.com (P1 audit, 2026-10-27).
//
// The audit found no copy-paste first call, no Base/USDC or Claude Desktop
// sample, and nothing at /llms.txt or /.well-known/x402 on the .com, so an
// agent directory or developer starting at the main domain found no way to
// buy. These checks pin each piece, including the Worker's merged catalog.
//
// Run: node tests/buyer_path_test.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(repo, f), 'utf8');
let fails = 0;
function check(name, cond, extra = '') {
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + extra));
  if (!cond) fails++;
}
const unescape = (s) => s.replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

// ---- /llms.txt ---------------------------------------------------------------
{
  const llms = read('llms.txt');
  check('llms.txt starts with an H1', llms.startsWith('# '));
  for (const svc of ['sentinel', 'pulse', 'telemetry', 'trust', 'vault', 'flows']) {
    check(`llms.txt links ${svc}`, llms.includes(`https://${svc}.xrpl-utilities.io/llms.txt`));
  }
  for (const m of llms.matchAll(/\(https:\/\/xrpl-utilities\.com(\/[^)]*)\)/g)) {
    const p = m[1];
    const file = p === '/.well-known/x402' ? null : path.join(repo, p, p.endsWith('/') ? 'index.html' : '');
    check(`llms.txt link ${p} exists`, file === null || fs.existsSync(file));
  }
  check('llms.txt is deployed (not in .assetsignore)', !/^llms\.txt$/m.test(read('.assetsignore')));
}

// ---- pricing: first call ------------------------------------------------------
{
  const html = read('pricing/index.html');
  const section = html.slice(html.indexOf('id="first-call"'), html.indexOf('<!-- HOW PAYMENT WORKS -->'));
  check('pricing has the first-call section', section.length > 100);
  const pres = [...section.matchAll(/<pre[^>]*>([\s\S]*?)<\/pre>/g)].map((m) => unescape(m[1]));
  check('free curl call', pres.some((p) => /^curl https:\/\/pulse\.xrpl-utilities\.io\/stats\/rwa-summary$/m.test(p)));
  check('paid curl call shows the 402', pres.some((p) => /curl -i -X POST https:\/\/sentinel\.xrpl-utilities\.io\/scan/.test(p)));
  const node = pres.find((p) => p.includes('@x402/fetch'));
  check('Base sample present', !!node);
  if (node) {
    const code = node.split('\n').filter((l) => !l.startsWith('npm install')).join('\n');
    const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'xru-')), 'sample.mjs');
    fs.writeFileSync(tmp, code);
    let ok = true;
    try { execFileSync(process.execPath, ['--check', tmp], { stdio: 'pipe' }); } catch (e) { ok = false; }
    check('Base sample parses as an ES module', ok);
    check('Base sample registers the Base network', /network: "eip155:8453"/.test(code));
    check('Base sample treats a 402 as failure', /res\.status === 402/.test(code));
    check('Base sample reads the key from the environment', /process\.env\./.test(code) && !/0x[0-9a-fA-F]{64}/.test(code));
  }
  const mcp = pres.find((p) => p.includes('mcpServers'));
  let cfg = null;
  try { cfg = JSON.parse(mcp); } catch (_) {}
  check('Claude Desktop config is valid JSON', !!cfg);
  check('Claude Desktop config runs the stdio transport', !!cfg && JSON.stringify(cfg.mcpServers['xrpl-utilities'].args) === JSON.stringify(['-y', '@xrpl-utilities/mcp', '--transport', 'stdio']));
  check('no claim that MCP pays from its own wallet', !/pays per call through its own configured XRPL wallet/.test(html));
}

// ---- /.well-known/x402 in the Worker ---------------------------------------------
{
  const jsonc = read('wrangler.jsonc').replace(/^\s*\/\/.*$/gm, '');
  check('wrangler runs the Worker first for /.well-known/x402', JSON.parse(jsonc).assets.run_worker_first.includes('/.well-known/x402'));

  const worker = (await import(pathToFileURL(path.join(repo, '_worker.js')).href + '?t=' + Date.now())).default;
  const realFetch = globalThis.fetch;
  let calls = 0;
  let down = 'vault';
  globalThis.fetch = async (url) => {
    calls++;
    const host = new URL(url).origin;
    const svc = host.split('//')[1].split('.')[0];
    if (svc === down) throw new Error('unreachable');
    const resources = [{ url: `${host}/paid`, method: 'POST', priceAmount: '0.10' }];
    if (svc === 'pulse') resources.push({ url: 'https://evil.example/steal', method: 'POST' });
    return new Response(JSON.stringify({ x402Version: 2, name: 'XR-' + svc, resources }), { headers: { 'content-type': 'application/json' } });
  };
  const get = () => worker.fetch(new Request('https://xrpl-utilities.com/.well-known/x402'), {});
  let r = await get();
  let body = await r.json();
  check('catalog answers 200 JSON', r.status === 200 && /json/.test(r.headers.get('content-type')));
  check('catalog lists the six reachable services', body.services.length === 6, JSON.stringify(body.services.map((s) => s.service)));
  check('catalog names the unreachable one', JSON.stringify(body.unavailable) === '["vault"]');
  check('catalog drops a resource on a foreign host', !body.resources.some((x) => x.url.includes('evil.example')) && body.resources.length === 6);
  check('catalog is open to crawlers (CORS)', r.headers.get('access-control-allow-origin') === '*');
  down = null; calls = 0;
  await get();
  const afterFull = calls;
  await get();
  check('catalog includes XR-Ledger', body.services.some((s) => s.service === 'ledger'));
  check('a partial catalog is not cached, a full one is', afterFull === 7 && calls === 7, `${afterFull} then ${calls}`);
  r = await worker.fetch(new Request('https://xrpl-utilities.com/.well-known/x402', { method: 'POST' }), {});
  check('catalog refuses POST', r.status === 405);
  globalThis.fetch = realFetch;
}

process.exit(fails ? 1 : 0);
