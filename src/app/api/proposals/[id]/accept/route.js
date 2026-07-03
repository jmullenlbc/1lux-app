import { NextResponse } from 'next/server';
import { requireAuth, requireAdmin } from '@/lib/auth';
import { prisma } from '@/lib/db';

// POST /api/proposals/[id]/accept
// Graduates the project PROSPECT → ACTIVE and advances its pipeline stages.
export async function POST(req, { params }) {
  const { user, error } = await requireAdmin(req);
  if (error) return error;

  const proposal = await prisma.proposal.findUnique({
    where: { id: params.id },
    include: { project: { select: { id: true, serviceType: true } } },
  });
  if (!proposal) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (proposal.status === 'ACCEPTED') {
    return NextResponse.json({ error: 'Already accepted' }, { status: 400 });
  }

  await prisma.$transaction(async tx => {
    // Mark proposal accepted
    await tx.proposal.update({
      where: { id: params.id },
      data: { status: 'ACCEPTED', acceptedAt: new Date() },
    });

    // Graduate project to ACTIVE (full hub nav unlocks) + advance pipeline stages:
    // Procurement → Pre-Construction; design-fee projects also mark Design complete.
    const isDesign = ['fullDesign', 'designAssist'].includes(proposal.project?.serviceType);
    await tx.project.update({
      where: { id: proposal.projectId },
      data: {
        lifecycleStatus:  'ACTIVE',
        procurementStage: 'PRECONSTRUCTION',
        ...(isDesign ? { designStage: 'DESIGN_COMPLETED' } : {}),
      },
    });
  });

  const updated = await prisma.proposal.findUnique({
    where: { id: params.id },
    include: {
      project:   { select: { id: true, name: true, city: true, state: true, lifecycleStatus: true, clientId: true } },
      lineItems: { orderBy: [{ area: 'asc' }, { sortOrder: 'asc' }] },
      sends:     { include: { sentBy: { select: { id: true, name: true } } }, orderBy: { sentAt: 'desc' } },
    },
  });
  return NextResponse.json(updated);
}
