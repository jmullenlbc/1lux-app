export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { getSession, isSalesTeam } from '@/lib/auth';
import { getAllActionTypes } from '@/lib/noteActionTypesStore';
import { WAIT_EXECUTORS } from '@/lib/followUp/watch';
import AutomationNav from '@/components/salesAutomation/AutomationNav';
import ReminderTimelineEditor from './ReminderTimelineEditor';

/**
 * Sales Automation → Reminder Timeline (Mike 9-25).
 *
 * After a meeting, some next steps are theirs to do: reply, send drawings,
 * send an invite, make an intro. The app watches the inbox for each one. When
 * nothing comes, it drafts a check-in email (for a person to send) on this
 * ladder — days after the meeting. Laid out like the master pricing sheet: one
 * row per step, one number per box, saved as you leave the box.
 */
export default async function ReminderTimelinePage() {
  const session = await getSession();
  if (!session) redirect('/login');

  const canEdit = isSalesTeam(session);

  let types = [];
  try {
    types = (await getAllActionTypes()).filter(t => Object.hasOwn(WAIT_EXECUTORS, t.executor));
  } catch (err) {
    console.error('[/sales/automation/timeline] load failed:', err?.message ?? err);
  }

  return (
    <div className="px-6 py-6">
      <AutomationNav />
      <div className="max-w-5xl mx-auto">
      <div className="mb-5">
        <h1 className="text-xl font-bold text-slate-900">Reminder Timeline</h1>
        <p className="text-slate-500 text-sm mt-1 max-w-3xl">
          When a meeting note says <em>they</em> will do something &mdash; reply, send drawings, send an invite,
          make an intro &mdash; the app watches email for it and marks it done when it arrives. If it
          hasn&rsquo;t arrived, a friendly check-in email is drafted for you to review in the Bot Queue, on the
          days below (counted from the meeting). Nothing is ever sent without a person. Leave a box blank to
          stop there.
        </p>
      </div>
      <ReminderTimelineEditor initialTypes={JSON.parse(JSON.stringify(types))} canEdit={canEdit} />
      </div>
    </div>
  );
}
