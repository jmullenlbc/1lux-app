export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { getSession, isSuperAdmin } from '@/lib/auth';
import CrmImportClient from './CrmImportClient';

export default async function CrmImportPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  // Mirrors the guard on /api/admin/crm-import: the route is the boundary.
  if (!isSuperAdmin(session.role)) redirect('/dashboard');
  return <CrmImportClient />;
}
