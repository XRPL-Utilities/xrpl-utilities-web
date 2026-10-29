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
  return el("span", "h-3 w-3 rounded-full inline-block shrink-0 " + (colors[state] || colors.unknown));
}

const SERVICES = [
  ["sentinel",  "XR-Sentinel"],
  ["telemetry", "XR-Telemetry"],
  ["pulse",     "XR-Pulse"],
  ["trust",     "XR-Trust"],
  ["vault",     "XR-Vault"],
  ["flows",     "XR-Flows"],
  ["ledger",    "XR-Ledger"],
];

// Overall state -> [short label, tone, one-line explanation].
function describe(status, productName) {
  switch (status) {
    case "active":    return ["Operational", "good", productName + " is serving live traffic."];
    // XR-Flows answers 'preview' by design until its ETF sources have
    // produced real data; without this a healthy service reads "unknown".
    case "preview":   return ["Preview data", "warn", productName + " is up; the figures it serves are preview data, not live."];
    // XR-Vault answers 'starting' for a few minutes after a redeploy while
    // its upstream cache is still cold.
    case "starting":  return ["Starting up", "warn", productName + " is up; its data is still loading."];
    case "attention": return ["Running, with a warning", "warn", productName + " is serving live traffic. A background job reported a problem."];
    case "degraded":  return ["Partly degraded", "warn", "Some parts are reporting problems. Requests may fail."];
    case "down":      return ["Outage", "bad", "Critical parts are unavailable."];
    default:          return ["Unknown", "unknown", "Could not reach the " + productName + " health check."];
  }
}

function renderCheck(check) {
  const key = check.key, payload = check.value;
  const meta = labelFor(key);
  const card = el("div", "border border-border rounded-xl p-4 flex items-center gap-4");
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

// One row per service. Details stay folded while a service is operational
// and open on their own when it is not, so a healthy page is one screen.
function renderService(name, productName, status, checks) {
  const [label, tone, sub] = describe(status, productName);
  const toneText = { good: "text-good", bad: "text-bad", warn: "text-warn" }[tone] || "text-muted";
  const li = el("li", "bg-panel border border-border rounded-2xl");
  const det = el("details", "group");
  det.open = status !== "active";
  const sum = el("summary", "cursor-pointer list-none px-5 py-4 flex items-center gap-4");
  sum.appendChild(dot(tone));
  sum.appendChild(el("span", "font-semibold", productName));
  const right = el("span", "ml-auto text-sm font-medium text-right " + toneText, label);
  sum.appendChild(right);
  sum.appendChild(el("span", "text-muted text-xs group-open:rotate-180 transition", "\u25BE"));
  // Remember a row the visitor opened or closed, so the minute refresh
  // does not undo it.
  sum.addEventListener("click", () => { det.dataset.touched = "1"; });
  det.appendChild(sum);
  const body = el("div", "px-5 pb-5 space-y-3");
  body.appendChild(el("p", "text-sm text-muted", sub));
  checks.forEach(c => body.appendChild(renderCheck(c)));
  det.appendChild(body);
  li.appendChild(det);
  li.dataset.state = status;
  return li;
}

async function checkOne(name, productName) {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    let res;
    try { res = await fetch("https://" + name + ".xrpl-utilities.io/healthz", { signal: ctrl.signal }); } finally { clearTimeout(timer); }
    // Read the body whatever the HTTP code: a degraded service answers 503
    // with a JSON body that says which subsystem is down.
    let data = null;
    try { data = await res.json(); } catch (_) { data = null; }
    const summary = StatusModel.summarize(res.status, data);
    return renderService(name, productName, summary.overall, summary.checks);
  } catch (e) {
    return renderService(name, productName, "unknown", []);
  }
}

async function refresh() {
  const rows = await Promise.all(SERVICES.map(([n, p]) => checkOne(n, p)));
  const list = document.getElementById("services");
  // Keep a row the visitor opened or closed in the state they left it.
  const prev = {};
  list.querySelectorAll("details").forEach((d, i) => { if (d.dataset.touched) prev[i] = d.open; });
  list.replaceChildren(...rows);
  list.querySelectorAll("details").forEach((d, i) => {
    if (i in prev) { d.open = prev[i]; d.dataset.touched = "1"; }
  });
  const ok = rows.filter(r => r.dataset.state === "active").length;
  document.getElementById("status-summary").textContent =
    (ok === rows.length ? "All " + rows.length + " services operational." : ok + " of " + rows.length + " services fully operational.") +
    " Last checked " + utcNow() + ".";
}

refresh();
setInterval(() => { if (!document.hidden) refresh(); }, 60000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(); });
