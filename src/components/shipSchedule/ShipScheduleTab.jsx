'use client';
import { useState, useEffect, useCallback, useRef } from 'react';

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const FIXTURE_STATUS_OPTIONS = [
  { value: 'NOT_ORDERED',            label: 'Not Ordered' },
  { value: 'PO_PLACED',              label: 'PO Placed' },
  { value: 'IN_TRANSIT',             label: 'In Transit' },
  { value: 'AT_WAREHOUSE',           label: 'At Warehouse' },
  { value: 'PARTIALLY_RELEASED',     label: 'Partially Released' },
  { value: 'RELEASED',               label: 'Released' },
  { value: 'DELIVERED',              label: 'Delivered' },
  { value: 'UNDER_REVIEW',           label: 'Under Review' },
  { value: 'REMOVED',                label: 'Removed' },
];

const STATUS_COLORS = {
  NOT_ORDERED:         'bg-slate-100 text-slate-500',
  PO_PLACED:           'bg-blue-50   text-blue-700',
  IN_TRANSIT:          'bg-amber-50  text-amber-700',
  AT_WAREHOUSE:        'bg-purple-50 text-purple-700',
  PARTIALLY_RELEASED:  'bg-orange-50 text-orange-700',
  RELEASED:            'bg-teal-50   text-teal-700',
  DELIVERED:           'bg-green-50  text-green-700',
  UNDER_REVIEW:        'bg-yellow-50 text-yellow-700',
  REMOVED:             'bg-slate-50  text-slate-400',
};

// ── Release Modal ─────────────────────────────────────────────────────────────
function ReleaseModal({ item, projectId, onReleased, onClose }) {
  const [qty,     setQty]     = useState('');
  const [notes,   setNotes]   = useState('');
  const [saving,  setSaving]  = useState(false);
  const [history, setHistory] = useState([]);
  const [err,     setErr]     = useState('');

  useEffect(() => {
    fetch(`/api/projects/${projectId}/ship-schedule/items/${item.id}/release`)
      .then(r => r.json())
      .then(d => setHistory(d.releases || []))
      .catch(() => {});
  }, [item.id, projectId]);

  async function release() {
    if (!qty || parseInt(qty) <= 0) { setErr('Enter a quantity'); return; }
    setSaving(true);
    const res = await fetch(`/api/projects/${projectId}/ship-schedule/items/${item.id}/release`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ qty: parseInt(qty), notes: notes.trim() || null }),
    });
    const data = await res.json();
    if (!res.ok) { setErr(data.error || 'Failed'); setSaving(false); return; }
    onReleased(data.totalReleased);
    onClose();
  }

  const totalReleased = history.reduce((s, r) => s + r.qty, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h2 className="font-semibold text-slate-800">Release from Warehouse</h2>
            <p className="text-xs text-slate-400 mt-0.5">{item.fixtureType} — {item.description}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-3 text-xs text-slate-500 bg-slate-50 rounded-xl p-3">
            <div><p className="font-semibold text-slate-400 uppercase tracking-wide text-[10px]">Ordered</p><p className="text-base font-bold text-slate-800">{item.qty}</p></div>
            <div><p className="font-semibold text-slate-400 uppercase tracking-wide text-[10px]">Released so far</p><p className={`text-base font-bold ${totalReleased >= item.qty ? 'text-green-700' : 'text-slate-800'}`}>{totalReleased}</p></div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Qty to Release *</label>
            <input autoFocus type="number" min="1" value={qty} onChange={e => setQty(e.target.value)}
              placeholder={`Max ${item.qty - totalReleased} remaining`}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Notes (optional)</label>
            <input type="text" value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. Building A, Floors 1-3"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
          </div>
          {err && <p className="text-xs text-red-600">{err}</p>}
          {history.length > 0 && (
            <div className="border-t border-slate-100 pt-3">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-2">Release history</p>
              <div className="space-y-1 max-h-28 overflow-y-auto">
                {history.map(r => (
                  <div key={r.id} className="flex items-center gap-2 text-[11px] text-slate-500">
                    <span className="font-semibold text-slate-700 w-8 text-right">{r.qty}</span>
                    <span className="text-slate-300">·</span>
                    <span>{fmtDate(r.releasedAt)}</span>
                    <span className="text-slate-400">{r.releasedBy?.name || r.releasedBy?.email || ''}</span>
                    {r.notes && <span className="text-slate-400 italic truncate">"{r.notes}"</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="flex gap-2 pt-1">
            <button onClick={onClose} className="flex-1 px-4 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
            <button onClick={release} disabled={saving}
              className="flex-1 px-4 py-2 rounded-lg bg-amber-500 text-white text-sm font-semibold hover:bg-amber-400 disabled:opacity-60 transition-colors">
              {saving ? 'Releasing…' : 'Release'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Push Banner ────────────────────────────────────────────────────────────────
function PushBanner({ projectId, onPushed }) {
  const [pushing, setPushing] = useState(false);
  const [result,  setResult]  = useState(null);
  const [err,     setErr]     = useState('');

  async function push() {
    setPushing(true); setErr(''); setResult(null);
    const res = await fetch(`/api/projects/${projectId}/ship-schedule/push`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
    });
    const data = await res.json();
    if (!res.ok) { setErr(data.error || 'Push failed'); setPushing(false); return; }
    setResult(data);
    onPushed();
    setPushing(false);
  }

  return (
    <div className={`rounded-xl border px-4 py-3 flex items-center gap-3 text-sm ${result ? 'bg-green-50 border-green-200' : 'bg-slate-50 border-slate-200'}`}>
      <div className="flex-1 min-w-0">
        {result ? (
          <p className="text-green-700 font-medium">
            ✓ Pushed — {result.added} added, {result.updated} updated, {result.removed} removed from <em>{result.batchLabel}</em>
          </p>
        ) : err ? (
          <p className="text-red-600">{err}</p>
        ) : (
          <p className="text-slate-600">Populate from the latest budget — adds new types, updates changed, greys out removed.</p>
        )}
      </div>
      {!result && (
        <button onClick={push} disabled={pushing}
          className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 text-white text-xs font-semibold hover:bg-slate-700 disabled:opacity-50 transition-colors">
          {pushing ? (
            <><svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
            </svg>Pushing…</>
          ) : <>Push Budget to Schedule</>}
        </button>
      )}
      {result && (
        <button onClick={() => setResult(null)} className="shrink-0 text-xs text-green-600 hover:text-green-800 font-semibold">Push again</button>
      )}
    </div>
  );
}

// ── Inline editable cell ──────────────────────────────────────────────────────
function EditCell({ value, onSave, placeholder = '—', type = 'text', className = '' }) {
  const [editing, setEditing] = useState(false);
  const [local,   setLocal]   = useState(value ?? '');
  const ref = useRef(null);

  useEffect(() => setLocal(value ?? ''), [value]);
  function commit() {
    setEditing(false);
    const v = type === 'number' ? (parseFloat(local) || null) : (local.trim() || null);
    if (String(v ?? '') !== String(value ?? '')) onSave(v);
  }

  if (editing) {
    return (
      <input ref={ref} autoFocus type={type} value={local}
        onChange={e => setLocal(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setLocal(value ?? ''); setEditing(false); } }}
        className={`w-full text-xs border border-blue-300 bg-blue-50 rounded px-1.5 py-0.5 outline-none ${className}`}
      />
    );
  }
  return (
    <div onClick={() => setEditing(true)}
      className={`text-xs cursor-text hover:bg-slate-50 rounded px-1.5 py-0.5 min-h-[22px] whitespace-normal break-words ${className}`}>
      {value ?? <span className="text-slate-300 italic">{placeholder}</span>}
    </div>
  );
}

// ── Email Modal ───────────────────────────────────────────────────────────────
function EmailShipModal({ projectId, onClose }) {
  const [to,      setTo]      = useState('');
  const [msg,     setMsg]     = useState('');
  const [sending, setSending] = useState(false);
  const [sent,    setSent]    = useState(false);
  const [err,     setErr]     = useState('');

  async function send() {
    if (!to.trim()) { setErr('Enter at least one email'); return; }
    setSending(true); setErr('');
    const res = await fetch(`/api/projects/${projectId}/ship-schedule/email`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: to.trim(), message: msg.trim() || null }),
    });
    const data = await res.json();
    if (!res.ok) { setErr(data.error || 'Send failed'); setSending(false); return; }
    setSent(true);
    setTimeout(onClose, 1800);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h2 className="font-semibold text-slate-800">Email Ship Schedule</h2>
            <p className="text-xs text-slate-400 mt-0.5">Sends a link to the printable PDF</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          {sent ? (
            <div className="flex items-center gap-2 text-green-700 bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm font-medium">
              <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
              Sent successfully
            </div>
          ) : (
            <>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">To *</label>
                <input value={to} onChange={e => setTo(e.target.value)}
                  placeholder="contractor@firm.com, pm@firm.com"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Message (optional)</label>
                <textarea value={msg} onChange={e => setMsg(e.target.value)} rows={3}
                  placeholder="Optional note to include in the email…"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none" />
              </div>
              {err && <p className="text-xs text-red-600">{err}</p>}
              <div className="flex gap-2 pt-1">
                <button onClick={onClose} className="flex-1 px-4 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
                <button onClick={send} disabled={sending}
                  className="flex-1 px-4 py-2 rounded-lg bg-slate-800 text-white text-sm font-semibold hover:bg-slate-700 disabled:opacity-60 transition-colors">
                  {sending ? 'Sending…' : 'Send Ship Schedule'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function ShipScheduleTab({ projectId }) {
  const [items,         setItems]         = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [releasing,     setReleasing]     = useState(null);
  const [releaseTotals, setReleaseTotals] = useState({});
  const [showPush,      setShowPush]      = useState(false);
  const [showEmail,     setShowEmail]     = useState(false);
  const [sortCol,       setSortCol]       = useState(null);  // column key
  const [sortDir,       setSortDir]       = useState('asc'); // 'asc' | 'desc'

  function toggleSort(key) {
    if (sortCol === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(key); setSortDir('asc'); }
  }

  // Export to CSV
  function exportCSV(rows) {
    const headers = [
      'Type', 'Description', 'Manufacturer', 'Part #',
      'Ordered', 'Released', 'Remaining', 'Status', 'Batch',
      'PO #', 'Lead Time (Wks)', 'ESD', 'Tracking', 'Notes',
    ];
    const escape = v => {
      if (v == null || v === '') return '';
      const s = String(v);
      return s.includes(',') || s.includes('"') || s.includes('\n')
        ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csvRows = [
      headers.join(','),
      ...rows.map(item => {
        const released  = releaseTotals[item.id] || 0;
        const remaining = Math.max(0, (item.qty || 0) - released);
        return [
          item.fixtureType,
          item.description,
          item.propManufacturer,
          item.propModel,
          item.qty,
          released,
          remaining,
          item.fixtureStatus,
          item.sourceBatchLabel,
          item.catalogNo,
          item.leadTimeWeeks,
          item.esdDate ? fmtDate(item.esdDate) : '',
          item.trackingNumber,
          item.notes,
        ].map(escape).join(',');
      }),
    ].join('\r\n');

    const blob = new Blob([csvRows], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `ship-schedule-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Load all line items across all shipments, sorted by sortOrder
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/shipments`);
      const data = await res.json();
      const shipments = Array.isArray(data) ? data : [];
      // Flatten and sort
      const allItems = shipments.flatMap(s =>
        (s.lineItems || []).map(li => ({ ...li, shipmentId: s.id, shipmentLabel: s.manufacturer }))
      ).sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999) || a.fixtureType.localeCompare(b.fixtureType));
      setItems(allItems);
      // Load release totals
      const totals = {};
      await Promise.all(allItems.map(async li => {
        try {
          const r = await fetch(`/api/projects/${projectId}/ship-schedule/items/${li.id}/release`);
          const d = await r.json();
          totals[li.id] = d.totalReleased || 0;
        } catch {}
      }));
      setReleaseTotals(totals);
    } catch {}
    setLoading(false);
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  async function patchItem(itemId, fields) {
    // Find which shipment this item belongs to
    const item = items.find(i => i.id === itemId);
    if (!item) return;
    await fetch(`/api/projects/${projectId}/shipments/line-items/${itemId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fields),
    }).catch(() => {});
    setItems(prev => prev.map(i => i.id === itemId ? { ...i, ...fields } : i));
  }

  async function addRow() {
    // Get or create the first shipment
    let ship = items[0]?.shipmentId;
    if (!ship) {
      const res = await fetch(`/api/projects/${projectId}/shipments`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ manufacturer: 'Main', status: 'PO_PLACED' }),
      });
      if (res.ok) { const d = await res.json(); ship = d.id; }
    }
    if (!ship) return;
    const maxOrder = items.length > 0 ? Math.max(...items.map(i => i.sortOrder ?? 0)) : -1;
    const res = await fetch(`/api/projects/${projectId}/shipments/${ship}/items`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fixtureType: '', description: '', qty: 0, sortOrder: maxOrder + 1 }),
    });
    if (res.ok) { const d = await res.json(); setItems(prev => [...prev, { ...d, shipmentId: ship }]); }
  }

  // Apply sort on top of the base sort-order
  function applySortCol(arr) {
    if (!sortCol) return arr;
    return [...arr].sort((a, b) => {
      let av, bv;
      if (sortCol === '_released') {
        av = releaseTotals[a.id] || 0;
        bv = releaseTotals[b.id] || 0;
      } else if (sortCol === '_remaining') {
        av = Math.max(0, (a.qty || 0) - (releaseTotals[a.id] || 0));
        bv = Math.max(0, (b.qty || 0) - (releaseTotals[b.id] || 0));
      } else {
        av = a[sortCol] ?? '';
        bv = b[sortCol] ?? '';
      }
      const cmp = typeof av === 'number' ? av - bv : String(av).localeCompare(String(bv));
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }

  const activeItems  = applySortCol(items.filter(i => !i.isRemoved));
  const removedItems = items.filter(i => i.isRemoved); // removed always at bottom, unsorted

  const COLS = [
    { key: 'fixtureType',      label: 'Type',           w: 'w-16'  },
    { key: 'description',      label: 'Description',    w: 'w-auto' },
    { key: 'propManufacturer', label: 'Manufacturer', w: 'w-28' },
    { key: 'propModel',        label: 'Part #',       w: 'w-28' },
    { key: 'qty',              label: 'Ordered',         w: 'w-16', type: 'number' },
    { key: '_released',        label: 'Released',        w: 'w-16', readOnly: true },
    { key: '_remaining',       label: 'Remaining',       w: 'w-16', readOnly: true },
    { key: 'fixtureStatus',    label: 'Status',          w: 'w-36', select: true },
    { key: 'sourceBatchLabel', label: 'Batch',           w: 'w-28'  },
    { key: 'catalogNo',        label: 'PO #',  w: 'w-28'  },
    { key: 'leadTimeWeeks',    label: 'Lead Time (Wks)', w: 'w-20', type: 'number' },
    { key: 'esdDate',          label: 'ESD',             w: 'w-24', type: 'date' },
    { key: 'trackingNumber',   label: 'Tracking',        w: 'w-28'  },
    { key: 'notes',            label: 'Notes',           w: 'w-32'  },
  ];

  function renderRow(item, isRemoved = false) {
    const released  = releaseTotals[item.id] || 0;
    const remaining = Math.max(0, (item.qty || 0) - released);
    const rowCls    = isRemoved ? 'opacity-40 bg-slate-50' : '';

    return (
      <tr key={item.id} className={`border-b last:border-0 align-top group hover:bg-slate-50/40 transition-colors ${rowCls}`}>
        {/* Release button */}
        <td className="px-1 py-1 w-8 shrink-0">
          {!isRemoved && (
            <button
              onClick={() => setReleasing(item)}
              title="Release from warehouse"
              className="w-6 h-6 flex items-center justify-center rounded text-slate-300 hover:text-amber-500 hover:bg-amber-50 transition-colors opacity-0 group-hover:opacity-100"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
              </svg>
            </button>
          )}
        </td>

        {COLS.map(col => {
          if (col.readOnly) {
            const val = col.key === '_released' ? released : remaining;
            const cls = col.key === '_remaining' && remaining === 0 && released > 0 ? 'text-green-600 font-bold' : '';
            return (
              <td key={col.key} className={`px-1.5 py-1 text-xs text-right font-semibold ${cls}`}>
                {val}
              </td>
            );
          }
          if (col.select) {
            const color = STATUS_COLORS[item[col.key]] || STATUS_COLORS.NOT_ORDERED;
            return (
              <td key={col.key} className="px-0.5 py-0.5">
                <select
                  value={item[col.key] || 'NOT_ORDERED'}
                  onChange={e => patchItem(item.id, { [col.key]: e.target.value })}
                  disabled={isRemoved}
                  className={`text-[11px] font-semibold rounded-full px-2 py-0.5 border-0 focus:outline-none cursor-pointer ${color}`}
                >
                  {FIXTURE_STATUS_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </td>
            );
          }
          if (col.key === 'esdDate') {
            return (
              <td key={col.key} className="px-0.5 py-0.5">
                <input
                  type="date"
                  defaultValue={item[col.key] ? item[col.key].split('T')[0] : ''}
                  disabled={isRemoved}
                  onBlur={e => patchItem(item.id, { esdDate: e.target.value || null })}
                  className="text-xs border-b border-transparent hover:border-slate-200 focus:border-blue-400 bg-transparent outline-none w-24"
                />
              </td>
            );
          }
          return (
            <td key={col.key} className="px-0.5 py-0.5">
              <EditCell
                value={item[col.key]}
                type={col.type || 'text'}
                placeholder="—"
                onSave={v => patchItem(item.id, { [col.key]: v })}
              />
            </td>
          );
        })}
      </tr>
    );
  }

  return (
    <div className="space-y-4">
      {showEmail && <EmailShipModal projectId={projectId} onClose={() => setShowEmail(false)} />}
      {releasing && (
        <ReleaseModal
          item={releasing}
          projectId={projectId}
          onReleased={total => {
            setReleaseTotals(prev => ({ ...prev, [releasing.id]: total }));
          }}
          onClose={() => setReleasing(null)}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">Ship Schedule</h2>
          <p className="text-sm text-slate-400 mt-0.5">
            {items.length > 0 ? `${activeItems.length} active types${removedItems.length > 0 ? ` · ${removedItems.length} removed` : ''}` : 'Track fixture ordering → delivery → warehouse release'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* PDF */}
          {items.length > 0 && (
            <a
              href={`/api/projects/${projectId}/ship-schedule/pdf`}
              target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-xs font-semibold hover:bg-slate-50 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
              PDF
            </a>
          )}
          {/* Email */}
          {items.length > 0 && (
            <button
              onClick={() => setShowEmail(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-xs font-semibold hover:bg-slate-50 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
              </svg>
              Email
            </button>
          )}
          {/* Export CSV */}
          {items.length > 0 && (
            <button
              onClick={() => exportCSV([...activeItems, ...removedItems])}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-xs font-semibold hover:bg-slate-50 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              Export CSV
            </button>
          )}
          <button onClick={() => setShowPush(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${showPush ? 'bg-slate-800 text-white border-slate-800' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" />
            </svg>
            Push from Budget
          </button>
          <button onClick={addRow}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 text-white text-xs font-semibold hover:bg-amber-400 transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Add Row
          </button>
        </div>
      </div>

      {/* Push banner */}
      {showPush && <PushBanner projectId={projectId} onPushed={load} />}

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-400 text-sm gap-2">
          <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
          </svg>
          Loading ship schedule…
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center bg-white rounded-2xl border border-dashed border-slate-200">
          <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center mb-3">
            <svg className="w-6 h-6 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
            </svg>
          </div>
          <p className="text-sm font-semibold text-slate-600 mb-1">No items yet</p>
          <p className="text-xs text-slate-400 mb-4">Push from the budget matrix to auto-populate, or add rows manually.</p>
          <div className="flex gap-2">
            <button onClick={() => setShowPush(true)}
              className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 text-xs font-semibold hover:bg-slate-50">
              Push from Budget
            </button>
            <button onClick={addRow}
              className="px-4 py-2 rounded-lg bg-amber-500 text-white text-xs font-semibold hover:bg-amber-400">
              + Add Row
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="w-8 px-1" title="Release from warehouse" />
                {COLS.map(col => {
                  const isActive = sortCol === col.key;
                  return (
                    <th key={col.key}
                      onClick={() => toggleSort(col.key)}
                      className={`${col.w} px-2 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider whitespace-nowrap cursor-pointer select-none transition-colors ${isActive ? 'text-blue-600 bg-blue-50/60' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100/60'}`}
                    >
                      <span className="flex items-center gap-1">
                        {col.label}
                        <span className={`text-[10px] ${isActive ? 'text-blue-500' : 'text-slate-300'}`}>
                          {isActive ? (sortDir === 'asc' ? '↑' : '↓') : '⇅'}
                        </span>
                      </span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {activeItems.map(item => renderRow(item))}
              {removedItems.length > 0 && (
                <>
                  <tr>
                    <td colSpan={COLS.length + 1} className="px-4 py-2 border-t border-dashed border-slate-200 bg-slate-50/50">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Removed from bid ({removedItems.length})</span>
                    </td>
                  </tr>
                  {removedItems.map(item => renderRow(item, true))}
                </>
              )}
            </tbody>
          </table>
          <div className="px-4 py-2 border-t border-slate-100 text-[10px] text-slate-400 flex items-center gap-3">
            <span>Click any cell to edit · Hover any row for the Release button</span>
            <button onClick={addRow} className="ml-auto text-amber-600 hover:text-amber-700 font-semibold transition-colors">
              + Add row
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
