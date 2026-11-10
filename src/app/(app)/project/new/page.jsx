export const dynamic = 'force-dynamic';

import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { SPACES_SELECT, spaceKeys, spaceOf } from '@/lib/companySpaces';
import NewProjectForm from './NewProjectForm';

export default async function NewProjectPage({ searchParams }) {
  const session = await getSession();
  if (!session) redirect('/login');

  const typeParam = searchParams?.type;
  const budgetType = typeParam === 'design' ? 'design' : typeParam === 'peer_review' ? 'peer_review' : 'conceptual';

  let existing = [], clients = [], me = null;
  try {
    [existing, clients, me] = await Promise.all([
      prisma.project.findMany({
        orderBy: { updatedAt: 'desc' },
        select: { id: true, name: true, buildingType: true, location: true, city: true, state: true, zip: true, clientId: true },
      }),
      prisma.client.findMany({
        orderBy: { name: 'asc' },
        select: { id: true, name: true, type: true, locationType: true, branchMarket: true },
      }),
      prisma.user.findUnique({ where: { id: session.id }, select: { businessUnits: SPACES_SELECT } }),
    ]);
  } catch (err) {
    console.error('[/project/new] DB query failed:', err?.message ?? err);
  }

  // Someone who sells for exactly one company starts with it picked; anyone else picks.
  const mySpaces = spaceKeys(me);
  const defaultSpaceId = mySpaces.length === 1 ? spaceOf(mySpaces[0]).id : '';

  return <NewProjectForm existingProjects={existing} clients={clients} budgetType={budgetType} defaultSpaceId={defaultSpaceId} />;
}
