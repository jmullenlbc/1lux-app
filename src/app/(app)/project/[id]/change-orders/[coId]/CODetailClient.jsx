'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { calcGroupFooter } from '@/lib/changeOrderTotals';
import { cents, lineTotal } from '@/lib/money';
import { HandOffNotice } from '@/components/rfq/SentNotice';

// ── Manufacturer dropdown (fixed-position to escape overflow:hidden containers) ─
function MfrDropdown({ value, manufacturers, readOnly, onSave }) {
  const [open, setOpen] = useState(false);
  const [q,    setQ]    = useState('');
  const [pos,  setPos]  = useState({ top: 0, left: 0 });
  const btnRef = useRef(null);
  const dropRef = useRef(null);

  useEffect(() => {
    function h(e) {
      if (btnRef.current && btnRef.current.contains(e.target)) return;
      if (dropRef.current && dropRef.current.contains(e.target)) return;
      setOpen(false); setQ('');
    }
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  function toggle() {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + window.scrollY + 2, left: r.left + window.scrollX });
    }
    setOpen(o => !o); setQ('');
  }

  if (readOnly) {
    return <div className="px-1.5 py-0.5 text-xs text-blue-700 font-medium min-h-[26px]">{value || '—'}</div>;
  }

  const filtered = manufacturers.filter(m => m.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <>
      <div ref={btnRef} onClick={toggle}
        className="px-1.5 py-0.5 text-xs cursor-pointer hover:bg-slate-50 rounded min-h-[26px] text-blue-700 font-medium">
        {value || <span className="text-slate-300 italic">Select mfr…</span>}
      </div>
      {open && (
        <div ref={dropRef}
          className="fixed w-52 bg-white rounded-lg shadow-xl border border-slate-200 overflow-hidden"
          style={{ top: pos.top, left: pos.left, zIndex: 9999 }}>
          <div className="p-1.5 border-b border-slate-100">
            <input autoFocus value={q} onChange={e => setQ(e.target.value)}
              className="w-full text-xs border border-slate-200 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-orange-500"
              placeholder="Search…" onKeyDown={e => e.key === 'Escape' && setOpen(false)} />
          </div>
          <div className="max-h-44 overflow-y-auto">
            {filtered.length > 0 ? filtered.map(m => (
              <button key={m.id} onClick={() => { onSave(m.name); setOpen(false); setQ(''); }}
                className={`w-full text-left px-3 py-1.5 text-xs hover:bg-orange-50 hover:text-orange-700 transition-colors ${value === m.name ? 'bg-blue-50 font-semibold text-blue-700' : ''}`}>
                {m.name}
              </button>
            )) : <p className="px-3 py-2 text-xs text-slate-400 italic">No match</p>}
          </div>
          <div className="border-t border-slate-100 p-1.5">
            <NewMfrInline onCreated={mfr => { onSave(mfr.name); setOpen(false); }} />
          </div>
        </div>
      )}
    </>
  );
}

function NewMfrInline({ onCreated }) {
  const [adding, setAdding] = useState(false);
  const [name,   setName]   = useState('');
  const [saving, setSaving] = useState(false);

  async function create() {
    if (!name.trim()) return;
    setSaving(true);
    const res = await fetch('/api/manufacturers', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim() }),
    });
    // Adding a manufacturer is a Pre-con / Design / Construction / admin job.
    if (res.ok) { const d = await res.json(); onCreated(d.manufacturer); }
    else alert(await refusalText(res, 'Could not add that manufacturer.'));
    setSaving(false);
  }

  if (!adding) return (
    <button onClick={() => setAdding(true)}
      className="w-full text-left px-2 py-1 text-xs text-orange-600 hover:bg-orange-50 rounded font-semibold">
      + New Manufacturer
    </button>
  );
  return (
    <div className="flex gap-1">
      <input autoFocus value={name} onChange={e => setName(e.target.value)}
        placeholder="Name…" onKeyDown={e => e.key === 'Enter' && create()}
        className="flex-1 text-xs border border-slate-200 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-orange-500" />
      <button onClick={create} disabled={saving}
        className="text-xs px-2 py-1 rounded bg-orange-500 text-white font-semibold disabled:opacity-50">
        {saving ? '…' : 'Add'}
      </button>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(n, showSign = false) {
  if (n == null || isNaN(n)) return '—';
  const abs = Math.abs(n);
  const str = '$' + abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (showSign && n < 0) return `−${str}`;
  if (showSign && n > 0) return `+${str}`;
  return str;
}
function pct(n) { return n != null ? `${(Number(n) * 100).toFixed(2).replace(/\.?0+$/, '')}%` : '—'; }
function fmtDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
// The server's own words when it refuses (e.g. "only Construction, Operations,
// Finance or an admin..."), so a click never just silently does nothing.
async function refusalText(res, fallback) {
  const body = await res.json().catch(() => ({}));
  return body.error || fallback;
}

const STATUS_META = {
  DRAFT:    { label: 'Draft',    cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  SENT:     { label: 'Sent',     cls: 'bg-blue-50  text-blue-700  border-blue-200'  },
  APPROVED: { label: 'Approved', cls: 'bg-green-50 text-green-700 border-green-200' },
};

// ── Inline editable cell ──────────────────────────────────────────────────────
function InlineCell({ value, onSave, placeholder = '—', type = 'text', className = '', redIfNeg = false, readOnly = false }) {
  const [editing, setEditing] = useState(false);
  const [local,   setLocal]   = useState(value ?? '');
  const inputRef = useRef(null);

  useEffect(() => { setLocal(value ?? ''); }, [value]);

  function start() { if (readOnly) return; setEditing(true); setTimeout(() => inputRef.current?.focus(), 0); }
  function commit() {
    setEditing(false);
    const trimmed = type === 'number' ? (parseFloat(String(local)) || 0) : String(local).trim();
    if (String(trimmed) !== String(value ?? '')) onSave(trimmed);
  }

  const displayVal = value != null && value !== '' ? value : null;
  const isNeg = redIfNeg && typeof value === 'number' && value < 0;

  if (editing) {
    return (
      <input
        ref={inputRef}
        type={type === 'number' ? 'number' : 'text'}
        step={type === 'number' ? 'any' : undefined}
        value={local}
        onChange={e => setLocal(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commit(); } if (e.key === 'Escape') { setLocal(value ?? ''); setEditing(false); } }}
        className={`w-full bg-blue-50 border border-blue-300 rounded px-1.5 py-0.5 text-xs outline-none focus:ring-2 focus:ring-orange-500 ${className}`}
      />
    );
  }

  return (
    <div
      onClick={start}
      className={`px-1.5 py-0.5 text-xs ${readOnly ? '' : 'cursor-text hover:bg-slate-50'} rounded min-h-[26px] whitespace-normal break-words ${isNeg ? 'text-red-600 font-semibold' : ''} ${className}`}
    >
      {displayVal ?? <span className="text-slate-300 italic">{placeholder}</span>}
    </div>
  );
}

// ── Line item row ─────────────────────────────────────────────────────────────
function LineItemRow({ item, groupId, projectId, coId, manufacturers, rates, onUpdate, onDelete, onAddLine, onAddOption, onSelectOption, isLocked, canPick }) {
  const totalCN = lineTotal(item.qty, item.cnUnitPrice);
  const [localCN, setLocalCN] = useState(item.cnUnitPrice ?? 0);

  useEffect(() => setLocalCN(item.cnUnitPrice ?? 0), [item.cnUnitPrice]);

  async function patch(fields) {
    const res = await fetch(
      `/api/projects/${projectId}/change-orders/${coId}/option-groups/${groupId}/line-items/${item.id}`,
      { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(fields) }
    );
    if (res.ok) onUpdate(await res.json());
    else alert(await refusalText(res, 'Could not save that line.'));
  }

  async function handleDNChange(dn) {
    const dnVal = parseFloat(dn);
    let cnVal = localCN;
    if (!isNaN(dnVal) && rates?.marginPct != null) {
      const factor = 1 - rates.marginPct;
      if (factor > 0) cnVal = cents(dnVal / factor);
    }
    setLocalCN(cnVal);
    await patch({ originalDN: isNaN(dnVal) ? null : dnVal });
  }

  const isOptionRow = item.isOptionRow;

  // Visual: option rows get a left border in their group color
  const rowBg = isOptionRow
    ? (item.isGroupSelected ? 'border-l-2 border-l-blue-500 bg-blue-50/30' : 'border-l-2 border-l-slate-200 bg-slate-50/30')
    : item.qty < 0 ? 'bg-red-50/20' : '';

  return (
    <tr className={`border-b last:border-0 align-top group ${rowBg} hover:bg-slate-50/30 transition-colors`}>
      {/* Action buttons column */}
      {!isLocked && (
        <td className="px-1 py-1 w-16">
          <div className="flex items-center gap-0.5 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
            {/* + Line */}
            <button onClick={() => onAddLine(item)}
              className="h-5 flex items-center gap-0.5 px-1 rounded text-[11px] font-bold text-slate-400 hover:text-green-600 hover:bg-green-50 transition-colors whitespace-nowrap"
              title="Add line below">
              <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Line
            </button>
            {/* Group */}
            <button onClick={() => onAddOption(item)}
              className="h-5 flex items-center gap-0.5 px-1 rounded text-[11px] font-bold text-slate-400 hover:text-orange-600 hover:bg-orange-50 transition-colors whitespace-nowrap"
              title={isOptionRow ? 'Add another option to this group' : 'Make this a group with options'}>
              <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
              </svg>
              Opt
            </button>
            {/* Delete */}
            <button onClick={() => onDelete(item.id)}
              className="w-5 h-5 flex items-center justify-center rounded text-slate-300 hover:text-red-400 hover:bg-red-50 transition-colors"
              title="Delete">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        </td>
      )}

      {/* Type, for option rows shows a radio + option label */}
      <td className="px-0.5 py-0.5 w-20">
        {isOptionRow ? (
          <div className="flex items-center gap-1.5 px-1.5 py-0.5">
            <button
              onClick={() => onSelectOption(item)}
              disabled={!canPick}
              title="Use this option"
              className={`w-3.5 h-3.5 rounded-full border-2 shrink-0 transition-colors ${
                item.isGroupSelected
                  ? 'border-orange-500 bg-orange-500'
                  : 'border-slate-300 hover:border-orange-400'
              } ${canPick ? 'cursor-pointer' : 'cursor-default'}`}
            />
            <span className={`text-[11px] font-bold ${item.isGroupSelected ? 'text-blue-600' : 'text-slate-400'}`}>
              {item.optionLabel || 'Option'}
            </span>
          </div>
        ) : (
          <InlineCell value={item.fixtureType} onSave={v => patch({ fixtureType: v })} placeholder="Type" readOnly={isLocked} className="font-semibold" />
        )}
      </td>
      {/* Description */}
      <td className="px-0.5 py-0.5">
        <InlineCell value={item.description} onSave={v => patch({ description: v })} placeholder="Description" readOnly={isLocked} />
      </td>
      {/* Qty */}
      <td className="px-0.5 py-0.5 w-14">
        <InlineCell value={item.qty} type="number" onSave={v => patch({ qty: parseFloat(v) || 0 })} placeholder="0" redIfNeg readOnly={isLocked} className="text-right" />
      </td>
      {/* Manufacturer */}
      <td className="px-0.5 py-0.5 w-32">
        <MfrDropdown value={item.manufacturer} manufacturers={manufacturers} readOnly={isLocked} onSave={v => patch({ manufacturer: v })} />
      </td>
      {/* Part # */}
      <td className="px-0.5 py-0.5 w-28">
        <InlineCell value={item.partNumber} onSave={v => patch({ partNumber: v })} placeholder="Part #" readOnly={isLocked} className="font-mono text-[11px]" />
      </td>
      {/* Orig DN */}
      <td className="px-0.5 py-0.5 w-20">
        <InlineCell value={item.originalDN} type="number" onSave={handleDNChange} placeholder="—" readOnly={isLocked} className="text-right text-slate-400" />
      </td>
      {/* CN Unit */}
      <td className="px-0.5 py-0.5 w-20">
        <InlineCell value={localCN || item.cnUnitPrice} type="number"
          onSave={v => { setLocalCN(parseFloat(v) || 0); patch({ cnUnitPrice: parseFloat(v) || 0 }); }}
          placeholder="0.00" readOnly={isLocked} className="text-right font-semibold" />
      </td>
      {/* Total CN, dimmed if option not selected */}
      <td className={`px-2 py-0.5 w-20 text-right text-xs font-bold ${
        isOptionRow && !item.isGroupSelected ? 'text-slate-300' : totalCN < 0 ? 'text-red-600' : 'text-blue-700'
      }`}>
        {fmt(totalCN, true)}
      </td>
      {/* Quote Ref */}
      <td className="px-0.5 py-0.5 w-28">
        <InlineCell value={item.quoteReference} onSave={v => patch({ quoteReference: v })} placeholder="Quote #" readOnly={isLocked} className="text-[11px]" />
      </td>
      {/* Lead Time */}
      <td className="px-0.5 py-0.5 w-20">
        <InlineCell value={item.leadTime} onSave={v => patch({ leadTime: v })} placeholder="—" readOnly={isLocked} className="text-[11px]" />
      </td>
    </tr>
  );
}

// ── Discount row (group footer) ───────────────────────────────────────────────
function DiscountRow({ group, discount, isLocked, onSave }) {
  const percent = group.discountPct != null;
  // Rounded so 7% does not come back as 7.000000000000001
  const saved = percent ? Math.round(group.discountPct * 1e8) / 1e6 : group.discountAmount;
  const [mode, setMode] = useState(percent ? 'pct' : 'amount');
  const [value, setValue] = useState(saved ?? '');
  const [note, setNote] = useState(group.discountNote ?? '');

  useEffect(() => {
    setMode(percent ? 'pct' : 'amount');
    setValue(saved ?? '');
    setNote(group.discountNote ?? '');
  }, [percent, saved, group.discountNote]);

  function saveValue(nextMode = mode) {
    if (String(value) === String(saved ?? '') && nextMode === (percent ? 'pct' : 'amount')) return;
    onSave(nextMode === 'pct' ? { discountPercent: value } : { discountAmount: value });
  }

  if (isLocked) {
    if (!discount) return null;
    return (
      <div>
        <div className="flex justify-between">
          <span className="text-slate-500">Discount{percent ? ` (${pct(group.discountPct)})` : ''}</span>
          <span className="font-medium">{fmt(-discount, true)}</span>
        </div>
        {group.discountNote && <p className="text-[11px] text-slate-400">{group.discountNote}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-slate-500">Discount</span>
        <div className="flex items-center gap-1">
          <input value={value} onChange={e => setValue(e.target.value)} onBlur={() => saveValue()} inputMode="decimal"
            aria-label="Discount" placeholder="0"
            className="w-20 text-right text-xs border border-slate-200 rounded px-1.5 py-0.5 focus:outline-none focus:ring-2 focus:ring-orange-500" />
          <select value={mode} onChange={e => { setMode(e.target.value); if (value !== '') saveValue(e.target.value); }}
            aria-label="Discount in dollars or percent"
            className="text-xs border border-slate-200 rounded px-1 py-0.5 bg-white focus:outline-none focus:ring-2 focus:ring-orange-500">
            <option value="amount">$</option>
            <option value="pct">%</option>
          </select>
          <span className="font-medium w-20 text-right">{discount ? fmt(-discount, true) : fmt(0)}</span>
        </div>
      </div>
      {(discount !== 0 || note) && (
        <input value={note} onChange={e => setNote(e.target.value)}
          onBlur={() => { if (note !== (group.discountNote ?? '')) onSave({ discountNote: note }); }}
          aria-label="Reason for the discount" placeholder="Reason, the client sees this"
          className="w-full text-[11px] border border-slate-200 rounded px-1.5 py-0.5 focus:outline-none focus:ring-2 focus:ring-orange-500" />
      )}
    </div>
  );
}

// ── Freight or warehousing row (group footer) ─────────────────────────────────
// Blank follows the job's rate, a typed value replaces it, 0 waives it.
function FeeRow({ label, field, group, amount, shownPct, jobRate, isLocked, onSave }) {
  const amountKey = `${field}Override`;
  const pctKey = `${field}OverridePct`;
  const percent = group[pctKey] != null;
  // Rounded so 7% does not come back as 7.000000000000001
  const saved = percent ? Math.round(group[pctKey] * 1e8) / 1e6 : group[amountKey];
  const [mode, setMode] = useState(percent ? 'pct' : 'amount');
  const [value, setValue] = useState(saved ?? '');

  useEffect(() => {
    setMode(percent ? 'pct' : 'amount');
    setValue(saved ?? '');
  }, [percent, saved]);

  function saveValue(nextMode = mode) {
    if (String(value) === String(saved ?? '') && nextMode === (percent ? 'pct' : 'amount')) return;
    onSave(nextMode === 'pct' ? { [`${field}OverridePercent`]: value } : { [amountKey]: value });
  }

  if (isLocked) {
    if (!amount && shownPct == null) return null;
    return (
      <div className="flex justify-between text-slate-400">
        <span>{label}{shownPct != null ? ` (${pct(shownPct)})` : ''}</span>
        <span>{fmt(amount)}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-slate-400">{label}</span>
      <div className="flex items-center gap-1">
        <input value={value} onChange={e => setValue(e.target.value)} onBlur={() => saveValue()} inputMode="decimal"
          aria-label={label} placeholder={jobRate != null ? pct(jobRate) : '0'}
          className="w-20 text-right text-xs border border-slate-200 rounded px-1.5 py-0.5 focus:outline-none focus:ring-2 focus:ring-orange-500" />
        <select value={mode} onChange={e => { setMode(e.target.value); if (value !== '') saveValue(e.target.value); }}
          aria-label={`${label} in dollars or percent`}
          className="text-xs border border-slate-200 rounded px-1 py-0.5 bg-white focus:outline-none focus:ring-2 focus:ring-orange-500">
          <option value="amount">$</option>
          <option value="pct">%</option>
        </select>
        <span className="text-slate-400 w-20 text-right">{fmt(amount)}</span>
      </div>
    </div>
  );
}

// ── Option Group panel ────────────────────────────────────────────────────────
function OptionGroupPanel({ group, co, projectId, coId, rates, manufacturers, onUpdate, onGroupUpdated, onGroupDeleted, canDelete, isLocked, canPick }) {
  const [saving, setSaving] = useState(false);

  const lineItems = group.lineItems || [];
  const { subtotal: totalCN, discount, tax, freight, warehousing, total: grandTotal, freightPct, warehousingPct } = calcGroupFooter(lineItems, rates, group);

  async function apiPost(body) {
    const res = await fetch(`/api/projects/${projectId}/change-orders/${coId}/option-groups/${group.id}/line-items`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    if (res.ok) return await res.json();
    alert(await refusalText(res, 'Could not add that line.'));
    return null;
  }

  // Add a plain new standalone line item (after the given item, or at end)
  async function addLineAfter(afterItem = null) {
    setSaving(true);
    const item = await apiPost({ action: 'add_line', afterItemId: afterItem?.id });
    if (item) onGroupUpdated({ ...group, lineItems: [...lineItems, item] });
    setSaving(false);
  }

  // Convert a line into Option A and add Option B, or add another option to an existing group
  async function addOptionFor(targetItem) {
    setSaving(true);
    const rootId = targetItem.parentLineItemId || targetItem.id;
    const newItem = await apiPost({ action: 'add_option', parentLineItemId: rootId, afterItemId: rootId });
    if (newItem) {
      // Reload to get updated optionLabel on root too
      const updated = await fetch(`/api/projects/${projectId}/change-orders/${coId}`).then(r => r.json()).catch(() => null);
      if (updated) onUpdate(); // triggers parent reload
      else onGroupUpdated({ ...group, lineItems: [...lineItems, newItem] });
    }
    setSaving(false);
  }

  // Select an option within a group
  async function selectOption(item) {
    const res = await fetch(
      `/api/projects/${projectId}/change-orders/${coId}/option-groups/${group.id}/line-items/${item.id}/select`,
      { method: 'POST' }
    );
    if (res.ok) {
      // Update local state: deselect all in group, select this one
      const rootId = item.parentLineItemId || item.id;
      onGroupUpdated({
        ...group,
        lineItems: lineItems.map(li => {
          if (li.id === rootId || li.parentLineItemId === rootId) {
            return { ...li, isGroupSelected: li.id === item.id };
          }
          return li;
        }),
      });
    } else alert(await refusalText(res, 'Could not pick that option.'));
  }

  async function deleteItem(itemId) {
    if (!confirm('Delete this line item?')) return;
    const res = await fetch(`/api/projects/${projectId}/change-orders/${coId}/option-groups/${group.id}/line-items/${itemId}`, { method: 'DELETE' });
    if (!res.ok) { alert(await refusalText(res, 'Could not delete that line.')); return; }
    onGroupUpdated({ ...group, lineItems: lineItems.filter(li => li.id !== itemId) });
  }

  function updateItem(updated) {
    onGroupUpdated({ ...group, lineItems: lineItems.map(li => li.id === updated.id ? updated : li) });
  }

  async function setSelected() {
    const res = await fetch(`/api/projects/${projectId}/change-orders/${coId}/option-groups/${group.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isSelected: true }),
    });
    if (!res.ok) alert(await refusalText(res, 'Could not pick that option.'));
    onUpdate();
  }

  async function patchLabel(label) {
    const res = await fetch(`/api/projects/${projectId}/change-orders/${coId}/option-groups/${group.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ label }),
    });
    if (!res.ok) { alert(await refusalText(res, 'Could not rename that option.')); return; }
    onGroupUpdated({ ...group, label });
  }

  async function patchMoney(body) {
    const res = await fetch(`/api/projects/${projectId}/change-orders/${coId}/option-groups/${group.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    if (!res.ok) { alert(await refusalText(res, 'Could not save that figure.')); return; }
    const saved = await res.json();
    onGroupUpdated({
      ...group,
      discountAmount: saved.discountAmount, discountPct: saved.discountPct, discountNote: saved.discountNote,
      freightOverride: saved.freightOverride, freightOverridePct: saved.freightOverridePct,
      warehousingOverride: saved.warehousingOverride, warehousingOverridePct: saved.warehousingOverridePct,
    });
  }

  return (
    <div className={`rounded-xl border overflow-hidden shadow-sm ${group.isSelected ? 'border-slate-800' : 'border-slate-200'}`}>
      {/* Group header */}
      <div className={`flex items-center gap-3 px-4 py-3 ${group.isSelected ? 'bg-slate-800 text-white' : 'bg-slate-50 border-b border-slate-200'}`}>
        {canPick && (
          <button onClick={setSelected} title="Mark as selected"
            className={`w-4 h-4 rounded-full border-2 shrink-0 transition-colors ${group.isSelected ? 'border-white bg-white' : 'border-slate-400 hover:border-blue-500'}`} />
        )}
        {group.isSelected && !canPick && (
          <span className="w-2 h-2 rounded-full bg-white shrink-0" />
        )}
        <div className="flex-1">
          {isLocked ? (
            <span className={`text-sm font-semibold ${group.isSelected ? 'text-white' : 'text-slate-700'}`}>{group.label}</span>
          ) : (
            <input
              defaultValue={group.label}
              onBlur={e => { if (e.target.value !== group.label) patchLabel(e.target.value); }}
              onKeyDown={e => e.key === 'Enter' && e.target.blur()}
              className={`text-sm font-semibold bg-transparent border-none outline-none w-full focus:underline ${group.isSelected ? 'text-white placeholder-white/60' : 'text-slate-700'}`}
            />
          )}
        </div>
        {group.isSelected && (
          <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${group.isSelected ? 'bg-white/20 text-white' : 'bg-slate-800 text-white'}`}>
            SELECTED
          </span>
        )}
        {canDelete && !isLocked && (
          <button onClick={onGroupDeleted} className={`p-1 rounded hover:bg-white/20 transition-colors ${group.isSelected ? 'text-white/60 hover:text-white' : 'text-slate-400 hover:text-red-500'}`}>
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Line item table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse" style={{ minWidth: '960px' }}>
          <thead>
            <tr className="border-b border-slate-100 bg-white">
              {!isLocked && <th className="w-14 px-1" />}
              {[
                { h: 'Type',         cls: '' },
                { h: 'Description',  cls: '' },
                { h: 'Qty',          cls: '' },
                { h: 'Manufacturer', cls: '' },
                { h: 'Part #',       cls: '' },
                { h: 'Orig DN',      cls: 'text-slate-300' },
                { h: 'CN Unit',      cls: '' },
                { h: 'Total CN',     cls: '' },
                { h: 'Quote Ref',    cls: '' },
                { h: 'Lead Time (Weeks)', cls: '' },
              ].map(({ h, cls }) => (
                <th key={h} className={`px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-wide whitespace-nowrap text-slate-500 ${cls}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lineItems.map(item => (
              <LineItemRow
                key={item.id}
                item={item}
                groupId={group.id}
                projectId={projectId}
                coId={coId}
                manufacturers={manufacturers}
                rates={rates}
                onUpdate={updateItem}
                onDelete={deleteItem}
                onAddLine={addLineAfter}
                onAddOption={addOptionFor}
                onSelectOption={selectOption}
                isLocked={isLocked}
                canPick={canPick}
              />
            ))}
            {lineItems.length === 0 && (
              <tr>
                <td colSpan={isLocked ? 10 : 11} className="px-4 py-6 text-center text-xs text-slate-300 italic">
                  No line items yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Add line at bottom */}
      {!isLocked && (
        <div className="px-4 py-2 border-t border-slate-100 flex flex-wrap items-center gap-x-3 gap-y-1">
          <button onClick={() => addLineAfter(null)} disabled={saving}
            className="text-xs text-slate-500 hover:text-green-600 font-semibold flex items-center gap-1 transition-colors disabled:opacity-50">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Add line
          </button>
          <span className="text-[11px] text-slate-300">Hover any row to add a line below it or create an option group</span>
        </div>
      )}

      {/* Footer */}
      <div className="px-4 py-3 border-t border-slate-200 bg-slate-50">
        <div className="ml-auto w-full max-w-80 space-y-1 text-xs">
          <div className="flex justify-between">
            <span className="text-slate-500">Subtotal <span className="text-slate-300">(selected options)</span></span>
            <span className="font-medium">{fmt(totalCN, true)}</span>
          </div>
          <DiscountRow group={group} discount={discount} isLocked={isLocked} onSave={patchMoney} />
          {rates?.salesTaxPct != null && (
            <div className="flex justify-between text-slate-400">
              <span>Sales Tax ({pct(rates.salesTaxPct)})</span>
              <span>{fmt(tax)}</span>
            </div>
          )}
          <FeeRow label="Freight" field="freight" group={group} amount={freight} shownPct={freightPct} jobRate={rates?.freightPct} isLocked={isLocked} onSave={patchMoney} />
          <FeeRow label="Warehousing" field="warehousing" group={group} amount={warehousing} shownPct={warehousingPct} jobRate={rates?.warehousingPct} isLocked={isLocked} onSave={patchMoney} />
          <div className="flex justify-between border-t border-slate-300 pt-1 font-bold text-sm">
            <span>TOTAL</span>
            <span className={grandTotal < 0 ? 'text-red-600' : 'text-blue-700'}>{fmt(grandTotal, true)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Send CO Modal ─────────────────────────────────────────────────────────────
function SendCOModal({ co, projectId, onSent, onClose }) {
  const [to,      setTo]      = useState('');
  const [msg,     setMsg]     = useState('');
  const [sending, setSending] = useState(false);
  const [err,     setErr]     = useState('');

  const selected = co.optionGroups?.find(g => g.isSelected);

  async function send() {
    if (!to.trim()) { setErr('At least one email required'); return; }
    if (!selected) { setErr('Please select an option group first'); return; }
    setSending(true);
    const res = await fetch(`/api/projects/${projectId}/change-orders/${co.id}/send`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipients: to.trim(), notes: msg.trim() || null }),
    });
    const data = await res.json();
    if (!res.ok) { setErr(data.error || 'Could not mark this change order Sent. Nothing was changed. Try again.'); setSending(false); return; }
    onSent(data);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h2 className="font-semibold text-slate-800">Send {co.coNumber}</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {selected ? `Selected: ${selected.label}` : '⚠ No option selected'}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">To *</label>
            <input value={to} onChange={e => setTo(e.target.value)} placeholder="recipient@firm.com, another@firm.com"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Message (optional)</label>
            <textarea value={msg} onChange={e => setMsg(e.target.value)} rows={3} placeholder="Optional note to include in the email…"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none" />
          </div>
          {err && <p className="text-xs text-red-600">{err}</p>}
          <p className="text-xs text-slate-500">The app does not send email yet. This marks the change order Sent, freezes its sales tax and gives you a Gmail draft with the PDF to attach.</p>
          <div className="flex gap-2 pt-1">
            <button onClick={onClose} className="flex-1 px-4 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
            <button onClick={send} disabled={sending || !selected}
              className="flex-1 px-4 py-2 rounded-lg bg-orange-500 text-white text-sm font-semibold hover:bg-orange-600 disabled:opacity-50 transition-colors">
              {sending ? 'Saving…' : 'Mark Sent and get the email'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Share Modal ───────────────────────────────────────────────────────────────
function ShareCOModal({ co, projectId, onClose }) {
  const [share,   setShare]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [gen,     setGen]     = useState(false);
  const [copied,  setCopied]  = useState(false);

  useEffect(() => {
    fetch(`/api/projects/${projectId}/change-orders/${co.id}/share`)
      .then(r => r.json()).then(d => { setShare(d.share); setLoading(false); })
      .catch(() => setLoading(false));
  }, [co.id, projectId]);

  async function generate() {
    setGen(true);
    const res = await fetch(`/api/projects/${projectId}/change-orders/${co.id}/share`, { method: 'POST' });
    const data = await res.json();
    setShare(data.share);
    setGen(false);
  }

  async function revoke() {
    if (!confirm('Revoke this share link?')) return;
    const res = await fetch(`/api/projects/${projectId}/change-orders/${co.id}/share`, { method: 'DELETE' });
    if (!res.ok) { alert(await refusalText(res, 'Could not turn off that link.')); return; }
    setShare(null);
  }

  const shareUrl = share ? `${window.location.origin}/share/co/${share.token}` : '';

  function copy() {
    navigator.clipboard.writeText(shareUrl).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h2 className="font-semibold text-slate-800">Share {co.coNumber}</h2>
            <p className="text-xs text-slate-400 mt-0.5">View-only link, buy prices hidden</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          {loading ? (
            <p className="text-sm text-slate-400 text-center py-4">Loading…</p>
          ) : share ? (
            <>
              <div className="flex items-center gap-2">
                <input readOnly value={shareUrl} onClick={e => e.target.select()}
                  className="flex-1 text-xs border border-slate-200 rounded-lg px-3 py-2 bg-slate-50 focus:outline-none" />
                <button onClick={copy}
                  className={`shrink-0 px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${copied ? 'bg-green-600 text-white' : 'bg-orange-500 text-white hover:bg-slate-700'}`}>
                  {copied ? '✓ Copied' : 'Copy'}
                </button>
              </div>
              <div className="flex gap-2">
                <button onClick={generate} disabled={gen}
                  className="flex-1 text-xs px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">
                  Regenerate
                </button>
                <button onClick={revoke}
                  className="flex-1 text-xs px-3 py-2 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition-colors">
                  Revoke
                </button>
              </div>
            </>
          ) : (
            <button onClick={generate} disabled={gen}
              className="w-full py-2.5 rounded-xl bg-orange-500 text-white text-sm font-semibold hover:bg-orange-600 disabled:opacity-50 transition-colors">
              {gen ? 'Creating…' : 'Create share link'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const NEEDS_APPROVAL = 'Approve this change order first, then push it.';

// ── Push CO → New Budget Version (PO/RFQ) ─────────────────────────────────────
function PushCOToBudgetButton({ projectId, coId, coNumber, approved }) {
  const [pushing, setPushing] = useState(false);
  const [done,    setDone]    = useState(null);
  const [err,     setErr]     = useState('');

  async function push() {
    if (!confirm(`Create a new budget version from ${coNumber}? This generates a standalone bid snapshot for PO/RFQ.`)) return;
    setPushing(true); setErr('');
    try {
      const res = await fetch(`/api/projects/${projectId}/change-orders/${coId}/push-to-budget`, { method: 'POST' });
      let data;
      try { data = await res.json(); } catch { data = {}; }
      if (!res.ok) { setErr(data.error || `Server error (${res.status})`); setPushing(false); return; }
      setDone(`v${data.version}`);
      setTimeout(() => setDone(null), 4000);
    } catch (e) {
      setErr(e.message || 'Network error');
    } finally {
      setPushing(false);
    }
  }

  return (
    <div className="relative">
      <button onClick={push} disabled={pushing || !approved} title={approved ? undefined : NEEDS_APPROVAL}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-xs font-semibold hover:bg-slate-50 transition-colors disabled:opacity-60">
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 11h.01M12 11h.01M15 11h.01M4 19h16a2 2 0 002-2V7a2 2 0 00-2-2H4a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
        {pushing ? 'Pushing…' : done ? `✓ Budget ${done}` : 'Push to Budget'}
      </button>
      {err && <div className="absolute top-full right-0 mt-1 z-20 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-600 whitespace-nowrap shadow-sm">{err}</div>}
    </div>
  );
}

// ── Push CO → Ship Schedule (supplemental batch) ──────────────────────────────
function PushCOToShipButton({ projectId, coId, coNumber, approved }) {
  const [pushing, setPushing] = useState(false);
  const [done,    setDone]    = useState(null);
  const [err,     setErr]     = useState('');

  async function push() {
    if (!confirm(`Add ${coNumber} items as a supplemental batch to the ship schedule?`)) return;
    setPushing(true); setErr('');
    const res = await fetch(`/api/projects/${projectId}/ship-schedule/push`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ coId }),
    });
    const data = await res.json();
    if (!res.ok) { setErr(data.error || 'Failed'); setPushing(false); return; }
    setDone(`+${data.added}`);
    setPushing(false);
    setTimeout(() => setDone(null), 4000);
  }

  return (
    <div className="relative">
      <button onClick={push} disabled={pushing || !approved} title={approved ? undefined : NEEDS_APPROVAL}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-xs font-semibold hover:bg-slate-50 transition-colors disabled:opacity-60">
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
        </svg>
        {pushing ? 'Pushing…' : done ? `✓ ${done} added to ship` : 'Push to Ship Schedule'}
      </button>
      {err && <div className="absolute top-full right-0 mt-1 z-20 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-600 whitespace-nowrap shadow-sm">{err}</div>}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function CODetailClient({ projectId, coId }) {
  const [co,            setCo]            = useState(null);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState(null);
  const [showSend,      setShowSend]      = useState(false);
  const [showShare,     setShowShare]     = useState(false);
  const [savingHeader,  setSavingHeader]  = useState(false);
  const [manufacturers, setManufacturers] = useState([]);
  const [sentEmail,     setSentEmail]     = useState(null);
  const [showApprove,   setShowApprove]   = useState(false);
  const [approveNote,   setApproveNote]   = useState('');
  const [approveErr,    setApproveErr]    = useState('');
  const [approving,     setApproving]     = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/change-orders/${coId}`);
      if (!res.ok) throw new Error('Not found');
      setCo(await res.json());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [projectId, coId]);

  useEffect(() => {
    load();
    fetch('/api/manufacturers').then(r => r.json()).then(d => setManufacturers(d.manufacturers || []));
  }, [load]);

  async function patchCO(fields) {
    setSavingHeader(true);
    const res = await fetch(`/api/projects/${projectId}/change-orders/${coId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(fields),
    });
    // PATCH answers with the change order minus canEdit and canUndoApproval - keep the ones we have.
    if (res.ok) { const updated = await res.json(); setCo(prev => ({ ...updated, canEdit: prev?.canEdit, canUndoApproval: prev?.canUndoApproval })); }
    else alert(await refusalText(res, 'Could not save that change.'));
    setSavingHeader(false);
  }

  // Blank means the job's sales tax. The box shows percent, the record keeps a decimal.
  function saveTax(typed) {
    const next = typed.trim() === '' ? null : Math.round(Number(typed) * 1e4) / 1e6;
    if (next !== (co.salesTaxPct ?? null)) patchCO({ salesTaxPct: next });
  }

  async function approve() {
    setApproving(true);
    setApproveErr('');
    const res = await fetch(`/api/projects/${projectId}/change-orders/${coId}/approve`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ note: approveNote }),
    });
    setApproving(false);
    if (!res.ok) { setApproveErr(await refusalText(res, 'Could not record the approval. Nothing was changed. Try again.')); return; }
    setShowApprove(false);
    setApproveNote('');
    load();
  }

  async function undoApproval() {
    if (!confirm('Undo this approval? The change order goes back to Sent and its sales tax stays frozen.')) return;
    const res = await fetch(`/api/projects/${projectId}/change-orders/${coId}/approve`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ undo: true }),
    });
    if (!res.ok) alert(await refusalText(res, 'Could not undo the approval. Nothing was changed. Try again.'));
    load();
  }

  async function addOptionGroup() {
    const res = await fetch(`/api/projects/${projectId}/change-orders/${coId}/option-groups`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
    });
    if (res.ok) load();
    else alert(await refusalText(res, 'Could not add an option.'));
  }

  async function deleteOptionGroup(groupId) {
    if (!confirm('Delete this option group and all its line items?')) return;
    const res = await fetch(`/api/projects/${projectId}/change-orders/${coId}/option-groups/${groupId}`, { method: 'DELETE' });
    if (!res.ok) alert(await refusalText(res, 'Could not delete that option.'));
    load();
  }

  function updateGroup(updated) {
    setCo(prev => ({
      ...prev,
      optionGroups: prev.optionGroups.map(g => g.id === updated.id ? updated : g),
    }));
  }

  if (loading) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-400 text-sm gap-2">
      <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
      </svg>
      Loading change order…
    </div>
  );

  if (error) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="text-center space-y-3">
        <p className="text-red-600 font-medium">{error}</p>
        <Link href={`/project/${projectId}?tab=change-orders`} className="text-sm text-orange-600 underline">← Back to project</Link>
      </div>
    </div>
  );

  // canEdit comes from the server: Construction, Operations, Finance and admins.
  // Anyone else sees the change order but every field is read-only.
  const viewOnly = co.canEdit === false;
  const isLocked = co.status === 'APPROVED' || co.status === 'SENT' || viewOnly;
  // Sent lines are locked, but the option can still be picked until it is approved
  const canPick = co.status !== 'APPROVED' && !viewOnly;
  const rates    = co.rates || {};
  const approval = co.approvals?.find(a => a.action === 'APPROVED');
  const whoDid   = a => a.portalUser?.name || a.portalUser?.email || a.user?.name || a.user?.email || 'Unknown';

  return (
    <div className="min-h-screen bg-slate-50">
      {showSend  && <SendCOModal  co={co} projectId={projectId} onSent={data => { setSentEmail(data.email); setShowSend(false); load(); }}  onClose={() => setShowSend(false)} />}
      {showShare && <ShareCOModal co={co} projectId={projectId} onClose={() => setShowShare(false)} />}

      {viewOnly && (
        <div className="bg-slate-100 border-b border-slate-200 px-4 md:px-6 py-2 text-center text-xs text-slate-600">
          View only. Only Construction, Operations, Finance or an admin can change change orders.
        </div>
      )}

      {/* Top bar. Phones: buttons drop to their own line (Mike 10-29) */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-3 flex flex-wrap md:flex-nowrap items-center gap-x-4 gap-y-2">
          <Link href={`/project/${projectId}?tab=change-orders`}
            className="text-slate-400 hover:text-slate-600 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Change Order</span>
              <span className="font-mono text-xs font-bold text-slate-600">{co.coNumber}</span>
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold border ${STATUS_META[co.status]?.cls || ''}`}>
                {STATUS_META[co.status]?.label || co.status}
              </span>
              {savingHeader && <span className="text-[11px] text-slate-400 italic">Saving…</span>}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0 w-full md:w-auto">
            {co.status !== 'APPROVED' && !viewOnly && (
              <button onClick={() => setShowSend(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-500 text-white text-xs font-semibold hover:bg-orange-600 transition-colors">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                </svg>
                Send CO
              </button>
            )}
            {co.status !== 'APPROVED' && !viewOnly && (
              <button onClick={() => setShowApprove(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-xs font-semibold hover:bg-slate-50 transition-colors">
                Mark Approved
              </button>
            )}
            <a href={`/api/projects/${projectId}/change-orders/${coId}/pdf`} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-xs font-semibold hover:bg-slate-50 transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              PDF
            </a>
            {!viewOnly && <button onClick={() => setShowShare(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-xs font-semibold hover:bg-slate-50 transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" />
              </svg>
              Share
            </button>}
            {!viewOnly && <>
              {/* Push CO → New Budget Version (for PO/RFQ) */}
              <PushCOToBudgetButton projectId={projectId} coId={coId} coNumber={co.coNumber} approved={co.status === 'APPROVED'} />
              {/* Push CO → Ship Schedule (supplemental batch) */}
              <PushCOToShipButton projectId={projectId} coId={coId} coNumber={co.coNumber} approved={co.status === 'APPROVED'} />
            </>}
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 md:px-6 py-4 md:py-6 space-y-6">

        {sentEmail && (
          <HandOffNotice
            title={`${co.coNumber} is marked Sent`}
            detail="The app does not send email yet. Open the PDF and save it, then send the email with it attached."
            pdfUrl={`/api/projects/${projectId}/change-orders/${coId}/pdf`}
            email={sentEmail} onClose={() => setSentEmail(null)}
          />
        )}

        {/* Header card */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 md:p-6">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Title</label>
              {isLocked ? (
                <p className="text-base font-semibold text-slate-800">{co.title}</p>
              ) : (
                <input
                  defaultValue={co.title}
                  onBlur={e => { if (e.target.value !== co.title) patchCO({ title: e.target.value }); }}
                  onKeyDown={e => e.key === 'Enter' && e.target.blur()}
                  className="w-full text-base font-semibold border-b border-slate-200 bg-transparent outline-none hover:border-slate-400 focus:border-orange-500 pb-0.5 transition-colors"
                />
              )}
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Date</label>
              <input
                type="date"
                defaultValue={co.date ? co.date.split('T')[0] : ''}
                disabled={isLocked}
                onBlur={e => { if (e.target.value) patchCO({ date: e.target.value }); }}
                className="text-sm border-b border-slate-200 bg-transparent outline-none hover:border-slate-400 focus:border-orange-500 pb-0.5 disabled:opacity-60 transition-colors"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Sales Tax</label>
              {co.status === 'DRAFT' && !viewOnly ? (
                <>
                  <div className="flex items-center gap-1">
                    <input
                      type="number" step="0.01" min="0" max="100"
                      key={co.salesTaxPct ?? 'job'}
                      defaultValue={co.salesTaxPct != null ? Math.round(co.salesTaxPct * 1e6) / 1e4 : ''}
                      placeholder={rates.salesTaxPct != null ? String(Math.round(rates.salesTaxPct * 1e6) / 1e4) : ''}
                      onBlur={e => saveTax(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && e.target.blur()}
                      className="w-20 text-sm border-b border-slate-200 bg-transparent outline-none hover:border-slate-400 focus:border-orange-500 pb-0.5 transition-colors"
                    />
                    <span className="text-slate-400 text-sm">%</span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">Freezes when sent or approved</p>
                </>
              ) : (
                <p className="text-sm text-slate-700">
                  {pct(rates.salesTaxPct)}
                  {co.status !== 'DRAFT' && <span className="ml-1.5 text-[11px] text-slate-400">Frozen</span>}
                </p>
              )}
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Status</label>
              {co.status === 'APPROVED' ? (
                <p className="text-sm text-slate-700">Approved</p>
              ) : (
                <select
                  value={co.status}
                  onChange={e => patchCO({ status: e.target.value })}
                  disabled={viewOnly}
                  className="text-sm border-b border-slate-200 bg-transparent outline-none hover:border-slate-400 focus:border-orange-500 pb-0.5 disabled:opacity-60 cursor-pointer transition-colors"
                >
                  <option value="DRAFT">Draft</option>
                  <option value="SENT">Sent</option>
                </select>
              )}
            </div>
          </div>
          {/* Notes */}
          <div className="mt-4">
            <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Notes</label>
            <textarea
              defaultValue={co.notes || ''}
              disabled={isLocked}
              onBlur={e => { if ((e.target.value || null) !== co.notes) patchCO({ notes: e.target.value }); }}
              placeholder="Optional notes for this CO…"
              rows={2}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none disabled:opacity-60 bg-white"
            />
          </div>

          {/* Staff record a phone or email approval. Clients approve in the portal. */}
          {showApprove && co.status !== 'APPROVED' && (
            <div className="mt-4 border border-slate-200 rounded-lg p-3 bg-slate-50">
              <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">How did the client approve?</label>
              <input
                value={approveNote}
                onChange={e => setApproveNote(e.target.value)}
                placeholder="Phone call, email date, who said yes"
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white"
              />
              {approveErr && <p className="text-xs text-red-600 mt-1">{approveErr}</p>}
              <p className="text-[11px] text-slate-500 mt-1">This locks the change order and freezes its sales tax. An admin can undo it.</p>
              <div className="flex gap-2 mt-2">
                <button onClick={approve} disabled={approving || !approveNote.trim()}
                  className="px-3 py-1.5 rounded-lg bg-orange-500 text-white text-xs font-semibold hover:bg-orange-600 disabled:opacity-50 transition-colors">
                  {approving ? 'Saving…' : 'Record approval'}
                </button>
                <button onClick={() => { setShowApprove(false); setApproveErr(''); }}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-xs font-semibold hover:bg-slate-50 transition-colors">
                  Cancel
                </button>
              </div>
            </div>
          )}

          {co.status === 'APPROVED' && (
            <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-green-800 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
              {approval ? (
                <span>
                  Approved by {whoDid(approval)} {approval.via === 'PORTAL' ? 'in the portal' : 'and recorded by staff'} on {fmtDate(approval.createdAt)}
                  {approval.optionLabel ? `, ${approval.optionLabel}` : ''}{approval.amount != null ? `, ${fmt(approval.amount)}` : ''}
                </span>
              ) : (
                <span>Approved before the app kept a record of who approved it.</span>
              )}
              {approval?.note && <span className="italic">"{approval.note}"</span>}
              {co.canUndoApproval && !viewOnly && (
                <button onClick={undoApproval} className="ml-auto font-semibold hover:underline">Undo approval</button>
              )}
            </div>
          )}

          {/* Send history */}
          {co.sends?.length > 0 && (
            <details className="mt-4">
              <summary className="text-[11px] text-slate-500 font-semibold uppercase tracking-wide cursor-pointer hover:text-slate-600 list-none select-none">
                Send history ({co.sends.length})
              </summary>
              <div className="mt-2 space-y-1">
                {co.sends.map(s => (
                  <div key={s.id} className="flex flex-wrap md:flex-nowrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2">
                    <span>{fmtDate(s.sentAt)}</span>
                    <span>→ {s.recipients}</span>
                    <span className="text-slate-400">by {s.sentBy?.name || s.sentBy?.email}</span>
                    {s.notes && <span className="text-slate-400 italic">"{s.notes}"</span>}
                  </div>
                ))}
              </div>
            </details>
          )}

          {/* Approval history */}
          {co.approvals?.length > 0 && (
            <details className="mt-4">
              <summary className="text-[11px] text-slate-500 font-semibold uppercase tracking-wide cursor-pointer hover:text-slate-600 list-none select-none">
                Approval history ({co.approvals.length})
              </summary>
              <div className="mt-2 space-y-1">
                {co.approvals.map(a => (
                  <div key={a.id} className="flex flex-wrap md:flex-nowrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2">
                    <span>{fmtDate(a.createdAt)}</span>
                    <span>{a.action === 'APPROVED' ? 'Approved' : 'Approval undone'}</span>
                    <span className="text-slate-400">by {whoDid(a)}</span>
                    {a.note && <span className="text-slate-400 italic">"{a.note}"</span>}
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>

        {/* Option Groups */}
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">
              Option Groups:
              {canPick && <span className="ml-2 text-slate-400 font-normal normal-case">click the radio to select</span>}
            </h2>
            {!isLocked && (
              <button onClick={addOptionGroup}
                className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors flex items-center gap-1.5">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                Add option group
              </button>
            )}
          </div>

          {co.optionGroups?.map(group => (
            <OptionGroupPanel
              key={group.id}
              group={group}
              co={co}
              projectId={projectId}
              coId={coId}
              rates={rates}
              manufacturers={manufacturers}
              onUpdate={load}
              onGroupUpdated={updateGroup}
              onGroupDeleted={() => deleteOptionGroup(group.id)}
              canDelete={(co.optionGroups?.length || 0) > 1}
              isLocked={isLocked}
              canPick={canPick}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
