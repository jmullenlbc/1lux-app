/**
 * The project team: the six companies on a job besides the one we are selling to.
 *
 * Mike, 2026-09-09: "we have six project team fields and they connect to clients."
 * Every one of them is optional, always, Mike, same day: "always optional". None
 * of them is ever required to mark a project won.
 *
 * This file is the single place the six roles are named. Screens, API routes and
 * the Related Projects lookup all read it, so a role can never be spelled one way
 * on a form and another way in a query.
 *
 * Zero imports on purpose, so the regression tests can load it straight into
 * plain Node (which cannot resolve the `@/` alias).
 */

/**
 * In the order they are shown. `id` is the database column; `relation` is the
 * loaded company object Prisma hangs off it.
 */
export const PROJECT_TEAM_ROLES = [
  { key: 'developer',            label: 'Developer',             id: 'developerId',            relation: 'developer' },
  { key: 'generalContractor',    label: 'General Contractor',    id: 'generalContractorId',    relation: 'generalContractor' },
  { key: 'electricalContractor', label: 'Electrical Contractor', id: 'electricalContractorId', relation: 'electricalContractor' },
  { key: 'interiorDesigner',     label: 'Interior Designer',     id: 'interiorDesignerId',     relation: 'interiorDesigner' },
  { key: 'electricalEngineer',   label: 'Electrical Engineer',   id: 'electricalEngineerId',   relation: 'electricalEngineer' },
  { key: 'architect',            label: 'Architect',             id: 'architectId',            relation: 'architect' },
];

/** Every team column name, for a Prisma `select`. */
export const PROJECT_TEAM_ID_FIELDS = PROJECT_TEAM_ROLES.map(r => r.id);

/** The plain-English name of a role, or the key back if it is not one of ours. */
export function teamRoleLabel(key) {
  return PROJECT_TEAM_ROLES.find(r => r.key === key)?.label ?? key ?? null;
}

/**
 * Only the six team keys, and only the ones actually sent.
 *
 * A save form posts whatever the user touched; this keeps anything else from
 * riding along into a database write. An empty string means "cleared", which has
 * to reach the database as null rather than as an id of "".
 */
export function pickTeamUpdate(body = {}) {
  const data = {};
  for (const role of PROJECT_TEAM_ROLES) {
    if (!(role.key in body) && !(role.id in body)) continue;
    const raw = role.key in body ? body[role.key] : body[role.id];
    const value = typeof raw === 'string' ? raw.trim() : raw;
    data[role.id] = value ? value : null;
  }
  return data;
}

/**
 * The team of one project as a display list.
 *
 * Pass `{ includeEmpty: true }` when the screen wants all six rows with blanks
 * showing, which is what an edit form wants; leave it off for a read-only summary
 * that should only list seats that are filled.
 */
export function projectTeam(project, { includeEmpty = false } = {}) {
  const out = [];
  for (const role of PROJECT_TEAM_ROLES) {
    const company = project?.[role.relation] ?? null;
    const id = company?.id ?? project?.[role.id] ?? null;
    if (!id && !includeEmpty) continue;
    out.push({ key: role.key, label: role.label, field: role.id, companyId: id, company });
  }
  return out;
}

/** How many of the six seats are filled. */
export function teamFilledCount(project) {
  return projectTeam(project).length;
}

/**
 * A Prisma `where` that finds every project a company sits on the team of.
 *
 * This is what makes Related Projects possible: a company like an engineering
 * firm may bring us almost no work of their own while appearing on plenty of
 * other people's jobs, and those are two different lists.
 */
export function teamMemberWhere(clientId) {
  return { OR: PROJECT_TEAM_ROLES.map(role => ({ [role.id]: clientId })) };
}

/**
 * Which seats this company holds on one project. A company can hold more than
 * one, a developer acting as their own general contractor is normal.
 */
export function rolesHeldBy(project, clientId) {
  if (!project || !clientId) return [];
  return PROJECT_TEAM_ROLES
    .filter(role => project[role.id] === clientId)
    .map(role => ({ key: role.key, label: role.label }));
}
