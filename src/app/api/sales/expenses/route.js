import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { parseAmountCents, normalizeCategory } from '@/lib/sales/expenses';

// Sales expenses (0129). Rows that ride on a note are written by the note
// editor (syncNoteExpense); this route lists everything and takes the
// standalone ones typed on Sales > Activity > Expenses.

export const EXPENSE_INCLUDE = {
  user:    { select: { id: true, name: true } },
  client:  { select: { id: true, name: true, clientNumber: true } },
  project: { select: { id: true, name: true, projectNumber: true } },
  note:    { select: { id: true, noteNumber: true, title: true, activityType: true } },
};

// GET /api/sales/expenses?userId=&clientId=&projectId=&from=YYYY-MM-DD&to=YYYY-MM-DD
export async function GET(request) {
  const { error } = await requireAuth();
  if (error) return error;

  const q = new URL(request.url).searchParams;
  const where = {};
  if (q.get('userId'))    where.userId    = q.get('userId');
  if (q.get('clientId'))  where.clientId  = q.get('clientId');
  if (q.get('projectId')) where.projectId = q.get('projectId');
  const from = q.get('from'), to = q.get('to');
  if (from || to) {
    where.spentOn = {};
    if (from) where.spentOn.gte = new Date(from);
    if (to)   where.spentOn.lte = new Date(to + 'T23:59:59.999Z');
  }

  const expenses = await prisma.salesExpense.findMany({
    where, include: EXPENSE_INCLUDE, orderBy: [{ spentOn: 'desc' }, { createdAt: 'desc' }],
  });
  return NextResponse.json({ expenses });
}

/** Shared by POST here and PATCH on [id]: the body, checked, as prisma data. */
export async function expenseDataFrom(body, { partial = false } = {}) {
  const data = {};
  const bad = msg => ({ error: msg });

  if (!partial || body.amount !== undefined || body.amountCents !== undefined) {
    const cents = body.amountCents !== undefined ? parseAmountCents(Number(body.amountCents) / 100) : parseAmountCents(body.amount);
    if (cents === undefined) return bad('Amount has to be a dollar figure, like 42.50.');
    if (cents === null)      return bad('Amount is required.');
    data.amountCents = cents;
  }
  if (!partial || body.spentOn !== undefined) {
    const d = body.spentOn ? new Date(body.spentOn) : null;
    if (!d || isNaN(d)) return bad('Date is required.');
    data.spentOn = d;
  }
  if (!partial || body.userId !== undefined) {
    if (!body.userId) return bad('Pick whose expense it is.');
    const u = await prisma.user.findUnique({ where: { id: body.userId }, select: { id: true, role: true } });
    if (!u || u.role === 'CLIENT_VIEWER') return bad('That person is not on staff.');
    data.userId = u.id;
  }
  if (body.category    !== undefined) data.category    = normalizeCategory(body.category);
  if (body.description !== undefined) data.description = String(body.description || '').trim();
  if (body.clientId    !== undefined) data.clientId    = body.clientId  || null;
  if (body.projectId   !== undefined) data.projectId   = body.projectId || null;
  return { data };
}

// POST /api/sales/expenses  { userId, spentOn, amount, category, clientId, projectId, description }
export async function POST(request) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const body = await request.json().catch(() => ({}));
  const { data, error: msg } = await expenseDataFrom({ userId: user.id, ...body });
  if (msg) return NextResponse.json({ error: msg }, { status: 400 });

  const row = await prisma.salesExpense.create({ data: { ...data, createdById: user.id }, include: EXPENSE_INCLUDE });
  return NextResponse.json(row, { status: 201 });
}
