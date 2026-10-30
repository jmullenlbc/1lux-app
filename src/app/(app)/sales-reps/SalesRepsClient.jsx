'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import { FilterToolbar, FilterPanel, SearchBox, countFilters } from '@/components/ui/FilterPanel';
import { useUrlView } from '@/lib/useUrlView';
import { BulkTools, useBulkPicks } from '@/components/ui/BulkEditBar';

// Sales Reps list (Mike 10-29, 0144). Search runs here in the browser so it
// ignores case on every database. Row checkboxes + Select all edit or
// archive many at once; archived reps hide unless asked for.

const BULK_FIELDS = [
  { key: 'city', label: 'City', kind: 'text' },
  { key: 'state', label: 'State', kind: 'text' },
];

export default function SalesRepsClient({ initialReps, offices }) {
  const router = useRouter();
  const fields = useMemo(() => [
    { key: 'office', label: 'ILC office', kind: 'pick' },
    { key: 'inactive', label: 'Show archived', kind: 'yesno' },
  ], []);
  const view = useUrlView({ fields });
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [err, setErr] = useState('');

  const officeName = useMemo(() => new Map(offices.map((o) => [o.id, o.name])), [offices]);
  const rows = useMemo(() => initialReps.map((r) => {
    const quotes = r.emails.filter((e) => e.purpose === 'QUOTES').map((e) => e.email);
    const mfrs = [...new Map(r.links.map((l) => [l.manufacturer.id, l.manufacturer.name])).values()].sort();
    const officesFor = [...new Set(r.links.map((l) => (l.officeId ? officeName.get(l.officeId) : 'All offices')).filter(Boolean))];
    return { ...r, quotes, mfrs, officesFor, defaults: r.links.filter((l) => l.isDefault).length };
  }), [initialReps, officeName]);

  const shown = rows.filter((r) => {
    if (view.filters.inactive !== 'yes' && !r.active) return false;
    if (view.filters.office && !r.officesFor.includes(view.filters.office) && !r.officesFor.includes('All offices')) return false;
    if (!q.trim()) return true;
    const hay = [r.name, r.abbreviation, r.city, r.state, ...r.quotes, ...r.mfrs].join(' ').toLowerCase();
    return q.toLowerCase().split(/\s+/).every((w) => hay.includes(w));
  });
  const bulk = useBulkPicks(shown, '/api/sales-reps/bulk', 'REP_BULK');

  async function add() {
    if (!name.trim()) return;
    setErr('');
    const res = await fetch('/api/sales-reps', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name.trim() }) }).catch(() => null);
    const d = await res?.json().catch(() => ({}));
    if (!res?.ok) { setErr(d?.error || 'The rep was not added. Nothing was saved. Try again. (REP_ADD)'); return; }
    router.push(`/sales-reps/${d.rep.id}`);
  }

  return (
    <div className="max-w-7xl mx-auto">
      <div className="px-6 py-8 border-b border-slate-200 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Sales Reps</h1>
          <p className="text-slate-500 text-sm mt-1">Who quotes each manufacturer, by ILC office. RFQs go to each rep&apos;s Quotes emails.</p>
        </div>
        {!adding && <Button onClick={() => setAdding(true)}>Add rep</Button>}
        {adding && (
          <div className="flex items-center gap-2">
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()}
              placeholder="Rep agency name" className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-64" />
            <Button onClick={add} disabled={!name.trim()}>Add</Button>
            <Button variant="secondary" onClick={() => { setAdding(false); setName(''); }}>Cancel</Button>
          </div>
        )}
      </div>

      <div className="p-6 space-y-4">
        {err && <p className="text-sm text-red-600">{err}</p>}
        <FilterToolbar count={countFilters(view.filters, fields)} open={open} onToggle={() => setOpen((o) => !o)}
          onClear={view.clearFilters} shown={shown.length} total={rows.length} noun="reps"
          right={<SearchBox value={q} onChange={setQ} placeholder="Search reps, emails, manufacturers" className="w-72" />} />
        <FilterPanel open={open} fields={fields} filters={view.filters} choices={{ office: offices.map((o) => o.name) }} onChange={view.setFilter} />
        <BulkTools bulk={bulk} shown={shown.length} noun="reps" fields={BULK_FIELDS} />

        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
              <tr>
                <th className="pl-4 pr-1 py-2 w-8"><span className="sr-only">Pick</span></th>
                <th className="px-4 py-2">Rep</th>
                <th className="px-4 py-2">Offices</th>
                <th className="px-4 py-2">Manufacturers</th>
                <th className="px-4 py-2">Quotes emails</th>
                <th className="px-4 py-2 text-right">RFQs</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {shown.map((r) => (
                <tr key={r.id} className={`${bulk.picked.has(r.id) ? 'bg-orange-50/50' : 'hover:bg-slate-50'} ${r.active ? '' : 'opacity-50'}`}>
                  <td className="pl-4 pr-1 py-2">
                    <input type="checkbox" checked={bulk.picked.has(r.id)} onChange={() => bulk.toggle(r.id)} aria-label={`Pick ${r.name}`} className="w-4 h-4 accent-orange-500" />
                  </td>
                  <td className="px-4 py-2">
                    <Link href={`/sales-reps/${r.id}`} className="font-medium text-slate-900 hover:text-orange-600">{r.name}</Link>
                    {!r.active && <span className="ml-2 text-xs text-slate-400">Archived</span>}
                    {(r.city || r.state) && <div className="text-xs text-slate-400">{[r.city, r.state].filter(Boolean).join(', ')}</div>}
                  </td>
                  <td className="px-4 py-2 text-slate-600">{r.officesFor.join(', ') || <span className="text-slate-300">None</span>}</td>
                  <td className="px-4 py-2 text-slate-600 max-w-md">
                    {r.mfrs.slice(0, 6).join(', ')}{r.mfrs.length > 6 && <span className="text-slate-400"> and {r.mfrs.length - 6} more</span>}
                  </td>
                  <td className="px-4 py-2 text-slate-600">
                    {r.quotes.length ? r.quotes.join(', ') : <span className="text-red-600 text-xs">No Quotes email</span>}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-slate-600">{r._count.rfqs || ''}</td>
                </tr>
              ))}
              {!shown.length && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                  {rows.length ? 'No reps match.' : 'No reps yet. An admin can load them from Admin, Sales Rep upload, or press Add rep.'}
                </td></tr>
              )}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}
