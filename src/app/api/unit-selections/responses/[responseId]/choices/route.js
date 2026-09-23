/**
 * One click on one fixture.
 *
 * ── One pick per category ───────────────────────────────────────────────────
 * A person picks ONE fixture per category. Picking a second replaces the first
 * rather than adding to it, because reconcileCategory counts picks across
 * people and a respondent who picked two pendants would quietly outvote
 * everybody else.
 *
 * A REJECT is different — a person may cross off as many as they like. It is
 * kept because "they hated the caged lantern" is worth as much as what they
 * chose, and it is what a divergence row has to be able to say.
 *
 * Clicking the same thing twice undoes it. Nothing here writes to the fixture
 * pool, and a choice on a retired fixture is left alone: the fixture stopped
 * being offered, it did not stop having been chosen.
 */
import { NextResponse } from 'next/server';
import { requireAuth, canSeeAllData } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { CATEGORY_KEYS, deriveFinish, fanFinish, loadResponseForUser, RESPONSE_SHAPE } from '@/lib/unitSelections';

export const dynamic = 'force-dynamic';

async function reload(responseId) {
  const response = await prisma.unitSelectionResponse.findUnique({
    where: { id: responseId },
    select: RESPONSE_SHAPE,
  });
  const derived = deriveFinish(response);
  return { response, finish: { derived, fan: fanFinish(response, derived) } };
}

export async function POST(request, { params }) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  const existing = await loadResponseForUser(params.responseId, user, canSeeAllData(user));
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (existing.survey?.status === 'CLOSED') {
    return NextResponse.json({ error: 'This survey is closed.' }, { status: 409 });
  }

  let body; try { body = await request.json(); } catch { body = {}; }

  const category = String(body?.category || '');
  if (!CATEGORY_KEYS.includes(category)) {
    return NextResponse.json({ error: 'That is not one of the five fixtures.' }, { status: 400 });
  }

  const optionId = String(body?.optionId || '');
  const option = optionId
    ? await prisma.decorativeOption.findUnique({ where: { id: optionId }, select: { id: true, category: true } })
    : null;
  if (!option) return NextResponse.json({ error: 'That fixture is not here any more.' }, { status: 404 });
  if (option.category !== category) {
    return NextResponse.json({ error: 'That fixture belongs to a different category.' }, { status: 400 });
  }

  const kind = body?.kind === 'REJECT' ? 'REJECT' : 'PICK';
  const finishKey = body?.finishKey ? String(body.finishKey) : null;

  const already = await prisma.unitSelectionChoice.findUnique({
    where: { responseId_category_optionId: { responseId: params.responseId, category, optionId } },
    select: { id: true, kind: true, finishKey: true },
  });

  // Clicking the same button again takes it back. Changing the finish on a
  // fixture already picked is a change, not an undo.
  if (already && already.kind === kind && (kind === 'REJECT' || already.finishKey === finishKey)) {
    await prisma.unitSelectionChoice.delete({ where: { id: already.id } });
    return NextResponse.json(await reload(params.responseId));
  }

  if (kind === 'PICK') {
    // One pick per category. Rejects in the same category are left alone.
    await prisma.unitSelectionChoice.deleteMany({
      where: { responseId: params.responseId, category, kind: 'PICK', NOT: { optionId } },
    });
  }

  await prisma.unitSelectionChoice.upsert({
    where: { responseId_category_optionId: { responseId: params.responseId, category, optionId } },
    create: { responseId: params.responseId, category, optionId, kind, finishKey },
    update: { kind, finishKey },
  });

  return NextResponse.json(await reload(params.responseId));
}
