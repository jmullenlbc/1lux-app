export const dynamic = 'force-dynamic';

import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { redirect } from 'next/navigation';
import CRMClient from './CRMClient';

export const metadata = { title: 'Pipeline — ILC Studios' };

export default async function CRMPage() {
  const { user, error } = await requireAuth();
  if (error) redirect('/login');

  // Fetch all deals with full context
  let deals = [], clients = [], users = [];
  try {
    [deals, clients, users] = await Promise.all([
      prisma.deal.findMany({
        orderBy: [{ dealStatus: 'asc' }, { updatedAt: 'desc' }],
        include: {
          client:        { select: { id: true, clientNumber: true, name: true, type: true } },
          owner:         { select: { id: true, name: true, email: true } },
          createdBy:     { select: { id: true, name: true } },
          linkedProject: { select: { id: true, projectNumber: true, name: true, phase: true } },
          linkedDeal:    { select: { id: true, dealNumber: true, title: true, pipeline: true } },
          contacts: {
            include: {
              contact: { select: { id: true, contactNumber: true, name: true, title: true, email: true } },
            },
          },
          activities: { orderBy: { createdAt: 'desc' }, take: 1 },
          _count: { select: { activities: true, contacts: true } },
        },
      }),
      prisma.client.findMany({
        orderBy: { name: 'asc' },
        select: { id: true, clientNumber: true, name: true, type: true },
      }),
      prisma.user.findMany({
        where:   { isActive: true },
        orderBy: { name: 'asc' },
        select:  { id: true, name: true, email: true, role: true },
      }),
    ]);
  } catch (err) {
    console.error('[/crm] DB query failed:', err?.message ?? err);
  }

  return (
    <CRMClient
      initialDeals={deals}
      clients={clients}
      users={users}
      currentUser={{ id: user.id, name: user.name, email: user.email, role: user.role }}
    />
  );
}
