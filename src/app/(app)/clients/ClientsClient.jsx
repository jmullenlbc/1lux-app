'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

import {
  ORG_TYPE_OPTIONS, LOCATION_TYPES,
  clientTypeLabel, locationTypeLabel, clientTypeKeyFromLabel,
} from '@/lib/utils';
import { clientDealCounts, parseList } from '@/lib/crmClient';
import MultiSelect from '@/components/ui/MultiSelect';
import ConfirmArchiveModal from '@/components/salesAutomation/ConfirmArchiveModal';
import StatTile from '@/components/ui/StatTile';
import { FilterToolbar, FilterPanel, SearchBox, countFilters } from '@/components/ui/FilterPanel';
import { SortSelect, sortRows } from '@/components/ui/SortHeader';
import { useUrlView } from '@/lib/useUrlView';
import { CARD_PADDED, MODAL, BTN_PRIMARY, BTN_SECONDARY, H1, LABEL, INPUT, HELPER, NUM } from '@/components/ui/tokens';

const FILTER_FIELDS = [
  { key: 'tag', label: 'Tag', kind: 'pick' },
];
const VIEW_FIELDS = [...FILTER_FIELDS, { key: 'q', kind: 'text' }];
const SORT_FIELDS = [
  { key: 'name',     label: 'Name' },
  { key: 'city',     label: 'City' },
  { key: 'open',     label: 'Open projects' },
  { key: 'projects', label: 'Projects' },
  { key: 'people',   label: 'People' },
];
const SORT_GETTERS = {
  name:     c => c.name,
  city:     c => c.city,
  open:     c => clientDealCounts(c.projects).open,
  projects: c => c._count?.projects || 0,
  people:   c => c._count?.contacts || 0,
};

function ClientTypeTag({ type }) {
  if (!type) return null;
  const colors = {
    developer:                 'bg-blue-50 text-blue-700',
    generalContractor:         'bg-orange-50 text-orange-700',
    architect:                 'bg-purple-50 text-purple-700',
    electricalContractor:      'bg-green-50 text-green-700',
    electricalEngineer:        'bg-teal-50 text-teal-700',
    interiorDesigner:          'bg-pink-50 text-pink-700',
    clientRep:                 'bg-amber-50 text-amber-700',
    selfPerformingGc:          'bg-red-50 text-red-700',
    developerSelfPerformingGc: 'bg-indigo-50 text-indigo-700',
  };
  return (
    <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${colors[type] || 'bg-slate-100 text-slate-600'}`}>
      {clientTypeLabel(type)}
    </span>
  );
}

// Every Client Type key ticked on a client. orgTypes stores labels, so they get
// translated back to keys; `type` is the fallback for rows saved before the
// multi-select existed.
function clientTypeKeys(client) {
  const fromLabels = parseList(client?.orgTypes)
    .map(clientTypeKeyFromLabel)
    .filter(Boolean);
  if (fromLabels.length) return fromLabels;
  return client?.type ? [client.type] : [];
}

// ── New/Edit Client Modal ─────────────────────────────────────────────────────

function ClientModal({ client, onClose, onSave }) {
  const [form, setForm] = useState({
    name:         client?.name         || '',
    // Client Type is a multi-select now, a builder can be a developer AND a
    // self-performing GC. `type` is still derived from the first tick server-side.
    orgTypes:     parseList(client?.orgTypes),
    locationType: client?.locationType || 'standalone',
    city:         client?.city         || '',
    state:        client?.state        || '',
    notes:        client?.notes        || '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name.trim()) { setErr('Client name is required'); return; }
    setSaving(true);
    setErr('');
    try {
      const url    = client ? `/api/clients/${client.id}` : '/api/clients';
      const method = client ? 'PATCH' : 'POST';
      const res    = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          name:  form.name.trim(),
          city:  form.city.trim() || null,
          state: form.state.trim().toUpperCase() || null,
        }),
      });
      if (!res.ok) { const d = await res.json(); setErr(d.error || 'Save failed'); return; }
      onSave();
    } catch { setErr('Network error'); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className={`${MODAL} w-full max-w-lg overflow-hidden`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-bold text-slate-900">{client ? 'Edit Client' : 'New Client'}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {err && <div className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{err}</div>}

          <div>
            <label className={`block ${LABEL} mb-1`}>
              Client Name <span className="text-red-400">*</span>
            </label>
            <input
              value={form.name}
              onChange={e => set('name', e.target.value)}
              placeholder="Greystar, Ryan Companies, HKS Architects..."
              className={INPUT}
              autoFocus
            />
          </div>

          <MultiSelect
            label="Client Type"
            options={ORG_TYPE_OPTIONS}
            selected={form.orgTypes}
            onChange={orgTypes => set('orgTypes', orgTypes)}
            hint="Tick every one that applies."
          />

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className={`block ${LABEL} mb-1`}>City</label>
              <input
                value={form.city}
                onChange={e => set('city', e.target.value)}
                placeholder="e.g., Denver"
                className={INPUT}
              />
            </div>
            <div>
              <label className={`block ${LABEL} mb-1`}>State</label>
              <input
                value={form.state}
                onChange={e => set('state', e.target.value)}
                placeholder="CO"
                maxLength={2}
                className={`${INPUT} uppercase`}
              />
            </div>
          </div>

          <div>
            <label className={`block ${LABEL} mb-1`}>Location Type</label>
            <select
              value={form.locationType}
              onChange={e => set('locationType', e.target.value)}
              className={INPUT}
            >
              {LOCATION_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>

          <div>
            <label className={`block ${LABEL} mb-1`}>Notes</label>
            <textarea
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
              rows={2}
              placeholder="Internal notes about this client..."
              className={`${INPUT} resize-none`}
            />
          </div>

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className={`${BTN_SECONDARY} flex-1`}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className={`${BTN_PRIMARY} flex-1`}
            >
              {saving ? 'Saving...' : client ? 'Save Changes' : 'Create Client'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ClientsClient({ clients: initial, user }) {
  const router = useRouter();
  const [clients, setClients] = useState(initial);
  const [modal,   setModal]   = useState(null); // null | 'new' | clientObject
  const [deletingId, setDeletingId] = useState(null);      // the one being archived
  const [archiveTarget, setArchiveTarget] = useState(null); // { id, name } waiting on "Archive it"
  const [filtersOpen, setFiltersOpen] = useState(false);
  // Filters, search and sort live in the address so a reload keeps them.
  const { filters, setFilter, clearFilters, sort, setSort } = useUrlView({ fields: VIEW_FIELDS, sortDefault: { key: '', dir: 'asc' } });
  const search    = filters.q || '';
  const tagFilter = filters.tag || '';   // '' = every client
  const filterCount = countFilters(filters, FILTER_FIELDS);

  // Every tag actually in use, for the filter panel.
  const tagsInUse = [];
  for (const c of clients) {
    for (const link of c.tagLinks || []) {
      if (link.tag && !tagsInUse.some(t => t.id === link.tag.id)) tagsInUse.push(link.tag);
    }
  }
  tagsInUse.sort((a, b) => a.name.localeCompare(b.name));

  // Refresh list after save/delete
  async function refresh() {
    const res  = await fetch('/api/clients');
    const data = await res.json();
    setClients(data.clients || []);
    setModal(null);
    router.refresh();
  }

  // Companies are archived, never deleted (Mike, 2026-09-11). Its projects,
  // people and notes stay linked to it; the Archive page puts it back.
  async function archiveClient() {
    const target = archiveTarget;
    if (!target) return;
    setDeletingId(target.id);
    try {
      const res = await fetch(`/api/clients/${target.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived: true }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || 'Could not archive that company.');
        return;
      }
      setArchiveTarget(null);
      await refresh();
    } finally {
      setDeletingId(null);
    }
  }

  const filtered = clients.filter(c => {
    if (tagFilter && !(c.tagLinks || []).some(l => l.tagId === tagFilter)) return false;
    const q = search.toLowerCase();
    if (!q) return true;
    return c.name.toLowerCase().includes(q) ||
      (c.type         || '').toLowerCase().includes(q) ||
      (c.locationType || '').toLowerCase().includes(q) ||
      (c.city         || '').toLowerCase().includes(q) ||
      (c.state        || '').toLowerCase().includes(q) ||
      parseList(c.orgTypes).some(t => String(t).toLowerCase().includes(q)) ||
      (c.notes        || '').toLowerCase().includes(q);
  });
  const shown = sortRows(filtered, sort, SORT_GETTERS);

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className={H1}>Clients</h1>
          <p className="text-slate-500 text-sm mt-1">
            Developers, GCs, Architects, ECs, everyone you work with
          </p>
        </div>
        <button
          onClick={() => setModal('new')}
          className={BTN_PRIMARY}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          New Client
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total Clients', value: clients.length },
          { label: 'Developers',    value: clients.filter(c => clientTypeKeys(c).includes('developer')).length },
          { label: 'People',        value: clients.reduce((s, c) => s + (c._count?.contacts || 0), 0) },
          { label: 'Open Projects',    value: clients.reduce((s, c) => s + clientDealCounts(c.projects).open, 0) },
        ].map(s => (
          <StatTile key={s.label} label={s.label} value={s.value} />
        ))}
      </div>

      {/* Filter, search and sort. Tag filter only shows once at least one client is tagged. */}
      <div className="mb-4">
        <FilterToolbar
          count={filterCount}
          open={filtersOpen}
          onToggle={() => setFiltersOpen(o => !o)}
          onClear={clearFilters}
          shown={shown.length}
          total={clients.length}
          noun="clients"
          right={
            <>
              <SortSelect fields={SORT_FIELDS} sort={sort} onChange={setSort} />
              <SearchBox value={search} onChange={v => setFilter('q', v)} placeholder="Search by name, type, city..." />
            </>
          }
        />
        <FilterPanel
          open={filtersOpen}
          fields={tagsInUse.length > 0 ? FILTER_FIELDS : []}
          filters={filters}
          choices={{ tag: tagsInUse.map(t => [t.id, t.name]) }}
          onChange={setFilter}
        />
      </div>

      {/* Clients grid / empty state */}
      {shown.length === 0 ? (
        <div className={`${CARD_PADDED} p-16 text-center`}>
          <div className="w-14 h-14 rounded-full bg-orange-50 flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
            </svg>
          </div>
          <h3 className="text-slate-700 font-semibold mb-2">
            {clients.length === 0 ? 'No clients yet' : 'No clients match your search'}
          </h3>
          <p className="text-slate-500 text-sm mb-6">
            {clients.length === 0 ? 'Add your first client to start linking projects.' : 'Try a different search term.'}
          </p>
          {clients.length === 0 && (
            <button
              onClick={() => setModal('new')}
              className={BTN_PRIMARY}
            >
              Add First Client
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {shown.map(client => (
            <div key={client.id} className={`${CARD_PADDED} hover:border-slate-300 transition-colors group`}>
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1 min-w-0">
                  <Link
                    href={`/clients/${client.id}`}
                    className="font-semibold text-slate-900 hover:text-orange-600 transition-colors leading-snug block truncate"
                  >
                    {client.name}
                  </Link>
                  {(client.city || client.state || (client.locationType && client.locationType !== 'none')) && (
                    <div className={`${HELPER} mt-0.5`}>
                      {[
                        [client.city, client.state].filter(Boolean).join(', '),
                        client.locationType && client.locationType !== 'none'
                          ? locationTypeLabel(client.locationType) : '',
                      ].filter(Boolean).join(' · ')}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1 ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => setModal(client)}
                    title="Edit"
                    className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => setArchiveTarget({ id: client.id, name: client.name })}
                    disabled={deletingId === client.id}
                    title="Archive"
                    className={`p-1.5 rounded-lg transition-colors ${
                      deletingId === client.id
                        ? 'text-slate-300 cursor-not-allowed opacity-50'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {deletingId === client.id ? (
                      <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" fill="none" />
                        <path fill="currentColor" d="M4 12a8 8 0 018-8v.033a7.967 7.967 0 00-7.968 7.968A7.967 7.967 0 0012 20a7.967 7.967 0 007.968-7.968" />
                      </svg>
                    ) : (
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              {clientTypeKeys(client).length > 0 && (
                <div className="mb-3 flex flex-wrap gap-1">
                  {clientTypeKeys(client).map(key => <ClientTypeTag key={key} type={key} />)}
                </div>
              )}

              {(client.tagLinks || []).length > 0 && (
                <div className="mb-3 flex flex-wrap gap-1">
                  {client.tagLinks.map(link => (
                    <span key={link.id || link.tagId}
                      className="inline-block text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                      {link.tag?.name}
                    </span>
                  ))}
                </div>
              )}

              {/* Deal counts, worked out live from this client's projects
                  never a stored number that can drift. One project is one deal,
                  even when it rides both pipelines. */}
              {(() => {
                const counts = clientDealCounts(client.projects);
                return (
                  <div className="grid grid-cols-4 gap-1 text-center">
                    {[
                      ['Open',      counts.open,      'text-slate-900'],
                      ['Won',       counts.won,       'text-green-600'],
                      ['Lost',      counts.lost,      'text-red-600'],
                      ['Abandoned', counts.abandoned, 'text-amber-600'],
                    ].map(([label, value, tone]) => (
                      <div key={label} className="rounded-lg bg-slate-50 py-1.5">
                        <div className={`text-sm font-bold tabular-nums ${tone}`}>{value}</div>
                        <div className={LABEL}>{label}</div>
                      </div>
                    ))}
                  </div>
                );
              })()}

              {client.notes && (
                <p className={`${HELPER} mt-2 line-clamp-2`}>{client.notes}</p>
              )}

              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                <span className={`${HELPER} ${NUM}`}>
                  {client._count?.projects || 0} {client._count?.projects === 1 ? 'project' : 'projects'}
                  {' · '}
                  {client._count?.contacts || 0} {client._count?.contacts === 1 ? 'person' : 'people'}
                </span>
                <Link
                  href={`/clients/${client.id}`}
                  className="text-xs font-semibold text-orange-600 hover:text-orange-700 transition-colors"
                >
                  View →
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-8 text-center">
        <Link href="/archive" className="text-xs text-slate-500 hover:text-slate-700 transition-colors">
          Archived companies, projects, people and notes →
        </Link>
      </div>

      <ConfirmArchiveModal
        open={!!archiveTarget}
        title="Archive this company?"
        what={archiveTarget?.name}
        body="It disappears from the client list, every picker and the dashboards. Nothing is deleted: its projects, people and notes stay exactly as they are and stay linked to it. You can restore it from the Archive page at any time."
        busy={!!deletingId}
        onCancel={() => setArchiveTarget(null)}
        onConfirm={archiveClient}
      />

      {/* Modal */}
      {modal && (
        <ClientModal
          client={modal === 'new' ? null : modal}
          onClose={() => setModal(null)}
          onSave={refresh}
        />
      )}
    </div>
  );
}
