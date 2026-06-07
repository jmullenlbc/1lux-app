import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';

// POST /api/projects/[id]/shipments/release-requests/[releaseId]
// Approve or decline a pending warehouse release request. ILC staff only.
export async function POST(req, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const { action, qtyReleased, notes } = await req.json();
  if (!['APPROVE', 'DECLINE'].includes(action)) {
    return NextResponse.json({ error: 'action must be APPROVE or DECLINE' }, { status: 400 });
  }

  const release = await prisma.warehouseRelease.findFirst({
    where:   { id: params.releaseId, lineItem: { shipment: { project_id: params.id } } },
    include: {
      lineItem: { include: { shipment: true } },
      requestedByPortalUser: { select: { id: true, name: true, email: true } },
    },
  });
  if (!release) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (release.status !== 'PENDING') {
    return NextResponse.json({ error: 'Release is not pending' }, { status: 400 });
  }

  const updated = await prisma.warehouseRelease.update({
    where: { id: params.releaseId },
    data: {
      status:      action === 'APPROVE' ? 'APPROVED' : 'DECLINED',
      approvedAt:  action === 'APPROVE' ? new Date() : null,
      approvedById: action === 'APPROVE' ? user.id : null,
      qtyReleased: action === 'APPROVE' ? (qtyReleased ?? release.qty) : null,
      notes:       notes || release.notes,
    },
    include: {
      requestedByPortalUser: { select: { id: true, name: true, email: true } },
      approvedBy:            { select: { id: true, name: true } },
    },
  });

  // TODO: send approval/decline email to contractor (Step 5)

  return NextResponse.json({ release: updated });
}
