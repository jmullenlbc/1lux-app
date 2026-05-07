import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import Sidebar from '@/components/layout/Sidebar';
import AppBreadcrumb from '@/components/layout/AppBreadcrumb';

export default async function AppLayout({ children }) {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.mustChangePassword) redirect('/change-password');

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <Sidebar user={session} />
      <main className="flex-1 overflow-y-auto flex flex-col">
        <AppBreadcrumb />
        <div className="flex-1">
          {children}
        </div>
      </main>
    </div>
  );
}
