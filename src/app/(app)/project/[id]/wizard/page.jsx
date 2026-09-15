export const dynamic = 'force-dynamic';

import { notFound, redirect } from 'next/navigation';
import { getSession, isClientViewer } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { responsesToSections } from '@/lib/utils';
import { calculateBudget } from '@/lib/calculations';
import { loadPricing, pricingForProject } from '@/lib/pricingLoader';
import WizardClient from '../WizardClient';
import DesignWizardClient from '../DesignWizardClient';
import PeerReviewClient from '../PeerReviewClient';

export default async function ProjectWizardPage({ params }) {
  const session = await getSession();
  if (!session) redirect('/login');

  const project = await prisma.project.findUnique({
    where: { id: params.id },
    include: {
      projectData:    true,
      responses:      true,
      peerReviewItems: { orderBy: [{ section: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }] },
      client:         true,
      createdBy:      { select: { id: true, name: true, email: true } },
    },
  });

  if (!project) notFound();
  if (isClientViewer(session.role) && project.createdById !== session.id) notFound();

  const pricing = pricingForProject(project.pricingSnapshot, await loadPricing());

  const sections       = responsesToSections(project.responses);
  const projectData    = { ...(project.projectData || {}), buildingTypeKey: project.buildingType };
  const budget         = calculateBudget(projectData, sections, pricing);
  const completedSteps = JSON.parse(project.completedSteps || '[]');

  // Small vs long breezeway can only be judged off the drawings (Mike
  // 2026-09-14), so the Corridors screens ask it only when a set is on file.
  const [drawingSets, drawingFiles] = await Promise.all([
    prisma.drawingSubmission.count({ where: { projectId: project.id, archivedAt: null } }).catch(() => 0),
    prisma.projectFile.count({ where: { projectId: project.id, tab: 'drawings', archivedAt: null } }).catch(() => 0),
  ]);
  const hasDrawings = drawingSets + drawingFiles > 0;

  const sharedProps = {
    project: { ...project, completedSteps, responses: undefined },
    projectData,
    initialSections: sections,
    initialBudget:   budget,
    pricing,
    hasDrawings,
  };

  if (project.budgetType === 'peer_review') {
    const allUsers = await prisma.user.findMany({
      select:  { id: true, name: true, email: true },
      where:   { isActive: true },
      orderBy: { name: 'asc' },
    });
    return (
      <PeerReviewClient
        project={{ ...project, peerReviewItems: undefined }}
        initialItems={project.peerReviewItems}
        currentUser={{ id: session.id, role: session.role }}
        allUsers={allUsers}
      />
    );
  }

  if (project.budgetType === 'design') {
    return <DesignWizardClient {...sharedProps} />;
  }

  return <WizardClient {...sharedProps} isDesign={false} />;
}
