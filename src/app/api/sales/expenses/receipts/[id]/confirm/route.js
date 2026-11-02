import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireStaff } from '@/lib/auth';
import { EXPENSE_INCLUDE, expenseDataFrom } from '../../../route';

export const runtime = 'nodejs';

const CLAIMED = 'RECEIPT_ALREADY_CLAIMED';

// POST expense fields plus vendor. This is the one place a guess becomes money:
// a person pressed OK on these numbers. A double tap lands on the same expense.
export async function POST(request, { params }) {
  const { user, error } = await requireStaff(request);
  if (error) return error;

  const row = await prisma.expenseReceipt.findFirst({
    where: { id: params.id, userId: user.id, archivedAt: null },
    select: { id: true, expenseId: true },
  });
  if (!row) return NextResponse.json({ error: 'That receipt is not on your list any more. Nothing was saved.' }, { status: 404 });

  const already = async (expenseId) => NextResponse.json({
    expense: await prisma.salesExpense.findUnique({ where: { id: expenseId }, include: EXPENSE_INCLUDE }),
    already: true,
  });
  if (row.expenseId) return already(row.expenseId);

  const body = await request.json().catch(() => ({}));
  const { data, error: bad } = await expenseDataFrom({ userId: user.id, ...body });
  if (bad) return NextResponse.json({ error: bad }, { status: 400 });

  try {
    const expense = await prisma.$transaction(async (tx) => {
      const made = await tx.salesExpense.create({ data: { ...data, createdById: user.id } });
      const claim = await tx.expenseReceipt.updateMany({
        where: { id: row.id, expenseId: null },
        data: { expenseId: made.id },
      });
      if (claim.count !== 1) throw new Error(CLAIMED);
      return tx.salesExpense.findUnique({ where: { id: made.id }, include: EXPENSE_INCLUDE });
    });
    return NextResponse.json({ expense }, { status: 201 });
  } catch (e) {
    if (e?.message !== CLAIMED) throw e;
    const now = await prisma.expenseReceipt.findUnique({ where: { id: row.id }, select: { expenseId: true } });
    return already(now.expenseId);
  }
}
