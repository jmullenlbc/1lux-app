// Companies, projects, people and notes are archived, never deleted.
//
// Mike, 2026-09-11: "yes archive only for everything. it won't be that much
// data." Migration 0075 adds archivedAt / archivedById to all four; one rule in
// src/lib/archive.js (wired into src/lib/db.js) hides archived rows from every
// list, count and group-by at once.
//
// The first tests read the source. The last one drives a running dev server
// (npm run dev:3000) and is skipped when there isn't one.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import {
  ARCHIVABLE, INCLUDE_ARCHIVED, scopeArchived, archiveData, deleteRefused, withArchiveFilter,
} from '../../src/lib/archive.js';
import { BASE, login, get, post, serverUp } from './_auth.mjs';

const ROOT = new URL('../../', import.meta.url);
const read = p => readFileSync(new URL(p, ROOT), 'utf8');

function walk(dir, out = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(js|jsx|mjs)$/.test(f)) out.push(p);
  }
  return out;
}

const ROUTES = [
  'src/app/api/clients/[id]/route.js',
  'src/app/api/projects/[id]/route.js',
  'src/app/api/clients/[id]/contacts/[contactId]/route.js',
  'src/app/api/crm/notes/[id]/route.js',
  'src/app/api/projects/[id]/meeting-notes/[noteId]/route.js',
];

// ─── the rule itself ────────────────────────────────────────────────────────

test('the four archivable models', () => {
  assert.deepEqual([...ARCHIVABLE].sort(), ['client', 'contact', 'note', 'project', 'salesExpense']);
});

test('scopeArchived hides archived rows unless the query already says otherwise', () => {
  assert.deepEqual(scopeArchived(undefined), { where: { archivedAt: null } });
  assert.deepEqual(scopeArchived({ where: { name: 'x' } }), { where: { name: 'x', archivedAt: null } });
  // Asking for archived rows (the Archive page) is left alone.
  const archivedOnly = { where: { archivedAt: { not: null } } };
  assert.deepEqual(scopeArchived(archivedOnly), archivedOnly);
  // INCLUDE_ARCHIVED opts back in: the key is there, its value is undefined.
  const both = scopeArchived({ where: { budgetNumber: 'A', ...INCLUDE_ARCHIVED } });
  assert.ok(Object.prototype.hasOwnProperty.call(both.where, 'archivedAt'));
  assert.equal(both.where.archivedAt, undefined);
  // It never changes the caller's object.
  const mine = { where: { id: '1' } };
  scopeArchived(mine);
  assert.deepEqual(mine, { where: { id: '1' } });
});

test('archiveData stamps who and when; restore clears both', () => {
  const on = archiveData(true, { id: 'u1' });
  assert.ok(on.archivedAt instanceof Date);
  assert.equal(on.archivedById, 'u1');
  assert.deepEqual(archiveData(false, { id: 'u1' }), { archivedAt: null, archivedById: null });
});

test('withArchiveFilter covers findMany, count and groupBy on all four models, and nothing else', () => {
  let ext;
  withArchiveFilter({ $extends: e => { ext = e; return 'extended'; } });
  for (const model of ARCHIVABLE) {
    assert.deepEqual(Object.keys(ext.query[model]).sort(), ['count', 'findMany', 'groupBy'], model);
    const seen = ext.query[model].findMany({ args: { where: { a: 1 } }, query: a => a });
    assert.deepEqual(seen, { where: { a: 1, archivedAt: null } });
  }
});

test('the app database connection goes through the rule', () => {
  const src = read('src/lib/db.js');
  assert.match(src, /withArchiveFilter\(new PrismaClient/);
});

// ─── nothing deletes ────────────────────────────────────────────────────────

test('nothing in the app hard-deletes a company, project, person or note', () => {
  const offenders = walk(new URL('src', ROOT).pathname.replace(/^\/([A-Za-z]:)/, '$1'))
    .filter(p => /\.(client|project|contact|note)\.delete(Many)?\(/.test(readFileSync(p, 'utf8')));
  assert.deepEqual(offenders, []);
});

test('all five delete routes refuse with a 405, and each has an archive/restore POST', () => {
  for (const r of ROUTES) {
    const src = read(r);
    const del = src.slice(src.indexOf('export async function DELETE'));
    assert.match(del, /deleteRefused\(/, r);
    assert.match(del, /status: 405/, r);
    assert.match(src, /export async function POST/, r);
    assert.match(src, /archiveData\(archived, user\)/, r);
    assert.match(src, /readArchivedFlag\(request\)/, r);
  }
  assert.match(deleteRefused('Projects'), /^Projects are archived, never deleted/);
});

test('archiving a company does not unlink its projects', () => {
  const src = read('src/app/api/clients/[id]/route.js');
  assert.doesNotMatch(src, /clientId: null/);
});

test('no screen still asks the browser "are you sure" before removing one of these', () => {
  const screens = [
    'src/app/(app)/clients/ClientsClient.jsx',
    'src/app/(app)/dashboard/DashboardClient.jsx',
    'src/app/(app)/crm/notes/NotesClient.jsx',
    'src/components/MeetingNotes.jsx',
    'src/app/(app)/clients/[id]/ClientDetailClient.jsx',
  ];
  for (const s of screens) {
    const src = read(s);
    assert.match(src, /ConfirmArchiveModal/, s);
    assert.match(src, /archived: true/, s);
  }
  assert.doesNotMatch(read(screens[0]), /deleteClient|Their projects will be unlinked/);
  assert.doesNotMatch(read(screens[1]), /deleteProject|This cannot be undone/);
  assert.doesNotMatch(read(screens[2]), /Delete this note/);
  assert.doesNotMatch(read(screens[3]), /Delete this meeting note/);
  assert.doesNotMatch(read(screens[4]), /deleteContact/);
});

// ─── places that must still count archived rows ─────────────────────────────

test('the next budget number counts archived projects (budgetNumber is unique)', () => {
  // Numbering moved into createProject (shared with "create from a web request").
  const src = read('src/lib/projects/createProject.js');
  assert.match(src, /budgetNumber: \{ startsWith: prefix \}, \.\.\.INCLUDE_ARCHIVED/);
});

test('an archived company keeps its Project Team seat', () => {
  const src = read('src/app/api/projects/[id]/route.js');
  assert.match(src, /id: \{ in: teamIds \}, \.\.\.INCLUDE_ARCHIVED/);
});

// 2026-09-15: people are turned off, never deleted, so the old "count their
// archived jobs before deleting" check went with the delete itself.
test('a user can never be deleted, only turned off', () => {
  const src = read('src/app/api/admin/users/[id]/route.js');
  assert.match(src, /status: 405/);
  assert.doesNotMatch(src.replace(/\/\/.*$/gm, ''), /user\.delete\(/);
});

// ─── migration ──────────────────────────────────────────────────────────────

test('migration 0075 only adds (no drops, no data rewrites)', () => {
  const sql = read('prisma/migrations/0075_archive_only_records/migration.sql');
  const code = sql.replace(/--.*$/gm, '');
  assert.doesNotMatch(code, /\bDROP\b/i);
  // A statement that rewrites data (not the ON UPDATE CASCADE of a foreign key).
  assert.doesNotMatch(code, /^\s*(UPDATE|DELETE\s+FROM|INSERT)\b/im);
  for (const t of ['"Client"', '"Project"', '"ClientContact"', '"Note"']) {
    assert.match(sql, new RegExp(`ALTER TABLE ${t} ADD COLUMN "archivedAt"`), t);
  }
});

// ─── end to end, against the running dev server ─────────────────────────────

test('archive → hidden from the list → delete refused → restore → back', async (t) => {
  if (!(await serverUp())) { t.skip(`dev server not reachable at ${BASE}`); return; }

  const { cookie } = await login('admin@ilcstudios.com', 'ILCadmin2024!');
  const name = `CLAUDE E2E - archive test ${Date.now()}`;
  const made = await post('/api/clients', { name }, cookie);
  assert.ok(made.status < 300, `client create failed: ${made.text}`);
  const id = made.json?.client?.id ?? made.json?.id;
  assert.ok(id, 'client create returned no id');

  try {
    assert.ok((await get('/api/clients', cookie)).text.includes(id), 'new company should be listed');

    const archived = await post(`/api/clients/${id}`, { archived: true }, cookie);
    assert.equal(archived.status, 200, archived.text);
    assert.ok(archived.json?.client?.archivedAt, 'archive should stamp archivedAt');

    assert.ok(!(await get('/api/clients', cookie)).text.includes(id), 'archived company must drop off the list');
    assert.equal((await get(`/api/clients/${id}`, cookie)).status, 200, 'its own page must still open');

    const del = await fetch(`${BASE}/api/clients/${id}`, { method: 'DELETE', headers: { cookie } });
    assert.equal(del.status, 405, 'delete must be refused');

    const missing = await post(`/api/clients/${id}`, {}, cookie);
    assert.equal(missing.status, 400, 'a POST with no flag is a mistake, not an archive');

    const restored = await post(`/api/clients/${id}`, { archived: false }, cookie);
    assert.equal(restored.status, 200, restored.text);
    assert.equal(restored.json?.client?.archivedAt, null);
    assert.ok((await get('/api/clients', cookie)).text.includes(id), 'restored company is listed again');
  } finally {
    const prisma = new PrismaClient();
    try { await prisma.client.deleteMany({ where: { id } }); }
    finally { await prisma.$disconnect(); }
  }
});
