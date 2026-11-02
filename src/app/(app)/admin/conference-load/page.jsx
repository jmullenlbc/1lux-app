export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { getSession, isSuperAdmin } from '@/lib/auth';
import ConferenceLoadClient from './ConferenceLoadClient';

export default async function ConferenceLoadPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  // Mirrors the guard on /api/admin/conferences/load: the route is the boundary.
  if (!isSuperAdmin(session.role)) redirect('/dashboard');
  return <ConferenceLoadClient />;
}
