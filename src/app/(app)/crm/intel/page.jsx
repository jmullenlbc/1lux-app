export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import IntelClient from './IntelClient';

export default async function CrmIntelPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  return <IntelClient currentUser={session} />;
}
