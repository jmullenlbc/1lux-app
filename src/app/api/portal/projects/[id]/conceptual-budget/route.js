import { NextResponse } from 'next/server';
import { requirePortalAuth } from '@/lib/portalAuth';
import { prisma } from '@/lib/db';
import { responsesToSections } from '@/lib/utils';
import { calculateBudget } from '@/lib/calculations';
import { loadPricing } from '@/lib/pricingLoader';

export const dynamic = 'force-dynamic';

export async function GET(req, { params }) {
  const { portalUser, error } = await requirePortalAuth();
  if (error) return error;

  const contact = await prisma.projectExternalContact.findFirst({
    where: {
      project_id: params.id,
      portalUserId: portalUser.portalUserId,
      acceptedAt: { not: null },
    },
  });

  if (!contact?.canViewBudgets) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  }

  const project = await prisma.project.findUnique({
    where: { id: params.id },
    include: { projectData: true, responses: true },
  });

  // Return null budget if no project data or no grossSf entered yet
  if (!project?.projectData?.grossSf) {
    return NextResponse.json({ budget: null });
  }

  const pricing = project.pricingSnapshot
    ? JSON.parse(project.pricingSnapshot)
    : await loadPricing();

  const sections = responsesToSections(project.responses);
  const projectData = { ...project.projectData, buildingTypeKey: project.buildingType };
  const budget = calculateBudget(projectData, sections, pricing);

  return NextResponse.json({
    budget: {
      totalWithControls: budget.totalWithControls,
      subtotalLightingOnly: budget.subtotalLightingOnly,
      controlsTotal: budget.controlsTotal,
      perSf: budget.perSf,
      perUnit: budget.perUnit,
      budgetType: project.budgetType,
    },
  });
}
