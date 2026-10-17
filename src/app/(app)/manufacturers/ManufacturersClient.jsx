'use client';
import { useState, useMemo, useRef } from 'react';
import { FilterToolbar, FilterPanel, countFilters } from '@/components/ui/FilterPanel';
import { useUrlView } from '@/lib/useUrlView';

const FILTER_FIELDS = [
  { key: 'setup', label: 'Setup to sell', kind: 'yesno' },
  { key: 'terms', label: 'Terms',         kind: 'pick' },
  { key: 'state', label: 'State',         kind: 'pick' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt$(n) {
  if (n == null) return '—';
  return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const TERMS_OPTIONS = ['NET 30', 'NET 60', 'PAY IN ADVANCE', '1%/10 NET 25th', 'NET 45', 'COD', ''];
const STATES_US = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'];

// ── Inline editable cell ──────────────────────────────────────────────────────

function EditCell({ value, placeholder, onSave, type = 'text', options, align = 'left', mono, className = '' }) {
  const [editing, setEditing] = useState(false);
  const [val,     setVal]     = useState(value != null ? String(value) : '');
  const ref = useRef(null);

  function start() { setVal(value != null ? String(value) : ''); setEditing(true); setTimeout(() => ref.current?.focus(), 0); }
  function commit() {
    setEditing(false);
    const trimmed = val.trim();
    const out = trimmed === '' ? null : (type === 'number' ? (isNaN(parseFloat(trimmed)) ? null : parseFloat(trimmed)) : trimmed);
    if (out !== (value ?? null)) onSave(out);
  }

  if (type === 'select') {
    return (
      <select value={value ?? ''} onChange={e => onSave(e.target.value || null)}
        className={`w-full bg-transparent text-xs border-0 focus:outline-none focus:ring-1 focus:ring-blue-300 rounded px-0.5 cursor-pointer ${!value ? 'text-slate-300' : ''} ${className}`}>
        <option value=""></option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }

  if (type === 'boolean') {
    return (
      <button onClick={() => onSave(!value)}
        className={`px-2 py-0.5 rounded-full text-[10px] font-bold transition-colors ${value ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-400'}`}>
        {value ? 'YES' : 'NO'}
      </button>
    );
  }

  const display = type === 'number' && value != null
    ? (value >= 1000 ? '$' + Number(value).toLocaleString() : String(value))
    : (value ?? '');

  if (editing) {
    return (
      <input ref={ref} value={val} type={type === 'number' ? 'number' : 'text'}
        onChange={e => setVal(e.target.value)}
        onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
        className={`w-full border border-blue-300 rounded px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400 ${align === 'right' ? 'text-right' : ''} ${mono ? 'font-mono' : ''}`}
      />
    );
  }
  return (
    <div onClick={start}
      className={`cursor-text min-h-[1.1rem] px-0.5 select-none ${!display ? 'text-slate-300 text-[10px] italic' : ''} ${align === 'right' ? 'text-right' : ''} ${mono ? 'font-mono' : ''} ${className}`}
      title={display || placeholder}>
      {display || <span className="text-slate-300 italic text-[10px]">{placeholder}</span>}
    </div>
  );
}

// ── Sort icon ─────────────────────────────────────────────────────────────────

function SortIcon({ dir }) {
  if (!dir) return <svg className="w-3 h-3 text-slate-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 9l4-4 4 4M16 15l-4 4-4-4" /></svg>;
  return dir === 'asc'
    ? <svg className="w-3 h-3 text-blue-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" /></svg>
    : <svg className="w-3 h-3 text-blue-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>;
}

// ── Column definitions ────────────────────────────────────────────────────────

const COLS = [
  { key: 'name',           label: 'Name',            width: 'w-52',  sortable: true  },
  { key: 'setupToSell',    label: 'Setup to Sell',   width: 'w-24',  sortable: true  },
  { key: 'terms',          label: 'Terms',           width: 'w-36',  sortable: true  },
  { key: 'credit',         label: 'Credit',          width: 'w-24',  sortable: true, align: 'right' },
  { key: 'ffa',            label: 'FFA',             width: 'w-20',  sortable: true, align: 'right' },
  { key: 'accountingEmail',label: 'Accounting Email',width: 'w-48',  sortable: false },
  { key: 'mainPhone',      label: 'Phone',           width: 'w-36',  sortable: false },
  { key: 'website',        label: 'Website',         width: 'w-44',  sortable: false },
  { key: 'city',           label: 'City',            width: 'w-28',  sortable: true  },
  { key: 'state',          label: 'State',           width: 'w-16',  sortable: true  },
  { key: 'notes',          label: 'Notes',           width: 'w-64',  sortable: false },
  { key: 'acctLastUpdated',label: 'Last Updated',    width: 'w-28',  sortable: true  },
];

// ── Row ───────────────────────────────────────────────────────────────────────

function MfrRow({ mfr, onPatch, onDelete }) {
  function patch(field, val) { onPatch(mfr.id, { [field]: val }); }

  return (
    <tr className="group hover:bg-blue-50/30 transition-colors border-b border-slate-100 text-xs">
      {/* Name */}
      <td className="px-3 py-2 font-semibold text-slate-800 sticky left-0 bg-white group-hover:bg-blue-50/30 z-10 border-r border-slate-100">
        <EditCell value={mfr.name} placeholder="Name" onSave={v => patch('name', v || mfr.name)} className="font-semibold" />
      </td>
      {/* Setup to sell */}
      <td className="px-3 py-2 text-center">
        <EditCell value={mfr.setupToSell} type="boolean" onSave={v => patch('setupToSell', v)} />
      </td>
      {/* Terms */}
      <td className="px-3 py-2">
        <EditCell value={mfr.terms} type="select" options={TERMS_OPTIONS} placeholder="—" onSave={v => patch('terms', v)} />
      </td>
      {/* Credit */}
      <td className="px-3 py-2 text-right font-mono">
        {mfr.credit != null ? fmt$(mfr.credit) : <span className="text-slate-300">—</span>}
      </td>
      {/* FFA */}
      <td className="px-3 py-2 text-right font-mono">
        {mfr.ffa != null ? fmt$(mfr.ffa) : <span className="text-slate-300">—</span>}
      </td>
      {/* Accounting email */}
      <td className="px-3 py-2 text-blue-600">
        <EditCell value={mfr.accountingEmail} placeholder="email" onSave={v => patch('accountingEmail', v)} className="text-blue-600" />
      </td>
      {/* Phone */}
      <td className="px-3 py-2 font-mono text-slate-600">
        <EditCell value={mfr.mainPhone} placeholder="—" onSave={v => patch('mainPhone', v)} mono />
      </td>
      {/* Website */}
      <td className="px-3 py-2">
        {mfr.website
          ? <a href={mfr.website} target="_blank" rel="noopener noreferrer"
              className="text-blue-500 hover:underline truncate block max-w-[11rem] text-[10px]" title={mfr.website}>
              {mfr.website.replace(/^https?:\/\/(www\.)?/i, '')}
            </a>
          : <EditCell value={null} placeholder="website" onSave={v => patch('website', v)} className="text-[10px]" />
        }
      </td>
      {/* City */}
      <td className="px-3 py-2 text-slate-600">
        <EditCell value={mfr.city} placeholder="—" onSave={v => patch('city', v)} />
      </td>
      {/* State */}
      <td className="px-3 py-2">
        <EditCell value={mfr.state} type="select" options={STATES_US} placeholder="—" onSave={v => patch('state', v)} />
      </td>
      {/* Notes */}
      <td className="px-3 py-2 text-slate-500 max-w-xs">
        <EditCell value={mfr.notes} placeholder="notes…" onSave={v => patch('notes', v)} className="text-[10px] text-slate-500" />
      </td>
      {/* Last updated */}
      <td className="px-3 py-2 text-slate-400 text-[10px]">
        <EditCell value={mfr.acctLastUpdated} placeholder="—" onSave={v => patch('acctLastUpdated', v)} className="text-[10px]" />
      </td>
      {/* Delete */}
      <td className="px-2 py-2 sticky right-0 bg-white group-hover:bg-blue-50/30">
        <button onClick={() => onDelete(mfr.id)}
          className="opacity-0 group-hover:opacity-100 w-6 h-6 flex items-center justify-center rounded text-slate-300 hover:text-red-500 hover:bg-red-50 transition-all">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
        </button>
      </td>
    </tr>
  );
}

// ── Add row form ──────────────────────────────────────────────────────────────

function AddRow({ onAdd, onCancel }) {
  const [name,   setName]   = useState('');
  const [terms,  setTerms]  = useState('');
  const [setup,  setSetup]  = useState(false);
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!name.trim()) return;
    setSaving(true);
    await onAdd({ name: name.trim(), terms: terms || null, setupToSell: setup });
    setSaving(false);
  }

  return (
    <tr className="bg-blue-50/50 border-b border-blue-200 text-xs">
      <td className="px-3 py-2 sticky left-0 bg-blue-50/50 border-r border-blue-100">
        <input value={name} onChange={e => setName(e.target.value)} autoFocus
          placeholder="Manufacturer name *"
          onKeyDown={e => e.key === 'Enter' && submit()}
          className="w-full border border-blue-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400" />
      </td>
      <td className="px-3 py-2 text-center">
        <button onClick={() => setSetup(s => !s)}
          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${setup ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-400'}`}>
          {setup ? 'YES' : 'NO'}
        </button>
      </td>
      <td className="px-3 py-2">
        <select value={terms} onChange={e => setTerms(e.target.value)}
          className="w-full border border-slate-200 rounded px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white">
          <option value="">—</option>
          {TERMS_OPTIONS.filter(Boolean).map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      </td>
      <td colSpan={9} className="px-3 py-2 text-slate-400 text-[10px] italic">Fill in more details after adding…</td>
      <td className="px-2 py-2 sticky right-0 bg-blue-50/50">
        <div className="flex gap-1">
          <button onClick={submit} disabled={saving || !name.trim()}
            className="px-2.5 py-1 rounded bg-blue-600 text-white text-[10px] font-semibold disabled:opacity-50 transition-colors">
            {saving ? '…' : 'Add'}
          </button>
          <button onClick={onCancel}
            className="px-2.5 py-1 rounded border border-slate-200 text-slate-500 text-[10px] hover:bg-white transition-colors">
            ✕
          </button>
        </div>
      </td>
    </tr>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ManufacturersClient({ initialManufacturers }) {
  const [manufacturers, setManufacturers] = useState(initialManufacturers);
  const [search,        setSearch]        = useState('');
  const [filtersOpen,   setFiltersOpen]   = useState(false);
  const view = useUrlView({ fields: FILTER_FIELDS });
  const filterSetup = view.filters.setup || 'all'; // 'all' | 'yes' | 'no'
  const filterTerms = view.filters.terms || '';
  const filterState = view.filters.state || '';
  const [sortKey,       setSortKey]       = useState('name');
  const [sortDir,       setSortDir]       = useState('asc');
  const [showAdd,       setShowAdd]       = useState(false);

  function toggleSort(key) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  }

  const filtered = useMemo(() => {
    let rows = manufacturers;
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter(m =>
        m.name.toLowerCase().includes(q) ||
        (m.accountingEmail || '').toLowerCase().includes(q) ||
        (m.city || '').toLowerCase().includes(q) ||
        (m.notes || '').toLowerCase().includes(q)
      );
    }
    if (filterSetup !== 'all') rows = rows.filter(m => filterSetup === 'yes' ? m.setupToSell : !m.setupToSell);
    if (filterTerms) rows = rows.filter(m => m.terms === filterTerms);
    if (filterState) rows = rows.filter(m => m.state === filterState);

    rows = [...rows].sort((a, b) => {
      let av = a[sortKey], bv = b[sortKey];
      if (av == null) av = sortDir === 'asc' ? '￿' : '';
      if (bv == null) bv = sortDir === 'asc' ? '￿' : '';
      if (typeof av === 'boolean') av = av ? 1 : 0;
      if (typeof bv === 'boolean') bv = bv ? 1 : 0;
      if (typeof av === 'number' && typeof bv === 'number') return sortDir === 'asc' ? av - bv : bv - av;
      return sortDir === 'asc'
        ? String(av).localeCompare(String(bv), undefined, { sensitivity: 'base' })
        : String(bv).localeCompare(String(av), undefined, { sensitivity: 'base' });
    });
    return rows;
  }, [manufacturers, search, filterSetup, filterTerms, filterState, sortKey, sortDir]);

  async function patchMfr(id, update) {
    setManufacturers(prev => prev.map(m => m.id === id ? { ...m, ...update } : m));
    await fetch(`/api/manufacturers/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(update),
    });
  }

  async function deleteMfr(id) {
    const mfr = manufacturers.find(m => m.id === id);
    if (!confirm(`Delete "${mfr?.name}"?`)) return;
    // A manufacturer with products (archived ones included) is refused: its
    // products are archive-only and would go with it (migration 0076). Only
    // take it off the list once the server has really deleted it.
    const res = await fetch(`/api/manufacturers/${id}`, { method: 'DELETE' }).catch(() => null);
    if (!res?.ok) {
      const data = res ? await res.json().catch(() => ({})) : {};
      alert(data.error || 'Could not delete it. Nothing was changed.');
      return;
    }
    setManufacturers(prev => prev.filter(m => m.id !== id));
  }

  async function addMfr(data) {
    const res  = await fetch('/api/manufacturers', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const json = await res.json();
    if (res.ok) {
      setManufacturers(prev => [...prev, { ...json.manufacturer, products: [] }]);
      setShowAdd(false);
    }
  }

  const uniqueTerms  = [...new Set(manufacturers.map(m => m.terms).filter(Boolean))].sort();
  const uniqueStates = [...new Set(manufacturers.map(m => m.state).filter(Boolean))].sort();
  const setupYes = manufacturers.filter(m => m.setupToSell).length;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">

      {/* ── Header ── */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between sticky top-0 z-20">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Manufacturers</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            {filtered.length} of {manufacturers.length} · {setupYes} setup to sell
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Search */}
          <div className="relative">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search…"
              className="pl-8 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 w-52" />
          </div>
          <button onClick={() => setShowAdd(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
            Add
          </button>
        </div>
      </div>

      <div className="bg-white border-b border-slate-200 px-6 py-3">
        <FilterToolbar count={countFilters(view.filters, FILTER_FIELDS)} open={filtersOpen} onToggle={() => setFiltersOpen(o => !o)}
          onClear={view.clearFilters} shown={filtered.length} total={manufacturers.length} noun="manufacturers" />
        <FilterPanel open={filtersOpen} fields={FILTER_FIELDS} filters={view.filters}
          choices={{ terms: uniqueTerms, state: uniqueStates }} onChange={view.setFilter} />
      </div>

      {/* ── Table ── */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-xs" style={{ minWidth: '1300px' }}>
          <thead className="sticky top-0 z-10 bg-slate-50 border-b-2 border-slate-200">
            <tr>
              {COLS.map(col => (
                <th key={col.key}
                  className={`px-3 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap select-none ${col.align === 'right' ? 'text-right' : 'text-left'} ${col.key === 'name' ? 'sticky left-0 bg-slate-50 border-r border-slate-200 z-20' : ''} ${col.sortable ? 'cursor-pointer hover:text-slate-700 hover:bg-slate-100 transition-colors' : ''}`}
                  onClick={() => col.sortable && toggleSort(col.key)}>
                  <div className={`flex items-center gap-1 ${col.align === 'right' ? 'justify-end' : ''}`}>
                    {col.label}
                    {col.sortable && <SortIcon dir={sortKey === col.key ? sortDir : null} />}
                  </div>
                </th>
              ))}
              <th className="w-10 sticky right-0 bg-slate-50"></th>
            </tr>
          </thead>
          <tbody>
            {showAdd && <AddRow onAdd={addMfr} onCancel={() => setShowAdd(false)} />}
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={COLS.length + 1} className="px-6 py-20 text-center text-slate-400">
                  {manufacturers.length === 0 ? 'No manufacturers yet. Click Add to get started.' : 'No results match your filters.'}
                </td>
              </tr>
            ) : (
              filtered.map(mfr => (
                <MfrRow key={mfr.id} mfr={mfr} onPatch={patchMfr} onDelete={deleteMfr} />
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ── Footer count ── */}
      <div className="bg-white border-t border-slate-200 px-6 py-2 flex items-center gap-4 text-[10px] text-slate-400 shrink-0">
        <span>{filtered.length} row{filtered.length !== 1 ? 's' : ''} shown</span>
        {filtered.length !== manufacturers.length && <span>({manufacturers.length - filtered.length} hidden by filters)</span>}
        <span className="ml-auto">Click any cell to edit inline</span>
      </div>
    </div>
  );
}
