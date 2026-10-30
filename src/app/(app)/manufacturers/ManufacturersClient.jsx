'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import { FilterToolbar, FilterPanel, SearchBox, countFilters } from '@/components/ui/FilterPanel';
import { useUrlView } from '@/lib/useUrlView';
import { BulkTools, useBulkPicks } from '@/components/ui/BulkEditBar';

// Manufacturers list, built the same as Sales Reps (Mike 10-29). Click a row
// to open the manufacturer; every edit happens there. Search runs here in the
// browser so it ignores case on every database. Row checkboxes + Select all
// edit or archive many at once (0145); archived ones hide unless asked for.

const BULK_FIELDS = [
  { key: 'terms', label: 'Terms', kind: 'text' },
  { key: 'setupToSell', label: 'Setup to sell', kind: 'yesno' },
  { key: 'buyDirect', label: 'Buy direct', kind: 'yesno' },
  { key: 'state', label: 'State', kind: 'text' },
];

export default function ManufacturersClient({ initialManufacturers, offices }) {
  const router = useRouter();
  const fields = useMemo(() => [
    { key: 'office', label: 'ILC office', kind: 'pick' },
    { key: 'setup', label: 'Setup to sell', kind: 'yesno' },
    { key: 'direct', label: 'Buy direct', kind: 'yesno' },
    { key: 'terms', label: 'Terms', kind: 'pick' },
    { key: 'state', label: 'State', kind: 'pick' },
    { key: 'archived', label: 'Show archived', kind: 'yesno' },
  ], []);
  const view = useUrlView({ fields });
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [err, setErr] = useState('');

  const officeName = useMemo(() => new Map(offices.map((o) => [o.id, o.name])), [offices]);
  const rows = useMemo(() => initialManufacturers.map((m) => {
    const reps = [...new Map(m.repLinks.map((l) => [l.salesRep.id, l.salesRep.name])).values()].sort();
    const officesFor = [...new Set(m.repLinks.map((l) => (l.officeId ? officeName.get(l.officeId) : 'All offices')).filter(Boolean))];
    return { ...m, reps, officesFor };
  }), [initialManufacturers, officeName]);

  const yesNo = (want, v) => !want || (want === 'yes') === Boolean(v);
  const shown = rows.filter((m) => {
    if (view.filters.archived !== 'yes' && !m.active) return false;
    if (!yesNo(view.filters.setup, m.setupToSell) || !yesNo(view.filters.direct, m.buyDirect)) return false;
    if (view.filters.terms && m.terms !== view.filters.terms) return false;
    if (view.filters.state && m.state !== view.filters.state) return false;
    if (view.filters.office && !m.officesFor.includes(view.filters.office) && !m.officesFor.includes('All offices')) return false;
    if (!q.trim()) return true;
    const hay = [m.name, m.city, m.state, m.accountingEmail, m.notes, ...m.reps].join(' ').toLowerCase();
    return q.toLowerCase().split(/\s+/).every((w) => hay.includes(w));
  });

  const choices = useMemo(() => ({
    office: offices.map((o) => o.name),
    terms: [...new Set(rows.map((m) => m.terms).filter(Boolean))].sort(),
    state: [...new Set(rows.map((m) => m.state).filter(Boolean))].sort(),
  }), [offices, rows]);
  const bulk = useBulkPicks(shown, '/api/manufacturers/bulk', 'MFR_BULK');

  async function add() {
    if (!name.trim()) return;
    setErr('');
    const res = await fetch('/api/manufacturers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name.trim() }) }).catch(() => null);
    const d = await res?.json().catch(() => ({}));
    if (!res?.ok) { setErr(d?.error || 'The manufacturer was not added. Nothing was saved. Try again. (MFR_ADD)'); return; }
    router.push(`/manufacturers/${d.manufacturer.id}`);
  }

  return (
    <div className="max-w-7xl mx-auto">
      <div className="px-6 py-8 border-b border-slate-200 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Manufacturers</h1>
          <p className="text-slate-500 text-sm mt-1">Who we buy from, their terms, and which rep quotes them in each ILC office.</p>
        </div>
        {!adding && <Button onClick={() => setAdding(true)}>Add manufacturer</Button>}
        {adding && (
          <div className="flex items-center gap-2">
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()}
              placeholder="Manufacturer name" className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-64" />
            <Button onClick={add} disabled={!name.trim()}>Add</Button>
            <Button variant="secondary" onClick={() => { setAdding(false); setName(''); }}>Cancel</Button>
          </div>
        )}
      </div>

      <div className="p-6 space-y-4">
        {err && <p className="text-sm text-red-600">{err}</p>}
        <FilterToolbar count={countFilters(view.filters, fields)} open={open} onToggle={() => setOpen((o) => !o)}
          onClear={view.clearFilters} shown={shown.length} total={rows.length} noun="manufacturers"
          right={<SearchBox value={q} onChange={setQ} placeholder="Search manufacturers, reps, cities" className="w-72" />} />
        <FilterPanel open={open} fields={fields} filters={view.filters} choices={choices} onChange={view.setFilter} />
        <BulkTools bulk={bulk} shown={shown.length} noun="manufacturers" fields={BULK_FIELDS} />

        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
              <tr>
                <th className="pl-4 pr-1 py-2 w-8"><span className="sr-only">Pick</span></th>
                <th className="px-4 py-2">Manufacturer</th>
                <th className="px-4 py-2">Offices</th>
                <th className="px-4 py-2">Reps</th>
                <th className="px-4 py-2">Terms</th>
                <th className="px-4 py-2 text-right">Products</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {shown.map((m) => (
                <tr key={m.id} className={`${bulk.picked.has(m.id) ? 'bg-orange-50/50' : 'hover:bg-slate-50'} ${m.active ? '' : 'opacity-50'}`}>
                  <td className="pl-4 pr-1 py-2">
                    <input type="checkbox" checked={bulk.picked.has(m.id)} onChange={() => bulk.toggle(m.id)} aria-label={`Pick ${m.name}`} className="w-4 h-4 accent-orange-500" />
                  </td>
                  <td className="px-4 py-2">
                    <Link href={`/manufacturers/${m.id}`} className="font-medium text-slate-900 hover:text-orange-600">{m.name}</Link>
                    {!m.active && <span className="ml-2 text-xs text-slate-400">Archived</span>}
                    {m.setupToSell && <span className="ml-2 text-xs text-green-700">Setup to sell</span>}
                    {(m.city || m.state) && <div className="text-xs text-slate-400">{[m.city, m.state].filter(Boolean).join(', ')}</div>}
                  </td>
                  <td className="px-4 py-2 text-slate-600">
                    {m.buyDirect ? 'Buy direct' : (m.officesFor.join(', ') || <span className="text-red-600 text-xs">No rep</span>)}
                  </td>
                  <td className="px-4 py-2 text-slate-600 max-w-md">
                    {m.buyDirect ? <span className="text-slate-300">None</span> : <>
                      {m.reps.slice(0, 4).join(', ')}{m.reps.length > 4 && <span className="text-slate-400"> and {m.reps.length - 4} more</span>}
                    </>}
                  </td>
                  <td className="px-4 py-2 text-slate-600">{m.terms || <span className="text-slate-300">None</span>}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-slate-600">{m._count.products || ''}</td>
                </tr>
              ))}
              {!shown.length && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                  {rows.length ? 'No manufacturers match.' : 'No manufacturers yet. Press Add manufacturer.'}
                </td></tr>
              )}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}
