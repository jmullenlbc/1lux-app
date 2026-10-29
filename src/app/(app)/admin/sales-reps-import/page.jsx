export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { getSession, actsAsAdmin } from '@/lib/auth';
import SalesRepsImportClient from './SalesRepsImportClient';

export default async function SalesRepsImportPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  // Mirrors the guard on /api/admin/sales-reps-import: the route is the boundary.
  if (!actsAsAdmin(session)) redirect('/dashboard');
  return <SalesRepsImportClient />;
}
