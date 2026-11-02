import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireStaff } from '@/lib/auth';
import { archiveData, readArchivedFlag, deleteRefused, ARCHIVED_FLAG_HELP } from '@/lib/archive';

export const runtime = 'nodejs';

// DELETE is refused: records archive, they do not delete.
export async function DELETE() {
  return NextResponse.json({ error: deleteRefused('Receipts') }, { status: 405 });
}

// POST { archived }  the Not an expense button. Only your own, only while waiting.
export async function POST(request, { params }) {
  const { user, error } = await requireStaff(request);
  if (error) return error;
  const row = await prisma.expenseReceipt.findFirst({
    where: { id: params.id, userId: user.id, archivedAt: undefined },
    select: { id: true, expenseId: true },
  });
  if (!row) return NextResponse.json({ error: 'That receipt is not on your list.' }, { status: 404 });
  if (row.expenseId) {
    return NextResponse.json({ error: 'This receipt is on a saved expense. Archive the expense instead.' }, { status: 409 });
  }
  const archived = await readArchivedFlag(request);
  if (archived === null) return NextResponse.json({ error: ARCHIVED_FLAG_HELP }, { status: 400 });
  const receipt = await prisma.expenseReceipt.update({
    where: { id: row.id },
    data: archiveData(archived, user),
  });
  return NextResponse.json({ receipt });
}
