/**
 * Shared helper: get project budget rates for CO footer calculations.
 * Reads from projectData, same source as the budget module.
 */
import { prisma } from '@/lib/db';

export { resolveLineItems, chosenLineItems, ratesForCO, freezeRates, discountFor, calcGroupFooter, calcCOTotal, CO_OPTION_MONEY, CO_LINE_MONEY_SELECT } from './changeOrderTotals';

export async function getProjectRates(projectId, db = prisma) {
  const pd = await db.projectData.findUnique({ where: { projectId } });
  return {
    salesTaxPct:   pd?.salesTaxPct   ?? null,
    freightPct:    pd?.freightPct    ?? 0.06,
    warehousingPct: pd?.warehousingPct ?? 0.03,
    marginPct:     pd?.marginPct     ?? 0.23,
  };
}

/**
 * Sales tax for a new change order: the last one on this job, else the job's
 * rate. Once one change order takes a new tax rate the next ones follow it,
 * and the job's budget rate is left alone.
 */
export async function defaultCoTaxPct(projectId) {
  // A tax only CO prints no tax of its own, so the next CO takes the rate it moved to
  const last = await prisma.changeOrder.findFirst({
    where:   { projectId, salesTaxPct: { not: null } },
    orderBy: { coNumber: 'desc' },
    select:  { salesTaxPct: true, taxChangeNewPct: true },
  });
  if (last) return last.taxChangeNewPct ?? last.salesTaxPct;
  return (await getProjectRates(projectId)).salesTaxPct;
}

/**
 * Auto-generate the next coNumber for a project: CO-00001, CO-00002, ...
 */
export async function nextCoNumber(projectId) {
  const last = await prisma.changeOrder.findFirst({
    where: { projectId },
    orderBy: { coNumber: 'desc' },
    select: { coNumber: true },
  });
  const n = last ? parseInt(last.coNumber.replace('CO-', ''), 10) + 1 : 1;
  return `CO-${String(n).padStart(5, '0')}`;
}
