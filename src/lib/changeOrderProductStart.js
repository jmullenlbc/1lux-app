// Where each product on a job starts before any change order, and its running record after them.
// Server only: it reads the database. The math lives in changeOrderProducts.js.

import { prisma } from '@/lib/db';
import { NOT_CO_VERSION } from '@/lib/budgetVersions';
import { getProjectRates } from '@/lib/changeOrderRates';
import { runningProducts } from '@/lib/changeOrderProducts';

/** The job's budget lines, the same source Push to Ship Schedule reads. */
export async function budgetStart(projectId) {
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { serviceType: true } });
  if (!project) return [];

  if (['fullDesign', 'designAssist'].includes(project.serviceType)) {
    const matrix = await prisma.designBidMatrix.findFirst({
      where: { projectId, ...NOT_CO_VERSION },
      orderBy: { version: 'desc' },
      include: { items: { where: { isArchived: false }, orderBy: [{ sortOrder: 'asc' }] } },
    });
    return (matrix?.items || []).map((it) => ({
      type: it.type, qty: it.qty ?? 0, unitPrice: it.cnPerUnit ?? null, unitCost: it.dnPerUnit ?? null,
      manufacturer: it.manufacturer ?? null, partNumber: it.partNumber ?? null, description: it.description ?? null,
    }));
  }

  const rows = await prisma.peerReviewItem.findMany({ where: { projectId }, orderBy: [{ section: 'asc' }, { sortOrder: 'asc' }] });
  return rows.map((it) => ({
    type: it.typeCode, qty: it.qty ?? 0, unitPrice: it.propUnitPrice ?? null, unitCost: it.propUnitDN ?? null,
    manufacturer: it.propManufacturer || it.specManufacturer || null, partNumber: it.propModel || it.specModel || null,
    description: it.description ?? null,
  }));
}

/** Each product's running record. Carries buy prices, so it never goes to a client. */
export async function coProducts(projectId) {
  const [start, cos, rates] = await Promise.all([
    budgetStart(projectId),
    prisma.changeOrder.findMany({
      where: { projectId },
      orderBy: { coNumber: 'asc' },
      include: { optionGroups: { orderBy: { sortOrder: 'asc' }, include: { lineItems: { orderBy: { sortOrder: 'asc' } } } } },
    }),
    getProjectRates(projectId),
  ]);
  return runningProducts(start, cos, { startTaxPct: rates.salesTaxPct });
}
