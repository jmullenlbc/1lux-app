'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import TemplatesClient from './templates/TemplatesClient';
import SectionTabs, { PROPOSAL_TABS } from '@/components/ui/SectionTabs';
import { FilterToolbar, FilterPanel, countFilters } from '@/components/ui/FilterPanel';
import SortHeader, { sortRows } from '@/components/ui/SortHeader';
import StatTile from '@/components/ui/StatTile';
import { WidgetLoading } from '@/components/ui/WidgetFrame';
import { useUrlView } from '@/lib/useUrlView';
import { CARD, MODAL, BTN_PRIMARY, BTN_SECONDARY, BTN_COMPACT, INPUT, LABEL, H1, TD } from '@/components/ui/tokens';
import {
  STATUS_LABELS, TIME_WINDOWS, DEFAULT_TIME_WINDOW, withinWindow, distinctClients, proposalClientName,
} from '@/lib/proposals/listFilters';

// ── Constants ─────────────────────────────────────────────────────────────────

const PROPOSAL_TYPES = [
  { value: 'FULL_DESIGN',    label: 'Full Design' },
  { value: 'DESIGN_ASSIST',  label: 'Design Assist' },
  { value: 'PEER_REVIEW',    label: 'Peer Review' },
  // SCOPE_LETTER retired 2026-09-18 (Maram 9-17). Old rows still read as
  // "Scope Letter" in TypeBadge; nobody can pick it any more.
];

// Labels come from src/lib/proposals/listFilters.js: Accepted reads "Won" and
// Declined reads "Lost" on this screen (Mike 10-5). Keys are unchanged.
const STATUS_META = {
  DRAFT:    { label: STATUS_LABELS.DRAFT,    color: 'bg-amber-50 text-amber-700 border-amber-200' },
  SENT:     { label: STATUS_LABELS.SENT,     color: 'bg-slate-50 text-slate-700 border-slate-200' },
  ACCEPTED: { label: STATUS_LABELS.ACCEPTED, color: 'bg-green-50 text-green-700 border-green-200' },
  DECLINED: { label: STATUS_LABELS.DECLINED, color: 'bg-red-50 text-red-700 border-red-200' },
};
// Expired left the picker and the filter chips 2026-09-18 (Maram 9-17). A row
// that was already Expired keeps its badge; it just cannot be chosen any more.
const LEGACY_STATUS_META = {
  EXPIRED:  { label: STATUS_LABELS.EXPIRED,  color: 'bg-slate-100 text-slate-500 border-slate-200' },
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
  const m = STATUS_META[status] || LEGACY_STATUS_META[status] || STATUS_META.DRAFT;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-semibold border ${m.color}`}>
      {m.label}
    </span>
  );
}

function TypeBadge({ type }) {
  const labels = { FULL_DESIGN: 'Full Design', DESIGN_ASSIST: 'Design Assist', PEER_REVIEW: 'Peer Review', SCOPE_LETTER: 'Scope Letter' };
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200">
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
      <div className={`${MODAL} w-full max-w-sm overflow-hidden`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-bold text-slate-900">New Client</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {err && <div className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{err}</div>}
          <div>
            <label className={`block ${LABEL} mb-1`}>Client Name *</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              autoFocus placeholder="e.g., Greystar"
              className={INPUT} />
          </div>
          <div>
            <label className={`block ${LABEL} mb-1`}>Organization Type</label>
            <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
              className={INPUT}>
              {CLIENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose}
              className={`flex-1 ${BTN_SECONDARY}`}>
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className={`flex-1 ${BTN_PRIMARY}`}>
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
          title:       `${form.projectName.trim()}: ${PROPOSAL_TYPES.find(t => t.value === form.type)?.label}`,
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

  const inputCls = INPUT;
  const labelCls = `block ${LABEL} mb-1`;

  return (
    <>
      {showNewClient && (
        <NewClientModal onClose={() => setShowNewClient(false)} onCreated={handleClientCreated} />
      )}
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
        <div className={`${MODAL} w-full max-w-md`}>
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
            <h2 className="text-base font-bold text-slate-900">Add New Project</h2>
            <button onClick={onClose} className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100 text-xl leading-none">×</button>
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
                  className={`flex-1 ${INPUT}`}>
                  <option value="">No client assigned</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <button type="button" onClick={() => setShowNewClient(true)}
                  className={`${BTN_COMPACT} whitespace-nowrap`}>
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
                    className={`px-3 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                      form.type === t.value
                        ? 'bg-orange-50 border-orange-400 text-orange-700'
                        : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
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
                  <option value="">Blank, no template</option>
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
              <p className="text-xs text-slate-500 mt-1">
                Markup added on top of labor cost. 10% on $100K labor = $110K fee.
              </p>
            </div>
            {err && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</p>}
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={onClose}
                className={`flex-1 ${BTN_SECONDARY}`}>
                Cancel
              </button>
              <button type="submit" disabled={saving}
                className={`flex-1 ${BTN_PRIMARY}`}>
                {saving ? 'Creating…' : 'Create Project'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}

/// ── Proposals List ────────────────────────────────────────────────────────────

// Filters and sort live in the address (useUrlView). Time defaults to the last
// 60 days (Mike 10-5) when the address carries nothing.
const FILTER_FIELDS = [
  { key: 'status', label: 'Status',      kind: 'pick' },
  { key: 'type',   label: 'Type',        kind: 'pick' },
  { key: 'time',   label: 'Time window', kind: 'pick' },
  { key: 'client', label: 'Client',      kind: 'pick' },
];
const SORT_KEYS = ['title', 'client', 'type', 'status', 'fee', 'updated'];
const VIEW_FIELDS = [...FILTER_FIELDS, ...SORT_KEYS.map(k => ({ key: k, kind: 'sort' }))];
const SORT_DEFAULT = { key: '', dir: 'asc' };

function ProposalsList() {
  const [proposals, setProposals] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [err,       setErr]       = useState('');
  const { filters, setFilter, clearFilters, sort, toggleSort } = useUrlView({ fields: VIEW_FIELDS, sortDefault: SORT_DEFAULT });
  const [open,    setOpen]    = useState(false);
  const statusFilter = filters.status || 'all';
  const typeFilter   = filters.type   || 'all';
  // Mike 10-5: the list opens on the last 60 days (sent date, else created
  // date) and can be narrowed to one client. Both are client-side, like the rest.
  const timeFilter   = filters.time   || DEFAULT_TIME_WINDOW;
  const clientFilter = filters.client || '';
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

  const window     = TIME_WINDOWS.find(w => w.key === timeFilter) || TIME_WINDOWS[0];
  const clients    = distinctClients(proposals);
  // Time and client narrow everything, counts included, so the summary tiles
  // describe the rows on screen.
  const inWindow = proposals.filter(p =>
    withinWindow(p, window.days) && (!clientFilter || proposalClientName(p) === clientFilter));

  const filtered = inWindow.filter(p => {
    if (statusFilter !== 'all' && p.status !== statusFilter) return false;
    if (typeFilter   !== 'all' && p.type   !== typeFilter)   return false;
    return true;
  });

  const statusCounts = Object.keys(STATUS_META).reduce((acc, s) => {
    acc[s] = inWindow.filter(p => p.status === s).length;
    return acc;
  }, {});

  const activeFee = p => (p.overrideActive && p.overrideFee != null) ? p.overrideFee : p.calculatedFee;

  const sorted = useMemo(() => sortRows(filtered, sort, {
    title:   p => p.title || '',
    client:  p => proposalClientName(p) || '',
    type:    p => p.type || '',
    status:  p => (STATUS_META[p.status] || LEGACY_STATUS_META[p.status])?.label || p.status || '',
    fee:     p => activeFee(p) ?? null,
    updated: p => p.updatedAt ? new Date(p.updatedAt).getTime() : null,
  }), [filtered, sort]);

  const choices = {
    status: Object.entries(STATUS_META).map(([v, m]) => [v, m.label]),
    type:   PROPOSAL_TYPES.map(t => [t.value, t.label]),
    time:   TIME_WINDOWS.map(w => [w.key, w.label]),
    client: clients,
  };
  const filterCount = countFilters(filters, FILTER_FIELDS);

  function handleCreated(proposal) {
    setShowAdd(false);
    setProposals(prev => [proposal, ...prev]);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <p className="text-xs text-slate-500">Design fee proposals and project contracts</p>
        <button
          onClick={() => setShowAdd(true)}
          className={BTN_PRIMARY}
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
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          {Object.entries(STATUS_META).map(([status, meta]) => (
            <StatTile
              key={status}
              label={meta.label}
              value={statusCounts[status] || 0}
              onClick={() => setFilter('status', statusFilter === status ? '' : status)}
              className={statusFilter === status ? 'border-orange-400 bg-orange-50' : ''}
            />
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="mb-4">
        <FilterToolbar
          count={filterCount}
          open={open}
          onToggle={() => setOpen(o => !o)}
          onClear={clearFilters}
          shown={filtered.length}
          total={proposals.length}
          noun="proposals"
        >
          {filterCount === 0 && <span className="text-xs text-slate-500">{window.label}</span>}
        </FilterToolbar>
        <FilterPanel open={open} fields={FILTER_FIELDS} filters={{ ...filters, time: timeFilter }} choices={choices} onChange={setFilter} />
      </div>

      {/* Table */}
      {loading ? (
        <WidgetLoading />
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <h3 className="font-semibold text-slate-700 mb-1">
            {proposals.length === 0 ? 'No proposals yet' : 'No proposals match your filters'}
          </h3>
          <p className="text-sm text-slate-500 max-w-sm mb-5">
            {proposals.length === 0 ? 'Click "Add Project" to create your first proposal.' : 'Try adjusting the filters above, or pick All time.'}
          </p>
          {proposals.length > 0 && (
            <button onClick={() => { clearFilters(); setFilter('time', 'all'); }}
              className={BTN_SECONDARY}>
              Clear filters
            </button>
          )}
          {proposals.length === 0 && (
            <button onClick={() => setShowAdd(true)}
              className={BTN_PRIMARY}>
              Add Project
            </button>
          )}
        </div>
      ) : (
        <div className={`${CARD} overflow-hidden`}>
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <SortHeader field="title" label="Project / Proposal" sort={sort} onSort={toggleSort} />
                <SortHeader field="client" label="Client" sort={sort} onSort={toggleSort} />
                <SortHeader field="type" label="Type" sort={sort} onSort={toggleSort} />
                <SortHeader field="status" label="Status" sort={sort} onSort={toggleSort} />
                <SortHeader field="fee" label="Fee" sort={sort} onSort={toggleSort} align="right" />
                <SortHeader field="updated" label="Updated" sort={sort} onSort={toggleSort} align="right" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sorted.map(p => (
                <tr key={p.id}
                  className="hover:bg-slate-50 transition-colors cursor-pointer"
                  onClick={() => globalThis.location.href = `/project/${p.projectId}?tab=proposal`}>
                  <td className={TD}>
                    <div className="font-semibold text-slate-800">{p.title}</div>
                    {p.project?.name && p.project.name !== p.title && (
                      <div className="text-xs text-slate-500 mt-0.5">{p.project.name}</div>
                    )}
                  </td>
                  <td className={TD}>{proposalClientName(p) || 'none'}</td>
                  <td className={TD}><TypeBadge type={p.type} /></td>
                  <td className={TD}><StatusBadge status={p.status} /></td>
                  <td className={`${TD} text-right tabular-nums`}>
                    <span className={`font-semibold ${activeFee(p) > 0 ? 'text-slate-800' : 'text-slate-400'}`}>
                      {fmtMoney(activeFee(p))}
                    </span>
                    {p.overrideActive && (
                      <span className="text-xs text-violet-500 ml-1" title="Override active">★</span>
                    )}
                  </td>
                  <td className={`${TD} text-right text-xs text-slate-500 tabular-nums`}>{fmtDate(p.updatedAt)}</td>
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
  const searchParams = useSearchParams();
  const tab = searchParams.get('tab') === 'templates' ? 'templates' : 'proposals';

  return (
    <div className="px-4 py-6">
      {/* Proposals / Templates tabs (Mike 10-6), same look as Sales Automation. */}
      <SectionTabs tabs={PROPOSAL_TABS} active={tab} className="mb-5" />
      <div className="max-w-6xl mx-auto">
      {tab === 'proposals' && (
        <div className="flex items-center justify-between mb-4">
          <h1 className={H1}>Proposals</h1>
        </div>
      )}

      {tab === 'proposals' && <ProposalsList />}
      {tab === 'templates' && <TemplatesClient embedded />}
      </div>
    </div>
  );
}
