import { redirect } from 'next/navigation';
import { getSession, isSuperAdmin } from '@/lib/auth';
import JobLoaderClient from './JobLoaderClient';

export const dynamic = 'force-dynamic';

export default async function JobLoaderPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (!isSuperAdmin(session.role)) redirect('/dashboard');
  return <JobLoaderClient />;
}
