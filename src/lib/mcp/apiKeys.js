/**
 * Per-person MCP keys, so the audit log can name a human.
 *
 * ── The problem this fixes ──────────────────────────────────────────────────
 * There was one shared `MCP_API_TOKEN`. Every bearer request resolved to the
 * same fixed `mcp-service` / ILC_ADMIN identity, so every line in the audit log
 * said "mcp-service" and the question the audit log exists to answer, *who
 * asked for that client's numbers?*, had no answer at all. Worse, the shared
 * token is ILC_ADMIN by definition, so handing it to anyone hands them the full
 * ILC view regardless of what that person may see in the app.
 *
 * A key issued here belongs to a User, and `resolveCaller` builds the caller
 * from THAT user's role. A key issued to a CLIENT_VIEWER gets the
 * client-redacted view, the same boundary the app enforces, over the same
 * ontology, with no second implementation of it.
 *
 * ── What is stored ──────────────────────────────────────────────────────────
 * The SHA-256 of the presented key, and nothing else. The key itself is shown
 * once, at the moment it is created, and is then unrecoverable by anybody
 * including a SUPER_ADMIN with database access. A lost key is replaced.
 *
 * SHA-256 rather than bcrypt/argon2 on purpose, and the reasoning matters:
 * password hashes are slow because passwords are low-entropy and guessable.
 * These keys are 32 bytes from `randomBytes`, 256 bits. There is no dictionary
 * to run against them, and a slow hash on the hot path of a read API that an
 * agent may call hundreds of times a minute buys nothing and costs real
 * latency. The security comes from the entropy, not from the work factor.
 *
 * ── Revoked, not deleted ────────────────────────────────────────────────────
 * Revoking stamps `revokedAt`. The row stays, so an audit line from six months
 * ago still resolves to a key with a name and an owner. A deleted key is an
 * audit trail that stops explaining itself, and this codebase is archive-only
 * everywhere else for the same reason.
 *
 * ── Graceful before the migration lands ─────────────────────────────────────
 * `prisma.mcpApiKey` does not exist until migration 0094 has been applied. Every
 * function here checks for it and behaves as though no keys have been issued,
 * which is true. The shared token keeps working throughout, so there is no
 * window where the endpoint is down.
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Prefix on every key we mint.
 *
 * Present so a leaked key is recognisable on sight, in a log, a pasted config,
 * or a secret scanner, as an ILC MCP credential rather than an unidentified
 * blob somebody is afraid to rotate.
 */
export const KEY_PREFIX = 'ilcmcp_';

/** How many characters of the key are stored in the clear, for display. */
export const DISPLAY_PREFIX_LENGTH = KEY_PREFIX.length + 6;

/**
 * Mint a new key.
 *
 * @returns {{token: string, tokenHash: string, prefix: string}}
 *   `token` is the only copy that will ever exist in plaintext. The caller
 *   shows it to the person once and then drops it.
 */
export function generateKey() {
  const token = KEY_PREFIX + randomBytes(32).toString('base64url');
  return {
    token,
    tokenHash: hashToken(token),
    prefix: token.slice(0, DISPLAY_PREFIX_LENGTH),
  };
}

/** The stored form of a presented key. Hex, so it is index-friendly and greppable. */
export function hashToken(token) {
  return createHash('sha256').update(String(token), 'utf8').digest('hex');
}

/**
 * Does this string even look like one of our keys?
 *
 * Cheap gate in front of the database. Without it, every request carrying the
 * shared token, or a typo, or a probe, costs an indexed read that can only
 * ever miss.
 */
export function looksLikeApiKey(token) {
  return typeof token === 'string'
    && token.startsWith(KEY_PREFIX)
    && token.length > DISPLAY_PREFIX_LENGTH;
}

/**
 * Compare two hashes without leaking, through timing, how much of the hash
 * matched.
 *
 * Largely belt-and-braces here, the lookup is by unique index, so the database
 * has already done an equality test, but the function exists so that a future
 * change to a scan-and-compare shape does not quietly introduce the leak.
 */
export function hashesMatch(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
}

/** Is the per-user key table available in this process yet? */
export function keyTableReady(prisma) {
  return typeof prisma?.mcpApiKey?.findUnique === 'function';
}

/**
 * Look up the person a presented key belongs to.
 *
 * Returns `null` for every failure, unknown key, revoked key, deleted or
 * deactivated owner, with no distinction between them. Telling a caller
 * *which* kind of wrong their key is tells an attacker whether they have found
 * a real key, which is the one fact worth withholding.
 *
 * `lastUsedAt` is written fire-and-forget: it is a convenience for the admin
 * screen ("is anything still using this key?"), and a failed write of it must
 * never refuse a request that is otherwise perfectly valid.
 *
 * @returns {Promise<{keyId, keyName, user: {id, email, name, role}} | null>}
 */
export async function resolveApiKey(prisma, token) {
  if (!looksLikeApiKey(token) || !keyTableReady(prisma)) return null;

  const row = await prisma.mcpApiKey.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      id: true,
      name: true,
      tokenHash: true,
      revokedAt: true,
      user: { select: { id: true, email: true, name: true, role: true, isActive: true } },
    },
  });

  if (!row) return null;
  if (!hashesMatch(row.tokenHash, hashToken(token))) return null;
  if (row.revokedAt) return null;
  // A key outlives nothing. Switching somebody off in the app has to switch off
  // their keys too, or deactivating a departing employee leaves a live door.
  if (!row.user || row.user.isActive === false) return null;

  prisma.mcpApiKey
    .update({ where: { id: row.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {});

  return {
    keyId: row.id,
    keyName: row.name,
    user: { id: row.user.id, email: row.user.email, name: row.user.name, role: row.user.role },
  };
}
