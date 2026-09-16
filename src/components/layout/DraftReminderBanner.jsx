'use client';
// The reminder that never leaves (Mike, 2026-09-15). Deliberately no close
// button and no snooze: it goes away only when every waiting calendar note is
// published or archived.
import Link from 'next/link';
import { useDraftReminder } from './useDraftReminder';
import { draftReminderText } from '@/lib/calendar/draftReminder';

export default function DraftReminderBanner() {
  const reminder = useDraftReminder();
  if (!reminder?.count) return null;

  return (
    <div
      role="status"
      className="print:hidden shrink-0 flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 bg-amber-50 border-b border-amber-200 text-sm text-amber-900"
    >
      <span className="font-semibold">{draftReminderText(reminder.count)}</span>
      <span className="text-xs text-amber-700">This stays here until each one is published.</span>
      <Link
        href="/crm/notes?status=mine"
        className="ml-auto text-xs font-semibold text-amber-700 hover:text-amber-900 underline underline-offset-2"
      >
        Open them →
      </Link>
    </div>
  );
}
