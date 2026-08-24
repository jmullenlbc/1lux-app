import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';

async function canAccess(projectId, user) {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return false;
  return isSuperAdmin(user.role) || user.role === 'SUPER_ADMIN' || project.createdById === user.id;
}

export async function GET(request, { params }) {
  const { user, error } = await requireAuth(request);
  if (error) return error;
  if (!await canAccess(params.id, user)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const [unitTypes, sourceFile, projectData] = await Promise.all([
    prisma.projectUnitType.findMany({
      where: { projectId: params.id },
      orderBy: { sortOrder: 'asc' },
    }),
    prisma.projectFile.findFirst({
      where: { projectId: params.id, tab: 'unit-matrix' },
      orderBy: { createdAt: 'desc' },
      select: { id: true, originalName: true, createdAt: true, analysisData: true },
    }),
    prisma.projectData.findUnique({
      where: { projectId: params.id },
      select: { numUnits: true, unitsSf: true, numBedrooms: true, numBathrooms: true, numBalconies: true, grossSf: true },
    }),
  ]);

  return NextResponse.json({ unitTypes, sourceFile, projectData });
}
