const API_BASE = 'https://trust.xrpl-utilities.io';

// Plain message for a failed free call. The wording lives in
// preview-token.js so Pulse and Trust say the same thing.
function failureText(status) {
  return window.PreviewToken && window.PreviewToken.failureMessage
    ? window.PreviewToken.failureMessage(status)
    : 'Live data didn\u2019t load. Reload the page to try again.';
}
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);
}
// Reject non-http(s)/xrpl/mailto schemes so off-chain TOML / DID-published
// URLs can't smuggle a javascript: URI into an anchor href.
function safeUrl(u) {
  const s = String(u || '').trim();
  return /^(?:https?|xrpl|mailto):/i.test(s) ? s : '#';
}
// IPFS gateways and CIDs are hosting, not identity. A DID document
// served from gateway.pinata.cloud says the operator used Pinata; it says
// nothing about who the operator is, and rendering it as a name would be
// a worse lie than showing the address.
const NON_IDENTITY_HOSTS = /(^|\.)(ipfs\.io|gateway\.pinata\.cloud|cloudflare-ipfs\.com|dweb\.link|w3s\.link|nftstorage\.link)$/i;

function claimedName(d) {
  const did = d.owner_did || {};
  if (did.org_name) return { name: did.org_name, via: 'DID org_name' };
  const uri = did.did_uri || did.ipfs_did_uri || '';
  if (!uri || /^ipfs:\/\//i.test(uri)) return null;
  let host = '';
  try { host = new URL(uri).hostname || ''; } catch (_) { return null; }
  if (!host || NON_IDENTITY_HOSTS.test(host)) return null;
  return { name: host.replace(/^www\./, ''), via: 'domain in its on-chain DID' };
}

// Same collapse the server applies to the narrative: a run of
// `PREFIX:<uuid>` types is one product line, not N facts. Types with no
// prefix (KYC, AIFM, SCPO_BASIC) ARE the meaning and stay verbatim.
const UUIDISH = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEXBLOB = /^[0-9A-F]{16,}$/;

// One credential type, rendered for a human.
//   HVIWS:068fde7c-d7e0-...  ->  HVIWS:…      the uuid is an instance id
//   BD7142283FDFEBB7...      ->  binary type  undecodable, so say so
//   KYC / EUROP_Approved     ->  verbatim     this IS the meaning
// The full value always survives in the title attribute.
function credentialLabel(t) {
  if (!t) return null;
  if (HEXBLOB.test(t)) return 'binary type';
  const i = t.indexOf(':');
  if (i > 0 && UUIDISH.test(t.slice(i + 1))) return t.slice(0, i) + ':\u2026';
  return t;
}

function credentialSummary(creds) {
  const names = [];
  creds.forEach(c => {
    const t = c.credential_type_decoded || c.credential_type;
    if (t && names.indexOf(t) === -1) names.push(t);
  });
  if (!names.length) return '';
  const fam = new Map();
  names.forEach(t => {
    const key = credentialLabel(t);
    if (!fam.has(key)) fam.set(key, []);
    fam.get(key).push(t);
  });
  const chunks = [];
  fam.forEach((members, key) => {
    chunks.push(members.length === 1 ? key : members.length + ' \u00d7 ' + key);
  });
  return chunks.slice(0, 3).join(' \u00b7 ') + (chunks.length > 3 ? ' \u00b7 +' + (chunks.length - 3) : '');
}

function shorten(addr) {
  if (!addr) return '';
  if (addr.length <= 14) return addr;
  return addr.slice(0, 8) + '…' + addr.slice(-4);
}
let _allDomains = [];
let _allIssuers = [];
let _lastResponse = null;

function setStat(id, value, html) {
  const e = document.getElementById(id);
  if (!e) return;
  if (html) e.innerHTML = value; else e.textContent = value;
}

function renderEmpty(target, walkStatus) {
  target.innerHTML = '';
  const wrap = el('div', 'p-6 sm:p-12 text-center');
  if (walkStatus === 'warming') {
    const head = el('div', 'flex items-center justify-center gap-3 mb-3');
    head.innerHTML = '<span class="pulse-dot"></span><span class="text-2xl font-bold">Indexing the ledger</span>';
    wrap.appendChild(head);
    const p = el('p', 'text-muted leading-relaxed max-w-xl mx-auto text-sm');
    p.innerHTML = 'The discovery loop is walking the validated XRPL ledger to build the first snapshot. The XLS-80 amendment activated on mainnet in February 2026 and the first wave of mainnet domains has landed; refresh in a few moments to see them.';
    wrap.appendChild(p);
  } else {
    wrap.appendChild(el('div', 'text-2xl font-bold mb-3', 'No permissioned domains tracked yet.'));
    const p = el('p', 'text-muted leading-relaxed max-w-xl mx-auto text-sm');
    p.innerHTML = 'The discovery loop has not yet captured a domain. The XLS-80 amendment activated on XRPL mainnet in February 2026 and discovery runs on every validated transaction; the first match should land within minutes.';
    wrap.appendChild(p);
  }
  target.appendChild(wrap);
}

function renderError(target, msg) {
  target.innerHTML = '';
  const wrap = el('div', 'p-4 sm:p-6 md:p-8');
  wrap.appendChild(el('div', 'text-white font-semibold mb-2', 'The directory didn’t load'));
  wrap.appendChild(el('div', 'text-muted text-sm leading-relaxed', msg));
  target.appendChild(wrap);
}

function renderTable(target, rows, walkStatus) {
  target.innerHTML = '';
  if (!rows || rows.length === 0) {
    renderEmpty(target, walkStatus);
    return;
  }
  // Wrap the table in an overflow-x-auto scroller so wide rows can
  // pan horizontally on narrow screens instead of getting clipped
  // by the rounded #results wrapper. On `<sm` we also drop the
  // Domain ID and Sequence columns (least essential, most
  // monospace-heavy) and tighten cell padding so the remaining
  // three columns fit a 360px viewport without truncation.
  const scroller = el('div', 'overflow-x-auto');
  const tbl = el('table', 'w-full text-sm min-w-full');
  const thead = el('thead', 'text-xs uppercase tracking-wider text-muted border-b border-border');
  const trh = el('tr');
  const headers = [
    { label: 'Domain Owner', cls: '' },
    { label: 'Domain ID', cls: 'hidden md:table-cell' },
    { label: 'Accepted Credentials', cls: '' },
    { label: 'First seen', cls: 'hidden md:table-cell' },
    { label: '', cls: '' },
  ];
  headers.forEach(h => {
    trh.appendChild(el('th', 'text-left px-3 sm:px-6 py-3 font-medium ' + h.cls, h.label));
  });
  thead.appendChild(trh);
  tbl.appendChild(thead);

  const tbody = el('tbody', 'divide-y divide-border');
  rows.forEach(d => {
    const tr = el('tr', 'hover:bg-ink/40 transition');

    const ownerCell = el('td', 'px-3 sm:px-6 py-4 align-top');
    // Tag the owner cell with data-owner so decorateRowsWithAttribution
    // can append the auto-walked institutional one-liner after fetch
    // completes (Trust 2026-37).
    if (d.owner_address) ownerCell.setAttribute('data-owner', d.owner_address);
    // Name resolution ladder. The row used to show a truncated address and
    // the badge ANONYMOUS for operators whose OWN record names their site:
    // hvi3.com sits in owner_did.did_uri on three of these rows. An
    // unreadable row is not more honest than a readable one, it is just
    // less useful -- so the name is shown and its STRENGTH is what the
    // tier badge and the title carry.
    const ownerLabel = (d.owner_label && d.owner_label.name) ? d.owner_label.name : null;
    const claimed = ownerLabel ? null : claimedName(d);
    const shown = ownerLabel || (claimed && claimed.name) || shorten(d.owner_address);
    const nameEl = el('div', 'font-semibold text-white text-sm break-words', shown);
    if (!ownerLabel && claimed) {
      // Self-asserted: the operator published this, nobody verified it.
      nameEl.title = 'Self-asserted by the operator (' + claimed.via + '). Not independently verified.';
      const sa = el('span', 'ml-2 text-[10px] uppercase tracking-wider text-muted font-normal', 'self-asserted');
      nameEl.appendChild(sa);
    }
    ownerCell.appendChild(nameEl);
    if (!ownerLabel && claimed) {
      ownerCell.appendChild(el('div', 'text-xs text-muted font-mono', shorten(d.owner_address)));
    }
    if (d.owner_label && d.owner_label.domain) {
      ownerCell.appendChild(el('div', 'text-xs text-muted font-mono break-all', d.owner_label.domain));
    }
    if (ownerLabel) {
      ownerCell.appendChild(el('div', 'text-xs text-muted font-mono', shorten(d.owner_address)));
    }
    // Multi-domain indicator when the dedupe-by-owner toggle is on
    // and this owner runs more than one PermissionedDomain.
    if (d._domain_count && d._domain_count > 1) {
      ownerCell.appendChild(el(
        'div',
        'inline-flex items-center gap-1.5 mt-2 px-2 py-0.5 rounded border border-border text-[10px] uppercase tracking-wider text-muted',
        'Runs ' + d._domain_count + ' domains',
      ));
    }
    // Four-tier identity classification. identity_tier is one of
    // institutional | named_entity | did_only | anonymous and ships
    // on every row from Trust 2026-19. Renders a colored badge
    // distinguishing institutional operators from self-attested
    // named entities from cryptographic-only owners (e.g. IPFS DID
    // Document published) from truly anonymous accounts.
    const did = d.owner_did;
    const tier = d.identity_tier || 'anonymous';
    const TIER_BADGES = {
      institutional:         { label: 'SELF-DECLARED ORG',     cls: 'border-emerald-500/60 text-emerald-300' },
      named_entity:          { label: 'NAMED ENTITY',           cls: 'border-accent/40 text-accent' },
      funder_attributed:     { label: 'FUNDER-LINKED',          cls: 'border-sky-500/50 text-sky-300' },
      credential_attributed: { label: 'CREDENTIAL-LINKED',      cls: 'border-teal-500/50 text-teal-300' },
      did_only:              { label: 'DID-ONLY',               cls: 'border-amber-500/40 text-amber-300' },
      anonymous:             { label: 'ANONYMOUS',              cls: 'border-border text-muted' },
    };
    const tierMeta = TIER_BADGES[tier] || TIER_BADGES.anonymous;
    const tierBadge = el('div', 'inline-flex items-center gap-1.5 mt-2 px-2 py-0.5 rounded border ' + tierMeta.cls + ' text-[10px] uppercase tracking-wider font-semibold');
    tierBadge.textContent = tierMeta.label;
    const tierTooltip = [];
    if (tier === 'institutional') tierTooltip.push('Self-published TOML names an org, principals and URL; not independently verified');
    else if (tier === 'funder_attributed') tierTooltip.push('No TOML/DID. Funded by a publicly labelled wallet; funding does not establish ownership');
    else if (tier === 'credential_attributed') tierTooltip.push('No TOML/DID/funder label. The domain names a labelled credential issuer; this is set unilaterally and does not show that issuer\'s involvement');
    else if (tier === 'named_entity') tierTooltip.push('Self-published TOML with an org name only; not independently verified');
    else if (tier === 'did_only') tierTooltip.push('On-chain DID record; no parseable TOML (e.g. IPFS DID Document)');
    else tierTooltip.push('No on-chain DID record');
    tierBadge.title = tierTooltip.join(' · ');
    ownerCell.appendChild(tierBadge);
    // Jurisdiction badge (ISO-3166-1 alpha-2 attribution; null when
    // no reliable signal). Renders inline next to the tier badge so
    // readers can see at a glance which countries an operator
    // cohort spans without scrolling the "Regulatory jurisdictions
    // on XRPL" rollup at the top.
    if (d.jurisdiction) {
      const j = el('span', 'inline-flex items-center gap-1 ml-2 mt-2 px-2 py-0.5 rounded border border-border text-[10px] uppercase tracking-wider text-muted');
      j.textContent = d.jurisdiction;
      j.title = JURISDICTION_NAMES[d.jurisdiction] || d.jurisdiction;
      ownerCell.appendChild(j);
    }
    if (did && did.org_name) {
      const idBadge = el('div', 'inline-flex items-center gap-1.5 mt-1 px-2 py-0.5 rounded border border-accent/30 text-accent text-xs max-w-full break-words');
      idBadge.textContent = did.org_name;
      const tooltipParts = [];
      if (did.principal_names && did.principal_names.length) {
        tooltipParts.push(did.principal_names.join(', '));
      }
      if (did.description) tooltipParts.push(did.description);
      if (did.source_toml_url) tooltipParts.push('TOML: ' + did.source_toml_url);
      else if (did.ipfs_did_uri) tooltipParts.push('IPFS DID: ' + did.ipfs_did_uri);
      idBadge.title = tooltipParts.join(' · ');
      ownerCell.appendChild(idBadge);
      if (did.org_url) {
        const linkEl = el('a', 'text-xs text-muted underline hover:text-white block mt-1 break-all');
        linkEl.href = safeUrl(did.org_url);
        linkEl.textContent = did.org_url.replace(/^https?:\/\//, '');
        linkEl.target = '_blank';
        linkEl.rel = 'noopener noreferrer';
        ownerCell.appendChild(linkEl);
      }
    } else if (tier === 'did_only') {
      // IPFS-hosted or thin DID; surface method + verification count
      // when available so the reader sees cryptographic identity weight.
      const parts = [];
      if (did && did.did_method) parts.push('did:' + did.did_method);
      if (did && did.verification_method_count) parts.push(did.verification_method_count + ' verification key' + (did.verification_method_count === 1 ? '' : 's'));
      const text = parts.length ? parts.join(' · ') : 'On-chain DID present';
      ownerCell.appendChild(el('div', 'text-[11px] text-muted mt-1', text));
    }
    tr.appendChild(ownerCell);

    const idCell = el('td', 'px-3 sm:px-6 py-4 font-mono text-xs text-muted hidden md:table-cell', shorten(d.domain_id));
    idCell.title = d.domain_id || '';
    tr.appendChild(idCell);

    const credCount = (d.accepted_credentials || []).length;
    const credCell = el('td', 'px-3 sm:px-6 py-4 align-top');
    credCell.appendChild(el('div', 'text-sm font-semibold', String(credCount) + (credCount === 1 ? ' credential' : ' credentials')));
    if (credCount > 0) {
      // Was a list of issuer ADDRESSES, which answers "who signed" -- a
      // question nobody reading a directory has. What the domain ACCEPTS
      // is the thing that says what it is, so show the decoded type names
      // (collapsed the same way the server collapses UUID families).
      const credLine = el('div', 'text-xs text-muted mt-1 break-words',
        credentialSummary(d.accepted_credentials || []));
      credLine.title = (d.accepted_credentials || [])
        .map(c => c.credential_type_decoded || c.credential_type).join('\n');
      credCell.appendChild(credLine);
      const selfOnly = (d.accepted_credentials || []).every(c => c.issuer === d.owner_address);
      if (selfOnly) {
        const loop = el('div', 'text-[10px] uppercase tracking-wider text-muted mt-1', 'self-issued only');
        loop.title = 'Every accepted credential is issued by the domain owner itself: a closed loop, so the gate admits nobody the operator has not credentialed directly.';
        credCell.appendChild(loop);
      }
    }
    // Institutional-issuer badge: surfaces when the warmer found one or
    // more publicly labeled credential issuers on this domain. Cheap
    // proxy for "domain accepts credentials from N recognized
    // stablecoin issuers / custodians / exchanges".
    const instCount = d.institutional_issuer_count || 0;
    if (instCount > 0) {
      const inst = el('div', 'inline-flex items-center gap-1.5 mt-2 px-2 py-0.5 rounded border border-accent/40 text-accent text-xs max-w-full break-words');
      const names = (d.institutional_issuers || []).slice(0, 3).join(' · ');
      const more = (d.institutional_issuers || []).length > 3 ? ' +' + ((d.institutional_issuers || []).length - 3) : '';
      inst.textContent = String(instCount) + ' institutional · ' + names + more;
      inst.title = (d.institutional_issuers || []).join(', ');
      credCell.appendChild(inst);
    }
    tr.appendChild(credCell);

    // First-seen column: earliest PermissionedDomainSet event for the
    // domain captured by Trust's subscribe loop. Renders as a human
    // date when known; 'unknown' when the domain predates Trust's
    // subscribe loop (inline-seeded via /admin/seed or pre-existing on
    // startup). It used to render a literal '\u2013', a corrupted placeholder
    // that appeared in the column as a stray semicolon.
    const fsCell = el('td', 'px-3 sm:px-6 py-4 text-xs text-muted hidden md:table-cell');
    if (d.first_seen_unix) {
      const dt = new Date(d.first_seen_unix * 1000);
      fsCell.textContent = dt.toISOString().slice(0, 10);
      fsCell.title = dt.toUTCString() + (d.first_seen_ledger ? ' · ledger ' + d.first_seen_ledger : '');
    } else {
      // Was a literal '\u2013', which rendered as a stray semicolon in the
      // column and read like a bug rather than a missing value.
      fsCell.textContent = 'unknown';
      fsCell.className += ' italic opacity-60';
      fsCell.title = 'Predates Trust subscribe loop; first-seen unknown.';
    }
    tr.appendChild(fsCell);

    const linkCell = el('td', 'px-3 sm:px-6 py-4 text-right align-top');
    const link = el('a', 'text-accent hover:underline text-sm whitespace-nowrap', 'Details →');
    link.href = '#domain-' + (d.domain_id || '').slice(0, 12);
    link.dataset.domainId = d.domain_id;
    link.addEventListener('click', (e) => { e.preventDefault(); renderDetail(d); });
    linkCell.appendChild(link);
    tr.appendChild(linkCell);

    tbody.appendChild(tr);
  });
  tbl.appendChild(tbody);
  scroller.appendChild(tbl);
  target.appendChild(scroller);
  // Async-decorate each owner cell with the auto-walked institutional
  // one-liner. Runs after the table is in the DOM; if attribution
  // hasn't been walked yet (404), the row stays unchanged.
  decorateRowsWithAttribution();
}

function renderDetail(d) {
  const target = document.getElementById('results');
  // Render what we have from the list view immediately, then async-fetch
  // /domain/{id} for the enriched record (lifecycle + per-credential
  // issuer labels) and re-render in place when it lands.
  _renderDetailPanel(target, d, /* enriched */ false);
  window.scrollTo({ top: target.offsetTop - 80, behavior: 'smooth' });
  if (!d.domain_id) return;
  (window.PreviewToken ? window.PreviewToken.authHeaders() : Promise.resolve({}))
    .then(headers => fetch(API_BASE + '/domain/' + encodeURIComponent(d.domain_id), { headers }))
    .then(r => r.ok ? r.json() : null)
    .then(body => {
      if (body && body.domain && body.domain.domain_id === d.domain_id) {
        _renderDetailPanel(target, body.domain, /* enriched */ true);
      }
    })
    .catch(() => { /* keep the list-view fallback render */ });
}

function _renderDetailPanel(target, d, enriched) {
  target.innerHTML = '';
  const wrap = el('div', 'p-4 sm:p-6 md:p-8');

  const back = el('button', 'text-xs text-accent hover:underline mb-4', '← Back to directory');
  back.type = 'button';
  back.addEventListener('click', () => renderTable(target, applyFilters(), getCurrentWalkStatus()));
  wrap.appendChild(back);

  const ownerLabel = (d.owner_label && d.owner_label.name) ? d.owner_label.name : null;
  const claimed = ownerLabel ? null : claimedName(d);
  const displayName = ownerLabel || (claimed && claimed.name) || null;

  // Lead with a sentence, not a hex string. The panel used to open on the
  // 64-character domain id and then five raw ledger fields -- Sequence,
  // Owner node, Flags -- which answer questions nobody arrived with. Say
  // what the thing IS first; the ledger record is still here, one click
  // down, for whoever actually wants it.
  const head = el('div', 'mb-6 pb-4 border-b border-border');
  head.appendChild(el('div', 'text-xs uppercase tracking-wider text-muted mb-1', 'Permissioned domain'));
  head.appendChild(el('div', 'text-lg font-bold text-white break-words',
    displayName || shorten(d.owner_address)));

  const creds = d.accepted_credentials || [];
  const selfOnly = creds.length > 0 && creds.every(c => c.issuer === d.owner_address);
  const sentence = [];
  sentence.push(displayName
    ? ('Operated by ' + displayName + (claimed ? ' (self-asserted)' : '') + '.')
    : 'Operator has published no name.');
  if (creds.length) {
    sentence.push('Admits ' + credentialSummary(creds) +
      (selfOnly
        ? ', all issued by the operator itself \u2014 a closed loop, so the gate admits nobody it has not credentialed directly.'
        : ', including credentials it does not issue itself.'));
  } else {
    sentence.push('Admits no credential type, so it currently gates nothing.');
  }
  head.appendChild(el('p', 'text-sm text-muted leading-relaxed mt-2 max-w-3xl', sentence.join(' ')));

  const idLine = el('div', 'text-[11px] text-muted font-mono break-all mt-3');
  idLine.textContent = d.domain_id;
  idLine.title = 'PermissionedDomain ledger object id';
  head.appendChild(idLine);
  if (!enriched) {
    head.appendChild(el('div', 'text-xs text-muted mt-2 italic', 'Loading lifecycle and issuer labels\u2026'));
  }
  wrap.appendChild(head);

  const grid = el('div', 'grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-4 mb-8');
  function row(k, v) {
    grid.appendChild(el('div', 'text-xs uppercase tracking-wider text-muted sm:text-right', k));
    const dd = el('div', 'sm:col-span-2 text-white text-sm break-all');
    dd.textContent = v == null ? 'unknown' : String(v);
    grid.appendChild(dd);
  }
  row('Owner', ownerLabel ? (ownerLabel + ' (' + d.owner_address + ')') : d.owner_address);
  if (d.owner_label && d.owner_label.domain) row('Owner domain', d.owner_label.domain);
  if (d.owner_label && d.owner_label.verified) row('Owner verified', '✓ verified label');
  if (d.first_seen_unix) {
    const dt = new Date(d.first_seen_unix * 1000);
    row('First seen', dt.toISOString().slice(0,10) + ' UTC' + (d.first_seen_ledger ? ' · ledger ' + d.first_seen_ledger : ''));
  }
  wrap.appendChild(grid);

  // The raw ledger entry. Real, and worth keeping, but Sequence / Owner
  // node / Flags are XRPL bookkeeping -- they were being presented at the
  // same weight as who runs the domain, which is what made the panel read
  // as a data dump.
  const raw = document.createElement('details');
  raw.className = 'mb-8 border border-border rounded-lg';
  const rawSum = document.createElement('summary');
  rawSum.className = 'cursor-pointer select-none px-4 py-3 text-xs uppercase tracking-wider text-muted hover:text-white transition';
  rawSum.textContent = 'Ledger record';
  raw.appendChild(rawSum);
  const rawGrid = el('div', 'grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-3 px-4 pb-4');
  function rawRow(k, v, hint) {
    const kEl = el('div', 'text-xs uppercase tracking-wider text-muted sm:text-right', k);
    if (hint) kEl.title = hint;
    rawGrid.appendChild(kEl);
    const dd = el('div', 'sm:col-span-2 text-white text-sm break-all font-mono');
    dd.textContent = (v === null || v === undefined) ? 'unknown' : String(v);
    rawGrid.appendChild(dd);
  }
  rawRow('Sequence', d.sequence, 'Owner account sequence when the object was created');
  rawRow('Owner node', d.owner_node, 'Directory page holding this object on the owner account');
  rawRow('Last txn', d.previous_txn_id, 'Hash of the transaction that last modified this object');
  rawRow('Last txn ledger', d.previous_txn_lgr_seq);
  rawRow('Flags', d.flags, 'PermissionedDomain defines no flags today; 0 is expected');
  raw.appendChild(rawGrid);
  wrap.appendChild(raw);

  // The domain's own ledger activity, from the feed that moved here from
  // Pulse. "Is this domain actually used?" is the question the panel could
  // not answer before.
  const act = el('div', 'mb-8');
  act.appendChild(el('div', 'text-xs uppercase tracking-wider text-muted mb-3', 'Recent activity on this domain'));
  const actBody = el('div', 'text-xs text-muted', 'Loading\u2026');
  act.appendChild(actBody);
  wrap.appendChild(act);
  if (d.domain_id) {
    fetch(API_BASE + '/activity?limit=6&domain_id=' + encodeURIComponent(d.domain_id))
      .then(r => r.ok ? r.json() : null)
      .then(body => {
        const evs = (body && body.events) || [];
        if (!evs.length) {
          actBody.textContent = 'No ledger activity recorded against this domain yet. The gate exists; nothing has traded through it.';
          return;
        }
        actBody.innerHTML = '';
        evs.forEach(e => {
          const r = el('div', 'bg-ink border border-border rounded-lg px-3 py-2 mb-2');
          const t = el('div', 'text-white text-xs');
          t.textContent = (e.count > 1 ? ('\u00d7' + e.count + '  ') : '') + e.title;
          const b = el('div', 'text-[11px] text-muted mt-0.5 leading-relaxed');
          b.textContent = e.brief;
          r.appendChild(t); r.appendChild(b);
          actBody.appendChild(r);
        });
      })
      .catch(() => {
        // Distinguish "we could not look" from "nothing happened".
        actBody.textContent = 'Could not reach the activity feed. That is a failure to look, not an absence of activity.';
      });
  }

  // Lifecycle block (drill-down only). Surfaces creation date,
  // last-modified date, and modification count when available.
  const lc = d.lifecycle;
  if (lc && lc.lifecycle_status) {
    const lcWrap = el('div', 'mb-8 pb-6 border-b border-border');
    lcWrap.appendChild(el('div', 'text-xs uppercase tracking-wider text-muted mb-3', 'Lifecycle'));
    const lcGrid = el('div', 'grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-3');
    function lcRow(k, v, sub) {
      lcGrid.appendChild(el('div', 'text-xs uppercase tracking-wider text-muted sm:text-right', k));
      const dd = el('div', 'sm:col-span-2 text-white text-sm');
      dd.textContent = v == null ? 'unknown' : String(v);
      if (sub) {
        const s = el('div', 'text-xs text-muted font-mono mt-1 break-all');
        s.textContent = sub;
        dd.appendChild(s);
      }
      lcGrid.appendChild(dd);
    }
    lcRow('Created', formatTimeAgo(lc.created_at_unix, lc.created_at_iso), lc.created_tx_id);
    lcRow('Last modified', formatTimeAgo(lc.last_modified_at_unix, lc.last_modified_at_iso), lc.last_modified_tx_id);
    lcRow('Modifications', (lc.modification_count != null ? lc.modification_count : '\u2013'),
          'lifecycle_status: ' + lc.lifecycle_status);
    lcWrap.appendChild(lcGrid);
    wrap.appendChild(lcWrap);
  }

  // Institutional-issuer summary callout (drill-down version, more
  // prominent than the directory-row badge).
  const instCount = d.institutional_issuer_count || 0;
  if (instCount > 0) {
    const inst = el('div', 'mb-6 p-4 bg-ink border border-accent/40 rounded-lg');
    inst.appendChild(el('div', 'text-xs uppercase tracking-wider text-accent mb-1', 'Institutional credential issuers'));
    inst.appendChild(el('div', 'text-sm text-white', (d.institutional_issuers || []).join(', ')));
    inst.appendChild(el('div', 'text-xs text-muted mt-1', String(instCount) + ' distinct, externally-labeled, non-self issuer' + (instCount === 1 ? '' : 's') + ' accepted by this domain'));
    wrap.appendChild(inst);
  }

  // Identity block (DID + .well-known/xrp-ledger.toml). Surfaces the
  // off-chain organization name + principal when the owner has
  // published one. Strong "this address belongs to a real,
  // self-identified operator" signal.
  const ident = d.identity;
  if (ident && (ident.toml_org_name || ident.uri)) {
    const idBox = el('div', 'mb-6 p-4 bg-ink border border-accent/60 rounded-lg');
    idBox.appendChild(el('div', 'text-xs uppercase tracking-wider text-accent mb-2', 'Self-published identity (XLS-40 DID + .well-known TOML), not independently verified'));
    if (ident.toml_org_name) {
      const head = el('div', 'flex items-baseline gap-2 mb-1');
      head.appendChild(el('div', 'text-base font-semibold text-white', ident.toml_org_name));
      if (ident.toml_org_url) {
        const a = el('a', 'text-xs text-accent hover:underline', ident.toml_org_url.replace(/^https?:\/\//, ''));
        a.href = safeUrl(ident.toml_org_url); a.target = '_blank'; a.rel = 'noopener noreferrer';
        head.appendChild(a);
      }
      idBox.appendChild(head);
    }
    if (ident.toml_description) {
      idBox.appendChild(el('div', 'text-sm text-muted mb-2', ident.toml_description));
    }
    if ((ident.toml_principals || []).length) {
      const pHead = el('div', 'text-xs uppercase tracking-wider text-muted mt-3 mb-1', 'Principals');
      idBox.appendChild(pHead);
      (ident.toml_principals || []).forEach(p => {
        const row = el('div', 'text-sm text-white');
        row.textContent = p.name || p.email || '(unknown)';
        const meta = [];
        if (p.email) meta.push(p.email);
        if (p.twitter) meta.push('@' + p.twitter);
        if (meta.length) {
          const m = el('span', 'text-xs text-muted ml-2');
          m.textContent = meta.join(' · ');
          row.appendChild(m);
        }
        idBox.appendChild(row);
      });
    }
    const footer = el('div', 'text-xs text-muted mt-3');
    const parts = [];
    if (ident.toml_source_url) {
      parts.push('Source: ' + ident.toml_source_url.replace(/^https?:\/\//, ''));
    } else if (ident.uri) {
      parts.push('DID URI: ' + ident.uri);
    }
    if (ident.toml_accounts_count) {
      parts.push(ident.toml_accounts_count + ' account' + (ident.toml_accounts_count === 1 ? '' : 's') + ' declared in TOML');
    }
    footer.textContent = parts.join(' · ');
    idBox.appendChild(footer);
    wrap.appendChild(idBox);
  }

  // Permissioned market block (XLS-81). Owner-side offers + AMMs
  // that target this domain. v1 is owner-side only; whole-ledger
  // enumeration of all permissioned market makers requires a full
  // walk and is deferred.
  const market = d.permissioned_market;
  if (market && ((market.offer_count || 0) + (market.amm_count || 0) > 0)) {
    const mBox = el('div', 'mb-6 p-4 bg-ink border border-accent/40 rounded-lg');
    mBox.appendChild(el('div', 'text-xs uppercase tracking-wider text-accent mb-2', 'Permissioned market activity (XLS-81)'));
    const counts = el('div', 'text-sm text-white mb-2');
    const cParts = [];
    if (market.offer_count) cParts.push(market.offer_count + ' active offer' + (market.offer_count === 1 ? '' : 's'));
    if (market.amm_count) cParts.push(market.amm_count + ' permissioned AMM' + (market.amm_count === 1 ? '' : 's'));
    counts.textContent = cParts.join(' · ') + ' from this domain owner';
    mBox.appendChild(counts);
    // Render up to 6 individual offers
    if ((market.offers || []).length) {
      const list = el('div', 'space-y-1.5 mt-2');
      (market.offers || []).slice(0, 6).forEach(o => {
        const row = el('div', 'text-xs font-mono text-muted');
        row.textContent = '#' + (o.sequence || '?') + ': ' + _formatXrplAmount(o.taker_gets) + ' → ' + _formatXrplAmount(o.taker_pays);
        list.appendChild(row);
      });
      if ((market.offers || []).length > 6) {
        list.appendChild(el('div', 'text-xs text-muted', '… and ' + ((market.offers || []).length - 6) + ' more'));
      }
      mBox.appendChild(list);
    }
    if (market.scope_note) {
      mBox.appendChild(el('div', 'text-xs text-muted mt-3 italic', market.scope_note));
    }
    wrap.appendChild(mBox);
  }

  const credHead = el('div', 'mb-3');
  credHead.appendChild(el('div', 'text-xs uppercase tracking-wider text-muted mb-2', 'Accepted credentials'));
  const credCount = (d.accepted_credentials || []).length;
  credHead.appendChild(el('div', 'text-sm', String(credCount) + (credCount === 1 ? ' credential type accepted' : ' credential types accepted')));
  wrap.appendChild(credHead);

  if (credCount === 0) {
    wrap.appendChild(el('div', 'text-xs text-muted', 'This domain accepts no credentials. It is configured but not yet active.'));
  } else {
    const list = el('div', 'space-y-2');
    (d.accepted_credentials || []).forEach(c => {
      const card = el('div', 'bg-ink border border-border rounded-lg p-3');
      card.appendChild(el('div', 'text-xs text-muted mb-1', 'Issuer'));
      card.appendChild(el('div', 'font-mono text-sm break-all', c.issuer));
      if (c.issuer_label && c.issuer_label.name) {
        const lbl = el('div', 'text-xs text-accent mt-1', c.issuer_label.name);
        if (c.issuer_label.verified) lbl.textContent += ' ✓';
        card.appendChild(lbl);
      }
      card.appendChild(el('div', 'text-xs text-muted mt-2 mb-1', 'Credential type'));
      if (c.credential_type_decoded) {
        card.appendChild(el('div', 'text-sm text-white', c.credential_type_decoded));
        card.appendChild(el('div', 'font-mono text-xs text-muted mt-0.5 break-all', c.credential_type));
      } else {
        card.appendChild(el('div', 'font-mono text-sm break-all', c.credential_type));
      }
      list.appendChild(card);
    });
    wrap.appendChild(list);
  }

  const xref = el('div', 'mt-8 pt-6 border-t border-border');
  xref.appendChild(el('div', 'text-xs uppercase tracking-wider text-muted mb-3', 'Cross-reference'));
  const xrefLink = el('a', 'inline-block border border-border hover:border-accent px-4 py-2 rounded-lg text-sm transition mr-2');
  xrefLink.href = '/sentinel/?address=' + encodeURIComponent(d.owner_address);
  xrefLink.target = '_blank';
  xrefLink.rel = 'noopener noreferrer';
  xrefLink.textContent = 'Owner’s Sentinel scan →';
  xref.appendChild(xrefLink);
  wrap.appendChild(xref);

  target.appendChild(wrap);
}

function formatTimeAgo(unix, iso) {
  if (unix == null) return iso || '\u2013';
  const now = Math.floor(Date.now() / 1000);
  const delta = now - unix;
  if (delta < 0) return iso;
  let rel;
  if (delta < 60) rel = delta + 's ago';
  else if (delta < 3600) rel = Math.floor(delta / 60) + 'm ago';
  else if (delta < 86400) rel = Math.floor(delta / 3600) + 'h ago';
  else if (delta < 86400 * 30) rel = Math.floor(delta / 86400) + 'd ago';
  else rel = Math.floor(delta / 86400) + 'd ago';
  const d = iso ? iso.replace('T', ' ').replace('Z', ' UTC').slice(0, 19) : '';
  return rel + (d ? ' (' + d + ')' : '');
}

// Format an XRPL Amount field for compact display. String -> drops -> XRP;
// {currency, value, issuer} -> 'value CURRENCY' with hex-decoded currency.
function _formatXrplAmount(amt) {
  if (amt == null) return '\u2013';
  if (typeof amt === 'string') {
    const drops = parseInt(amt, 10);
    if (!isNaN(drops)) return (drops / 1_000_000) + ' XRP';
    return amt + ' drops';
  }
  if (typeof amt === 'object') {
    let currency = amt.currency || '';
    if (currency.length === 40) {
      try {
        const decoded = currency
          .match(/.{1,2}/g)
          .map(b => String.fromCharCode(parseInt(b, 16)))
          .join('')
          .replace(/\x00+$/, '')
          .trim();
        if (/^[\x20-\x7E]+$/.test(decoded)) currency = decoded;
      } catch (e) { /* keep hex on error */ }
    }
    return (amt.value || '?') + ' ' + (currency || 'IOU');
  }
  return String(amt);
}

function getCurrentWalkStatus() {
  return _lastResponse ? (_lastResponse.walk_status || 'unknown') : 'warming';
}

function applyFilters() {
  const q = (document.getElementById('q-search').value || '').trim().toLowerCase();
  const dedupeToggle = document.getElementById('q-dedupe');
  const dedupe = dedupeToggle ? dedupeToggle.checked : false;
  let base = _allDomains;
  if (q) {
    base = base.filter(d => {
      const id = (d.domain_id || '').toLowerCase();
      const owner = (d.owner_address || '').toLowerCase();
      const ownerLabel = ((d.owner_label || {}).name || '').toLowerCase();
      const ownerDomain = ((d.owner_label || {}).domain || '').toLowerCase();
      if (id.includes(q) || owner.includes(q) || ownerLabel.includes(q) || ownerDomain.includes(q)) {
        return true;
      }
      return (d.accepted_credentials || []).some(c => {
        const addr = (c.issuer || '').toLowerCase();
        const lbl  = (c.issuer_display_name || c.issuer_label || '').toLowerCase();
        return addr.includes(q) || lbl.includes(q);
      });
    });
  }
  if (!dedupe) return base;
  // Dedupe by owner_address: pick the first row per owner, attach a
  // domain_count + collapsed_domain_ids list so the row can render
  // "(N domains)" alongside the primary entry. Owners with one domain
  // are unchanged. This makes rtaXvxk6 (two domains) render once.
  const grouped = new Map();
  base.forEach(d => {
    const key = d.owner_address || d.domain_id;
    if (!grouped.has(key)) {
      grouped.set(key, { ...d, _domain_count: 1, _collapsed_domain_ids: [d.domain_id] });
    } else {
      const existing = grouped.get(key);
      existing._domain_count += 1;
      existing._collapsed_domain_ids.push(d.domain_id);
    }
  });
  return Array.from(grouped.values());
}

function rerender() {
  renderTable(document.getElementById('results'), applyFilters(), getCurrentWalkStatus());
}

async function loadDirectory() {
  const target = document.getElementById('results');
  const status = document.getElementById('q-status');
  status.textContent = 'Loading directory…';
  try {
    const previewHeaders = await (window.PreviewToken
      ? window.PreviewToken.authHeaders()
      : Promise.resolve({}));
    const r = await fetch(API_BASE + '/domains?limit=200&offset=0', { headers: previewHeaders });
    if (!r.ok) {
      renderError(target, failureText(r.status));
      status.textContent = 'Not loaded.';
      setStat('stat-domains', '\u2013');
      setStat('stat-issuers', '\u2013');
      return;
    }
    _lastResponse = await r.json();
    _allDomains = _lastResponse.domains || [];
    // Still aggregate distinct issuers for the stat tile count, but
    // no longer used to populate any UI dropdown - unified search
    // matches issuer address + label inline.
    const issuers = new Set();
    _allDomains.forEach(d => (d.accepted_credentials || []).forEach(c => issuers.add(c.issuer)));
    _allIssuers = Array.from(issuers);
    const total = _lastResponse.total != null ? _lastResponse.total : _allDomains.length;
    const ws = _lastResponse.walk_status || 'complete';
    setStat('stat-domains', String(total));
    setStat('stat-issuers', String(_allIssuers.length));
    if (ws === 'warming') {
      status.textContent = 'Loading directory…';
    } else {
      status.textContent = total + (total === 1 ? ' domain' : ' domains') + ' on validated ledger';
    }
    renderTable(target, _allDomains, ws);
    loadOperatorBreakdown();
  } catch (e) {
    renderError(target, failureText(0));
    status.textContent = 'Not loaded.';
    setStat('stat-domains', '\u2013');
    setStat('stat-issuers', '\u2013');
  }
}

// Operator breakdown from the free /permissioned-domains/operators/index
// endpoint. Surfaces total operators vs domain owners vs credential-only
// operators so the visible 8-domain headline doesn't undercount the
// actual XLS-70/80 footprint (one operator can own multiple domains;
// credential-only operators issue creds for someone else's domain).
async function loadOperatorBreakdown() {
  const detail = document.getElementById('stat-domains-detail');
  if (!detail) return;
  try {
    const r = await fetch(API_BASE + '/permissioned-domains/operators/index?limit=500');
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const body = await r.json();
    const total = body.total || 0;
    const ops = body.operators || [];
    const withDomains = ops.filter(o => (o.domain_count || 0) > 0).length;
    const credOnly = total - withDomains;
    if (total > 0) {
      const parts = [`${total} operator${total === 1 ? '' : 's'}`];
      if (withDomains > 0 && credOnly > 0) {
        parts.push(`${withDomains} own domains · ${credOnly} credential-only`);
      } else if (withDomains > 0) {
        parts.push(`all own domains`);
      }
      detail.textContent = parts.join(' · ');
    } else {
      detail.textContent = '0 operators';
    }
  } catch (e) {
    detail.textContent = '';
  }
}

// ISO-3166-1 alpha-2 -> flag + name. Restricted to ccTLDs we
// actually attribute from in the backend. Keep this map in lock-step
// with jurisdiction.py:_CCTLD_TO_ISO so the UI never renders a code
// it can't pretty-format.
const JURISDICTION_NAMES = {
  BR: 'Brazil', JP: 'Japan', KR: 'South Korea', FR: 'France',
  DE: 'Germany', IT: 'Italy', ES: 'Spain', NL: 'Netherlands',
  CH: 'Switzerland', SE: 'Sweden', NO: 'Norway', FI: 'Finland',
  DK: 'Denmark', BE: 'Belgium', AT: 'Austria', PT: 'Portugal',
  IE: 'Ireland', PL: 'Poland', RU: 'Russia', UA: 'Ukraine',
  TR: 'Turkey', CN: 'China', HK: 'Hong Kong', TW: 'Taiwan',
  SG: 'Singapore', MY: 'Malaysia', TH: 'Thailand', ID: 'Indonesia',
  PH: 'Philippines', VN: 'Vietnam', IN: 'India', AE: 'UAE',
  SA: 'Saudi Arabia', IL: 'Israel', ZA: 'South Africa',
  EG: 'Egypt', NG: 'Nigeria', KE: 'Kenya', MA: 'Morocco',
  AR: 'Argentina', CL: 'Chile', CO: 'Colombia', PE: 'Peru',
  MX: 'Mexico', CA: 'Canada', AU: 'Australia', NZ: 'New Zealand',
  GB: 'United Kingdom', US: 'United States',
};

function fmtAmountShort(value, currency, issuer) {
  if (value === undefined || value === null) return '\u2013';
  const n = typeof value === 'string' ? parseFloat(value) : value;
  if (!isFinite(n) || n === 0) return '0';
  let disp;
  if (n >= 1e9) disp = (n / 1e9).toFixed(2) + 'B';
  else if (n >= 1e6) disp = (n / 1e6).toFixed(1) + 'M';
  else if (n >= 1e3) disp = (n / 1e3).toFixed(2) + 'K';
  else if (n >= 1) disp = n.toFixed(2);
  else disp = n.toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
  // The currency code is an arbitrary XRPL currency (an issuer picks the
  // 160-bit code), and callers concatenate this return value into HTML.
  // Escape here rather than at each call site so a new caller can't
  // reintroduce the injection by forgetting.
  const cur = escapeHtml(currency || 'XRP');
  return disp + ' ' + cur;
}

async function loadOperators() {
  const grid = document.getElementById('operators-grid');
  const stat = document.getElementById('stat-operators');
  const empty = document.getElementById('operators-empty');
  try {
    const previewHeaders = await (window.PreviewToken
      ? window.PreviewToken.authHeaders()
      : Promise.resolve({}));
    const r = await fetch(API_BASE + '/permissioned-domains/operators?status=active&limit=50', { headers: previewHeaders });
    if (!r.ok) {
      grid.innerHTML = '<span class="text-xs text-muted">Not loaded. Reload the page to try again.</span>';
      return;
    }
    const data = await r.json();
    let ops = data.operators || [];
    // Score by 24h activity sum; hide zero-activity rows.
    ops = ops
      .map(o => ({
        ...o,
        _activity: (o.permissioned_offers_24h || 0) + (o.unique_traders_24h || 0) + (o.amm_events_24h || 0),
      }))
      .filter(o => o._activity > 0)
      .sort((a, b) => b._activity - a._activity)
      .slice(0, 10);
    stat.textContent = ops.length + (ops.length === 1 ? ' operator' : ' operators') + ' with 24h activity';
    if (!ops.length) {
      grid.innerHTML = '';
      empty.classList.remove('hidden');
      return;
    }
    empty.classList.add('hidden');
    grid.innerHTML = ops.map(o => {
      const addr = o.operator_address || '';
      const labelName = (o.owner_label && o.owner_label.name) || o.identity_org_name || null;
      const display = labelName || (addr.slice(0, 8) + '…' + addr.slice(-4));
      const jur = o.jurisdiction || null;
      const jurName = jur ? (JURISDICTION_NAMES[jur] || jur) : null;
      const jurBadge = jur
        ? ('<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-border text-[10px] uppercase tracking-wider text-muted font-mono" title="' + escapeHtml(jurName) + '">' + escapeHtml(jur) + '</span>')
        : '';
      // Top volume pair, if any. volume_24h_by_pair is a list of
      // {gets_currency, gets_issuer, gets_value, pays_currency,
      //  pays_issuer, pays_value, consumed_offers_count, offers_count}
      // sorted nothing-in-particular; pick the one with largest pays_value.
      const pairs = (o.volume_24h_by_pair || []).slice();
      pairs.sort((a, b) => parseFloat(b.pays_value || 0) - parseFloat(a.pays_value || 0));
      const top = pairs[0];
      const volRow = top
        ? ('<div class="text-[11px] text-muted mt-2"><span class="text-white font-mono">' + fmtAmountShort(top.gets_value, top.gets_currency) + '</span> &rarr; <span class="text-white font-mono">' + fmtAmountShort(top.pays_value, top.pays_currency) + '</span><span class="text-muted"> &middot; ' + escapeHtml(top.consumed_offers_count || 0) + ' offers filled</span>' + (pairs.length > 1 ? '<span class="text-muted"> &middot; +' + escapeHtml(pairs.length - 1) + ' more pair' + (pairs.length === 2 ? '' : 's') + '</span>' : '') + '</div>')
        : '';
      const xrpscan = 'https://xrpscan.com/account/' + encodeURIComponent(addr);
      // Everything below goes through innerHTML, and identity_org_name /
      // owner_label.name are harvested from the .well-known/xrp-ledger.toml
      // at whatever host the operator's own Domain field points at. Anyone
      // who can afford a PermissionedDomain controls that string, so it is
      // hostile input: escape it, or an [[ORGANIZATION]] name becomes
      // script on this origin (which holds the preview token).
      return (
        '<a href="' + xrpscan + '" target="_blank" rel="noopener noreferrer" class="block bg-ink border border-border rounded-lg p-3 hover:border-accent transition">' +
          '<div class="flex items-start justify-between gap-3">' +
            '<div class="min-w-0">' +
              '<div class="font-semibold text-white text-sm break-words">' + escapeHtml(display) + '</div>' +
              '<div class="text-[11px] text-muted font-mono break-all mt-0.5">' + escapeHtml(addr) + '</div>' +
            '</div>' +
            '<div class="flex items-center gap-2 shrink-0">' + jurBadge + '</div>' +
          '</div>' +
          '<div class="grid grid-cols-4 gap-2 mt-3 text-[11px]">' +
            '<div><div class="text-muted uppercase tracking-wider mb-0.5">Domains</div><div class="font-mono text-white">' + escapeHtml(o.domain_count || 0) + '</div></div>' +
            '<div><div class="text-muted uppercase tracking-wider mb-0.5">Offers 24h</div><div class="font-mono text-white">' + escapeHtml(o.permissioned_offers_24h || 0) + '</div></div>' +
            '<div><div class="text-muted uppercase tracking-wider mb-0.5">Traders 24h</div><div class="font-mono text-white">' + escapeHtml(o.unique_traders_24h || 0) + '</div></div>' +
            '<div><div class="text-muted uppercase tracking-wider mb-0.5">AMM 24h</div><div class="font-mono text-white">' + escapeHtml(o.amm_events_24h || 0) + '</div></div>' +
          '</div>' +
          volRow +
        '</a>'
      );
    }).join('');
  } catch (e) {
    grid.innerHTML = '<span class="text-xs text-muted">Not loaded. Reload the page to try again.</span>';
  }
}

async function loadJurisdictions() {
  const grid = document.getElementById('jurisdictions-grid');
  const stat = document.getElementById('stat-jurisdictions');
  const unattrib = document.getElementById('jurisdictions-unattributed');
  try {
    const previewHeaders = await (window.PreviewToken
      ? window.PreviewToken.authHeaders()
      : Promise.resolve({}));
    const r = await fetch(API_BASE + '/jurisdictions', { headers: previewHeaders });
    if (!r.ok) {
      grid.innerHTML = '<span class="text-xs text-muted">Not loaded. Reload the page to try again.</span>';
      return;
    }
    const data = await r.json();
    const combined = data.combined_entity_count_by_jurisdiction || [];
    const tracked = combined.filter(b => b.jurisdiction);
    stat.textContent = tracked.length + (tracked.length === 1 ? ' country' : ' countries') + ' tracked';
    if (!tracked.length) {
      grid.innerHTML = '<span class="text-xs text-muted">No jurisdiction signals yet.</span>';
    } else {
      grid.innerHTML = tracked.map(b => {
        const iso = b.jurisdiction;
        const name = JURISDICTION_NAMES[iso] || iso;
        return '<span class="inline-flex items-center gap-2 px-3 py-1.5 rounded border border-border bg-ink text-sm"><span class="font-mono text-[11px] text-muted">' + escapeHtml(iso) + '</span><span class="text-white">' + escapeHtml(name) + '</span><span class="text-xs text-muted">&middot; ' + escapeHtml(b.count) + ' entit' + (b.count === 1 ? 'y' : 'ies') + '</span></span>';
      }).join('');
    }
    // Distinct entities with no known country. Adding the operator and
    // issuer counts double-counted addresses that are both (39 vs 23).
    const unknown = combined.filter(b => !b.jurisdiction).reduce((n, b) => n + (b.count || 0), 0);
    if (unknown > 0) {
      unattrib.textContent = unknown + ' more with no known country.';
    } else {
      unattrib.textContent = '';
    }
  } catch (e) {
    grid.innerHTML = '<span class="text-xs text-muted">Not loaded. Reload the page to try again.</span>';
  }
}

// -- ECOSYSTEM USAGE (30d) --------------------------------------
// Fetches /permissioned-domains/usage-summary (free) and renders the
// four headline counters + narrative. Updates the "Institutional
// onboarding" tile above the directory.
function usageSentence(eco) {
  const made = eco.permissioned_offers_measurable || 0;
  const filled = eco.permissioned_offers_filled || 0;
  if (!made) return '';
  const pct = (100 * filled / made).toFixed(2);
  return `${filled.toLocaleString()} of ${made.toLocaleString()} offers placed in the window were filled (${pct}%). `
    + 'The rest were cancelled, replaced, expired or are still open.';
}

async function loadEcosystemUsage() {
  const grid = document.getElementById('usage-grid');
  const win  = document.getElementById('usage-window');
  const narr = document.getElementById('usage-narrative');
  try {
    const r = await fetch(API_BASE + '/permissioned-domains/usage-summary?window_days=30');
    if (!r.ok) throw new Error('http ' + r.status);
    const body = await r.json();
    const eco = body.ecosystem || {};
    const tiles = [
      { label: 'Active domains',         value: eco.total_domains ?? 0 },
      { label: 'Operators',              value: eco.total_operators ?? 0 },
      { label: 'Credential issues and acceptances (30d)', value: (eco.credentials_issued || 0) + (eco.credentials_accepted || 0) },
      // Offers placed, not placed + cancelled: the old tile added the two
      // and showed 215,564 against 188,752 offers actually placed.
      { label: 'Offers placed (30d)', value: eco.permissioned_offers_created || 0 },
    ];
    grid.innerHTML = '';
    tiles.forEach(t => {
      const cell = document.createElement('div');
      cell.className = 'bg-ink border border-border rounded-lg p-3 sm:p-4';
      const val = document.createElement('div');
      val.className = 'text-2xl sm:text-3xl font-bold text-white tabular-nums';
      val.textContent = (t.value || 0).toLocaleString();
      const lab = document.createElement('div');
      lab.className = 'text-[10px] uppercase tracking-wider text-muted mt-1';
      lab.textContent = t.label;
      cell.appendChild(val); cell.appendChild(lab);
      grid.appendChild(cell);
    });
    win.textContent = 'window: ' + (body.window_days || 30) + 'd';
    // Built here rather than taken from body.narrative, which set "36 with
    // institutional attribution" (an all-time count) beside 15 operators.
    narr.textContent = usageSentence(eco);
  } catch (e) {
    grid.innerHTML = '<div class="text-xs text-muted col-span-2 sm:col-span-4">Could not load usage data (' + escapeHtml(e && e.message ? e.message : 'fetch error') + ').</div>';
    narr.textContent = '';
  }
}

// -- PERMISSIONED LEDGER ACTIVITY FEED ---------------------------
// Moved here from the Pulse feed on 2026-09-06. It was 15% of every
// Pulse response and 100% of that share was one domain-scoped market
// maker requoting at ~1,800 tx/hour. Trust owns this data (Pulse only
// mirrored it) and /activity collapses consecutive same-account runs
// into one row, so the churn is summarised rather than dropped.
(function () {
  const list = document.getElementById('activity-list');
  const roll = document.getElementById('activity-rollup');
  const more = document.getElementById('activity-more');
  const note = document.getElementById('activity-note');
  if (!list) return;

  let category = '';
  let beforeId = null;

  const CAT = {
    lifecycle:  { c: '#4ade80', t: 'lifecycle'  },
    dex:        { c: '#60a5fa', t: 'dex'        },
    settlement: { c: '#fbbf24', t: 'settlement' }
  };
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ago = (unix) => {
    if (!unix) return '';
    const s = Math.max(0, Math.floor(Date.now() / 1000 - unix));
    if (s < 60) return s + 's ago';
    if (s < 3600) return Math.floor(s / 60) + 'm ago';
    if (s < 86400) return Math.floor(s / 3600) + 'h ago';
    return Math.floor(s / 86400) + 'd ago';
  };

  // Titles and briefs quote full 25 to 35 character addresses, which broke
  // mid-address on phones. Show them short and unbreakable; the tx link has
  // the full detail. Runs on already-escaped text, and a match is base58
  // only, so the span wraps nothing a feed could inject.
  const shortAddrs = (html) => html
    .replace(/\br[1-9A-HJ-NP-Za-km-z]{24,34}\b/g, (a) => {
      const shown = a.slice(0, 8) + '\u2026' + a.slice(-4);
      return '<span class="whitespace-nowrap">' + esc(shown) + '</span>';
    });

  function row(e) {
    const meta = CAT[e.category] || { c: '#94a3b8', t: e.category };
    const title = shortAddrs(esc(e.title));
    const brief = shortAddrs(esc(e.brief));
    const badge = e.count > 1
      ? '<span class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-ink border border-border text-muted">x' + esc(e.count) + '</span>'
      : '';
    return '<div class="bg-ink border border-border rounded-lg px-4 py-3">' +
      '<div class="flex items-start justify-between gap-3 flex-wrap">' +
        '<div class="min-w-0">' +
          '<div class="flex items-center gap-2 flex-wrap">' +
            '<span class="text-[10px] uppercase tracking-wider font-semibold" style="color:' + meta.c + '">' + esc(meta.t) + '</span>' +
            badge +
            '<span class="text-sm text-white break-words min-w-0 max-w-full">' + title + '</span>' +
          '</div>' +
          '<div class="text-xs text-muted leading-relaxed mt-1 break-words">' + brief + '</div>' +
        '</div>' +
        '<a href="https://xrpscan.com/tx/' + esc(e.tx_hash) + '" target="_blank" rel="noopener noreferrer" ' +
          'class="text-[11px] text-muted hover:text-accent whitespace-nowrap shrink-0">' + esc(ago(e.date_unix)) + ' &rarr;</a>' +
      '</div>' +
    '</div>';
  }

  async function load(append) {
    if (!append) { list.innerHTML = '<div class="skeleton-bar h-12"></div>'; beforeId = null; }
    try {
      let url = API_BASE + '/activity?limit=10';
      if (category) url += '&category=' + encodeURIComponent(category);
      if (append && beforeId) url += '&before_id=' + encodeURIComponent(beforeId);
      const r = await fetch(url);
      if (!r.ok) throw new Error('http ' + r.status);
      const body = await r.json();
      const events = body.events || [];
      const html = events.map(row).join('');
      if (append) { list.insertAdjacentHTML('beforeend', html); }
      else { list.innerHTML = html || '<div class="text-xs text-muted">No activity in this category yet.</div>'; }
      beforeId = body.next_before_id;
      more.classList.toggle('hidden', !beforeId || events.length === 0);

      const by = ((body.rollup || {}).by_tx_type) || [];
      const total = by.reduce((a, b) => a + (b.events || 0), 0);
      const busiest = ((body.rollup || {}).busiest_accounts || [])[0];
      roll.textContent = total
        ? total.toLocaleString() + ' events / ' + (body.window_hours || 24) + 'h'
        : '';
      note.textContent = (busiest && total)
        ? Math.round(100 * busiest.events / total) + '% of the last ' +
          (body.window_hours || 24) + 'h is one account (' + busiest.account.slice(0, 10) + '\u2026).'
        : '';
    } catch (e) {
      // A failure to reach the service is not a statement about the
      // ledger; say which it was.
      if (!append) list.innerHTML = '<div class="text-xs text-muted">Could not load activity (' +
        esc(e && e.message ? e.message : 'fetch error') + '). That is a failure to reach the service, not an absence of activity.</div>';
      more.classList.add('hidden');
    }
  }

  document.querySelectorAll('.act-filter').forEach((b) => {
    b.addEventListener('click', () => {
      category = b.dataset.cat || '';
      document.querySelectorAll('.act-filter').forEach((o) => {
        const on = o === b;
        o.className = on
          ? 'act-filter bg-accent text-ink text-xs font-semibold px-3 py-1.5 rounded-lg transition'
          : 'act-filter bg-ink border border-border hover:border-accent text-xs px-3 py-1.5 rounded-lg transition';
      });
      load(false);
    });
  });
  more.addEventListener('click', () => load(true));
  load(false);
})();

// -- PER-OPERATOR ATTRIBUTION CACHE -----------------------------
// Lazily fetches /permissioned-domains/operators/{addr}/attribution
// for each owner the directory renders. Result is the auto-walked
// institutional context (funder + decoded credential types + IOU
// issuer cross-ref + one-line summary). 404 = no walk recorded yet
// (e.g. backfill still running); render gracefully degrades.
const _attributionCache = new Map();
async function getAttribution(ownerAddr) {
  if (!ownerAddr) return null;
  if (_attributionCache.has(ownerAddr)) return _attributionCache.get(ownerAddr);
  const promise = (async () => {
    try {
      const r = await fetch(API_BASE + '/permissioned-domains/operators/' + encodeURIComponent(ownerAddr) + '/attribution');
      if (!r.ok) return null;
      const body = await r.json();
      return (body && body.attribution) || null;
    } catch (e) { return null; }
  })();
  _attributionCache.set(ownerAddr, promise);
  return promise;
}

// Attach the one-line attribution summary to each row's owner cell
// after the directory has rendered. Walks the DOM looking for rows
// tagged with data-owner=<addr> by the directory renderer; for
// rows missing the tag this is a no-op.
async function decorateRowsWithAttribution() {
  const rows = Array.from(document.querySelectorAll('[data-owner]'));
  await Promise.all(rows.map(async (rowEl) => {
    const addr = rowEl.getAttribute('data-owner');
    const attr = await getAttribution(addr);
    if (!attr || !attr.summary_one_line) return;
    if (rowEl.querySelector('[data-attribution-line]')) return;  // dedupe
    const line = document.createElement('div');
    line.setAttribute('data-attribution-line', '1');
    line.className = 'text-[11px] text-muted/80 italic mt-2 leading-snug';
    line.textContent = attr.summary_one_line;
    rowEl.appendChild(line);
  }));
}

document.getElementById('q-search').addEventListener('input', rerender);
document.getElementById('q-dedupe').addEventListener('change', rerender);
document.getElementById('refresh').addEventListener('click', () => {
  loadDirectory(); loadJurisdictions(); loadOperators(); loadEcosystemUsage();
});
document.getElementById('dl-json').addEventListener('click', () => {
  if (!_lastResponse) return;
  const blob = new Blob([JSON.stringify(_lastResponse, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'xr-trust-domains.json';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
});

loadDirectory();
loadJurisdictions();
loadOperators();
loadEcosystemUsage();
