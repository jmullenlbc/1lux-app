export const dynamic = 'force-dynamic';

import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { redirect } from 'next/navigation';
import CRMClient from './CRMClient';

export const metadata = { title: 'Pipeline — ILC Studios' };

export default async function CRMPage() {
  const { user, error } = await requireAuth();
  if (error) redirect('/login');

  // The pipeline renders PROJECTS directly — a project IS the pipeline entity
  // (Deal merged into Project). Board membership is derived from serviceType.
  let projects = [], users = [];
  try {
    [projects, users] = await Promise.all([
      prisma.project.findMany({
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true, projectNumber: true, name: true, city: true, state: true,
          buildingType: true, serviceType: true, projectType: true,
          contractValue: true, designContractValue: true,
          procurementStage: true, designStage: true,
          pipelineProbability: true, probabilityToWin: true, probabilityToMoveForward: true, procurementStatus: true, designStatus: true, expectedOrderDate: true,
          // Why a deal was lost or abandoned — shown on the card and the list row.
          procurementStatusReason: true, designStatusReason: true,
          updatedAt: true,
          salesOwner:  { select: { id: true, name: true } },
          client:      { select: { id: true, name: true } },
          projectData: { select: { numUnits: true } },
          _count: { select: { noteLinks: true } },
        },
      }),
      prisma.user.findMany({
        where:   { isActive: true },
        orderBy: { name: 'asc' },
        select:  { id: true, name: true, email: true },
      }),
    ]);
  } catch (err) {
    console.error('[/crm] DB query failed:', err?.message ?? err);
  }

  return <CRMClient initialProjects={projects} users={users} />;
}
