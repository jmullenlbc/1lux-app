export const dynamic = 'force-dynamic';

import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import NewProjectForm from './NewProjectForm';

export default async function NewProjectPage({ searchParams }) {
  const session = await getSession();
  if (!session) redirect('/login');

  const typeParam = searchParams?.type;
  const budgetType = typeParam === 'design' ? 'design' : typeParam === 'peer_review' ? 'peer_review' : 'conceptual';

  let existing = [], clients = [];
  try {
    [existing, clients] = await Promise.all([
      prisma.project.findMany({
        orderBy: { updatedAt: 'desc' },
        select: { id: true, name: true, buildingType: true, location: true, city: true, state: true, zip: true, clientId: true },
      }),
      prisma.client.findMany({
        orderBy: { name: 'asc' },
        select: { id: true, name: true, type: true, locationType: true },
      }),
    ]);
  } catch (err) {
    console.error('[/project/new] DB query failed:', err?.message ?? err);
  }

  return <NewProjectForm existingProjects={existing} clients={clients} budgetType={budgetType} />;
}
