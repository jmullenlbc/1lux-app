'use client';
import { useState, useEffect, useRef } from 'react';
import { PIPELINE_STAGES, SERVICE_TYPE_LABELS, PROJECT_TYPE_LABELS } from './CRMClient';
import { BUILDING_TYPES, SERVICE_TYPES } from '@/lib/utils';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtMoney(val) {
  if (val == null) return '';
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(2)}M`;
  if (val >= 1_000)     return `$${(val / 1_000).toFixed(0)}K`;
  return `$${val.toLocaleString()}`;
}

function fmtDatetime(str) {
  if (!str) return '—';
  try {
    return new Date(str).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    });
  } catch { return '—'; }
}

function fmtDatetimeFull(str) {
  if (!str) return '';
  try {
    return new Date(str).toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit',
    });
  } catch { return ''; }
}

function toDateInput(str) {
  if (!str) return '';
  try { return new Date(str).toISOString().slice(0, 10); }
  catch { return ''; }
}

const ACTIVITY_ICONS = {
  NOTE:          { icon: '📝', color: 'bg-slate-100 text-slate-600' },
  CALL:          { icon: '📞', color: 'bg-blue-50  text-blue-600'  },
  EMAIL:         { icon: '✉️',  color: 'bg-violet-50 text-violet-600' },
  MEETING:       { icon: '🤝', color: 'bg-green-50 text-green-600' },
  STAGE_CHANGE:  { icon: '⟶',  color: 'bg-amber-50 text-amber-600' },
  STATUS_CHANGE: { icon: '⚑',  color: 'bg-orange-50 text-orange-600' },
};

const CONTACT_ROLE_LABELS = {
  DEVELOPER:        'Developer',
  ARCHITECT:        'Architect',
  GC:               'General Contractor',
  EC:               'Electrical Contractor',
  INTERIOR_DESIGNER:'Interior Designer',
  OTHER:            'Other',
};

const DEAL_STATUS_CONFIG = {
  OPEN:      { label: 'Open',      color: 'text-blue-700  bg-blue-50  border-blue-200'   },
  WON:       { label: 'Won',       color: 'text-green-700 bg-green-50 border-green-200'  },
  LOST:      { label: 'Lost',      color: 'text-red-700   bg-red-50   border-red-200'    },
  ABANDONED: { label: 'Abandoned', color: 'text-slate-600 bg-slate-100 border-slate-200' },
  ON_HOLD:   { label: 'On Hold',   color: 'text-amber-700 bg-amber-50 border-amber-200'  },
};

// ── Editable field component ──────────────────────────────────────────────────

function EditField({ label, children, className = '' }) {
  return (
    <div className={className}>
      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
        {label}
      </label>
      {children}
    </div>
  );
}

const inputCls = 'w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent';
const selectCls = inputCls;

// ── Overview Tab ─────────────────────────────────────────────────────────────

function OverviewTab({ deal, clients, users, onUpdate, onDelete }) {
  const [form, setForm] = useState({
    title:             deal.title             || '',
    stage:             deal.stage             || '',
    dealStatus:        deal.dealStatus        || 'OPEN',
    designStatus:      deal.designStatus      || 'OPEN',
    pipeline:          deal.pipeline          || 'PROCUREMENT',
    city:              deal.city              || '',
    state:             deal.state             || '',
    buildingType:      deal.buildingType      || '',
    numberOfUnits:     deal.numberOfUnits     != null ? String(deal.numberOfUnits) : '',
    serviceType:       deal.serviceType       || '',
    projectType:       deal.projectType       || '',
    totalRevenue:      deal.totalRevenue      != null ? String(deal.totalRevenue)   : '',
    designFeeTotal:    deal.designFeeTotal    != null ? String(deal.designFeeTotal) : '',
    probability:       deal.probability       != null ? String(deal.probability)  : '50',
    expectedOrderDate: toDateInput(deal.expectedOrderDate),
    notes:             deal.notes             || '',
    clientId:          deal.clientId          || '',
    ownerId:           deal.ownerId           || '',
  });

  const [saveStatus, setSaveStatus]     = useState('idle'); // 'idle' | 'saving' | 'saved' | 'error'
  const [confirmDelete, setConfirmDelete] = useState(false);
  const debounceRef  = useRef(null);
  const savedTimerRef = useRef(null);
  const formRef      = useRef(form);
  formRef.current    = form;

  // Reset form when a different deal is opened
  useEffect(() => {
    clearTimeout(debounceRef.current);
    clearTimeout(savedTimerRef.current);
    setForm({
      title:             deal.title             || '',
      stage:             deal.stage             || '',
      dealStatus:        deal.dealStatus        || 'OPEN',
    designStatus:      deal.designStatus      || 'OPEN',
      pipeline:          deal.pipeline          || 'PROCUREMENT',
      city:              deal.city              || '',
      state:             deal.state             || '',
      buildingType:      deal.buildingType      || '',
      numberOfUnits:     deal.numberOfUnits     != null ? String(deal.numberOfUnits) : '',
      serviceType:       deal.serviceType       || '',
      projectType:       deal.projectType       || '',
      totalRevenue:      deal.totalRevenue      != null ? String(deal.totalRevenue)   : '',
      designFeeTotal:    deal.designFeeTotal    != null ? String(deal.designFeeTotal) : '',
      probability:       deal.probability       != null ? String(deal.probability)  : '50',
      expectedOrderDate: toDateInput(deal.expectedOrderDate),
      notes:             deal.notes             || '',
      clientId:          deal.clientId          || '',
      ownerId:           deal.ownerId           || '',
    });
    setSaveStatus('idle');
  }, [deal.id]);

  async function persist(snapshot) {
    setSaveStatus('saving');
    try {
      const payload = {
        title:             snapshot.title.trim(),
        stage:             snapshot.stage,
        dealStatus:        snapshot.dealStatus,
        designStatus:      snapshot.designStatus,
        pipeline:          snapshot.pipeline,
        city:              snapshot.city          || null,
        state:             snapshot.state         || null,
        buildingType:      snapshot.buildingType  || null,
        numberOfUnits:     snapshot.numberOfUnits ? Number(snapshot.numberOfUnits) : null,
        serviceType:       snapshot.serviceType   || null,
        projectType:       snapshot.projectType   || null,
        totalRevenue:      snapshot.totalRevenue   ? Number(snapshot.totalRevenue)   : null,
        designFeeTotal:    snapshot.designFeeTotal ? Number(snapshot.designFeeTotal) : null,
        probability:       Number(snapshot.probability) || 50,
        expectedOrderDate: snapshot.expectedOrderDate || null,
        notes:             snapshot.notes         || null,
        clientId:          snapshot.clientId      || null,
        ownerId:           snapshot.ownerId       || null,
      };
      const res = await fetch(`/api/crm/deals/${deal.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      });
      if (!res.ok) {
        let msg = 'Autosave failed';
        try { const e = await res.json(); msg = e.error || msg; } catch {}
        setSaveStatus('error');
        alert(msg);
        return;
      }
      const updated = await res.json();
      onUpdate(updated);
      setSaveStatus('saved');
      savedTimerRef.current = setTimeout(() => setSaveStatus('idle'), 2000);
    } catch {
      setSaveStatus('error');
    }
  }

  function scheduleSave(newForm, delay = 1000) {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => persist(newForm), delay);
  }

  function set(key, val, delay = 1000) {
    const next = { ...formRef.current, [key]: val };
    setForm(next);
    formRef.current = next;
    scheduleSave(next, delay);
  }

  // Pipeline change resets stage to first stage of new pipeline
  function setPipeline(val) {
    const newStages = PIPELINE_STAGES[val] || [];
    const next = { ...formRef.current, pipeline: val, stage: newStages[0]?.stage || '' };
    setForm(next);
    formRef.current = next;
    scheduleSave(next, 0);
  }

  async function deleteDeal() {
    const res = await fetch(`/api/crm/deals/${deal.id}`, { method: 'DELETE' });
    if (!res.ok) { const e = await res.json(); alert(e.error || 'Delete failed'); return; }
    onDelete(deal.id);
  }

  const st   = DEAL_STATUS_CONFIG[form.dealStatus]   || DEAL_STATUS_CONFIG.OPEN;
  const stDes = DEAL_STATUS_CONFIG[form.designStatus] || DEAL_STATUS_CONFIG.OPEN;
  const currentStages = PIPELINE_STAGES[form.pipeline] || [];
  const hasDualStatus = ['FULL_SERVICE_DESIGN', 'DESIGN_ASSIST'].includes(form.serviceType);

  return (
    <div className="flex flex-col gap-4 pb-6">

      {/* Status row */}
      <div className="flex items-center gap-2 flex-wrap">

        {/* Procurement status */}
        <div className="flex flex-col items-start gap-0.5">
          {hasDualStatus && (
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider px-1">Procurement</span>
          )}
          <select
            value={form.dealStatus}
            onChange={e => set('dealStatus', e.target.value, 0)}
            className={`text-[11px] font-bold px-2.5 py-1 rounded-full border cursor-pointer focus:outline-none focus:ring-2 focus:ring-orange-400 transition-colors ${st.color}`}
          >
            {Object.entries(DEAL_STATUS_CONFIG).map(([v, c]) => (
              <option key={v} value={v}>{c.label}</option>
            ))}
          </select>
        </div>

        {/* Design status — only for Full Design / Design Assist */}
        {hasDualStatus && (
          <div className="flex flex-col items-start gap-0.5">
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider px-1">Design</span>
            <select
              value={form.designStatus}
              onChange={e => set('designStatus', e.target.value, 0)}
              className={`text-[11px] font-bold px-2.5 py-1 rounded-full border cursor-pointer focus:outline-none focus:ring-2 focus:ring-orange-400 transition-colors ${stDes.color}`}
            >
              {Object.entries(DEAL_STATUS_CONFIG).map(([v, c]) => (
                <option key={v} value={v}>{c.label}</option>
              ))}
            </select>
          </div>
        )}

        {deal.linkedProject && (
          <a
            href={`/projects/${deal.linkedProject.id}`}
            className="text-[11px] font-bold px-2.5 py-1 rounded-full border border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100 transition-colors flex items-center gap-1"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" /></svg>
            Project #{deal.linkedProject.projectNumber}
          </a>
        )}
        {deal.linkedDeal && (
          <span className="text-[11px] font-bold px-2.5 py-1 rounded-full border border-violet-200 text-violet-700 bg-violet-50 flex items-center gap-1">
            Linked: {deal.linkedDeal.pipeline === 'DESIGN' ? '✏️' : '📦'} #{deal.linkedDeal.dealNumber}
          </span>
        )}
        <span className="text-[10px] text-slate-400 ml-auto flex items-center gap-2">
          {saveStatus === 'saving' && <span className="text-orange-400 font-medium">Saving…</span>}
          {saveStatus === 'saved'  && <span className="text-green-500 font-medium">Saved ✓</span>}
          {saveStatus === 'error'  && <span className="text-red-500  font-medium">Save failed</span>}
          Updated {fmtDatetime(deal.updatedAt)}
        </span>
      </div>

      {/* ── Fields ── */}
      <div className="grid grid-cols-2 gap-3">

        {/* Title */}
        <EditField label="Project Name">
          <input
            className={inputCls}
            value={form.title}
            onChange={e => set('title', e.target.value)}
          />
        </EditField>

        {/* Building Type */}
        <EditField label="Building Type">
          <select className={selectCls} value={form.buildingType} onChange={e => set('buildingType', e.target.value, 0)}>
            <option value="">— Select building type —</option>
            {BUILDING_TYPES.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </EditField>

        {/* City + State */}
        <EditField label="City">
          <input className={inputCls} value={form.city} onChange={e => set('city', e.target.value)} placeholder="Denver" />
        </EditField>
        <EditField label="State">
          <input className={inputCls} value={form.state} onChange={e => set('state', e.target.value)} placeholder="CO" />
        </EditField>

        {/* Units */}
        <EditField label="# of Units">
          <input type="number" min="0" className={inputCls} value={form.numberOfUnits} onChange={e => set('numberOfUnits', e.target.value)} placeholder="e.g. 250" />
        </EditField>

        {/* Service Type (from utils) */}
        <EditField label="Service Type">
          <select className={selectCls} value={form.serviceType} onChange={e => set('serviceType', e.target.value, 0)}>
            <option value="">— None —</option>
            {SERVICE_TYPES.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </EditField>

        {/* Pipeline */}
        <EditField label="Pipeline">
          <select className={selectCls} value={form.pipeline} onChange={e => setPipeline(e.target.value)}>
            <option value="PROCUREMENT">Procurement</option>
            <option value="DESIGN">Design</option>
          </select>
        </EditField>

        {/* Stage */}
        <EditField label="Stage">
          <select className={selectCls} value={form.stage} onChange={e => set('stage', e.target.value, 0)}>
            {currentStages.map(s => (
              <option key={s.stage} value={s.stage}>{s.label}</option>
            ))}
          </select>
        </EditField>

        {/* Client */}
        <EditField label="Client">
          <select className={selectCls} value={form.clientId} onChange={e => set('clientId', e.target.value, 0)}>
            <option value="">— No client —</option>
            {clients.map(c => (
              <option key={c.id} value={c.id}>
                #{String(c.clientNumber).padStart(3, '0')} — {c.name}
              </option>
            ))}
          </select>
        </EditField>

        {/* Project Type */}
        <EditField label="Project Type">
          <select className={selectCls} value={form.projectType} onChange={e => set('projectType', e.target.value, 0)}>
            <option value="">— None —</option>
            {Object.entries(PROJECT_TYPE_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </EditField>

        {/* Product Sale Total */}
        <EditField label="Product Sale Total ($)">
          <input
            type="number"
            min="0"
            step="1000"
            className={inputCls}
            value={form.totalRevenue}
            onChange={e => set('totalRevenue', e.target.value)}
            placeholder="0"
          />
        </EditField>

        {/* Design Fee Total */}
        <EditField label="Design Fee Total ($)">
          <input
            type="number"
            min="0"
            step="1000"
            className={inputCls}
            value={form.designFeeTotal}
            onChange={e => set('designFeeTotal', e.target.value)}
            placeholder="0"
          />
        </EditField>

        {/* Total Combined — read-only calculated */}
        <EditField label="Total Combined ($)">
          {(() => {
            const prod  = parseFloat(form.totalRevenue)   || 0;
            const des   = parseFloat(form.designFeeTotal) || 0;
            const total = prod + des;
            let display;
            if (total === 0)            display = '—';
            else if (total >= 1_000_000) display = `$${(total / 1_000_000).toFixed(2)}M`;
            else if (total >= 1_000)     display = `$${(total / 1_000).toFixed(0)}K`;
            else                         display = `$${total.toLocaleString()}`;
            return (
              <div className={`${inputCls} bg-slate-50 text-slate-500 cursor-default flex items-center gap-2`}>
                <span className={total === 0 ? 'text-slate-300' : ''}>{display}</span>
                <span className="text-[10px] text-slate-400 font-medium">auto-calculated</span>
              </div>
            );
          })()}
        </EditField>

        {/* Probability */}
        <EditField label={`Probability — ${form.probability}%`}>
          <input
            type="range"
            min="0"
            max="100"
            step="5"
            className="w-full accent-orange-500 mt-1.5"
            value={form.probability}
            onChange={e => set('probability', e.target.value)}
          />
        </EditField>

        {/* Expected Order */}
        <EditField label="Expected Order Date">
          <input
            type="date"
            className={inputCls}
            value={form.expectedOrderDate}
            onChange={e => set('expectedOrderDate', e.target.value, 0)}
          />
        </EditField>

        {/* Owner */}
        <EditField label="Owner">
          <select className={selectCls} value={form.ownerId} onChange={e => set('ownerId', e.target.value, 0)}>
            <option value="">— Unassigned —</option>
            {users.map(u => (
              <option key={u.id} value={u.id}>{u.name || u.email}</option>
            ))}
          </select>
        </EditField>

        {/* Notes */}
        <EditField label="Notes" className="col-span-2">
          <textarea
            rows={3}
            className={`${inputCls} resize-none`}
            value={form.notes}
            onChange={e => set('notes', e.target.value)}
            placeholder="Internal notes…"
          />
        </EditField>
      </div>

      {/* Delete */}
      <div className="pt-2 border-t border-slate-100">
        {!confirmDelete ? (
          <button
            onClick={() => setConfirmDelete(true)}
            className="text-xs text-slate-300 hover:text-red-500 transition-colors"
          >
            Delete this deal
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-xs text-red-600 font-semibold">Delete deal?</span>
            <button
              onClick={deleteDeal}
              className="px-2.5 py-1.5 text-xs font-bold rounded-lg bg-red-600 text-white hover:bg-red-700"
            >
              Yes, delete
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="px-2.5 py-1.5 text-xs font-bold rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-100"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Contacts Tab ──────────────────────────────────────────────────────────────

function ContactsTab({ deal, onUpdate }) {
  const [search,       setSearch]       = useState('');
  const [results,      setResults]      = useState([]);
  const [searching,    setSearching]    = useState(false);
  const [addRole,      setAddRole]      = useState('OTHER');
  const [addingId,     setAddingId]     = useState(null);
  const [removing,     setRemoving]     = useState(null);
  const [showSearch,   setShowSearch]   = useState(false);
  const debounce = useRef(null);

  useEffect(() => {
    if (!search.trim()) { setResults([]); return; }
    clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/crm/contacts?search=${encodeURIComponent(search)}`);
        const data = await res.json();
        // Filter out already-added contacts
        const added = new Set(deal.contacts.map(dc => dc.contactId));
        setResults((data.contacts || []).filter(c => !added.has(c.id)));
      } finally {
        setSearching(false);
      }
    }, 300);
  }, [search, deal.contacts]);

  async function addContact(contactId) {
    setAddingId(contactId);
    try {
      const res = await fetch(`/api/crm/deals/${deal.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ addContacts: [{ contactId, role: addRole }] }),
      });
      if (res.ok) {
        onUpdate(await res.json());
        setSearch('');
        setResults([]);
        setShowSearch(false);
      }
    } finally {
      setAddingId(null);
    }
  }

  async function removeContact(contactId) {
    setRemoving(contactId);
    try {
      const res = await fetch(`/api/crm/deals/${deal.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ removeContacts: [contactId] }),
      });
      if (res.ok) onUpdate(await res.json());
    } finally {
      setRemoving(null);
    }
  }

  return (
    <div className="flex flex-col gap-4 pb-6">
      {/* Existing contacts */}
      {deal.contacts.length === 0 && !showSearch && (
        <p className="text-sm text-slate-400 text-center py-8">No contacts linked yet.</p>
      )}

      <div className="space-y-2">
        {deal.contacts.map(dc => (
          <div key={dc.id} className="flex items-center gap-3 p-3 bg-white rounded-xl border border-slate-200">
            {/* Avatar */}
            <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-sm font-bold text-slate-500 shrink-0">
              {dc.contact.name.slice(0, 1).toUpperCase()}
            </div>
            {/* Info */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-900 truncate">{dc.contact.name}</p>
              <p className="text-[11px] text-slate-500 truncate">
                {dc.contact.title && `${dc.contact.title} · `}
                {CONTACT_ROLE_LABELS[dc.role] || dc.role}
              </p>
              {dc.contact.email && (
                <a href={`mailto:${dc.contact.email}`} className="text-[11px] text-blue-600 hover:underline truncate block">
                  {dc.contact.email}
                </a>
              )}
            </div>
            {/* Remove */}
            <button
              onClick={() => removeContact(dc.contactId)}
              disabled={removing === dc.contactId}
              className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-40"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        ))}
      </div>

      {/* Add contact */}
      {!showSearch ? (
        <button
          onClick={() => setShowSearch(true)}
          className="w-full py-2.5 text-sm font-semibold text-slate-500 hover:text-slate-700 border border-dashed border-slate-300 hover:border-slate-400 rounded-xl transition-all flex items-center justify-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
          Add Contact
        </button>
      ) : (
        <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Add Contact</p>

          {/* Role */}
          <select
            value={addRole}
            onChange={e => setAddRole(e.target.value)}
            className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-2 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-400"
          >
            {Object.entries(CONTACT_ROLE_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>

          {/* Search input */}
          <div className="relative">
            <input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name or email…"
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-orange-400"
            />
            {searching && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">…</span>
            )}
          </div>

          {/* Results */}
          {results.length > 0 && (
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {results.map(c => (
                <button
                  key={c.id}
                  onClick={() => addContact(c.id)}
                  disabled={addingId === c.id}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-left bg-white hover:bg-orange-50 rounded-lg border border-slate-200 hover:border-orange-300 transition-colors disabled:opacity-50 text-sm"
                >
                  <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-500 shrink-0">
                    {c.name.slice(0, 1).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-900 truncate text-xs">{c.name}</p>
                    <p className="text-[10px] text-slate-400 truncate">{c.client?.name || c.email || 'No company'}</p>
                  </div>
                  <svg className="w-3.5 h-3.5 text-orange-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                </button>
              ))}
            </div>
          )}

          {search.trim() && !searching && results.length === 0 && (
            <p className="text-xs text-slate-400 text-center py-1">No contacts found.</p>
          )}

          <button
            onClick={() => { setShowSearch(false); setSearch(''); setResults([]); }}
            className="text-xs text-slate-400 hover:text-slate-600"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

// ── Activity Tab ──────────────────────────────────────────────────────────────

function ActivityTab({ deal, onRefresh }) {
  const [type,    setType]    = useState('NOTE');
  const [body,    setBody]    = useState('');
  const [posting, setPosting] = useState(false);

  async function addActivity() {
    if (!body.trim()) return;
    setPosting(true);
    try {
      const res = await fetch(`/api/crm/deals/${deal.id}/activities`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, body }),
      });
      if (res.ok) {
        setBody('');
        onRefresh();
      }
    } finally {
      setPosting(false);
    }
  }

  const activities = deal.activities || [];

  return (
    <div className="flex flex-col gap-4 pb-6">
      {/* Add activity form */}
      <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
        <div className="flex gap-1">
          {['NOTE', 'CALL', 'EMAIL', 'MEETING'].map(t => {
            const cfg = ACTIVITY_ICONS[t];
            return (
              <button
                key={t}
                onClick={() => setType(t)}
                className={`flex-1 py-1.5 text-[10px] font-bold rounded-lg transition-colors ${
                  type === t
                    ? 'bg-white shadow-sm text-slate-900 border border-slate-200'
                    : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                {cfg.icon} {t}
              </button>
            );
          })}
        </div>
        <textarea
          rows={2}
          value={body}
          onChange={e => setBody(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) addActivity(); }}
          placeholder={`Add a ${type.toLowerCase()}… (⌘↩ to save)`}
          className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-orange-400 resize-none"
        />
        <button
          onClick={addActivity}
          disabled={!body.trim() || posting}
          className="w-full py-1.5 text-xs font-bold rounded-lg bg-orange-500 hover:bg-orange-600 text-white disabled:opacity-40 transition-colors"
        >
          {posting ? 'Saving…' : `Log ${type}`}
        </button>
      </div>

      {/* Activity list */}
      {activities.length === 0 && (
        <p className="text-sm text-slate-400 text-center py-6">No activity yet.</p>
      )}

      <div className="space-y-2">
        {activities.map(act => {
          const cfg = ACTIVITY_ICONS[act.type] || ACTIVITY_ICONS.NOTE;
          const isAuto = act.type === 'STAGE_CHANGE' || act.type === 'STATUS_CHANGE';
          return (
            <div key={act.id} className={`flex gap-3 p-3 rounded-xl border ${isAuto ? 'bg-slate-50 border-slate-100' : 'bg-white border-slate-200'}`}>
              {/* Icon */}
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm shrink-0 mt-0.5 ${cfg.color}`}>
                {cfg.icon}
              </div>
              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-0.5">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{act.type.replace('_', ' ')}</span>
                  {act.userName && (
                    <span className="text-[10px] text-slate-400">by {act.userName}</span>
                  )}
                  <span className="text-[10px] text-slate-300 ml-auto">{fmtDatetimeFull(act.createdAt)}</span>
                </div>
                <p className={`text-sm leading-snug ${isAuto ? 'text-slate-500 italic' : 'text-slate-800'}`}>
                  {act.body}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}


// ── Main DealDrawer ───────────────────────────────────────────────────────────

export default function DealDrawer({ deal, clients, users, currentUser, onClose, onUpdate, onDelete, onRefresh }) {
  const [tab,    setTab]    = useState('overview');
  // Close on Escape
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const st = DEAL_STATUS_CONFIG[deal.dealStatus] || DEAL_STATUS_CONFIG.OPEN;
  const stages = PIPELINE_STAGES[deal.pipeline] || [];
  const stageLabel = stages.find(s => s.stage === deal.stage)?.label || deal.stage;

  const tabs = [
    { key: 'overview',  label: 'Overview' },
    { key: 'contacts',  label: `Contacts ${deal._count?.contacts ? `(${deal._count.contacts})` : ''}` },
    { key: 'activity',  label: `Activity ${deal._count?.activities ? `(${deal._count.activities})` : ''}` },
  ];

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/20 backdrop-blur-[1px] z-40"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed right-0 top-0 bottom-0 w-[500px] bg-white shadow-2xl z-50 flex flex-col border-l border-slate-200 overflow-hidden">

        {/* Header */}
        <div className="shrink-0 border-b border-slate-200 px-5 py-4 bg-white">
          <div className="flex items-start gap-3">
            {/* Pipeline stripe */}
            <div className={`w-1 h-10 rounded-full shrink-0 mt-0.5 ${deal.pipeline === 'PROCUREMENT' ? 'bg-orange-400' : 'bg-blue-400'}`} />

            <div className="flex-1 min-w-0">
              {/* Deal number + pipeline */}
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-[10px] font-mono font-bold text-slate-400">
                  #{String(deal.dealNumber).padStart(3, '0')}
                </span>
                <span className="text-[10px] font-bold text-slate-400">
                  {deal.pipeline === 'PROCUREMENT' ? '📦 Procurement' : '✏️ Design'}
                </span>
                <span className="text-[10px] text-slate-300">·</span>
                <span className="text-[10px] text-slate-400">{stageLabel}</span>
              </div>
              <h2 className="text-base font-bold text-slate-900 leading-tight truncate">
                {deal.title}
              </h2>
              {deal.client && (
                <p className="text-xs text-slate-500 mt-0.5">{deal.client.name}</p>
              )}
            </div>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors shrink-0"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>

          {/* Tabs */}
          <div className="flex gap-0.5 mt-3 border-b border-slate-100 -mx-5 px-5">
            {tabs.map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`pb-2 px-3 text-xs font-semibold transition-colors border-b-2 ${
                  tab === t.key
                    ? 'border-orange-500 text-orange-600'
                    : 'border-transparent text-slate-400 hover:text-slate-600'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {tab === 'overview' && (
            <OverviewTab
              deal={deal}
              clients={clients}
              users={users}
              onUpdate={onUpdate}
              onDelete={onDelete}
            />
          )}
          {tab === 'contacts' && (
            <ContactsTab
              deal={deal}
              onUpdate={onUpdate}
            />
          )}
          {tab === 'activity' && (
            <ActivityTab
              deal={deal}
              onRefresh={onRefresh}
            />
          )}
        </div>

      </div>
    </>
  );
}
