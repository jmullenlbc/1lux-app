import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { logActivity } from '@/lib/activity';
import { inDesignPipeline, STAGE_LABEL, PIPELINE_LABEL } from '@/lib/pipeline';

// POST /api/proposals/[id]/send
// Body: { emails: string[], note?: string }
export async function POST(req, { params }) {
  const { user, error } = await requireAuth(req);
  if (error) return error;

  const proposal = await prisma.proposal.findUnique({
    where: { id: params.id },
    include: { project: { select: { id: true, serviceType: true, designContractValue: true, designStage: true, proposalSentDate: true } } },
  });
  if (!proposal) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (proposal.status === 'ACCEPTED') {
    return NextResponse.json({ error: 'Cannot re-send an accepted proposal' }, { status: 400 });
  }

  const body = await req.json();
  const emailList = body.recipients || body.emails || [];
  const sentToEmails = Array.isArray(emailList) ? emailList.join(',') : (emailList || '');
  const note = body.note;

  // Mike 10-5: sending a proposal moves a design job from Qualified into the
  // Proposal Sent column on the Design board. A job already further along stays
  // where it is. Procurement has no such column.
  const project = proposal.project;
  const moveDesign = !!project && inDesignPipeline(project)
    && (project.designStage === 'QUALIFIED' || !project.designStage);

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

    // "Proposal sent" is one date on the project, proposalSentDate. First send
    // wins so the awaiting-signature clock measures from the original send.
    if (project) {
      await tx.project.updateMany({
        where: { id: project.id, proposalSentDate: null },
        data:  { proposalSentDate: new Date() },
      });
      if (moveDesign) {
        await tx.project.update({ where: { id: project.id }, data: { designStage: 'PROPOSAL_SENT' } });
      }
    }
  });

  if (moveDesign) {
    const from = project.designStage ? (STAGE_LABEL[project.designStage] || project.designStage) : 'no stage';
    await logActivity(project.id, user, 'deal_stage',
      `${PIPELINE_LABEL.DESIGN} project moved from ${from} to **${STAGE_LABEL.PROPOSAL_SENT}** (proposal sent)`,
      { pipeline: 'DESIGN', fromStage: project.designStage, toStage: 'PROPOSAL_SENT' });
  }

  const updated = await prisma.proposal.findUnique({
    where: { id: params.id },
    include: {
      sends:     { include: { sentBy: { select: { id: true, name: true } } }, orderBy: { sentAt: 'desc' } },
      lineItems: { orderBy: [{ area: 'asc' }, { sortOrder: 'asc' }] },
    },
  });

  return NextResponse.json(updated);
}
