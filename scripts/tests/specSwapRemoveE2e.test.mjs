// Admin > Peer review matrices: load a throwaway job, take it out with the
// Remove button's request, check it leaves the list and its rows are archived
// (not deleted). Skips when the server is down.
// Run: node --test scripts/tests/specSwapRemoveE2e.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { login, get, post, serverUp } from './_auth.mjs';
import { ensureE2eAdmin } from './_e2eAdmin.mjs';

test('spec swaps: remove archives one job only', async (t) => {
  if (!(await serverUp())) { t.skip('dev server not reachable'); return; }
  const prisma = new PrismaClient();
  const job = `CLAUDE E2E JOB ${Date.now()}`;
  try {
    const { email, password } = await ensureE2eAdmin(prisma);
    const { cookie } = await login(email, password);
    const before = await get('/api/admin/spec-swaps', cookie);
    assert.equal(before.status, 200, before.text);

    const line = (type, propCatalog) => ({ type, description: 'Downlight', sheetName: 'E2E', origMfr: 'Lithonia', origCatalog: 'LDN6', propMfr: 'Eluma', propCatalog, qty: 10, uom: 'EA', unitCn: 100 });
    const loaded = await post('/api/admin/spec-swaps', { job, lines: [line('A1', 'X1'), line('A2', 'X2')] }, cookie);
    assert.equal(loaded.status, 200, loaded.text);
    assert.equal(loaded.json.rows, 2);

    const mid = await get('/api/admin/spec-swaps', cookie);
    assert.ok(mid.json.jobs.some((j) => j.job === job));

    const removed = await post('/api/admin/spec-swaps', { job, remove: true }, cookie);
    assert.equal(removed.status, 200, removed.text);
    assert.equal(removed.json.removed, 2);

    const after = await get('/api/admin/spec-swaps', cookie);
    assert.ok(!after.json.jobs.some((j) => j.job === job));
    assert.equal(after.json.rows, before.json.rows);
    assert.equal(after.json.jobs.length, before.json.jobs.length);
    assert.equal(await prisma.specSwap.count({ where: { sourceName: job, archivedAt: { not: null } } }), 2);
  } finally {
    await prisma.specSwap.deleteMany({ where: { sourceName: job } });
    await prisma.$disconnect();
  }
});
