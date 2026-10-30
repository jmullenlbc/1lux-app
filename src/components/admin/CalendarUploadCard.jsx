import Link from 'next/link';
import { CARD_PADDED, CARD_TITLE, HELPER, BTN_SECONDARY } from '@/components/ui/tokens';

// Where to find Calendar Upload from the Admin page (Mike 10-29).
export default function CalendarUploadCard() {
  return (
    <div className={`mb-6 ${CARD_PADDED} flex flex-wrap items-center gap-4`}>
      <div className="flex-1 min-w-0">
        <h2 className={CARD_TITLE}>Calendar Upload</h2>
        <p className={`${HELPER} mt-0.5`}>
          Load a Google Takeout calendar (.ics) as sales activity: past meetings become published notes, personal events stay out.
        </p>
      </div>
      <Link href="/admin/calendar-import" className={BTN_SECONDARY}>Open Calendar Upload</Link>
    </div>
  );
}
