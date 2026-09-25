import { NextResponse } from 'next/server';
import { requireAuth, canSeeAllData } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { AREAS } from '@/lib/calibration/areaNorms';
import { loadAreaNorms, loadAreaChecks } from '@/lib/calibration/areaNormsLoad';

export const dynamic = 'force-dynamic';

// Staff only, like /figures: the ranges are our background data (Mike
// 2026-09-17). CLIENT_VIEWER gets a 404, same as a project it can't see.
async function gate(request, projectId) {
  const { user, error } = await requireAuth(request);
  if (error) return { error };
  if (!canSeeAllData(user)) return { error: NextResponse.json({ error: 'Not found' }, { status: 404 }) };
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true, buildingType: true } });
  if (!project) return { error: NextResponse.json({ error: 'Not found' }, { status: 404 }) };
  return { user, project };
}

// GET — this building type's area ranges ($ per unit) and this project's
// original-questionnaire snapshot + "It's right" marks.
export async function GET(request, { params }) {
  const { error, project } = await gate(request, params.id);
  if (error) return error;
  const type = project.buildingType;
  const [norms, checks] = await Promise.all([loadAreaNorms(type), loadAreaChecks(project.id)]);
  return NextResponse.json({ buildingType: type, norms: type && norms[type] ? { [type]: norms[type] } : {}, checks });
}

// POST { area, amount } — "It's right": the area's dollars were looked at.
// It stays quiet until the area moves off that figure again.
export async function POST(request, { params }) {
  const { error, user, project } = await gate(request, params.id);
  if (error) return error;
  const b = await request.json().catch(() => ({}));
  const area = String(b.area || '');
  const amount = Number(b.amount);
  if (!AREAS[area]) return NextResponse.json({ error: 'Unknown area' }, { status: 400 });
  if (!Number.isFinite(amount) || amount < 0) return NextResponse.json({ error: 'Bad amount' }, { status: 400 });
  const ok = { okAmount: amount, okAt: new Date(), okById: user.id };
  await prisma.projectAreaCheck.upsert({
    where: { projectId_area: { projectId: project.id, area } },
    update: ok,
    create: { projectId: project.id, area, ...ok },
  });
  return NextResponse.json({ area, okAmount: amount });
}
