import { NextResponse } from 'next/server';
import { requireAuth, isClientViewer } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { canEditConferences } from '@/lib/conferences/server';
import { loadAnnualBudgets } from '@/lib/sales/annualBudgets';
import { expenseTopNumbers } from '@/lib/sales/expenses';

export const dynamic = 'force-dynamic';

// GET /api/sales/expenses/summary?userId=  The top numbers on the Expenses page.
export async function GET(request) {
  const { user, error } = await requireAuth();
  if (error) return error;
  if (isClientViewer(user.role)) return NextResponse.json({ error: 'Expense numbers are for ILC staff. Nothing changed. Ask your ILC contact if you need one.' }, { status: 403 });

  const userId = new URL(request.url).searchParams.get('userId');
  const year = new Date().getUTCFullYear();
  const rows = await prisma.salesExpense.findMany({
    where: { spentOn: { gte: new Date(Date.UTC(year - 1, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) }, ...(userId ? { userId } : {}) },
    select: { spentOn: true, amountCents: true, clientId: true, client: { select: { name: true } } },
  });
  const budgets = await loadAnnualBudgets('EXPENSES');

  return NextResponse.json({
    year,
    ...expenseTopNumbers(rows, year, new Date().toISOString().slice(0, 10)),
    lastYearTyped: budgets[year - 1]?.typedSpend ?? null,
    lastYearBudget: budgets[year - 1]?.budget ?? null,
    thisYearBudget: budgets[year]?.budget ?? null,
    canEdit: canEditConferences(user),
  });
}
