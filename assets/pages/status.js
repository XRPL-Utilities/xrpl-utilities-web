// Mobile nav overlay. Opens on hamburger, closes on Escape, link tap,
 // close-X tap, OR resize past the md breakpoint (so a desktop user who
 // shrinks then grows their window doesn't end up with a stuck overlay).
(function setupMobileNav() {
  const openBtn  = document.getElementById('nav-open');
  const closeBtn = document.getElementById('nav-close');
  const overlay  = document.getElementById('mobile-nav');
  if (!openBtn || !closeBtn || !overlay) return;
  const open  = () => {
    overlay.style.display = 'flex';
    openBtn.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
  };
  const close = () => {
    overlay.style.display = 'none';
    openBtn.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
  };
  openBtn.addEventListener('click', open);
  closeBtn.addEventListener('click', close);
  overlay.querySelectorAll('a[href]').forEach(a => a.addEventListener('click', close));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlay.style.display !== 'none') close();
  });
  window.addEventListener('resize', () => {
    if (window.innerWidth >= 1024) close();
  });
})();

// Subsystem labels are best-effort; unknown keys render with the raw
// key as the name so we don't drop fields when /healthz adds new
// subsystems faster than this label dict is updated.
const SUBSYSTEM_LABELS = {
  quicknode:  { name: "Ledger connection",        desc: "Reads live data from the XRP Ledger" },
  rpc:        { name: "Ledger connection",        desc: "Reads live data from the XRP Ledger" },
  xrpl_node:  { name: "Ledger connection",        desc: "Reads live data from the XRP Ledger" },
  facilitator:{ name: "Payments",                 desc: "Checks and settles agent payments" },
  xrp_price:  { name: "XRP price",                desc: "Sets the XRP price of each paid call" },
  slow_tasks: { name: "Background jobs",          desc: "Keep the slower metrics up to date" },
  db_path:    { name: "Storage",                  desc: "Where this service keeps its data" },
  snapshot_age_seconds: { name: "Data age",       desc: "Time since the last full refresh" },
  db:         { name: "Database",                 desc: "Stored data for this service" },
  ai:         { name: "AI summaries",             desc: "Writes the plain-English scan summary" },
  whale_watcher:  { name: "Large-payment watcher", desc: "Scans each new ledger for big transfers" },
  xls85_backfill: { name: "Token escrow history",  desc: "One-time load of past token escrows" },
  ripple_counterparty_second_hop: { name: "Counterparty discovery", desc: "Finds new wallets linked to Ripple flows" },
  ripple_counterparty_discovery:  { name: "Counterparty discovery", desc: "Finds new wallets linked to Ripple flows" },
  pulse_upstream: { name: "XR-Pulse feed",         desc: "Source of this service's asset data" },
  flows_upstream: { name: "XR-Flows feed",         desc: "ETF data used by this service" },
  vault_upstream: { name: "XR-Vault feed",         desc: "Asset data used by this service" },
};

// A key with no label above still gets a readable name instead of the raw
// snake_case key.
function utcNow() {
  const d = new Date();
  return String(d.getUTCHours()).padStart(2, "0") + ":" + String(d.getUTCMinutes()).padStart(2, "0") + " UTC";
}

function labelFor(key) {
  if (SUBSYSTEM_LABELS[key]) return SUBSYSTEM_LABELS[key];
  const words = String(key).replace(/_/g, " ").trim();
  return { name: words.charAt(0).toUpperCase() + words.slice(1), desc: "" };
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function dot(state) {
  const colors = { good: "bg-good", bad: "bg-bad", warn: "bg-warn", unknown: "bg-muted" };
  return el("span", "h-3 w-3 rounded-full inline-block " + (colors[state] || colors.unknown));
}

function renderOverall(targetId, status, productName) {
  const t = document.getElementById(targetId);
  t.innerHTML = "";
  let label, color, sub;
  if (status === "active") {
    label = "All systems operational"; color = "text-good"; sub = productName + " is serving live traffic.";
  } else if (status === "preview") {
    // XR-Flows answers 'preview' by design until its ETF scrapers have
    // produced real data. Without this branch a healthy service renders
    // "Status unknown" to visitors.
    label = "Preview data"; color = "text-warn"; sub = productName + " is up; the figures it serves are preview data, not live.";
  } else if (status === "starting") {
    // XR-Vault answers 'starting' for ~4min after a redeploy, while its
    // upstream cache is still cold. HTTP 200, service reachable.
    label = "Starting up"; color = "text-warn"; sub = productName + " is up; upstream data is still warming.";
  } else if (status === "attention") {
    label = "Running, with a warning"; color = "text-warn"; sub = productName + " is serving live traffic. A background job reported a problem; details below.";
  } else if (status === "degraded") {
    label = "Partially degraded"; color = "text-warn"; sub = "One or more upstream subsystems are reporting issues. Requests may fail.";
  } else if (status === "down") {
    label = "Major outage"; color = "text-bad"; sub = "Critical subsystems are unavailable.";
  } else {
    label = "Status unknown"; color = "text-muted"; sub = "Could not reach the " + productName + " health endpoint.";
  }
  t.appendChild(el("div", "text-3xl font-bold mb-2 " + color, label));
  t.appendChild(el("div", "text-muted", sub));
}

function renderCheck(check) {
  const key = check.key, payload = check.value;
  const meta = labelFor(key);
  const card = el("div", "bg-panel border border-border rounded-2xl p-6 flex items-center gap-4");
  card.appendChild(dot(check.state));
  const left = el("div", "flex-grow min-w-0");
  left.appendChild(el("div", "font-semibold", meta.name));
  left.appendChild(el("div", "text-xs text-muted mt-0.5", meta.desc));
  card.appendChild(left);
  // Wraps at spaces (max half the card) but never splits a word.
  const right = el("div", "text-right shrink-0");
  right.style.maxWidth = "50%";
  const tone = { good: "text-good", bad: "text-bad", warn: "text-warn" }[check.state] || "text-muted";
  right.appendChild(el("div", "text-sm font-medium " + tone, check.label));
  if (payload && payload.latency_ms != null) {
    right.appendChild(el("div", "text-xs text-muted mt-1", payload.latency_ms.toFixed(0) + " ms"));
  } else if (payload && payload.last_good_age_seconds != null) {
    const age = payload.last_good_age_seconds;
    const human = age < 60 ? age.toFixed(0) + "s" : age < 3600 ? (age/60).toFixed(0) + "m" : (age/3600).toFixed(1) + "h";
    right.appendChild(el("div", "text-xs text-muted mt-1", "age " + human));
  }
  card.appendChild(right);
  return card;
}

async function refreshOne(url, overallId, checksId, lastCheckedId, productName) {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    let res;
    try { res = await fetch(url, { signal: ctrl.signal }); } finally { clearTimeout(timer); }
    // Read the body whatever the HTTP code: a degraded service answers 503
    // with a JSON body that says which subsystem is down.
    let data = null;
    try { data = await res.json(); } catch (_) { data = null; }
    const summary = StatusModel.summarize(res.status, data);
    if (summary.overall === "unknown") throw new Error("HTTP " + res.status);
    renderOverall(overallId, summary.overall, productName);
    const list = document.getElementById(checksId);
    list.innerHTML = "";
    summary.checks.forEach(c => list.appendChild(renderCheck(c)));
    document.getElementById(lastCheckedId).textContent = "Last checked " + utcNow();
  } catch (e) {
    renderOverall(overallId, "unknown", productName);
    document.getElementById(checksId).innerHTML = "";
    document.getElementById(lastCheckedId).textContent = "Last checked " + utcNow() + " (fetch failed)";
  }
}

function refresh() {
  refreshOne("https://sentinel.xrpl-utilities.io/healthz",
             "overall-sentinel", "checks-sentinel", "last-checked-sentinel", "XR-Sentinel");
  refreshOne("https://telemetry.xrpl-utilities.io/healthz",
             "overall-telemetry", "checks-telemetry", "last-checked-telemetry", "XR-Telemetry");
  refreshOne("https://pulse.xrpl-utilities.io/healthz",
             "overall-pulse", "checks-pulse", "last-checked-pulse", "XR-Pulse");
  refreshOne("https://trust.xrpl-utilities.io/healthz",
             "overall-trust", "checks-trust", "last-checked-trust", "XR-Trust");
  refreshOne("https://vault.xrpl-utilities.io/healthz",
             "overall-vault", "checks-vault", "last-checked-vault", "XR-Vault");
  refreshOne("https://flows.xrpl-utilities.io/healthz",
             "overall-flows", "checks-flows", "last-checked-flows", "XR-Flows");
}

refresh();
setInterval(() => { if (!document.hidden) refresh(); }, 60000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(); });
