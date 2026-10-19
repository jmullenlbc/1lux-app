// Bid Leveling screen (0136) against a running dev server: make a leveling,
// add our bid from Peer Review rows and a pasted competitor quote, read the
// leveled view, set a flag, change settings, archive. No DN in the response.
// Skips when the server is down.
// Run: node --test scripts/tests/bidLevelingE2e.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { BASE, login, get, post, serverUp } from './_auth.mjs';
import { ensureE2eAdmin } from './_e2eAdmin.mjs';

async function patch(path, body, cookie) {
  const res = await fetch(`${BASE}${path}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify(body) });
  const text = await res.text().catch(() => '');
  let json = null; try { json = JSON.parse(text); } catch {}
  return { status: res.status, text, json };
}

test('leveling: peer review bid + pasted quote -> leveled view, flags, archive', async (t) => {
  if (!(await serverUp())) { t.skip(`dev server not reachable at ${BASE}`); return; }
  const prisma = new PrismaClient();
  try {
    const { email, password } = await ensureE2eAdmin(prisma);
    const { cookie } = await login(email, password);
    const top = await prisma.peerReviewItem.groupBy({ by: ['projectId'], where: { typeCode: { not: '' } }, _count: true, orderBy: { _count: { projectId: 'desc' } }, take: 1 });
    if (!top.length) { t.skip('no project with Peer Review rows'); return; }
    const projectId = top[0].projectId;
    const base = `/api/projects/${projectId}/bid-leveling`;

    const made = await post(base, { name: `CLAUDE E2E leveling ${Date.now()}` }, cookie);
    assert.equal(made.status, 201, made.text);
    const id = made.json.leveling.id;
    try {
      const ilc = await post(`${base}/${id}/bids`, { source: 'PEER_REVIEW' }, cookie);
      assert.equal(ilc.status, 201, ilc.text);
      assert.ok(ilc.json.lines > 0);

      const items = await prisma.peerReviewItem.findMany({ where: { projectId, typeCode: { not: '' } }, take: 3, orderBy: { sortOrder: 'asc' } });
      const text = items.map((it, i) => `${it.typeCode}\t${(it.qty || 10) + i}\tCooper\tSLD6\t25\t`).join('\n');
      const comp = await post(`${base}/${id}/bids`, { source: 'PASTE', bidderName: 'E2E Competitor', text, totals: { FREIGHT: '1,200', TAX: '' }, expiresAt: '2020-01-01' }, cookie);
      assert.equal(comp.status, 201, comp.text);
      const noName = await post(`${base}/${id}/bids`, { source: 'PASTE', text }, cookie);
      assert.equal(noName.status, 400);

      const view = await get(`${base}/${id}`, cookie);
      assert.equal(view.status, 200, view.text);
      assert.equal(view.json.bids.length, 2);
      assert.equal(view.json.leveling.baselineBidId, ilc.json.bid.id, 'our bid is the baseline');
      assert.ok(view.json.matrix.types.length > 0);
      assert.ok(view.json.normalized.perBid[comp.json.bid.id].grand > 0);
      assert.equal(view.json.flags[comp.json.bid.id].validity.state, 'EXPIRED');
      assert.ok(view.json.clarifications[comp.json.bid.id].some((q) => /expired/i.test(q)));
      assert.ok(!/unitDn|propUnitDN/i.test(view.text), 'no DN in the view');

      const flag = await patch(`${base}/${id}/bids/${comp.json.bid.id}`, { flags: [{ key: 'freight', state: 'INCLUDED' }], totals: { FREIGHT: '900' } }, cookie);
      assert.equal(flag.status, 200, flag.text);
      const badFlag = await patch(`${base}/${id}/bids/${comp.json.bid.id}`, { flags: [{ key: 'nope', state: 'INCLUDED' }] }, cookie);
      assert.equal(badFlag.status, 400);
      const set = await patch(`${base}/${id}`, { taxRate: '8.6', freightMode: 'AS_QUOTED' }, cookie);
      assert.equal(set.status, 200, set.text);
      assert.equal(set.json.leveling.taxRate, 0.086);

      const again = await get(`${base}/${id}`, cookie);
      const compBid = again.json.bids.find((b) => b.id === comp.json.bid.id);
      assert.equal(compBid.totals.find((x) => x.bucket === 'FREIGHT').amount, 900);
      assert.equal(again.json.flags[compBid.id].freight.state, 'INCLUDED');
      assert.equal(again.json.normalized.perBid[compBid.id].freight, 900);

      // The page itself compiles and serves.
      const page = await get(`/project/${projectId}?tab=bid-leveling`, cookie);
      assert.equal(page.status, 200);
    } finally {
      await patch(`${base}/${id}`, { archived: true }, cookie);
    }
    const list = await get(base, cookie);
    assert.ok(!list.json.levelings.some((l) => l.id === id), 'archived leveling is hidden');
  } finally {
    await prisma.$disconnect();
  }
});
