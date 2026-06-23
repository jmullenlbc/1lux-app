export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import Sidebar from '@/components/layout/Sidebar';
import AppBreadcrumb from '@/components/layout/AppBreadcrumb';
import QcCapture from '@/components/qc/QcCapture';
import GlobalAIButton from '@/components/GlobalAIButton';

export default async function AppLayout({ children }) {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.mustChangePassword) redirect('/change-password');

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 print:h-auto print:overflow-visible print:block">
      <Sidebar user={session} />
      <main className="flex-1 overflow-y-auto flex flex-col print:overflow-visible">
        <AppBreadcrumb />
        <div className="flex-1 pb-28 print:pb-0">
          {children}
        </div>
        <div className="print:hidden">
          <QcCapture />
          <GlobalAIButton />
        </div>
      </main>
    </div>
  );
}
