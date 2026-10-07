export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { getSession, isSuperAdmin, isSalesAdmin } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getAllActionTypes } from '@/lib/noteActionTypesStore';
import AutomationNav from '@/components/salesAutomation/AutomationNav';
import NoteActionTypesEditor from './NoteActionTypesEditor';

export default async function SalesAutomationActionsPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  // Sales Admin or Super Admin only.
  let allowed = isSuperAdmin(session.role);
  if (!allowed) {
    const u = await prisma.user.findUnique({ where: { id: session.id }, select: { permissions: true } });
    allowed = isSalesAdmin({ role: session.role, permissions: u?.permissions });
  }
  if (!allowed) redirect('/sales/automation/rules');

  let types = [];
  try {
    types = await getAllActionTypes();
  } catch (err) {
    console.error('[/sales/automation/actions] load failed:', err?.message ?? err);
  }

  return (
    <div className="px-6 py-6">
      <AutomationNav />
      <div className="max-w-5xl mx-auto">
      <div className="mb-5">
        <h1 className="text-xl font-bold text-slate-900">Action Types</h1>
        <p className="text-slate-500 text-sm mt-1 max-w-3xl">
          The actions the Sales Bot can take from a note. Each type is a <strong>method</strong> (email, text,
          call, schedule, expect intro, send materials, add to list, internal task) so the bot knows what to do.
          Message methods carry an editable <strong>template</strong> and <strong>instructions</strong>. The AI
          uses each type&rsquo;s label + description to classify lines from your notes.
        </p>
        <span className="inline-flex items-center gap-1.5 mt-3 px-2.5 py-1 rounded-full bg-pink-50 border border-pink-200 text-xs font-medium text-pink-700">
          Sales Admin only
        </span>
      </div>
      <NoteActionTypesEditor initialTypes={types} />
      </div>
    </div>
  );
}
