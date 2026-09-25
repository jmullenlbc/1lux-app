'use client';
import { useState } from 'react';

const WATCHES = {
  EXPECT_REPLY:  'Any email back from them',
  EXPECT_FILES:  'An email from them with drawings, a PDF/CAD file, or a Dropbox/Box/Procore-type link',
  EXPECT_INVITE: 'A calendar invite from them',
  EXPECT_INTRO:  'An email with them and the new person on it',
};
const RUNGS = [
  ['reminderDays',  '1st reminder'],
  ['reminder2Days', '2nd reminder'],
  ['reminder3Days', '3rd reminder'],
];

export default function ReminderTimelineEditor({ initialTypes, canEdit }) {
  const [types, setTypes] = useState(initialTypes);
  const [status, setStatus] = useState({}); // key → 'saving' | 'saved' | error text

  async function save(key, field, raw) {
    const value = raw === '' ? null : Number(raw);
    const row = types.find(t => t.key === key);
    if ((row?.[field] ?? null) === value) return;
    setStatus(s => ({ ...s, [key]: 'saving' }));
    try {
      const r = await fetch('/api/crm/note-action-types', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, [field]: value }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Save failed');
      setTypes(ts => ts.map(t => (t.key === key ? d.type : t)));
      setStatus(s => ({ ...s, [key]: 'saved' }));
    } catch (e) {
      setStatus(s => ({ ...s, [key]: e.message }));
    }
  }

  if (!types.length) {
    return <p className="text-sm text-slate-500">No waiting steps are set up yet.</p>;
  }

  const cell = 'w-20 bg-white border border-slate-300 rounded px-2 py-1 text-sm text-right text-slate-900 outline-none focus:border-orange-500 disabled:bg-slate-100 disabled:text-slate-500';

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide">
          <tr>
            <th className="text-left px-4 py-2.5">Next step</th>
            <th className="text-left px-4 py-2.5">Counts as done when</th>
            {RUNGS.map(([, label]) => <th key={label} className="text-right px-4 py-2.5 whitespace-nowrap">{label}</th>)}
            <th className="px-2" />
          </tr>
        </thead>
        <tbody>
          {types.map(t => (
            <tr key={t.key} className="border-t border-slate-100">
              <td className="px-4 py-2.5 font-medium text-slate-900 whitespace-nowrap">
                {t.label}
                {!t.isActive && <span className="ml-2 text-[11px] text-slate-400">(turned off)</span>}
              </td>
              <td className="px-4 py-2.5 text-slate-500 text-xs">{WATCHES[t.executor] || ''}</td>
              {RUNGS.map(([field]) => (
                <td key={field} className="px-4 py-2.5 text-right whitespace-nowrap">
                  <input type="number" min="1" max="3650" step="1" disabled={!canEdit}
                    defaultValue={t[field] ?? ''} className={cell}
                    onBlur={e => save(t.key, field, e.target.value.trim())} />
                  <span className="ml-1 text-xs text-slate-400">days</span>
                </td>
              ))}
              <td className="px-2 text-xs whitespace-nowrap">
                {status[t.key] === 'saving' && <span className="text-slate-400">Saving…</span>}
                {status[t.key] === 'saved' && <span className="text-emerald-600">Saved</span>}
                {status[t.key] && !['saving', 'saved'].includes(status[t.key]) && <span className="text-rose-600">{status[t.key]}</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="px-4 py-2.5 text-xs text-slate-500 border-t border-slate-100">
        Days after the meeting. Each reminder must be later than the one before; a blank box ends the ladder.
        A single step can still override its 1st reminder on the note itself.
        {!canEdit && ' Only the sales team can change these.'}
      </p>
    </div>
  );
}
