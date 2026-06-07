import { requireAuth } from '@/lib/auth';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import TemplatesClient from './TemplatesClient';

export const dynamic = 'force-dynamic';

export default async function TemplatesPage() {
  const cookieStore = cookies();
  const token = cookieStore.get('ilc_session')?.value;
  if (!token) redirect('/login');

  return <TemplatesClient />;
}
