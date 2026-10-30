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
      department: true,
      email: true,
      phone: true,
      company: true,
      cadenceTier: true,
      cadenceDays: true,
      lastInPersonAt: true,
      lastTouchpointAt: true,
      nextCheckInAt: true,
      client: { select: { id: true, name: true, cadenceDays: true } },
      tagLinks: { select: { tag: { select: { id: true, name: true } } } },
    },
  });

  const tags = await prisma.contactTag.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } });

  // Companies and their branches for the bulk "Company or branch" pick (Mike 10-29).
  const companies = await prisma.client.findMany({
    orderBy: { name: 'asc' },
    select: { id: true, name: true, branchMarket: true, parent: { select: { name: true } } },
  });

  return <ContactsClient contacts={contacts} tags={tags} companies={companies} />;
}
