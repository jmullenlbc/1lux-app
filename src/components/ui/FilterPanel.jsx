'use client';
import { cn } from '@/lib/utils';
import { BTN_COMPACT, INPUT, LABEL, HELPER } from './tokens';

// The one filter pattern (Mike 10-16): a funnel button that says "Filter (n)"
// opens a panel with one box per field and a Clear link. Pair with useUrlView
// so the address keeps the filters.
//
//   fields:  [{ key, label, kind, placeholder? }]  kind text | pick | range | yesno | date
//   filters: { [key]: string | { min, max } }
//   choices: { [key]: string[] } for pick fields

export function FunnelIcon({ className = 'w-3.5 h-3.5' }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
    </svg>
  );
}

export function FilterButton({ count = 0, open = false, onClick, className }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={open}
      className={cn(BTN_COMPACT, (open || count > 0) && 'border-orange-400 bg-orange-50 text-orange-700 hover:bg-orange-50', className)}
    >
      <FunnelIcon />
      Filter{count > 0 ? ` (${count})` : ''}
    </button>
  );
}

// Toolbar row: funnel button, "x of y", Clear link, and a right slot (sort, search, actions).
export function FilterToolbar({ count = 0, open, onToggle, onClear, shown, total, noun = 'rows', right, children, className }) {
  const hasCount = typeof shown === 'number' && typeof total === 'number';
  return (
    <div className={cn('flex flex-wrap items-center gap-3', className)}>
      <FilterButton count={count} open={open} onClick={onToggle} />
      {hasCount && (
        <span className={HELPER}>
          {count > 0 ? `${shown} of ${total} ${noun}` : `${total} ${total === 1 ? noun.replace(/s$/, '') : noun}`}
        </span>
      )}
      {count > 0 && onClear && (
        <button type="button" onClick={onClear} className="text-xs font-semibold text-orange-600 hover:text-orange-700">
          Clear filters
        </button>
      )}
      {children}
      {right ? <div className="ml-auto flex items-center gap-2">{right}</div> : null}
    </div>
  );
}

export function FilterPanel({ open, fields = [], filters = {}, choices = {}, onChange, children, className }) {
  if (!open) return null;
  return (
    <div className={cn('mt-3 rounded-lg border border-slate-200 bg-slate-50 p-4', className)}>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {fields.map(f => (
          <FilterField key={f.key} field={f} value={filters[f.key]} choices={choices[f.key]} onChange={v => onChange(f.key, v)} />
        ))}
        {children}
      </div>
    </div>
  );
}

export function FilterField({ field, value, choices = [], onChange }) {
  const { key, label, kind, placeholder } = field;
  const id = `flt-${key}`;
  if (kind === 'range') {
    const v = value && typeof value === 'object' ? value : { min: '', max: '' };
    return (
      <div>
        <label htmlFor={`${id}-min`} className={LABEL}>{label}</label>
        <div className="mt-1 flex items-center gap-1">
          <input id={`${id}-min`} type="number" inputMode="decimal" className={INPUT} placeholder="Min" value={v.min ?? ''} onChange={e => onChange({ ...v, min: e.target.value })} />
          <span className="text-slate-400 text-xs">to</span>
          <input id={`${id}-max`} type="number" inputMode="decimal" className={INPUT} placeholder="Max" value={v.max ?? ''} onChange={e => onChange({ ...v, max: e.target.value })} />
        </div>
      </div>
    );
  }
  if (kind === 'pick' || kind === 'yesno') {
    const opts = kind === 'yesno' ? [['yes', 'Yes'], ['no', 'No']] : (choices || []).map(c => (Array.isArray(c) ? c : [c, c]));
    return (
      <div>
        <label htmlFor={id} className={LABEL}>{label}</label>
        <select id={id} className={cn(INPUT, 'mt-1')} value={value ?? ''} onChange={e => onChange(e.target.value)}>
          <option value="">Any</option>
          {opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>
    );
  }
  if (kind === 'date') {
    return (
      <div>
        <label htmlFor={id} className={LABEL}>{label}</label>
        <input id={id} type="date" className={cn(INPUT, 'mt-1')} value={value ?? ''} onChange={e => onChange(e.target.value)} />
      </div>
    );
  }
  return (
    <div>
      <label htmlFor={id} className={LABEL}>{label}</label>
      <input id={id} type="text" className={cn(INPUT, 'mt-1')} placeholder={placeholder || 'Contains...'} value={value ?? ''} onChange={e => onChange(e.target.value)} />
    </div>
  );
}

// Count of filters that would narrow something.
export function countFilters(filters, fields) {
  let n = 0;
  for (const f of fields) {
    const v = filters?.[f.key];
    if (v === undefined || v === null || v === '') continue;
    if (f.kind === 'range') { if ((v.min ?? '') !== '' || (v.max ?? '') !== '') n++; }
    else n++;
  }
  return n;
}

// Plain text search box that matches the standard input look.
export function SearchBox({ value, onChange, placeholder = 'Search...', className }) {
  return (
    <input type="search" className={cn(INPUT, 'w-56', className)} placeholder={placeholder} value={value ?? ''} onChange={e => onChange(e.target.value)} />
  );
}
