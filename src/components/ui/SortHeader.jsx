'use client';
import { cn } from '@/lib/utils';
import { TH, INPUT } from './tokens';

// The one sortable column header (Mike 10-16): click to sort, click again to
// flip. One chevron, drawn the same on every table.
export function Chevron({ dir, active }) {
  return (
    <svg className={cn('w-3 h-3 shrink-0 transition-transform', active ? 'text-orange-600' : 'text-slate-300', active && dir === 'desc' && 'rotate-180')} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path fillRule="evenodd" d="M14.77 12.79a.75.75 0 01-1.06-.02L10 8.83l-3.71 3.94a.75.75 0 11-1.08-1.04l4.25-4.5a.75.75 0 011.08 0l4.25 4.5a.75.75 0 01-.02 1.06z" clipRule="evenodd" />
    </svg>
  );
}

export default function SortHeader({ label, field, sort, onSort, align = 'left', className, children }) {
  const active = sort?.key === field;
  return (
    <th scope="col" className={cn(TH, align === 'right' && 'text-right', className)}>
      <button
        type="button"
        onClick={() => onSort(field)}
        className={cn('inline-flex items-center gap-1 hover:text-slate-800', active && 'text-slate-800', align === 'right' && 'flex-row-reverse')}
        aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      >
        <span>{label ?? children}</span>
        <Chevron dir={sort?.dir} active={active} />
      </button>
    </th>
  );
}

// Plain header for a column that does not sort.
export function Th({ children, align = 'left', className }) {
  return <th scope="col" className={cn(TH, align === 'right' && 'text-right', className)}>{children}</th>;
}

// A "Sort by" select plus a direction toggle, for card lists without headers.
export function SortSelect({ fields = [], sort, onChange, className }) {
  const dir = sort?.dir === 'desc' ? 'desc' : 'asc';
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <label className="text-xs text-slate-500">Sort by</label>
      <select className={cn(INPUT, 'w-auto py-1.5 text-xs')} value={sort?.key || ''} onChange={e => onChange({ key: e.target.value, dir })}>
        <option value="">Default</option>
        {fields.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
      </select>
      <button
        type="button"
        onClick={() => onChange({ key: sort?.key || '', dir: dir === 'asc' ? 'desc' : 'asc' })}
        disabled={!sort?.key}
        className="text-xs font-semibold text-slate-600 hover:text-slate-800 disabled:text-slate-300 inline-flex items-center gap-1"
      >
        <Chevron dir={dir} active={!!sort?.key} />
        {dir === 'asc' ? 'Low to high' : 'High to low'}
      </button>
    </div>
  );
}

// Sort an array of rows by a field getter. Blanks sink to the bottom either way.
export function sortRows(rows, sort, getters) {
  if (!sort?.key || !getters?.[sort.key]) return rows;
  const get = getters[sort.key];
  const dir = sort.dir === 'desc' ? -1 : 1;
  return [...rows].sort((a, b) => {
    const x = get(a), y = get(b);
    const xb = x === null || x === undefined || x === '';
    const yb = y === null || y === undefined || y === '';
    if (xb && yb) return 0;
    if (xb) return 1;
    if (yb) return -1;
    if (typeof x === 'number' && typeof y === 'number') return (x - y) * dir;
    return String(x).localeCompare(String(y), undefined, { sensitivity: 'base', numeric: true }) * dir;
  });
}
