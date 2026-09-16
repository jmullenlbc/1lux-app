export const dynamic = 'force-dynamic';

import { requireAuth, actsAsAdmin } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { redirect } from 'next/navigation';
import NotesClient from './NotesClient';

export const metadata = { title: 'Sales Notes — ILC Studios' };

const STATUSES = ['all', 'draft', 'published', 'mine'];

export default async function NotesPage({ searchParams }) {
  // ?status=mine comes from the "Open them" link on the waiting-drafts reminder.
  const initialStatus = STATUSES.includes(searchParams?.status) ? searchParams.status : 'all';
  const { user, error } = await requireAuth();
  if (error) redirect('/login');

  let notes = [], clients = [], projects = [];
  try {
  [notes, clients, projects] = await Promise.all([
    prisma.note.findMany({
      where: { noteType: 'SALES' },
      orderBy: [{ meetingDate: 'desc' }, { updatedAt: 'desc' }],
      include: {
        createdBy: { select: { id: true, name: true } },
        clients:  { include: { client:  { select: { id: true, clientNumber: true, name: true, type: true } } } },
        projects: { include: { project: { select: { id: true, projectNumber: true, name: true, serviceType: true, procurementStage: true, designStage: true } } } },
      },
    }),
    prisma.client.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, clientNumber: true, name: true, type: true },
    }),
    prisma.project.findMany({
      orderBy: { updatedAt: 'desc' },
      select: { id: true, projectNumber: true, name: true, serviceType: true, procurementStage: true, designStage: true, procurementStatus: true, designStatus: true,
                client: { select: { id: true, name: true } } },
    }),
  ]);
  } catch (err) {
    console.error('[/crm/notes] DB query failed:', err?.message ?? err);
  }

  return (
    <NotesClient
      initialNotes={notes}
      clients={clients}
      projects={projects}
      initialStatus={initialStatus}
      currentUser={{ id: user.id, name: user.name, email: user.email, role: user.role, isAdmin: actsAsAdmin(user) }}
    />
  );
}
