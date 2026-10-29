// People tags + "Already in the CRM twice?" merges (0141) against a running dev
// server: bulk tag, tag shows on the Contacts list, merge two companies, merge
// two people, Different is remembered. Test rows are archived, never deleted.
// Skips when the server is down.
// Run: node --test scripts/tests/crmTagsMergeE2e.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { get, login, post, serverUp } from './_auth.mjs';
import { ensureE2eAdmin } from './_e2eAdmin.mjs';

const TAG = `CLAUDE E2E ${Date.now()}`;

test('people tags and CRM duplicate merges', async (t) => {
  if (!(await serverUp())) { t.skip('dev server not running'); return; }
  const prisma = new PrismaClient();
  const clients = [];
  const contacts = [];
  try {
    const { email, password } = await ensureE2eAdmin(prisma);
    const { cookie } = await login(email, password);
    const company = async (name) => {
      const r = await post('/api/clients', { name }, cookie);
      assert.ok(r.status < 300 && r.json?.client?.id, `create ${name}: ${r.text}`);
      clients.push(r.json.client.id);
      return r.json.client.id;
    };
    const person = async (data) => {
      const c = await prisma.contact.create({ data });
      contacts.push(c.id);
      return c.id;
    };
    const keepCo = await company(`${TAG} Merge Co`);
    const goneCo = await company(`${TAG} Merge Builders`);
    const mail = `e2e-${Date.now()}@example.test`;
    const p1 = await person({ name: `${TAG} Pat`, email: mail, clientId: keepCo });
    const p2 = await person({ name: `${TAG} Pat`, email: `other-${mail}`, title: 'PM', clientId: goneCo });

    // Bulk tag both people with a new tag, then see it on the Contacts list.
    const made = await post('/api/contact-tags', { name: `${TAG} mixer` }, cookie);
    assert.equal(made.status < 300, true, made.text);
    const tagId = made.json.tag.id;
    assert.equal((await post('/api/contact-tags', { name: '  ' }, cookie)).status, 400);
    const linked = await post(`/api/contact-tags/${tagId}/links`, { contactIds: [p1, p2] }, cookie);
    assert.equal(linked.json.added, 2);
    const again = await post(`/api/contact-tags/${tagId}/links`, { contactIds: [p1] }, cookie);
    assert.equal(again.json.added, 0, 'tagging twice adds nothing');
    const list = await get('/crm/contacts', cookie);
    assert.match(list.text, new RegExp(`${TAG} mixer`));

    // The duplicate list loads.
    const dupes = await get('/api/crm/duplicates', cookie);
    assert.equal(dupes.status, 200);
    assert.ok(Array.isArray(dupes.json.companies) && Array.isArray(dupes.json.people));

    // Same company: people move, the other is archived, its name becomes an alias.
    const merged = await post('/api/crm/duplicates', { kind: 'client', keepId: keepCo, otherId: goneCo, answer: 'same' }, cookie);
    assert.equal(merged.status, 200, merged.text);
    assert.equal(merged.json.moved.people, 1);
    const gone = await prisma.client.findUnique({ where: { id: goneCo }, select: { archivedAt: true } });
    assert.ok(gone.archivedAt, 'merged company is archived');
    assert.ok(await prisma.clientAlias.findFirst({ where: { clientId: keepCo, aliasName: `${TAG} Merge Builders` } }));
    const twice = await post('/api/crm/duplicates', { kind: 'client', keepId: keepCo, otherId: goneCo, answer: 'same' }, cookie);
    assert.equal(twice.status, 409);
    assert.match(twice.json.error, /Nothing was changed/);

    // Same person: blanks filled, other email kept, tag not doubled, other archived.
    const pm = await post('/api/crm/duplicates', { kind: 'contact', keepId: p1, otherId: p2, answer: 'same' }, cookie);
    assert.equal(pm.status, 200, pm.text);
    const kept = await prisma.contact.findUnique({ where: { id: p1 }, include: { otherEmails: true, tagLinks: true } });
    assert.equal(kept.title, 'PM');
    assert.deepEqual(kept.otherEmails.map(e => e.email), [`other-${mail}`]);
    assert.equal(kept.tagLinks.length, 1);
    assert.ok((await prisma.contact.findUnique({ where: { id: p2 } })).archivedAt);

    // Different is remembered.
    const p3 = await person({ name: `${TAG} Sam`, clientId: keepCo });
    const diff = await post('/api/crm/duplicates', { kind: 'contact', keepId: p3, otherId: p1, answer: 'different' }, cookie);
    assert.equal(diff.status, 200);
    const [aId, bId] = p1 < p3 ? [p1, p3] : [p3, p1];
    const row = await prisma.crmMergeDecision.findUnique({ where: { kind_aId_bId: { kind: 'contact', aId, bId } } });
    assert.equal(row.decision, 'DIFFERENT');

    assert.equal((await post('/api/crm/duplicates', { kind: 'client', keepId: keepCo, otherId: keepCo, answer: 'same' }, cookie)).status, 400);
  } finally {
    const now = new Date();
    await prisma.contact.updateMany({ where: { id: { in: contacts } }, data: { archivedAt: now } }).catch(() => {});
    await prisma.client.updateMany({ where: { id: { in: clients } }, data: { archivedAt: now } }).catch(() => {});
    // Tags have no archive; the test tag would sit in everyone's picker.
    await prisma.contactTag.deleteMany({ where: { name: { startsWith: TAG } } }).catch(() => {});
    await prisma.$disconnect();
  }
});
