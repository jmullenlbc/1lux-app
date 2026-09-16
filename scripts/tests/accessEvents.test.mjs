// Access history (migration 0086, 2026-09-15): every change to someone's access
// is a row, saved with the change, never deleted, and never holds a password.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ACCESS_KINDS, accessChanges, creationEvents, describeAccessEvent } from '../../src/lib/accessEvents.js';
import { NEVER_DELETED } from '../../src/lib/archive.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const read = rel => readFileSync(join(ROOT, rel), 'utf8');

const BEFORE = {
  name: 'Pat', role: 'USER', isActive: true, mustChangePassword: false,
  departments: ['SALES_MARKETING', 'DESIGN'],
  permissions: JSON.stringify({ projects: 'edit', knowledgeBase: false }),
};

test('saving an unchanged account writes nothing', () => {
  assert.deepEqual(accessChanges(BEFORE, {
    name: 'Pat', role: 'USER', isActive: true, mustChangePassword: false,
    departments: ['SALES_MARKETING', 'DESIGN'],
    permissions: { knowledgeBase: false, clientStandards: false, salesAdmin: false },
  }), []);
  assert.deepEqual(accessChanges(BEFORE, {}), [], 'fields not sent are not changes');
});

test('each real change is its own row', () => {
  const rows = accessChanges(BEFORE, {
    role: 'COMPANY_ADMIN', isActive: false, departments: ['DESIGN', 'FINANCE'],
    permissions: { knowledgeBase: true }, passwordReset: true,
  });
  const by = kind => rows.filter(r => r.kind === kind);
  assert.deepEqual(by('ROLE'), [{ kind: 'ROLE', field: null, fromValue: 'USER', toValue: 'COMPANY_ADMIN' }]);
  assert.deepEqual(by('ACTIVE'), [{ kind: 'ACTIVE', field: null, fromValue: 'on', toValue: 'off' }]);
  assert.deepEqual(by('DEPARTMENT'), [
    { kind: 'DEPARTMENT', field: null, fromValue: null, toValue: 'FINANCE' },
    { kind: 'DEPARTMENT', field: null, fromValue: 'SALES_MARKETING', toValue: null },
  ]);
  assert.deepEqual(by('PERMISSION'), [{ kind: 'PERMISSION', field: 'knowledgeBase', fromValue: 'off', toValue: 'on' }]);
  for (const r of rows) assert.ok(ACCESS_KINDS.includes(r.kind), r.kind);
});

test('a password reset is logged with no password in it', () => {
  const [row] = accessChanges(BEFORE, { passwordReset: true });
  assert.deepEqual(row, { kind: 'PASSWORD_RESET', field: null, fromValue: null, toValue: null });
});

test('left-over permission keys the Edit window never sends are not logged as removed', () => {
  const rows = accessChanges(BEFORE, { permissions: { knowledgeBase: false } });
  assert.deepEqual(rows, []);
});

test('a new account logs its role and starting departments', () => {
  assert.deepEqual(creationEvents({ role: 'USER', departments: ['FINANCE'] }), [
    { kind: 'CREATED', field: null, fromValue: null, toValue: 'USER' },
    { kind: 'DEPARTMENT', field: null, fromValue: null, toValue: 'FINANCE' },
  ]);
});

test('every kind reads as plain English', () => {
  assert.equal(describeAccessEvent({ kind: 'ROLE', fromValue: 'USER', toValue: 'COMPANY_ADMIN' }), 'Role changed from User to Company Admin');
  assert.equal(describeAccessEvent({ kind: 'ACTIVE', fromValue: 'on', toValue: 'off' }), 'Turned off (signed out, cannot sign in)');
  assert.equal(describeAccessEvent({ kind: 'DEPARTMENT', fromValue: null, toValue: 'CONSTRUCTION' }), 'Added to Construction');
  assert.equal(describeAccessEvent({ kind: 'DEPARTMENT', fromValue: 'FINANCE', toValue: null }), 'Removed from Finance');
  assert.equal(describeAccessEvent({ kind: 'PERMISSION', field: 'salesAdmin', fromValue: 'off', toValue: 'on' }), 'Sales Admin turned on');
  for (const kind of ACCESS_KINDS) {
    assert.notEqual(describeAccessEvent({ kind, fromValue: 'on', toValue: 'on' }), kind, `${kind} has no sentence`);
  }
});

test('both admin user routes write history, the edit route inside its transaction', () => {
  const patch = read('src/app/api/admin/users/[id]/route.js');
  assert.match(patch, /\$transaction\(\[[\s\S]*userAccessEvent\.createMany[\s\S]*\]\);/);
  assert.match(patch, /changedById: actor\.id/);
  assert.match(patch, /passwordReset: !!newPassword/);
  assert.doesNotMatch(patch, /fromValue:\s*newPassword|toValue:\s*newPassword/);
  const post = read('src/app/api/admin/users/route.js');
  assert.match(post, /accessEvents:\s*\{ create: creationEvents\(/);
});

test('history rows are never deleted, and the migration only adds', () => {
  assert.ok(NEVER_DELETED.includes('userAccessEvent'));
  const sql = read('prisma/migrations/0086_user_access_events/migration.sql').replace(/--.*$/gm, '');
  assert.doesNotMatch(sql, /\bDROP\b/i);
  assert.doesNotMatch(sql, /^\s*(UPDATE|DELETE\s+FROM|INSERT)\b/im);
  assert.match(read('prisma/schema.prisma'), /model UserAccessEvent \{/);
});

test('the Users screen turns people off instead of deleting them, and shows the history', () => {
  const src = read('src/app/(app)/admin/AdminClient.jsx');
  assert.doesNotMatch(src, /method: 'DELETE'/);
  assert.match(src, /<AccessHistory userId=\{user\.id\}/);
  assert.doesNotMatch(src, /assigned projects/i, 'no screen to assign jobs exists');
});
