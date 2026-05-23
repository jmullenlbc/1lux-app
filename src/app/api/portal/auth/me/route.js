import { NextResponse } from 'next/server';
import { requirePortalAuth } from '@/lib/portalAuth';
import { prisma } from '@/lib/db';

/**
 * GET /api/portal/auth/me
 * Returns current portal user + their project access list.
 */
export async function GET() {
  const { portalUser, error } = await requirePortalAuth();
  if (error) return error;

  const contacts = await prisma.projectExternalContact.findMany({
    where:   { portalUserId: portalUser.portalUserId, acceptedAt: { not: null } },
    include: { project: { select: { id: true, name: true, status: true } } },
    orderBy: { project: { name: 'asc' } },
  });

  return NextResponse.json({
    user:     { email: portalUser.email, name: portalUser.name },
    projects: contacts.map(c => ({
      projectId:   c.project_id,
      projectName: c.project.name,
      role:        c.role,
      permissions: {
        canViewShipSchedule:      c.canViewShipSchedule,
        canViewSubmittals:        c.canViewSubmittals,
        canViewMeetings:          c.canViewMeetings,
        canViewContracts:         c.canViewContracts,
        canViewConstructionSched: c.canViewConstructionSched,
        canViewChangeOrders:      c.canViewChangeOrders,
        canViewBudgets:           c.canViewBudgets,
      },
    })),
  });
}
