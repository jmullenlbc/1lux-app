// Sales Reps and RFQs (0144) against a running dev server: the RFQs tab groups
// matrix lines by rep, Send makes RFQ numbers and marks lines Sent, typed DN
// prices save, a rep quote auto prices good matches and asks about the rest,
// a pick and a "Not ours" settle open lines, the PDF builds, and the rep,
// office and manufacturer pages open. Only this test's own rows are touched
// and deleted afterwards. Skips when the server is down.
// Run: node --test scripts/tests/rfqE2e.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { BASE, get, login, post, serverUp } from './_auth.mjs';
import { ensureE2eAdmin } from './_e2eAdmin.mjs';
import { needByFrom } from '../../src/lib/rfq/format.js';

const TAG = `CLAUDE E2E RFQ ${Date.now()}`;

async function patch(path, body, cookie) {
  const res = await fetch(`${BASE}${path}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify(body), redirect: 'manual' });
  const text = await res.text().catch(() => '');
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, text, json };
}

test('RFQ send, price, quote match and pages', async (t) => {
  if (!(await serverUp())) { t.skip('dev server not running'); return; }
  const prisma = new PrismaClient();
  const made = { project: null, reps: [], mfrs: [] };
  try {
    const { email, password } = await ensureE2eAdmin(prisma);
    const { cookie } = await login(email, password);
    const admin = await prisma.user.findUnique({ where: { email } });

    const top = (await prisma.manufacturer.aggregate({ _max: { numericId: true } }))._max.numericId || 0;
    const m1 = await prisma.manufacturer.create({ data: { name: `${TAG} Maker One`, numericId: top + 1 } });
    const m2 = await prisma.manufacturer.create({ data: { name: `${TAG} Maker Two`, numericId: top + 2 } });
    made.mfrs.push(m1.id, m2.id);
    const rep = await prisma.salesRep.create({ data: { name: `${TAG} Rep`, emails: { create: [{ purpose: 'QUOTES', email: 'quotes@example.test' }] } } });
    const bare = await prisma.salesRep.create({ data: { name: `${TAG} No Email Rep` } });
    made.reps.push(rep.id, bare.id);
    await prisma.manufacturerRep.createMany({ data: [
      { manufacturerId: m1.id, salesRepId: rep.id, isDefault: true },
      { manufacturerId: m2.id, salesRepId: bare.id, isDefault: true },
    ] });

    const project = await prisma.project.create({ data: { name: `${TAG} Job`, createdBy: { connect: { id: admin.id } } } });
    made.project = project.id;
    await prisma.peerReviewItem.createMany({ data: [
      { projectId: project.id, typeCode: 'A1', description: 'Downlight', propManufacturer: m1.name, propModel: 'DL-6-35K', qty: 40, sortOrder: 0 },
      { projectId: project.id, typeCode: 'B1', description: 'Wall pack', propManufacturer: m1.name, propModel: 'WP-20', qty: 12, sortOrder: 1 },
      { projectId: project.id, typeCode: 'C1', description: 'Strip', propManufacturer: m2.name, propModel: 'ST-4', qty: 6, sortOrder: 2 },
      { projectId: project.id, typeCode: 'D1', description: 'Nothing picked', sortOrder: 3 },
    ] });
    const base = `/api/projects/${project.id}/rfqs`;

    // The tab: one group per rep, the rep with no quote email cannot send.
    const s0 = await get(base, cookie);
    assert.equal(s0.status, 200, s0.text);
    const g1 = s0.json.groups.find((g) => g.lines.some((l) => l.typeCode === 'A1'));
    const g2 = s0.json.groups.find((g) => g.lines.some((l) => l.typeCode === 'C1'));
    assert.equal(g1.lines.length, 2);
    assert.equal(g1.problems.length, 0, g1.problems.join(' '));
    assert.ok(g2.problems.length > 0, 'no quote email is a problem');
    const lineOf = (s, code) => s.lines.find((l) => l.typeCode === code);
    assert.equal(lineOf(s0.json, 'A1').status, 'Draft');
    assert.equal(lineOf(s0.json, 'D1').status, '');

    const blocked = await post(base, { action: 'send', groupKey: g2.key }, cookie);
    assert.equal(blocked.status, 400);
    assert.match(blocked.json.error, /Nothing was sent/);

    // Send: a number, 3 business days, the lines move to Sent.
    const sent = await post(base, { action: 'send', groupKey: g1.key, notes: 'Test notes' }, cookie);
    assert.equal(sent.status, 201, sent.text);
    const rfq = sent.json.rfq;
    assert.ok(Number.isInteger(rfq.number) && rfq.number >= 1);
    assert.ok(Math.abs(new Date(rfq.needBy) - needByFrom(rfq.createdAt)) < 5000, '3 business days');
    assert.match(sent.json.email.subject, /RFQ\d{4}/);
    assert.equal(sent.json.email.to, 'quotes@example.test');
    assert.equal(lineOf(sent.json.state, 'A1').status, 'Sent');
    assert.equal(lineOf(sent.json.state, 'C1').status, 'Draft');
    const again = sent.json.state.groups.find((g) => g.key === g1.key);
    assert.ok(!again || again.lines.every((l) => l.status === 'Sent'));

    // Open it and type one price.
    const one = await get(`${base}/${rfq.id}`, cookie);
    assert.equal(one.status, 200, one.text);
    const [la, lb] = one.json.rfq.lines;
    const typed = await patch(`${base}/${rfq.id}`, { prices: [{ lineId: lb.id, dnPrice: '55.5' }] }, cookie);
    assert.equal(typed.status, 200, typed.text);
    assert.equal(typed.json.rfq.lines.find((l) => l.id === lb.id).dnPrice, 55.5);

    // A quote: A1 matches well and is priced; X9 asks; Z1 is not ours.
    const q = await post(`${base}/quotes`, {
      rfqId: rfq.id, fileName: 'rep quote.pdf', quoteNumber: 'Q-1',
      lines: [
        { typeTag: 'A1', mfr: m1.name, catalog: 'DL-6-35K', qty: 40, unitPrice: 88 },
        { typeTag: 'X9', mfr: '', catalog: 'WP-20', qty: 12, unitPrice: 61 },
        { typeTag: 'Z1', mfr: 'Someone', catalog: 'ZZ', qty: 1, unitPrice: 5 },
      ],
    }, cookie);
    assert.equal(q.status, 201, q.text);
    const qa = q.json.quote.lines.find((l) => l.typeTag === 'A1');
    const qx = q.json.quote.lines.find((l) => l.typeTag === 'X9');
    const qz = q.json.quote.lines.find((l) => l.typeTag === 'Z1');
    assert.equal(qa.status, 'AUTO');
    assert.equal(qa.rfqLineId, la.id);
    assert.equal(qx.status, 'OPEN');
    assert.equal(q.json.options[qx.id][0].rfqLineId, lb.id, 'best guess offered first');

    const picked = await patch(`${base}/quotes`, { quoteLineId: qx.id, rfqLineId: lb.id }, cookie);
    assert.equal(picked.status, 200, picked.text);
    const skipped = await patch(`${base}/quotes`, { quoteLineId: qz.id, skip: true }, cookie);
    assert.equal(skipped.status, 200, skipped.text);
    assert.equal(skipped.json.quote.lines.filter((l) => l.status === 'OPEN').length, 0);

    const after = await prisma.rfqLine.findMany({ where: { rfqId: rfq.id } });
    assert.equal(after.find((l) => l.id === la.id).dnPrice, 88);
    assert.equal(after.find((l) => l.id === la.id).priceSource, 'AUTO');
    assert.equal(after.find((l) => l.id === lb.id).dnPrice, 61);
    assert.equal(after.find((l) => l.id === lb.id).priceSource, 'PICKED');
    const s1 = await get(base, cookie);
    assert.equal(lineOf(s1.json, 'A1').status, 'Received');

    // The PDF and the history.
    const pdf = await fetch(`${BASE}${base}/${rfq.id}/pdf`, { headers: { cookie } });
    assert.equal(pdf.status, 200);
    assert.match(pdf.headers.get('content-type') || '', /pdf/);
    const hist = await prisma.recordHistory.count({ where: { entityType: 'RFQ', entityId: rfq.id } }).catch(() => null);
    if (hist != null) assert.ok(hist >= 1, 'RFQ has history rows');

    // The pages open for staff.
    for (const path of [`/sales-reps/${rep.id}`, '/sales-reps', '/admin/offices', '/admin/sales-reps-import', `/manufacturers/${m1.id}`, `/project/${project.id}?tab=rfqs`, `/project/${project.id}/wizard`, '/pre-con', '/pre-con?tab=rfqs']) {
      const page = await get(path, cookie);
      assert.equal(page.status, 200, `${path} gave ${page.status}`);
    }
  } finally {
    if (made.project) {
      const rfqs = await prisma.rfq.findMany({ where: { projectId: made.project }, select: { id: true } });
      await prisma.recordHistory?.deleteMany({ where: { entityId: { in: rfqs.map((r) => r.id) } } }).catch(() => {});
      await prisma.project.delete({ where: { id: made.project } }).catch(() => {});
    }
    await prisma.salesRep.deleteMany({ where: { id: { in: made.reps } } }).catch(() => {});
    await prisma.manufacturer.deleteMany({ where: { id: { in: made.mfrs } } }).catch(() => {});
    await prisma.$disconnect();
  }
});
