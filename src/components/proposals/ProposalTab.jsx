'use client';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';

// ── Constants ─────────────────────────────────────────────────────────────────

const MERGE_TOKENS = [
  { token: '{clientName}',      label: 'Client Name' },
  { token: '{clientLegalName}', label: 'Client Legal Name' },
  { token: '{projectName}',     label: 'Project Name' },
  { token: '{location}',        label: 'Location' },
  { token: '{effectiveDate}',   label: 'Effective Date' },
  { token: '{fee}',             label: 'Fee Amount' },
  { token: '{ilcSigner}',       label: 'ILC Signer' },
];

const STATUS_META = {
  DRAFT:    { label: 'Draft',    color: 'bg-amber-100 text-amber-700 border-amber-200' },
  SENT:     { label: 'Sent',     color: 'bg-blue-100 text-blue-700 border-blue-200' },
  ACCEPTED: { label: 'Accepted', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  DECLINED: { label: 'Declined', color: 'bg-red-100 text-red-700 border-red-200' },
};
// Expired retired 2026-09-18 (Maram 9-17) — read-only for rows that already have it.
const LEGACY_STATUS_META = {
  EXPIRED:  { label: 'Expired',  color: 'bg-slate-100 text-slate-500 border-slate-200' },
};

const ROLE_LABELS = {
  SR_DESIGNER: 'Sr Designer',
  DESIGNER:    'Designer',
  SALES:       'Sales',
  OUTSOURCE:   'Outsource',
};

const ROLE_FIELDS = {
  SR_DESIGNER: 'srHours',
  DESIGNER:    'designerHours',
  SALES:       'salesHours',
  OUTSOURCE:   'outsourceHours',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtMoney(v) {
  if (!v && v !== 0) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v);
}

function fmtDate(d) {
  if (!d) return '';
  return new Date(d).toISOString().slice(0, 10);
}

function computeFee(lineItems, rates, adderPct) {
  if (!lineItems?.length) return 0;
  const labor = lineItems.reduce((sum, item) => {
    return sum
      + (item.srHours       || 0) * (rates.SR_DESIGNER || 180)
      + (item.designerHours || 0) * (rates.DESIGNER    || 115)
      + (item.salesHours    || 0) * (rates.SALES       || 160)
      + (item.outsourceHours|| 0) * (rates.OUTSOURCE   || 115);
  }, 0);
  return Math.round(labor * (1 + (adderPct || 0) / 100));
}

function StatusBadge({ status }) {
  const m = STATUS_META[status] || LEGACY_STATUS_META[status] || STATUS_META.DRAFT;
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${m.color}`}>
      {m.label}
    </span>
  );
}

// ── Toolbar ───────────────────────────────────────────────────────────────────

function RichToolbar({ editorRef, onInsertToken }) {
  function cmd(command, value) {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
  }
  return (
    <div className="flex items-center gap-0.5 flex-wrap px-3 py-2 border-b border-slate-200 bg-slate-50">
      <button onMouseDown={e => { e.preventDefault(); cmd('bold'); }}
        className="px-2 py-1 rounded text-sm font-bold text-slate-500 hover:bg-slate-200 transition-colors select-none">B</button>
      <button onMouseDown={e => { e.preventDefault(); cmd('italic'); }}
        className="px-2 py-1 rounded text-sm italic text-slate-500 hover:bg-slate-200 transition-colors select-none">I</button>
      <button onMouseDown={e => { e.preventDefault(); cmd('underline'); }}
        className="px-2 py-1 rounded text-sm underline text-slate-500 hover:bg-slate-200 transition-colors select-none">U</button>
      <div className="w-px h-4 bg-slate-300 mx-1" />
      <button onMouseDown={e => { e.preventDefault(); cmd('formatBlock', 'h2'); }}
        className="px-2 py-1 rounded text-sm font-semibold text-slate-500 hover:bg-slate-200 transition-colors select-none">H2</button>
      <button onMouseDown={e => { e.preventDefault(); cmd('formatBlock', 'p'); }}
        className="px-2 py-1 rounded text-sm text-slate-500 hover:bg-slate-200 transition-colors select-none">¶</button>
      <div className="w-px h-4 bg-slate-300 mx-1" />
      <button onMouseDown={e => { e.preventDefault(); cmd('insertUnorderedList'); }}
        className="px-2 py-1 rounded text-sm text-slate-500 hover:bg-slate-200 transition-colors select-none">• List</button>
      <button onMouseDown={e => { e.preventDefault(); cmd('insertOrderedList'); }}
        className="px-2 py-1 rounded text-sm text-slate-500 hover:bg-slate-200 transition-colors select-none">1. List</button>
      <div className="w-px h-4 bg-slate-300 mx-1" />
      <div className="relative group">
        <button className="px-2 py-1 rounded text-[11px] font-mono text-violet-600 bg-violet-50 hover:bg-violet-100 border border-violet-200 transition-colors select-none">
          {'{…}'}
        </button>
        <div className="absolute top-full left-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-30 hidden group-hover:block min-w-[180px]">
          {MERGE_TOKENS.map(t => (
            <button key={t.token}
              onMouseDown={e => { e.preventDefault(); onInsertToken(t.token); }}
              className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 flex items-center justify-between gap-4 first:rounded-t-xl last:rounded-b-xl">
              <span className="text-slate-700">{t.label}</span>
              <span className="text-[10px] font-mono text-violet-400">{t.token}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Send Modal ────────────────────────────────────────────────────────────────

function SendModal({ proposal, onClose, onSent }) {
  const [recipients, setRecipients] = useState('');
  const [note,       setNote]       = useState('');
  const [sending,    setSending]    = useState(false);
  const [err,        setErr]        = useState('');

  async function send() {
    setSending(true);
    setErr('');
    try {
      const res = await fetch(`/api/proposals/${proposal.id}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipients: recipients.split(',').map(s => s.trim()).filter(Boolean), note }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      onSent(data);
    } catch (e) {
      setErr(e.message);
    } finally {
      setSending(false);
    }
  }

  const pdfUrl = `/api/proposals/${proposal.id}/pdf`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-bold text-slate-900">Send Proposal</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div>
            <p className="text-xs text-slate-500 mb-3">
              This marks the proposal as <strong>Sent</strong> and logs a record with the current document snapshot.
            </p>
            <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
              PDF Preview
            </label>
            <a href={pdfUrl} target="_blank" rel="noreferrer"
              className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 hover:underline">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              Open PDF in new tab
            </a>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
              Recipients (comma separated)
            </label>
            <input value={recipients} onChange={e => setRecipients(e.target.value)}
              placeholder="client@example.com, pm@example.com"
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-400" />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
              Note (optional)
            </label>
            <textarea value={note} onChange={e => setNote(e.target.value)}
              rows={3} placeholder="Please review and sign…"
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-400 resize-none" />
          </div>
          {err && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</p>}
          <div className="flex gap-3 pt-1">
            <button onClick={onClose} className="flex-1 px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancel</button>
            <button onClick={send} disabled={sending}
              className="flex-1 px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 disabled:opacity-50">
              {sending ? 'Sending…' : 'Mark as Sent'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Fee Breakdown Tab ─────────────────────────────────────────────────────────

const SORT_COLS = {
  area:           { label: 'Area',       numeric: false },
  task:           { label: 'Task',       numeric: false },
  srHours:        { label: 'Sr Designer', numeric: true },
  designerHours:  { label: 'Designer',   numeric: true },
  salesHours:     { label: 'Sales',      numeric: true },
  outsourceHours: { label: 'Outsource',  numeric: true },
  _cost:          { label: 'Cost',       numeric: true },
};

function itemCost(it, rates) {
  return (it.srHours        || 0) * (rates.SR_DESIGNER || 180)
       + (it.designerHours  || 0) * (rates.DESIGNER    || 115)
       + (it.salesHours     || 0) * (rates.SALES       || 160)
       + (it.outsourceHours || 0) * (rates.OUTSOURCE   || 115);
}

function SortIcon({ active, dir }) {
  if (!active) return <span className="ml-0.5 text-slate-300 text-[9px]">⇅</span>;
  return <span className="ml-0.5 text-orange-500 text-[9px]">{dir === 'asc' ? '▲' : '▼'}</span>;
}

function CalculatorTab({ proposal, lineItems, onLineItemsChange, rates }) {
  const [localItems, setLocalItems] = useState(() =>
    lineItems.map((it, i) => ({ ...it, _key: it.id || `new-${i}` }))
  );
  const [saving,  setSaving]  = useState(false);
  const [err,     setErr]     = useState('');
  const [sortKey, setSortKey] = useState('area');
  const [sortDir, setSortDir] = useState('asc');

  useEffect(() => {
    setLocalItems(lineItems.map((it, i) => ({ ...it, _key: it.id || `new-${i}` })));
  }, [lineItems]);

  function handleSort(key) {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir(SORT_COLS[key]?.numeric ? 'desc' : 'asc');
    }
  }

  const sortedItems = useMemo(() => {
    return [...localItems].sort((a, b) => {
      const av = sortKey === '_cost' ? itemCost(a, rates) : (a[sortKey] ?? (SORT_COLS[sortKey]?.numeric ? 0 : ''));
      const bv = sortKey === '_cost' ? itemCost(b, rates) : (b[sortKey] ?? (SORT_COLS[sortKey]?.numeric ? 0 : ''));
      if (typeof av === 'string') {
        const cmp = av.toLowerCase().localeCompare(bv.toString().toLowerCase());
        return sortDir === 'asc' ? cmp : -cmp;
      }
      return sortDir === 'asc' ? av - bv : bv - av;
    });
  }, [localItems, sortKey, sortDir, rates]);

  function updateItem(key, field, val) {
    setLocalItems(prev => prev.map(it => it._key === key ? { ...it, [field]: val } : it));
  }

  function addRow() {
    const k = `new-${Date.now()}`;
    setLocalItems(prev => [...prev, {
      _key: k, _new: true, area: '', task: '',
      srHours: 0, designerHours: 0, salesHours: 0, outsourceHours: 0,
      sortOrder: prev.length,
    }]);
  }

  function removeRow(key) {
    setLocalItems(prev => prev.filter(it => it._key !== key));
  }

  async function saveItems() {
    setSaving(true);
    setErr('');
    try {
      const res = await fetch(`/api/proposals/${proposal.id}/line-items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: localItems.map((it, idx) => ({
            area: it.area, task: it.task, sortOrder: idx,
            srHours: it.srHours || 0, designerHours: it.designerHours || 0,
            salesHours: it.salesHours || 0, outsourceHours: it.outsourceHours || 0,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      onLineItemsChange(data.lineItems, data.calculatedFee);
      setLocalItems(data.lineItems.map((it, i) => ({ ...it, _key: it.id || `new-${i}` })));
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  }

  // Grand totals across all items
  const totals = useMemo(() => {
    const hrs = Object.keys(ROLE_LABELS).reduce((acc, role) => {
      acc[role] = localItems.reduce((s, it) => s + (it[ROLE_FIELDS[role]] || 0), 0);
      return acc;
    }, {});
    const labor   = computeFee(localItems, rates, 0);
    const withAdd = computeFee(localItems, rates, proposal.adderPct);
    return { hrs, labor, withAdd };
  }, [localItems, rates, proposal.adderPct]);

  // Build display rows: task rows + subtotal rows after each contiguous area group
  const displayRows = useMemo(() => {
    const rows = [];
    let groupItems = [];
    let prevArea   = null;

    function pushSubtotal(area, items) {
      const hrs = Object.keys(ROLE_LABELS).reduce((acc, role) => {
        acc[role] = items.reduce((s, it) => s + (it[ROLE_FIELDS[role]] || 0), 0);
        return acc;
      }, {});
      rows.push({ type: 'subtotal', area, hrs, cost: items.reduce((s, it) => s + itemCost(it, rates), 0) });
    }

    for (const it of sortedItems) {
      if (it.area !== prevArea && prevArea !== null) {
        pushSubtotal(prevArea, groupItems);
        groupItems = [];
      }
      rows.push({ type: 'row', item: it });
      groupItems.push(it);
      prevArea = it.area;
    }
    if (groupItems.length > 0) pushSubtotal(prevArea, groupItems);
    return rows;
  }, [sortedItems, rates]);

  const inputCls = 'w-full text-xs bg-transparent border-0 focus:outline-none focus:ring-1 focus:ring-orange-300 rounded px-1 py-0.5';
  const numCls   = 'w-14 text-xs text-right bg-transparent border-0 focus:outline-none focus:ring-1 focus:ring-orange-300 rounded px-1 py-0.5';
  const thCls    = 'px-2 py-2.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wide cursor-pointer select-none hover:text-slate-600 hover:bg-slate-100 transition-colors';

  return (
    <div className="space-y-4">

      {/* ── Grand Total Summary ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        {Object.entries(ROLE_LABELS).map(([role, label]) => {
          const hrs  = totals.hrs[role];
          const cost = hrs * (rates[role] || 0);
          return (
            <div key={role} className="bg-white border border-slate-200 rounded-xl px-3 py-2.5">
              <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">{label}</div>
              <div className="text-sm font-bold text-slate-800 mt-0.5">{hrs % 1 === 0 ? hrs : hrs.toFixed(1)} <span className="text-[10px] font-normal text-slate-400">hrs</span></div>
              <div className="text-[11px] text-slate-500 font-mono">{fmtMoney(cost)}</div>
            </div>
          );
        })}
        <div className="bg-white border border-slate-200 rounded-xl px-3 py-2.5">
          <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Labor</div>
          <div className="text-sm font-bold text-slate-800 mt-0.5 font-mono">{fmtMoney(totals.labor)}</div>
          <div className="text-[11px] text-slate-500">before adder</div>
        </div>
        <div className="bg-orange-50 border border-orange-200 rounded-xl px-3 py-2.5">
          <div className="text-[10px] font-semibold text-orange-600 uppercase tracking-wide">Total Fee</div>
          <div className="text-sm font-bold text-slate-900 mt-0.5 font-mono">{fmtMoney(totals.withAdd)}</div>
          <div className="text-[11px] text-orange-500">+{proposal.adderPct}% adder</div>
        </div>
      </div>

      {/* ── Task Table ── */}
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className={`${thCls} text-left w-32`} onClick={() => handleSort('area')}>
                Area <SortIcon active={sortKey === 'area'} dir={sortDir} />
              </th>
              <th className={`${thCls} text-left`} onClick={() => handleSort('task')}>
                Task <SortIcon active={sortKey === 'task'} dir={sortDir} />
              </th>
              {Object.entries(ROLE_FIELDS).map(([role, field]) => (
                <th key={role} className={`${thCls} text-right`} onClick={() => handleSort(field)}>
                  {ROLE_LABELS[role]} <SortIcon active={sortKey === field} dir={sortDir} />
                </th>
              ))}
              <th className={`${thCls} text-right`} onClick={() => handleSort('_cost')}>
                Cost <SortIcon active={sortKey === '_cost'} dir={sortDir} />
              </th>
              <th className="w-7" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {displayRows.map((row, ri) => {
              if (row.type === 'subtotal') {
                return (
                  <tr key={`sub-${ri}`} className="bg-slate-50 border-t border-slate-200">
                    <td className="px-3 py-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-wide" colSpan={2}>
                      {row.area || '(no area)'} — subtotal
                    </td>
                    {Object.keys(ROLE_LABELS).map(role => (
                      <td key={role} className="px-2 py-1.5 text-right text-[11px] font-semibold text-slate-600">
                        {row.hrs[role] % 1 === 0 ? row.hrs[role] : row.hrs[role].toFixed(1)}
                      </td>
                    ))}
                    <td className="px-2 py-1.5 text-right text-[11px] font-semibold text-slate-700 font-mono">
                      {fmtMoney(row.cost)}
                    </td>
                    <td />
                  </tr>
                );
              }
              const it   = row.item;
              const cost = itemCost(it, rates);
              return (
                <tr key={it._key} className="hover:bg-slate-50 group">
                  <td className="px-2 py-1.5">
                    <input value={it.area} onChange={e => updateItem(it._key, 'area', e.target.value)}
                      className={inputCls} placeholder="Area…" />
                  </td>
                  <td className="px-2 py-1.5">
                    <input value={it.task} onChange={e => updateItem(it._key, 'task', e.target.value)}
                      className={inputCls} placeholder="Task…" />
                  </td>
                  {Object.keys(ROLE_LABELS).map(role => (
                    <td key={role} className="px-2 py-1.5">
                      <input type="number" min="0" step="0.5"
                        value={it[ROLE_FIELDS[role]]}
                        onChange={e => updateItem(it._key, ROLE_FIELDS[role], parseFloat(e.target.value) || 0)}
                        className={numCls} />
                    </td>
                  ))}
                  <td className="px-2 py-1.5 text-right text-slate-500 font-mono whitespace-nowrap">{fmtMoney(cost)}</td>
                  <td className="px-2 py-1.5 text-right">
                    <button onClick={() => removeRow(it._key)}
                      className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 transition-all">×</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-slate-100 border-t-2 border-slate-300 font-bold">
              <td colSpan={2} className="px-3 py-2 text-xs text-slate-600">Grand Total</td>
              {Object.keys(ROLE_LABELS).map(role => (
                <td key={role} className="px-2 py-2 text-right text-xs text-slate-700">
                  {totals.hrs[role] % 1 === 0 ? totals.hrs[role] : totals.hrs[role].toFixed(1)}
                </td>
              ))}
              <td className="px-2 py-2 text-right text-xs font-bold text-slate-900 font-mono">
                {fmtMoney(totals.labor)}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <button onClick={addRow}
          className="text-xs text-slate-400 hover:text-slate-600 transition-colors flex items-center gap-1">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Add row
        </button>
        <div className="flex items-center gap-4 text-[11px] text-slate-400">
          {Object.entries(ROLE_LABELS).map(([role, label]) => (
            <span key={role}>{label}: <strong>${rates[role] || '—'}/hr</strong></span>
          ))}
        </div>
      </div>

      {err && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</p>}

      <div className="flex justify-end">
        <button onClick={saveItems} disabled={saving}
          className="px-5 py-2 rounded-xl bg-orange-500 text-white text-sm font-bold hover:bg-orange-600 transition-colors disabled:opacity-50">
          {saving ? 'Saving…' : 'Save & Recalculate Fee'}
        </button>
      </div>
    </div>
  );
}

// ── Milestones Tab ────────────────────────────────────────────────────────────

function MilestonesTab({ proposal, onUpdate }) {
  const [milestones, setMilestones] = useState(() => {
    try { return proposal.milestoneSplit ? JSON.parse(proposal.milestoneSplit) : []; }
    catch { return []; }
  });
  const [saving, setSaving] = useState(false);

  function update(idx, field, val) {
    setMilestones(prev => prev.map((m, i) => i === idx ? { ...m, [field]: val } : m));
  }
  function add() { setMilestones(prev => [...prev, { label: '', pct: 0 }]); }
  function remove(idx) { setMilestones(prev => prev.filter((_, i) => i !== idx)); }

  const total = milestones.reduce((s, m) => s + (parseFloat(m.pct) || 0), 0);
  const activeFee = (proposal.overrideActive && proposal.overrideFee != null)
    ? proposal.overrideFee : proposal.calculatedFee;

  async function save() {
    setSaving(true);
    await fetch(`/api/proposals/${proposal.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ milestoneSplit: JSON.stringify(milestones) }),
    });
    onUpdate({ milestoneSplit: JSON.stringify(milestones) });
    setSaving(false);
  }

  return (
    <div className="space-y-4 max-w-lg">
      <p className="text-xs text-slate-400">Milestone payment schedule shown on the client PDF.</p>
      <div className="space-y-2">
        {milestones.map((m, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <input value={m.label} onChange={e => update(idx, 'label', e.target.value)}
              placeholder="Milestone label…"
              className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-400" />
            <input type="number" min="0" max="100" step="1"
              value={m.pct} onChange={e => update(idx, 'pct', parseFloat(e.target.value) || 0)}
              className="w-20 text-sm text-right border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-400" />
            <span className="text-sm text-slate-400">%</span>
            {activeFee > 0 && (
              <span className="text-sm text-slate-500 w-24 text-right font-mono">
                {fmtMoney(activeFee * m.pct / 100)}
              </span>
            )}
            <button onClick={() => remove(idx)} className="text-slate-300 hover:text-red-500 transition-colors text-lg leading-none">×</button>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between">
        <button onClick={add}
          className="text-xs text-slate-400 hover:text-slate-600 transition-colors flex items-center gap-1">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Add milestone
        </button>
        <span className={`text-xs font-semibold ${total === 100 ? 'text-emerald-600' : 'text-amber-600'}`}>
          {total}% {total !== 100 && '(must total 100)'}
        </span>
      </div>
      <div className="flex justify-end">
        <button onClick={save} disabled={saving}
          className="px-5 py-2 rounded-xl bg-orange-500 text-white text-sm font-bold hover:bg-orange-600 transition-colors disabled:opacity-50">
          {saving ? 'Saving…' : 'Save Milestones'}
        </button>
      </div>
    </div>
  );
}

// ── No Proposal State ─────────────────────────────────────────────────────────

function EmptyState({ projectId, onCreated }) {
  const [templates, setTemplates] = useState([]);
  const [form, setForm] = useState({ type: 'FULL_DESIGN', templateId: '', adderPct: 10 });
  const [saving, setSaving] = useState(false);
  const [err, setErr]       = useState('');

  useEffect(() => {
    fetch('/api/proposal-templates')
      .then(r => r.ok ? r.json() : { templates: [] })
      .then(d => setTemplates(d.templates || []));
  }, []);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function create() {
    setSaving(true);
    setErr('');
    try {
      const res = await fetch(`/api/proposals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectName: '', // will be set from project
          type:        form.type,
          templateId:  form.templateId || null,
          adderPct:    Number(form.adderPct) || 10,
          projectId,   // attach to existing project
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      onCreated(data);
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  }

  const filteredTemplates = templates.filter(t => !t.type || t.type === form.type);

  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4 text-3xl">📄</div>
      <h3 className="font-semibold text-slate-700 mb-1">No proposal yet</h3>
      <p className="text-sm text-slate-400 max-w-sm mb-6">Create a proposal to calculate a design fee and generate a client document.</p>
      <div className="flex flex-col gap-3 w-72">
        <div className="grid grid-cols-2 gap-2">
          {[
            { value: 'FULL_DESIGN',   label: 'Full Design' },
            { value: 'DESIGN_ASSIST', label: 'Design Assist' },
            { value: 'PEER_REVIEW',   label: 'Peer Review' },
            // Scope Letter retired 2026-09-18 (Maram 9-17).
          ].map(t => (
            <button key={t.value} onClick={() => set('type', t.value)}
              className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                form.type === t.value ? 'bg-orange-500 text-white border-orange-500' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
              }`}>
              {t.label}
            </button>
          ))}
        </div>
        {filteredTemplates.length > 0 && (
          <select value={form.templateId} onChange={e => set('templateId', e.target.value)}
            className="text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-400">
            <option value="">Blank — no template</option>
            {filteredTemplates.map(t => (
              <option key={t.id} value={t.id}>{t.name}{t.isDefault ? ' ★' : ''}</option>
            ))}
          </select>
        )}
        {err && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</p>}
        <button onClick={create} disabled={saving}
          className="px-4 py-2 rounded-xl bg-orange-500 text-white text-sm font-bold hover:bg-orange-600 transition-colors disabled:opacity-50">
          {saving ? 'Creating…' : 'Create Proposal'}
        </button>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function ProposalTab({ projectId }) {
  const [proposal,   setProposal]   = useState(null);
  const [lineItems,  setLineItems]  = useState([]);
  const [rates,      setRates]      = useState({ SR_DESIGNER: 180, DESIGNER: 115, SALES: 160, OUTSOURCE: 115 });
  const [loading,    setLoading]    = useState(true);
  const [err,        setErr]        = useState('');
  const [activeTab,  setActiveTab]  = useState('document');
  const [showSend,   setShowSend]   = useState(false);
  const [savingDoc,  setSavingDoc]  = useState(false);
  const [docSavedOk, setDocSavedOk] = useState(false);
  const editorRef = useRef(null);

  // Load proposal + rates
  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const [propRes, ratesRes] = await Promise.all([
        fetch(`/api/proposals?projectId=${projectId}`),
        fetch('/api/proposal-rates'),
      ]);
      if (!propRes.ok) throw new Error('Failed to load proposal');
      const propData  = await propRes.json();
      const proposals = propData.proposals || [];

      if (proposals.length > 0) {
        // Prefer DRAFT; fall back to latest
        const p = proposals.find(x => x.status === 'DRAFT') || proposals[0];
        setProposal(p);
        // Load full detail with line items
        const detail = await fetch(`/api/proposals/${p.id}`);
        if (detail.ok) {
          const full = await detail.json();
          setProposal(full);
          setLineItems(full.lineItems || []);
        }
      }

      if (ratesRes.ok) {
        const rd = await ratesRes.json();
        const snap = {};
        for (const r of (rd.rates || [])) snap[r.role] = r.hourlyRate;
        if (Object.keys(snap).length) setRates(snap);
      }
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  // Init editor when proposal loads
  useEffect(() => {
    if (editorRef.current && proposal) {
      editorRef.current.innerHTML = proposal.docBody || '';
    }
  }, [proposal?.id]); // eslint-disable-line

  function insertToken(token) {
    editorRef.current?.focus();
    document.execCommand('insertText', false, token);
  }

  async function saveDoc() {
    if (!proposal) return;
    setSavingDoc(true);
    const docBody = editorRef.current?.innerHTML || '';
    const res = await fetch(`/api/proposals/${proposal.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ docBody }),
    });
    if (res.ok) {
      const updated = await res.json();
      setProposal(updated);
      setDocSavedOk(true);
      setTimeout(() => setDocSavedOk(false), 2000);
    }
    setSavingDoc(false);
  }

  async function saveField(field, value) {
    if (!proposal) return;
    const res = await fetch(`/api/proposals/${proposal.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: value }),
    });
    if (res.ok) {
      const updated = await res.json();
      setProposal(updated);
    }
  }

  async function handleAccept() {
    if (!proposal) return;
    if (!confirm('Accept this proposal? This will mark the project as Active and move it forward on the pipeline.')) return;
    const res = await fetch(`/api/proposals/${proposal.id}/accept`, { method: 'POST' });
    if (res.ok) {
      const updated = await res.json();
      setProposal(updated);
    }
  }

  async function handleDecline() {
    if (!proposal) return;
    if (!confirm('Decline this proposal?')) return;
    const res = await fetch(`/api/proposals/${proposal.id}/decline`, { method: 'POST' });
    if (res.ok) {
      const updated = await res.json();
      setProposal(updated);
    }
  }

  function handleLineItemsChange(items, fee) {
    setLineItems(items);
    setProposal(prev => prev ? { ...prev, calculatedFee: fee, lineItems: items } : prev);
  }

  function handleUpdate(patch) {
    setProposal(prev => prev ? { ...prev, ...patch } : prev);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-5 h-5 border-2 border-slate-200 border-t-orange-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (err) {
    return <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3 m-4">{err}</p>;
  }

  if (!proposal) {
    return <EmptyState projectId={projectId} onCreated={p => { setProposal(p); setLineItems(p.lineItems || []); }} />;
  }

  const activeFee = (proposal.overrideActive && proposal.overrideFee != null)
    ? proposal.overrideFee : proposal.calculatedFee;

  const canSend    = proposal.status === 'DRAFT';
  const canAccept  = proposal.status === 'SENT' || proposal.status === 'DRAFT';
  const canDecline = proposal.status === 'DRAFT' || proposal.status === 'SENT';
  const isLocked   = proposal.status === 'ACCEPTED' || proposal.status === 'DECLINED';

  const TABS = [
    { id: 'document',   label: 'Document' },
    { id: 'calculator', label: `Fee Breakdown${lineItems.length ? ` (${lineItems.length})` : ''}` },
    ...(proposal.type === 'FULL_DESIGN' ? [{ id: 'milestones', label: 'Milestones' }] : []),
    { id: 'history',    label: `Send History${proposal.sends?.length ? ` (${proposal.sends.length})` : ''}` },
  ];

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-4">
      {/* Proposal header */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-bold text-slate-900">{proposal.title}</h2>
              <StatusBadge status={proposal.status} />
              {proposal.overrideActive && (
                <span className="text-[11px] bg-violet-100 text-violet-700 border border-violet-200 px-2 py-0.5 rounded-full font-semibold">Override Active</span>
              )}
            </div>
            <div className="flex items-center gap-3 mt-1 text-xs text-slate-400 flex-wrap">
              {proposal.clientName && <span>{proposal.clientName}</span>}
              {proposal.location   && <span>· {proposal.location}</span>}
              {proposal.effectiveDate && <span>· Effective {new Date(proposal.effectiveDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>}
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-2xl font-bold text-slate-900">{fmtMoney(activeFee)}</div>
            {proposal.overrideActive && proposal.calculatedFee > 0 && (
              <div className="text-xs text-slate-400 line-through">{fmtMoney(proposal.calculatedFee)}</div>
            )}
          </div>
        </div>

        {/* Meta fields row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
          <div>
            <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Client Name</label>
            <input defaultValue={proposal.clientName || ''} onBlur={e => saveField('clientName', e.target.value)}
              className="w-full text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-orange-400" />
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Location</label>
            <input defaultValue={proposal.location || ''} onBlur={e => saveField('location', e.target.value)}
              className="w-full text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-orange-400" />
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Effective Date</label>
            <input type="date" defaultValue={fmtDate(proposal.effectiveDate)} onBlur={e => saveField('effectiveDate', e.target.value)}
              className="w-full text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-orange-400" />
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Adder %</label>
            <input type="number" min="0" max="100" step="0.5"
              defaultValue={proposal.adderPct} onBlur={e => saveField('adderPct', parseFloat(e.target.value) || 0)}
              className="w-full text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-orange-400" />
          </div>
        </div>

        {/* Override fee */}
        <div className="mt-4 pt-4 border-t border-slate-100">
          <div className="flex items-center gap-3 flex-wrap">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={proposal.overrideActive}
                onChange={e => saveField('overrideActive', e.target.checked)}
                className="w-4 h-4 rounded accent-violet-500" />
              <span className="text-sm font-semibold text-slate-700">Override Fee</span>
            </label>
            {proposal.overrideActive && (
              <input type="number" min="0" step="1"
                defaultValue={proposal.overrideFee ?? ''}
                onBlur={e => saveField('overrideFee', parseFloat(e.target.value) || null)}
                placeholder="Override amount…"
                className="w-40 text-sm border border-violet-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-violet-400" />
            )}
            <span className="text-xs text-slate-400">
              Calculated: {fmtMoney(proposal.calculatedFee)} · Active: {fmtMoney(activeFee)}
            </span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 px-4">
          <div className="flex gap-1">
            {TABS.map(t => (
              <button key={t.id} onClick={() => setActiveTab(t.id)}
                className={`px-4 py-3 text-xs font-semibold border-b-2 transition-colors -mb-px ${
                  activeTab === t.id
                    ? 'border-orange-500 text-orange-600'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}>
                {t.label}
              </button>
            ))}
          </div>

          {/* Actions */}
          {!isLocked && (
            <div className="flex items-center gap-2 shrink-0">
              <a href={`/api/proposals/${proposal.id}/pdf`} target="_blank" rel="noreferrer"
                className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">
                Preview PDF
              </a>
              {canSend && (
                <button onClick={() => setShowSend(true)}
                  className="text-xs px-3 py-1.5 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 transition-colors">
                  Send
                </button>
              )}
              {canAccept && (
                <button onClick={handleAccept}
                  className="text-xs px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-700 transition-colors">
                  Accept
                </button>
              )}
              {canDecline && (
                <button onClick={handleDecline}
                  className="text-xs px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition-colors">
                  Decline
                </button>
              )}
            </div>
          )}
        </div>

        <div className="p-5">
          {activeTab === 'document' && (
            <div>
              {!isLocked && <RichToolbar editorRef={editorRef} onInsertToken={insertToken} />}
              <div
                ref={editorRef}
                contentEditable={!isLocked}
                suppressContentEditableWarning
                className={`min-h-[480px] p-5 border border-slate-200 ${!isLocked ? 'border-t-0 rounded-b-lg' : 'rounded-lg'} focus:outline-none text-sm text-slate-800 leading-relaxed prose prose-sm max-w-none`}
                style={{ fontFamily: 'Georgia, serif' }}
              />
              {!isLocked && (
                <div className="flex justify-end mt-3">
                  <button onClick={saveDoc} disabled={savingDoc}
                    className={`px-5 py-2 rounded-xl text-sm font-bold transition-colors disabled:opacity-50 ${
                      docSavedOk ? 'bg-emerald-500 text-white' : 'bg-orange-500 text-white hover:bg-orange-600'
                    }`}>
                    {savingDoc ? 'Saving…' : docSavedOk ? 'Saved ✓' : 'Save Document'}
                  </button>
                </div>
              )}
            </div>
          )}

          {activeTab === 'calculator' && (
            <CalculatorTab
              proposal={proposal}
              lineItems={lineItems}
              onLineItemsChange={handleLineItemsChange}
              rates={rates}
            />
          )}

          {activeTab === 'milestones' && (
            <MilestonesTab proposal={proposal} onUpdate={handleUpdate} />
          )}

          {activeTab === 'history' && (
            <div>
              {(!proposal.sends || proposal.sends.length === 0) ? (
                <p className="text-sm text-slate-400 py-6 text-center">No send history yet.</p>
              ) : (
                <div className="space-y-3">
                  {proposal.sends.map(s => (
                    <div key={s.id} className="border border-slate-200 rounded-xl p-4">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-slate-800">
                          Sent {new Date(s.sentAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
                        </span>
                        <span className="text-xs text-slate-400">{s.sentBy?.name}</span>
                      </div>
                      {s.sentToEmails && (
                        <p className="text-xs text-slate-500 mt-1">To: {s.sentToEmails}</p>
                      )}
                      {s.note && <p className="text-xs text-slate-500 mt-1 italic">"{s.note}"</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {showSend && (
        <SendModal
          proposal={proposal}
          onClose={() => setShowSend(false)}
          onSent={p => { setProposal(p); setShowSend(false); }}
        />
      )}
    </div>
  );
}
