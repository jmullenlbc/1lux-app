export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { getSession, isClientViewer } from '@/lib/auth';
import MembershipsClient from './MembershipsClient';

export default async function EventsMembershipsPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (isClientViewer(session.role)) redirect('/dashboard');
  return <MembershipsClient />;
}
