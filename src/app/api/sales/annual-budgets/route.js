import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { cents } from '@/lib/money';
import { canEditConferences } from '@/lib/conferences/server';
import { BUDGET_AREAS } from '@/lib/sales/annualBudgets';

export const dynamic = 'force-dynamic';

const MAX_DOLLARS = 21000000;
const bad = (error) => NextResponse.json({ error }, { status: 400 });

// Blank clears it. 0 is a real number.
function amount(v, what) {
  if (v === '' || v === null) return { cents: null };
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return { error: `${what} has to be a dollar figure, like 150000.` };
  if (n > MAX_DOLLARS) return { error: `${what} is too large to save. The most it can hold is $21,000,000.` };
  return { cents: Math.round(cents(n) * 100) };
}

// PATCH /api/sales/annual-budgets  { area, year, budget?, typedSpend? }
export async function PATCH(request) {
  const { user, error } = await requireAuth();
  if (error) return error;
  if (!canEditConferences(user)) return NextResponse.json({ error: 'Only a Sales Admin can change a yearly budget.' }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const year = Number(body.year);
  if (!BUDGET_AREAS.includes(body.area)) return bad('That budget area is not one we keep.');
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return bad('That year does not look right.');

  const data = { updatedById: user.id };
  if (body.budget !== undefined) {
    const m = amount(body.budget, 'Budget');
    if (m.error) return bad(m.error);
    data.budgetCents = m.cents;
  }
  if (body.typedSpend !== undefined) {
    const m = amount(body.typedSpend, 'Spend');
    if (m.error) return bad(m.error);
    data.typedSpendCents = m.cents;
  }

  await prisma.salesAnnualBudget.upsert({
    where: { area_year: { area: body.area, year } },
    create: { area: body.area, year, ...data },
    update: data,
  });
  return NextResponse.json({ ok: true });
}
