import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';

// POST /api/proposals/[id]/send
// Body: { emails: string[], note?: string }
export async function POST(req, { params }) {
  const { user, error } = await requireAuth(req);
  if (error) return error;

  const proposal = await prisma.proposal.findUnique({
    where: { id: params.id },
    include: { project: { select: { id: true, serviceType: true } } },
  });
  if (!proposal) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (proposal.status === 'ACCEPTED') {
    return NextResponse.json({ error: 'Cannot re-send an accepted proposal' }, { status: 400 });
  }

  const body = await req.json();
  const emailList = body.recipients || body.emails || [];
  const sentToEmails = Array.isArray(emailList) ? emailList.join(',') : (emailList || '');
  const note = body.note;

  await prisma.$transaction(async tx => {
    // Log the send with a snapshot of the doc
    await tx.proposalSend.create({
      data: {
        proposalId:      params.id,
        sentToEmails,
        note:            note || null,
        docBodySnapshot: proposal.docBody,
        sentById:        user.id,
      },
    });

    // Advance proposal status
    await tx.proposal.update({
      where: { id: params.id },
      data: { status: 'SENT', sentAt: new Date() },
    });

    // Advance the project's Design board to PROPOSAL_SENT (design-fee projects only)
    if (proposal.project && ['fullDesign', 'designAssist'].includes(proposal.project.serviceType)) {
      await tx.project.update({
        where: { id: proposal.project.id },
        data: { designStage: 'PROPOSAL_SENT' },
      });
    }
  });

  const updated = await prisma.proposal.findUnique({
    where: { id: params.id },
    include: {
      sends:     { include: { sentBy: { select: { id: true, name: true } } }, orderBy: { sentAt: 'desc' } },
      lineItems: { orderBy: [{ area: 'asc' }, { sortOrder: 'asc' }] },
    },
  });

  return NextResponse.json(updated);
}
