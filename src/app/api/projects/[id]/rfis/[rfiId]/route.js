import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';

const RFI_INCLUDE = {
  assignedTo:  { select: { id: true, name: true } },
  activities: {
    orderBy:  { sentAt: 'asc' },
    include: {
      attachments: { select: { id: true, fileName: true, fileUrl: true, attachmentType: true, drawingId: true } },
    },
  },
  impactItems: { orderBy: { itemNumber: 'asc' } },
  changeOrder: { select: { id: true, coNumber: true, status: true } },
};

// GET /api/projects/[id]/rfis/[rfiId]
export async function GET(req, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const rfi = await prisma.rFI.findFirst({
    where:   { id: params.rfiId, projectId: params.id },
    include: RFI_INCLUDE,
  });
  if (!rfi) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({ rfi });
}

// PATCH /api/projects/[id]/rfis/[rfiId]
// Update status, assignedTo, shipFlagAcknowledged, etc.
export async function PATCH(req, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const body = await req.json();
  const allowed = ['status', 'assignedToId', 'shipFlagAcknowledged', 'dateDue',
                   'draftStatus', 'draftText', 'draftConfidence', 'draftGeneratedAt',
                   'draftReviewedBy', 'draftReviewedAt', 'closedAt', 'closedBy', 'routingMode'];

  const data = {};
  for (const key of allowed) {
    if (body[key] !== undefined) data[key] = body[key];
  }

  const rfi = await prisma.rFI.update({
    where:   { id: params.rfiId },
    data,
    include: RFI_INCLUDE,
  });

  return NextResponse.json({ rfi });
}
