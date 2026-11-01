// Keeps Project.approvedCoTotal right. One add up, so the Change Orders tab and every
// dashboard read the same number. An approved change order cannot be edited, so only
// approve, undo, the Job Loader and the old Change Order PDFs can move it.
import { prisma } from '@/lib/db';
import { getProjectRates, calcCOTotal } from '@/lib/changeOrderRates';
import { contractBalance } from '@/lib/contractBalance';

// The old PDFs uploaded before change orders were records.
export const legacyCoFilesWhere = projectId => ({
  projectId,
  tab: 'ca',
  tags: { contains: 'Change Order' },
  parsedAmount: { not: null },
});

export async function refreshContractRollup(projectId) {
  const [project, approved, rates, legacyFiles] = await Promise.all([
    prisma.project.findUnique({ where: { id: projectId }, select: { contractValue: true } }),
    prisma.changeOrder.findMany({
      where: { projectId, status: 'APPROVED' },
      include: { optionGroups: { include: { lineItems: true } } },
    }),
    getProjectRates(projectId),
    prisma.projectFile.findMany({ where: legacyCoFilesWhere(projectId), select: { parsedAmount: true } }),
  ]);
  const cos = approved.map(co => ({ status: co.status, totalValue: calcCOTotal(co, rates) }));
  const balance = contractBalance({ originalContract: project?.contractValue, cos, legacyFiles });
  await prisma.project.updateMany({ where: { id: projectId }, data: { approvedCoTotal: balance.approvedCoTotal } });
  return balance;
}

// A missed refresh never fails the action that caused it. Opening the job's Change
// Orders tab puts the number right.
export async function refreshContractRollupQuietly(projectId) {
  try {
    await refreshContractRollup(projectId);
  } catch (err) {
    console.error('[changeOrderRollup] could not refresh the contract total:', err?.message ?? err);
  }
}
