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

    // "Proposal sent" is a date on the project, not a board column — both
    // pipelines share one stage list (2026-09-04). First send wins so the
    // awaiting-signature clock measures from the original send.
    if (proposal.project) {
      await tx.project.updateMany({
        where: { id: proposal.project.id, proposalSentDate: null },
        data:  { proposalSentDate: new Date() },
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
