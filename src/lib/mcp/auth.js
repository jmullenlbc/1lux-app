/**
 * Who is calling the Librarian?
 *
 * Three credentials, one resolved identity:
 *
 *   1. `Authorization: Bearer ilcmcp_…` — a per-person key minted on the admin
 *      screen (migration 0094). It resolves to the User it was issued to, with
 *      that user's real role, so the audit log names a human and a key issued to
 *      a CLIENT_VIEWER sees the client-redacted view. Preferred for anything a
 *      person drives. See lib/mcp/apiKeys.js.
 *   2. `Authorization: Bearer <MCP_API_TOKEN>` — the shared service token. This
 *      is how a machine process (the Ask AI data branch, a nightly job)
 *      authenticates. It resolves to a fixed ILC_ADMIN caller with no person
 *      behind it, which is exactly why option 1 exists.
 *   3. The normal `ilc_session` cookie — a real logged-in human, resolved to
 *      their real role. This exists so the Slice 3 acceptance test can drive the
 *      endpoint AS a CLIENT_VIEWER over plain HTTP and prove the boundary
 *      empirically rather than by inspection.
 *
 * A bearer is tried as a per-person key first, and falls through to the shared
 * token if it is not one. Nothing tells the caller which of the two failed.
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
import { prisma } from '@/lib/db';
import { looksLikeApiKey, keyTableReady, resolveApiKey } from '@/lib/mcp/apiKeys';
import { requireAuth, isClientViewer } from '@/lib/auth';
import { AUDIENCE } from '@/lib/redact';

/** A token shorter than this is treated as unset — a placeholder, not a secret. */
export const MIN_TOKEN_LENGTH = 32;

export const CALLER_KIND = Object.freeze({
  SERVICE: 'service',   // the shared MCP_API_TOKEN — no person behind it
  SESSION: 'session',   // a logged-in human, over the normal cookie
  KEY:     'key',       // a per-person key from the admin screen (migration 0094)
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
    // A key minted on the admin screen belongs to a person, so try that first
    // and build the caller from THAT person's role. This is the only path that
    // puts a name in the audit log; the shared token below cannot.
    if (looksLikeApiKey(bearer) && keyTableReady(prisma)) {
      const resolvedKey = await resolveApiKey(prisma, bearer);
      if (resolvedKey) {
        return {
          ok: true,
          caller: {
            kind: CALLER_KIND.KEY,
            id: resolvedKey.user.id,
            email: resolvedKey.user.email,
            name: resolvedKey.user.name || null,
            role: resolvedKey.user.role || null,
            // A key never grants more than its owner has. Issue one to a
            // CLIENT_VIEWER and it sees the client-redacted view, full stop.
            audience: audienceForCaller(resolvedKey.user.role),
            keyId: resolvedKey.keyId,
            keyName: resolvedKey.keyName,
          },
        };
      }
      // Deliberately falls through rather than returning here: a key-shaped
      // string that is not a live key is simply an invalid bearer, and it gets
      // the same answer as every other invalid bearer below. Saying "that key
      // was revoked" would confirm to a stranger that they had found a real one.
    }

    if (!bearerAuthConfigured()) {
      // No shared token configured. If the key table is live, the correct answer
      // is 401 — a per-user key is a complete credential and the shared token is
      // not required for the endpoint to work. Only when NEITHER exists is the
      // server actually misconfigured, and then it fails LOUD, never open.
      // See the Amplify note above.
      if (keyTableReady(prisma)) {
        return { ok: false, status: 401, message: 'Invalid MCP token.' };
      }
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
