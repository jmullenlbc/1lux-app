import { NextResponse } from 'next/server';
import { requireAuth, canSeeAllData } from '@/lib/auth';
import { prisma } from '@/lib/db';

async function canAccess(projectId, user) {
  const p = await prisma.project.findUnique({ where: { id: projectId } });
  if (!p) return false;
  return canSeeAllData(user) || p.createdById === user.id;
}

/**
 * PATCH /api/projects/[id]/contacts/[contactId]
 * Update permissions, name, role on a contact.
 */
export async function PATCH(req, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  if (!await canAccess(params.id, user)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await req.json();
  const {
    name, role,
    canViewShipSchedule,
    canViewSubmittals,
    canViewMeetings,
    canViewContracts,
    canViewConstructionSched,
    canViewChangeOrders,
    canViewBudgets,
  } = body;

  const contact = await prisma.projectExternalContact.update({
    where: { id: params.contactId },
    data: {
      ...(name                    !== undefined && { name }),
      ...(role                    !== undefined && { role }),
      ...(canViewShipSchedule      !== undefined && { canViewShipSchedule:      Boolean(canViewShipSchedule) }),
      ...(canViewSubmittals        !== undefined && { canViewSubmittals:        Boolean(canViewSubmittals) }),
      ...(canViewMeetings          !== undefined && { canViewMeetings:          Boolean(canViewMeetings) }),
      ...(canViewContracts         !== undefined && { canViewContracts:         Boolean(canViewContracts) }),
      ...(canViewConstructionSched !== undefined && { canViewConstructionSched: Boolean(canViewConstructionSched) }),
      ...(canViewChangeOrders      !== undefined && { canViewChangeOrders:      Boolean(canViewChangeOrders) }),
      ...(canViewBudgets           !== undefined && { canViewBudgets:           Boolean(canViewBudgets) }),
    },
  });

  return NextResponse.json({ contact });
}

/**
 * DELETE /api/projects/[id]/contacts/[contactId]
 * Remove a contact from the project.
 */
export async function DELETE(req, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  if (!await canAccess(params.id, user)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await prisma.projectExternalContact.delete({ where: { id: params.contactId } });

  return NextResponse.json({ success: true });
}
