export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { H1 } from '@/components/ui/tokens';
import { getSession, isSuperAdmin, isSalesAdmin } from '@/lib/auth';
import { prisma } from '@/lib/db';
import AutomationNav from '@/components/salesAutomation/AutomationNav';
import TriggersClient from './TriggersClient';

export default async function SalesAutomationTriggersPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  let allowed = isSuperAdmin(session.role);
  if (!allowed) {
    const u = await prisma.user.findUnique({ where: { id: session.id }, select: { permissions: true } });
    allowed = isSalesAdmin({ role: session.role, permissions: u?.permissions });
  }
  if (!allowed) redirect('/sales/automation/rules');

  return (
    <div className="px-6 py-6">
      <AutomationNav />
      <div className="max-w-5xl mx-auto">
      <div className="mb-5">
        <h1 className={H1}>If-Then Rules</h1>
        <p className="text-slate-500 text-sm mt-1 max-w-3xl">
          Build your own automations: <strong>When</strong> something happens (a note action, email, or calendar event),
          <strong> If</strong> it matches your conditions, <strong>Then</strong> the bot does something: drafts an email,
          notifies you, schedules a reminder. The bot always runs the method&rsquo;s baseline action; these rules add to it.
          Review how each rule performs below and tune as you go.
        </p>
        <span className="inline-flex items-center gap-1.5 mt-3 px-2.5 py-1 rounded-full bg-pink-50 border border-pink-200 text-xs font-medium text-pink-700">
          Sales Admin only
        </span>
      </div>
      <TriggersClient />
      </div>
    </div>
  );
}
