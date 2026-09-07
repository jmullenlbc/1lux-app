import { NextResponse } from 'next/server';
import { requireAuth, isAnyAdmin } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { LINE_KEYS } from '@/lib/calibration/lines';
import { captureProject } from '@/lib/calibration/capture';

export const dynamic = 'force-dynamic';

// POST /api/calibration/actuals { projectId, lineKey, actualAmount, note? }
// Records what a line really cost (or what Mike priced it at by hand) next
// to the engine's latest model figure for that line. One 'actual' row per
// project+line — a new one replaces the old.
export async function POST(request) {
  const { user, error } = await requireAuth();
  if (error) return error;
  if (!isAnyAdmin(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const b = await request.json().catch(() => ({}));
  const projectId = String(b.projectId || '');
  const lineKey   = String(b.lineKey || '');
  const actual    = Number(b.actualAmount);
  if (!projectId || !LINE_KEYS.includes(lineKey)) return NextResponse.json({ error: 'projectId and a known lineKey are required' }, { status: 400 });
  if (!Number.isFinite(actual) || actual <= 0)     return NextResponse.json({ error: 'actualAmount must be a positive number' }, { status: 400 });

  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  // Make sure the engine row is fresh so the actual sits beside today's model.
  await captureProject(projectId);
  const model = await prisma.calibrationSample.findFirst({
    where: { projectId, lineKey, source: 'engine' }, orderBy: { capturedAt: 'desc' },
  });

  const row = await prisma.$transaction(async (tx) => {
    await tx.calibrationSample.deleteMany({ where: { projectId, lineKey, source: 'actual' } });
    return tx.calibrationSample.create({
      data: {
        projectId, lineKey, source: 'actual',
        quantity:        model?.quantity ?? null,
        quantityUnit:    model?.quantityUnit ?? null,
        modelAmount:     model?.modelAmount ?? 0,
        actualAmount:    actual,
        rateUsed:        model?.rateUsed ?? null,
        impliedRate:     model?.quantity ? actual / model.quantity : null,
        buildingType:    model?.buildingType ?? null,
        siteDesignLevel: model?.siteDesignLevel ?? null,
        note:            [b.note ? String(b.note).slice(0, 500) : null, model?.note].filter(Boolean).join(' · ') || null,
      },
    });
  });
  return NextResponse.json({ sample: row });
}
