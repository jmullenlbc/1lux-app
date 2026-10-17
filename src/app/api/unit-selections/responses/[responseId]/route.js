/**
 * One person's answers: the settings around the picks, and handing it in.
 *
 * The picks themselves are next door in ./choices, because they save one click
 * at a time and this route saves a whole form.
 *
 * `finish` is not stored as an answer anybody gives. It is worked out from what
 * they picked, see deriveFinish, and `finishOverride` is the escape hatch for
 * when a person says outright "make it all bronze". Fans stay white unless
 * somebody says otherwise, which is `fanHoldWhite`.
 */
import { NextResponse } from 'next/server';
import { requireAuth, canSeeAllData } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { deriveFinish, fanFinish, loadResponseForUser, RESPONSE_SHAPE } from '@/lib/unitSelections';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  const response = await loadResponseForUser(params.responseId, user, canSeeAllData(user));
  if (!response) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const derived = deriveFinish(response);
  return NextResponse.json({
    response: { ...response, survey: undefined },
    finish: { derived, fan: fanFinish(response, derived) },
  });
}

export async function PATCH(request, { params }) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  const existing = await loadResponseForUser(params.responseId, user, canSeeAllData(user));
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  let body; try { body = await request.json(); } catch { body = {}; }

  const data = {};
  if (body.respondentName !== undefined) {
    const name = String(body.respondentName).trim();
    if (!name) return NextResponse.json({ error: 'Who is answering?' }, { status: 400 });
    data.respondentName = name;
  }
  if (body.styleChoice !== undefined)    data.styleChoice = body.styleChoice ? String(body.styleChoice) : null;
  if (body.finishOverride !== undefined) data.finishOverride = body.finishOverride ? String(body.finishOverride) : null;
  if (body.fanHoldWhite !== undefined)   data.fanHoldWhite = !!body.fanHoldWhite;
  // Notes are {category: "free text"}. Whatever is sent replaces the lot
  // the screen always holds the whole object.
  if (body.notes !== undefined) {
    data.notes = typeof body.notes === 'string' ? body.notes : JSON.stringify(body.notes || {});
  }
  // Handing it in, and taking it back. Nothing is locked on submit; a person
  // who says "wait, the bronze one" should not need a new response row.
  if (body.submitted !== undefined) data.submittedAt = body.submitted ? new Date() : null;

  const response = await prisma.unitSelectionResponse.update({
    where: { id: params.responseId },
    data,
    select: RESPONSE_SHAPE,
  });

  const derived = deriveFinish(response);
  return NextResponse.json({ response, finish: { derived, fan: fanFinish(response, derived) } });
}

export async function DELETE() {
  return NextResponse.json(
    { error: 'Answers are never deleted. If somebody should not have been asked, start a new version of the survey.' },
    { status: 405 },
  );
}
