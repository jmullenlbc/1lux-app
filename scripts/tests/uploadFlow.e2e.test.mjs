// End-to-end test of the questionnaire drawing-upload flow, against a RUNNING dev server.
//
//   node --test scripts/tests/uploadFlow.e2e.test.mjs
//
// Needs: dev server on :3000 (npm run dev:3000) and ANTHROPIC_API_KEY in .env
// both parse routes make real AI calls, so this test costs a few cents and takes
// up to a minute. It is deliberately excluded from `npm test` for that reason.
//
// What it proves, using only the same HTTP calls the upload widgets make:
//   1. login → create a throwaway project
//   2. upload a synthetic unit-matrix .xlsx → AI parse → commit → ProjectData updated
//   3. upload a synthetic site-plan .pdf → AI vision parse → numBuildings proposed →
//      commit a corrected value → ProjectData updated + verdict recorded
//   4. remove the throwaway project straight from the database (the app itself
//      only archives projects now, never deletes them, migration 0075)
//
// Both fixtures are generated in memory, no client documents involved. The site
// plan states "NUMBER OF BUILDINGS: 8 (7 RESIDENTIAL + 1 CLUBHOUSE)" on purpose:
// it is the exact clubhouse trap the numBuildings field warns about, and the test
// commits the corrected value (7) to exercise the CORRECTED-verdict path.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { BASE, login, get, post, serverUp, postParked } from './_auth.mjs';

// ─── in-memory fixtures ─────────────────────────────────────────────────────

function makeSitePlanPdf() {
  const lines = [
    'CLAUDE TEST GARDENS - CONCEPTUAL SITE PLAN',
    'SHEET C1.0',
    '',
    'SITE DATA',
    'LOT AREA: 435,600 SF (10.00 ACRES)',
    'TOTAL DWELLING UNITS: 240',
    'NUMBER OF BUILDINGS: 8 (7 RESIDENTIAL + 1 CLUBHOUSE)',
    'STRUCTURED GARAGE PARKING: 180 SPACES',
    'SURFACE PARKING: 96 SPACES',
    'EXTERIOR AMENITY AREA: 12,500 SF (POOL DECK + COURTYARD)',
    'ZONING: MF-2',
  ];
  const esc = s => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  let stream = 'BT\n/F1 12 Tf\n72 720 Td\n14 TL\n';
  for (const l of lines) stream += `(${esc(l)}) Tj\nT*\n`;
  stream += 'ET\n';

  const objs = [];
  objs[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objs[2] = '<< /Type /Pages /Kids [3 0 R] /Count 1 >>';
  objs[3] = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>';
  objs[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
  objs[5] = `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}endstream`;

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (let i = 1; i <= 5; i++) {
    offsets[i] = Buffer.byteLength(pdf);
    pdf += `${i} 0 obj\n${objs[i]}\nendobj\n`;
  }
  const xrefPos = Buffer.byteLength(pdf);
  pdf += 'xref\n0 6\n0000000000 65535 f \n';
  for (let i = 1; i <= 5; i++) pdf += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
  pdf += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`;
  return Buffer.from(pdf, 'binary');
}

async function makeUnitMatrixXlsx() {
  const XLSX = await import('xlsx');
  const rows = [
    ['CLAUDE TEST GARDENS - UNIT MATRIX'],
    [],
    ['Unit Type', 'Description', 'Qty', 'Unit SF', 'Bedrooms', 'Bathrooms', 'Balconies'],
    ['S1', 'Studio',         24,  520, 0, 1, 0],
    ['A1', '1 Bed / 1 Bath', 96,  750, 1, 1, 1],
    ['B2', '2 Bed / 2 Bath', 120, 1050, 2, 2, 1],
    [],
    ['TOTAL UNITS', '', 240],
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Unit Matrix');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

// ─── HTTP helpers the shared harness doesn't have ───────────────────────────

async function uploadFile(projectId, cookie, { name, type, buffer, tab }) {
  const fd = new FormData();
  fd.append('file', new Blob([buffer], { type }), name);
  fd.append('tab', tab);
  const res = await fetch(`${BASE}/api/projects/${projectId}/files`, {
    method: 'POST', headers: { cookie }, body: fd,
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

// The app refuses to delete projects (they are archived instead), so the
// throwaway project is removed straight from the database. deleteMany, so a
// missing row is not an error.
async function removeProject(id) {
  const prisma = new PrismaClient();
  try {
    return await prisma.project.deleteMany({ where: { id } });
  } finally {
    await prisma.$disconnect();
  }
}

// ─── the test ───────────────────────────────────────────────────────────────

test('questionnaire drawing-upload flow, end to end', { timeout: 300_000 }, async (t) => {
  assert.ok(await serverUp(), `dev server not reachable at ${BASE}, run npm run dev:3000 first`);

  const { cookie } = await login('admin@ilcstudios.com', 'ILCadmin2024!');

  const created = await post('/api/projects', { name: 'CLAUDE E2E - upload flow (auto-delete)' }, cookie);
  assert.equal(created.status, 201, `project create failed: ${created.text}`);
  const projectId = created.json?.project?.id ?? created.json?.id;
  assert.ok(projectId, 'project create returned no id');

  try {
    await t.test('unit matrix: upload → parse → commit updates ProjectData', async () => {
      const xlsx = await makeUnitMatrixXlsx();
      const up = await uploadFile(projectId, cookie, {
        name: 'claude-e2e-unitmix.xlsx',
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        buffer: xlsx, tab: 'unit-matrix',
      });
      assert.equal(up.status, 201, `upload failed: ${JSON.stringify(up.json)}`);
      const fileId = up.json.file.id;

      const parsed = await postParked(`/api/projects/${projectId}/unit-matrix/parse`, { fileId }, cookie);
      assert.equal(parsed.status, 200, `parse failed: ${parsed.text}`);
      const types = parsed.json.unitTypes;
      assert.ok(Array.isArray(types) && types.length >= 3, `expected ≥3 unit types, got ${types?.length}`);
      assert.ok(parsed.json.review?.runId, 'parse returned no review.runId');

      // The document is unambiguous, so the AI must land the exact totals.
      const numUnits = types.reduce((s, u) => s + (u.qty || 0), 0);
      const unitsSf  = types.reduce((s, u) => s + (u.qty || 0) * (u.unitSf || 0), 0);
      assert.equal(numUnits, 240, 'extracted unit count should match the document');
      assert.equal(unitsSf, 210480, 'extracted total unit SF should match the document');

      const commit = await post(`/api/projects/${projectId}/unit-matrix/commit`, {
        fileId,
        unitTypes: types,
        confirmedFields: { numUnits, unitsSf },
        runId: parsed.json.review.runId,
      }, cookie);
      assert.equal(commit.status, 200, `commit failed: ${commit.text}`);
      assert.equal(commit.json.projectData?.numUnits, 240, 'ProjectData.numUnits not updated');
      assert.equal(commit.json.projectData?.unitsSf, 210480, 'ProjectData.unitsSf not updated');
      assert.equal(commit.json.unitTypes?.length, types.length, 'saved unit types count mismatch');
    });

    await t.test('site plan: upload → vision parse → corrected commit + verdict', async () => {
      const up = await uploadFile(projectId, cookie, {
        name: 'claude-e2e-siteplan.pdf',
        type: 'application/pdf',
        buffer: makeSitePlanPdf(), tab: 'site-plan',
      });
      assert.equal(up.status, 201, `upload failed: ${JSON.stringify(up.json)}`);
      const fileId = up.json.file.id;

      const parsed = await postParked(`/api/projects/${projectId}/site/parse`, { fileId }, cookie);
      assert.equal(parsed.status, 200, `site parse failed: ${parsed.text}`);
      const rows = parsed.json.proposal;
      assert.ok(Array.isArray(rows) && rows.length > 0, 'site parse proposed no fields');
      assert.ok(parsed.json.review?.runId, 'site parse returned no review.runId');

      const byKey = Object.fromEntries(rows.map(r => [r.key, r]));
      assert.ok(byKey.numBuildings, 'no numBuildings proposal: the new field is not being read');
      // The sheet says 8 total / 7 residential; either read is defensible.
      assert.ok([7, 8].includes(byKey.numBuildings.value),
        `numBuildings read ${byKey.numBuildings.value}, expected 7 or 8`);
      assert.equal(byKey.lotSf?.value, 435600, 'lot area misread');
      assert.equal(byKey.numSurfaceParking?.value, 96, 'surface parking misread');

      // Commit the residential-only count, when the AI read 8, this walks the
      // CORRECTED-verdict path the trust tiers learn from.
      const commit = await post(`/api/projects/${projectId}/site/commit`, {
        fileId,
        fields: { numBuildings: 7, lotSf: 435600, numSurfaceParking: 96 },
        runId: parsed.json.review.runId,
      }, cookie);
      assert.equal(commit.status, 200, `site commit failed: ${commit.text}`);
      assert.equal(commit.json.projectData?.numBuildings, 7, 'ProjectData.numBuildings not updated');
      assert.equal(commit.json.projectData?.lotSf, 435600, 'ProjectData.lotSf not updated');
      assert.ok(commit.json.verdict, 'commit recorded no verdict');
    });

    await t.test('committed values survive a fresh read', async () => {
      const back = await get(`/api/projects/${projectId}/unit-matrix`, cookie);
      assert.equal(back.status, 200);
      assert.ok(back.json.unitTypes?.length >= 3, 'unit types did not persist');
    });
  } finally {
    const gone = await removeProject(projectId);
    assert.equal(gone.count, 1, 'cleanup: project delete failed, remove it by hand');
  }
});
