'use client';

/**
 * Published sales notes for one company or one person (Mike 10-5).
 *
 * Reads GET /api/crm/notes?published=1&clientId=.. (or &contactId=..), newest
 * first, and shows title, date and activity type. Each row opens the note on
 * the Sales Meetings screen (/crm/notes?note=<id>). Drafts never show here:
 * nothing downstream counts a note until it is published.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { LABEL, HELPER } from '@/components/ui/tokens';

const TYPE_LABEL = {
  COFFEE: 'Coffee', MEAL: 'Meal', LUNCH: 'Meal', TRAVEL: 'Travel', HAPPY_HOUR: 'Happy Hour',
  GOLF: 'Golf', SITE_VISIT: 'Site Visit', CALL: 'Call', EMAIL: 'Email', TEXT: 'Text',
  EVENT: 'Event', OTHER: 'Other',
};

function noteDate(n) {
  const raw = n.meetingDate || n.updatedAt || n.createdAt;
  const t = raw ? new Date(raw).getTime() : 0;
  return Number.isFinite(t) ? t : 0;
}

export default function SalesNotesPanel({ clientId, contactId, limit = 20, compact = false }) {
  const [notes,   setNotes]   = useState(null);
  const [failed,  setFailed]  = useState(false);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (!clientId && !contactId) return;
    let alive = true;
    const qs = new URLSearchParams({ published: '1' });
    if (contactId) qs.set('contactId', contactId);
    else qs.set('clientId', clientId);
    fetch(`/api/crm/notes?${qs}`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(d => {
        if (!alive) return;
        const rows = Array.isArray(d?.notes) ? d.notes : [];
        rows.sort((a, b) => noteDate(b) - noteDate(a));
        setNotes(rows);
      })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [clientId, contactId]);

  const heading = (
    <div className={`${LABEL} mb-1`}>Sales notes</div>
  );

  if (failed) {
    return <div className={compact ? 'mt-2' : 'mt-5 pt-5 border-t border-slate-100'}>{heading}<p className={HELPER}>Could not load notes.</p></div>;
  }
  if (notes === null) {
    return <div className={compact ? 'mt-2' : 'mt-5 pt-5 border-t border-slate-100'}>{heading}<p className={HELPER}>Loading...</p></div>;
  }

  const rows = showAll ? notes : notes.slice(0, limit);

  return (
    <div className={compact ? 'mt-2' : 'mt-5 pt-5 border-t border-slate-100'}>
      {heading}
      {notes.length === 0 ? (
        <p className={HELPER}>No published notes yet.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {rows.map(n => {
            const when = n.meetingDate || n.updatedAt;
            return (
              <li key={n.id} className="py-1.5">
                <Link href={`/crm/notes?note=${n.id}`} className="group flex items-baseline gap-2 text-sm">
                  <span className="text-slate-800 group-hover:text-orange-600 truncate">{n.title || 'Untitled note'}</span>
                  <span className="ml-auto shrink-0 text-xs text-slate-500 tabular-nums">
                    {when ? new Date(when).toLocaleDateString() : ''}
                  </span>
                  {n.activityType && (
                    <span className="shrink-0 text-[11px] px-1.5 py-0.5 rounded-full border border-slate-200 bg-slate-50 text-slate-500">
                      {TYPE_LABEL[n.activityType] || n.activityType}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {notes.length > limit && (
        <button type="button" onClick={() => setShowAll(v => !v)} className="mt-1 text-xs text-slate-500 hover:text-slate-800 underline">
          {showAll ? 'Show fewer' : `Show all ${notes.length}`}
        </button>
      )}
    </div>
  );
}
