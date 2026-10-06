import { NextResponse } from 'next/server';
import { requireAuth, requireAdmin } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { logActivity } from '@/lib/activity';
import { recordStatusChanges, describeStatusChange } from '@/lib/statusEvents';
import { inDesignPipeline, STAGE_LABEL, PIPELINE_LABEL } from '@/lib/pipeline';

// POST /api/proposals/[id]/accept
// Graduates the project PROSPECT to ACTIVE and advances its pipeline stages.
export async function POST(req, { params }) {
  const { user, error } = await requireAdmin(req);
  if (error) return error;

  const proposal = await prisma.proposal.findUnique({
    where: { id: params.id },
    include: { project: true },
  });
  if (!proposal) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (proposal.status === 'ACCEPTED') {
    return NextResponse.json({ error: 'Already accepted' }, { status: 400 });
  }

  const before = proposal.project;
  // An accepted proposal is a won design fee (Mike 10-5): the Design board row
  // reads Won, and a job still waiting in Qualified or Proposal Sent moves on to
  // Design / Pre-Con. Procurement moves to Pre-Con as before. A job already
  // further along on either board is left where it is.
  const isDesign   = !!before && inDesignPipeline(before);
  const moveDesign = isDesign && (!before.designStage || ['QUALIFIED', 'PROPOSAL_SENT'].includes(before.designStage));
  const moveProc   = !!before && (!before.procurementStage || before.procurementStage === 'QUALIFIED');

  let updatedProject = null;
  await prisma.$transaction(async tx => {
    // Mark proposal accepted
    await tx.proposal.update({
      where: { id: params.id },
      data: { status: 'ACCEPTED', acceptedAt: new Date() },
    });

    // Graduate project to ACTIVE (full hub nav unlocks) + advance pipeline stages.
    updatedProject = await tx.project.update({
      where: { id: proposal.projectId },
      data: {
        lifecycleStatus:  'ACTIVE',
        ...(moveProc   ? { procurementStage: 'PRECONSTRUCTION' } : {}),
        ...(moveDesign ? { designStage: 'PRECONSTRUCTION' } : {}),
        ...(isDesign   ? { designStatus: 'WON', designStatusReason: null } : {}),
      },
    });
  });

  // Same history lines the project PATCH writes, so the timeline and the
  // dashboards tell one story about the win.
  if (before && updatedProject) {
    const statusMoves = await recordStatusChanges(prisma, before, updatedProject, user.id);
    for (const move of statusMoves) {
      await logActivity(before.id, user, 'deal_status', describeStatusChange(move), {
        pipeline: move.pipeline, fromStatus: move.fromStatus, toStatus: move.toStatus,
      });
    }
    for (const [pipeline, field] of [['PROCUREMENT', 'procurementStage'], ['DESIGN', 'designStage']]) {
      if (updatedProject[field] === before[field]) continue;
      const from = before[field] ? (STAGE_LABEL[before[field]] || before[field]) : 'no stage';
      const to   = STAGE_LABEL[updatedProject[field]] || updatedProject[field];
      await logActivity(before.id, user, 'deal_stage',
        `${PIPELINE_LABEL[pipeline]} project moved from ${from} to **${to}** (proposal accepted)`,
        { pipeline, fromStage: before[field], toStage: updatedProject[field] });
    }
  }

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
