export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { getSession, isClientViewer } from '@/lib/auth';
import PlanClient from './PlanClient';

export default async function EventsPlanPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (isClientViewer(session.role)) redirect('/dashboard');
  return <PlanClient />;
}
