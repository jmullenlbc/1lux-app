/**
 * Sensitivity — what data is this?
 *
 * A property of a FIELD. Not to be confused with trust tier (how much autonomy
 * an AI task has earned), which is a property of a TASK TYPE and lives in the
 * Scribe half of the system. They never mix.
 *
 *   public     — safe for anyone holding a share link
 *   client_ok  — safe for an authenticated client/portal contact
 *   ilc_only   — logged-in ILC staff only. Buy price and ILC-internal annotation.
 *
 * The default for an undeclared field is `ilc_only`. That is the whole point:
 * widening later is a one-line change, narrowing after a leak is a phone call
 * to a client.
 *
 * `NEVER_READABLE` is a different axis and sits above all of this — credentials
 * and share tokens are not "ILC-only", they are not readable by ANY audience
 * through this layer, including an ILC admin. An ILC admin can already see a
 * user's role and email through the app; what they cannot do is pull a bcrypt
 * hash or a live share token out of a general-purpose read API. A leaked share
 * token is a public link to a whole project.
 */

/** Sensitivity levels, ordered least → most restricted. */
export const SENSITIVITY = Object.freeze({
  PUBLIC:    'public',
  CLIENT_OK: 'client_ok',
  ILC_ONLY:  'ilc_only',
});

/** Fail-closed: an undeclared property is treated as this. */
export const DEFAULT_SENSITIVITY = SENSITIVITY.ILC_ONLY;

const LEVELS = Object.freeze(Object.values(SENSITIVITY));

/**
 * What each audience is cleared to see. Mirrors the table in
 * MCP_ONTOLOGY_LAYER_ADDENDUM.md.
 *
 *   ilc     → public, client_ok, ilc_only
 *   client  → public, client_ok
 *   public  → public
 */
const CLEARANCE = Object.freeze({
  ilc:    Object.freeze(new Set([SENSITIVITY.PUBLIC, SENSITIVITY.CLIENT_OK, SENSITIVITY.ILC_ONLY])),
  client: Object.freeze(new Set([SENSITIVITY.PUBLIC, SENSITIVITY.CLIENT_OK])),
  public: Object.freeze(new Set([SENSITIVITY.PUBLIC])),
});

/**
 * Fields that are never returned to anyone through the ontology/MCP layer,
 * regardless of audience. Enumerated explicitly rather than pattern-matched —
 * a regex over field names produced three false positives on this schema
 * (`mustChangePassword`, `buildingFootprintSf`, `isAlternate`) and a pattern
 * that is wrong in either direction is worse than a list someone has to update.
 *
 * Keyed by bare field name, because these names are unambiguous across all 116
 * models: nothing benign in this schema is called `passwordHash` or `token`.
 */
export const NEVER_READABLE = Object.freeze(new Set([
  // ── credentials ──
  'passwordHash',        // User, PortalUser
  'password',
  'inviteToken',         // User, ProjectExternalContact
  'inviteTokenExpiresAt',
  'accessToken',         // EmailAccount — a live mailbox OAuth token
  'refreshToken',        // EmailAccount
  // ── share-link tokens: possession IS authorization ──
  'token',               // ProjectShare, ClientStandardsShare, FixtureScheduleShare, ChangeOrderShare
  'openToken',           // NotificationLog — email open-tracking pixel token
  // ── infrastructure secrets ──
  'webhookSubId',        // EmailAccount
]));

/**
 * Can this audience see a field at this sensitivity level?
 *
 * Unknown audience → false. Unknown/undeclared level → treated as ilc_only.
 * Both directions fail closed on purpose: a typo in an audience string must
 * never widen access.
 */
export function canSee(level, audience) {
  const cleared = CLEARANCE[audience];
  if (!cleared) return false;
  return cleared.has(LEVELS.includes(level) ? level : DEFAULT_SENSITIVITY);
}

/** True if this field name is blocked for every audience. */
export function isNeverReadable(fieldName) {
  return NEVER_READABLE.has(fieldName);
}

export const AUDIENCES = Object.freeze(Object.keys(CLEARANCE));
