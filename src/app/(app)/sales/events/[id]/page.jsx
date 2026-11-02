export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { getSession, isClientViewer } from '@/lib/auth';
import EventClient from './EventClient';

export default async function EventPage({ params }) {
  const session = await getSession();
  if (!session) redirect('/login');
  if (isClientViewer(session.role)) redirect('/dashboard');
  return <EventClient id={params.id} />;
}
