export const dynamic = 'force-dynamic';

import { redirect, notFound } from 'next/navigation';
import { getSession } from '@/lib/auth';
import CODetailClient from './CODetailClient';

export default async function CODetailPage({ params }) {
  const session = await getSession();
  if (!session) redirect('/login');
  return (
    <CODetailClient
      projectId={params.id}
      coId={params.coId}
      userId={session.id}
    />
  );
}
