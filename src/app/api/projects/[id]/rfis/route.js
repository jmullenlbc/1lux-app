import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { extractFixtureTypes, getShipFlagTypes } from '@/lib/extractFixtureTypes';

// GET /api/projects/[id]/rfis
// Returns all RFIs sorted: READY drafts first, then OPEN by dateDue, then rest.
export async function GET(req, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const rfis = await prisma.rFI.findMany({
    where:   { projectId: params.id },
    include: {
      assignedTo: { select: { id: true, name: true } },
      _count:     { select: { activities: true, impactItems: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  // Sort: READY drafts first, then OPEN by dateDue asc, then others
  const sorted = [...rfis].sort((a, b) => {
    if (a.draftStatus === 'READY' && b.draftStatus !== 'READY') return -1;
    if (b.draftStatus === 'READY' && a.draftStatus !== 'READY') return 1;
    if (a.status === 'OPEN' && b.status !== 'OPEN') return -1;
    if (b.status === 'OPEN' && a.status !== 'OPEN') return 1;
    if (a.dateDue && b.dateDue) return new Date(a.dateDue) - new Date(b.dateDue);
    return 0;
  });

  return NextResponse.json({ rfis: sorted });
}

// POST /api/projects/[id]/rfis
// Create a new RFI + first INBOUND activity in one transaction.
export async function POST(req, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const {
    rfiNumber, subject, receivedFrom, rfiType,
    routingMode, dateDue, assignedToId, bodyText,
  } = await req.json();

  if (!rfiNumber || !subject || !receivedFrom || !rfiType) {
    return NextResponse.json({ error: 'rfiNumber, subject, receivedFrom, rfiType required' }, { status: 400 });
  }

  // Auto-set shipFlag: scan subject for fixture type codes against active shipments
  const matchedTypes = await extractFixtureTypes(subject + ' ' + (bodyText || ''), params.id, prisma);
  const shipFlagTypes = await getShipFlagTypes(matchedTypes, params.id, prisma);
  const shipFlag = shipFlagTypes.length > 0;

  // Get project routing mode default if not supplied
  const project = await prisma.project.findUnique({
    where:  { id: params.id },
    select: { rfiRoutingMode: true },
  });
  const effectiveRoutingMode = routingMode || project?.rfiRoutingMode || 'DIRECT';

  const rfi = await prisma.rFI.create({
    data: {
      projectId:    params.id,
      rfiNumber,
      subject,
      receivedFrom,
      rfiType,
      routingMode:  effectiveRoutingMode,
      status:       'OPEN',
      draftStatus:  'NONE',
      shipFlag,
      assignedToId: assignedToId || null,
      dateDue:      dateDue ? new Date(dateDue) : null,
      activities: {
        create: {
          direction:  'INBOUND',
          authoredBy: receivedFrom,
          bodyText:   bodyText || subject,
        },
      },
    },
    include: {
      assignedTo:  { select: { id: true, name: true } },
      activities:  { orderBy: { sentAt: 'asc' } },
      impactItems: true,
    },
  });

  return NextResponse.json({ rfi }, { status: 201 });
}
