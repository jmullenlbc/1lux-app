import { prisma } from '@/lib/db';

export const BUDGET_AREAS = ['EVENTS', 'MEMBERSHIPS', 'EXPENSES'];

const dollars = (c) => (c == null ? null : c / 100);

/** Typed yearly numbers for one area, as { [year]: { budget, typedSpend } } in dollars. */
export async function loadAnnualBudgets(area) {
  const rows = await prisma.salesAnnualBudget.findMany({ where: { area } });
  return Object.fromEntries(rows.map(r => [r.year, { budget: dollars(r.budgetCents), typedSpend: dollars(r.typedSpendCents) }]));
}
