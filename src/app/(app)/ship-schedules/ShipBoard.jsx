'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import AlertMark from '@/components/ui/AlertMark';
import { FilterToolbar, FilterPanel, countFilters } from '@/components/ui/FilterPanel';
import { CARD, HELPER } from '@/components/ui/tokens';
import { useUrlView } from '@/lib/useUrlView';
import { shipStatusMeta } from '@/lib/shipBoard';
import { inSpace, spaceFilterChoices } from '@/lib/companySpaces';
import SpaceBadge from '@/components/ui/SpaceBadge';

const FIELDS = [
  { key: 'space',     label: 'Company',        kind: 'pick' },
  { key: 'job',       label: 'Job',            kind: 'pick' },
  { key: 'mfr',       label: 'Manufacturer',   kind: 'pick' },
  { key: 'status',    label: 'Status',         kind: 'pick' },
  { key: 'mine',      label: 'My jobs only',   kind: 'yesno' },
  { key: 'delivered', label: 'Show delivered', kind: 'yesno' },
];

const uniqueSorted = list => [...new Set(list)].sort((a, b) => a.localeCompare(b));

// A date with no time, stored at midnight UTC. Without timeZone a US screen shows the day before.
function fmtDay(d) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

export default function ShipBoard({ rows, mySpaces = [] }) {
  const { filters, setFilter, clearFilters } = useUrlView({ fields: FIELDS });
  const [open, setOpen] = useState(false);

  const base = useMemo(
    () => (filters.delivered === 'yes' ? rows : rows.filter(r => !r.done)),
    [rows, filters.delivered],
  );
  const shown = useMemo(() => base.filter(r =>
    inSpace(r, filters.space)
    && (!filters.job || r.jobName === filters.job)
    && (!filters.mfr || r.manufacturer === filters.mfr)
    && (!filters.status || shipStatusMeta(r.status).label === filters.status)
    && (filters.mine !== 'yes' || r.mine)
    && (filters.mine !== 'no' || !r.mine)), [base, filters]);

  const choices = useMemo(() => ({
    space:  spaceFilterChoices(mySpaces),
    job:    uniqueSorted(base.map(r => r.jobName)),
    mfr:    uniqueSorted(base.map(r => r.manufacturer)),
    status: uniqueSorted(base.map(r => shipStatusMeta(r.status).label)),
  }), [base, mySpaces]);

  return (
    <>
      <FilterToolbar
        count={countFilters(filters, FIELDS)}
        open={open}
        onToggle={() => setOpen(o => !o)}
        onClear={clearFilters}
        shown={shown.length}
        total={base.length}
        noun="shipments"
      />
      <FilterPanel open={open} fields={FIELDS} filters={filters} choices={choices} onChange={setFilter} />

      {shown.length === 0 ? (
        <p className={`${HELPER} mt-4`}>
          {rows.length ? 'No shipments match. Clear the filters, or show delivered.' : 'No job has a Ship Schedule yet.'}
        </p>
      ) : (
        <div className={`${CARD} mt-4 divide-y divide-slate-100 overflow-hidden`}>
          {shown.map(r => {
            const meta = shipStatusMeta(r.status);
            return (
              <Link key={r.id} href={`/project/${r.projectId}?tab=ship-schedule`} className="block min-h-[48px] px-4 py-3 hover:bg-amber-50">
                <div className="flex items-start justify-between gap-3">
                  <span className="min-w-0 flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-900 truncate">{r.jobName}</span>
                    <SpaceBadge businessUnitId={r.businessUnitId} />
                  </span>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${meta.color}`}>{meta.label}</span>
                </div>
                <p className="mt-0.5 text-sm text-slate-600 truncate">{r.manufacturer}</p>
                <p className={`${HELPER} mt-0.5 flex items-center gap-1.5`}>
                  {r.warning === 'red' && <AlertMark label="Past its ship date" size={14} />}
                  <span className={r.warning === 'amber' ? 'font-semibold text-amber-700' : ''}>
                    {r.done ? 'All delivered' : r.nextShip ? `Next ship ${fmtDay(r.nextShip)}` : 'No ship date yet'}
                  </span>
                  <span>{r.openLines} of {r.lines} {r.lines === 1 ? 'line' : 'lines'} open</span>
                </p>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
