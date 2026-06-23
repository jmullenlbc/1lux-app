import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { logActivity, diffResponses, describeQuestionnaireChange } from '@/lib/activity';

export async function GET(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const project = await prisma.project.findUnique({ where: { id: params.id } });
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (user.role !== 'ILC_ADMIN' && project.createdById !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const responses = await prisma.questionnaireResponse.findMany({
    where: { projectId: params.id },
  });

  return NextResponse.json({ responses });
}

export async function PUT(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const project = await prisma.project.findUnique({ where: { id: params.id } });
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (user.role !== 'ILC_ADMIN' && project.createdById !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json();
  // body: { section: string, responses: { [questionKey]: answerValue } }
  const { section, responses } = body;

  if (!section || !responses) {
    return NextResponse.json({ error: 'section and responses required' }, { status: 400 });
  }

  // Fetch existing values for this section to diff against
  const existing = await prisma.questionnaireResponse.findMany({
    where: { projectId: params.id, section },
  });
  const existingByKey = Object.fromEntries(existing.map(r => [r.questionKey, r.answerValue]));

  // Preserve-on-blank semantics, same fix as /api/projects/[id]/data:
  // skip writes that would replace a meaningful existing value with a
  // blank one. Stale wizard sections were silently wiping responses
  // like exterior.exteriorManualItems (Sean's $75K manual adder on
  // APPROACH II, lost 2026-06-22) when the form re-mounted with empty
  // defaults and then sent everything on Save & Continue.
  //
  // "Blank" here = '' or '{}' (empty JSON object — how the form
  // serializes an untouched manualItems map). If existing value is
  // already blank, write the new blank (no harm). If existing was
  // meaningful and new is blank, skip — preserve the meaningful value.
  function isBlank(v) {
    if (v === null || v === undefined) return true;
    const s = String(v).trim();
    return s === '' || s === '{}';
  }

  const upserts = Object.entries(responses)
    .filter(([questionKey, answerValue]) => {
      if (!isBlank(answerValue)) return true;
      // New value is blank. Only allow it if existing was also blank.
      return isBlank(existingByKey[questionKey]);
    })
    .map(([questionKey, answerValue]) =>
      prisma.questionnaireResponse.upsert({
        where: {
          projectId_section_questionKey: {
            projectId: params.id,
            section,
            questionKey,
          },
        },
        update:  { answerValue: String(answerValue ?? '') },
        create:  { projectId: params.id, section, questionKey, answerValue: String(answerValue ?? '') },
      })
    );

  await prisma.$transaction(upserts);

  // Compute diff and log
  const changedLabels = diffResponses(existing, responses);
  const description   = describeQuestionnaireChange(section, changedLabels, project.budgetType);
  await logActivity(params.id, user, 'questionnaire', description, { section, changed: changedLabels });

  const all = await prisma.questionnaireResponse.findMany({
    where: { projectId: params.id },
  });

  return NextResponse.json({ responses: all });
}
