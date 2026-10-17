import { NextResponse } from 'next/server';
import { requireAuth, canSeeAllData } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { FIGURES } from '@/lib/calibration/figureNorms';
import { loadFigureNorms, loadAdoptedGuesses, forgetFigureCaches } from '@/lib/calibration/figureNormsLoad';

export const dynamic = 'force-dynamic';

// Staff only: the ranges are our background data (Mike 2026-09-17) and never
// reach a contractor. CLIENT_VIEWER gets a 404, same as a project it can't see.
async function gate(request, projectId) {
  const { user, error } = await requireAuth(request);
  if (error) return { error };
  if (!canSeeAllData(user)) return { error: NextResponse.json({ error: 'Not found' }, { status: 404 }) };
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true, buildingType: true } });
  if (!project) return { error: NextResponse.json({ error: 'Not found' }, { status: 404 }) };
  return { user, project };
}

// GET, what the on-screen alerts need for this project: this building type's
// ranges, adopted stand-ins, and which figures somebody already marked right.
export async function GET(request, { params }) {
  const { error, project } = await gate(request, params.id);
  if (error) return error;
  const [norms, adopted, sources] = await Promise.all([
    loadFigureNorms(), loadAdoptedGuesses(),
    prisma.projectFigureSource.findMany({ where: { projectId: project.id }, select: { field: true, source: true, confirmedAt: true } }),
  ]);
  const type = project.buildingType;
  return NextResponse.json({
    buildingType: type,
    norms: type && norms[type] ? { [type]: norms[type] } : {},
    adopted,
    confirmed: sources.filter(s => s.confirmedAt).map(s => s.field),
  });
}

// POST { field }, "It's right": the person checked an alerted figure. It
// stops alerting, and it counts as a real number for learning even if the
// visitor typed it.
export async function POST(request, { params }) {
  const { error, user, project } = await gate(request, params.id);
  if (error) return error;
  const b = await request.json().catch(() => ({}));
  const field = String(b.field || '');
  if (!FIGURES[field]) return NextResponse.json({ error: 'Unknown figure' }, { status: 400 });
  const now = new Date();
  await prisma.projectFigureSource.upsert({
    where: { projectId_field: { projectId: project.id, field } },
    update: { confirmedAt: now, confirmedById: user.id },
    create: { projectId: project.id, field, source: 'staff', setById: user.id, confirmedAt: now, confirmedById: user.id },
  });
  forgetFigureCaches();
  return NextResponse.json({ field, confirmed: true });
}
