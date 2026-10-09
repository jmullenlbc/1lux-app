import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { archiveData, readArchivedFlag, deleteRefused, ARCHIVED_FLAG_HELP } from '@/lib/archive';
import { EXPENSE_INCLUDE, expenseDataFrom } from '../route';

// PATCH /api/sales/expenses/[id]  any of { userId, spentOn, amount, category, clientId, projectId, description }
export async function PATCH(request, { params }) {
  const { error } = await requireAuth();
  if (error) return error;

  const row = await prisma.salesExpense.findUnique({ where: { id: params.id }, select: { id: true, noteId: true } });
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (row.noteId) {
    return NextResponse.json({ error: 'This expense came from a sales note. Change the amount on the note and it follows.' }, { status: 409 });
  }

  const body = await request.json().catch(() => ({}));
  const { data, error: msg } = await expenseDataFrom(body, { partial: true });
  if (msg) return NextResponse.json({ error: msg }, { status: 400 });

  const updated = await prisma.salesExpense.update({ where: { id: params.id }, data, include: EXPENSE_INCLUDE });
  return NextResponse.json(updated);
}

// DELETE refused: expenses are archived, never deleted.
export async function DELETE() {
  return NextResponse.json({ error: deleteRefused('Expenses') }, { status: 405 });
}

// POST /api/sales/expenses/[id]  { archived: true | false }
export async function POST(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const row = await prisma.salesExpense.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const archived = await readArchivedFlag(request);
  if (archived === null) return NextResponse.json({ error: ARCHIVED_FLAG_HELP }, { status: 400 });

  const updated = await prisma.salesExpense.update({ where: { id: params.id }, data: archiveData(archived, user), include: EXPENSE_INCLUDE });
  return NextResponse.json(updated);
}
