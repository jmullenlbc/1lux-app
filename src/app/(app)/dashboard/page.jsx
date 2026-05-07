export const dynamic = 'force-dynamic';

import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { calculateBudget } from '@/lib/calculations';
import { responsesToSections } from '@/lib/utils';
import DashboardClient from './DashboardClient';

export default async function DashboardPage() {
  const session = await getSession();

  const where = session.role === 'ILC_ADMIN' ? {} : { createdById: session.id };

  const projects = await prisma.project.findMany({
    where,
    include: {
      projectData: true,
      responses:   true,
      client:      { select: { id: true, name: true, type: true } },
      assignees:   { include: { user: { select: { id: true, name: true, email: true } } } },
      createdBy:   { select: { id: true, name: true, email: true } },
    },
    orderBy: { updatedAt: 'desc' },
  });

  const hydrated = projects.map(p => {
    const sections = responsesToSections(p.responses);
    const budget   = calculateBudget(p.projectData, sections);
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
