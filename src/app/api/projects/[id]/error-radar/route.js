import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { NOT_CO_VERSION } from '@/lib/budgetVersions';
import { runHumanErrorRadar } from '@/lib/humanErrorRadar';

export async function GET(request, { params }) {
  const { error } = await requireAuth();
  if (error) return error;

  const projectId = params.id;

  const [scheduleData, takeoffFile, bidMatrix] = await Promise.all([
    prisma.fixtureSchedule.findFirst({
      where: { projectId, state: 'DRAFT' },
      include: { items: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] } },
    }),
    prisma.projectFile.findFirst({
      where: { projectId, takeoffData: { not: null } },
      orderBy: { createdAt: 'desc' },
      select: { takeoffData: true, originalName: true, createdAt: true },
    }),
    prisma.designBidMatrix.findFirst({
      where: { projectId, ...NOT_CO_VERSION },
      orderBy: { version: 'desc' },
      include: {
        items: {
          where: { isArchived: false },
          orderBy: { sortOrder: 'asc' },
        },
      },
    }),
  ]);

  const items = scheduleData?.items ?? [];
  const takeoffRaw = takeoffFile?.takeoffData ? JSON.parse(takeoffFile.takeoffData) : null;

  const result = runHumanErrorRadar(items, takeoffRaw, bidMatrix);

  return NextResponse.json({
    ...result,
    meta: {
      hasSchedule: items.length > 0,
      fixtureCount: items.filter(i => !i.isAlternate).length,
      hasTakeoff:  !!takeoffRaw,
      hasBidMatrix: !!bidMatrix,
      takeoffFile: takeoffFile ? { name: takeoffFile.originalName } : null,
      bidMatrixVersion: bidMatrix?.version ?? null,
    },
  });
}
