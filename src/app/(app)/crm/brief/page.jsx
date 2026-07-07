export const dynamic = 'force-dynamic';

import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { redirect } from 'next/navigation';
import BriefClient from './BriefClient';

export const metadata = { title: 'Morning Brief — ILC Studios' };

export default async function BriefPage() {
  const { user, error } = await requireAuth();
  if (error) redirect('/login');

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
    console.error('[/crm/brief] DB query failed:', err?.message ?? err);
  }

  return (
    <BriefClient
      stale={stale}
      procSnapshot={procSnapshot}
      designSnapshot={designSnapshot}
      recentWins={recentWins}
    />
  );
}
