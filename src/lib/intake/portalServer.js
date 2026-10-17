/**
 * The GC portal's server side (0132, Mike 10-16): "a very simple portal with
 * no password for now, just an email and all identical suffixes become part
 * of a company".
 *
 * A visitor types a work email. Every web budget whose creator's email domain
 * matches is theirs to see, copy, and (while unfinished) open. Nothing here
 * is a login: the shared tool password (publicAccess.js) gates the page, the
 * email only says which company's budgets to show. Work emails only, hard
 * block (classifyIntakeEmail), so gmail.com can never be a company.
 *
 * @see src/lib/intake/portalGroups.js   pure grouping + "same project?" asks
 * @see src/lib/intake/draftHistory.js   pure change rows
 * @see src/app/api/intake/portal/*      the routes
 */
import { prisma } from '@/lib/db';
import { classifyIntakeEmail } from '@/lib/intake';
import { unpackDraft, DRAFT_STEP_IDS } from '@/lib/intake/drafts';
import { draftAnswers } from '@/lib/intake/unfinishedDrafts';
import { publicIntakeEstimate, intakeEstimateGate } from '@/lib/intake/estimate';
import { loadPricing, pricingForProject } from '@/lib/pricingLoader';
import { loadAdoptedGuesses } from '@/lib/calibration/figureNormsLoad';
import { groupBudgets, portalStage } from '@/lib/intake/portalGroups';
import { buildingTypeLabel } from '@/lib/utils';

const ID = /^[a-z0-9]{10,40}$/i;

/** A work email the portal accepts, lowercased, with its domain; or null. */
export function portalEmail(raw) {
  const email = String(raw || '').trim().toLowerCase();
  const check = classifyIntakeEmail(email);
  if (!check.ok) return { ok: false, message: check.message };
  return { ok: true, email, domain: String(check.domain || email.split('@').pop()).toLowerCase() };
}

/**
 * The open budget a colleague may edit from the portal: the id is known, the
 * editor's email is a work email, and its domain is the budget's domain.
 * Returns the row (with fields) or null.
 */
export async function draftForEditor(draftId, editorEmail) {
  const id = typeof draftId === 'string' && ID.test(draftId) ? draftId : null;
  const who = portalEmail(editorEmail);
  if (!id || !who.ok) return null;
  const row = await prisma.conceptualDraft.findUnique({ where: { id }, include: { fields: true } });
  if (!row || row.submissionId || row.archivedAt) return null;
  if (!row.emailDomain || row.emailDomain.toLowerCase() !== who.domain) return null;
  return row;
}

/** Any budget of the company, finished or not, that staff have not put away. */
export async function draftForCompany(draftId, domain) {
  const id = typeof draftId === 'string' && ID.test(draftId) ? draftId : null;
  if (!id) return null;
  const row = await prisma.conceptualDraft.findUnique({ where: { id }, include: { fields: true } });
  if (!row || row.archivedAt) return null;
  if (!row.emailDomain || row.emailDomain.toLowerCase() !== String(domain).toLowerCase()) return null;
  return row;
}

const typeLabel = key => (key ? buildingTypeLabel(key) : '');

/** The dollar estimate the wizard would show for this row, or null. */
function estimateFor(row, pricing, adopted) {
  try {
    const unpacked = unpackDraft(row, row.fields);
    const answers = draftAnswers(unpacked);
    const drawings = unpacked.drawings;
    if (!intakeEstimateGate(answers, drawings).ready) return null;
    const { budget, projectData } = publicIntakeEstimate({ answers, drawings, pricing, adopted });
    if (!budget || !((projectData?.grossSf || 0) > 0)) return null;
    const n = Number(budget.totalWithControls);
    return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
  } catch (e) {
    console.error('[portal] estimate failed (non-fatal):', e?.message || e);
    return null;
  }
}

function stepIndexOf(row) {
  const i = DRAFT_STEP_IDS.indexOf(row.stepId);
  return i >= 0 ? { step: i + 1, of: DRAFT_STEP_IDS.length } : null;
}

const when = d => (d instanceof Date ? d.toISOString() : (d ? new Date(d).toISOString() : null));

/**
 * The company's project names, newest first, for the wizard's project name
 * autofill (Mike 10-16: "as you are typing it will pop up or you can type
 * and just make a new one"). Distinct, trimmed, at most 50.
 */
export async function companyProjectNames(viewerEmail) {
  const who = portalEmail(viewerEmail);
  if (!who.ok) return { error: who.message };
  const rows = await prisma.conceptualDraft.findMany({
    where: { emailDomain: who.domain, archivedAt: null },
    orderBy: { createdAt: 'desc' },
    select: { projectName: true, city: true, state: true },
    take: 300,
  });
  const seen = new Map();
  for (const r of rows) {
    const name = String(r.projectName || '').trim();
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.set(name.toLowerCase(), { name, city: r.city || '', state: r.state || '' });
    if (seen.size >= 50) break;
  }
  return { names: [...seen.values()] };
}

/**
 * Everything the portal page shows for one company: budgets grouped by
 * project, the "same project?" questions for this viewer, and a dollar
 * estimate per budget.
 */
export async function companyBudgets(viewerEmail) {
  const who = portalEmail(viewerEmail);
  if (!who.ok) return { error: who.message };
  const rows = await prisma.conceptualDraft.findMany({
    where: { emailDomain: who.domain, archivedAt: null },
    include: {
      fields: true,
      copiedFrom: { select: { id: true, projectName: true, email: true } },
      saves: { orderBy: { savedAt: 'desc' }, take: 1, select: { email: true, savedAt: true, kind: true } },
      _count: { select: { saves: true, copies: true } },
      submission: { select: { pricingSnapshot: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  if (!rows.length) return { email: who.email, domain: who.domain, groups: [], asks: [] };

  const ids = rows.map(r => r.id);
  const decisions = await prisma.conceptualDraftMatch.findMany({
    where: { OR: [{ draftId: { in: ids } }, { otherDraftId: { in: ids } }] },
    select: { draftId: true, otherDraftId: true, same: true },
  });
  const [pricing, adopted] = await Promise.all([loadPricing(), loadAdoptedGuesses()]);

  const shaped = rows.map(r => {
    const last = r.saves[0];
    return {
      id: r.id,
      projectName: r.projectName,
      budgetName: r.budgetName || null,
      city: r.city, state: r.state, zip: r.zip,
      company: r.company,
      email: r.email,
      createdAt: when(r.createdAt),
      createdBy: r.email,
      changedAt: when(last?.savedAt || r.lastSavedAt || r.createdAt),
      changedBy: last?.email || r.email,
      saveCount: r._count.saves,
      buildingType: r.buildingType, buildingTypeLabel: typeLabel(r.buildingType),
      unitCount: r.unitCount, grossSf: r.grossSf,
      haveDrawings: r.haveDrawings,
      stage: portalStage(r, stepIndexOf),
      sentAt: r.submissionId ? when(r.updatedAt) : null,
      // A sent budget stays on the sheet it was sent with (Mike 10-17).
      estimate: estimateFor(r, pricingForProject(r.submission?.pricingSnapshot, pricing), adopted),
      copiedFrom: r.copiedFrom ? { id: r.copiedFrom.id, projectName: r.copiedFrom.projectName, email: r.copiedFrom.email } : null,
      copies: r._count.copies,
      canOpen: !r.submissionId && !r.projectId,
    };
  });
  const { groups, asks } = groupBudgets(shaped, decisions);
  return {
    email: who.email, domain: who.domain,
    groups,
    asks: asks.filter(a => a.askEmail === who.email),
  };
}
