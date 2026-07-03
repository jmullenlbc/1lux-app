import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

// GET /api/pipeline
// Lists projects as pipeline entities (Deal merged into Project). The client
// derives board membership from serviceType and reads the per-board stage.
export async function GET(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const projects = await prisma.project.findMany({
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true, projectNumber: true, name: true, city: true, state: true,
      buildingType: true, serviceType: true, projectType: true,
      contractValue: true, designContractValue: true,
      procurementStage: true, designStage: true,
      pipelineProbability: true, procurementStatus: true, designStatus: true, expectedOrderDate: true,
      updatedAt: true,
      salesOwner:  { select: { id: true, name: true } },
      client:      { select: { id: true, name: true } },
      projectData: { select: { numUnits: true } },
    },
  });

  return NextResponse.json({ projects });
}
