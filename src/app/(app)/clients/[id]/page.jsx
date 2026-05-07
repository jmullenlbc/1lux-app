import { notFound, redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import ClientDetailClient from './ClientDetailClient';

export const dynamic = 'force-dynamic';

export default async function ClientDetailPage({ params }) {
  const session = await getSession();
  if (!session) redirect('/login');

  const isAdmin = session.role === 'ILC_ADMIN' || session.role === 'ADMIN';

  const client = await prisma.client.findUnique({
    where: { id: params.id },
    include: {
      projects: {
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true, projectNumber: true, name: true, location: true, city: true, state: true,
          buildingType: true, phase: true, budgetType: true, serviceType: true,
          status: true, createdAt: true, updatedAt: true,
        },
      },
      contacts: { orderBy: { createdAt: 'asc' } },
      kbSections: {
        orderBy: { sortOrder: 'asc' },
        include: { attachments: { orderBy: { createdAt: 'asc' } } },
      },
      createdBy: { select: { name: true, email: true } },
    },
  });

  if (!client) notFound();
  if (!isAdmin && client.createdById !== session.id) notFound();

  const unlinkableProjects = await prisma.project.findMany({
    where: {
      clientId: null,
      ...(isAdmin ? {} : { createdById: session.id }),
    },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, location: true, buildingType: true },
  });

  return (
    <ClientDetailClient
      client={client}
      availableProjects={unlinkableProjects}
      user={session}
    />
  );
}
