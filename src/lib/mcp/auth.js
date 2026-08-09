/**
 * Who is calling the Librarian?
 *
 * Two credentials, one resolved identity:
 *
 *   1. `Authorization: Bearer <MCP_API_TOKEN>` — a service identity. This is how
 *      an agent process (the Ask AI data branch, a nightly job) authenticates.
 *      It resolves to a fixed ILC_ADMIN caller.
 *   2. The normal `ilc_session` cookie — a real logged-in human, resolved to
 *      their real role. This exists so the Slice 3 acceptance test can drive the
 *      endpoint AS a CLIENT_VIEWER over plain HTTP and prove the boundary
 *      empirically rather than by inspection.
 *
 * No credential at all is a 401. The transport redactor degrades a missing
 * session to the most-redacted view; a general-purpose read API should not
 * degrade at all, it should refuse.
 *
 * ── The Amplify trap, stated plainly ──────────────────────────────────────────
 * Amplify Hosting Gen 1 does NOT pass console-set environment variables into the
 * SSR Lambda runtime — they exist at build time only. Anything the server bundle
 * reads from `process.env` has to be listed in the `env: {}` block of
 * next.config.mjs or it inlines as `undefined`. This has already bitten this
 * codebase three times (DATABASE_URL, the S3 keys, ANTHROPIC_API_KEY).
 *
 * If it bites a fourth time here, `process.env.MCP_API_TOKEN` is `undefined` —
 * and a naive `token === process.env.MCP_API_TOKEN` would then authenticate
 * anyone who sends the literal string "undefined", or, worse, anyone at all if
 * the header were also missing. So the guard is: no token configured, or a token
 * shorter than MIN_TOKEN_LENGTH, means bearer auth is DISABLED and every bearer
 * request is refused with 503. A misconfiguration produces a loud outage, never
 * a quiet open door.
 */
import { timingSafeEqual } from 'node:crypto';
import { requireAuth, isClientViewer } from '@/lib/auth';
import { AUDIENCE } from '@/lib/redact';

/** A token shorter than this is treated as unset — a placeholder, not a secret. */
export const MIN_TOKEN_LENGTH = 32;

export const CALLER_KIND = Object.freeze({
  SERVICE: 'service',
  SESSION: 'session',
});

/** Is bearer auth usable at all in this process? */
export function bearerAuthConfigured() {
  const t = process.env.MCP_API_TOKEN;
  return typeof t === 'string' && t.length >= MIN_TOKEN_LENGTH;
}

/**
 * Constant-time string compare that does not leak length through early return.
 * Buffers of differing length cannot go through timingSafeEqual at all, so the
 * length check happens first and deliberately — the alternative is a `===`
 * fallback, which is exactly the comparison we are trying to avoid.
 */
function tokensMatch(presented, expected) {
  if (typeof presented !== 'string' || typeof expected !== 'string') return false;
  const a = Buffer.from(presented, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Map an app role to an ontology audience.
 *
 * Note the deliberate asymmetry with `audienceForRole()` in src/lib/redact.js:
 * there, an absent role degrades to PUBLIC. Here, an absent role is not a caller
 * at all — resolveCaller() has already refused. Anything that reaches this
 * function has authenticated as somebody.
 */
export function audienceForCaller(role) {
  return isClientViewer(role) ? AUDIENCE.CLIENT : AUDIENCE.ILC;
}

/**
 * Resolve the caller of an MCP request.
 *
 * @returns {Promise<{ok: true, caller: object} | {ok: false, status: number, message: string}>}
 */
export async function resolveCaller(request) {
  const header = request.headers.get('authorization') || '';
  const bearer = header.startsWith('Bearer ') ? header.slice(7).trim() : null;

  if (bearer) {
    if (!bearerAuthConfigured()) {
      // Fail LOUD, not open. See the Amplify note above.
      return {
        ok: false,
        status: 503,
        message:
          'MCP bearer authentication is not configured on this server. MCP_API_TOKEN is unset or too short. ' +
          'On Amplify, confirm it is present in the env block of next.config.mjs — console-only variables do not ' +
          'reach the SSR Lambda runtime.',
      };
    }
    if (!tokensMatch(bearer, process.env.MCP_API_TOKEN)) {
      return { ok: false, status: 401, message: 'Invalid MCP token.' };
    }
    return {
      ok: true,
      caller: {
        kind: CALLER_KIND.SERVICE,
        id: 'mcp-service',
        email: 'mcp-service@ilcstudios.com',
        role: 'ILC_ADMIN',
        audience: AUDIENCE.ILC,
      },
    };
  }

  const { user, error } = await requireAuth(request);
  if (error || !user) {
    return { ok: false, status: 401, message: 'Unauthorized. Present an MCP bearer token or a valid session cookie.' };
  }

  return {
    ok: true,
    caller: {
      kind: CALLER_KIND.SESSION,
      id: user.id || null,
      email: user.email || null,
      role: user.role || null,
      audience: audienceForCaller(user.role),
    },
  };
}
