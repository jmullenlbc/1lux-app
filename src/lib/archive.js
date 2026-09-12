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

export const ARCHIVABLE = ['client', 'project', 'contact', 'note'];

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

export function withArchiveFilter(base) {
  const query = {};
  for (const model of ARCHIVABLE) {
    query[model] = {};
    for (const op of OPS) {
      query[model][op] = ({ args, query: run }) => run(scopeArchived(args));
    }
  }
  return base.$extends({ name: 'archive-filter', query });
}
