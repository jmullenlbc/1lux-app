// Client branches (0140) against a running dev server: link a branch, both
// location types follow, one level only, the company page shows the panel,
// unlink. Test companies are archived at the end, never deleted.
// Skips when the server is down.
// Run: node --test scripts/tests/clientBranchesE2e.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { BASE, login, get, post, serverUp } from './_auth.mjs';
import { ensureE2eAdmin } from './_e2eAdmin.mjs';

const TAG = `CLAUDE E2E ${Date.now()}`;

async function patch(id, body, cookie) {
  const res = await fetch(`${BASE}/api/clients/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify(body) });
  return { status: res.status, json: await res.json().catch(() => null) };
}

test('national company with local branches', async (t) => {
  if (!(await serverUp())) { t.skip('dev server not running'); return; }
  const prisma = new PrismaClient();
  const made = [];
  let cookie = null;
  try {
    const { email, password } = await ensureE2eAdmin(prisma);
    ({ cookie } = await login(email, password));
    const create = async (name) => {
      const r = await post('/api/clients', { name }, cookie);
      assert.ok(r.status < 300 && r.json?.client?.id, `create ${name}: ${r.text}`);
      made.push(r.json.client.id);
      return r.json.client.id;
    };
    const national = await create(`${TAG} National`);
    const denver   = await create(`${TAG} National`);
    const other    = await create(`${TAG} Other`);

    // Link Denver under the national company.
    const linked = await patch(denver, { parentClientId: national, branchMarket: ' Denver ' }, cookie);
    assert.equal(linked.status, 200, JSON.stringify(linked.json));
    assert.equal(linked.json.client.parentClientId, national);
    assert.equal(linked.json.client.branchMarket, 'Denver');
    assert.equal(linked.json.client.locationType, 'localBranch');
    const parentRow = await prisma.client.findUnique({ where: { id: national }, select: { locationType: true } });
    assert.equal(parentRow.locationType, 'national');

    // One level only, and never a branch of itself.
    assert.equal((await patch(other, { parentClientId: denver }, cookie)).status, 400, 'a branch cannot have branches');
    assert.equal((await patch(national, { parentClientId: other }, cookie)).status, 400, 'a company with branches cannot become a branch');
    const self = await patch(other, { parentClientId: other }, cookie);
    assert.equal(self.status, 400);
    assert.match(self.json.error, /Nothing was changed/);

    // The national company's page shows the branch with its market.
    const page = await get(`/clients/${national}`, cookie);
    assert.equal(page.status, 200);
    assert.match(page.text, /Branches/);
    assert.match(page.text, /Denver/);
    // The branch's page names its national company.
    const branchPage = await get(`/clients/${denver}`, cookie);
    assert.match(branchPage.text, /Branch of/);

    // Unlink: back to standalone, market cleared.
    const un = await patch(denver, { parentClientId: null }, cookie);
    assert.equal(un.status, 200);
    assert.equal(un.json.client.parentClientId, null);
    assert.equal(un.json.client.branchMarket, null);
    assert.equal(un.json.client.locationType, 'standalone');
  } finally {
    for (const id of made) await post(`/api/clients/${id}`, { archived: true }, cookie).catch(() => {});
    await prisma.$disconnect();
  }
});
