import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { guessSuggestions, currentGuess } from '@/lib/calibration/figureNorms';
import { loadFigureNorms, loadAdoptedGuesses, forgetFigureCaches } from '@/lib/calibration/figureNormsLoad';

export const dynamic = 'force-dynamic';

// POST /api/calibration/confirm-guess { guessKey, buildingType, undo? }
// "Use this" on the Pre-Con dashboard (Mike 2026-09-24: "suggest, but let
// humans confirm"). The value is recomputed here from our real jobs, never
// taken from the browser. undo archives the adopted figure, so the built-in
// guess applies again. Archive-only: nothing is deleted. Same gate as apply-rate.
export async function POST(request) {
  const { user, error } = await requireAuth();
  if (error) return error;
  if (user.role !== 'ILC_ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const b = await request.json().catch(() => ({}));
  const guessKey = String(b.guessKey || '');
  const buildingType = String(b.buildingType || '');
  if (!guessKey || !buildingType) return NextResponse.json({ error: 'guessKey and buildingType are required' }, { status: 400 });

  const live = { guessKey, buildingType, archivedAt: null };
  if (b.undo) {
    const { count } = await prisma.confirmedGuess.updateMany({ where: live, data: { archivedAt: new Date() } });
    forgetFigureCaches();
    return NextResponse.json({ undone: count });
  }

  forgetFigureCaches();
  const row = guessSuggestions(await loadFigureNorms(), await loadAdoptedGuesses())
    .find(r => r.guessKey === guessKey && r.buildingType === buildingType);
  if (!row?.canAdopt) return NextResponse.json({ error: 'Not enough real jobs behind that figure, or it already matches' }, { status: 409 });

  const previous = await prisma.confirmedGuess.findFirst({ where: live, orderBy: { confirmedAt: 'desc' } });
  await prisma.$transaction([
    prisma.confirmedGuess.updateMany({ where: live, data: { archivedAt: new Date() } }),
    prisma.confirmedGuess.create({
      data: { guessKey, buildingType, value: row.learnedValue, previousValue: previous?.value ?? currentGuess(row.field, buildingType), jobs: row.jobs, confirmedById: user.id },
    }),
  ]);
  forgetFigureCaches();
  return NextResponse.json({ guessKey, buildingType, value: row.learnedValue, shown: row.learned, jobs: row.jobs });
}
