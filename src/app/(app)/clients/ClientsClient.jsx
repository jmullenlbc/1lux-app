'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

import { CLIENT_TYPES, LOCATION_TYPES, clientTypeLabel, locationTypeLabel } from '@/lib/utils';

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

// ── New/Edit Client Modal ─────────────────────────────────────────────────────

function ClientModal({ client, onClose, onSave }) {
  const [form, setForm] = useState({
    name:         client?.name         || '',
    type:         client?.type         || 'developer',
    locationType: client?.locationType || 'standalone',
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
        body: JSON.stringify(form),
      });
      if (!res.ok) { const d = await res.json(); setErr(d.error || 'Save failed'); return; }
      onSave();
    } catch { setErr('Network error'); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
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
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
              Client Name <span className="text-red-400">*</span>
            </label>
            <input
              value={form.name}
              onChange={e => set('name', e.target.value)}
              placeholder="Greystar, Ryan Companies, HKS Architects…"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Organization Type</label>
            <select
              value={form.type}
              onChange={e => set('type', e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
            >
              {CLIENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Location Type</label>
            <select
              value={form.locationType}
              onChange={e => set('locationType', e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
            >
              {LOCATION_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Notes</label>
            <textarea
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
              rows={2}
              placeholder="Internal notes about this client…"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none"
            />
          </div>

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 rounded-lg text-sm font-medium border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-4 py-2 rounded-lg text-sm font-semibold bg-amber-500 hover:bg-amber-400 text-white transition-colors disabled:opacity-60"
            >
              {saving ? 'Saving…' : client ? 'Save Changes' : 'Create Client'}
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
  const [search,  setSearch]  = useState('');
  const [modal,   setModal]   = useState(null); // null | 'new' | clientObject
  const [deletingId, setDeletingId] = useState(null);

  // Refresh list after save/delete
  async function refresh() {
    const res  = await fetch('/api/clients');
    const data = await res.json();
    setClients(data.clients || []);
    setModal(null);
    router.refresh();
  }

  async function deleteClient(id, name) {
    if (!confirm(`Delete "${name}"? Their projects will be unlinked but not deleted.`)) return;
    setDeletingId(id);
    try {
      await fetch(`/api/clients/${id}`, { method: 'DELETE' });
      await refresh();
    } finally {
      setDeletingId(null);
    }
  }

  const filtered = clients.filter(c => {
    const q = search.toLowerCase();
    return !q ||
      c.name.toLowerCase().includes(q) ||
      (c.type         || '').toLowerCase().includes(q) ||
      (c.locationType || '').toLowerCase().includes(q) ||
      (c.notes        || '').toLowerCase().includes(q);
  });

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Clients</h1>
          <p className="text-slate-500 text-sm mt-1">
            Developers, GCs, Architects, ECs — everyone you work with
          </p>
        </div>
        <button
          onClick={() => setModal('new')}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-amber-500 hover:bg-amber-400 text-white transition-colors"
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
          { label: 'Total Clients',   value: clients.length },
          { label: 'Developers',      value: clients.filter(c => c.type === 'developer').length },
          { label: 'Architects',      value: clients.filter(c => c.type === 'architect').length },
          { label: 'Linked Projects', value: clients.reduce((s, c) => s + (c._count?.projects || 0), 0) },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="text-2xl font-bold text-slate-900">{s.value}</div>
            <div className="text-sm font-medium text-slate-700 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="flex gap-3 mb-4">
        <input
          type="text"
          placeholder="Search by name, type, city…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500 w-72"
        />
        {search && (
          <button onClick={() => setSearch('')} className="px-3 py-2 text-sm text-slate-400 hover:text-slate-600">
            Clear
          </button>
        )}
      </div>

      {/* Clients grid / empty state */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-16 text-center">
          <div className="w-14 h-14 rounded-full bg-amber-50 flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
            </svg>
          </div>
          <h3 className="text-slate-700 font-semibold mb-2">
            {clients.length === 0 ? 'No clients yet' : 'No clients match your search'}
          </h3>
          <p className="text-slate-400 text-sm mb-6">
            {clients.length === 0 ? 'Add your first client to start linking projects.' : 'Try a different search term.'}
          </p>
          {clients.length === 0 && (
            <button
              onClick={() => setModal('new')}
              className="px-4 py-2 rounded-lg text-sm font-semibold bg-amber-500 hover:bg-amber-400 text-white transition-colors"
            >
              Add First Client
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(client => (
            <div key={client.id} className="bg-white rounded-xl border border-slate-200 p-5 hover:border-slate-300 transition-colors group">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1 min-w-0">
                  <Link
                    href={`/clients/${client.id}`}
                    className="font-semibold text-slate-900 hover:text-amber-600 transition-colors leading-snug block truncate"
                  >
                    {client.name}
                  </Link>
                  {client.locationType && client.locationType !== 'none' && (
                    <div className="text-xs text-slate-400 mt-0.5">
                      {locationTypeLabel(client.locationType)}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1 ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => setModal(client)}
                    title="Edit"
                    className="p-1.5 rounded-lg text-slate-400 hover:text-amber-500 hover:bg-amber-50 transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => deleteClient(client.id, client.name)}
                    disabled={deletingId === client.id}
                    title="Delete"
                    className={`p-1.5 rounded-lg transition-colors ${
                      deletingId === client.id
                        ? 'text-slate-300 cursor-not-allowed opacity-50'
                        : 'text-slate-400 hover:text-red-500 hover:bg-red-50'
                    }`}
                  >
                    {deletingId === client.id ? (
                      <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" fill="none" />
                        <path fill="currentColor" d="M4 12a8 8 0 018-8v.033a7.967 7.967 0 00-7.968 7.968A7.967 7.967 0 0012 20a7.967 7.967 0 007.968-7.968" />
                      </svg>
                    ) : (
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              {client.type && (
                <div className="mb-3">
                  <ClientTypeTag type={client.type} />
                </div>
              )}

              {client.notes && (
                <p className="text-xs text-slate-400 mt-2 line-clamp-2">{client.notes}</p>
              )}

              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                <span className="text-xs text-slate-400">
                  {client._count?.projects || 0} {client._count?.projects === 1 ? 'project' : 'projects'}
                </span>
                <Link
                  href={`/clients/${client.id}`}
                  className="text-xs font-medium text-amber-600 hover:text-amber-500 transition-colors"
                >
                  View →
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

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
