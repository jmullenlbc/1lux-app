export const dynamic = 'force-dynamic';

import { notFound, redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { canOpenProject } from '@/lib/projectScope';
import { prisma } from '@/lib/db';
import { DEPARTMENTS_SELECT, departmentKeys } from '@/lib/departments';
import { responsesToSections } from '@/lib/utils';
import { calculateBudget } from '@/lib/calculations';
import { loadPricing, pricingForProject } from '@/lib/pricingLoader';
import WizardClient from '../WizardClient';
import DesignWizardClient from '../DesignWizardClient';
import PeerReviewClient from '../PeerReviewClient';
import { SITE_FEATURE_INCLUDE, engineProjectData } from '@/lib/siteFeatureRows';
import { fillOldBlanks } from '@/lib/figures/fillOldBlanks';
import { PM_SELECT } from '@/lib/projectManagers';
import { BRAND_UNIT_SELECT } from '@/lib/brandServer';

export default async function ProjectWizardPage({ params }) {
  const session = await getSession();
  if (!session) redirect('/login');

  const project = await prisma.project.findUnique({
    where: { id: params.id },
    include: {
      projectData:    true,
      responses:      true,
      ...SITE_FEATURE_INCLUDE,
      peerReviewItems: { orderBy: [{ section: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }] },
      client:         true,
      createdBy:      { select: { id: true, name: true, email: true } },
      assignees:      PM_SELECT,
      // The job's company prints on the peer review (2026-11-10).
      businessUnit:   { select: BRAND_UNIT_SELECT },
    },
  });

  if (!project) notFound();
  if (!(await canOpenProject(prisma, session, project))) notFound();

  // Older projects get their blanks estimated on first open (Mike 10-17).
  await fillOldBlanks(prisma, project, session);
  const pricing = pricingForProject(project.pricingSnapshot, await loadPricing());

  const sections       = responsesToSections(project.responses);
  const projectData    = engineProjectData(project);
  // Figures the tool estimated (blank = we estimate it, Mike 10-17).
  projectData.estimatedFields = (await prisma.projectFigureSource.findMany({
    where: { projectId: project.id, source: 'guess' }, select: { field: true },
  }).catch(() => [])).map(r => r.field);
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
    const allUsers = (await prisma.user.findMany({
      select:  { id: true, name: true, email: true, departments: DEPARTMENTS_SELECT },
      where:   { isActive: true },
      orderBy: { name: 'asc' },
    })).map(u => ({ ...u, departments: departmentKeys(u) }));
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
