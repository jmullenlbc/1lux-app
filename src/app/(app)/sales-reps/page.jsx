export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { getSession, isClientViewer } from '@/lib/auth';
import { prisma } from '@/lib/db';
import SalesRepsClient from './SalesRepsClient';

export const metadata = { title: 'Sales Reps: ILC Studios' };

// Sales Reps (Mike 10-29, 0144): its own table, built like Manufacturers.
export default async function SalesRepsPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (isClientViewer(session.role)) redirect('/dashboard');

  const [reps, offices] = await Promise.all([
    prisma.salesRep.findMany({
      orderBy: { name: 'asc' },
      include: {
        emails: { orderBy: { sortOrder: 'asc' } },
        links: { where: { active: true }, select: { officeId: true, isDefault: true, manufacturer: { select: { id: true, name: true } } } },
        _count: { select: { rfqs: true } },
      },
    }),
    prisma.ourOffice.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' }, select: { id: true, name: true } }),
  ]);

  return <SalesRepsClient initialReps={JSON.parse(JSON.stringify(reps))} offices={offices} />;
}
