export const dynamic = 'force-dynamic';

import { notFound, redirect } from 'next/navigation';
import { getSession, isClientViewer, can } from '@/lib/auth';
import { canOpenProject } from '@/lib/projectScope';
import { prisma } from '@/lib/db';
import { DEPARTMENTS_SELECT, departmentKeys } from '@/lib/departments';
import { responsesToSections } from '@/lib/utils';
import { calculateBudget } from '@/lib/calculations';
import { loadPricing, pricingForProject } from '@/lib/pricingLoader';
import { PROJECT_TEAM_ROLES } from '@/lib/projectTeam';
import ProjectHubClient from './ProjectHubClient';
import ArchivedBanner from '@/components/ArchivedBanner';
import { SITE_FEATURE_INCLUDE, engineProjectData } from '@/lib/siteFeatureRows';

// The six companies on the project team, by name, so the team card reads right
// on the first paint instead of filling in once the client list arrives.
const TEAM_INCLUDE = Object.fromEntries(
  PROJECT_TEAM_ROLES.map(role => [role.relation, { select: { id: true, name: true } }]),
);

export default async function ProjectHubPage({ params }) {
  const session = await getSession();
  if (!session) redirect('/login');

  const project = await prisma.project.findUnique({
    where: { id: params.id },
    include: {
      _count: {
        select: { notes: { where: { noteType: 'PROJECT_MEETING', archivedAt: null } } },
      },
      projectData: true,
      responses: true,
      ...SITE_FEATURE_INCLUDE,
      client: true,
      archivedBy: { select: { name: true, email: true } },
      // Web budgets carry their own description ("100% DD"), shown after the name (0132).
      conceptualDraft: { select: { budgetName: true, copiedFromId: true } },
      peerReviewItems: { orderBy: [{ section: 'asc' }, { sortOrder: 'asc' }] },
      assignees: { include: { user: { select: { id: true, name: true, email: true } } } },
      ...TEAM_INCLUDE,
    },
  });

  if (!project) notFound();
  // Every ILC staff member can open any project; Client Viewers stay scoped to their own.
  if (!(await canOpenProject(prisma, session, project))) notFound();

  const pricing = pricingForProject(project.pricingSnapshot, await loadPricing());

  const sections    = responsesToSections(project.responses);
  const projectData = engineProjectData(project);
  const budget      = calculateBudget(projectData, sections, pricing);

  const peerReviewTotal = project.peerReviewItems.reduce(
    (s, item) => s + (item.totalSavings || 0), 0
  );

  // Every file's full extracted text used to ride along here, on a file-heavy
  // job that is a megabyte or more of page the screen never shows past a
  // 280-character summary (Marmalade: 49 files, ~1 MB of text). Only the head
  // of each text travels now; a read that needs the whole thing fetches it.
  const FILE_TEXT_PREVIEW = 600;
  const projectFiles = (await prisma.projectFile.findMany({
    where: { projectId: params.id },
    include: { uploadedBy: { select: { name: true, email: true } } },
    orderBy: { createdAt: 'desc' },
  })).map(f => ({
    ...f,
    textContent: f.textContent ? f.textContent.slice(0, FILE_TEXT_PREVIEW) : f.textContent,
  }));

  const clients = await prisma.client.findMany({
    select: { id: true, name: true, type: true, locationType: true },
    orderBy: { name: 'asc' },
  });

  // Departments come along so the people pickers can lead with the department
  // the field is really about (src/lib/deptScreens.js).
  const allUsers = (await prisma.user.findMany({
    select: { id: true, name: true, email: true, departments: DEPARTMENTS_SELECT },
    orderBy: { name: 'asc' },
  })).map(u => ({ ...u, departments: departmentKeys(u) }));

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
    <>
    {project.archivedAt && (
      <ArchivedBanner kind="project" id={project.id} archivedAt={project.archivedAt.toISOString()}
        archivedBy={project.archivedBy?.name || project.archivedBy?.email || null}
        canRestore={!isClientViewer(session.role)} />
    )}
    <ProjectHubClient
      userId={session.id}
      userRole={session.role}
      // Contract dollars: Construction, Operations, Finance and admins (src/lib/permissions.js).
      canEditMoney={can(session, 'editJobMoney')}
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
      meetingNotesCount={project._count?.notes ?? 0}
    />
    </>
  );
}
