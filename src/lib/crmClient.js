/**
 * CRM client + people helpers.
 *
 * The deal counters Mike asked for (# Open / Won / Lost / Abandoned on a client
 * and on a person) are DERIVED here, never stored. A stored counter drifts the
 * moment someone changes a project's status from another screen; counting the
 * projects on read can't.
 *
 * There are TWO counting rules, and Mike settled which goes where (2026-09-06:
 * "it should be 2 wins but the wins per client should only count 1 per project"):
 *
 *  1. PER BOARD — `dealCounts`. A project sits on the Procurement board always,
 *     and also on the Design board when its service type is Full Design or
 *     Design Assist. Each board carries its own status, so a design job counts
 *     once per board. This is what a pipeline's own numbers mean: win a design
 *     job on both boards and that is two wins on the boards.
 *
 *  2. PER PROJECT — `clientDealCounts`. On a client record (and on a person),
 *     one project is one deal, however many boards it rides. One job for a
 *     client is one win for that client, never two.
 *
 * Won = WON + COMPLETED, matching WON_STATUSES in src/lib/pipeline.js: a job we
 * delivered is still a job we won.
 */
// Extension included on purpose: the regression tests import this file straight
// into plain Node, which will not resolve an extensionless path.
import { inDesignPipeline, WON_STATUSES } from './pipeline.js';

export const EMPTY_DEAL_COUNTS = { open: 0, won: 0, lost: 0, abandoned: 0, total: 0 };

/**
 * Count deals across both pipelines for a list of projects.
 * @param {Array} projects rows carrying serviceType, procurementStatus, designStatus
 */
export function dealCounts(projects = []) {
  const counts = { ...EMPTY_DEAL_COUNTS };
  if (!Array.isArray(projects)) return counts;

  for (const project of projects) {
    if (!project) continue;
    const statuses = [project.procurementStatus || 'OPEN'];
    if (inDesignPipeline(project)) {
      statuses.push(project.designStatus || 'OPEN');
    }
    for (const status of statuses) {
      counts.total += 1;
      if (WON_STATUSES.includes(status))    counts.won       += 1;
      else if (status === 'LOST')           counts.lost      += 1;
      else if (status === 'ABANDONED')      counts.abandoned += 1;
      else                                  counts.open      += 1;   // OPEN and anything unrecognised
    }
  }
  return counts;
}

/**
 * The one outcome of a whole project, folding both boards into a single answer.
 *
 * Precedence: won beats open beats lost beats abandoned.
 *  - If either board was won, we won a job with this client. That is a win.
 *  - Otherwise, if either board is still live, the deal is still open.
 *  - Otherwise it is over. A competitive loss is the more meaningful fact to
 *    surface, so it wins over an abandon when the two boards disagree.
 *
 * Returns 'won' | 'open' | 'lost' | 'abandoned'.
 */
export function projectOutcome(project) {
  if (!project) return null;
  const statuses = [project.procurementStatus || 'OPEN'];
  if (inDesignPipeline(project)) {
    statuses.push(project.designStatus || 'OPEN');
  }
  if (statuses.some(s => WON_STATUSES.includes(s)))                  return 'won';
  if (statuses.some(s => s !== 'LOST' && s !== 'ABANDONED'))         return 'open';
  if (statuses.includes('LOST'))                                     return 'lost';
  return 'abandoned';
}

/**
 * Deal counts for a client or a person: ONE PROJECT IS ONE DEAL.
 *
 * This is the counter that belongs on a client record. A Full Design job that
 * rides both pipelines is still one job we did for them, so it adds one to the
 * total, not two. Use `dealCounts` instead when you are reporting on a pipeline
 * board, where the same job legitimately appears twice.
 */
export function clientDealCounts(projects = []) {
  const counts = { ...EMPTY_DEAL_COUNTS };
  if (!Array.isArray(projects)) return counts;

  for (const project of projects) {
    const outcome = projectOutcome(project);
    if (!outcome) continue;
    counts.total += 1;
    counts[outcome] += 1;
  }
  return counts;
}

/** The reasons behind every Lost / Abandoned deal, for the tooltip Mike wants in parentheses. */
export function dealLossReasons(projects = []) {
  const out = [];
  for (const project of projects || []) {
    if (!project) continue;
    const pairs = [
      ['Procurement', project.procurementStatus, project.procurementStatusReason],
      ...(inDesignPipeline(project)
        ? [['Design', project.designStatus, project.designStatusReason]]
        : []),
    ];
    for (const [pipeline, status, reason] of pairs) {
      if (status === 'LOST' || status === 'ABANDONED') {
        out.push({ projectId: project.id, projectName: project.name, pipeline, status, reason: reason || null });
      }
    }
  }
  return out;
}

// ── JSON-as-string helpers ───────────────────────────────────────────────────
// orgTypes / developerTypes / projectTypes are stored as JSON arrays in a text
// column — the established convention on Client. These read them safely.

export function parseList(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** The Client.type key implied by the first Client Type tick. */
export function deriveClientTypeKey(orgTypeLabels, clientTypeKeyFromLabel) {
  const list = parseList(orgTypeLabels);
  for (const label of list) {
    const key = clientTypeKeyFromLabel(label);
    if (key) return key;
  }
  return null;
}

/** Distinct project types actually used by this client's projects. */
export function projectTypesFromProjects(projects = []) {
  const seen = [];
  for (const project of projects || []) {
    const type = project?.projectType;
    if (type && !seen.includes(type)) seen.push(type);
  }
  return seen;
}

// ── People ───────────────────────────────────────────────────────────────────

/**
 * Split a typed full name into first and last. Last word is the surname;
 * everything before it is the first (and any middle) name. One word = first
 * name only. Mirrors the SQL backfill in migration 0063.
 */
export function splitName(fullName) {
  const trimmed = String(fullName ?? '').trim().replace(/\s+/g, ' ');
  if (!trimmed) return { firstName: null, lastName: null };
  const lastSpace = trimmed.lastIndexOf(' ');
  if (lastSpace === -1) return { firstName: trimmed, lastName: null };
  return {
    firstName: trimmed.slice(0, lastSpace),
    lastName:  trimmed.slice(lastSpace + 1),
  };
}

/** Rebuild the display name from the parts, when someone edits first/last directly. */
export function joinName(firstName, lastName) {
  return [firstName, lastName].map(p => String(p ?? '').trim()).filter(Boolean).join(' ');
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** True when the string could actually be mailed. Empty is allowed (the field is optional). */
export function isValidEmail(value) {
  const v = String(value ?? '').trim();
  if (!v) return true;
  return EMAIL_RE.test(v);
}

/** Digits only, then formatted US-style when it is a plain 10-digit number. */
export function formatPhone(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return raw;   // international or partial — leave exactly as typed
}

/**
 * Deal counts for one person, from their ProjectContact links.
 *
 * Counted per PROJECT, not per board — a person is attached to a job, not to a
 * pipeline, so one job they worked is one deal against their name.
 *
 * ONLY the jobs they were the main point of contact on. A project can carry
 * several people, but exactly one of them is responsible for it, and that is the
 * only one whose record it belongs on. Maram, 2026-09-09: "there always has to
 * be like the one main point person and that's the only person that's going to
 * be considered for those fields." Otherwise everyone copied onto a big job
 * quietly inherits credit for winning it.
 */
export function contactDealCounts(contact) {
  const projects = (contact?.projectLinks || [])
    .filter(l => l?.isLead)
    .map(l => l.project)
    .filter(Boolean);
  return clientDealCounts(projects);
}

/**
 * The same four numbers, but with the jobs behind them.
 *
 * Mike, 2026-09-09, on the person row: he wants the Open / Won / Lost /
 * Abandoned numbers to name the jobs — hovering shows them, clicking opens them
 * on the same screen. Counting and listing therefore have to come from one
 * place, or a number could disagree with the list it opens. `contactDealCounts`
 * is the lengths of these buckets, never a second count.
 *
 * Returns `{ open: [], won: [], lost: [], abandoned: [] }` of project rows, in
 * the order the links came back.
 */
export function contactDealProjects(contact) {
  const buckets = { open: [], won: [], lost: [], abandoned: [] };
  for (const link of contact?.projectLinks || []) {
    if (!link?.isLead || !link.project) continue;
    const outcome = projectOutcome(link.project);
    if (outcome && buckets[outcome]) buckets[outcome].push(link.project);
  }
  return buckets;
}

/**
 * Where a person works, and whether we actually know.
 *
 * Two different things can be true and they are not the same problem:
 *  - 'none'   — we have no employer at all for them. Since the people merge, a
 *               person survives their company being deleted, so this can now
 *               happen on its own and needs to be visible.
 *  - 'typed'  — somebody typed an employer name but never picked the client
 *               record, so nothing on that person rolls up to the company.
 *  - 'linked' — attached to a real client. Normal.
 *
 * Mike, 2026-09-09: "we need to flag a person with no company."
 */
export function companyLink(contact) {
  if (contact?.client?.id || contact?.clientId) {
    return { state: 'linked', label: contact?.client?.name || contact?.company || null };
  }
  const typed = (contact?.company ?? '').trim();
  if (typed) return { state: 'typed', label: typed };
  return { state: 'none', label: null };
}

/** How many of these people have no employer at all. */
export function countMissingCompany(contacts = []) {
  return contacts.filter(c => companyLink(c).state === 'none').length;
}
