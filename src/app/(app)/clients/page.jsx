import { redirect } from 'next/navigation';
import { getSession, canSeeAllData } from '@/lib/auth';
import { prisma } from '@/lib/db';
import ClientsClient from './ClientsClient';

export const dynamic = 'force-dynamic';

export default async function ClientsPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  const clients = await prisma.client.findMany({
    where: canSeeAllData(session) ? {} : { createdById: session.id },
    orderBy: { name: 'asc' },
    include: {
      _count: { select: { projects: { where: { archivedAt: null } }, contacts: { where: { archivedAt: null } } } },
      createdBy: { select: { name: true, email: true } },
      // Just enough of each project to count the deals on the cards, and the
      // tag links for the chips + tag filter.
      projects: {
        where: { archivedAt: null },
        select: {
          id: true, name: true, serviceType: true, projectType: true,
          procurementStatus: true, designStatus: true,
        },
      },
      tagLinks: { include: { tag: true } },
    },
  });

  return <ClientsClient clients={clients} user={session} />;
}
