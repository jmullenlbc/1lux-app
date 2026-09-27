export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import Sidebar from '@/components/layout/Sidebar';
import MobileTabBar from '@/components/layout/MobileTabBar';
import AppBreadcrumb from '@/components/layout/AppBreadcrumb';
import DraftReminderBanner from '@/components/layout/DraftReminderBanner';
import QcCapture from '@/components/qc/QcCapture';
import GlobalAIButton from '@/components/GlobalAIButton';
// react-hot-toast ships its own "use client", so Toaster can sit in this server
// layout. QcCapture calls toast() — before this was mounted its messages went nowhere.
import { Toaster } from 'react-hot-toast';

// Home screen icon for signed-in staff only: public intake and portal pages
// sit outside (app) and never get the manifest.
export const metadata = {
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icons/icon-192.png', apple: '/icons/apple-touch-icon.png' },
  appleWebApp: { capable: true, title: 'ILC', statusBarStyle: 'default' },
};
export const viewport = { themeColor: '#0a1929' };

export default async function AppLayout({ children }) {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.mustChangePassword) redirect('/change-password');

  return (
    <div className="flex h-[100dvh] md:h-screen overflow-hidden bg-slate-50 print:h-auto print:overflow-visible print:block">
      <Sidebar user={session} />
      <main className="flex-1 overflow-y-auto flex flex-col print:overflow-visible">
        <DraftReminderBanner />
        <AppBreadcrumb />
        <div className="flex-1 pb-28 print:pb-0">
          {children}
        </div>
        <div className="print:hidden">
          <QcCapture />
          <GlobalAIButton />
          <Toaster position="top-center" />
        </div>
        <MobileTabBar />
      </main>
    </div>
  );
}
