import { NextResponse } from 'next/server';
import { requireAuth, isClientViewer } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { logActivity, PHASE_LABELS } from '@/lib/activity';
import { sendNotification } from '@/lib/notify';
import { NEXT_ACTION_KEYS, STAGE_KEYS } from '@/lib/pipeline';

async function getProjectForUser(projectId, user) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      projectData: true,
      responses: true,
      createdBy: { select: { id: true, name: true, email: true } },
    },
  });
  if (!project) return null;
  // All ILC staff can reach any project; Client Viewers stay scoped to their own.
  // (Previously ILC_ADMIN-only, which also locked out SUPER_ADMINs.)
  if (isClientViewer(user.role) && project.createdById !== user.id) return null;
  return project;
}

export async function GET(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const project = await getProjectForUser(params.id, user);
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({ project });
}

export async function PATCH(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  if (isClientViewer(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const project = await getProjectForUser(params.id, user);
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await request.json();
  const { name, buildingType, location, address, date, status, currentStep, completedSteps, contactEmail, clientId, phase, city, state, serviceType, flagged, flagNote, contractValue, contractSignedDate, designContractValue, designContractSignedDate, constructionStartDate, mepRoughInDate, constructionEndDate, budgetType, budgetSentDate, peerReviewMatrixType,
    // ── Pipeline / CRM fields (merged from Deal) ──
    projectType, procurementStage, designStage, pipelineProbability, probabilityToWin, probabilityToMoveForward, procurementStatus, designStatus, expectedOrderDate, salesOwnerId,
    procurementStatusReason, designStatusReason,
    // ── Weekly sales meeting fields ──
    proposalSentDate, nextActionType, nextActionOwnerId, nextActionDueDate } = body;

  const clampPct = v => v === null || v === '' ? null : Math.max(0, Math.min(100, Number(v)));

  const validPhases      = ['sd', 'dd', 'cd', 'ifc', 'construction', 'closeout'];
  const validBudgetTypes = ['conceptual', 'design', 'peer_review'];
  const validServiceTypes = ['fullDesign', 'designAssist', 'peerReview', 'bidOnly', 'other'];
  // Both boards share one stage list (2026-09-04), taken from pipeline.js so a
  // stage added there is accepted here without a second edit.
  const validProcurementStages = STAGE_KEYS;
  const validDesignStages      = validProcurementStages;
  const validPipelineStatus    = ['OPEN', 'WON', 'LOST', 'COMPLETED', 'ABANDONED'];

  // Mike's rule: Lost and Abandoned both need a written reason. Enforced here so
  // no screen can slip a deal into either state without one — the reason may
  // arrive with this request or already be on the record from an earlier save.
  const NEEDS_REASON = ['LOST', 'ABANDONED'];
  for (const [board, nextStatus, sentReason, storedReason] of [
    ['Procurement', procurementStatus, procurementStatusReason, project.procurementStatusReason],
    ['Design',      designStatus,      designStatusReason,      project.designStatusReason],
  ]) {
    if (nextStatus === undefined || !NEEDS_REASON.includes(nextStatus)) continue;
    const reason = sentReason !== undefined ? sentReason : storedReason;
    if (!String(reason ?? '').trim()) {
      return NextResponse.json(
        { error: `A reason is required when marking a project Lost or Abandoned (${board}).` },
        { status: 400 },
      );
    }
  }

  const updated = await prisma.project.update({
    where: { id: params.id },
    data: {
      ...(name           !== undefined && { name }),
      ...(buildingType   !== undefined && { buildingType }),
      ...(location       !== undefined && { location }),
      ...(address        !== undefined && { address }),
      ...(date           !== undefined && { date }),
      ...(status         !== undefined && { status }),
      ...(currentStep    !== undefined && { currentStep }),
      ...(completedSteps !== undefined && { completedSteps: JSON.stringify(completedSteps) }),
      ...(contactEmail   !== undefined && { contactEmail }),
      ...(clientId       !== undefined && { clientId: clientId || null }),
      ...(phase          !== undefined && validPhases.includes(phase) && { phase }),
      ...(city           !== undefined && { city: city  || null }),
      ...(state          !== undefined && { state: state || null }),
      ...(serviceType    !== undefined && (validServiceTypes.includes(serviceType) || serviceType === null) && { serviceType: serviceType || null }),
      ...(flagged        !== undefined && { flagged: Boolean(flagged) }),
      ...(flagNote       !== undefined && { flagNote: flagNote || null }),
      ...(contractValue  !== undefined && { contractValue: contractValue === null ? null : Number(contractValue) }),
      ...(contractSignedDate       !== undefined && { contractSignedDate:       contractSignedDate       || null }),
      ...(designContractValue      !== undefined && { designContractValue:      designContractValue === null ? null : Number(designContractValue) }),
      ...(designContractSignedDate !== undefined && { designContractSignedDate: designContractSignedDate || null }),
      ...(constructionStartDate !== undefined && { constructionStartDate: constructionStartDate || null }),
      ...(mepRoughInDate        !== undefined && { mepRoughInDate:        mepRoughInDate        || null }),
      ...(constructionEndDate   !== undefined && { constructionEndDate:   constructionEndDate   || null }),
      ...(budgetType     !== undefined && validBudgetTypes.includes(budgetType) && { budgetType }),
      ...(budgetSentDate !== undefined && { budgetSentDate: budgetSentDate ? new Date(budgetSentDate) : null }),
      ...(peerReviewMatrixType !== undefined && ['PEER_REVIEW', 'DESIGN_BID'].includes(peerReviewMatrixType) && { peerReviewMatrixType }),
      // ── Pipeline / CRM fields (merged from Deal — a project IS the pipeline entity) ──
      ...(projectType         !== undefined && { projectType: projectType || null }),
      ...(procurementStage    !== undefined && validProcurementStages.includes(procurementStage) && { procurementStage }),
      ...(designStage         !== undefined && validDesignStages.includes(designStage) && { designStage }),
      ...(pipelineProbability !== undefined && { pipelineProbability: pipelineProbability === null ? 50 : Math.max(0, Math.min(100, Number(pipelineProbability))) }),
      ...(probabilityToWin         !== undefined && { probabilityToWin:         clampPct(probabilityToWin) }),
      ...(probabilityToMoveForward !== undefined && { probabilityToMoveForward: clampPct(probabilityToMoveForward) }),
      ...(procurementStatus   !== undefined && validPipelineStatus.includes(procurementStatus) && { procurementStatus }),
      ...(designStatus        !== undefined && validPipelineStatus.includes(designStatus) && { designStatus }),
      // The written reason behind a Lost / Abandoned deal. Cleared automatically
      // when the deal moves back to an open or won state, so a stale excuse
      // never hangs around on a live job.
      ...(procurementStatusReason !== undefined && { procurementStatusReason: procurementStatusReason || null }),
      ...(designStatusReason      !== undefined && { designStatusReason:      designStatusReason      || null }),
      ...(procurementStatus !== undefined && !NEEDS_REASON.includes(procurementStatus) && { procurementStatusReason: null }),
      ...(designStatus      !== undefined && !NEEDS_REASON.includes(designStatus)      && { designStatusReason:      null }),
      ...(expectedOrderDate   !== undefined && { expectedOrderDate: expectedOrderDate ? new Date(expectedOrderDate) : null }),
      ...(salesOwnerId        !== undefined && { salesOwnerId: salesOwnerId || null }),
      ...(proposalSentDate    !== undefined && { proposalSentDate: proposalSentDate ? new Date(proposalSentDate) : null }),
      ...(nextActionType      !== undefined && { nextActionType: (nextActionType && NEXT_ACTION_KEYS.includes(nextActionType)) ? nextActionType : null }),
      ...(nextActionOwnerId   !== undefined && { nextActionOwnerId: nextActionOwnerId || null }),
      ...(nextActionDueDate   !== undefined && { nextActionDueDate: nextActionDueDate ? new Date(nextActionDueDate) : null }),
    },
    include: { projectData: true },
  });

  // Log meaningful changes — skip silent wizard step/progress saves
  const silentOnly = Object.keys(body).every(k => ['currentStep', 'completedSteps'].includes(k));
  if (!silentOnly) {
    const events = [];
    if (phase !== undefined && phase !== project.phase) {
      events.push(`Changed phase to **${PHASE_LABELS[phase] || phase}**`);
    }
    if (name !== undefined && name !== project.name) {
      events.push(`Renamed project to **${name}**`);
    }
    if (flagged !== undefined && flagged !== project.flagged) {
      events.push(flagged ? 'Flagged project' : 'Removed flag from project');
    }
    if (clientId !== undefined && clientId !== project.clientId) {
      events.push('Updated assigned client');
    }
    if (serviceType !== undefined && serviceType !== project.serviceType) {
      events.push(`Set service type to **${serviceType || 'none'}**`);
    }
    if (budgetType !== undefined && budgetType !== project.budgetType) {
      const BUDGET_LABELS = { conceptual: 'Conceptual Budget', design: 'Design Budget', peer_review: 'Peer Review' };
      events.push(`Converted to **${BUDGET_LABELS[budgetType] || budgetType}**`);
    }
    if (peerReviewMatrixType !== undefined && peerReviewMatrixType !== project.peerReviewMatrixType) {
      events.push(`Switched matrix view to **${peerReviewMatrixType === 'DESIGN_BID' ? 'Design Bid' : 'Peer Review'}**`);
    }
    if (contractValue !== undefined) events.push('Updated supply contract value');
    if (contractSignedDate !== undefined) events.push('Updated supply contract signed date');
    if (designContractValue !== undefined) events.push('Updated design contract value');
    if (constructionStartDate !== undefined) events.push('Updated construction start date');

    if (events.length > 0) {
      await logActivity(params.id, user, 'project_meta', events.join(' · '), { fields: Object.keys(body) });
    }
  }

  // ── Notification triggers ─────────────────────────────────────────────────
  // CONTRACT_SIGNED: fire when contractSignedDate transitions null → value
  const prevSignedDate = project.contractSignedDate;
  if (contractSignedDate && !prevSignedDate) {
    sendNotification(params.id, 'CONTRACT_SIGNED', { contractSignedDate }).catch(() => {});
  }

  // BUDGET_SENT: fire when budgetSentDate transitions null → value
  const prevBudgetSentDate = project.budgetSentDate;
  if (budgetSentDate && !prevBudgetSentDate) {
    sendNotification(params.id, 'BUDGET_SENT', { budgetType: updated.budgetType, budgetSentDate }).catch(() => {});
  }

  return NextResponse.json({ project: updated });
}

export async function DELETE(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  if (isClientViewer(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const project = await getProjectForUser(params.id, user);
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await prisma.project.delete({ where: { id: params.id } });

  return NextResponse.json({ success: true });
}
