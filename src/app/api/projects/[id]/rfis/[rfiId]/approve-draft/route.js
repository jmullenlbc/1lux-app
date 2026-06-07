import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';

// POST /api/projects/[id]/rfis/[rfiId]/approve-draft
// Converts approved draft into formal OUTBOUND RFIActivity + marks RFI as RESPONDED.
export async function POST(req, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const { finalText, designerName } = await req.json();
  if (!finalText || !designerName) {
    return NextResponse.json({ error: 'finalText and designerName required' }, { status: 400 });
  }

  const rfi = await prisma.rFI.findFirst({
    where: { id: params.rfiId, projectId: params.id },
  });
  if (!rfi) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Ship flag gate for SUBSTITUTION RFIs
  if (rfi.rfiType === 'SUBSTITUTION' && rfi.shipFlag && !rfi.shipFlagAcknowledged) {
    return NextResponse.json(
      { error: 'Acknowledge active shipment first', code: 'SHIP_FLAG_UNACKNOWLEDGED' },
      { status: 400 }
    );
  }

  const now = new Date();

  // Atomic: create OUTBOUND activity + update RFI status
  const [activity] = await prisma.$transaction([
    prisma.rFIActivity.create({
      data: {
        rfiId:      params.rfiId,
        direction:  'OUTBOUND',
        authoredBy: designerName,
        bodyText:   finalText,
        sentAt:     now,
      },
    }),
    prisma.rFI.update({
      where: { id: params.rfiId },
      data: {
        status:          'RESPONDED',
        draftStatus:     'SENT',
        draftReviewedBy: designerName,
        draftReviewedAt: now,
      },
    }),
  ]);

  return NextResponse.json({ ok: true, activity });
}
