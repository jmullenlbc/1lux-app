export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { getSession, isClientViewer } from '@/lib/auth';
import { prisma } from '@/lib/db';
import OfficesClient from './OfficesClient';

// Anyone on staff edits (Mike 10-29); every change lands in the history.
export default async function OfficesPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (isClientViewer(session.role)) redirect('/dashboard');
  const offices = await prisma.ourOffice.findMany({ orderBy: { sortOrder: 'asc' } });
  return <OfficesClient offices={JSON.parse(JSON.stringify(offices))} />;
}
