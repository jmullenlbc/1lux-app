// Admin > Fixture kinds: the kinds list, brand grades and past jobs load, and
// trying a past job rates its ILC prices against the other jobs. Read only.
// Skips when the server is down or no matrices are loaded.
// Run: node --test scripts/tests/bidComparisonE2e.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { login, get, serverUp } from './_auth.mjs';
import { ensureE2eAdmin } from './_e2eAdmin.mjs';

test('bid comparison: kinds, jobs and a past job check', async (t) => {
  if (!(await serverUp())) { t.skip('dev server not reachable'); return; }
  const prisma = new PrismaClient();
  try {
    const { email, password } = await ensureE2eAdmin(prisma);
    const { cookie } = await login(email, password);

    const anon = await get('/api/admin/bid-comparison');
    assert.ok(anon.status === 401 || anon.status === 403, `signed out got ${anon.status}`);

    const list = await get('/api/admin/bid-comparison', cookie);
    assert.equal(list.status, 200, list.text);
    const fan = list.json.kinds.find((k) => k.key === 'fan');
    assert.ok(fan, 'fan kind listed');
    assert.match(fan.builderRange, /\$80/);
    assert.ok(fan.builderWords.includes('PULL CHAIN'));
    assert.ok(list.json.brands.some((b) => b.brand === 'SAGE' && b.sage && !b.grade), 'Sage is one unrated brand');
    if (!list.json.jobs.length) { t.skip('no peer review matrices loaded'); return; }

    const job = list.json.jobs[0];
    const one = await get(`/api/admin/bid-comparison?job=${encodeURIComponent(job.job)}`, cookie);
    assert.equal(one.status, 200, one.text);
    const bid = one.json.result.bids[0];
    const c = bid.counts.vsTypical;
    assert.equal(c.HIGH + c.MEDIUM + c.LOW + c.NONE > 0, true);
    assert.ok(one.json.result.rows.length > 0);
    assert.ok(one.json.typicals.jobs < list.json.jobs.length, 'the tried job is left out of its own typicals');

    const missing = await get('/api/admin/bid-comparison?job=NO%20SUCH%20JOB%20E2E', cookie);
    assert.equal(missing.status, 404);
  } finally {
    await prisma.$disconnect();
  }
});
