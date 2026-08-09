/**
 * Row scoping — WHICH ROWS a non-ILC caller may reach.
 *
 * The rest of this directory answers a different question. `redactObject` decides
 * which FIELDS come back; `checkModel` decides which OBJECTS are addressable.
 * Neither one limits which ROWS. Without this file, a logged-in CLIENT_VIEWER can
 * send `{"tool":"query_records","params":{"model":"Project"}}` and get every
 * project in the business back — correctly redacted, and completely enumerated.
 * Names, numbers, statuses, the client list. Field redaction is not row security
 * and was never meant to be.
 *
 * The app already has the rule. src/app/api/projects/route.js:
 *
 *     // Projects are visible to all ILC staff (Mike, 2026-07). External Client
 *     // Viewers stay scoped to their own — never widen this to CLIENT_VIEWER.
 *     const where = isClientViewer(user.role) ? { createdById: user.id } : {};
 *
 * So this is not a new access model, and deliberately so — a second, differently
 * shaped notion of "your projects" is how two surfaces end up disagreeing about
 * who can see what. It is the same predicate, reached from every registered
 * object by its relation path.
 *
 * ── Fail closed ──────────────────────────────────────────────────────────────
 * An object with no entry in SCOPES is UNREACHABLE to a non-ILC caller, not
 * unscoped. That is the same discipline as the field allowlist: when Sean adds a
 * model and someone writes its ontology definition, a client cannot read a single
 * row of it until somebody also writes down how it relates to a project. The
 * failure mode of forgetting is "nobody can see it", never "everybody can".
 *
 * ── Why service tokens are ILC ───────────────────────────────────────────────
 * A bearer caller resolves to audience `ilc` and is unscoped here. That is the
 * whole point of the token being a secret and of the audit log recording every
 * call it makes: it is the internal agent, not a customer.
 */

/** Returned when an object has no route to a caller-owned project. */
export const DENY = Symbol('scope:deny');

/**
 * objectKey → (userId) => a Prisma `where` fragment restricting to that user.
 *
 * Each entry is the relation path from the object back to Project, then the same
 * `createdById` predicate the projects route uses. Written out literally rather
 * than derived from the ontology links, because a wrong path here silently widens
 * access, and a wrong path should be visible in review as a wrong path.
 */
const SCOPES = Object.freeze({
  Project:     (userId) => ({ createdById: userId }),

  ProjectData:      (userId) => ({ project: { createdById: userId } }),
  ChangeOrder:      (userId) => ({ project: { createdById: userId } }),
  FixtureSchedule:  (userId) => ({ project: { createdById: userId } }),
  DesignBidMatrix:  (userId) => ({ project: { createdById: userId } }),
  PeerReviewItem:   (userId) => ({ project: { createdById: userId } }),

  ChangeOrderOptionGroup: (userId) => ({ changeOrder: { project: { createdById: userId } } }),
  ChangeOrderLineItem:    (userId) => ({ optionGroup: { changeOrder: { project: { createdById: userId } } } }),
  FixtureScheduleItem:    (userId) => ({ schedule: { project: { createdById: userId } } }),
  DesignBidMatrixItem:    (userId) => ({ matrix: { project: { createdById: userId } } }),

  // Client is deliberately absent. src/lib/mcp/tools.js already refuses to
  // enumerate the account list through `search` for a client audience; leaving
  // Client unmapped makes the generic tools agree with that, instead of quietly
  // offering the same list one tool over.
});

/**
 * The row filter for one caller on one object.
 *
 * @param {string} objectKey  ontology key, e.g. 'ChangeOrderLineItem'
 * @param {object} caller     from resolveCaller()
 * @returns {null | object | typeof DENY}
 *   null   — no restriction (ILC)
 *   object — a Prisma where fragment to AND into the query
 *   DENY   — this caller may not reach this object at all
 */
export function rowScope(objectKey, caller) {
  if (caller?.audience === 'ilc') return null;

  // A session caller with no id cannot be scoped to anything, and "cannot be
  // scoped" must mean "gets nothing" rather than "gets everything".
  const userId = caller?.id;
  if (!userId) return DENY;

  const build = SCOPES[objectKey];
  if (!build) return DENY;
  return build(userId);
}

/**
 * AND a scope fragment into a caller-supplied `where`.
 *
 * Uses `AND` rather than object spread on purpose: spreading lets a caller-chosen
 * key overwrite the scope key when the two collide, which is the one thing this
 * merge must never do. `AND` cannot be overwritten by anything in the other half.
 */
export function applyScope(where, scope) {
  if (!scope) return where;
  if (!where) return scope;
  return { AND: [where, scope] };
}

/** The objects a non-ILC caller can reach at all. Used by the tests and the docs. */
export const SCOPED_OBJECTS = Object.freeze(Object.keys(SCOPES));
