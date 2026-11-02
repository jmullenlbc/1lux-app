export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { getSession, isClientViewer } from '@/lib/auth';
import LibraryClient from './LibraryClient';

export default async function EventsLibraryPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (isClientViewer(session.role)) redirect('/dashboard');
  return <LibraryClient />;
}
