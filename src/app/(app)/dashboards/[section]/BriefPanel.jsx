import { prisma } from '@/lib/db';
import BriefClient from '@/app/(app)/crm/brief/BriefClient';

/**
 * The written pipeline brief, as a tab on the Sales dashboard (Mike 10-6).
 * Maram 9-17 had it as a button beside + Widget; before that it sat on the
 * CRM boards. BriefClient.jsx stays in crm/brief and is rendered from here.
 */
export default async function BriefPanel() {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  let stale = [], procSnapshot = [], designSnapshot = [], recentWins = [];
  try {
    [stale, procSnapshot, designSnapshot, recentWins] = await Promise.all([
      // Section 1: Stale open projects (top 10)
      prisma.project.findMany({
        where: {
          OR: [{ procurementStatus: 'OPEN' }, { designStatus: 'OPEN' }],
          updatedAt: { lt: thirtyDaysAgo },
        },
        orderBy: { updatedAt: 'asc' },
        take: 10,
        select: {
          id: true, projectNumber: true, name: true, updatedAt: true,
          procurementStage: true, designStage: true,
          procurementStatus: true, designStatus: true,
          client: { select: { name: true } },
        },
      }),
      // Section 2: Procurement pipeline snapshot
      prisma.project.groupBy({
        by: ['procurementStage'],
        where: { procurementStatus: 'OPEN' },
        _count: { id: true },
      }),
      // Section 2: Design pipeline snapshot
      prisma.project.groupBy({
        by: ['designStage'],
        where: { designStatus: 'OPEN' },
        _count: { id: true },
      }),
      // Section 3: Won last 30 days
      prisma.project.findMany({
        where: {
          OR: [{ procurementStatus: 'WON' }, { designStatus: 'WON' }],
          updatedAt: { gte: thirtyDaysAgo },
        },
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true, projectNumber: true, name: true, updatedAt: true,
          procurementStatus: true, designStatus: true,
          client: { select: { name: true } },
        },
      }),
    ]);
  } catch (err) {
    console.error('[dashboard brief] DB query failed:', err?.message ?? err);
  }

  return (
    <BriefClient
      embedded
      stale={stale}
      procSnapshot={procSnapshot}
      designSnapshot={designSnapshot}
      recentWins={recentWins}
    />
  );
}
