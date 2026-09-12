'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { setArchived } from '@/components/salesAutomation/ConfirmArchiveModal';

const FIXTURE_TYPES = ['FIXTURE', 'CONTROL_DEVICE'];

const COLS = [
  { key: 'numericId',    label: '#',           width: 'w-16',  align: 'right', sortable: true  },
  { key: 'mfrName',      label: 'Manufacturer', width: 'w-48',  align: 'left',  sortable: true  },
  { key: 'partNumber',   label: 'Part Number',  width: 'w-44',  align: 'left',  sortable: true  },
  { key: 'description',  label: 'Description',  width: 'w-72',  align: 'left',  sortable: false },
  { key: 'fixtureType',  label: 'Type',         width: 'w-28',  align: 'left',  sortable: true  },
  { key: 'cct',          label: 'CCT',          width: 'w-24',  align: 'left',  sortable: false },
  { key: 'wattage',      label: 'Watts',        width: 'w-16',  align: 'right', sortable: true  },
  { key: 'dimming',      label: 'Dimming',      width: 'w-28',  align: 'left',  sortable: false },
  { key: 'finish',       label: 'Finish',       width: 'w-24',  align: 'left',  sortable: false },
  { key: 'voltage',      label: 'Voltage',      width: 'w-20',  align: 'left',  sortable: false },
  { key: 'mounting',     label: 'Mounting',     width: 'w-24',  align: 'left',  sortable: false },
  { key: 'cost',         label: 'Cost',         width: 'w-20',  align: 'right', sortable: true  },
  { key: 'salePrice',    label: 'Sale Price',   width: 'w-24',  align: 'right', sortable: true  },
  { key: 'notes',        label: 'Notes',        width: 'w-48',  align: 'left',  sortable: false },
];

function SortIcon({ dir }) {
  if (!dir) return (
    <svg className="w-3 h-3 text-slate-300 ml-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l4-4 4 4M16 15l-4 4-4-4" />
    </svg>
  );
  return (
    <svg className="w-3 h-3 text-blue-500 ml-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d={dir === 'asc' ? 'M4.5 15.75l7.5-7.5 7.5 7.5' : 'M19.5 8.25l-7.5 7.5-7.5-7.5'} />
    </svg>
  );
}

function fmtMoney(n) {
  if (n == null) return '';
  return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function TypeBadge({ type }) {
  if (!type) return <span className="text-slate-300 text-[10px]">—</span>;
  const isControl = type === 'CONTROL_DEVICE';
  return (
    <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${isControl ? 'bg-violet-100 text-violet-700' : 'bg-blue-100 text-blue-700'}`}>
      {isControl ? 'Control' : 'Fixture'}
    </span>
  );
}

// Inline editable cell
function EditCell({ value, onSave, type = 'text', options, placeholder = '—', mono = false, align = 'left' }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState('');
  const ref = useRef(null);

  function start(e) {
    e.stopPropagation();
    setVal(value != null ? String(value) : '');
    setEditing(true);
    setTimeout(() => ref.current?.focus(), 0);
  }

  function commit() {
    setEditing(false);
    const trimmed = String(val).trim();
    const out = trimmed === '' ? null : (type === 'number' ? (isNaN(parseFloat(trimmed)) ? null : parseFloat(trimmed)) : trimmed);
    if (out !== (value ?? null)) onSave(out);
  }

  if (type === 'select') {
    return (
      <select value={value ?? ''} onClick={e => e.stopPropagation()}
        onChange={e => { onSave(e.target.value || null); }}
        className="w-full bg-transparent text-xs focus:outline-none focus:ring-1 focus:ring-blue-300 rounded px-0.5 cursor-pointer">
        <option value="">—</option>
        {options.map(o => <option key={o} value={o}>{o === 'CONTROL_DEVICE' ? 'Control' : o === 'FIXTURE' ? 'Fixture' : o}</option>)}
      </select>
    );
  }

  if (editing) {
    return (
      <input ref={ref} value={val} onChange={e => setVal(e.target.value)}
        onBlur={commit} onClick={e => e.stopPropagation()}
        onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setEditing(false); } }}
        className={`w-full bg-blue-50 border border-blue-300 rounded px-1 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400 ${mono ? 'font-mono' : ''} ${align === 'right' ? 'text-right' : 'text-left'}`}
      />
    );
  }

  return (
    <span onClick={start}
      className={`block w-full px-1 py-0.5 rounded cursor-text hover:bg-blue-50 hover:ring-1 hover:ring-blue-200 transition-all text-xs ${mono ? 'font-mono' : ''} ${align === 'right' ? 'text-right' : 'text-left'} ${value == null ? 'text-slate-300' : ''}`}>
      {value != null ? (type === 'number' && typeof value === 'number' && (value >= 100 || String(value).includes('.')) ? fmtMoney(value) : String(value)) : placeholder}
    </span>
  );
}

export default function ProductsClient({ manufacturers, isAdmin }) {
  const [products,      setProducts]      = useState([]);
  const [total,         setTotal]         = useState(0);
  const [loading,       setLoading]       = useState(true);
  const [search,        setSearch]        = useState('');
  const [mfrFilter,     setMfrFilter]     = useState('');
  const [typeFilter,    setTypeFilter]    = useState('');
  const [sortKey,       setSortKey]       = useState('mfrName');
  const [sortDir,       setSortDir]       = useState('asc');
  const [page,          setPage]          = useState(1);
  const [confirmId,     setConfirmId]     = useState(null);
  const [deletingId,    setDeletingId]    = useState(null);
  const limit = 100;
  const searchTimer = useRef(null);

  const fetchProducts = useCallback(async (opts = {}) => {
    setLoading(true);
    const params = new URLSearchParams({
      search:         opts.search      ?? search,
      manufacturerId: opts.mfrFilter   ?? mfrFilter,
      fixtureType:    opts.typeFilter  ?? typeFilter,
      page:           String(opts.page ?? page),
      limit:          String(limit),
    });
    const res  = await fetch(`/api/products?${params}`);
    const data = await res.json();

    let rows = data.products || [];
    const sk = opts.sortKey ?? sortKey;
    const sd = opts.sortDir ?? sortDir;
    rows = [...rows].sort((a, b) => {
      let av = sk === 'mfrName' ? (a.manufacturer?.name || '') : (a[sk] ?? '');
      let bv = sk === 'mfrName' ? (b.manufacturer?.name || '') : (b[sk] ?? '');
      if (typeof av === 'number' && typeof bv === 'number') return sd === 'asc' ? av - bv : bv - av;
      return sd === 'asc' ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
    });

    setProducts(rows);
    setTotal(data.total || 0);
    setLoading(false);
  }, [search, mfrFilter, typeFilter, sortKey, sortDir, page]);

  useEffect(() => { fetchProducts(); }, []);

  function handleSearch(val) {
    setSearch(val);
    setPage(1);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => fetchProducts({ search: val, page: 1 }), 300);
  }

  function handleFilter(key, val) {
    if (key === 'mfrFilter') { setMfrFilter(val); fetchProducts({ mfrFilter: val, page: 1 }); setPage(1); }
    if (key === 'typeFilter') { setTypeFilter(val); fetchProducts({ typeFilter: val, page: 1 }); setPage(1); }
  }

  function handleSort(key) {
    const newDir = sortKey === key && sortDir === 'asc' ? 'desc' : 'asc';
    setSortKey(key);
    setSortDir(newDir);
    fetchProducts({ sortKey: key, sortDir: newDir });
  }

  // Products are archived, never deleted (Mike, 2026-09-11). The row only
  // leaves the list once the server has really archived it.
  async function archiveProduct(id) {
    setDeletingId(id);
    const problem = await setArchived(`/api/products/${id}`);
    setConfirmId(null);
    setDeletingId(null);
    if (problem) { alert(problem); return; }
    setProducts(prev => prev.filter(x => x.id !== id));
    setTotal(prev => prev - 1);
  }

  async function patchProduct(id, field, value) {
    const p = products.find(x => x.id === id);
    if (!p) return;
    // Optimistic update
    setProducts(prev => prev.map(x => x.id === id ? { ...x, [field]: value } : x));
    const res = await fetch(`/api/products/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: value }),
    });
    if (!res.ok) {
      // Revert on error
      setProducts(prev => prev.map(x => x.id === id ? p : x));
    }
  }

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">

      {/* ── Top bar ── */}
      <div className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <Link href="/pre-con" className="text-slate-400 hover:text-slate-600 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-violet-600 uppercase tracking-wider">Pre-Con</span>
              <span className="text-slate-300">·</span>
              <span className="text-sm font-semibold text-slate-900">Product Catalog</span>
            </div>
            <p className="text-[10px] text-slate-400">Click any cell to edit · Click row to open detail</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span className="font-semibold text-slate-700">{total.toLocaleString()}</span> total products
        </div>
      </div>

      {/* ── Filters ── */}
      <div className="bg-white border-b border-slate-100 px-6 py-2.5 flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48 max-w-72">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input value={search} onChange={e => handleSearch(e.target.value)}
            placeholder="Search part #, description, manufacturer…"
            className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400" />
        </div>

        <select value={mfrFilter} onChange={e => handleFilter('mfrFilter', e.target.value)}
          className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 max-w-48">
          <option value="">All Manufacturers</option>
          {manufacturers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>

        <select value={typeFilter} onChange={e => handleFilter('typeFilter', e.target.value)}
          className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400">
          <option value="">All Types</option>
          <option value="FIXTURE">Fixtures</option>
          <option value="CONTROL_DEVICE">Control Devices</option>
        </select>

        {(search || mfrFilter || typeFilter) && (
          <button onClick={() => { setSearch(''); setMfrFilter(''); setTypeFilter(''); setPage(1); fetchProducts({ search: '', mfrFilter: '', typeFilter: '', page: 1 }); }}
            className="text-xs text-slate-500 hover:text-red-600 px-2 py-1.5 rounded-lg hover:bg-red-50 transition-colors">
            Clear filters
          </button>
        )}
      </div>

      {/* ── Table ── */}
      <div className="flex-1 px-6 py-4">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs" style={{ minWidth: '1100px' }}>
              <thead className="sticky top-0 z-10">
                <tr className="bg-slate-50 border-b-2 border-slate-200 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  {COLS.map(col => (
                    <th key={col.key}
                      className={`px-3 py-2.5 ${col.align === 'right' ? 'text-right' : 'text-left'} ${col.width} ${col.sortable ? 'cursor-pointer select-none hover:text-slate-800' : ''}`}
                      onClick={col.sortable ? () => handleSort(col.key) : undefined}>
                      <span className="flex items-center gap-0.5 whitespace-nowrap">
                        {col.align === 'right' && col.sortable && <SortIcon dir={sortKey === col.key ? sortDir : null} />}
                        {col.label}
                        {col.align !== 'right' && col.sortable && <SortIcon dir={sortKey === col.key ? sortDir : null} />}
                      </span>
                    </th>
                  ))}
                  <th className="w-8"></th>
                  {isAdmin && <th className="w-8"></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {loading && (
                  <tr>
                    <td colSpan={COLS.length + 1 + (isAdmin ? 1 : 0)} className="px-4 py-12 text-center text-slate-400 text-xs">
                      <svg className="animate-spin w-5 h-5 mx-auto mb-2 text-blue-400" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
                      </svg>
                      Loading…
                    </td>
                  </tr>
                )}
                {!loading && products.length === 0 && (
                  <tr>
                    <td colSpan={COLS.length + 1 + (isAdmin ? 1 : 0)} className="px-4 py-12 text-center text-slate-400 text-xs">
                      No products found{search ? ` matching "${search}"` : ''}.
                    </td>
                  </tr>
                )}
                {!loading && products.map(p => (
                  <tr key={p.id} className="hover:bg-slate-50/80 transition-colors group">
                    <td className="px-3 py-1.5 text-right font-mono text-[10px] text-slate-400">{p.numericId}</td>
                    <td className="px-3 py-1.5 font-medium text-slate-700 truncate max-w-[12rem]">
                      <Link href={`/manufacturers/${p.manufacturerId}`}
                        className="hover:text-blue-600 hover:underline transition-colors text-xs" title={p.manufacturer?.name}>
                        {p.manufacturer?.name || '—'}
                      </Link>
                    </td>
                    <td className="px-3 py-1.5">
                      <EditCell value={p.partNumber} mono onSave={v => patchProduct(p.id, 'partNumber', v)}
                        placeholder="—" />
                    </td>
                    <td className="px-3 py-1.5 max-w-[18rem]">
                      <EditCell value={p.description} onSave={v => patchProduct(p.id, 'description', v)} />
                    </td>
                    <td className="px-3 py-1.5">
                      <EditCell value={p.fixtureType} type="select" options={FIXTURE_TYPES}
                        onSave={v => patchProduct(p.id, 'fixtureType', v)} />
                    </td>
                    <td className="px-3 py-1.5">
                      <EditCell value={p.cct} onSave={v => patchProduct(p.id, 'cct', v)} />
                    </td>
                    <td className="px-3 py-1.5">
                      <EditCell value={p.wattage} type="number" align="right" onSave={v => patchProduct(p.id, 'wattage', v)} />
                    </td>
                    <td className="px-3 py-1.5">
                      <EditCell value={p.dimming} onSave={v => patchProduct(p.id, 'dimming', v)} />
                    </td>
                    <td className="px-3 py-1.5">
                      <EditCell value={p.finish} onSave={v => patchProduct(p.id, 'finish', v)} />
                    </td>
                    <td className="px-3 py-1.5">
                      <EditCell value={p.voltage} onSave={v => patchProduct(p.id, 'voltage', v)} />
                    </td>
                    <td className="px-3 py-1.5">
                      <EditCell value={p.mounting} onSave={v => patchProduct(p.id, 'mounting', v)} />
                    </td>
                    <td className="px-3 py-1.5">
                      <EditCell value={p.cost} type="number" align="right" onSave={v => patchProduct(p.id, 'cost', v)} />
                    </td>
                    <td className="px-3 py-1.5">
                      <EditCell value={p.salePrice} type="number" align="right" onSave={v => patchProduct(p.id, 'salePrice', v)} />
                    </td>
                    <td className="px-3 py-1.5 max-w-[12rem]">
                      <EditCell value={p.notes} onSave={v => patchProduct(p.id, 'notes', v)} />
                    </td>
                    <td className="px-2 py-1.5">
                      <Link href={`/products/${p.id}`}
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-blue-600"
                        title="Open detail">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                        </svg>
                      </Link>
                    </td>
                    {isAdmin && (
                      <td className="px-2 py-1.5">
                        {confirmId === p.id ? (
                          <div className="flex items-center gap-1">
                            <button onClick={() => archiveProduct(p.id)} disabled={deletingId === p.id}
                              title="Archive it. Restore any time from the Archive page."
                              className="text-[10px] px-1.5 py-0.5 rounded bg-amber-600 text-white hover:bg-amber-500 disabled:opacity-50 transition-colors">
                              {deletingId === p.id ? '…' : 'Archive'}
                            </button>
                            <button onClick={() => setConfirmId(null)}
                              className="text-[10px] px-1.5 py-0.5 rounded border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors">
                              Keep
                            </button>
                          </div>
                        ) : (
                          <button onClick={e => { e.stopPropagation(); setConfirmId(p.id); }}
                            className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-300 hover:text-amber-600"
                            title="Archive product">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                            </svg>
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
            <span>
              Showing {((page - 1) * limit + 1).toLocaleString()}–{Math.min(page * limit, total).toLocaleString()} of {total.toLocaleString()}
            </span>
            <div className="flex items-center gap-1">
              <button onClick={() => { const p = page - 1; setPage(p); fetchProducts({ page: p }); }} disabled={page === 1}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                ← Prev
              </button>
              <span className="px-3 py-1.5">{page} / {totalPages}</span>
              <button onClick={() => { const p = page + 1; setPage(p); fetchProducts({ page: p }); }} disabled={page >= totalPages}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                Next →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
