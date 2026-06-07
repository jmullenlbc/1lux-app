import { requireAuth } from '@/lib/auth';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import ProposalsClient from './ProposalsClient';

export const dynamic = 'force-dynamic';

export default async function ProposalsPage() {
  const cookieStore = cookies();
  const token = cookieStore.get('ilc_session')?.value;
  if (!token) redirect('/login');

  return <ProposalsClient />;
}
