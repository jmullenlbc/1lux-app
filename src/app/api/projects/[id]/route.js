import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { logActivity, PHASE_LABELS } from '@/lib/activity';
import { sendNotification } from '@/lib/notify';

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
  if (user.role !== 'ILC_ADMIN' && project.createdById !== user.id) return null;
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

  const project = await getProjectForUser(params.id, user);
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await request.json();
  const { name, buildingType, location, address, date, status, currentStep, completedSteps, contactEmail, clientId, phase, city, state, serviceType, flagged, flagNote, contractValue, contractSignedDate, designContractValue, designContractSignedDate, constructionStartDate, mepRoughInDate, constructionEndDate, budgetType, budgetSentDate, peerReviewMatrixType } = body;

  const validPhases      = ['sd', 'dd', 'cd', 'ifc', 'construction', 'closeout'];
  const validBudgetTypes = ['conceptual', 'design', 'peer_review'];
  const validServiceTypes = ['fullDesign', 'designAssist', 'peerReview', 'bidOnly', 'other'];

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

  const project = await getProjectForUser(params.id, user);
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await prisma.project.delete({ where: { id: params.id } });

  return NextResponse.json({ success: true });
}
