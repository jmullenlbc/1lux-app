/**
 * Per-person MCP keys, the parts that can be tested without a database.
 *
 * `resolveApiKey` takes the prisma client as an argument for exactly this
 * reason: the interesting failures (revoked key, switched-off owner, unknown
 * key) are all decisions made on a row, and a fake row proves the decision
 * better than a seeded database does. The live end of it, that a key really
 * does authenticate over HTTP and really does resolve to its owner's audience
 * is proved in scripts/tests/mcp.test.mjs against a running server.
 *
 * Run: node --test scripts/tests/mcpApiKeys.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateKey, hashToken, looksLikeApiKey, hashesMatch, keyTableReady, resolveApiKey,
  KEY_PREFIX, DISPLAY_PREFIX_LENGTH,
} from '../../src/lib/mcp/apiKeys.js';

/** A stand-in prisma whose mcpApiKey table contains exactly one row. */
function fakePrisma(row, { onUpdate } = {}) {
  return {
    mcpApiKey: {
      findUnique: async ({ where }) => (row && row.tokenHash === where.tokenHash ? row : null),
      update: async args => { onUpdate?.(args); return {}; },
    },
  };
}

function rowFor(token, overrides = {}) {
  return {
    id: 'key_1',
    name: 'Test key',
    tokenHash: hashToken(token),
    revokedAt: null,
    user: { id: 'u1', email: 'a@ilcstudios.com', name: 'A', role: 'USER', isActive: true },
    ...overrides,
  };
}

test('a minted key is long, prefixed, and self-identifying', () => {
  const { token, tokenHash, prefix } = generateKey();
  assert.ok(token.startsWith(KEY_PREFIX), 'a leaked key has to be recognisable on sight');
  // 32 random bytes in base64url is 43 characters. Anything much shorter would
  // mean the entropy argument for using a fast hash no longer holds.
  assert.ok(token.length - KEY_PREFIX.length >= 40, `key body was only ${token.length - KEY_PREFIX.length} chars`);
  assert.equal(prefix, token.slice(0, DISPLAY_PREFIX_LENGTH));
  assert.equal(tokenHash, hashToken(token));
  assert.equal(tokenHash.length, 64, 'sha-256 hex is 64 characters');
});

test('two keys minted back to back are different', () => {
  const a = generateKey();
  const b = generateKey();
  assert.notEqual(a.token, b.token);
  assert.notEqual(a.tokenHash, b.tokenHash);
});

test('the stored prefix is not enough to reconstruct the key', () => {
  // The failure this pins: storing too much of the key in the clear for display
  // would make the admin screen itself the leak.
  const { token, prefix } = generateKey();
  assert.ok(prefix.length < token.length / 3, 'too much of the key is stored in the clear');
});

test('looksLikeApiKey gates the database read', () => {
  assert.equal(looksLikeApiKey(generateKey().token), true);
  assert.equal(looksLikeApiKey('some-shared-service-token-abcdefghijklmnop'), false);
  assert.equal(looksLikeApiKey(KEY_PREFIX), false, 'the bare prefix is not a key');
  assert.equal(looksLikeApiKey(''), false);
  assert.equal(looksLikeApiKey(null), false);
  assert.equal(looksLikeApiKey(undefined), false);
});

test('hashesMatch refuses anything that is not two equal-length strings', () => {
  assert.equal(hashesMatch('abc', 'abc'), true);
  assert.equal(hashesMatch('abc', 'abd'), false);
  assert.equal(hashesMatch('abc', 'abcd'), false);
  assert.equal(hashesMatch(null, 'abc'), false);
  assert.equal(hashesMatch('abc', undefined), false);
});

test('keyTableReady is false before the migration and true after', () => {
  assert.equal(keyTableReady(null), false);
  assert.equal(keyTableReady({}), false);
  assert.equal(keyTableReady({ mcpApiKey: {} }), false);
  assert.equal(keyTableReady({ mcpApiKey: { findUnique: () => {} } }), true);
});

test('a live key resolves to its owner', async () => {
  const { token } = generateKey();
  const resolved = await resolveApiKey(fakePrisma(rowFor(token)), token);
  assert.ok(resolved, 'a valid key was refused');
  assert.equal(resolved.keyId, 'key_1');
  assert.equal(resolved.user.id, 'u1');
  assert.equal(resolved.user.role, 'USER');
});

test('a key carries its owner role verbatim, including CLIENT_VIEWER', async () => {
  // The whole point of per-user keys: a key never grants more than its owner
  // has. If this ever returned an elevated role, handing a key to a client
  // would hand them the ILC view of every job.
  const { token } = generateKey();
  const row = rowFor(token, { user: { id: 'c1', email: 'c@x.com', name: 'C', role: 'CLIENT_VIEWER', isActive: true } });
  const resolved = await resolveApiKey(fakePrisma(row), token);
  assert.equal(resolved.user.role, 'CLIENT_VIEWER');
});

test('a revoked key is refused', async () => {
  const { token } = generateKey();
  const row = rowFor(token, { revokedAt: new Date() });
  assert.equal(await resolveApiKey(fakePrisma(row), token), null);
});

test('a key belonging to a switched-off person is refused', async () => {
  // The failure this pins: deactivating somebody who has left would otherwise
  // leave their key working, which is a live door into a closed account.
  const { token } = generateKey();
  const row = rowFor(token, { user: { id: 'u1', email: 'a@x.com', name: 'A', role: 'USER', isActive: false } });
  assert.equal(await resolveApiKey(fakePrisma(row), token), null);
});

test('an unknown key is refused, and indistinguishably so', async () => {
  const { token } = generateKey();
  const other = generateKey().token;
  const prisma = fakePrisma(rowFor(token));
  // Unknown, revoked and switched-off all return the same bare null. A caller
  // must not be able to tell a real key from an invented one.
  assert.equal(await resolveApiKey(prisma, other), null);
});

test('a key-shaped string never reaches the database before the migration', async () => {
  let touched = false;
  const notMigrated = { mcpApiKey: { } };
  Object.defineProperty(notMigrated.mcpApiKey, 'findUnique', {
    get() { touched = true; return undefined; },
  });
  assert.equal(await resolveApiKey(notMigrated, generateKey().token), null);
  assert.equal(touched, true, 'keyTableReady should have probed findUnique and found nothing callable');
});

test('a non-key bearer never costs a database read', async () => {
  let queried = false;
  const prisma = { mcpApiKey: { findUnique: async () => { queried = true; return null; } } };
  assert.equal(await resolveApiKey(prisma, 'a-plain-shared-token-long-enough-to-be-real'), null);
  assert.equal(queried, false, 'the shared token hit the key table');
});

test('lastUsedAt is written but never blocks the answer', async () => {
  const { token } = generateKey();
  let updated = null;
  const prisma = {
    mcpApiKey: {
      findUnique: async () => rowFor(token),
      // A failed bookkeeping write must not refuse a perfectly valid request.
      update: async args => { updated = args; throw new Error('database is having a bad day'); },
    },
  };
  const resolved = await resolveApiKey(prisma, token);
  assert.ok(resolved, 'a failed lastUsedAt write refused a valid key');
  assert.equal(updated.where.id, 'key_1');
  assert.ok(updated.data.lastUsedAt instanceof Date);
});
