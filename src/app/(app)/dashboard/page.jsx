export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { projectScopeWhere } from '@/lib/projectScope';
import { prisma } from '@/lib/db';
import { calculateBudget } from '@/lib/calculations';
import { loadPricing, pricingForProject } from '@/lib/pricingLoader';
import { responsesToSections } from '@/lib/utils';
import DashboardClient from './DashboardClient';
import { SITE_FEATURE_INCLUDE, engineProjectData } from '@/lib/siteFeatureRows';

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  // Projects are visible to all ILC staff; Client Viewers stay scoped to their own.
  const where = projectScopeWhere(session);

  const projects = await prisma.project.findMany({
    where,
    include: {
      projectData: true,
      responses:   true,
      ...SITE_FEATURE_INCLUDE,
      client:      { select: { id: true, name: true, type: true } },
      assignees:   { include: { user: { select: { id: true, name: true, email: true } } } },
      createdBy:   { select: { id: true, name: true, email: true } },
    },
    orderBy: { updatedAt: 'desc' },
  });

  // Load active pricing once; each project uses its frozen snapshot if present,
  // else falls back to active. This MUST match the project hub / wizard / summary
  // pages, which all do snapshot-or-active + buildingTypeKey injection. Without
  // this, the dashboard total diverges from the project's own pages.
  const activePricing = await loadPricing();

  const hydrated = projects.map(p => {
    const sections    = responsesToSections(p.responses);
    const pricing     = pricingForProject(p.pricingSnapshot, activePricing);
    const projectData = engineProjectData(p);
    const budget      = calculateBudget(projectData, sections, pricing);
    return {
      ...p,
      budget,
      responses:      undefined,
      completedSteps: JSON.parse(p.completedSteps || '[]'),
      assignees:      p.assignees.map(a => a.user),
    };
  });

  return <DashboardClient projects={hydrated} user={session} />;
}
