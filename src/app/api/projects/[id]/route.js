import { NextResponse } from 'next/server';
import { requireAuth, isClientViewer, can } from '@/lib/auth';
import { canOpenProject } from '@/lib/projectScope';
import { deniedMessage } from '@/lib/permissions';
import { prisma } from '@/lib/db';
import { INCLUDE_ARCHIVED, archiveData, readArchivedFlag, deleteRefused, ARCHIVED_FLAG_HELP } from '@/lib/archive';
import { logActivity, PHASE_LABELS } from '@/lib/activity';
import { sendNotification } from '@/lib/notify';
import { NEXT_ACTION_KEYS, stageKeysFor, STAGE_LABEL, PIPELINE_LABEL, SETTABLE_STATUS_KEYS, inDesignPipeline } from '@/lib/pipeline';
import { recordStatusChanges, describeStatusChange } from '@/lib/statusEvents';
import { PROJECT_TEAM_ROLES, pickTeamUpdate } from '@/lib/projectTeam';
import { parseLooseNumber, isUnreadableNumber, NUMBER_HELP } from '@/lib/numberInput';
import { SETTABLE_SERVICE_TYPE_KEYS, serviceTypeLabel } from '@/lib/utils';

// The six companies on a project's team, loaded by name so a screen can show
// "Architect: Studio Nine" without a second round trip. Built from the shared
// role list, so adding a seventh role never needs an edit here.
const TEAM_INCLUDE = Object.fromEntries(
  PROJECT_TEAM_ROLES.map(role => [role.relation, { select: { id: true, name: true } }]),
);

async function getProjectForUser(projectId, user) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      projectData: true,
      responses: true,
      createdBy: { select: { id: true, name: true, email: true } },
      ...TEAM_INCLUDE,
    },
  });
  if (!project) return null;
  // All ILC staff can reach any project; Client Viewers stay scoped to their own.
  // (Previously ILC_ADMIN-only, which also locked out SUPER_ADMINs.)
  if (!(await canOpenProject(prisma, user, project))) return null;
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
  const { name, buildingType, location, address, date, status, currentStep, completedSteps, contactEmail, contactName, clientId, phase, city, state, zip, serviceType, flagged, flagNote, contractValue, contractSignedDate, designContractValue, designContractSignedDate, constructionStartDate, mepRoughInDate, constructionEndDate, budgetType, budgetSentDate, peerReviewMatrixType,
    // ── Pipeline / CRM fields (merged from Deal) ──
    projectType, procurementStage, designStage, pipelineProbability, probabilityToWin, probabilityToMoveForward, procurementStatus, designStatus, expectedOrderDate, expectedContractExecutionDate, projectSubtype, salesOwnerId,
    procurementStatusReason, designStatusReason,
    // ── Weekly sales meeting fields ──
    proposalSentDate, nextActionType, nextActionOwnerId, nextActionDueDate } = body;

  // Contract dollars: Construction, Operations, Finance and admins only (Mike,
  // 2026-09-14). A screen may send the whole record back, so only a real change
  // counts, resending the number already on file is not an edit.
  // Money and percents arrive as whatever was typed: "1,200,000", "$41,200",
  // "12%". Number("1,200,000") is NaN, which blanked the field (Maram, 9-18);
  // the shared loose reader (src/lib/numberInput.js) handles the dressing.
  // Typed nonsense ("abc") is refused with a message, never saved as zero.
  const toMoney = (v) => {
    const n = parseLooseNumber(v);
    return Number.isNaN(n) ? null : n;
  };
  const unreadable = [contractValue, designContractValue, pipelineProbability, probabilityToWin, probabilityToMoveForward]
    .some(isUnreadableNumber);
  if (unreadable) {
    return NextResponse.json({ error: NUMBER_HELP }, { status: 400 });
  }
  const moneyIn       = toMoney(contractValue);
  const designMoneyIn = toMoney(designContractValue);
  const sameMoney = (next, stored) =>
    next === undefined || (next === null ? stored == null : next === stored);
  if (!(sameMoney(moneyIn, project.contractValue) && sameMoney(designMoneyIn, project.designContractValue))
      && !can(user, 'editJobMoney')) {
    return NextResponse.json({ error: deniedMessage('editJobMoney') }, { status: 403 });
  }

  const clampPct = v => {
    const n = parseLooseNumber(v);
    return n === null || n === undefined || Number.isNaN(n) ? null : Math.max(0, Math.min(100, n));
  };

  const validPhases      = ['sd', 'dd', 'cd', 'ifc', 'construction', 'closeout'];
  const validBudgetTypes = ['conceptual', 'design', 'peer_review'];
  // Mike 2026-09-19: "Other" was dropped. Derived from src/lib/utils.js so this
  // third copy of the list can never drift again. A project already stored as
  // 'other' keeps that value, it just cannot be written back.
  const validServiceTypes = SETTABLE_SERVICE_TYPE_KEYS;
  // Each board's list comes from pipeline.js so a stage added there is accepted
  // here without a second edit. Design has one extra column (Proposal Sent).
  const validProcurementStages = stageKeysFor('PROCUREMENT');
  const validDesignStages      = stageKeysFor('DESIGN');

  // Proposal Sent is one fact on one field, proposalSentDate, no matter which
  // screen records it (Mike 10-5). Two automatic moves keep the Design board
  // honest about it:
  //   1. the date being set for the first time (from null) moves a design job
  //      sitting in Qualified into the Proposal Sent column;
  //   2. a card dragged or picked into Proposal Sent stamps today on the date
  //      when it is still blank. Moving back out never clears the date.
  const dateIsNew = proposalSentDate !== undefined && !!proposalSentDate && !project.proposalSentDate;
  let designStageIn = designStage;
  if (designStageIn === undefined && dateIsNew && inDesignPipeline(project)
      && (project.designStage === 'QUALIFIED' || !project.designStage)) {
    designStageIn = 'PROPOSAL_SENT';
  }
  let proposalSentDateIn = proposalSentDate;
  if (designStageIn === 'PROPOSAL_SENT' && !project.proposalSentDate
      && (proposalSentDateIn === undefined || proposalSentDateIn === null)) {
    proposalSentDateIn = new Date();
  }
  const stageIn = { procurementStage, designStage: designStageIn };
  // The picker list from pipeline.js: OPEN, ON_HOLD, WON, LOST, ABANDONED.
  // COMPLETED can no longer be SET (Maram 9-17); rows already holding it are
  // left alone and still read as won.
  const validPipelineStatus    = SETTABLE_STATUS_KEYS;

  // Mike's rule: Lost and Abandoned both need a written reason. Enforced here so
  // no screen can slip a deal into either state without one, the reason may
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

  // ── Project team (Mike, 2026-09-09) ──
  // Only the six team keys are read off the body, and a cleared picker arrives
  // as "" which has to land as null rather than as an id pointing at nothing.
  // The ids are checked here so a company deleted on another screen comes back
  // as a plain message instead of a database error.
  const teamUpdate = pickTeamUpdate(body);
  const teamIds = [...new Set(Object.values(teamUpdate).filter(Boolean))];
  if (teamIds.length) {
    // An archived company keeps any seat it already holds, so it must count here.
    const found = await prisma.client.findMany({ where: { id: { in: teamIds }, ...INCLUDE_ARCHIVED }, select: { id: true } });
    if (found.length !== teamIds.length) {
      return NextResponse.json(
        { error: 'One of the companies chosen for the project team no longer exists.' },
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
      ...(zip            !== undefined && { zip: zip ? String(zip).trim().slice(0, 10) : null }),
      ...(contactName    !== undefined && { contactName: contactName ? String(contactName).trim().slice(0, 200) : null }),
      ...(serviceType    !== undefined && (validServiceTypes.includes(serviceType) || serviceType === null) && { serviceType: serviceType || null }),
      ...(flagged        !== undefined && { flagged: Boolean(flagged) }),
      ...(flagNote       !== undefined && { flagNote: flagNote || null }),
      ...(moneyIn        !== undefined && { contractValue: moneyIn }),
      ...(contractSignedDate       !== undefined && { contractSignedDate:       contractSignedDate       || null }),
      ...(designMoneyIn            !== undefined && { designContractValue:      designMoneyIn }),
      ...(designContractSignedDate !== undefined && { designContractSignedDate: designContractSignedDate || null }),
      ...(constructionStartDate !== undefined && { constructionStartDate: constructionStartDate || null }),
      ...(mepRoughInDate        !== undefined && { mepRoughInDate:        mepRoughInDate        || null }),
      ...(constructionEndDate   !== undefined && { constructionEndDate:   constructionEndDate   || null }),
      ...(budgetType     !== undefined && validBudgetTypes.includes(budgetType) && { budgetType }),
      ...(budgetSentDate !== undefined && { budgetSentDate: budgetSentDate ? new Date(budgetSentDate) : null }),
      ...(peerReviewMatrixType !== undefined && ['PEER_REVIEW', 'DESIGN_BID'].includes(peerReviewMatrixType) && { peerReviewMatrixType }),
      // ── Pipeline / CRM fields (merged from Deal, a project IS the pipeline entity) ──
      ...(projectType         !== undefined && { projectType: projectType || null }),
      ...(projectSubtype      !== undefined && { projectSubtype: String(projectSubtype || '').trim().slice(0, 120) || null }),
      ...(procurementStage    !== undefined && validProcurementStages.includes(procurementStage) && { procurementStage }),
      ...(designStageIn       !== undefined && validDesignStages.includes(designStageIn) && { designStage: designStageIn }),
      ...(pipelineProbability !== undefined && { pipelineProbability: clampPct(pipelineProbability) ?? 50 }),
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
      ...(expectedContractExecutionDate !== undefined && { expectedContractExecutionDate: expectedContractExecutionDate ? new Date(expectedContractExecutionDate) : null }),
      ...(salesOwnerId        !== undefined && { salesOwnerId: salesOwnerId || null }),
      ...(proposalSentDateIn  !== undefined && { proposalSentDate: proposalSentDateIn ? new Date(proposalSentDateIn) : null }),
      ...(nextActionType      !== undefined && { nextActionType: (nextActionType && NEXT_ACTION_KEYS.includes(nextActionType)) ? nextActionType : null }),
      ...(nextActionOwnerId   !== undefined && { nextActionOwnerId: nextActionOwnerId || null }),
      ...(nextActionDueDate   !== undefined && { nextActionDueDate: nextActionDueDate ? new Date(nextActionDueDate) : null }),
      // The six Project Team seats. Always optional, never required to save.
      ...teamUpdate,
    },
    include: { projectData: true, ...TEAM_INCLUDE },
  });

  // Write down the day this deal changed status, on whichever board moved.
  // The status columns above only hold where a deal is NOW; without this the
  // day it was won is gone the moment it is overwritten.
  const statusMoves = await recordStatusChanges(prisma, project, updated, user.id);

  // Mike, 2026-09-08: "All of this should write in the history of a project
  // right?" It does now. The same moves the charts run on are written to the
  // project's History tab in plain English, one line each, from the one source
  // so the timeline and the dashboards can never disagree about what happened.
  for (const move of statusMoves) {
    await logActivity(params.id, user, 'deal_status', describeStatusChange(move), {
      pipeline: move.pipeline, fromStatus: move.fromStatus, toStatus: move.toStatus,
    });
  }

  // A deal moving up the board belongs in the same story. Stage is a board-row
  // property like status, so it is reported per board and named the way the
  // boards name it rather than by its stored key.
  // The automatic Proposal Sent move above is logged here too, same as a drag.
  for (const [pipeline, field] of [['PROCUREMENT', 'procurementStage'], ['DESIGN', 'designStage']]) {
    if (stageIn[field] === undefined || updated[field] === project[field]) continue;
    const board = PIPELINE_LABEL[pipeline];
    const from  = project[field] ? (STAGE_LABEL[project[field]] || project[field]) : 'no stage';
    const to    = STAGE_LABEL[updated[field]] || updated[field];
    await logActivity(params.id, user, 'deal_stage',
      `${board} project moved from ${from} to **${to}**`,
      { pipeline, fromStage: project[field], toStage: updated[field] });
  }

  // Log meaningful changes, skip silent wizard step/progress saves
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
      events.push(`Set service type to **${serviceType ? serviceTypeLabel(serviceType) : 'none'}**`);
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

// DELETE /api/projects/[id], refused. Projects are archived, never deleted
// (Mike, 2026-09-11). A delete took the budget, files, notes and history with it.
export async function DELETE() {
  return NextResponse.json({ error: deleteRefused('Projects') }, { status: 405 });
}

// POST /api/projects/[id]  { archived: true | false }, archive or restore.
// Written to the project's History tab either way.
export async function POST(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  if (isClientViewer(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const project = await getProjectForUser(params.id, user);
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const archived = await readArchivedFlag(request);
  if (archived === null) return NextResponse.json({ error: ARCHIVED_FLAG_HELP }, { status: 400 });

  const updated = await prisma.project.update({
    where:  { id: params.id },
    data:   archiveData(archived, user),
    select: { id: true, name: true, archivedAt: true },
  });

  await logActivity(params.id, user, archived ? 'project_archived' : 'project_restored',
    archived ? 'Archived the project' : 'Restored the project from the archive');

  return NextResponse.json({ project: updated });
}
