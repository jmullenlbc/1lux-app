// Clients, projects, people and notes are archived, never deleted
// (Mike, 2026-09-11: "yes archive only for everything"). Migration 0075.
//
// One rule hides archived rows everywhere at once: every findMany / count /
// groupBy on these four models gets `archivedAt: null` added to its where,
// unless the query already says something about archivedAt itself.
//
// Deliberately NOT filtered:
//   - findUnique / findFirst: an archived project or client page still opens
//     (with a banner and a Restore button), and the calendar recorder's
//     de-duplication by calendarRef must still see archived notes.
//   - aggregate: the next clientNumber / projectNumber / noteNumber comes from
//     a max, and it must count archived rows or numbers would collide.
//   - nested includes and _count: Prisma does not run extensions on those, so
//     screens that list projects or people under a client filter them by hand.
//
// No `@/` imports here so the tests can load this file directly.
//
// 2026-09-11, migration 0076, project files, drawing sets, budget matrix
// versions and products joined them (Mike: "yes drawings and budgets and
// products should be archive only"). These four are hidden from findFirst as
// well: code asks for "the latest schedule file" or "the newest budget" with a
// findFirst, and an archived one must never answer that. Their pages open with
// findUnique, which stays unfiltered. The lookups that pick the NEXT budget
// version number spread INCLUDE_ARCHIVED so an archived v3 still counts and
// the next one is v4, not a second v3.

// Sales expenses joined 2026-10-09 (migration 0129): archived from the
// Expenses tab, auto-hidden like the rest.
export const ARCHIVABLE = ['client', 'project', 'contact', 'note', 'salesExpense'];
export const ARCHIVABLE_DOCUMENTS = ['projectFile', 'drawingSubmission', 'manufacturerProduct', 'designBidMatrix'];

// Records that may never be deleted through the app's database client, even by
// code written later. Deleting one of these throws. Conceptual budget
// submissions and questionnaire answers have no archive columns because no
// screen deletes them, this is what keeps it that way (Mike, 2026-09-11:
// "like budget matrix, conceptual budget, design questionnaire I don't want to
// be deleted"). Drawing files ride with their drawing set.
// Bug reports joined 2026-09-12 (migration 0079): archived from the QC board,
// never deleted. They are not auto-hidden like the lists above; the board and
// the reports API filter archivedAt themselves.
// A person's work history joined 2026-09-14 (migration 0083), the same way:
// the work-history route and Meeting Prep filter archivedAt themselves.
export const NEVER_DELETED = [
  ...ARCHIVABLE_DOCUMENTS,
  'drawingFile', 'conceptualSubmission', 'conceptualSubmissionAnswer', 'questionnaireResponse',
  'bugReport', 'contactEmployment',
  // Access history (0086): who changed whose role, turned them off, and so on.
  'userAccessEvent',
  // Unfinished public budgets (0087): staff "Put away" stamps archivedAt.
  'conceptualDraft', 'conceptualDraftField',
  // Site features (0089): a re-read or a typed value archives the old row.
  // Not auto-hidden; every reader filters archivedAt by hand (siteFeatureRows.js).
  'siteFeature',
  // A project's number ladder (0116): a newer number archives the older one.
  // Not auto-hidden; readers filter archivedAt by hand (budgetAmounts.js).
  'projectBudgetAmount',
  // "Same person?" questions (0117): answered ones stay as the record of who decided.
  'duplicateReview',
];

export class DeleteRefusedError extends Error {
  constructor(model) {
    super(`${model} records are archived, never deleted.`);
    this.name = 'DeleteRefusedError';
    this.model = model;
  }
}

// Spread into a where to opt a list back in to archived rows. Prisma ignores an
// undefined value; the key being present is what tells the rule to stand back.
export const INCLUDE_ARCHIVED = Object.freeze({ archivedAt: undefined });

export const NOT_ARCHIVED = Object.freeze({ archivedAt: null });

export function scopeArchived(args) {
  const a = args ? { ...args } : {};
  const where = a.where ?? {};
  if (Object.prototype.hasOwnProperty.call(where, 'archivedAt')) return a;
  a.where = { ...where, archivedAt: null };
  return a;
}

// What an archive or restore writes. Restore clears who-archived too, so a
// restored record is indistinguishable from one that was never archived.
export function archiveData(archived, user) {
  return archived
    ? { archivedAt: new Date(), archivedById: user?.id || null }
    : { archivedAt: null, archivedById: null };
}

// The body of every archive/restore POST is { archived: true | false }.
// Returns the boolean, or null when it is missing or not a boolean.
export async function readArchivedFlag(request) {
  const body = await request.json().catch(() => null);
  return typeof body?.archived === 'boolean' ? body.archived : null;
}

export const ARCHIVED_FLAG_HELP =
  'Send { "archived": true } to archive it, or { "archived": false } to restore it.';

// What every refused DELETE says. `what` is plural: "Companies", "Projects"…
export function deleteRefused(what) {
  return `${what} are archived, never deleted, so nothing linked to them is lost. ` +
    'Use Archive instead: it hides it everywhere, and it can be restored from the Archive page.';
}

const OPS = ['findMany', 'count', 'groupBy'];
const DOCUMENT_OPS = [...OPS, 'findFirst'];

export function withArchiveFilter(base) {
  const query = {};
  const scoped = ({ args, query: run }) => run(scopeArchived(args));
  for (const model of ARCHIVABLE) {
    query[model] = {};
    for (const op of OPS) query[model][op] = scoped;
  }
  for (const model of ARCHIVABLE_DOCUMENTS) {
    query[model] = {};
    for (const op of DOCUMENT_OPS) query[model][op] = scoped;
  }
  for (const model of NEVER_DELETED) {
    query[model] = query[model] || {};
    const refuse = async () => { throw new DeleteRefusedError(model); };
    query[model].delete = refuse;
    query[model].deleteMany = refuse;
  }
  return base.$extends({ name: 'archive-filter', query });
}
