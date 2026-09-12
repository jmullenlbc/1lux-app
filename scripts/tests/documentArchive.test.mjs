// Project files, drawing sets, budget matrix versions and products are
// archived, never deleted. Conceptual budget submissions and questionnaire
// answers can never be deleted at all.
//
// Mike, 2026-09-11: "yes drawings and budgets and products should be archive
// only" and "like budget matrix, conceptual budget, design questionnaire I
// don't want to be deleted". Migration 0076.
//
// The first tests read the source. The last one drives a running dev server
// (npm run dev:3000) and is skipped when there isn't one.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, sep } from 'node:path';
import {
  ARCHIVABLE_DOCUMENTS, NEVER_DELETED, DeleteRefusedError, withArchiveFilter,
} from '../../src/lib/archive.js';
import { BASE, login, serverUp } from './_auth.mjs';

const ROOT = new URL('../../', import.meta.url);
const read = p => readFileSync(new URL(p, ROOT), 'utf8');
const SRC  = new URL('src', ROOT).pathname.replace(/^\/([A-Za-z]:)/, '$1');

function walk(dir, out = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(js|jsx|mjs)$/.test(f)) out.push(p);
  }
  return out;
}
const ALL = walk(SRC);
const slash = p => p.split(sep).join('/');
// The one source file whose path ends with `suffix`.
function find(suffix) {
  const hits = ALL.filter(p => slash(p).endsWith(suffix));
  assert.equal(hits.length, 1, `expected one file ending ${suffix}, found ${hits.length}`);
  return readFileSync(hits[0], 'utf8');
}

const ROUTES = [
  'src/app/api/products/[id]/route.js',
  'src/app/api/manufacturers/[id]/products/[productId]/route.js',
  'src/app/api/projects/[id]/design-bid-matrix/[matrixId]/route.js',
  'src/app/api/projects/[id]/drawing-submissions/[submissionId]/route.js',
  'src/app/api/projects/[id]/files/[fileId]/route.js',
];

// ─── the rule itself ────────────────────────────────────────────────────────

test('the four archive-only documents, and the four more that can never be deleted', () => {
  assert.deepEqual([...ARCHIVABLE_DOCUMENTS].sort(),
    ['designBidMatrix', 'drawingSubmission', 'manufacturerProduct', 'projectFile']);
  for (const m of ['drawingFile', 'conceptualSubmission', 'conceptualSubmissionAnswer', 'questionnaireResponse']) {
    assert.ok(NEVER_DELETED.includes(m), m);
  }
});

test('documents are hidden from findFirst too ("the latest file" must never be an archived one)', () => {
  let ext;
  withArchiveFilter({ $extends: e => { ext = e; return 'extended'; } });
  for (const model of ARCHIVABLE_DOCUMENTS) {
    const seen = ext.query[model].findFirst({ args: { where: { projectId: 'p' } }, query: a => a });
    assert.deepEqual(seen, { where: { projectId: 'p', archivedAt: null } }, model);
  }
});

test('deleting any never-deleted record throws, whoever writes the code', async () => {
  let ext;
  withArchiveFilter({ $extends: e => { ext = e; return 'extended'; } });
  for (const model of NEVER_DELETED) {
    for (const op of ['delete', 'deleteMany']) {
      await assert.rejects(() => ext.query[model][op]({ args: {}, query: () => 'deleted' }), DeleteRefusedError, `${model}.${op}`);
    }
  }
});

// ─── nothing deletes ────────────────────────────────────────────────────────

test('nothing in the app deletes one of these records', () => {
  const re = new RegExp(`\\.(${NEVER_DELETED.join('|')})\\.delete(Many)?\\(`);
  const offenders = ALL.filter(p => re.test(readFileSync(p, 'utf8'))).map(slash);
  assert.deepEqual(offenders, []);
});

test('all five delete routes refuse with a 405, and each has an archive/restore POST', () => {
  for (const r of ROUTES) {
    const src = read(r);
    const del = src.slice(src.indexOf('export async function DELETE'));
    assert.match(del, /deleteRefused\(/, r);
    assert.match(del, /status: 405/, r);
    assert.match(src, /export async function POST/, r);
    assert.match(src, /archiveData\(/, r);
    assert.match(src, /readArchivedFlag\((req|request)\)/, r);
  }
});

test('no screen sends a DELETE for a file, drawing set, budget version or product', () => {
  const re = /fetch\(`[^`]*\/(files|drawing-submissions|design-bid-matrix|products)\/\$\{[^`]*`\s*,\s*\{\s*method:\s*'DELETE'/;
  const offenders = ALL.filter(p => /\.jsx$/.test(p) && re.test(readFileSync(p, 'utf8'))).map(slash);
  assert.deepEqual(offenders, []);
});

test('every screen that removed one of these now asks with the archive confirm', () => {
  for (const s of [
    'src/app/(app)/products/[id]/ProductDetailClient.jsx',
    'src/app/(app)/project/[id]/FixtureScheduleTab.jsx',
    'src/app/(app)/project/[id]/DrawingsTab.jsx',
    'src/app/(app)/project/[id]/PeerReviewClient.jsx',
    'src/app/(app)/project/[id]/ProjectHubClient.jsx',
    'src/components/contracts/ContractsPanel.jsx',
    'src/components/files/FileDropZone.jsx',
  ]) {
    const src = read(s);
    assert.match(src, /ConfirmArchiveModal/, s);
    assert.match(src, /setArchived\(/, s);
    assert.doesNotMatch(src, /This cannot be undone/, s);
  }
  assert.match(read('src/app/(app)/products/ProductsClient.jsx'), /setArchived\(/);
});

test('deletes that would take archive-only records with them are refused, and the screens say why', () => {
  const mfr = read('src/app/api/manufacturers/[id]/route.js');
  assert.match(mfr.slice(mfr.indexOf('export async function DELETE')), /409/);
  assert.match(read('src/app/(app)/manufacturers/ManufacturersClient.jsx'), /if \(!res\?\.ok\)/);
  assert.match(read('src/app/(app)/project/[id]/FixtureScheduleEditor.jsx'), /if \(!res\?\.ok\)/);
});

// ─── places that must still count archived rows ─────────────────────────────

test('the next budget version number counts archived versions', () => {
  assert.match(find('design-bid-matrix/duplicate/route.js'), /INCLUDE_ARCHIVED/);
  assert.match(find('push-to-budget/route.js'), /INCLUDE_ARCHIVED/);
  assert.match(find('fixture-schedule/publish/route.js'), /INCLUDE_ARCHIVED/);
});

test('lists nested under a manufacturer leave archived products out by hand', () => {
  assert.match(find('calibration/capture.js'), /archivedAt: null/);
  assert.match(find('mcp/tools.js'), /archivedAt: null/);
  assert.match(read('src/app/api/manufacturers/route.js'), /archivedAt: null/);
});

test('the Archive page lists all four and restores through their own routes', () => {
  const page = read('src/app/(app)/archive/page.jsx');
  for (const m of ARCHIVABLE_DOCUMENTS) assert.match(page, new RegExp(`prisma\\.${m}\\.findMany`), m);
  for (const u of ['/files/', '/drawing-submissions/', '/design-bid-matrix/', '/api/products/']) {
    assert.ok(page.includes(u), u);
  }
  const client = read('src/app/(app)/archive/ArchiveClient.jsx');
  for (const k of ['files', 'drawings', 'budgets', 'products']) assert.match(client, new RegExp(`key: '${k}'`), k);
});

// ─── migration ──────────────────────────────────────────────────────────────

test('migration 0076 only adds (no drops, no data rewrites)', () => {
  const sql = read('prisma/migrations/0076_archive_only_documents/migration.sql');
  const code = sql.replace(/--.*$/gm, '');
  assert.doesNotMatch(code, /\bDROP\b/i);
  assert.doesNotMatch(code, /^\s*(UPDATE|DELETE\s+FROM|INSERT)\b/im);
  for (const t of ['"ProjectFile"', '"DrawingSubmission"', '"ManufacturerProduct"', '"DesignBidMatrix"']) {
    assert.match(sql, new RegExp(`ALTER TABLE ${t} ADD COLUMN "archivedAt"`), t);
  }
});

// ─── against the running dev server ─────────────────────────────────────────

test('every delete route answers 405 on the running server', async (t) => {
  if (!(await serverUp())) { t.skip(`dev server not reachable at ${BASE}`); return; }
  const { cookie } = await login('admin@ilcstudios.com', 'ILCadmin2024!');
  for (const url of [
    '/api/products/nope',
    '/api/manufacturers/nope/products/nope',
    '/api/projects/nope/design-bid-matrix/nope',
    '/api/projects/nope/drawing-submissions/nope',
    '/api/projects/nope/files/nope',
  ]) {
    const res = await fetch(`${BASE}${url}`, { method: 'DELETE', headers: { cookie } });
    assert.equal(res.status, 405, url);
  }
});
