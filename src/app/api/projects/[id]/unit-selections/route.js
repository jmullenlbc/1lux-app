/**
 * One project's unit selection survey.
 *
 * GET   — the current survey, the facts it runs on, and the fixtures each
 *         category may offer once the budget and the code rules have had their
 *         say. Everything the screen needs, in one answer.
 * POST  — start a survey. Freezes the facts as they are today.
 * PATCH — change what the survey assumes (the entry sconce mounting height, the
 *         island length, a typed dollar target) and refreeze.
 *
 * ── The frozen facts ────────────────────────────────────────────────────────
 * A survey holds `factsSnapshot` rather than recomputing, because the design
 * questionnaire keeps moving and a survey that quietly changes its own budget
 * under a respondent is worse than one that is out of date. GET therefore hands
 * back both: `facts` is what the survey is running on, `liveFacts` is what the
 * questionnaire says today, and the screen says so when they differ.
 *
 * ── Money ───────────────────────────────────────────────────────────────────
 * Targets and cnPrice are sell figures and stay here. dnPrice is never selected
 * on this route. Nothing on it is reachable by a contractor.
 */
import { NextResponse } from 'next/server';
import { requireAuth, canSeeAllData } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { CATEGORIES, CATEGORY_KEYS, eligibleOptions, resolveFacts } from '@/lib/unitSelections';

export const dynamic = 'force-dynamic';

/** Body scalars plus live finishes. No dnPrice — see the header. */
const OPTION_SHAPE = {
  id: true, category: true, name: true, bodyKey: true,
  shape: true, style: true, dimLabel: true,
  projectionIn: true, bladeSpanIn: true,
  wetRated: true, dampRated: true,
  imageUrl: true, sortOrder: true, isActive: true,
  finishes: {
    where: { isActive: true },
    select: { id: true, finishKey: true, cnPrice: true, leadTimeWks: true, imageUrl: true, isDefault: true, isActive: true },
    orderBy: [{ isDefault: 'desc' }, { finishKey: 'asc' }],
  },
};

const RESPONSE_SHAPE = {
  id: true, respondentName: true, respondentRole: true, contactId: true,
  styleChoice: true, finishOverride: true, fanHoldWhite: true, notes: true,
  startedAt: true, submittedAt: true, createdAt: true,
  choices: {
    select: { id: true, category: true, optionId: true, kind: true, finishKey: true },
  },
};

async function canAccess(projectId, user) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, createdById: true, name: true, serviceType: true },
  });
  if (!project) return null;
  if (!canSeeAllData(user) && project.createdById !== user.id) return null;
  return project;
}

function parseJson(s, fallback) {
  try { return JSON.parse(s ?? ''); } catch { return fallback; }
}

/** The one place the survey's own overrides are read back out of a snapshot. */
function overridesFrom(survey) {
  const snap = parseJson(survey?.factsSnapshot, {});
  return {
    targets: snap?.overrides?.targets || {},
    entryMountHigh: snap?.overrides?.entryMountHigh ?? null,
    islandLength: snap?.overrides?.islandLength ?? null,
  };
}

/** Facts + the overrides that produced them, so a refreeze can repeat them. */
function freeze(facts, overrides) {
  return JSON.stringify({ ...facts, overrides });
}

export async function GET(request, { params }) {
  const { user, error } = await requireAuth(request);
  if (error) return error;
  const project = await canAccess(params.id, user);
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const survey = await prisma.unitSelectionSurvey.findFirst({
    where: { projectId: params.id },
    orderBy: { version: 'desc' },
    select: {
      id: true, version: true, status: true, factsSnapshot: true, styleSeed: true,
      closedAt: true, createdAt: true, updatedAt: true,
      responses: { select: RESPONSE_SHAPE, orderBy: { createdAt: 'asc' } },
      results: {
        select: {
          id: true, category: true, optionId: true, finishKey: true, agreement: true,
          divergence: true, note: true, resolvedAt: true, pushedAt: true,
        },
      },
    },
  });

  // What the questionnaire says right now. Always computed, so the screen can
  // point out that the survey is running on older assumptions.
  const liveFacts = await resolveFacts(params.id, survey ? overridesFrom(survey) : {});
  // The frozen copy wins. Its own record of which overrides produced it is
  // pulled back off, so `facts` is only ever facts.
  const frozen = parseJson(survey?.factsSnapshot, null);
  if (frozen) delete frozen.overrides;
  const facts = frozen ? { ...liveFacts, ...frozen } : liveFacts;

  // The pool, cut down per category by the same rules a respondent will meet.
  const pool = await prisma.decorativeOption.findMany({
    where: { isActive: true, category: { in: [...CATEGORY_KEYS] } },
    select: OPTION_SHAPE,
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });

  const categories = CATEGORIES.map(cat => {
    const { eligible, hidden } = eligibleOptions(cat.key, facts, pool);
    return {
      key: cat.key,
      typeCode: cat.typeCode,
      label: cat.label,
      skipped: facts.skipped?.includes(cat.key) || false,
      level: facts.levels?.[cat.key] ?? null,
      count: facts.counts?.[cat.key] ?? 0,
      target: facts.targets?.[cat.key] ?? null,
      targetSource: facts.source?.[cat.key] ?? null,
      options: eligible,
      // The reasons, grouped. When everything is hidden this is the only thing
      // the screen has to show, and an empty panel with no explanation is how a
      // person concludes the feature is broken.
      hidden: hidden.map(h => ({ id: h.option.id, name: h.option.name, reason: h.reason })),
    };
  });

  return NextResponse.json({
    project: { id: project.id, name: project.name, serviceType: project.serviceType },
    survey: survey
      ? { ...survey, factsSnapshot: undefined, overrides: overridesFrom(survey) }
      : null,
    facts,
    liveFacts,
    categories,
  });
}

/** Start a survey. A second one is a new version, never an overwrite. */
export async function POST(request, { params }) {
  const { user, error } = await requireAuth(request);
  if (error) return error;
  const project = await canAccess(params.id, user);
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  let body; try { body = await request.json(); } catch { body = {}; }
  const overrides = {
    targets: body?.targets || {},
    entryMountHigh: body?.entryMountHigh ?? null,
    islandLength: body?.islandLength ?? null,
  };

  const last = await prisma.unitSelectionSurvey.findFirst({
    where: { projectId: params.id },
    orderBy: { version: 'desc' },
    select: { version: true },
  });

  const facts = await resolveFacts(params.id, overrides);
  const survey = await prisma.unitSelectionSurvey.create({
    data: {
      projectId: params.id,
      version: (last?.version || 0) + 1,
      status: 'DRAFT',
      factsSnapshot: freeze(facts, overrides),
      styleSeed: body?.styleSeed ? String(body.styleSeed) : null,
      createdById: user.id,
    },
    select: { id: true, version: true, status: true, createdAt: true },
  });

  return NextResponse.json({ survey, facts }, { status: 201 });
}

/**
 * Change what the survey assumes, and refreeze.
 *
 * Only the fields that were sent. Targets merge into the ones already typed, so
 * changing the pendant target does not silently un-type the fan target.
 */
export async function PATCH(request, { params }) {
  const { user, error } = await requireAuth(request);
  if (error) return error;
  const project = await canAccess(params.id, user);
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  let body; try { body = await request.json(); } catch { body = {}; }

  const survey = await prisma.unitSelectionSurvey.findFirst({
    where: { projectId: params.id },
    orderBy: { version: 'desc' },
    select: { id: true, factsSnapshot: true, status: true },
  });
  if (!survey) return NextResponse.json({ error: 'There is no survey on this job yet.' }, { status: 404 });

  const current = overridesFrom(survey);
  const overrides = {
    targets: { ...current.targets, ...(body?.targets || {}) },
    entryMountHigh: body?.entryMountHigh === undefined ? current.entryMountHigh : body.entryMountHigh,
    islandLength: body?.islandLength === undefined ? current.islandLength : body.islandLength,
  };
  // A blank box means "go back to what the job says", not "target nothing".
  for (const [k, v] of Object.entries(overrides.targets)) {
    if (v === '' || v === null) delete overrides.targets[k];
  }

  const data = { factsSnapshot: freeze(await resolveFacts(params.id, overrides), overrides) };
  if (body?.status && ['DRAFT', 'SENT', 'CLOSED'].includes(body.status)) {
    data.status = body.status;
    data.closedAt = body.status === 'CLOSED' ? new Date() : null;
  }
  if (body?.styleSeed !== undefined) data.styleSeed = body.styleSeed ? String(body.styleSeed) : null;

  await prisma.unitSelectionSurvey.update({ where: { id: survey.id }, data });

  return NextResponse.json({ ok: true });
}
