export const dynamic = 'force-dynamic';

import { notFound, redirect } from 'next/navigation';
import { getSession, isClientViewer } from '@/lib/auth';
import { prisma } from '@/lib/db';
import SalesRepDetailClient from './SalesRepDetailClient';

export default async function SalesRepPage({ params }) {
  const session = await getSession();
  if (!session) redirect('/login');
  if (isClientViewer(session.role)) redirect('/dashboard');

  const [rep, offices, manufacturers] = await Promise.all([
    prisma.salesRep.findUnique({
      where: { id: params.id },
      include: {
        emails: { orderBy: { sortOrder: 'asc' } },
        links: { where: { active: true }, include: { manufacturer: { select: { id: true, name: true } } } },
        rfqs: { orderBy: { number: 'desc' }, take: 50, select: { id: true, number: true, familyNumber: true, version: true, status: true, needBy: true, createdAt: true, project: { select: { id: true, name: true } } } },
      },
    }),
    prisma.ourOffice.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' }, select: { id: true, name: true } }),
    prisma.manufacturer.findMany({ where: { active: true }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
  ]);
  if (!rep) notFound();

  return <SalesRepDetailClient rep={JSON.parse(JSON.stringify(rep))} offices={offices} manufacturers={manufacturers} />;
}
