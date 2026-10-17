// Migration 0079 (Mike, 2026-09-12):
//  1. QC bug reports are archive-only, Archive/Restore, never Delete.
//  2. Every user picks any number of seven departments; the old one-per-person
//     division and the JSON deptRoles list are retired (kept, never read).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  DEPARTMENTS, DEPARTMENT_KEYS, DEPARTMENT_LABEL, SALES_MARKETING,
  cleanDepartments, departmentKeys, hasDepartment, inDepartment,
} from '../../src/lib/departments.js';
import { NEVER_DELETED, ARCHIVABLE } from '../../src/lib/archive.js';

const read = p => readFileSync(p, 'utf8');

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(js|jsx|mjs)$/.test(name)) out.push(p);
  }
  return out;
}

// Seven until 2026-09-14, when Project management folded into Construction
// (Mike: "Project management and construction are the same department").
test('exactly six departments, in Mike\'s order, Project management is now Construction', () => {
  assert.deepEqual(DEPARTMENTS.map(d => d.label), [
    'Sales + marketing', 'Operations', 'Pre-construction', 'Construction', 'Design', 'Finance',
  ]);
  assert.equal(SALES_MARKETING, 'SALES_MARKETING');
  assert.equal(DEPARTMENT_LABEL.CONSTRUCTION, 'Construction');
  assert.equal(DEPARTMENT_LABEL.PROJECT_MANAGEMENT, undefined);
  assert.equal(new Set(DEPARTMENT_KEYS).size, 6);
  // A leftover Project management row is ignored, never shown.
  assert.deepEqual(
    departmentKeys({ departments: [{ department: 'PROJECT_MANAGEMENT' }, { department: 'CONSTRUCTION' }] }),
    ['CONSTRUCTION'],
  );
  assert.ok(!/PROJECT_MANAGEMENT/.test(read('src/app/(app)/admin/AdminClient.jsx')));
});

test('migration 0085 moves Project management into Construction and deletes nothing', () => {
  const sql = read('prisma/migrations/0085_merge_project_management_into_construction/migration.sql')
    .replace(/--.*$/gm, '');
  assert.match(sql, /UPDATE "UserDepartment"\s+SET "department" = 'CONSTRUCTION'/);
  assert.match(sql, /WHERE "department" = 'PROJECT_MANAGEMENT'/);
  // Someone already in both would break the one-row-per-person-per-department rule.
  assert.match(sql, /NOT EXISTS/);
  assert.doesNotMatch(sql, /\b(DELETE|DROP|TRUNCATE|ALTER)\b/i);
});

test('cleanDepartments keeps known keys once, in the standard order', () => {
  assert.deepEqual(cleanDepartments(['FINANCE', 'SALES_MARKETING', 'FINANCE', 'NOPE']), ['SALES_MARKETING', 'FINANCE']);
  assert.deepEqual(cleanDepartments([]), []);
  assert.equal(cleanDepartments('FINANCE'), null);
  assert.equal(cleanDepartments(undefined), null);
});

test('department helpers read rows or plain keys', () => {
  const user = { departments: [{ department: 'DESIGN' }, { department: 'SALES_MARKETING' }] };
  assert.deepEqual(departmentKeys(user), ['SALES_MARKETING', 'DESIGN']);
  assert.ok(hasDepartment(user, SALES_MARKETING));
  assert.ok(hasDepartment({ departments: ['FINANCE'] }, 'FINANCE'));
  assert.ok(!hasDepartment(null, 'FINANCE'));
  assert.deepEqual(inDepartment('DESIGN'), { departments: { some: { department: 'DESIGN' } } });
});

test('migration 0079 backfills the old labels and drops nothing', () => {
  const sql = read('prisma/migrations/0079_bug_report_archive_user_departments/migration.sql');
  assert.ok(!/\bDROP\b/i.test(sql), '0079 must not drop anything');
  assert.match(sql, /CREATE TABLE "UserDepartment"/);
  assert.match(sql, /"archivedAt" TIMESTAMP\(3\)/);
  for (const [from, to] of [["'SALES'", 'SALES_MARKETING'], ["'Sales'", 'SALES_MARKETING'], ["'Pre-construction'", 'PRECONSTRUCTION'], ["'Design'", 'DESIGN']]) {
    // Division values map in a CASE; department tags in a VALUES list.
    const mapped = new RegExp(`${from}\\s+THEN\\s+'${to}'`).test(sql)
      || new RegExp(`\\(${from},\\s*'${to}'\\)`).test(sql);
    assert.ok(mapped, `0079 should map ${from} to ${to}`);
  }
  // The tag list is matched as text, never parsed: bad JSON must not stop a deploy.
  const code = sql.replace(/--.*$/gm, '');
  assert.ok(!/::json|json_each|json_array/i.test(code), '0079 must not parse deptRoles as JSON');
  assert.match(code, /LIKE/);
  assert.match(sql, /ON CONFLICT DO NOTHING/);
});

test('nothing in src still reads the retired division / deptRoles fields', () => {
  const hits = walk('src').filter(f => /\b(deptRoles|division)\b/.test(read(f).replace(/\/\/.*$/gm, '')));
  assert.deepEqual(hits, []);
  assert.ok(!existsSync('src/lib/divisions.js'), 'divisions.js was replaced by departments.js');
});

test('the Sales gates use the Sales + marketing department', () => {
  // Departments now ride on every signed-in user, read live from the account
  // (privileges step 1, 2026-09-14), so the gate no longer does its own lookup.
  assert.match(read('src/lib/auth.js'), /hasDepartment\(user, SALES_MARKETING\)/);
  assert.match(read('src/app/api/intake/submit/route.js'), /inDepartment\(SALES_MARKETING\)/);
  for (const f of ['src/components/crm/PipelineSidePanel.jsx', 'src/components/ProjectDashboard.jsx']) {
    assert.match(read(f), /\/api\/users\?department=SALES_MARKETING/, f);
  }
});

test('the admin user API saves the whole department list', () => {
  const src = read('src/app/api/admin/users/[id]/route.js');
  assert.match(src, /cleanDepartments\(departments\)/);
  assert.match(src, /userDepartment\.deleteMany/);
  assert.ok(!/skipDuplicates/.test(src.replace(/\/\/.*$/gm, '')), 'skipDuplicates throws on SQLite');
});

test('bug reports can never be deleted', () => {
  assert.ok(NEVER_DELETED.includes('bugReport'));
  // Not auto-hidden: the metrics page must keep counting archived reports.
  assert.ok(!ARCHIVABLE.includes('bugReport'));
  const route = read('src/app/api/qc/reports/[id]/route.js');
  assert.match(route, /deleteRefused\('Bug reports'\)/);
  assert.match(route, /status: 405/);
  assert.match(route, /readArchivedFlag\(request\)/);
  assert.match(route, /archiveData\(archived, user\)/);
  assert.ok(!/deleteQcObject/.test(route), 'screenshots stay in S3');
});

test('the QC board archives instead of deleting', () => {
  const board = read('src/app/(app)/admin/qc/QcBoardClient.jsx');
  assert.ok(!/method: 'DELETE'/.test(board));
  assert.ok(!/window\.confirm/.test(board));
  assert.match(board, /setArchived\(`\/api\/qc\/reports\/\$\{id\}`, archived\)/);
  assert.match(board, /Show archived/);
  assert.match(read('src/app/api/qc/reports/route.js'), /where\.archivedAt = null/);
  assert.match(read('src/app/(app)/admin/tasks/TasksQcClient.jsx'), /!r\.archivedAt/);
});
