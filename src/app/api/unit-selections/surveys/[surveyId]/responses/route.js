/**
 * Add somebody to a survey.
 *
 * A response is one person's run through the five fixtures. Internally that is
 * usually an ILC designer filling it in on a call; later the same row is what a
 * share link points at, which is why every response already carries its own
 * shareToken even though nothing outside ILC can reach it yet.
 *
 * Staff only, and the survey has to belong to a project this person can see.
 */
import { NextResponse } from 'next/server';
import { requireAuth, canSeeAllData } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { RESPONSE_SHAPE } from '@/lib/unitSelections';

export const dynamic = 'force-dynamic';

const ROLES = ['DEVELOPER', 'ARCHITECT', 'INTERIOR_DESIGNER', 'ILC'];

export async function POST(request, { params }) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  const survey = await prisma.unitSelectionSurvey.findUnique({
    where: { id: params.surveyId },
    select: { id: true, status: true, project: { select: { id: true, createdById: true } } },
  });
  if (!survey) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!canSeeAllData(user) && survey.project?.createdById !== user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (survey.status === 'CLOSED') {
    return NextResponse.json(
      { error: 'This survey is closed. Start a new version to take more answers.' },
      { status: 409 },
    );
  }

  let body; try { body = await request.json(); } catch { body = {}; }

  // `{me: true}`, the person signed in, answering for themselves. Nobody types
  // a name; the same row comes back every time they open the survey.
  if (body?.me) {
    const mine = await prisma.unitSelectionResponse.findFirst({
      where: { surveyId: survey.id, userId: user.id },
      orderBy: { createdAt: 'asc' },
      select: RESPONSE_SHAPE,
    });
    if (mine) return NextResponse.json({ response: mine });
    const created = await prisma.unitSelectionResponse.create({
      data: {
        surveyId: survey.id,
        userId: user.id,
        respondentName: user.name || user.email,
        respondentRole: 'ILC',
        startedAt: new Date(),
      },
      select: RESPONSE_SHAPE,
    });
    return NextResponse.json({ response: created }, { status: 201 });
  }

  // Otherwise: answering for somebody else in the room, by name.
  const respondentName = String(body?.respondentName || '').trim();
  if (!respondentName) return NextResponse.json({ error: 'Who is answering?' }, { status: 400 });

  const respondentRole = ROLES.includes(body?.respondentRole) ? body.respondentRole : 'ILC';

  const response = await prisma.unitSelectionResponse.create({
    data: {
      surveyId: survey.id,
      respondentName,
      respondentRole,
      contactId: body?.contactId ? String(body.contactId) : null,
      styleChoice: body?.styleChoice ? String(body.styleChoice) : null,
      startedAt: new Date(),
    },
    select: RESPONSE_SHAPE,
  });

  return NextResponse.json({ response }, { status: 201 });
}
