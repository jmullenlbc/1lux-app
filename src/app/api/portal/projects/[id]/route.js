import { NextResponse } from 'next/server';
import { requirePortalAuth } from '@/lib/portalAuth';
import { prisma } from '@/lib/db';

async function getContact(projectId, portalUserId) {
  return prisma.projectExternalContact.findFirst({
    where: { project_id: projectId, portalUserId, acceptedAt: { not: null } },
  });
}

/**
 * GET /api/portal/projects/[id]
 * Returns project info + this user's permissions for the project.
 */
export async function GET(req, { params }) {
  const { portalUser, error } = await requirePortalAuth();
  if (error) return error;

  const contact = await getContact(params.id, portalUser.portalUserId);
  if (!contact) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const project = await prisma.project.findUnique({
    where:  { id: params.id },
    select: {
      id: true, name: true, status: true, phase: true,
      address: true, city: true, state: true,
      constructionStartDate: true, constructionEndDate: true, mepRoughInDate: true,
    },
  });
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({
    project,
    permissions: {
      canViewShipSchedule:      contact.canViewShipSchedule,
      canViewSubmittals:        contact.canViewSubmittals,
      canViewMeetings:          contact.canViewMeetings,
      canViewContracts:         contact.canViewContracts,
      canViewConstructionSched: contact.canViewConstructionSched,
      canViewChangeOrders:      contact.canViewChangeOrders,
      canViewBudgets:           contact.canViewBudgets,
      canApproveChangeOrders:   contact.canApproveChangeOrders,
    },
  });
}
