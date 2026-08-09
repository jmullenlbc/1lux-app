/**
 * Pure helpers for the public conceptual-budget intake tool.
 *
 * Everything here is deliberately dependency-free and DB-free so it can be
 * unit-tested without a database and called from an unauthenticated route.
 * The DB-backed wiring (Client.emailDomains, ConceptualSubmission) lands once
 * the schema is added.
 */

// ─── WORK-EMAIL GATING ──────────────────────────────────────────────────────
//
// Mike, 2026-07-18: "gmail type addresses shouldn't be allowed. We should only
// allow work addresses." This does double duty — the domain IS the client
// mapping key, and requiring a corporate domain is most of the spam defense
// on a public form with no CAPTCHA.
//
// Not exhaustive by design. A free provider that slips through lands in the
// review queue and a human catches it; a false POSITIVE blocks a real customer,
// which is far worse. Keep this list conservative.
export const FREE_EMAIL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com',
  'yahoo.com', 'yahoo.co.uk', 'ymail.com', 'rocketmail.com',
  'hotmail.com', 'hotmail.co.uk', 'outlook.com', 'live.com', 'msn.com',
  'aol.com', 'icloud.com', 'me.com', 'mac.com',
  'proton.me', 'protonmail.com', 'pm.me',
  'gmx.com', 'gmx.net', 'mail.com', 'zoho.com', 'yandex.com',
  'comcast.net', 'verizon.net', 'sbcglobal.net', 'att.net', 'cox.net',
  'bellsouth.net', 'charter.net', 'earthlink.net', 'juno.com',
]);

// Disposable/throwaway providers. Distinct from free mail: these signal abuse
// rather than "used a personal address", so they get their own message.
export const DISPOSABLE_EMAIL_DOMAINS = new Set([
  'mailinator.com', 'guerrillamail.com', '10minutemail.com', 'tempmail.com',
  'throwawaymail.com', 'yopmail.com', 'trashmail.com', 'sharklasers.com',
  'getnada.com', 'temp-mail.org', 'dispostable.com', 'maildrop.cc',
]);

/** Lowercase + trim. Does NOT strip subaddressing (`+tag`) — that's a real,
 *  deliverable address and stripping it would break replies. */
export function normalizeEmail(raw) {
  return String(raw ?? '').trim().toLowerCase();
}

/** Returns the domain portion, or '' if the address is unusable. */
export function parseEmailDomain(raw) {
  const email = normalizeEmail(raw);
  const at = email.lastIndexOf('@');
  if (at < 1 || at === email.length - 1) return '';
  return email.slice(at + 1);
}

/**
 * Gate for the public form.
 * Returns { ok, code, domain, message } — `message` is user-facing.
 * Codes: OK | INVALID | FREE_EMAIL | DISPOSABLE
 */
export function classifyIntakeEmail(raw) {
  const email = normalizeEmail(raw);

  // Intentionally permissive: one @, something either side, a dot in the
  // domain, no whitespace. Strict RFC 5322 validation rejects real addresses
  // and buys nothing here — the review queue is the real filter.
  const shaped = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  if (!shaped) {
    return { ok: false, code: 'INVALID', domain: '', message: 'Please enter a valid email address.' };
  }

  const domain = parseEmailDomain(email);

  if (DISPOSABLE_EMAIL_DOMAINS.has(domain)) {
    return { ok: false, code: 'DISPOSABLE', domain, message: 'Please use your work email address.' };
  }
  if (FREE_EMAIL_DOMAINS.has(domain)) {
    return {
      ok: false, code: 'FREE_EMAIL', domain,
      message: 'Please use your work email address so we can connect this to your company.',
    };
  }
  return { ok: true, code: 'OK', domain, message: '' };
}

// ─── CLIENT RESOLUTION BY DOMAIN ────────────────────────────────────────────

/**
 * Resolve a submitter's email domain to a Client. Pure — the caller supplies
 * the candidate list.
 *
 * @param domain  e.g. "milenderwhite.com"
 * @param clients [{ id, name, emailDomains: string[], website?: string }]
 * @returns { clientId, clientName, matchType, confidence }
 *          matchType: 'domain' | 'website' | 'none'
 *
 * `website` matching is a deliberate second tier, NOT a fallback we trust:
 * Client.website is free text and can hold anything. A website hit is returned
 * as a SUGGESTION (confidence 'low') for the reviewer to confirm — it must not
 * auto-assign. Only an explicit emailDomains entry is authoritative.
 */
export function resolveClientByDomain(domain, clients = []) {
  const d = String(domain ?? '').trim().toLowerCase();
  const miss = { clientId: null, clientName: null, matchType: 'none', confidence: 'none' };
  if (!d) return miss;

  for (const c of clients) {
    const domains = Array.isArray(c?.emailDomains) ? c.emailDomains : [];
    if (domains.some(x => String(x).trim().toLowerCase() === d)) {
      return { clientId: c.id, clientName: c.name, matchType: 'domain', confidence: 'high' };
    }
  }

  for (const c of clients) {
    const host = websiteHost(c?.website);
    if (host && host === d) {
      return { clientId: c.id, clientName: c.name, matchType: 'website', confidence: 'low' };
    }
  }

  return miss;
}

/** Best-effort host extraction from a free-text website field. Strips scheme,
 *  path, and a leading `www.`. Returns '' if nothing usable. */
export function websiteHost(raw) {
  let s = String(raw ?? '').trim().toLowerCase();
  if (!s) return '';
  s = s.replace(/^[a-z]+:\/\//, '').split('/')[0].split('?')[0].split('#')[0];
  s = s.replace(/^www\./, '');
  return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(s) ? s : '';
}

// ─── PROJECT-NAME DUPLICATE DETECTION ───────────────────────────────────────

/**
 * Normalize a PROJECT name for duplicate comparison.
 *
 * Deliberately NOT `market-intel/normalizer.js#normalizeName` — that one is
 * tuned for company names and strips words like "development", "residential",
 * and "properties" as noise. For project names those words are meaningful:
 * "Lincoln Avenue" and "Lincoln Avenue Residential" are different jobs, and
 * collapsing them would produce false duplicate warnings on a public form.
 *
 * Here we only remove things that are genuinely cosmetic: case, punctuation,
 * a leading article, and repeated whitespace.
 */
export function normalizeProjectName(name) {
  let n = String(name ?? '').toLowerCase().trim();
  n = n.replace(/[^a-z0-9\s-]/g, ' ');   // punctuation → space
  n = n.replace(/^the\s+/, '');           // leading article only
  n = n.replace(/[\s-]+/g, ' ').trim();   // collapse whitespace/hyphens
  return n;
}

function tokens(s) {
  return new Set(normalizeProjectName(s).split(' ').filter(Boolean));
}

/** Jaccard overlap of token sets. 0..1. */
export function nameSimilarity(a, b) {
  const A = tokens(a), B = tokens(b);
  if (!A.size || !B.size) return 0;
  let shared = 0;
  for (const t of A) if (B.has(t)) shared++;
  return shared / (A.size + B.size - shared);
}

/**
 * Find likely duplicates of a proposed project name.
 *
 * @param name     proposed name
 * @param existing [{ id, name, clientName? }]
 * @param opts.threshold  minimum similarity for a 'similar' hit (default 0.6)
 * @returns matches sorted strongest-first:
 *          [{ id, name, clientName, kind, score }]
 *          kind: 'exact' | 'contains' | 'similar'
 *
 * This SURFACES duplicates; it never blocks. Mike, 2026-07-18: submissions go
 * to a review queue and "we can manually make changes to submissions like
 * Project name." Two genuinely different jobs can share a name (phases,
 * repeat clients), so the human decides.
 */
export function findDuplicateProjects(name, existing = [], opts = {}) {
  const threshold = opts.threshold ?? 0.6;
  const target = normalizeProjectName(name);
  if (!target) return [];

  const out = [];
  for (const p of existing) {
    const candidate = normalizeProjectName(p?.name);
    if (!candidate) continue;

    let kind = null, score = 0;
    if (candidate === target) {
      kind = 'exact'; score = 1;
    } else if (candidate.includes(target) || target.includes(candidate)) {
      kind = 'contains'; score = 0.9;
    } else {
      const sim = nameSimilarity(target, candidate);
      if (sim >= threshold) { kind = 'similar'; score = sim; }
    }

    if (kind) out.push({ id: p.id, name: p.name, clientName: p.clientName ?? null, kind, score });
  }

  return out.sort((a, b) => b.score - a.score);
}
