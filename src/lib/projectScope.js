// Who can open which job.
//
// ILC staff see every job (Mike, 2026-07, "open data for now"). A Client
// Viewer is an outside contractor and sees only what they were handed.
//
// Before this file, "what they were handed" meant nothing but jobs they had
// created themselves, and a Client Viewer cannot create a job, so the answer
// was always an empty list. `ProjectAccess` has sat in the database since the
// first migration with no code anywhere near it. This file is that code: an
// admin ticks the jobs on the Users screen and the rows land in ProjectAccess.
//
// Every screen and route that scopes a job list must go through here, so there
// is exactly one sentence describing who sees what. A hand-written
// `{ createdById: user.id }` is the old, wrong answer.
//
// No `@/` imports so the tests can load this file directly.
import { normalizeRole } from './roles.js';

function isViewer(user) {
  return normalizeRole(user?.role) === 'CLIENT_VIEWER';
}

/**
 * The `where` fragment for any "list the jobs this person may see" query.
 * Returns `{}` for staff, deliberately, and never widen that to a viewer.
 */
export function projectScopeWhere(user) {
  if (!isViewer(user)) return {};
  return {
    OR: [
      { createdById: user.id },
      { projectAccess: { some: { userId: user.id } } },
    ],
  };
}

/**
 * True when this person may open this one job. Takes the project row rather
 * than an id where the caller already has it, so the common staff case costs
 * no extra query.
 *
 * `project` needs `id` and `createdById`.
 */
export async function canOpenProject(db, user, project) {
  if (!project) return false;
  if (!isViewer(user)) return true;
  if (project.createdById === user.id) return true;
  const granted = await db.projectAccess.findUnique({
    where: { userId_projectId: { userId: user.id, projectId: project.id } },
    select: { id: true },
  });
  return !!granted;
}

/** The job ids one person has been handed, oldest grant first. */
export async function grantedProjectIds(db, userId) {
  const rows = await db.projectAccess.findMany({
    where:   { userId },
    select:  { projectId: true },
    orderBy: { createdAt: 'asc' },
  });
  return rows.map(r => r.projectId);
}

/**
 * Replace one person's whole list of handed-out jobs. Returns what changed so
 * the caller can write an access-history line, a silent grant is the kind of
 * thing nobody notices until it matters.
 */
export async function setProjectAccess(db, userId, projectIds) {
  const wanted  = [...new Set((projectIds || []).filter(Boolean))];
  const current = await grantedProjectIds(db, userId);

  const added   = wanted.filter(id => !current.includes(id));
  const removed = current.filter(id => !wanted.includes(id));

  if (removed.length) {
    await db.projectAccess.deleteMany({ where: { userId, projectId: { in: removed } } });
  }
  for (const projectId of added) {
    // One at a time on purpose: `createMany` + `skipDuplicates` is Postgres-only
    // and throws on the SQLite dev database.
    try {
      await db.projectAccess.create({ data: { userId, projectId } });
    } catch (err) {
      if (err?.code !== 'P2002') throw err;   // P2002 = already had it
    }
  }

  return { added, removed, total: wanted.length };
}
