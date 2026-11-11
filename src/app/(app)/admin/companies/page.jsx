export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { getSession, actsAsAdmin } from '@/lib/auth';
import { prisma } from '@/lib/db';
import CompaniesClient from './CompaniesClient';

// Admin > Companies (2026-11-10): the three 1LUX companies (0165) and what their client documents print.
// Admins only: it changes every PDF and email for that company's jobs.
export default async function CompaniesPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (!actsAsAdmin(session)) redirect('/dashboard');
  const units = await prisma.businessUnit.findMany({ orderBy: { sortOrder: 'asc' } });
  return <CompaniesClient units={JSON.parse(JSON.stringify(units))} />;
}
