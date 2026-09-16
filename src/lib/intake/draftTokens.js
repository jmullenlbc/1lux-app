/**
 * Resume-link tokens for unfinished public budgets. SERVER-ONLY (node:crypto).
 *
 * The visitor's link carries the token; the database holds only its SHA-256,
 * so a copy of the database cannot be turned into working links. A token is
 * 24 random bytes, base64url — long enough that guessing one is hopeless,
 * short enough to live in a URL.
 */
import { createHash, randomBytes } from 'node:crypto';

const TOKEN_RE = /^[A-Za-z0-9_-]{20,64}$/;

export function newToken() {
  return randomBytes(24).toString('base64url');
}

/** The stored form of a token. Anything that is not token-shaped hashes to null. */
export function hashToken(token) {
  if (typeof token !== 'string' || !TOKEN_RE.test(token)) return null;
  return createHash('sha256').update(token).digest('hex');
}
