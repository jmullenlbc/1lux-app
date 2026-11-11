export const dynamic = 'force-dynamic';

import { requireAuth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import LPDCheckClient from './LPDCheckClient';

export const metadata = { title: 'LPD Compliance Check: 1LUX' };

export default async function LPDCheckPage() {
  const { user, error } = await requireAuth();
  if (error) redirect('/login');

  return <LPDCheckClient />;
}
