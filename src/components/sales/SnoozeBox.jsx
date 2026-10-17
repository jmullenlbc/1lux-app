'use client';
import { useState } from 'react';
import { SNOOZE_PRESETS, MAX_SNOOZE_DAYS } from '@/lib/desk/desk';

// Snooze picker (Mike 9-26): three quick buttons, any number of days, or a
// picked date as the manual override. Calls onPick({ days }) or onPick({ date }).
export default function SnoozeBox({ onPick, onClose, busy }) {
  const [days, setDays] = useState('');
  const [date, setDate] = useState('');
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const n = Math.round(Number(days));
  const daysOk = days !== '' && n >= 1 && n <= MAX_SNOOZE_DAYS;
  const btn = 'min-h-[40px] px-3 rounded-lg text-sm font-semibold border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40';
  return (
    <div className="mt-2 rounded-lg bg-slate-50 border border-slate-200 p-2 space-y-2">
      <div className="flex flex-wrap gap-2">
        {SNOOZE_PRESETS.map(p => (
          <button key={p.days} type="button" disabled={busy} className={btn} onClick={() => onPick({ days: p.days })}>{p.label}</button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input type="number" inputMode="numeric" min={1} max={MAX_SNOOZE_DAYS} value={days} onChange={e => setDays(e.target.value)}
          placeholder="Days" className="w-20 min-h-[40px] px-2 rounded-lg border border-slate-200 bg-white text-sm tabular-nums" />
        <button type="button" disabled={busy || !daysOk} className={btn} onClick={() => onPick({ days: n })}>Snooze {daysOk ? `${n} ${n === 1 ? 'day' : 'days'}` : 'days'}</button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input type="date" min={tomorrow} value={date} onChange={e => setDate(e.target.value)}
          className="min-h-[40px] px-2 rounded-lg border border-slate-200 text-sm" />
        <button type="button" disabled={busy || !date || date < tomorrow} className={btn} onClick={() => onPick({ date })}>Until this date</button>
        <button type="button" className="ml-auto text-xs font-semibold text-slate-600 hover:underline" onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}
