import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { redirect } from 'next/navigation';
import NotesClient from './NotesClient';

export const metadata = { title: 'Sales Notes — ILC Studios' };

export default async function NotesPage() {
  const { user, error } = await requireAuth();
  if (error) redirect('/login');

  const [notes, clients, deals] = await Promise.all([
    prisma.salesNote.findMany({
      orderBy: [{ meetingDate: 'desc' }, { updatedAt: 'desc' }],
      include: {
        createdBy: { select: { id: true, name: true } },
        clients: { include: { client: { select: { id: true, clientNumber: true, name: true, type: true } } } },
        deals:   { include: { deal:   { select: { id: true, dealNumber: true, title: true, pipeline: true, stage: true } } } },
      },
    }),
    prisma.client.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, clientNumber: true, name: true, type: true },
    }),
    prisma.deal.findMany({
      where: { dealStatus: 'OPEN' },
      orderBy: [{ pipeline: 'asc' }, { updatedAt: 'desc' }],
      select: { id: true, dealNumber: true, title: true, pipeline: true, stage: true, dealStatus: true,
                client: { select: { id: true, name: true } } },
    }),
  ]);

  return (
    <NotesClient
      initialNotes={notes}
      clients={clients}
      deals={deals}
      currentUser={{ id: user.id, name: user.name, email: user.email, role: user.role }}
    />
  );
}
