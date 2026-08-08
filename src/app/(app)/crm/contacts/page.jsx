export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import ContactsClient from './ContactsClient';

export default async function ContactsPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  const contacts = await prisma.contact.findMany({
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      preferredName: true,
      title: true,
      email: true,
      phone: true,
      company: true,
      cadenceTier: true,
      cadenceDays: true,
      lastInPersonAt: true,
      lastTouchpointAt: true,
      nextCheckInAt: true,
      client: { select: { id: true, name: true, cadenceDays: true } },
    },
  });

  return <ContactsClient contacts={contacts} />;
}
