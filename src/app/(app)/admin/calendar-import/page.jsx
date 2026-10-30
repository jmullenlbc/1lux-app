export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { getSession, actsAsAdmin, isSalesAdmin } from '@/lib/auth';
import CalendarImportClient from './CalendarImportClient';

export default async function CalendarImportPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  // Mirrors the guard on /api/admin/calendar-import: the route is the boundary.
  if (!actsAsAdmin(session) && !isSalesAdmin(session)) redirect('/dashboard');
  return <CalendarImportClient />;
}
