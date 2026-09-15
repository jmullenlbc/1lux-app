import { NextResponse } from 'next/server';
import { requireAuth, canSeeAllData } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { assertNoIlcOnly } from '@/lib/redact';
import { gatherMeetingFacts } from '@/lib/meetingPrep/gather';
import { buildFactBlocks } from '@/lib/meetingPrep/brief';
import { draftTalkingPoints } from '@/lib/meetingPrep/talkingPoints';
import { budgetTotals } from '@/lib/meetingPrep/budgets';

export const dynamic = 'force-dynamic';

// Meeting Prep on a sales note (migration 0082). Internal only: a CLIENT_VIEWER
// never gets a brief. A brief can show sell figures — budgets, product sale
// totals, design fees (Mike, 2026-09-14) — but never DN or any buy price.

const BRIEF_INCLUDE = {
  facts:  { orderBy: [{ block: 'asc' }, { position: 'asc' }] },
  points: { orderBy: { position: 'asc' }, include: { citations: { select: { factId: true } } } },
};

function shape(brief) {
  if (!brief) return null;
  const refById = Object.fromEntries(brief.facts.map(f => [f.id, f.ref]));
  const facts = brief.facts
    .map(f => ({ id: f.id, ref: f.ref, block: f.block, text: f.text }))
    .sort((a, b) => Number(a.ref.slice(1)) - Number(b.ref.slice(1)));
  const out = {
    id: brief.id,
    status: brief.status,
    error: brief.error,
    createdAt: brief.createdAt,
    facts,
    points: brief.points.map(p => ({
      id: p.id,
      text: p.text,
      refs: p.citations.map(c => refById[c.factId]).filter(Boolean)
        .sort((a, b) => Number(a.slice(1)) - Number(b.slice(1))),
    })),
  };
  assertNoIlcOnly(out, 'meeting brief');
  return out;
}

async function gate(params) {
  const { user, error } = await requireAuth();
  if (error) return { error };
  if (!canSeeAllData(user)) {
    return { error: NextResponse.json({ error: 'Not available' }, { status: 403 }) };
  }
  const note = await prisma.note.findUnique({
    where: { id: params.id },
    select: { id: true, noteType: true, title: true, meetingDate: true, activityType: true, projectId: true },
  });
  if (!note) return { error: NextResponse.json({ error: 'Not found' }, { status: 404 }) };
  return { user, note };
}

// GET — the latest brief for this note, or null.
export async function GET(request, { params }) {
  const { error } = await gate(params);
  if (error) return error;
  const brief = await prisma.meetingBrief.findFirst({
    where: { noteId: params.id },
    orderBy: { createdAt: 'desc' },
    include: BRIEF_INCLUDE,
  });
  return NextResponse.json({ brief: shape(brief) });
}

// POST — build a new brief: gather facts, ask for talking points, save both.
export async function POST(request, { params }) {
  const { user, note, error } = await gate(params);
  if (error) return error;
  if (note.noteType === 'PROJECT_MEETING') {
    return NextResponse.json({ error: 'Meeting prep is for sales notes.' }, { status: 400 });
  }

  const raw = await gatherMeetingFacts(prisma, note.id, new Date(), { budgetFor: budgetTotals });
  if (!raw || raw.empty) {
    return NextResponse.json(
      { error: 'Link a company, project or person to this note first, so there is something to prep from.' },
      { status: 400 },
    );
  }

  const facts = buildFactBlocks(raw, new Date());

  let points = [];
  let model = null;
  let aiError = null;
  try {
    ({ points, model } = await draftTalkingPoints(facts, note, { projectId: note.projectId || null, userId: user.id }));
  } catch (e) {
    console.error('[meeting-prep] talking points failed:', e?.message ?? e);
    aiError = 'the AI step did not answer';
  }
  const status = points.length ? 'ok' : aiError ? 'error' : 'no_points';

  const briefId = await prisma.$transaction(async tx => {
    const brief = await tx.meetingBrief.create({
      data: {
        noteId: note.id,
        createdById: user.id,
        status,
        model,
        error: aiError,
        facts: {
          create: facts.map(f => ({
            ref: f.ref, block: f.block, position: f.position, text: f.text,
            sourceKind: f.sourceKind, sourceId: f.sourceId,
          })),
        },
      },
      include: { facts: { select: { id: true, ref: true } } },
    });
    const idByRef = Object.fromEntries(brief.facts.map(f => [f.ref, f.id]));
    for (const [position, p] of points.entries()) {
      const factIds = [...new Set(p.refs.map(r => idByRef[r]).filter(Boolean))];
      if (!factIds.length) continue;
      await tx.meetingBriefPoint.create({
        data: {
          briefId: brief.id,
          position,
          text: p.text,
          citations: { create: factIds.map(factId => ({ factId })) },
        },
      });
    }
    return brief.id;
  });

  const saved = await prisma.meetingBrief.findUnique({ where: { id: briefId }, include: BRIEF_INCLUDE });
  return NextResponse.json({ brief: shape(saved) });
}
