'use client';
import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { Select } from '@/components/ui/Input';
import Card, { CardHeader, CardBody } from '@/components/ui/Card';
import { BUILDING_TYPES, PROJECT_PHASES, SERVICE_TYPES, LOCATION_TYPES, ORG_TYPE_OPTIONS, PROJECT_TYPES, clientTypeLabel, locationTypeLabel } from '@/lib/utils';
import MultiSelect from '@/components/ui/MultiSelect';
import { SALES_TAX_BASIS_HINT } from '@/lib/salesTaxEstimate';
import { useEstimatedSalesTax } from '@/components/useEstimatedSalesTax';

const BUDGET_TYPES = [
  { value: 'conceptual',  label: 'Conceptual Budget' },
  { value: 'design',      label: 'Full Design' },
  { value: 'peer_review', label: 'Bid' },
];

function NewClientModal({ onClose, onCreated }) {
  // Client Type is a multi-select, one company can be both a developer and a
  // self-performing GC. The API derives the legacy single `type` from the first
  // tick, so nothing downstream has to change.
  const [form,    setForm]    = useState({ name: '', orgTypes: [], locationType: 'standalone', notes: '' });
  const [saving,  setSaving]  = useState(false);
  const [err,     setErr]     = useState('');

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name.trim()) { setErr('Client name is required'); return; }
    setSaving(true); setErr('');
    try {
      const res  = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) { setErr(data.error || 'Save failed'); return; }
      onCreated(data.client);
    } catch { setErr('Network error'); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-bold text-slate-900">New Client</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {err && <div className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{err}</div>}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Client Name *</label>
            <input value={form.name} onChange={e => set('name', e.target.value)} autoFocus placeholder="e.g., Greystar"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500" />
          </div>
          <MultiSelect
            label="Client Type"
            options={ORG_TYPE_OPTIONS}
            selected={form.orgTypes}
            onChange={orgTypes => set('orgTypes', orgTypes)}
            hint="Tick every one that applies."
          />
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Location Type</label>
            <select value={form.locationType} onChange={e => set('locationType', e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white">
              {LOCATION_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2 rounded-lg text-sm font-semibold border border-slate-300 bg-white text-slate-700 hover:bg-slate-50">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 px-4 py-2 text-sm font-semibold rounded-lg bg-orange-500 hover:bg-orange-600 text-white disabled:opacity-60">
              {saving ? 'Creating…' : 'Create Client'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function NewProjectForm({ existingProjects = [], clients: initialClients = [], budgetType: initialBudgetType = 'conceptual' }) {
  const router = useRouter();
  const [clients,    setClients]    = useState(initialClients);
  const [showNewClient, setShowNewClient] = useState(false);
  const [form, setForm] = useState({
    name:         '',
    clientId:     '',
    projectType:  '',
    buildingType: '',
    salesTaxPct:  '',
    city:         '',
    state:        '',
    zip:          '',
    contactName:  '',
    contactEmail: '',
    phase:        'sd',
    serviceType:  '',
    budgetType:   initialBudgetType,
  });
  const [error,   setError]   = useState('');
  const [loading, setLoading] = useState(false);

  // Autocomplete
  const [suggestions,    setSuggestions]    = useState([]);
  const [showSuggest,    setShowSuggest]    = useState(false);
  const [activeSuggest,  setActiveSuggest]  = useState(-1);
  const [sourceProject,  setSourceProject]  = useState(null);
  const nameRef    = useRef(null);
  // Estimated sales tax follows the state until someone types a rate (Mike
  // 10-17: the real rate is address level, so we estimate and they overwrite).
  const taxBasis = useEstimatedSalesTax(form.state, form.zip, fn => setForm(f => {
    const next = fn(f.salesTaxPct);
    return next === f.salesTaxPct ? f : { ...f, salesTaxPct: next };
  }));
  const suggestRef = useRef(null);

  function handleNameChange(e) {
    const val = e.target.value;
    setForm(f => ({ ...f, name: val }));
    setSourceProject(null);
    if (val.trim().length >= 1) {
      const q = val.toLowerCase();
      const matches = existingProjects.filter(p => p.name.toLowerCase().includes(q)).slice(0, 6);
      setSuggestions(matches);
      setShowSuggest(matches.length > 0);
      setActiveSuggest(-1);
    } else {
      setSuggestions([]);
      setShowSuggest(false);
    }
  }

  function selectSuggestion(project) {
    setForm(f => ({
      ...f,
      name:         project.name,
      buildingType: project.buildingType || f.buildingType,
      city:         project.city         || f.city,
      state:        project.state        || f.state,
      zip:          project.zip          || f.zip,
      clientId:     project.clientId     || f.clientId,
    }));
    setSourceProject(project);
    setSuggestions([]);
    setShowSuggest(false);
    setTimeout(() => nameRef.current?.focus(), 0);
  }

  function handleNameKeyDown(e) {
    if (!showSuggest || !suggestions.length) return;
    if (e.key === 'ArrowDown')  { e.preventDefault(); setActiveSuggest(i => Math.min(i + 1, suggestions.length - 1)); }
    else if (e.key === 'ArrowUp')   { e.preventDefault(); setActiveSuggest(i => Math.max(i - 1, -1)); }
    else if (e.key === 'Enter' && activeSuggest >= 0) { e.preventDefault(); selectSuggestion(suggestions[activeSuggest]); }
    else if (e.key === 'Escape') { setShowSuggest(false); }
  }

  useEffect(() => {
    function handleClick(e) {
      if (suggestRef.current && !suggestRef.current.contains(e.target) &&
          nameRef.current && !nameRef.current.contains(e.target)) {
        setShowSuggest(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  function set(field) { return e => setForm(f => ({ ...f, [field]: e.target.value })); }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name.trim()) { setError('Project name is required'); return; }
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name:         form.name.trim(),
          clientId:     form.clientId     || null,
          projectType:  form.projectType  || null,
          buildingType: form.buildingType || null,
          salesTaxPct:  form.salesTaxPct    || null,
          city:         form.city.trim()  || null,
          state:        form.state.trim() || null,
          zip:          form.zip.trim()   || null,
          contactName:  form.contactName.trim()  || null,
          contactEmail: form.contactEmail.trim() || null,
          phase:        form.phase,
          serviceType:  form.serviceType  || null,
          budgetType:   form.budgetType,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to create project'); return; }
      router.push(`/project/${data.project.id}`);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  const selectedClient = clients.find(c => c.id === form.clientId);

  function handleClientCreated(newClient) {
    setClients(prev => [...prev, newClient].sort((a, b) => a.name.localeCompare(b.name)));
    setForm(f => ({ ...f, clientId: newClient.id }));
    setShowNewClient(false);
  }

  return (
    <>
    {showNewClient && (
      <NewClientModal onClose={() => setShowNewClient(false)} onCreated={handleClientCreated} />
    )}
    <div className="max-w-2xl mx-auto px-6 py-10">
      <div className="mb-8">
        <button onClick={() => router.back()}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-4 transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>
        <h1 className="text-2xl font-bold text-slate-900">New Project</h1>
        <p className="text-slate-500 text-sm mt-1">
          Fill in the project details below. You can update everything later from the project hub.
        </p>
      </div>

      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-slate-800">Project Details</h2>
        </CardHeader>
        <CardBody>
          <form onSubmit={handleSubmit} className="space-y-5">

            {/* Project Name */}
            <div className="relative">
              <label className="block text-sm font-medium text-slate-700 mb-1">Project Name *</label>
              <input
                ref={nameRef}
                type="text"
                autoComplete="off"
                placeholder="e.g., Zenith on 25th"
                value={form.name}
                onChange={handleNameChange}
                onKeyDown={handleNameKeyDown}
                onFocus={() => suggestions.length > 0 && setShowSuggest(true)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                autoFocus
              />
              {showSuggest && suggestions.length > 0 && (
                <div ref={suggestRef} className="absolute z-30 mt-1 w-full bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden">
                  <div className="px-3 pt-2 pb-1 text-[11px] font-semibold text-slate-500 uppercase tracking-wide border-b border-slate-100">
                    Existing, select to copy as starting point
                  </div>
                  {suggestions.map((project, i) => (
                    <button key={project.id} type="button"
                      onMouseDown={e => { e.preventDefault(); selectSuggestion(project); }}
                      className={`w-full text-left px-3 py-2.5 flex items-center gap-3 transition-colors ${i === activeSuggest ? 'bg-orange-50' : 'hover:bg-slate-50'}`}>
                      <div className="text-sm font-medium text-slate-800 truncate">{project.name}</div>
                      {(project.city || project.state) && (
                        <div className="text-xs text-slate-500 shrink-0">{[project.city, project.state].filter(Boolean).join(', ')}</div>
                      )}
                    </button>
                  ))}
                </div>
              )}
              {sourceProject && (
                <div className="mt-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800">
                  Pre-filled from <span className="font-semibold">{sourceProject.name}</span>. Edit the name to create a new project.
                </div>
              )}
            </div>

            {/* Contact + location sit right under the name (Mike, 2026-09-12:
                "add all 3 to the conceptual tool on the 1st page with name and
                email"), the same facts the public request form asks first. */}
            <div className="grid grid-cols-2 gap-4">
              <Input label="Contact Name" placeholder="e.g., Jordan Smith" value={form.contactName} onChange={set('contactName')} />
              <Input label="Contact Email" type="email" placeholder="name@company.com" value={form.contactEmail} onChange={set('contactEmail')} />
            </div>
            <div className="grid grid-cols-[1fr_5rem_7rem] gap-4">
              <Input label="City" placeholder="e.g., Denver" value={form.city} onChange={set('city')} />
              <Input label="State" placeholder="CO" maxLength={2} value={form.state} onChange={e => setForm(f => ({ ...f, state: e.target.value.toUpperCase() }))} />
              <Input label="Zip" placeholder="80202" inputMode="numeric" maxLength={10} value={form.zip} onChange={set('zip')} />
            </div>

            {/* Client */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Client</label>
              <div className="flex gap-2">
                <select
                  value={form.clientId}
                  onChange={set('clientId')}
                  className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 text-slate-700 bg-white"
                >
                  <option value="">No client assigned</option>
                  {clients.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setShowNewClient(true)}
                  className="px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap"
                >
                  + New Client
                </button>
              </div>
              {selectedClient && (
                <div className="mt-1.5 text-xs text-slate-500">
                  {clientTypeLabel(selectedClient.type)}
                  {selectedClient.locationType !== 'none' && ` · ${locationTypeLabel(selectedClient.locationType)}`}
                </div>
              )}
            </div>

            {/* Project Type, what kind of community this is. Building Type
                below is the construction shape (garden, podium, high-rise…). */}
            <Select label="Project Type" value={form.projectType} onChange={set('projectType')}>
              <option value="">Select project type...</option>
              {PROJECT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </Select>

            {/* Building Type, with the sales tax rate right beside it (Mike
                10-17, same place as the public tool). Typed as a percent;
                blank = before tax. */}
            <div className="flex items-start gap-4">
              <div className="flex-1 min-w-0">
                <Select label="Building Type" value={form.buildingType} onChange={set('buildingType')}>
                  <option value="">Select building type...</option>
                  {BUILDING_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </Select>
              </div>
              <div className="w-36 shrink-0">
                <Input
                  label="Estimated Sales Tax"
                  inputMode="decimal"
                  placeholder="8.25"
                  suffix="%"
                  hint={SALES_TAX_BASIS_HINT[taxBasis] || SALES_TAX_BASIS_HINT['']}
                  value={form.salesTaxPct}
                  onChange={e => setForm(f => ({ ...f, salesTaxPct: e.target.value.replace(/[^\d.]/g, '').slice(0, 6) }))}
                />
              </div>
            </div>

            {/* Phase */}
            <Select label="Current Phase" value={form.phase} onChange={set('phase')}>
              {PROJECT_PHASES.map(p => <option key={p.value} value={p.value}>{p.label}: {p.long}</option>)}
            </Select>

            {/* Service Type */}
            <Select label="Service Type" value={form.serviceType} onChange={set('serviceType')}>
              <option value="">Select service type…</option>
              {SERVICE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </Select>

            {/* Budget Type */}
            <Select label="Budget Type" value={form.budgetType} onChange={set('budgetType')}>
              {BUDGET_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </Select>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 text-sm text-red-600">{error}</div>
            )}

            <div className="flex gap-3 pt-2">
              <Button type="submit" variant="amber" size="lg" loading={loading}>
                Create Project
              </Button>
              <Button type="button" variant="secondary" size="lg" onClick={() => router.back()}>
                Cancel
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>
    </div>
    </>
  );
}
