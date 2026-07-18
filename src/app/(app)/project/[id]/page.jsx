export const dynamic = 'force-dynamic';

import { notFound, redirect } from 'next/navigation';
import { getSession, isClientViewer } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { responsesToSections } from '@/lib/utils';
import { calculateBudget } from '@/lib/calculations';
import { loadPricing } from '@/lib/pricingLoader';
import ProjectHubClient from './ProjectHubClient';

export default async function ProjectHubPage({ params }) {
  const session = await getSession();
  if (!session) redirect('/login');

  const project = await prisma.project.findUnique({
    where: { id: params.id },
    include: {
      projectData: true,
      responses: true,
      client: true,
      peerReviewItems: { orderBy: [{ section: 'asc' }, { sortOrder: 'asc' }] },
      assignees: { include: { user: { select: { id: true, name: true, email: true } } } },
    },
  });

  if (!project) notFound();
  // Every ILC staff member can open any project; Client Viewers stay scoped to their own.
  if (isClientViewer(session.role) && project.createdById !== session.id) notFound();

  const pricing = project.pricingSnapshot
    ? JSON.parse(project.pricingSnapshot)
    : await loadPricing();

  const sections    = responsesToSections(project.responses);
  const projectData = { ...(project.projectData || {}), buildingTypeKey: project.buildingType };
  const budget      = calculateBudget(projectData, sections, pricing);

  const peerReviewTotal = project.peerReviewItems.reduce(
    (s, item) => s + (item.totalSavings || 0), 0
  );

  const projectFiles = await prisma.projectFile.findMany({
    where: { projectId: params.id },
    include: { uploadedBy: { select: { name: true, email: true } } },
    orderBy: { createdAt: 'desc' },
  });

  const clients = await prisma.client.findMany({
    select: { id: true, name: true, type: true, locationType: true },
    orderBy: { name: 'asc' },
  });

  const allUsers = await prisma.user.findMany({
    select: { id: true, name: true, email: true },
    orderBy: { name: 'asc' },
  });

  const masterTypes = prisma.masterType
    ? await prisma.masterType.findMany({
        where: { is_active: true },
        select: { code: true, fixture_family: true, symbol_svg: true, is_unit_type: true },
        orderBy: { code: 'asc' },
      })
    : [];

  const diResp = (project.responses || []).filter(r => r.section === 'design-info');
  const dmRaw  = diResp.find(r => r.questionKey === 'designMilestones')?.answerValue;
  const initialDesignInfo = {
    codes:            diResp.find(r => r.questionKey === 'codes')?.answerValue     || '',
    revitYear:        diResp.find(r => r.questionKey === 'revitYear')?.answerValue || '',
    designMilestones: dmRaw ? (() => { try { return JSON.parse(dmRaw); } catch { return null; } })() : null,
  };

  return (
    <ProjectHubClient
      userId={session.id}
      userRole={session.role}
      project={{
        ...project,
        responses:      undefined,
        completedSteps: JSON.parse(project.completedSteps || '[]'),
        assignees:      project.assignees.map(a => a.user),
      }}
      budget={budget}
      peerReviewTotal={peerReviewTotal}
      clients={clients}
      allUsers={allUsers}
      initialFiles={projectFiles}
      initialDesignInfo={initialDesignInfo}
      masterTypes={masterTypes}
    />
  );
}
