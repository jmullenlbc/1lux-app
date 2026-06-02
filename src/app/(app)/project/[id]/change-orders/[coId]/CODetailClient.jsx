'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';

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
              className="w-full text-xs border border-slate-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
              placeholder="Search…" onKeyDown={e => e.key === 'Escape' && setOpen(false)} />
          </div>
          <div className="max-h-44 overflow-y-auto">
            {filtered.length > 0 ? filtered.map(m => (
              <button key={m.id} onClick={() => { onSave(m.name); setOpen(false); setQ(''); }}
                className={`w-full text-left px-3 py-1.5 text-xs hover:bg-blue-50 hover:text-blue-700 transition-colors ${value === m.name ? 'bg-blue-50 font-semibold text-blue-700' : ''}`}>
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
    if (res.ok) { const d = await res.json(); onCreated(d.manufacturer); }
    setSaving(false);
  }

  if (!adding) return (
    <button onClick={() => setAdding(true)}
      className="w-full text-left px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded font-semibold">
      + New Manufacturer
    </button>
  );
  return (
    <div className="flex gap-1">
      <input autoFocus value={name} onChange={e => setName(e.target.value)}
        placeholder="Name…" onKeyDown={e => e.key === 'Enter' && create()}
        className="flex-1 text-xs border border-slate-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400" />
      <button onClick={create} disabled={saving}
        className="text-xs px-2 py-1 rounded bg-blue-600 text-white font-semibold disabled:opacity-50">
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

const STATUS_META = {
  DRAFT:    { label: 'Draft',    cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  SENT:     { label: 'Sent',     cls: 'bg-blue-50  text-blue-700  border-blue-200'  },
  APPROVED: { label: 'Approved', cls: 'bg-green-50 text-green-700 border-green-200' },
};

// ── Inline editable cell ──────────────────────────────────────────────────────
function InlineCell({ value, onSave, placeholder = '—', type = 'text', className = '', redIfNeg = false }) {
  const [editing, setEditing] = useState(false);
  const [local,   setLocal]   = useState(value ?? '');
  const inputRef = useRef(null);

  useEffect(() => { setLocal(value ?? ''); }, [value]);

  function start() { setEditing(true); setTimeout(() => inputRef.current?.focus(), 0); }
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
        className={`w-full bg-blue-50 border border-blue-300 rounded px-1.5 py-0.5 text-xs outline-none focus:ring-1 focus:ring-blue-400 ${className}`}
      />
    );
  }

  return (
    <div
      onClick={start}
      className={`px-1.5 py-0.5 text-xs cursor-text hover:bg-slate-50 rounded min-h-[26px] whitespace-normal break-words ${isNeg ? 'text-red-600 font-semibold' : ''} ${className}`}
    >
      {displayVal ?? <span className="text-slate-300 italic">{placeholder}</span>}
    </div>
  );
}

// ── Line item row ─────────────────────────────────────────────────────────────
function LineItemRow({ item, groupId, projectId, coId, manufacturers, rates, onUpdate, onDelete, onAddLine, onAddOption, onSelectOption, isLocked }) {
  const totalCN = (item.qty || 0) * (item.cnUnitPrice || 0);
  const [localCN, setLocalCN] = useState(item.cnUnitPrice ?? 0);

  useEffect(() => setLocalCN(item.cnUnitPrice ?? 0), [item.cnUnitPrice]);

  async function patch(fields) {
    const res = await fetch(
      `/api/projects/${projectId}/change-orders/${coId}/option-groups/${groupId}/line-items/${item.id}`,
      { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(fields) }
    );
    if (res.ok) onUpdate(await res.json());
  }

  async function handleDNChange(dn) {
    const dnVal = parseFloat(dn);
    let cnVal = localCN;
    if (!isNaN(dnVal) && rates?.marginPct != null) {
      const factor = 1 - rates.marginPct;
      if (factor > 0) cnVal = Math.round((dnVal / factor) * 100) / 100;
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
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            {/* + Line */}
            <button onClick={() => onAddLine(item)}
              className="h-5 flex items-center gap-0.5 px-1 rounded text-[9px] font-bold text-slate-400 hover:text-green-600 hover:bg-green-50 transition-colors whitespace-nowrap"
              title="Add line below">
              <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Line
            </button>
            {/* Group */}
            <button onClick={() => onAddOption(item)}
              className="h-5 flex items-center gap-0.5 px-1 rounded text-[9px] font-bold text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors whitespace-nowrap"
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

      {/* Type — for option rows shows a radio + option label */}
      <td className="px-0.5 py-0.5 w-20">
        {isOptionRow ? (
          <div className="flex items-center gap-1.5 px-1.5 py-0.5">
            <button
              onClick={() => onSelectOption(item)}
              disabled={isLocked}
              title="Use this option"
              className={`w-3.5 h-3.5 rounded-full border-2 shrink-0 transition-colors ${
                item.isGroupSelected
                  ? 'border-blue-600 bg-blue-600'
                  : 'border-slate-300 hover:border-blue-400'
              } ${isLocked ? 'cursor-default' : 'cursor-pointer'}`}
            />
            <span className={`text-[10px] font-bold ${item.isGroupSelected ? 'text-blue-600' : 'text-slate-400'}`}>
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
      {/* Total CN — dimmed if option not selected */}
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

// ── Option Group panel ────────────────────────────────────────────────────────
function OptionGroupPanel({ group, co, projectId, coId, rates, manufacturers, onUpdate, onGroupUpdated, onGroupDeleted, canDelete, isLocked }) {
  const [saving, setSaving] = useState(false);

  const lineItems = group.lineItems || [];
  // Resolved: standalone items + selected option from each group
  const resolvedItems = (() => {
    const standalone = lineItems.filter(li => !li.isOptionRow);
    const roots = lineItems.filter(li => li.isOptionRow && !li.parentLineItemId);
    const selectedOptions = roots.map(root => {
      const members = [root, ...lineItems.filter(li => li.parentLineItemId === root.id)];
      return members.find(li => li.isGroupSelected) || root;
    });
    return [...standalone, ...selectedOptions];
  })();
  const totalCN = resolvedItems.reduce((s, li) => s + ((li.qty || 0) * (li.cnUnitPrice || 0)), 0);
  const tax        = rates?.salesTaxPct   != null ? totalCN * rates.salesTaxPct   : 0;
  const freight    = rates?.freightPct    != null ? totalCN * rates.freightPct    : 0;
  const warehousing = rates?.warehousingPct != null ? totalCN * rates.warehousingPct : 0;
  const grandTotal = totalCN + tax + freight + warehousing;

  async function apiPost(body) {
    const res = await fetch(`/api/projects/${projectId}/change-orders/${coId}/option-groups/${group.id}/line-items`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    if (res.ok) return await res.json();
    return null;
  }

  // Add a plain new standalone line item (after the given item, or at end)
  async function addLineAfter(afterItem = null) {
    setSaving(true);
    const item = await apiPost({ action: 'add_line', afterItemId: afterItem?.id });
    if (item) onGroupUpdated({ ...group, lineItems: [...lineItems, item] });
    setSaving(false);
  }

  // Convert a line into Option A and add Option B — or add another option to an existing group
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
    }
  }

  async function deleteItem(itemId) {
    if (!confirm('Delete this line item?')) return;
    await fetch(`/api/projects/${projectId}/change-orders/${coId}/option-groups/${group.id}/line-items/${itemId}`, { method: 'DELETE' });
    onGroupUpdated({ ...group, lineItems: lineItems.filter(li => li.id !== itemId) });
  }

  function updateItem(updated) {
    onGroupUpdated({ ...group, lineItems: lineItems.map(li => li.id === updated.id ? updated : li) });
  }

  async function setSelected() {
    await fetch(`/api/projects/${projectId}/change-orders/${coId}/option-groups/${group.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isSelected: true }),
    });
    onUpdate();
  }

  async function patchLabel(label) {
    await fetch(`/api/projects/${projectId}/change-orders/${coId}/option-groups/${group.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ label }),
    });
    onGroupUpdated({ ...group, label });
  }

  return (
    <div className={`rounded-xl border overflow-hidden shadow-sm ${group.isSelected ? 'border-slate-800' : 'border-slate-200'}`}>
      {/* Group header */}
      <div className={`flex items-center gap-3 px-4 py-3 ${group.isSelected ? 'bg-slate-800 text-white' : 'bg-slate-50 border-b border-slate-200'}`}>
        {!isLocked && (
          <button onClick={setSelected} title="Mark as selected"
            className={`w-4 h-4 rounded-full border-2 shrink-0 transition-colors ${group.isSelected ? 'border-white bg-white' : 'border-slate-400 hover:border-blue-500'}`} />
        )}
        {group.isSelected && isLocked && (
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
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${group.isSelected ? 'bg-white/20 text-white' : 'bg-slate-800 text-white'}`}>
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
                <th key={h} className={`px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap text-slate-500 ${cls}`}>
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
        <div className="px-4 py-2 border-t border-slate-100 flex items-center gap-3">
          <button onClick={() => addLineAfter(null)} disabled={saving}
            className="text-xs text-slate-500 hover:text-green-600 font-semibold flex items-center gap-1 transition-colors disabled:opacity-50">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Add line
          </button>
          <span className="text-[10px] text-slate-300">Hover any row to add a line below it or create an option group</span>
        </div>
      )}

      {/* Footer */}
      <div className="px-4 py-3 border-t border-slate-200 bg-slate-50">
        <div className="ml-auto w-72 space-y-1 text-xs">
          <div className="flex justify-between">
            <span className="text-slate-500">Subtotal <span className="text-slate-300">(selected options)</span></span>
            <span className="font-medium">{fmt(totalCN, true)}</span>
          </div>
          {rates?.salesTaxPct != null && (
            <div className="flex justify-between text-slate-400">
              <span>Sales Tax ({pct(rates.salesTaxPct)})</span>
              <span>{fmt(tax)}</span>
            </div>
          )}
          {rates?.freightPct != null && (
            <div className="flex justify-between text-slate-400">
              <span>Freight ({pct(rates.freightPct)})</span>
              <span>{fmt(freight)}</span>
            </div>
          )}
          {rates?.warehousingPct != null && (
            <div className="flex justify-between text-slate-400">
              <span>Warehousing ({pct(rates.warehousingPct)})</span>
              <span>{fmt(warehousing)}</span>
            </div>
          )}
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
    if (!res.ok) { setErr(data.error || 'Send failed'); setSending(false); return; }
    onSent(data.co);
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
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Message (optional)</label>
            <textarea value={msg} onChange={e => setMsg(e.target.value)} rows={3} placeholder="Optional note to include in the email…"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none" />
          </div>
          {err && <p className="text-xs text-red-600">{err}</p>}
          <div className="flex gap-2 pt-1">
            <button onClick={onClose} className="flex-1 px-4 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
            <button onClick={send} disabled={sending || !selected}
              className="flex-1 px-4 py-2 rounded-lg bg-slate-800 text-white text-sm font-semibold hover:bg-slate-700 disabled:opacity-50 transition-colors">
              {sending ? 'Sending…' : `Send CO ${co.coNumber}`}
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
    await fetch(`/api/projects/${projectId}/change-orders/${co.id}/share`, { method: 'DELETE' });
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
            <p className="text-xs text-slate-400 mt-0.5">View-only link — buy prices hidden</p>
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
                  className={`shrink-0 px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${copied ? 'bg-green-500 text-white' : 'bg-slate-800 text-white hover:bg-slate-700'}`}>
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
              className="w-full py-2.5 rounded-xl bg-slate-800 text-white text-sm font-semibold hover:bg-slate-700 disabled:opacity-50 transition-colors">
              {gen ? 'Creating…' : 'Create share link'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Push CO → New Budget Version (PO/RFQ) ─────────────────────────────────────
function PushCOToBudgetButton({ projectId, coId, coNumber }) {
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
      <button onClick={push} disabled={pushing}
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
function PushCOToShipButton({ projectId, coId, coNumber }) {
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
      <button onClick={push} disabled={pushing}
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
    if (res.ok) { const updated = await res.json(); setCo(updated); }
    setSavingHeader(false);
  }

  async function addOptionGroup() {
    const res = await fetch(`/api/projects/${projectId}/change-orders/${coId}/option-groups`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
    });
    if (res.ok) load();
  }

  async function deleteOptionGroup(groupId) {
    if (!confirm('Delete this option group and all its line items?')) return;
    await fetch(`/api/projects/${projectId}/change-orders/${coId}/option-groups/${groupId}`, { method: 'DELETE' });
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
        <Link href={`/project/${projectId}?tab=change-orders`} className="text-sm text-blue-600 underline">← Back to project</Link>
      </div>
    </div>
  );

  const isLocked = co.status === 'APPROVED' || co.status === 'SENT';
  const rates    = co.rates || {};

  return (
    <div className="min-h-screen bg-slate-50">
      {showSend  && <SendCOModal  co={co} projectId={projectId} onSent={updated => { setCo(updated); setShowSend(false); }}  onClose={() => setShowSend(false)} />}
      {showShare && <ShareCOModal co={co} projectId={projectId} onClose={() => setShowShare(false)} />}

      {/* Top bar */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-center gap-4">
          <Link href={`/project/${projectId}?tab=change-orders`}
            className="text-slate-400 hover:text-slate-600 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Change Order</span>
              <span className="font-mono text-xs font-bold text-slate-600">{co.coNumber}</span>
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${STATUS_META[co.status]?.cls || ''}`}>
                {STATUS_META[co.status]?.label || co.status}
              </span>
              {savingHeader && <span className="text-[10px] text-slate-400 italic">Saving…</span>}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {co.status !== 'APPROVED' && (
              <button onClick={() => setShowSend(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition-colors">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                </svg>
                Send CO
              </button>
            )}
            <a href={`/api/projects/${projectId}/change-orders/${coId}/pdf`} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-xs font-semibold hover:bg-slate-50 transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              PDF
            </a>
            <button onClick={() => setShowShare(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-xs font-semibold hover:bg-slate-50 transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" />
              </svg>
              Share
            </button>
            {/* Push CO → New Budget Version (for PO/RFQ) */}
            <PushCOToBudgetButton projectId={projectId} coId={coId} coNumber={co.coNumber} />
            {/* Push CO → Ship Schedule (supplemental batch) */}
            <PushCOToShipButton projectId={projectId} coId={coId} coNumber={co.coNumber} />
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-6 space-y-6">

        {/* Header card */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Title</label>
              {isLocked ? (
                <p className="text-base font-semibold text-slate-800">{co.title}</p>
              ) : (
                <input
                  defaultValue={co.title}
                  onBlur={e => { if (e.target.value !== co.title) patchCO({ title: e.target.value }); }}
                  onKeyDown={e => e.key === 'Enter' && e.target.blur()}
                  className="w-full text-base font-semibold border-b border-slate-200 bg-transparent outline-none hover:border-slate-400 focus:border-amber-400 pb-0.5 transition-colors"
                />
              )}
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Date</label>
              <input
                type="date"
                defaultValue={co.date ? co.date.split('T')[0] : ''}
                disabled={isLocked}
                onBlur={e => { if (e.target.value) patchCO({ date: e.target.value }); }}
                className="text-sm border-b border-slate-200 bg-transparent outline-none hover:border-slate-400 focus:border-amber-400 pb-0.5 disabled:opacity-60 transition-colors"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Status</label>
              <select
                value={co.status}
                onChange={e => patchCO({ status: e.target.value })}
                disabled={co.status === 'APPROVED'}
                className="text-sm border-b border-slate-200 bg-transparent outline-none hover:border-slate-400 focus:border-amber-400 pb-0.5 disabled:opacity-60 cursor-pointer transition-colors"
              >
                <option value="DRAFT">Draft</option>
                <option value="SENT">Sent</option>
                <option value="APPROVED">Approved</option>
              </select>
            </div>
          </div>
          {/* Notes */}
          <div className="mt-4">
            <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Notes</label>
            <textarea
              defaultValue={co.notes || ''}
              disabled={isLocked}
              onBlur={e => { if ((e.target.value || null) !== co.notes) patchCO({ notes: e.target.value }); }}
              placeholder="Optional notes for this CO…"
              rows={2}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none disabled:opacity-60 bg-white"
            />
          </div>

          {/* Send history */}
          {co.sends?.length > 0 && (
            <details className="mt-4">
              <summary className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide cursor-pointer hover:text-slate-600 list-none select-none">
                Send history ({co.sends.length})
              </summary>
              <div className="mt-2 space-y-1">
                {co.sends.map(s => (
                  <div key={s.id} className="flex items-center gap-3 text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2">
                    <span>{fmtDate(s.sentAt)}</span>
                    <span>→ {s.recipients}</span>
                    <span className="text-slate-400">by {s.sentBy?.name || s.sentBy?.email}</span>
                    {s.notes && <span className="text-slate-400 italic">"{s.notes}"</span>}
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>

        {/* Option Groups */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">
              Option Groups
              <span className="ml-2 text-slate-400 font-normal normal-case">— click the radio to select</span>
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
            />
          ))}
        </div>
      </div>
    </div>
  );
}
