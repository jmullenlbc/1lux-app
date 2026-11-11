export const dynamic = 'force-dynamic';

import { requireAuth, actsAsAdmin } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { DEPARTMENTS_SELECT, hasDepartment, SALES_MARKETING } from '@/lib/departments';
import { redirect } from 'next/navigation';
import { SPACES_SELECT, spaceKeys } from '@/lib/companySpaces';
import CRMClient from './CRMClient';

export const metadata = { title: 'Pipeline: 1LUX' };

export default async function CRMPage() {
  const { user, error } = await requireAuth();
  if (error) redirect('/login');

  // The pipeline renders PROJECTS directly, a project IS the pipeline entity
  // (Deal merged into Project). Board membership is derived from serviceType.
  let projects = [], users = [];
  try {
    [projects, users] = await Promise.all([
      prisma.project.findMany({
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true, projectNumber: true, name: true, city: true, state: true,
          buildingType: true, serviceType: true, projectType: true, businessUnitId: true,
          contractValue: true, approvedCoTotal: true, designContractValue: true,
          procurementStage: true, designStage: true,
          pipelineProbability: true, probabilityToWin: true, probabilityToMoveForward: true, procurementStatus: true, designStatus: true, expectedOrderDate: true,
          expectedContractExecutionDate: true, projectSubtype: true,
          // Lead person (Maram 9-17), shown in the pipeline popup.
          contactLinks: { where: { isLead: true }, select: { contact: { select: { id: true, name: true, firstName: true, lastName: true } } } },
          // Why a deal was lost or abandoned, shown on the card and the list row.
          procurementStatusReason: true, designStatusReason: true,
          updatedAt: true,
          salesOwner:  { select: { id: true, name: true } },
          client:      { select: { id: true, name: true } },
          projectData: { select: { numUnits: true } },
          _count: { select: { noteLinks: { where: { note: { archivedAt: null } } } } },
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

  // Web budget requests nobody has dealt with yet, shown as their own coloured
  // cards so Sales can see what just came in (Mike, 2026-09-12). Only for the
  // people who can open the review queue, anyone else would click into a
  // page that turns them away.
  let newRequests = [];
  try {
    const me = actsAsAdmin(user)
      ? null
      : await prisma.user.findUnique({ where: { id: user.id }, select: { departments: DEPARTMENTS_SELECT } });
    if (actsAsAdmin(user) || hasDepartment(me, SALES_MARKETING)) {
      newRequests = await prisma.conceptualSubmission.findMany({
        where:   { status: 'PENDING', duplicateMatchId: null },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, proposedName: true, city: true, state: true, submitterName: true,
          createdAt: true, suggestionDismissedAt: true,
          suggestedProject: { select: { id: true, name: true } },
        },
      });
    }
  } catch (err) {
    console.error('[/crm] web request query failed (non-fatal):', err?.message ?? err);
  }

  // The companies this person sells for come first in the Company filter (0165).
  let mySpaces = [];
  try {
    mySpaces = spaceKeys(await prisma.user.findUnique({ where: { id: user.id }, select: { businessUnits: SPACES_SELECT } }));
  } catch (err) {
    console.error('[/crm] company spaces query failed (non-fatal):', err?.message ?? err);
  }

  return <CRMClient initialProjects={projects} users={users} newRequests={newRequests} mySpaces={mySpaces} />;
}
