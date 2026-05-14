'use client';
import { useState, useMemo, useRef, useCallback } from 'react';
import DealDrawer from './DealDrawer';
import DealModal from './DealModal';

// ── Pipeline config ───────────────────────────────────────────────────────────

export const PIPELINE_STAGES = {
  PROCUREMENT: [
    { stage: 'QUALIFIED',      label: 'Qualified',       color: '#6b7280', bg: 'bg-slate-100'  },
    { stage: 'PRECONSTRUCTION',label: 'Pre-Construction', color: '#3b82f6', bg: 'bg-blue-50'    },
    { stage: 'CONSTRUCTION',   label: 'Construction',    color: '#f59e0b', bg: 'bg-amber-50'   },
    { stage: 'COMPLETED',      label: 'Completed',       color: '#22c55e', bg: 'bg-green-50'   },
  ],
  DESIGN: [
    { stage: 'DESIGN_QUALIFIED', label: 'Design Qualified', color: '#6b7280', bg: 'bg-slate-100' },
    { stage: 'PROPOSAL_SENT',    label: 'Proposal Sent',    color: '#3b82f6', bg: 'bg-blue-50'   },
    { stage: 'DESIGN',           label: 'Design',           color: '#f59e0b', bg: 'bg-amber-50'  },
    { stage: 'DESIGN_COMPLETED', label: 'Design Completed', color: '#22c55e', bg: 'bg-green-50'  },
  ],
};

export const SERVICE_TYPE_LABELS = {
  FULL_SERVICE_DESIGN: 'Full Design',
  DESIGN_ASSIST:       'Design Assist',
  PEER_REVIEW:         'Peer Review',
  BID_ONLY:            'Bid Only',
};

export const PROJECT_TYPE_LABELS = {
  MULTI_FAMILY:    'Multi-Family',
  STUDENT_HOUSING: 'Student Housing',
  HOSPITALITY:     'Hospitality',
  OFFICE:          'Office',
  OTHER:           'Other',
};

const DEAL_STATUS_CONFIG = {
  OPEN:      { label: 'Open',      color: 'text-blue-700  bg-blue-50  border-blue-200'   },
  WON:       { label: 'Won',       color: 'text-green-700 bg-green-50 border-green-200'  },
  LOST:      { label: 'Lost',      color: 'text-red-700   bg-red-50   border-red-200'    },
  ABANDONED: { label: 'Abandoned', color: 'text-slate-600 bg-slate-100 border-slate-200' },
  ON_HOLD:   { label: 'On Hold',   color: 'text-amber-700 bg-amber-50 border-amber-200'  },
};

// ── Formatters ────────────────────────────────────────────────────────────────

function fmtMoney(val) {
  if (val == null) return null;
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000)     return `$${(val / 1_000).toFixed(0)}K`;
  return `$${val.toLocaleString()}`;
}

function fmtDate(str) {
  if (!str) return null;
  try { return new Date(str).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }); }
  catch { return null; }
}

function daysSince(str) {
  if (!str) return null;
  return Math.floor((Date.now() - new Date(str).getTime()) / 86_400_000);
}

// ── Deal Card ─────────────────────────────────────────────────────────────────

function DealCard({ deal, onOpen, onDragStart, onDragEnd, isDragging }) {
  const st          = DEAL_STATUS_CONFIG[deal.dealStatus] || DEAL_STATUS_CONFIG.OPEN;
  const svcLabel    = SERVICE_TYPE_LABELS[deal.serviceType] || deal.serviceType;
  const lastAct     = deal.activities?.[0];
  const daysOld     = lastAct ? daysSince(lastAct.createdAt) : null;
  const isOverdue   = deal.nextActionDue && new Date(deal.nextActionDue) < new Date();
  const isStale     = daysOld != null && daysOld >= 30 && deal.dealStatus === 'OPEN';
  const didDrag     = useRef(false);

  return (
    <div
      draggable
      onDragStart={e => {
        didDrag.current = true;
        e.dataTransfer.effectAllowed = 'move';
        onDragStart(deal.id);
      }}
      onDragEnd={() => { onDragEnd(); setTimeout(() => { didDrag.current = false; }, 50); }}
      onClick={() => { if (!didDrag.current) onOpen(deal); }}
      className={`bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md hover:border-slate-300 transition-all cursor-grab active:cursor-grabbing select-none group ${
        isDragging ? 'opacity-40 scale-[0.97] shadow-none' : ''
      }`}
    >
      {/* Top stripe — color by pipeline */}
      <div className={`h-0.5 rounded-t-xl ${deal.pipeline === 'PROCUREMENT' ? 'bg-orange-400' : 'bg-blue-400'}`} />

      <div className="px-3 py-3">
        {/* Row 1: deal number + badges */}
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <span className="text-[10px] font-mono font-bold text-slate-400">
            #{String(deal.dealNumber).padStart(3, '0')}
          </span>
          <div className="flex items-center gap-1 flex-wrap justify-end">
            {deal.dealStatus !== 'OPEN' && (
              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${st.color}`}>
                {st.label}
              </span>
            )}
            {svcLabel && (
              <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 border border-slate-200">
                {svcLabel}
              </span>
            )}
          </div>
        </div>

        {/* Row 2: title */}
        <p className="text-sm font-semibold text-slate-900 leading-snug mb-0.5 line-clamp-2">
          {deal.title}
        </p>

        {/* Row 3: client + location */}
        <div className="mb-2">
          {deal.client && (
            <p className="text-xs text-slate-500 truncate">{deal.client.name}</p>
          )}
          {(deal.city || deal.state) && (
            <p className="text-[10px] text-slate-400 truncate">
              {[deal.city, deal.state].filter(Boolean).join(', ')}
              {deal.numberOfUnits ? ` · ${deal.numberOfUnits} units` : ''}
            </p>
          )}
        </div>

        {/* Divider */}
        <div className="border-t border-slate-100 mb-2" />

        {/* Row 4: revenue + date */}
        <div className="flex items-center justify-between text-xs">
          <span className="font-bold text-slate-800">
            {(() => {
              const rev = deal.pipeline === 'DESIGN'
                ? (deal.designFeeTotal ?? deal.totalRevenue)
                : deal.totalRevenue;
              return rev ? fmtMoney(rev) : <span className="text-slate-400 font-normal">No value</span>;
            })()}
          </span>
          {deal.expectedOrderDate && (
            <span className="text-slate-400">{fmtDate(deal.expectedOrderDate)}</span>
          )}
        </div>

        {/* Row 5: probability + staleness + next action */}
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          <div className="flex items-center gap-1">
            <div className="w-12 h-1 rounded-full bg-slate-200 overflow-hidden">
              <div
                className="h-full rounded-full bg-orange-400"
                style={{ width: `${deal.probability}%` }}
              />
            </div>
            <span className="text-[10px] text-slate-400">{deal.probability}%</span>
          </div>
          {isStale && (
            <span className="text-[10px] text-amber-600 font-semibold flex items-center gap-0.5">
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd"/></svg>
              {daysOld}d
            </span>
          )}
          {isOverdue && (
            <span className="text-[10px] text-red-600 font-semibold flex items-center gap-0.5 ml-auto">
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd"/></svg>
              Action due
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Kanban Column ─────────────────────────────────────────────────────────────

function KanbanColumn({ stageCfg, deals, pipeline, onOpenDeal, onAddDeal, draggingId, onDragStart, onDragEnd, onDrop }) {
  const [dragOver, setDragOver] = useState(false);
  const revenueField = pipeline === 'DESIGN' ? 'designFeeTotal' : 'totalRevenue';
  const totalValue = deals.reduce((s, d) => s + (d[revenueField] || 0), 0);
  const isActiveDrop = dragOver && draggingId;

  return (
    <div className="flex flex-col min-w-[260px] w-[260px] shrink-0">
      {/* Column header */}
      <div
        className={`rounded-xl mb-2 px-3 py-2.5 transition-colors ${isActiveDrop ? 'ring-2' : ''}`}
        style={{
          border: `1px solid ${isActiveDrop ? stageCfg.color : '#e2e8f0'}`,
          borderTopColor: stageCfg.color,
          borderTopWidth: 3,
          background: isActiveDrop ? `${stageCfg.color}10` : '#f8fafc',
          ...(isActiveDrop ? { boxShadow: `0 0 0 2px ${stageCfg.color}40` } : {}),
        }}
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold" style={{ color: stageCfg.color }}>{stageCfg.label}</span>
          <span className="text-[10px] font-bold text-slate-400 bg-slate-200 rounded-full px-1.5 py-0.5">{deals.length}</span>
        </div>
        <p className="text-[11px] font-semibold mt-0.5" style={{ color: totalValue > 0 ? stageCfg.color : '#cbd5e1' }}>
          {totalValue > 0 ? fmtMoney(totalValue) : '—'}
        </p>
      </div>

      {/* Drop zone */}
      <div
        className={`flex-1 min-h-[200px] rounded-xl transition-all space-y-2 p-2 ${
          isActiveDrop
            ? 'border-2 border-dashed'
            : 'bg-slate-100/50'
        }`}
        style={isActiveDrop ? { borderColor: stageCfg.color, backgroundColor: `${stageCfg.color}08` } : {}}
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(false); }}
        onDrop={() => { setDragOver(false); onDrop(stageCfg.stage); }}
      >
        {deals.map(deal => (
          <DealCard
            key={deal.id}
            deal={deal}
            onOpen={onOpenDeal}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            isDragging={draggingId === deal.id}
          />
        ))}

        {/* Drop hint when dragging over an empty column */}
        {isActiveDrop && deals.length === 0 && (
          <div className="flex items-center justify-center h-16 rounded-lg text-xs font-semibold" style={{ color: stageCfg.color }}>
            Drop here → {stageCfg.label}
          </div>
        )}

        {/* Add deal button */}
        <button
          onClick={() => onAddDeal(stageCfg.stage)}
          className="w-full py-2 rounded-lg text-xs text-slate-400 hover:text-slate-600 hover:bg-white border border-dashed border-slate-300 hover:border-slate-400 transition-all flex items-center justify-center gap-1"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
          Add deal
        </button>
      </div>
    </div>
  );
}

// ── Pipeline Summary Bar ──────────────────────────────────────────────────────

function PipelineSummary({ deals, pipeline }) {
  const open    = deals.filter(d => d.pipeline === pipeline && d.dealStatus === 'OPEN');
  const won     = deals.filter(d => d.pipeline === pipeline && d.dealStatus === 'WON');
  const onHold  = deals.filter(d => d.pipeline === pipeline && d.dealStatus === 'ON_HOLD');
  const highProb = open.filter(d => d.probability >= 80);

  const revenueField = pipeline === 'DESIGN' ? 'designFeeTotal' : 'totalRevenue';
  const sum = arr => arr.reduce((s, d) => s + (d[revenueField] || 0), 0);

  const stats = [
    { label: 'Open Pipeline',   value: fmtMoney(sum(open))     || '—', color: 'text-slate-900' },
    { label: 'High Prob (80%+)', value: fmtMoney(sum(highProb)) || '—', color: 'text-orange-600' },
    { label: 'Won (all time)',   value: fmtMoney(sum(won))      || '—', color: 'text-green-700' },
    { label: 'On Hold',          value: fmtMoney(sum(onHold))   || '—', color: 'text-amber-600' },
    { label: 'Open Deals',       value: open.length,                    color: 'text-slate-700' },
  ];

  return (
    <div className="flex items-center gap-px bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm mb-4">
      {stats.map((s, i) => (
        <div key={i} className={`flex-1 px-4 py-2.5 ${i < stats.length - 1 ? 'border-r border-slate-100' : ''}`}>
          <p className={`text-base font-bold ${s.color}`}>{s.value}</p>
          <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wide mt-0.5">{s.label}</p>
        </div>
      ))}
    </div>
  );
}

// ── List View ─────────────────────────────────────────────────────────────────

function ListView({ deals, onOpen, onUpdate, pipeline }) {
  const [sortKey,       setSortKey]       = useState('updatedAt');
  const [sortDir,       setSortDir]       = useState('desc');
  const [editingStatus, setEditingStatus] = useState(null);
  const [savingStatus,  setSavingStatus]  = useState(null);

  // ── Multi-select ────────────────────────────────────────────────────────────
  const [selected,    setSelected]    = useState(new Set());
  const [bulkSaving,  setBulkSaving]  = useState(false);
  const [bulkDone,    setBulkDone]    = useState(null); // success message

  const stages = PIPELINE_STAGES[pipeline] || [];
  const stageLabel = s => stages.find(x => x.stage === s)?.label || s;
  const revenueField = pipeline === 'DESIGN' ? 'designFeeTotal' : 'totalRevenue';

  function toggleSort(key) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  }

  const sorted = [...deals].sort((a, b) => {
    let av = a[sortKey], bv = b[sortKey];
    if (sortKey === 'client') { av = a.client?.name || ''; bv = b.client?.name || ''; }
    if (typeof av === 'string' || typeof bv === 'string') {
      const as = String(av ?? ''), bs = String(bv ?? '');
      return sortDir === 'asc' ? as.localeCompare(bs) : bs.localeCompare(as);
    }
    if (av == null) return 1;
    if (bv == null) return -1;
    return sortDir === 'asc' ? av - bv : bv - av;
  });

  // Select / deselect helpers
  const allIds      = sorted.map(d => d.id);
  const allSelected = allIds.length > 0 && allIds.every(id => selected.has(id));
  const someSelected = !allSelected && allIds.some(id => selected.has(id));

  function toggleRow(id, e) {
    e.stopPropagation();
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
  function toggleAll(e) {
    e.stopPropagation();
    setSelected(allSelected ? new Set() : new Set(allIds));
  }
  function clearSelection() { setSelected(new Set()); setBulkDone(null); }

  // ── Single-row inline status change ────────────────────────────────────────
  async function changeStatus(deal, newStatus) {
    setSavingStatus(deal.id);
    setEditingStatus(null);
    try {
      const res = await fetch(`/api/crm/deals/${deal.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dealStatus: newStatus }),
      });
      if (res.ok) onUpdate(await res.json());
    } finally {
      setSavingStatus(null);
    }
  }

  // ── Bulk update ─────────────────────────────────────────────────────────────
  async function bulkUpdate(patch) {
    if (selected.size === 0 || bulkSaving) return;
    setBulkSaving(true);
    setBulkDone(null);
    try {
      const ids = [...selected];
      const results = await Promise.allSettled(
        ids.map(id =>
          fetch(`/api/crm/deals/${id}`, {
            method:  'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(patch),
          }).then(r => r.ok ? r.json() : Promise.reject(r.status))
        )
      );
      results.forEach(r => { if (r.status === 'fulfilled') onUpdate(r.value); });
      const ok = results.filter(r => r.status === 'fulfilled').length;
      setBulkDone(`Updated ${ok} of ${ids.length} deal${ids.length !== 1 ? 's' : ''}`);
      clearSelection();
    } finally {
      setBulkSaving(false);
    }
  }

  const Th = ({ col, label }) => (
    <th
      onClick={() => toggleSort(col)}
      className="px-3 py-2.5 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider cursor-pointer hover:text-slate-600 whitespace-nowrap select-none"
    >
      {label}
      {sortKey === col && <span className="ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>}
    </th>
  );

  const colSpanTotal = 10;

  return (
    <div className="flex flex-col gap-2">

      {/* ── Bulk action toolbar ─────────────────────────────────────────────── */}
      {(selected.size > 0 || bulkDone) && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 text-white rounded-xl shadow-lg flex-wrap">
          {/* Count */}
          <span className="text-xs font-bold text-white mr-1">
            {selected.size > 0 ? `${selected.size} selected` : bulkDone}
          </span>

          {selected.size > 0 && (
            <>
              <div className="w-px h-4 bg-slate-600 mx-1" />

              {/* Change Status */}
              <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Set Status:</span>
              {Object.entries(DEAL_STATUS_CONFIG).map(([val, cfg]) => (
                <button
                  key={val}
                  disabled={bulkSaving}
                  onClick={() => bulkUpdate({ dealStatus: val })}
                  className={`text-[10px] font-bold px-2.5 py-1 rounded-lg border transition-all disabled:opacity-40 hover:opacity-80 ${cfg.color}`}
                >
                  {cfg.label}
                </button>
              ))}

              <div className="w-px h-4 bg-slate-600 mx-1" />

              {/* Change Stage */}
              <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Set Stage:</span>
              <select
                disabled={bulkSaving}
                defaultValue=""
                onChange={e => { if (e.target.value) { bulkUpdate({ stage: e.target.value }); e.target.value = ''; } }}
                className="text-[10px] font-semibold border border-slate-600 rounded-lg px-2 py-1 bg-slate-800 text-white focus:outline-none focus:ring-2 focus:ring-orange-400 disabled:opacity-40 cursor-pointer"
              >
                <option value="">— pick stage —</option>
                {stages.map(s => <option key={s.stage} value={s.stage}>{s.label}</option>)}
              </select>

              <div className="flex-1" />
            </>
          )}

          {/* Done toast / clear */}
          {bulkDone && selected.size === 0 && (
            <span className="text-xs text-green-400 font-semibold flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
              {bulkDone}
            </span>
          )}

          {bulkSaving && (
            <span className="text-xs text-slate-400 ml-auto animate-pulse">Saving…</span>
          )}

          <button
            onClick={clearSelection}
            className="ml-auto text-slate-400 hover:text-white transition-colors p-1 rounded"
            title="Clear selection"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
      )}

      {/* ── Table ───────────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              {/* Select-all checkbox */}
              <th className="pl-4 pr-2 py-2.5 w-8" onClick={e => e.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={el => { if (el) el.indeterminate = someSelected; }}
                  onChange={toggleAll}
                  className="w-3.5 h-3.5 rounded accent-orange-500 cursor-pointer"
                />
              </th>
              <th className="px-3 py-2.5 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider w-14">#</th>
              <Th col="title"             label="Deal" />
              <Th col="client"            label="Client" />
              <Th col="stage"             label="Stage" />
              <Th col={revenueField}      label="Value" />
              <Th col="probability"       label="Prob" />
              <Th col="expectedOrderDate" label="Expected" />
              <Th col="dealStatus"        label="Status" />
              <th className="px-3 py-2.5 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Owner</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sorted.map(deal => {
              const st         = DEAL_STATUS_CONFIG[deal.dealStatus] || DEAL_STATUS_CONFIG.OPEN;
              const isSaving   = savingStatus === deal.id;
              const isEditing  = editingStatus === deal.id;
              const isSelected = selected.has(deal.id);
              return (
                <tr
                  key={deal.id}
                  onClick={() => { if (!isEditing) onOpen(deal); }}
                  className={`cursor-pointer transition-colors ${isSelected ? 'bg-orange-50 hover:bg-orange-50' : 'hover:bg-slate-50'}`}
                >
                  {/* Row checkbox */}
                  <td className="pl-4 pr-2 py-2.5" onClick={e => toggleRow(deal.id, e)}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => {}}
                      className="w-3.5 h-3.5 rounded accent-orange-500 cursor-pointer"
                    />
                  </td>
                  <td className="px-3 py-2.5 text-[10px] font-mono text-slate-400">
                    #{String(deal.dealNumber).padStart(3, '0')}
                  </td>
                  <td className="px-3 py-2.5">
                    <p className="font-semibold text-slate-900 truncate max-w-[200px]">{deal.title}</p>
                  </td>
                  <td className="px-3 py-2.5 text-slate-500 truncate max-w-[140px]">
                    {deal.client?.name || '—'}
                  </td>
                  <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">
                    {stageLabel(deal.stage)}
                  </td>
                  <td className="px-3 py-2.5 font-semibold text-slate-800 whitespace-nowrap">
                    {fmtMoney(deal[revenueField]) || <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                      <div className="w-10 h-1.5 rounded-full bg-slate-200 overflow-hidden">
                        <div className="h-full rounded-full bg-orange-400" style={{ width: `${deal.probability}%` }} />
                      </div>
                      <span className="text-[11px] text-slate-500">{deal.probability}%</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-slate-400 whitespace-nowrap text-xs">
                    {fmtDate(deal.expectedOrderDate) || '—'}
                  </td>
                  <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                    {isEditing ? (
                      <select
                        autoFocus
                        defaultValue={deal.dealStatus}
                        onBlur={() => setEditingStatus(null)}
                        onChange={e => changeStatus(deal, e.target.value)}
                        className="text-[10px] font-bold border border-slate-300 rounded px-1.5 py-0.5 bg-white focus:outline-none focus:ring-2 focus:ring-orange-400 cursor-pointer"
                        onClick={e => e.stopPropagation()}
                      >
                        {Object.entries(DEAL_STATUS_CONFIG).map(([v, c]) => (
                          <option key={v} value={v}>{c.label}</option>
                        ))}
                      </select>
                    ) : (
                      <button
                        title="Click to change status"
                        disabled={isSaving}
                        onClick={e => { e.stopPropagation(); setEditingStatus(deal.id); }}
                        className={`text-[10px] font-bold px-2 py-0.5 rounded border transition-all hover:scale-105 disabled:opacity-50 ${st.color}`}
                      >
                        {isSaving ? '…' : st.label}
                      </button>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-slate-500 text-xs whitespace-nowrap">
                    {deal.owner?.name || '—'}
                  </td>
                </tr>
              );
            })}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={colSpanTotal} className="px-4 py-12 text-center text-slate-400 text-sm">
                  No deals match your filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Main CRMClient ────────────────────────────────────────────────────────────

export default function CRMClient({ initialDeals, clients, users, currentUser }) {
  const [deals,       setDeals]       = useState(initialDeals);
  const [pipeline,    setPipeline]    = useState('PROCUREMENT');
  const [viewMode,    setViewMode]    = useState('kanban'); // 'kanban' | 'list'
  const [drawerDeal,  setDrawerDeal]  = useState(null);  // deal object or null
  const [createModal, setCreateModal] = useState(null);  // null | { stage, pipeline }
  const [filters,     setFilters]     = useState({
    search:      '',
    dealStatus:  '',  // '' (all) | OPEN | WON | LOST | ON_HOLD
    serviceType: '',
    ownerId:     '',
  });

  const dragId     = useRef(null);
  const [draggingId, setDraggingId] = useState(null);

  // ── Filtered deals ──────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return deals.filter(d => {
      if (d.pipeline !== pipeline) return false;
      if (filters.dealStatus  && d.dealStatus  !== filters.dealStatus)  return false;
      if (filters.serviceType && d.serviceType !== filters.serviceType) return false;
      if (filters.ownerId     && d.ownerId     !== filters.ownerId)     return false;
      if (filters.search) {
        const q = filters.search.toLowerCase();
        if (
          !d.title.toLowerCase().includes(q) &&
          !(d.client?.name || '').toLowerCase().includes(q) &&
          !(d.notes || '').toLowerCase().includes(q)
        ) return false;
      }
      return true;
    });
  }, [deals, pipeline, filters]);

  const dealsByStage = useMemo(() => {
    const map = {};
    const stages = PIPELINE_STAGES[pipeline] || [];
    stages.forEach(s => { map[s.stage] = []; });
    filtered.forEach(d => { if (map[d.stage]) map[d.stage].push(d); });
    return map;
  }, [filtered, pipeline]);

  // ── Drag and drop ───────────────────────────────────────────────────────────
  function handleDragStart(id) {
    dragId.current = id;
    setDraggingId(id);
  }
  function handleDragEnd() {
    dragId.current = null;
    setDraggingId(null);
  }

  async function handleDrop(newStage) {
    const id = dragId.current;
    dragId.current = null;
    setDraggingId(null);
    if (!id) return;
    const deal = deals.find(d => d.id === id);
    if (!deal || deal.stage === newStage) return;

    // Optimistic update
    setDeals(prev => prev.map(d => d.id === id ? { ...d, stage: newStage } : d));

    // Persist — stage change logs activity in the API
    try {
      const res = await fetch(`/api/crm/deals/${id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ stage: newStage }),
      });
      if (!res.ok) throw new Error('failed');
      const updated = await res.json();
      setDeals(prev => prev.map(d => d.id === id ? updated : d));
    } catch {
      // Rollback
      setDeals(prev => prev.map(d => d.id === id ? deal : d));
    }
  }

  // ── Deal CRUD callbacks ─────────────────────────────────────────────────────
  function handleDealCreated(newDeal) {
    setDeals(prev => [newDeal, ...prev]);
    setCreateModal(null);
    setDrawerDeal(newDeal);
  }

  function handleDealUpdated(updated) {
    setDeals(prev => prev.map(d => d.id === updated.id ? updated : d));
    setDrawerDeal(updated);
  }

  function handleDealDeleted(id) {
    setDeals(prev => prev.filter(d => d.id !== id));
    setDrawerDeal(null);
  }

  // ── Refresh a single deal (for drawer activity updates) ──────────────────
  async function refreshDeal(id) {
    try {
      const res  = await fetch(`/api/crm/deals/${id}`);
      const data = await res.json();
      setDeals(prev => prev.map(d => d.id === id ? data : d));
      setDrawerDeal(data);
    } catch {}
  }

  const stages = PIPELINE_STAGES[pipeline] || [];

  return (
    <div className="flex flex-col h-screen bg-slate-50 overflow-hidden">
      {/* ── Header ── */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 shrink-0">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-[10px] font-bold text-orange-500 uppercase tracking-wider">ILC Studios</span>
            </div>
            <h1 className="text-xl font-bold text-slate-900">Pipeline</h1>
          </div>

          {/* Pipeline tabs */}
          <div className="flex items-center bg-slate-100 rounded-xl p-1 gap-1">
            {['PROCUREMENT', 'DESIGN'].map(p => (
              <button
                key={p}
                onClick={() => setPipeline(p)}
                className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  pipeline === p
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {p === 'PROCUREMENT' ? '📦 Procurement' : '✏️ Design'}
              </button>
            ))}
          </div>

          {/* View toggle + New deal */}
          <div className="flex items-center gap-2">
            <div className="flex bg-slate-100 rounded-xl p-1 gap-1">
              <button
                onClick={() => setViewMode('kanban')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${viewMode === 'kanban' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M9 4.5v15m6-15v15M3.75 9h16.5M3.75 15h16.5" /></svg>
                Board
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${viewMode === 'list' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" /></svg>
                List
              </button>
            </div>

            <button
              onClick={() => setCreateModal({ stage: stages[0]?.stage, pipeline })}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold transition-colors shadow-sm"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
              New Deal
            </button>
          </div>
        </div>

        {/* Filter bar */}
        <div className="flex items-center gap-2 mt-3 flex-wrap">
          {/* Search */}
          <div className="relative">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>
            <input
              value={filters.search}
              onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
              placeholder="Search deals…"
              className="pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-orange-400 w-44"
            />
          </div>

          {/* Status filter */}
          <div className="flex items-center gap-1">
            {[
              { val: '',        label: 'All'     },
              { val: 'OPEN',    label: 'Open'    },
              { val: 'WON',     label: 'Won'     },
              { val: 'ON_HOLD', label: 'On Hold' },
            ].map(s => (
              <button
                key={s.val}
                onClick={() => setFilters(f => ({ ...f, dealStatus: s.val }))}
                className={`px-2.5 py-1.5 text-[10px] font-bold rounded-lg transition-colors ${
                  filters.dealStatus === s.val
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-500 hover:bg-slate-200'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>

          {/* Service type filter */}
          <select
            value={filters.serviceType}
            onChange={e => setFilters(f => ({ ...f, serviceType: e.target.value }))}
            className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-600 focus:outline-none focus:ring-2 focus:ring-orange-400"
          >
            <option value="">All service types</option>
            {Object.entries(SERVICE_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>

          {/* Owner filter */}
          <select
            value={filters.ownerId}
            onChange={e => setFilters(f => ({ ...f, ownerId: e.target.value }))}
            className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-600 focus:outline-none focus:ring-2 focus:ring-orange-400"
          >
            <option value="">All owners</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.name || u.email}</option>)}
          </select>

          <span className="text-xs text-slate-400 ml-auto">{filtered.length} deal{filtered.length !== 1 ? 's' : ''}</span>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex-1 overflow-hidden flex flex-col px-6 py-4">
        {/* Pipeline summary */}
        <PipelineSummary deals={deals} pipeline={pipeline} />

        {/* Kanban */}
        {viewMode === 'kanban' && (
          <div className="flex gap-3 overflow-x-auto flex-1 pb-4">
            {stages.map(stageCfg => (
              <KanbanColumn
                key={stageCfg.stage}
                stageCfg={stageCfg}
                deals={dealsByStage[stageCfg.stage] || []}
                pipeline={pipeline}
                onOpenDeal={deal => setDrawerDeal(deal)}
                onAddDeal={stage => setCreateModal({ stage, pipeline })}
                draggingId={draggingId}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onDrop={handleDrop}
              />
            ))}
          </div>
        )}

        {/* List */}
        {viewMode === 'list' && (
          <div className="flex-1 overflow-y-auto">
            <ListView
              deals={filtered}
              onOpen={deal => setDrawerDeal(deal)}
              onUpdate={handleDealUpdated}
              pipeline={pipeline}
            />
          </div>
        )}
      </div>

      {/* ── Deal Drawer ── */}
      {drawerDeal && (
        <DealDrawer
          deal={drawerDeal}
          clients={clients}
          users={users}
          currentUser={currentUser}
          onClose={() => setDrawerDeal(null)}
          onUpdate={handleDealUpdated}
          onDelete={handleDealDeleted}
          onRefresh={() => refreshDeal(drawerDeal.id)}
        />
      )}

      {/* ── Create/Edit Deal Modal ── */}
      {createModal && (
        <DealModal
          defaultPipeline={createModal.pipeline}
          defaultStage={createModal.stage}
          clients={clients}
          users={users}
          currentUser={currentUser}
          onSave={handleDealCreated}
          onClose={() => setCreateModal(null)}
        />
      )}
    </div>
  );
}
