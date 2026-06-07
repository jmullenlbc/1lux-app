import { NextResponse } from 'next/server';
import { requireAuth, requireAdmin } from '@/lib/auth';
import { prisma } from '@/lib/db';

// POST /api/proposals/[id]/accept
// Graduates the project PROSPECT → ACTIVE; advances procurement deal to PRECONSTRUCTION.
export async function POST(req, { params }) {
  const { user, error } = await requireAdmin(req);
  if (error) return error;

  const proposal = await prisma.proposal.findUnique({
    where: { id: params.id },
    include: { project: { include: { linkedDeals: true } } },
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

    // Graduate project to ACTIVE (full hub nav unlocks)
    await tx.project.update({
      where: { id: proposal.projectId },
      data: { lifecycleStatus: 'ACTIVE' },
    });

    // Advance any PROCUREMENT deal on this project to PRECONSTRUCTION
    const procurementDeal = proposal.project.linkedDeals.find(
      d => d.pipeline === 'PROCUREMENT' && d.dealStatus === 'OPEN'
    );
    if (procurementDeal) {
      await tx.deal.update({
        where: { id: procurementDeal.id },
        data: { stage: 'PRECONSTRUCTION' },
      });
    }

    // Advance the linked DESIGN deal to WON
    if (proposal.dealId) {
      await tx.deal.update({
        where: { id: proposal.dealId },
        data: { stage: 'DESIGN', dealStatus: 'WON', wonAt: new Date() },
      });
    }
  });

  const updated = await prisma.proposal.findUnique({
    where: { id: params.id },
    include: {
      project:   { select: { id: true, name: true, city: true, state: true, lifecycleStatus: true, clientId: true } },
      deal:      { select: { id: true, dealNumber: true, pipeline: true, stage: true } },
      lineItems: { orderBy: [{ area: 'asc' }, { sortOrder: 'asc' }] },
      sends:     { include: { sentBy: { select: { id: true, name: true } } }, orderBy: { sentAt: 'desc' } },
    },
  });
  return NextResponse.json(updated);
}
