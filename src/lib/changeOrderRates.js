/**
 * Shared helper: get project budget rates for CO footer calculations.
 * Reads from projectData, same source as the budget module.
 */
import { prisma } from '@/lib/db';

export { resolveLineItems, discountFor, calcGroupFooter, calcCOTotal } from './changeOrderTotals';

export async function getProjectRates(projectId) {
  const pd = await prisma.projectData.findUnique({ where: { projectId } });
  return {
    salesTaxPct:   pd?.salesTaxPct   ?? null,
    freightPct:    pd?.freightPct    ?? 0.06,
    warehousingPct: pd?.warehousingPct ?? 0.03,
    marginPct:     pd?.marginPct     ?? 0.23,
  };
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
