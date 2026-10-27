// Pure health-payload classification for /status/. No DOM, so
// tests/status_model_test.mjs can drive it with real /healthz payloads.
//
// 2026-10-26 audit: the page threw away any non-200 body (a degraded 503 read
// as "unreachable"), did not know Trust's "ok" status, and drew every entry
// under `checks` as a card, so watcher objects with no health field showed a
// red "Unknown" under "All systems operational".
(function (root) {
  const STATUS_ALIASES = { ok: 'active', healthy: 'active', active: 'active',
    preview: 'preview', starting: 'starting', degraded: 'degraded', down: 'down' };

  function normalizeStatus(s) {
    return STATUS_ALIASES[String(s || '').toLowerCase()] || 'unknown';
  }

  // -> { state: 'good'|'bad'|'warn', label } or null when the entry carries no
  // health signal and should not be drawn at all.
  function classifyCheck(v) {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
    if (typeof v.ok === 'boolean') return v.ok ? { state: 'good', label: 'Operational' } : { state: 'bad', label: 'Degraded' };
    if (typeof v.available === 'boolean') return v.available ? { state: 'good', label: 'Operational' } : { state: 'bad', label: 'Unavailable' };
    if (typeof v.state === 'string') return v.state === 'ok' ? { state: 'good', label: 'Operational' } : { state: 'warn', label: 'Degraded' };
    if (typeof v.last_pass_status === 'string') {
      return ['ok', 'success'].includes(v.last_pass_status) ? { state: 'good', label: 'Operational' } : { state: 'warn', label: 'Last run failed' };
    }
    if (typeof v.status === 'string') {
      return ['ok', 'completed', 'idle', 'running'].includes(v.status) ? { state: 'good', label: 'Operational' } : { state: 'warn', label: 'Needs attention' };
    }
    if (v.last_error) return { state: 'warn', label: 'Reporting errors' };
    return null;
  }

  // httpStatus: number or null (network failure); body: parsed JSON or null.
  function summarize(httpStatus, body) {
    if (httpStatus == null || !body || typeof body !== 'object' || !('status' in body)) {
      return { overall: 'unknown', checks: [] };
    }
    const checks = [];
    for (const [key, value] of Object.entries(body.checks || {})) {
      const c = classifyCheck(value);
      if (c) checks.push({ key, ...c, value });
    }
    let overall = normalizeStatus(body.status);
    // A service that says "active" while one of its own checks is down is
    // degraded; the headline must not contradict the cards beneath it.
    if (overall === 'active' && checks.some(c => c.state === 'bad')) overall = 'degraded';
    // A warning (a background job whose last run failed) does not stop the
    // service answering, but "All systems operational" above a yellow card
    // is the same contradiction in a milder form (Pulse, 2026-10-27).
    else if (overall === 'active' && checks.some(c => c.state === 'warn')) overall = 'attention';
    return { overall, checks };
  }

  root.StatusModel = { normalizeStatus, classifyCheck, summarize };
})(typeof globalThis !== 'undefined' ? globalThis : this);
