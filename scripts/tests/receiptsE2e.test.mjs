// Receipts (0163) against a running dev server, without spending an AI read:
// the bytes decide the type, the same file twice adds nothing, an expense
// exists only after OK, and OK twice saves once. Skips when the server is down.
// Run: node --test scripts/tests/receiptsE2e.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { BASE, login, get, post, serverUp } from './_auth.mjs';
import { ensureE2eAdmin } from './_e2eAdmin.mjs';

async function upload(cookie, name, bytes, type) {
  const form = new FormData();
  form.append('file', new Blob([bytes], { type }), name);
  form.append('fileName', name);
  const res = await fetch(`${BASE}/api/sales/expenses/receipts`, { method: 'POST', headers: { cookie }, body: form });
  return { status: res.status, json: await res.json().catch(() => null) };
}

test('a receipt waits for OK, then makes one expense', async (t) => {
  if (!(await serverUp())) { t.skip(`dev server not reachable at ${BASE}`); return; }
  const prisma = new PrismaClient();
  const { email, password } = await ensureE2eAdmin(prisma);
  const { cookie } = await login(email, password);
  const stamp = new Date();
  const ids = { receipts: [], expenses: [] };

  try {
    const fake = await upload(cookie, 'a.pdf', '<html>not a receipt</html>', 'application/pdf');
    assert.equal(fake.status, 400);

    const bytes = `%PDF-1.7 receipts e2e ${stamp.getTime()}`;
    const first = await upload(cookie, 'a.pdf', bytes, 'application/pdf');
    assert.equal(first.status, 201);
    const id = first.json.receipt.id;
    ids.receipts.push(id);
    const again = await upload(cookie, 'a.pdf', bytes, 'application/pdf');
    assert.equal(again.json.duplicate, true);
    assert.equal(again.json.receipt.id, id);

    const waiting = await get('/api/sales/expenses/receipts', cookie);
    assert.ok(waiting.json.receipts.some(r => r.id === id));
    assert.equal(await prisma.salesExpense.count({ where: { receipts: { some: { id } } } }), 0);

    const body = { spentOn: '2026-10-30', amount: '24.00', category: 'TRAVEL', vendor: 'Garage' };
    const ok = await post(`/api/sales/expenses/receipts/${id}/confirm`, body, cookie);
    assert.equal(ok.status, 201, ok.text);
    assert.equal(ok.json.expense.amountCents, 2400);
    assert.equal(ok.json.expense.vendor, 'Garage');
    ids.expenses.push(ok.json.expense.id);
    const twice = await post(`/api/sales/expenses/receipts/${id}/confirm`, body, cookie);
    assert.equal(twice.json.already, true);
    assert.equal(twice.json.expense.id, ok.json.expense.id);

    const left = await get('/api/sales/expenses/receipts', cookie);
    assert.ok(!left.json.receipts.some(r => r.id === id));
    const archive = await post(`/api/sales/expenses/receipts/${id}`, { archived: true }, cookie);
    assert.equal(archive.status, 409);
    const del = await fetch(`${BASE}/api/sales/expenses/receipts/${id}`, { method: 'DELETE', headers: { cookie } });
    assert.equal(del.status, 405);
  } finally {
    await prisma.salesExpense.updateMany({ where: { id: { in: ids.expenses } }, data: { archivedAt: stamp } });
    await prisma.expenseReceipt.updateMany({ where: { id: { in: ids.receipts } }, data: { archivedAt: stamp } });
    await prisma.$disconnect();
  }
});
