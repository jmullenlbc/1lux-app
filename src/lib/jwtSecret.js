// The one place that reads JWT_SECRET. There is no fallback: a missing or short secret would let anyone sign
// their own session, so every caller fails instead (2026-11-10, replaces six copies of a literal fallback).
// Read lazily (at use, not at import) so `next build` works without the secret.
const MIN_LENGTH = 32;

export function jwtSecretString() {
  const value = process.env.JWT_SECRET;
  if (!value || value.length < MIN_LENGTH) {
    throw new Error(`JWT_SECRET is missing or shorter than ${MIN_LENGTH} characters`);
  }
  return value;
}

export const jwtSecretKey = () => new TextEncoder().encode(jwtSecretString());
