// Sales expenses (0129) against a running dev server: a note's "Amount spent"
// becomes an expense row, standalone expenses round-trip, archive only, and
// the cost-to-first-project report sees them. Skips when the server is down.
// Run: node --test scripts/tests/salesExpensesE2e.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { BASE, login, get, post, serverUp } from './_auth.mjs';

async function patch(path, body, cookie) {
  const res = await fetch(`${BASE}${path}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify(body) });
  const text = await res.text().catch(() => '');
  let json = null; try { json = JSON.parse(text); } catch {}
  return { status: res.status, text, json };
}

test('note amount -> expense row -> report, standalone expense, archive only', async (t) => {
  if (!(await serverUp())) { t.skip(`dev server not reachable at ${BASE}`); return; }
  const { cookie, user } = await login('admin@ilcstudios.com', 'ILCadmin2024!');
  const stamp = Date.now();
  const made = await post('/api/clients', { name: `CLAUDE E2E - expense test ${stamp}` }, cookie);
  assert.ok(made.status < 300, made.text);
  const clientId = made.json?.client?.id ?? made.json?.id;
  const ids = { notes: [], expenses: [] };

  try {
    // A note with an amount creates one expense row.
    const note = await post('/api/crm/notes', {
      title: `E2E lunch ${stamp}`, activityType: 'LUNCH', meetingDate: '2026-09-15', clientIds: [clientId], amountSpent: '$42.50',
    }, cookie);
    assert.equal(note.status, 201, note.text);
    ids.notes.push(note.json.id);
    assert.equal(note.json.expense?.amountCents, 4250);
    assert.equal(note.json.expense?.category, 'MEAL');

    // Bad amounts are refused.
    const bad = await post('/api/crm/notes', { title: 'bad', amountSpent: 'lots' }, cookie);
    assert.equal(bad.status, 400);

    // Changing the amount updates the same row; clearing it archives it.
    const up = await patch(`/api/crm/notes/${note.json.id}`, { amountSpent: '60', publish: true }, cookie);
    assert.equal(up.status, 200, up.text);
    assert.equal(up.json.expense?.amountCents, 6000);
    let list = await get(`/api/sales/expenses?clientId=${clientId}`, cookie);
    assert.equal(list.status, 200, list.text);
    assert.equal(list.json.expenses.length, 1);
    assert.equal(list.json.expenses[0].note?.id, note.json.id);
    const noteExpenseId = list.json.expenses[0].id;

    // Note-borne rows cannot be edited on the expense route.
    const locked = await patch(`/api/sales/expenses/${noteExpenseId}`, { amount: '1' }, cookie);
    assert.ok(locked.status >= 400 && locked.status < 500, `expected a refusal, got ${locked.status}`);

    // A standalone expense.
    const exp = await post('/api/sales/expenses', {
      userId: user?.id, spentOn: '2026-09-20', amount: '125', category: 'GOLF', clientId, description: 'E2E round',
    }, cookie);
    assert.equal(exp.status, 201, exp.text);
    ids.expenses.push(exp.json.id);
    assert.equal(exp.json.amountCents, 12500);
    const edited = await patch(`/api/sales/expenses/${exp.json.id}`, { amount: '130.25', description: 'E2E round, edited' }, cookie);
    assert.equal(edited.status, 200, edited.text);
    assert.equal(edited.json.amountCents, 13025);

    // Delete is refused; archive hides it.
    const del = await fetch(`${BASE}/api/sales/expenses/${exp.json.id}`, { method: 'DELETE', headers: { cookie } });
    assert.equal(del.status, 405);

    // The cost-to-first-project row for this company sees both rows (open, no win).
    const cost = await get(`/api/clients/${clientId}/first-project-cost`, cookie);
    assert.equal(cost.status, 200, cost.text);
    assert.equal(cost.json.won, false);
    assert.equal(cost.json.meetings, 1);
    assert.equal(cost.json.inPerson, 1);
    assert.equal(cost.json.spentCents, 6000 + 13025);
    const report = await get('/api/sales/first-project-cost', cookie);
    assert.equal(report.status, 200, report.text);
    assert.ok(report.json.rows.some(r => r.clientId === clientId));
    assert.ok(report.json.summary.openClients >= 1);

    const arch = await post(`/api/sales/expenses/${exp.json.id}`, { archived: true }, cookie);
    assert.equal(arch.status, 200, arch.text);
    list = await get(`/api/sales/expenses?clientId=${clientId}`, cookie);
    assert.equal(list.json.expenses.length, 1, 'archived expense drops off the list');

    // Clearing the note's amount archives its row too.
    const cleared = await patch(`/api/crm/notes/${note.json.id}`, { amountSpent: '' }, cookie);
    assert.equal(cleared.status, 200, cleared.text);
    list = await get(`/api/sales/expenses?clientId=${clientId}`, cookie);
    assert.equal(list.json.expenses.length, 0);

    // The pages render.
    for (const p of ['/sales/activity', '/sales/activity/expenses', `/clients/${clientId}`]) {
      assert.equal((await get(p, cookie)).status, 200, p);
    }
  } finally {
    const prisma = new PrismaClient();
    try {
      await prisma.salesExpense.deleteMany({ where: { OR: [{ clientId }, { noteId: { in: ids.notes } }] } });
      await prisma.note.deleteMany({ where: { id: { in: ids.notes } } });
      await prisma.client.deleteMany({ where: { id: clientId } });
    } finally { await prisma.$disconnect(); }
  }
});
