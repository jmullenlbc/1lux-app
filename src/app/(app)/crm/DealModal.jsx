'use client';
import { useState, useEffect, useRef } from 'react';
import { PIPELINE_STAGES } from './CRMClient';
import { BUILDING_TYPES, SERVICE_TYPES } from '@/lib/utils';

// Map utils SERVICE_TYPES keys → Deal serviceType values
// (utils uses camelCase, Deal uses UPPER_SNAKE; we keep the utils values as-is)
const SERVICE_TYPE_OPTIONS = SERVICE_TYPES; // [{ value, label }]

const inputCls  = 'w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent';
const selectCls = inputCls;

function Field({ label, required, children, className = '' }) {
  return (
    <div className={className}>
      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

// ── New Client quick-create modal ────────────────────────────────────────────

function NewClientModal({ onClose, onCreated }) {
  const [name,    setName]    = useState('');
  const [saving,  setSaving]  = useState(false);
  const [err,     setErr]     = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) { setErr('Client name is required'); return; }
    setSaving(true); setErr('');
    try {
      const res  = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), type: 'developer', locationType: 'standalone' }),
      });
      const data = await res.json();
      if (!res.ok) { setErr(data.error || 'Save failed'); return; }
      onCreated(data.client);
    } catch { setErr('Network error'); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="text-sm font-bold text-slate-900">Quick Add Client</h2>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-3">
          {err && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{err}</p>}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Client Name *</label>
            <input
              autoFocus
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g., Greystar"
              className={inputCls}
            />
          </div>
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-2 rounded-lg text-xs font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 py-2 rounded-lg text-xs font-bold bg-orange-500 hover:bg-orange-600 text-white disabled:opacity-60">
              {saving ? 'Creating…' : 'Create Client'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main DealModal ────────────────────────────────────────────────────────────

export default function DealModal({
  defaultPipeline = 'PROCUREMENT',
  defaultStage,
  clients: initialClients,
  users,
  currentUser,
  onSave,
  onClose,
}) {
  const initialStage = defaultStage || PIPELINE_STAGES[defaultPipeline]?.[0]?.stage || '';

  const [clients,        setClients]        = useState(initialClients || []);
  const [showNewClient,  setShowNewClient]  = useState(false);
  const [saving,         setSaving]         = useState(false);
  const [error,          setError]          = useState('');

  const [form, setForm] = useState({
    title:             '',
    pipeline:          defaultPipeline,
    stage:             initialStage,
    clientId:          '',
    buildingType:      '',
    city:              '',
    state:             '',
    numberOfUnits:     '',
    serviceType:       '',
    totalRevenue:      '',
    probability:       '50',
    expectedOrderDate: '',
    notes:             '',
    ownerId:           currentUser?.id || '',
  });

  // Autocomplete state (match existing deal/project names)
  const [suggestions,   setSuggestions]   = useState([]);
  const [showSuggest,   setShowSuggest]   = useState(false);
  const [activeSuggest, setActiveSuggest] = useState(-1);
  const titleRef    = useRef(null);
  const suggestRef  = useRef(null);

  useEffect(() => { titleRef.current?.focus(); }, []);

  useEffect(() => {
    function onClick(e) {
      if (suggestRef.current && !suggestRef.current.contains(e.target) &&
          titleRef.current && !titleRef.current.contains(e.target)) {
        setShowSuggest(false);
      }
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  // Close on Escape (but not if sub-modal is open)
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape' && !showNewClient) onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, showNewClient]);

  function set(key, val) {
    setForm(f => ({ ...f, [key]: val }));
    if (error) setError('');
  }

  function setPipeline(val) {
    const newStages = PIPELINE_STAGES[val] || [];
    setForm(f => ({ ...f, pipeline: val, stage: newStages[0]?.stage || '' }));
  }

  // Title autocomplete — search existing deals
  async function handleTitleChange(e) {
    const val = e.target.value;
    set('title', val);
    if (val.trim().length >= 2) {
      try {
        const res  = await fetch(`/api/crm/deals?search=${encodeURIComponent(val)}`);
        const data = await res.json();
        const matches = (data.deals || []).slice(0, 5);
        setSuggestions(matches);
        setShowSuggest(matches.length > 0);
        setActiveSuggest(-1);
      } catch { /* ignore */ }
    } else {
      setSuggestions([]);
      setShowSuggest(false);
    }
  }

  function selectSuggestion(deal) {
    setForm(f => ({
      ...f,
      title:        deal.title,
      clientId:     deal.clientId     || f.clientId,
      buildingType: deal.buildingType || f.buildingType,
      city:         deal.city         || f.city,
      state:        deal.state        || f.state,
      serviceType:  deal.serviceType  || f.serviceType,
    }));
    setSuggestions([]);
    setShowSuggest(false);
    setTimeout(() => titleRef.current?.focus(), 0);
  }

  function handleTitleKeyDown(e) {
    if (!showSuggest || !suggestions.length) return;
    if (e.key === 'ArrowDown')  { e.preventDefault(); setActiveSuggest(i => Math.min(i + 1, suggestions.length - 1)); }
    else if (e.key === 'ArrowUp')   { e.preventDefault(); setActiveSuggest(i => Math.max(i - 1, -1)); }
    else if (e.key === 'Enter' && activeSuggest >= 0) { e.preventDefault(); selectSuggestion(suggestions[activeSuggest]); }
    else if (e.key === 'Escape') { setShowSuggest(false); }
  }

  function handleClientCreated(newClient) {
    setClients(prev => [...prev, newClient].sort((a, b) => a.name.localeCompare(b.name)));
    setForm(f => ({ ...f, clientId: newClient.id }));
    setShowNewClient(false);
  }

  const currentStages = PIPELINE_STAGES[form.pipeline] || [];
  const selectedClient = clients.find(c => c.id === form.clientId);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.title.trim()) { setError('Deal name is required.'); return; }
    if (!form.stage)        { setError('Please select a stage.'); return; }

    setSaving(true); setError('');
    try {
      const payload = {
        title:             form.title.trim(),
        pipeline:          form.pipeline,
        stage:             form.stage,
        clientId:          form.clientId          || null,
        buildingType:      form.buildingType       || null,
        city:              form.city.trim()        || null,
        state:             form.state.trim()       || null,
        numberOfUnits:     form.numberOfUnits      ? Number(form.numberOfUnits) : null,
        serviceType:       form.serviceType        || null,
        totalRevenue:      form.totalRevenue       ? Number(form.totalRevenue)  : null,
        probability:       Number(form.probability) || 50,
        expectedOrderDate: form.expectedOrderDate  || null,
        notes:             form.notes              || null,
        ownerId:           form.ownerId            || null,
      };
      const res = await fetch('/api/crm/deals', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      });
      if (!res.ok) { const d = await res.json(); setError(d.error || 'Failed to create deal.'); return; }
      onSave(await res.json());
    } finally { setSaving(false); }
  }

  return (
    <>
      {showNewClient && (
        <NewClientModal
          onClose={() => setShowNewClient(false)}
          onCreated={handleClientCreated}
        />
      )}

      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 backdrop-blur-[2px] z-50 flex items-start justify-center pt-12 pb-6 px-4"
        onClick={onClose}
      >
        {/* Modal */}
        <div
          className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col overflow-hidden max-h-[calc(100vh-96px)]"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">
            <div>
              <h2 className="text-base font-bold text-slate-900">New Deal / Project</h2>
              <p className="text-xs text-slate-400 mt-0.5">Start tracking a potential project in the pipeline.</p>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-6 py-5">
            <form onSubmit={handleSubmit}>
              <div className="space-y-5">

                {/* ── Section: Project Identity ── */}
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Project Details</p>
                  <div className="space-y-4">

                    {/* Deal / Project Name with autocomplete */}
                    <Field label="Project Name" required>
                      <div className="relative">
                        <input
                          ref={titleRef}
                          autoComplete="off"
                          className={inputCls}
                          value={form.title}
                          onChange={handleTitleChange}
                          onKeyDown={handleTitleKeyDown}
                          onFocus={() => suggestions.length > 0 && setShowSuggest(true)}
                          placeholder="e.g., Zenith on 25th"
                        />
                        {showSuggest && suggestions.length > 0 && (
                          <div ref={suggestRef} className="absolute z-30 mt-1 w-full bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden">
                            <div className="px-3 pt-2 pb-1 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100">
                              Existing — select to copy as starting point
                            </div>
                            {suggestions.map((deal, i) => (
                              <button
                                key={deal.id}
                                type="button"
                                onMouseDown={e => { e.preventDefault(); selectSuggestion(deal); }}
                                className={`w-full text-left px-3 py-2.5 flex items-center gap-3 text-sm transition-colors ${i === activeSuggest ? 'bg-orange-50' : 'hover:bg-slate-50'}`}
                              >
                                <span className="text-[10px] font-mono text-slate-400 shrink-0">
                                  #{String(deal.dealNumber).padStart(3, '0')}
                                </span>
                                <span className="font-medium text-slate-800 truncate">{deal.title}</span>
                                {(deal.city || deal.state) && (
                                  <span className="text-xs text-slate-400 shrink-0">
                                    {[deal.city, deal.state].filter(Boolean).join(', ')}
                                  </span>
                                )}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </Field>

                    {/* Client */}
                    <Field label="Client / Developer">
                      <div className="flex gap-2">
                        <select
                          className={`${selectCls} flex-1`}
                          value={form.clientId}
                          onChange={e => set('clientId', e.target.value)}
                        >
                          <option value="">— No client assigned —</option>
                          {clients.map(c => (
                            <option key={c.id} value={c.id}>
                              #{String(c.clientNumber || 0).padStart(3, '0')} — {c.name}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => setShowNewClient(true)}
                          className="px-3 py-2 rounded-lg border border-slate-200 text-xs text-slate-500 hover:bg-slate-50 transition-colors whitespace-nowrap"
                        >
                          + New Client
                        </button>
                      </div>
                      {selectedClient && (
                        <p className="mt-1 text-[11px] text-slate-400">{selectedClient.type}</p>
                      )}
                    </Field>

                    {/* Building Type */}
                    <Field label="Building Type">
                      <select className={selectCls} value={form.buildingType} onChange={e => set('buildingType', e.target.value)}>
                        <option value="">— Select building type —</option>
                        {BUILDING_TYPES.map(t => (
                          <option key={t.value} value={t.value}>{t.label}</option>
                        ))}
                      </select>
                    </Field>

                    {/* City + State */}
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="City">
                        <input
                          className={inputCls}
                          value={form.city}
                          onChange={e => set('city', e.target.value)}
                          placeholder="e.g., Denver"
                        />
                      </Field>
                      <Field label="State">
                        <input
                          className={inputCls}
                          value={form.state}
                          onChange={e => set('state', e.target.value)}
                          placeholder="e.g., CO"
                        />
                      </Field>
                    </div>

                    {/* Units + Service Type */}
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="# of Units">
                        <input
                          type="number"
                          min="0"
                          className={inputCls}
                          value={form.numberOfUnits}
                          onChange={e => set('numberOfUnits', e.target.value)}
                          placeholder="e.g., 250"
                        />
                      </Field>
                      <Field label="Service Type">
                        <select className={selectCls} value={form.serviceType} onChange={e => set('serviceType', e.target.value)}>
                          <option value="">— None —</option>
                          {SERVICE_TYPE_OPTIONS.map(t => (
                            <option key={t.value} value={t.value}>{t.label}</option>
                          ))}
                        </select>
                      </Field>
                    </div>

                  </div>
                </div>

                {/* Divider */}
                <div className="border-t border-slate-100" />

                {/* ── Section: Pipeline / CRM ── */}
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Pipeline</p>
                  <div className="space-y-4">

                    {/* Pipeline */}
                    <Field label="Pipeline">
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          { value: 'PROCUREMENT', label: '📦 Procurement', sub: 'Product sales' },
                          { value: 'DESIGN',      label: '✏️ Design',      sub: 'Design fees'   },
                        ].map(p => (
                          <button
                            key={p.value}
                            type="button"
                            onClick={() => setPipeline(p.value)}
                            className={`p-3 rounded-xl border text-left transition-all ${
                              form.pipeline === p.value
                                ? 'border-orange-400 bg-orange-50 shadow-sm'
                                : 'border-slate-200 hover:border-slate-300'
                            }`}
                          >
                            <div className="text-sm font-semibold text-slate-900">{p.label}</div>
                            <div className="text-[10px] text-slate-400 mt-0.5">{p.sub}</div>
                          </button>
                        ))}
                      </div>
                    </Field>

                    {/* Stage */}
                    <Field label="Starting Stage">
                      <select className={selectCls} value={form.stage} onChange={e => set('stage', e.target.value)}>
                        {currentStages.map(s => (
                          <option key={s.stage} value={s.stage}>{s.label}</option>
                        ))}
                      </select>
                    </Field>

                    {/* Revenue + Probability */}
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Estimated Value ($)">
                        <input
                          type="number"
                          min="0"
                          step="1000"
                          className={inputCls}
                          value={form.totalRevenue}
                          onChange={e => set('totalRevenue', e.target.value)}
                          placeholder="e.g., 850000"
                        />
                      </Field>
                      <Field label={`Probability — ${form.probability}%`}>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          step="5"
                          className="w-full accent-orange-500 mt-2"
                          value={form.probability}
                          onChange={e => set('probability', e.target.value)}
                        />
                      </Field>
                    </div>

                    {/* Expected Order Date + Owner */}
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Expected Order Date">
                        <input
                          type="date"
                          className={inputCls}
                          value={form.expectedOrderDate}
                          onChange={e => set('expectedOrderDate', e.target.value)}
                        />
                      </Field>
                      <Field label="Deal Owner">
                        <select className={selectCls} value={form.ownerId} onChange={e => set('ownerId', e.target.value)}>
                          <option value="">— Unassigned —</option>
                          {users.map(u => (
                            <option key={u.id} value={u.id}>{u.name || u.email}</option>
                          ))}
                        </select>
                      </Field>
                    </div>

                    {/* Notes */}
                    <Field label="Notes">
                      <textarea
                        rows={3}
                        className={`${inputCls} resize-none`}
                        value={form.notes}
                        onChange={e => set('notes', e.target.value)}
                        placeholder="Source of lead, background context, etc."
                      />
                    </Field>

                  </div>
                </div>

              </div>

              {/* Error */}
              {error && (
                <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                  {error}
                </div>
              )}
            </form>
          </div>

          {/* Footer */}
          <div className="shrink-0 flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-200 bg-slate-50">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-200 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={saving || !form.title.trim()}
              className="px-6 py-2 text-sm font-bold rounded-xl bg-orange-500 hover:bg-orange-600 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
            >
              {saving ? 'Creating…' : 'Create Deal'}
            </button>
          </div>

        </div>
      </div>
    </>
  );
}
