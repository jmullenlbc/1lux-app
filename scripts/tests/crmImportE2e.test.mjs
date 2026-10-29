// Admin > CRM upload against a running dev server: the typed confirm guards the
// wipe, one batch each of companies (with a branch and another spelling),
// people (tag + extra email) and projects (statuses, money, units) loads, and
// sending the same batch again adds nothing, and a person with an office lands
// on that branch. Does NOT run the real wipe; only this test's own rows are
// deleted afterwards. Skips when the server is down.
// Run: node --test scripts/tests/crmImportE2e.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { get, login, post, serverUp } from './_auth.mjs';
import { ensureE2eAdmin } from './_e2eAdmin.mjs';

const TAG = `CLAUDE E2E ${Date.now()}`;

test('CRM upload batches', async (t) => {
  if (!(await serverUp())) { t.skip('dev server not running'); return; }
  const prisma = new PrismaClient();
  try {
    const { email, password } = await ensureE2eAdmin(prisma);
    const { cookie } = await login(email, password);

    const now = await get('/api/admin/crm-import', cookie);
    assert.equal(now.status, 200, now.text);
    assert.ok(Number.isInteger(now.json.manufacturers) && Array.isArray(now.json.users));

    const bad = await post('/api/admin/crm-import', { action: 'wipe', confirm: 'wipe' }, cookie);
    assert.equal(bad.status, 400);
    assert.match(bad.json.error, /Nothing was changed/);
    assert.equal((await post('/api/admin/crm-import', { action: 'people', rows: [] }, cookie)).status, 400);

    const co = {
      name: `${TAG} Builders`, type: 'generalContractor', orgLabel: 'General Contractor',
      aliases: [`${TAG} BUILDERS (DENVER)`], domains: ['e2e.test'], markets: ['Denver'], owner: null,
    };
    const c1 = await post('/api/admin/crm-import', { action: 'companies', rows: [co] }, cookie);
    assert.equal(c1.status, 200, c1.text);
    assert.equal(c1.json.created, 1);
    assert.equal(c1.json.branches, 1);
    assert.equal((await post('/api/admin/crm-import', { action: 'companies', rows: [co] }, cookie)).json.created, 0, 'retry adds nothing');

    const parent = await prisma.client.findFirst({ where: { name: co.name, parentClientId: null }, include: { branches: true, aliases: true } });
    assert.equal(parent.locationType, 'national');
    assert.equal(parent.branches[0].branchMarket, 'Denver');
    assert.equal(parent.aliases.length, 1);

    const mail = `e2e-${Date.now()}@example.test`;
    const person = {
      key: mail, name: `${TAG} Pat Lee`, firstName: `${TAG} Pat`, lastName: 'Lee', email: mail, company: co.name,
      title: 'PM', phone: '303-555-0100', otherEmails: [`other-${mail}`], tags: [`${TAG} mixer`], notes: 'test',
    };
    const p1 = await post('/api/admin/crm-import', { action: 'people', rows: [person] }, cookie);
    assert.equal(p1.json.created, 1, p1.text);
    assert.equal((await post('/api/admin/crm-import', { action: 'people', rows: [person] }, cookie)).json.created, 0);
    const pat = await prisma.contact.findFirst({ where: { email: mail }, include: { otherEmails: true, tagLinks: true } });
    assert.equal(pat.clientId, parent.id);
    assert.equal(pat.otherEmails.length, 1);
    assert.equal(pat.tagLinks.length, 1);

    const deb = { ...person, key: 'deb', name: `${TAG} Deb Ray`, firstName: `${TAG} Deb`, lastName: 'Ray', email: null, otherEmails: [], tags: [], office: 'Denver' };
    assert.equal((await post('/api/admin/crm-import', { action: 'people', rows: [deb] }, cookie)).json.created, 1);
    assert.equal((await prisma.contact.findFirst({ where: { name: deb.name } })).clientId, parent.branches[0].id, 'office puts the person on the branch');

    const job = {
      key: 'x', name: `${TAG} Tower`, company: co.name, serviceType: 'designAssist',
      procurementStatus: 'LOST', designStatus: 'WON', contractValue: 1100000, designContractValue: 80000,
      totalInvoiced: 5000, expectedOrderDate: '2027-04-14T12:00:00.000Z', phase: 'construction', salesperson: null, numUnits: 280,
    };
    const bare = { ...job, name: `${TAG} Lot`, phase: null, numUnits: null };
    const j1 = await post('/api/admin/crm-import', { action: 'projects', rows: [job] }, cookie);
    assert.equal(j1.json.created, 1, j1.text);
    assert.equal((await post('/api/admin/crm-import', { action: 'projects', rows: [job] }, cookie)).json.created, 0);
    const pr = await prisma.project.findFirst({ where: { name: job.name }, include: { projectData: true, statusEvents: true } });
    assert.equal(pr.clientId, parent.id);
    assert.equal(pr.procurementStatus, 'LOST');
    assert.ok(pr.procurementStatusReason);
    assert.equal(pr.designStatus, 'WON');
    assert.equal(pr.contractValue, 1100000);
    assert.equal(pr.phase, 'construction');
    assert.equal(pr.projectData.numUnits, 280);
    assert.equal(pr.expectedOrderDate.toISOString().slice(0, 10), '2027-04-14');
    assert.deepEqual(pr.statusEvents.map(e => e.toStatus).sort(), ['LOST', 'WON']);
    assert.equal((await post('/api/admin/crm-import', { action: 'projects', rows: [bare] }, cookie)).json.created, 1);
    assert.equal((await prisma.project.findFirst({ where: { name: bare.name } })).phase, '', 'no stage = no phase');
  } finally {
    const mine = { name: { startsWith: TAG } };
    await prisma.project.deleteMany({ where: mine }).catch(() => {});
    await prisma.contact.deleteMany({ where: mine }).catch(() => {});
    await prisma.client.deleteMany({ where: { ...mine, parentClientId: { not: null } } }).catch(() => {});
    await prisma.client.deleteMany({ where: mine }).catch(() => {});
    await prisma.contactTag.deleteMany({ where: { name: { startsWith: TAG } } }).catch(() => {});
    await prisma.$disconnect();
  }
});
