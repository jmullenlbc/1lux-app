export const dynamic = 'force-dynamic';

import { notFound, redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import SubmittalTrackerClient from '@/components/tracker/SubmittalTrackerClient';

export default async function TrackerPage({ params }) {
  const session = await getSession();
  if (!session) redirect('/login');

  const project = await prisma.project.findUnique({
    where: { id: params.id },
    select: { id: true, name: true, createdById: true },
  });

  if (!project) notFound();
  if (session.role !== 'ILC_ADMIN' && project.createdById !== session.id) notFound();

  return (
    <SubmittalTrackerClient
      projectId={project.id}
      projectName={project.name}
    />
  );
}
