'use client';
import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import TemplatesClient from './templates/TemplatesClient';

// ── Constants ─────────────────────────────────────────────────────────────────

const PROPOSAL_TYPES = [
  { value: 'FULL_DESIGN',    label: 'Full Design' },
  { value: 'DESIGN_ASSIST',  label: 'Design Assist' },
  { value: 'PEER_REVIEW',    label: 'Peer Review' },
  { value: 'SCOPE_LETTER',   label: 'Scope Letter' },
];

const STATUS_META = {
  DRAFT:    { label: 'Draft',    color: 'bg-amber-100 text-amber-700 border-amber-200' },
  SENT:     { label: 'Sent',     color: 'bg-blue-100 text-blue-700 border-blue-200' },
  ACCEPTED: { label: 'Accepted', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  DECLINED: { label: 'Declined', color: 'bg-red-100 text-red-700 border-red-200' },
  EXPIRED:  { label: 'Expired',  color: 'bg-slate-100 text-slate-500 border-slate-200' },
};

const PROJECT_TYPES = [
  'multifamily', 'mixed_use', 'hospitality', 'commercial', 'retail',
  'office', 'healthcare', 'education', 'industrial', 'other',
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtMoney(v) {
  if (!v && v !== 0) return '—';
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000)     return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toLocaleString()}`;
}

function StatusBadge({ status }) {
  const m = STATUS_META[status] || STATUS_META.DRAFT;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${m.color}`}>
      {m.label}
    </span>
  );
}

function TypeBadge({ type }) {
  const labels = { FULL_DESIGN: 'Full Design', DESIGN_ASSIST: 'Design Assist', PEER_REVIEW: 'Peer Review', SCOPE_LETTER: 'Scope Letter' };
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
      {labels[type] || type}
    </span>
  );
}

// ── NewClientModal ────────────────────────────────────────────────────────────

const CLIENT_TYPES = [
  { value: 'developer',   label: 'Developer' },
  { value: 'architect',   label: 'Architect' },
  { value: 'gc',          label: 'General Contractor' },
  { value: 'owner',       label: 'Owner' },
  { value: 'other',       label: 'Other' },
];

function NewClientModal({ onClose, onCreated }) {
  const [form,   setForm]   = useState({ name: '', type: 'developer' });
  const [saving, setSaving] = useState(false);
  const [err,    setErr]    = useState('');

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
      if (!res.ok) { setErr(data.error || 'Save failed'); setSaving(false); return; }
      onCreated(data.client);
    } catch { setErr('Network error'); setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
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
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Client Name *</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              autoFocus placeholder="e.g., Greystar"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-400" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Organization Type</label>
            <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white">
              {CLIENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2 rounded-lg text-sm font-medium border border-slate-200 text-slate-600 hover:bg-slate-50">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 px-4 py-2 rounded-lg text-sm font-semibold bg-orange-500 hover:bg-orange-600 text-white disabled:opacity-60">
              {saving ? 'Creating…' : 'Create Client'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── AddProjectModal ───────────────────────────────────────────────────────────

function AddProjectModal({ onClose, onCreated }) {
  const [form, setForm] = useState({
    projectName: '',
    clientId: '',
    location: '',
    type: 'FULL_DESIGN',
    templateId: '',
    adderPct: 10,
  });
  const [clients,       setClients]       = useState([]);
  const [templates,     setTemplates]     = useState([]);
  const [showNewClient, setShowNewClient] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err,    setErr]    = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => {
    fetch('/api/proposal-templates')
      .then(r => r.ok ? r.json() : { templates: [] })
      .then(d => setTemplates(d.templates || []));
    fetch('/api/clients')
      .then(r => r.ok ? r.json() : { clients: [] })
      .then(d => setClients((d.clients || []).sort((a, b) => a.name.localeCompare(b.name))));
  }, []);

  const filteredTemplates = templates.filter(t => !t.type || t.type === form.type);
  const selectedClient    = clients.find(c => c.id === form.clientId);

  function handleClientCreated(newClient) {
    setClients(prev => [...prev, newClient].sort((a, b) => a.name.localeCompare(b.name)));
    set('clientId', newClient.id);
    setShowNewClient(false);
  }

  async function submit(e) {
    e.preventDefault();
    if (!form.projectName.trim()) { setErr('Project name is required'); return; }
    setSaving(true);
    setErr('');
    try {
      const res = await fetch('/api/proposals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectName: form.projectName.trim(),
          clientId:    form.clientId   || null,
          clientName:  selectedClient?.name || null,
          location:    form.location.trim() || null,
          type:        form.type,
          templateId:  form.templateId || null,
          adderPct:    Number(form.adderPct) || 10,
          title:       `${form.projectName.trim()} — ${PROPOSAL_TYPES.find(t => t.value === form.type)?.label}`,
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

  const inputCls = 'w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white';
  const labelCls = 'block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1';

  return (
    <>
      {showNewClient && (
        <NewClientModal onClose={() => setShowNewClient(false)} onCreated={handleClientCreated} />
      )}
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
            <h2 className="text-base font-bold text-slate-900">Add New Project</h2>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
          </div>
          <form onSubmit={submit} className="px-6 py-5 space-y-4">
            <div>
              <label className={labelCls}>Project Name *</label>
              <input value={form.projectName} onChange={e => set('projectName', e.target.value)}
                placeholder="Broadstone Apartments" className={inputCls} autoFocus />
            </div>
            <div>
              <label className={labelCls}>Client</label>
              <div className="flex gap-2">
                <select value={form.clientId} onChange={e => set('clientId', e.target.value)}
                  className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-400 text-slate-700 bg-white">
                  <option value="">No client assigned</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <button type="button" onClick={() => setShowNewClient(true)}
                  className="px-3 py-2 rounded-lg border border-slate-200 text-xs text-slate-500 hover:bg-slate-50 transition-colors whitespace-nowrap">
                  + New
                </button>
              </div>
            </div>
            <div>
              <label className={labelCls}>Location</label>
              <input value={form.location} onChange={e => set('location', e.target.value)}
                placeholder="Denver, CO" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Service Type</label>
              <div className="grid grid-cols-2 gap-2">
                {PROPOSAL_TYPES.map(t => (
                  <button key={t.value} type="button" onClick={() => set('type', t.value)}
                    className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                      form.type === t.value
                        ? 'bg-orange-500 text-white border-orange-500'
                        : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                    }`}>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
            {filteredTemplates.length > 0 && (
              <div>
                <label className={labelCls}>Template (optional)</label>
                <select value={form.templateId} onChange={e => set('templateId', e.target.value)} className={inputCls}>
                  <option value="">Blank — no template</option>
                  {filteredTemplates.map(t => (
                    <option key={t.id} value={t.id}>{t.name}{t.isDefault ? ' ★' : ''}</option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className={labelCls}>Overhead / Profit Adder %</label>
              <input type="number" min="0" max="100" step="0.5"
                value={form.adderPct} onChange={e => set('adderPct', e.target.value)}
                className={inputCls} />
              <p className="text-[11px] text-slate-400 mt-1">
                Markup added on top of labor cost. 10% on $100K labor = $110K fee.
              </p>
            </div>
            {err && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</p>}
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={onClose}
                className="flex-1 px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors">
                Cancel
              </button>
              <button type="submit" disabled={saving}
                className="flex-1 px-4 py-2 rounded-xl bg-orange-500 text-white text-sm font-bold hover:bg-orange-600 transition-colors disabled:opacity-50">
                {saving ? 'Creating…' : 'Create Project'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}

// ── Proposals List ────────────────────────────────────────────────────────────

function ProposalsList() {
  const [proposals, setProposals] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [err,       setErr]       = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter,   setTypeFilter]   = useState('all');
  const [showAdd,      setShowAdd]      = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const res = await fetch('/api/proposals');
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const data = await res.json();
      setProposals(data.proposals || []);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = proposals.filter(p => {
    if (statusFilter !== 'all' && p.status !== statusFilter) return false;
    if (typeFilter   !== 'all' && p.type   !== typeFilter)   return false;
    return true;
  });

  const statusCounts = Object.keys(STATUS_META).reduce((acc, s) => {
    acc[s] = proposals.filter(p => p.status === s).length;
    return acc;
  }, {});

  function handleCreated(proposal) {
    setShowAdd(false);
    setProposals(prev => [proposal, ...prev]);
  }

  const activeFee = p => (p.overrideActive && p.overrideFee != null) ? p.overrideFee : p.calculatedFee;

  return (
    <div>
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <p className="text-xs text-slate-500">Design fee proposals and project contracts</p>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-orange-500 text-white text-sm font-bold hover:bg-orange-600 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Add Project
        </button>
      </div>

      {err && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">{err}</p>}

      {/* Summary row */}
      {!loading && proposals.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-5">
          {Object.entries(STATUS_META).map(([status, meta]) => (
            <button
              key={status}
              onClick={() => setStatusFilter(s => s === status ? 'all' : status)}
              className={`rounded-xl border p-3 text-left transition-colors ${
                statusFilter === status ? 'border-slate-400 bg-white shadow-sm' : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
            >
              <div className="text-2xl font-bold text-slate-900">{statusCounts[status] || 0}</div>
              <div className={`text-xs font-semibold mt-0.5 ${meta.color.split(' ').filter(c => c.startsWith('text-')).join(' ')}`}>
                {meta.label}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
          {[['all', 'All'], ...Object.entries(STATUS_META).map(([v, m]) => [v, m.label])].map(([v, label]) => (
            <button key={v} onClick={() => setStatusFilter(v)}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                statusFilter === v ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}>
              {label}
            </button>
          ))}
        </div>
        <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
          <button onClick={() => setTypeFilter('all')}
            className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${typeFilter === 'all' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            All Types
          </button>
          {PROPOSAL_TYPES.map(t => (
            <button key={t.value} onClick={() => setTypeFilter(v => v === t.value ? 'all' : t.value)}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${typeFilter === t.value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-5 h-5 border-2 border-slate-200 border-t-orange-500 rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4 text-3xl">📄</div>
          <h3 className="font-semibold text-slate-700 mb-1">
            {proposals.length === 0 ? 'No proposals yet' : 'No proposals match your filters'}
          </h3>
          <p className="text-sm text-slate-400 max-w-sm mb-5">
            {proposals.length === 0 ? 'Click "Add Project" to create your first proposal.' : 'Try adjusting the filters above.'}
          </p>
          {proposals.length === 0 && (
            <button onClick={() => setShowAdd(true)}
              className="px-4 py-2 rounded-xl bg-orange-500 text-white text-sm font-bold hover:bg-orange-600 transition-colors">
              Add Project
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wide px-4 py-3">Project / Proposal</th>
                <th className="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wide px-4 py-3">Client</th>
                <th className="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wide px-4 py-3">Type</th>
                <th className="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wide px-4 py-3">Status</th>
                <th className="text-right text-[11px] font-semibold text-slate-400 uppercase tracking-wide px-4 py-3">Fee</th>
                <th className="text-right text-[11px] font-semibold text-slate-400 uppercase tracking-wide px-4 py-3">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.map(p => (
                <tr key={p.id}
                  className="hover:bg-slate-50 transition-colors cursor-pointer"
                  onClick={() => window.location.href = `/project/${p.projectId}?tab=proposal`}>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-sm text-slate-800">{p.title}</div>
                    {p.project?.name && p.project.name !== p.title && (
                      <div className="text-[11px] text-slate-400 mt-0.5">{p.project.name}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">{p.clientName || '—'}</td>
                  <td className="px-4 py-3"><TypeBadge type={p.type} /></td>
                  <td className="px-4 py-3"><StatusBadge status={p.status} /></td>
                  <td className="px-4 py-3 text-right">
                    <span className={`text-sm font-semibold ${activeFee(p) > 0 ? 'text-slate-800' : 'text-slate-300'}`}>
                      {fmtMoney(activeFee(p))}
                    </span>
                    {p.overrideActive && (
                      <span className="text-[10px] text-violet-500 ml-1" title="Override active">★</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-[11px] text-slate-400">{fmtDate(p.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showAdd && <AddProjectModal onClose={() => setShowAdd(false)} onCreated={handleCreated} />}
    </div>
  );
}

// ── Main Page (tabbed) ────────────────────────────────────────────────────────

export default function ProposalsClient() {
  const router     = useRouter();
  const pathname   = usePathname();
  const searchParams = useSearchParams();
  const tab = searchParams.get('tab') === 'templates' ? 'templates' : 'proposals';

  function setTab(t) {
    const p = new URLSearchParams(searchParams.toString());
    if (t === 'proposals') p.delete('tab'); else p.set('tab', t);
    router.replace(`${pathname}?${p.toString()}`, { scroll: false });
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      {/* Page header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-slate-900">Proposals</h1>
        <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
          {[['proposals', 'Proposals'], ['templates', 'Templates']].map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                tab === id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'proposals' && <ProposalsList />}
      {tab === 'templates' && <TemplatesClient embedded />}
    </div>
  );
}
