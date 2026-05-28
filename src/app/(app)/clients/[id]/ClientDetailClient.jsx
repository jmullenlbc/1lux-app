'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { buildingTypeLabel } from '@/lib/utils';
import { STANDARDS_SECTIONS, SECTION_COLOR_MAP, TOTAL_SUBSECTIONS, CCT_OPTIONS, CCT_EXTERIOR_OPTIONS, CCT_INTERIOR_AREAS } from '@/lib/standardsSections';
import PlaybookTab from './PlaybookTab';

// ── Constants ─────────────────────────────────────────────────────────────────

const ORG_TYPES = [
  'Developer', 'Architect', 'Interior Designer', 'General Contractor',
  'Electrical Engineer', 'Electrical Contractor', 'Client Rep', 'Self-Performing GC',
];

const DEVELOPER_TYPES = [
  { value: 'merchant',      label: 'Merchant Builder' },
  { value: 'longTermHold',  label: 'Long Term Hold' },
];

const MARKETS = [
  'Multi-family apartments', 'Multi-family condos', 'Senior living', 'Student housing',
  'Single family for rent (SFR/BTR)', 'Single family for sale', 'Hotel', 'Data Center',
  'Industrial', 'Core + Shell Office', 'Tenant Improvement', 'Resort',
  'Hospital', 'Medical Office Bldg (MOB)', 'Higher-ed',
];

const LOCATION_TYPES = [
  { value: 'standalone',   label: 'Standalone' },
  { value: 'localBranch',  label: 'Local Branch' },
  { value: 'national',     label: 'National' },
];

const TABS = [
  { id: 'overview',   label: 'Overview'       },
  { id: 'people',     label: 'People'         },
  { id: 'playbook',   label: 'Playbook'       },
  { id: 'standards',  label: 'Standards'      },
  { id: 'projects',   label: 'Projects'       },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseJSON(val, fallback = []) {
  if (!val) return fallback;
  try { return JSON.parse(val); } catch { return fallback; }
}

function tierColor(t) {
  return { '1': 'bg-amber-100 text-amber-700', '2': 'bg-blue-100 text-blue-700', '3': 'bg-slate-100 text-slate-500' }[t] || '';
}

function orgTypeColor(t) {
  const m = {
    'Developer':            'bg-blue-50 text-blue-700',
    'Architect':            'bg-purple-50 text-purple-700',
    'Interior Designer':    'bg-pink-50 text-pink-700',
    'General Contractor':   'bg-orange-50 text-orange-700',
    'Electrical Engineer':  'bg-teal-50 text-teal-700',
    'Electrical Contractor':'bg-green-50 text-green-700',
    'Client Rep':           'bg-amber-50 text-amber-700',
    'Self-Performing GC':   'bg-indigo-50 text-indigo-700',
  };
  return m[t] || 'bg-slate-100 text-slate-600';
}

// ── Spinner ───────────────────────────────────────────────────────────────────
function Spinner({ className = 'w-4 h-4' }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
    </svg>
  );
}

// ── Multi-select chips ────────────────────────────────────────────────────────
function MultiSelect({ options, selected, onChange, label, className = '' }) {
  return (
    <div className={className}>
      {label && <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">{label}</div>}
      <div className="flex flex-wrap gap-1.5">
        {options.map(o => {
          const val  = typeof o === 'string' ? o : o.value;
          const lbl  = typeof o === 'string' ? o : o.label;
          const active = selected.includes(val);
          return (
            <button key={val} type="button"
              onClick={() => onChange(active ? selected.filter(s => s !== val) : [...selected, val])}
              className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                active ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'
              }`}>
              {lbl}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Edit Client Modal ─────────────────────────────────────────────────────────
function EditModal({ client, onClose, onSave }) {
  const [form, setForm] = useState({
    name:                client.name                || '',
    email:               client.email               || '',
    phone:               client.phone               || '',
    website:             client.website             || '',
    linkedIn:            client.linkedIn            || '',
    city:                client.city                || '',
    state:               client.state               || '',
    locationType:        client.locationType        || '',
    tier:                client.tier                || '',
    developerType:       client.developerType       || '',
    orgTypes:            parseJSON(client.orgTypes),
    markets:             parseJSON(client.markets),
    notes:               client.notes               || '',
    ownerId:             client.ownerId              || '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr]       = useState('');
  const [users, setUsers]   = useState([]);

  useEffect(() => {
    fetch('/api/users').then(r => r.json()).then(d => setUsers(d.users || [])).catch(() => {});
  }, []);

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  function Inp({ label, field, type = 'text', placeholder }) {
    return (
      <div>
        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">{label}</label>
        <input type={type} value={form[field]} onChange={e => set(field, e.target.value)} placeholder={placeholder}
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" />
      </div>
    );
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name.trim()) { setErr('Client name is required'); return; }
    setSaving(true); setErr('');
    try {
      const res = await fetch(`/api/clients/${client.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          type: form.orgTypes[0] || client.type,
          orgTypes: form.orgTypes,
          markets: form.markets,
          ownerId: form.ownerId || null,
        }),
      });
      if (!res.ok) { const d = await res.json(); setErr(d.error || 'Save failed'); return; }
      onSave();
    } catch { setErr('Network error'); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <h2 className="text-base font-bold text-slate-900">Edit Client</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-6 overflow-y-auto">
          {err && <div className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{err}</div>}

          <section>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Company</p>
            <div className="space-y-3">
              <Inp label="Client Name *" field="name" />
              <div className="grid grid-cols-2 gap-3">
                <Inp label="City" field="city" />
                <Inp label="State" field="state" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Location Type</label>
                <select value={form.locationType} onChange={e => set('locationType', e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-500">
                  <option value="">Select…</option>
                  {LOCATION_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Tier</label>
                <div className="flex gap-2">
                  {['1', '2', '3'].map(t => (
                    <button key={t} type="button" onClick={() => set('tier', form.tier === t ? '' : t)}
                      className={`px-4 py-1.5 rounded-lg text-sm font-semibold border transition-colors ${
                        form.tier === t ? 'bg-slate-800 text-white border-slate-800' : 'border-slate-200 text-slate-500 hover:border-slate-400'
                      }`}>Tier {t}</button>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section className="border-t border-slate-100 pt-5">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Account Owner</p>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Assigned Salesperson</label>
              <select value={form.ownerId} onChange={e => set('ownerId', e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-500">
                <option value="">— Unassigned —</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.name || u.email}</option>)}
              </select>
            </div>
          </section>

          <section className="border-t border-slate-100 pt-5">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Organization Type</p>
            <MultiSelect options={ORG_TYPES} selected={form.orgTypes} onChange={v => set('orgTypes', v)} />
          </section>

          <section className="border-t border-slate-100 pt-5">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Developer Details</p>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Developer Type</label>
              <div className="flex gap-2">
                {DEVELOPER_TYPES.map(t => (
                  <button key={t.value} type="button" onClick={() => set('developerType', form.developerType === t.value ? '' : t.value)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                      form.developerType === t.value ? 'bg-slate-800 text-white border-slate-800' : 'border-slate-200 text-slate-500 hover:border-slate-400'
                    }`}>{t.label}</button>
                ))}
              </div>
            </div>
          </section>

          <section className="border-t border-slate-100 pt-5">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Markets</p>
            <MultiSelect options={MARKETS} selected={form.markets} onChange={v => set('markets', v)} />
          </section>

          <section className="border-t border-slate-100 pt-5">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Contact Info</p>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Inp label="Email" field="email" type="email" />
                <Inp label="Phone" field="phone" type="tel" />
              </div>
              <Inp label="Website" field="website" type="url" placeholder="https://…" />
              <Inp label="LinkedIn" field="linkedIn" type="url" placeholder="https://linkedin.com/company/…" />
            </div>
          </section>

          <section className="border-t border-slate-100 pt-5">
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Notes</label>
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={3}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none" />
          </section>

          <div className="flex gap-2 pt-1 border-t border-slate-100">
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2 rounded-lg text-sm font-medium border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 px-4 py-2 rounded-lg text-sm font-semibold bg-amber-500 hover:bg-amber-400 text-white transition-colors disabled:opacity-60">
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Link Projects Modal ───────────────────────────────────────────────────────
function LinkProjectsModal({ clientId, available, onClose, onSave }) {
  const [selected, setSelected] = useState([]);
  const [saving, setSaving] = useState(false);

  function toggle(id) { setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]); }

  async function handleLink() {
    if (selected.length === 0) return;
    setSaving(true);
    await Promise.all(selected.map(projectId =>
      fetch(`/api/projects/${projectId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId }),
      })
    ));
    setSaving(false); onSave();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-bold text-slate-900">Link Projects</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="p-6">
          {available.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-4">All projects are already linked to a client.</p>
          ) : (
            <>
              <p className="text-sm text-slate-500 mb-4">Select projects to link to this client:</p>
              <div className="space-y-1 max-h-64 overflow-y-auto mb-4">
                {available.map(p => (
                  <label key={p.id} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-50 cursor-pointer">
                    <input type="checkbox" checked={selected.includes(p.id)} onChange={() => toggle(p.id)}
                      className="rounded border-slate-300 text-amber-500 focus:ring-amber-500" />
                    <div>
                      <div className="text-sm font-medium text-slate-900">
                        {p.projectNumber && <span className="text-xs font-mono text-slate-400 mr-1.5">PRJ-{String(p.projectNumber).padStart(4, '0')}</span>}
                        {p.name}
                      </div>
                      {p.location && <div className="text-xs text-slate-400">{p.location}</div>}
                    </div>
                  </label>
                ))}
              </div>
              <div className="flex gap-2">
                <button onClick={onClose} className="flex-1 px-4 py-2 rounded-lg text-sm font-medium border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">Cancel</button>
                <button onClick={handleLink} disabled={saving || selected.length === 0}
                  className="flex-1 px-4 py-2 rounded-lg text-sm font-semibold bg-amber-500 hover:bg-amber-400 text-white transition-colors disabled:opacity-60">
                  {saving ? 'Linking…' : `Link ${selected.length > 0 ? selected.length : ''} Project${selected.length !== 1 ? 's' : ''}`}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── KB Attachment Card ────────────────────────────────────────────────────────
// ── Overview Tab ──────────────────────────────────────────────────────────────
function OverviewTab({ client, onEditClick }) {
  const orgTypes   = parseJSON(client.orgTypes);
  const markets    = parseJSON(client.markets);
  const devType    = DEVELOPER_TYPES.find(d => d.value === client.developerType)?.label;
  const locType    = LOCATION_TYPES.find(l => l.value === client.locationType)?.label;
  const location   = [client.city, client.state].filter(Boolean).join(', ');

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Left: identity card */}
      <div className="space-y-4">
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-start justify-between mb-4">
            <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
              <span className="text-xl font-bold text-amber-600">{client.name[0].toUpperCase()}</span>
            </div>
            <button onClick={onEditClick}
              className="p-1.5 rounded-lg text-slate-400 hover:text-amber-500 hover:bg-amber-50 transition-colors" title="Edit client">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
              </svg>
            </button>
          </div>

          {/* Tier + org types */}
          <div className="flex flex-wrap items-center gap-1.5 mb-3">
            {client.tier && (
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${tierColor(client.tier)}`}>
                Tier {client.tier}
              </span>
            )}
            {orgTypes.map(t => (
              <span key={t} className={`text-xs font-medium px-2 py-0.5 rounded-full ${orgTypeColor(t)}`}>{t}</span>
            ))}
            {orgTypes.length === 0 && client.type && (
              <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${orgTypeColor(client.type)}`}>{client.type}</span>
            )}
          </div>

          <h1 className="text-lg font-bold text-slate-900 mb-1 leading-tight">{client.name}</h1>

          {(location || locType) && (
            <p className="text-sm text-slate-500 mb-3">
              {location}{location && locType ? ' · ' : ''}{locType}
            </p>
          )}

          {devType && (
            <div className="text-xs text-slate-400 mb-3">
              <span className="font-semibold text-slate-500">Developer type: </span>{devType}
            </div>
          )}

          {/* Contact info */}
          <div className="space-y-2 mt-3">
            {client.email && (
              <div className="flex items-center gap-2 text-sm">
                <svg className="w-4 h-4 shrink-0 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                </svg>
                <a href={`mailto:${client.email}`} className="text-amber-600 hover:text-amber-500 truncate">{client.email}</a>
              </div>
            )}
            {client.phone && (
              <div className="flex items-center gap-2 text-sm">
                <svg className="w-4 h-4 shrink-0 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
                </svg>
                <span className="text-slate-600">{client.phone}</span>
              </div>
            )}
            {client.website && (
              <div className="flex items-center gap-2 text-sm">
                <svg className="w-4 h-4 shrink-0 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253" />
                </svg>
                <a href={client.website} target="_blank" rel="noopener noreferrer" className="text-amber-600 hover:text-amber-500 truncate">
                  {client.website.replace(/^https?:\/\//, '')}
                </a>
              </div>
            )}
            {client.linkedIn && (
              <div className="flex items-center gap-2 text-sm">
                <svg className="w-4 h-4 shrink-0 text-slate-300" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/>
                </svg>
                <a href={client.linkedIn} target="_blank" rel="noopener noreferrer" className="text-amber-600 hover:text-amber-500">LinkedIn</a>
              </div>
            )}
          </div>

          {client.notes && (
            <div className="mt-4 pt-4 border-t border-slate-100">
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Notes</div>
              <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-line">{client.notes}</p>
            </div>
          )}

          <div className="mt-4 pt-4 border-t border-slate-100 text-xs text-slate-400">
            Added by {client.createdBy?.name || client.createdBy?.email}
          </div>
        </div>
      </div>

      {/* Right: markets + quick stats */}
      <div className="lg:col-span-2 space-y-4">
        {/* Markets */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-800">Markets</h3>
            <button onClick={onEditClick} className="text-xs text-amber-600 hover:text-amber-500 transition-colors">Edit</button>
          </div>
          {markets.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {markets.map(m => (
                <span key={m} className="px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100">{m}</span>
              ))}
            </div>
          ) : (
            <button onClick={onEditClick} className="text-sm text-slate-400 hover:text-amber-600 transition-colors">
              + Add markets this client builds in
            </button>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white rounded-xl border border-slate-200 px-4 py-4 text-center">
            <div className="text-2xl font-bold text-slate-800">{client.projects?.length || 0}</div>
            <div className="text-xs text-slate-400 mt-0.5 font-medium">Linked Projects</div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 px-4 py-4 text-center">
            <div className="text-2xl font-bold text-slate-800">{client.contacts?.length || 0}</div>
            <div className="text-xs text-slate-400 mt-0.5 font-medium">Contacts</div>
          </div>
        </div>

        {/* Client number */}
        {client.clientNumber && (
          <div className="bg-white rounded-xl border border-slate-200 px-4 py-3 flex items-center justify-between">
            <span className="text-xs text-slate-400 font-semibold uppercase tracking-wide">Client ID</span>
            <span className="font-mono text-sm font-semibold text-slate-600">
              CLT-{String(client.clientNumber).padStart(4, '0')}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── People Tab ────────────────────────────────────────────────────────────────
function PeopleTab({ contacts: initial, clientId }) {
  const [contacts,  setContacts]  = useState(initial);
  const [addForm,   setAddForm]   = useState(null); // null | {}
  const [editId,    setEditId]    = useState(null);
  const [editForm,  setEditForm]  = useState({});
  const [saving,    setSaving]    = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  async function addContact() {
    if (!addForm?.name?.trim()) return;
    setSaving(true);
    const res = await fetch(`/api/clients/${clientId}/contacts`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(addForm),
    });
    const { contact } = await res.json();
    setContacts(c => [...c, contact]);
    setAddForm(null);
    setSaving(false);
  }

  async function saveEdit(id) {
    setSaving(true);
    const res = await fetch(`/api/clients/${clientId}/contacts/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editForm),
    });
    const { contact } = await res.json();
    setContacts(c => c.map(x => x.id === id ? contact : x));
    setEditId(null);
    setSaving(false);
  }

  async function deleteContact(id, name) {
    if (!confirm(`Remove "${name}" from contacts?`)) return;
    setDeletingId(id);
    await fetch(`/api/clients/${clientId}/contacts/${id}`, { method: 'DELETE' });
    setContacts(c => c.filter(x => x.id !== id));
    setDeletingId(null);
  }

  const inputCls = 'w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-amber-400';

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <h2 className="font-semibold text-slate-900">Contacts
          <span className="ml-2 text-sm font-normal text-slate-400">({contacts.length})</span>
        </h2>
        {addForm === null && (
          <button onClick={() => setAddForm({ name: '', title: '', email: '', phone: '' })}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
            Add Contact
          </button>
        )}
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              <th className="px-5 py-2.5 text-left">Name</th>
              <th className="px-4 py-2.5 text-left">Title</th>
              <th className="px-4 py-2.5 text-left">Email</th>
              <th className="px-4 py-2.5 text-left">Phone</th>
              <th className="w-16"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {contacts.map(c => (
              <tr key={c.id} className="group hover:bg-slate-50/50 transition-colors">
                {editId === c.id ? (
                  <>
                    <td className="px-5 py-2"><input value={editForm.name || ''} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} className={inputCls} /></td>
                    <td className="px-4 py-2"><input value={editForm.title || ''} onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))} className={inputCls} /></td>
                    <td className="px-4 py-2"><input value={editForm.email || ''} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} className={inputCls} /></td>
                    <td className="px-4 py-2"><input value={editForm.phone || ''} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} className={inputCls} /></td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-1">
                        <button onClick={() => saveEdit(c.id)} disabled={saving}
                          className="px-2 py-1 text-xs font-semibold bg-amber-500 text-white rounded hover:bg-amber-400 transition-colors">
                          {saving ? '…' : 'Save'}
                        </button>
                        <button onClick={() => setEditId(null)} className="px-2 py-1 text-xs text-slate-500 rounded hover:bg-slate-100 transition-colors">×</button>
                      </div>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="px-5 py-3 font-medium text-slate-800">{c.name}</td>
                    <td className="px-4 py-3 text-slate-500">{c.title || <span className="text-slate-300">—</span>}</td>
                    <td className="px-4 py-3">
                      {c.email ? <a href={`mailto:${c.email}`} className="text-amber-600 hover:text-amber-500">{c.email}</a> : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-500">{c.phone || <span className="text-slate-300">—</span>}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => { setEditId(c.id); setEditForm({ name: c.name, title: c.title || '', email: c.email || '', phone: c.phone || '' }); }}
                          className="p-1 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors" title="Edit">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                        </button>
                        <button onClick={() => deleteContact(c.id, c.name)} disabled={deletingId === c.id}
                          className="p-1 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors" title="Delete">
                          {deletingId === c.id ? <Spinner className="w-3.5 h-3.5" /> : (
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          )}
                        </button>
                      </div>
                    </td>
                  </>
                )}
              </tr>
            ))}

            {/* Add row */}
            {addForm !== null && (
              <tr className="bg-blue-50/30">
                <td className="px-5 py-2"><input autoFocus value={addForm.name} onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))} placeholder="Full name *" className={inputCls} /></td>
                <td className="px-4 py-2"><input value={addForm.title} onChange={e => setAddForm(f => ({ ...f, title: e.target.value }))} placeholder="Title" className={inputCls} /></td>
                <td className="px-4 py-2"><input value={addForm.email} onChange={e => setAddForm(f => ({ ...f, email: e.target.value }))} placeholder="Email" className={inputCls} /></td>
                <td className="px-4 py-2"><input value={addForm.phone} onChange={e => setAddForm(f => ({ ...f, phone: e.target.value }))} placeholder="Phone" className={inputCls} /></td>
                <td className="px-4 py-2">
                  <div className="flex items-center gap-1">
                    <button onClick={addContact} disabled={saving || !addForm.name?.trim()}
                      className="px-2 py-1 text-xs font-semibold bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 transition-colors">
                      {saving ? '…' : 'Add'}
                    </button>
                    <button onClick={() => setAddForm(null)} className="px-2 py-1 text-xs text-slate-500 rounded hover:bg-slate-100 transition-colors">×</button>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {contacts.length === 0 && addForm === null && (
          <div className="px-5 py-12 text-center">
            <p className="text-slate-400 text-sm mb-3">No contacts yet.</p>
            <button onClick={() => setAddForm({ name: '', title: '', email: '', phone: '' })}
              className="text-sm font-medium text-amber-600 hover:text-amber-500 transition-colors">
              + Add first contact
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Projects Tab ──────────────────────────────────────────────────────────────
function ProjectsTab({ client, available, onRefresh }) {
  const [linking, setLinking] = useState(false);

  async function unlinkProject(projectId, projectName) {
    if (!confirm(`Unlink "${projectName}" from this client?`)) return;
    await fetch(`/api/projects/${projectId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId: null }),
    });
    onRefresh();
  }

  return (
    <>
      <div className="bg-white rounded-xl border border-slate-200">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-900">
            Projects <span className="ml-2 text-sm font-normal text-slate-400">({client.projects?.length || 0})</span>
          </h2>
          <button onClick={() => setLinking(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
            </svg>
            Link Project
          </button>
        </div>
        {!client.projects?.length ? (
          <div className="px-6 py-12 text-center">
            <p className="text-slate-400 text-sm">No projects linked yet.</p>
            <button onClick={() => setLinking(true)} className="mt-3 text-sm font-medium text-amber-600 hover:text-amber-500 transition-colors">
              Link a project →
            </button>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {client.projects.map(p => (
              <div key={p.id} className="flex items-center gap-4 px-6 py-4 hover:bg-slate-50 transition-colors group">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {p.projectNumber && (
                      <span className="text-[11px] font-mono font-semibold text-slate-400 shrink-0">
                        PRJ-{String(p.projectNumber).padStart(4, '0')}
                      </span>
                    )}
                    <Link href={`/project/${p.id}`} className="font-medium text-slate-900 hover:text-amber-600 transition-colors truncate">
                      {p.name}
                    </Link>
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    {[[p.city, p.state].filter(Boolean).join(', '), p.serviceType, p.phase?.toUpperCase()].filter(Boolean).join(' · ')}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    p.status === 'COMPLETE' ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-500'
                  }`}>{p.status}</span>
                  <Link href={`/project/${p.id}`}
                    className="opacity-0 group-hover:opacity-100 transition-opacity px-2.5 py-1 rounded-lg text-xs font-medium border border-slate-200 text-slate-600 hover:bg-slate-100">
                    Open
                  </Link>
                  <button onClick={() => unlinkProject(p.id, p.name)} title="Unlink"
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg text-slate-300 hover:text-red-400 hover:bg-red-50 transition-colors">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {linking && (
        <LinkProjectsModal clientId={client.id} available={available}
          onClose={() => setLinking(false)} onSave={() => { setLinking(false); onRefresh(); }} />
      )}
    </>
  );
}

// ── Client Standards Tab ──────────────────────────────────────────────────────
function ClientStandardsTab({ clientId, initialAnswers, canEdit }) {
  const [answers,        setAnswers]        = useState(() => {
    const map = {};
    for (const a of initialAnswers) map[a.question_key] = a;
    return map;
  });
  const [activeSection,  setActiveSection]  = useState(STANDARDS_SECTIONS[0].key);
  const [saving,         setSaving]         = useState({});
  const [drafts,         setDrafts]         = useState({});

  const section = STANDARDS_SECTIONS.find(s => s.key === activeSection);
  const colors  = SECTION_COLOR_MAP[section?.color] || SECTION_COLOR_MAP.slate;

  // Count answered subsections per section
  function answeredCount(sectionKey) {
    const sec = STANDARDS_SECTIONS.find(s => s.key === sectionKey);
    if (!sec) return { answered: 0, total: sec?.subsections.length || 0 };
    const answered = sec.subsections.filter(sub => {
      const key = `${sectionKey}.${sub.key}`;
      const a = answers[key];
      return a && (a.answer_value?.trim() || a.answer_note?.trim());
    }).length;
    return { answered, total: sec.subsections.length };
  }

  const totalAnswered = Object.values(answers).filter(a => a.answer_value?.trim() || a.answer_note?.trim()).length;
  const pct = TOTAL_SUBSECTIONS > 0 ? Math.round((totalAnswered / TOTAL_SUBSECTIONS) * 100) : 0;

  async function saveNote(subsectionKey, note) {
    const question_key = `${activeSection}.${subsectionKey}`;
    setSaving(prev => ({ ...prev, [question_key]: true }));
    try {
      const res = await fetch(`/api/clients/${clientId}/standards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question_key,
          section:    activeSection,
          subsection: subsectionKey,
          input_type: 'TEXT',
          answer_note: note,
        }),
      });
      if (res.ok) {
        const saved = await res.json();
        setAnswers(prev => ({ ...prev, [question_key]: saved }));
      }
    } finally {
      setSaving(prev => ({ ...prev, [question_key]: false }));
      setDrafts(prev => { const n = { ...prev }; delete n[question_key]; return n; });
    }
  }

  async function saveCCT(subsectionKey, value) {
    const question_key = `COLOR_TEMPERATURE.${subsectionKey}`;
    setSaving(prev => ({ ...prev, [question_key]: true }));
    try {
      const res = await fetch(`/api/clients/${clientId}/standards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question_key,
          section:     'COLOR_TEMPERATURE',
          subsection:  subsectionKey,
          input_type:  'DROPDOWN',
          answer_value: value || null,
        }),
      });
      if (res.ok) {
        const saved = await res.json();
        setAnswers(prev => ({ ...prev, [question_key]: saved }));
      }
    } finally {
      setSaving(prev => ({ ...prev, [question_key]: false }));
    }
  }

  // ── CCT section renderer ──────────────────────────────────────────────────
  function CCTSection() {
    const interiorKey = 'COLOR_TEMPERATURE.ALL_INTERIOR';
    const exteriorKey = 'COLOR_TEMPERATURE.EXTERIOR';
    const interiorCCT = answers[interiorKey]?.answer_value || '';
    const exteriorCCT = answers[exteriorKey]?.answer_value || '';

    function effectiveCCT(areaKey) {
      const override = answers[`COLOR_TEMPERATURE.${areaKey}`]?.answer_value;
      return override || interiorCCT || '';
    }

    function isOverride(areaKey) {
      const v = answers[`COLOR_TEMPERATURE.${areaKey}`]?.answer_value;
      return v && v !== interiorCCT;
    }

    function CCTChips({ value, onChange, options = CCT_OPTIONS }) {
      return (
        <div className="flex flex-wrap gap-1.5 mt-1">
          {options.map(cct => (
            <button key={cct} type="button" onClick={() => canEdit && onChange(value === cct ? '' : cct)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                value === cct
                  ? 'bg-amber-500 text-white border-amber-500'
                  : 'bg-white text-slate-500 border-slate-200 hover:border-amber-400 hover:text-amber-600'
              } ${!canEdit ? 'pointer-events-none' : ''}`}>
              {cct}
            </button>
          ))}
          {value && canEdit && (
            <button type="button" onClick={() => onChange('')}
              className="px-2 py-1.5 text-xs text-slate-400 hover:text-slate-600">✕ Clear</button>
          )}
        </div>
      );
    }

    return (
      <div className="space-y-6">
        {/* Primary pickers */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400 shrink-0" />
              <span className="text-sm font-bold text-slate-800">All Interior</span>
              <span className="text-[10px] text-slate-400 ml-auto">Default for all interior areas</span>
            </div>
            <CCTChips value={interiorCCT} onChange={v => saveCCT('ALL_INTERIOR', v)} />
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-400 shrink-0" />
              <span className="text-sm font-bold text-slate-800">Exterior</span>
              <span className="text-[10px] text-slate-400 ml-auto">All exterior areas</span>
            </div>
            <CCTChips value={exteriorCCT} onChange={v => saveCCT('EXTERIOR', v)} options={CCT_EXTERIOR_OPTIONS} />
          </div>
        </div>

        {/* Per-area overrides */}
        <div>
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">
            Area overrides — set only if different from interior default
          </div>
          <div className="grid grid-cols-1 gap-2">
            {CCT_INTERIOR_AREAS.map(area => {
              const current  = effectiveCCT(area.key);
              const override = isOverride(area.key);
              const isSav    = saving[`COLOR_TEMPERATURE.${area.key}`];
              return (
                <div key={area.key} className={`bg-white rounded-lg border px-4 py-3 ${override ? 'border-amber-200' : 'border-slate-100'}`}>
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-semibold text-slate-700 w-44 shrink-0">{area.label}</span>
                    <div className="flex flex-wrap gap-1.5 flex-1">
                      {CCT_OPTIONS.map(cct => (
                        <button key={cct} type="button"
                          onClick={() => canEdit && saveCCT(area.key, answers[`COLOR_TEMPERATURE.${area.key}`]?.answer_value === cct ? '' : cct)}
                          className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                            current === cct && override
                              ? 'bg-amber-500 text-white border-amber-500'
                              : current === cct && !override
                              ? 'bg-slate-100 text-slate-600 border-slate-200'
                              : 'bg-white text-slate-400 border-slate-100 hover:border-amber-300 hover:text-amber-600'
                          } ${!canEdit ? 'pointer-events-none' : ''}`}>
                          {cct}
                        </button>
                      ))}
                      {!override && interiorCCT && (
                        <span className="text-[10px] text-slate-400 self-center ml-1">↑ inherited</span>
                      )}
                      {override && canEdit && (
                        <button type="button" onClick={() => saveCCT(area.key, '')}
                          className="text-[10px] text-slate-400 hover:text-slate-600 self-center ml-1">
                          Clear override
                        </button>
                      )}
                    </div>
                    {isSav && <span className="text-[10px] text-slate-400 italic shrink-0">Saving…</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  if (!canEdit) {
    return (
      <div className="py-16 text-center text-slate-400">
        <div className="text-3xl mb-3">🔒</div>
        <p className="text-sm font-medium text-slate-500">Standards access required</p>
        <p className="text-xs mt-1 text-slate-400">Ask an ILC admin to grant you the Client Standards Editor permission.</p>
      </div>
    );
  }

  return (
    <div className="flex gap-6">
      {/* ── Section sidebar ── */}
      <div className="w-56 shrink-0">
        {/* Overall progress */}
        <div className="mb-4 p-3 rounded-xl bg-white border border-slate-200">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Overall</span>
            <span className="text-xs font-bold text-slate-700">{pct}%</span>
          </div>
          <div className="w-full h-1.5 rounded-full bg-slate-100 overflow-hidden">
            <div className="h-full rounded-full bg-amber-400 transition-all duration-300" style={{ width: `${pct}%` }} />
          </div>
          <p className="text-[10px] text-slate-400 mt-1.5">{totalAnswered} of {TOTAL_SUBSECTIONS} subsections have notes</p>
        </div>

        <nav className="space-y-0.5">
          {STANDARDS_SECTIONS.map(sec => {
            const c = SECTION_COLOR_MAP[sec.color] || SECTION_COLOR_MAP.slate;
            const { answered, total } = answeredCount(sec.key);
            const isActive = activeSection === sec.key;
            return (
              <button key={sec.key} onClick={() => setActiveSection(sec.key)}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-left text-xs font-medium transition-colors ${
                  isActive ? `${c.bg} ${c.text} border ${c.border}` : 'text-slate-600 hover:bg-slate-100'
                }`}>
                <span className="text-sm shrink-0">{sec.icon}</span>
                <span className="flex-1 leading-snug">{sec.label}</span>
                <span className={`shrink-0 text-[10px] font-bold tabular-nums ${answered === total ? 'text-green-600' : 'text-slate-400'}`}>
                  {answered}/{total}
                </span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* ── Subsection cards ── */}
      <div className="flex-1 min-w-0">
        <div className={`flex items-center gap-3 mb-5 px-4 py-3 rounded-xl border ${colors.bg} ${colors.border}`}>
          <span className="text-xl">{section?.icon}</span>
          <div>
            <h2 className={`text-sm font-bold ${colors.text}`}>{section?.label}</h2>
            <p className="text-[11px] text-slate-500">
              {section?.isCCT
                ? 'Set color temperature for each area — all interior inherits the global default'
                : `${section?.subsections.length} subsections · click any note field to edit`}
            </p>
          </div>
        </div>

        {section?.isCCT && <CCTSection />}

        {!section?.isCCT && <div className="grid grid-cols-1 gap-3">
          {section?.subsections.map(sub => {
            const question_key = `${activeSection}.${sub.key}`;
            const existing     = answers[question_key];
            const draftKey     = question_key;
            const isDirty      = draftKey in drafts;
            const isSav        = saving[question_key];
            const hasNote      = existing?.answer_note?.trim();
            const noteVal      = isDirty ? drafts[draftKey] : (existing?.answer_note || '');

            return (
              <div key={sub.key} className={`bg-white rounded-xl border transition-colors ${
                hasNote ? 'border-slate-200' : 'border-dashed border-slate-200'
              }`}>
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    {hasNote
                      ? <span className="w-2 h-2 rounded-full bg-green-400 shrink-0" />
                      : <span className="w-2 h-2 rounded-full bg-slate-200 shrink-0" />
                    }
                    <span className="text-sm font-semibold text-slate-800">{sub.label}</span>
                  </div>
                  {isSav && (
                    <span className="text-[10px] text-slate-400 italic">Saving…</span>
                  )}
                  {!isSav && isDirty && (
                    <button onClick={() => saveNote(sub.key, drafts[draftKey])}
                      className="text-[11px] font-semibold text-blue-600 hover:text-blue-700">
                      Save
                    </button>
                  )}
                  {!isSav && !isDirty && hasNote && (
                    <span className="text-[10px] text-green-600 font-medium">✓ Noted</span>
                  )}
                </div>

                <div className="px-4 py-3">
                  {canEdit ? (
                    <textarea
                      value={noteVal}
                      onChange={e => setDrafts(prev => ({ ...prev, [draftKey]: e.target.value }))}
                      onBlur={() => {
                        if (isDirty) saveNote(sub.key, drafts[draftKey]);
                      }}
                      placeholder="Add notes for this client's standards…"
                      rows={2}
                      className="w-full text-xs text-slate-700 placeholder-slate-300 resize-none focus:outline-none focus:ring-0 bg-transparent leading-relaxed"
                    />
                  ) : (
                    <p className="text-xs text-slate-500 italic">{hasNote || 'No notes yet.'}</p>
                  )}
                  {/* Specific questions placeholder */}
                  <div className="mt-2 pt-2 border-t border-dashed border-slate-100">
                    <span className="text-[10px] text-slate-300 italic">Specific questions coming soon</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function ClientDetailClient({ client: initial, availableProjects, user, canEditStandards = false, initialStandardsAnswers = [], canEditPlaybook = false }) {
  const [client,    setClient]    = useState(initial);
  const [available, setAvailable] = useState(availableProjects);
  const [editing,   setEditing]   = useState(false);
  const [activeTab, setActiveTab] = useState('overview');

  const clientIdLabel = client.clientNumber
    ? `CLT-${String(client.clientNumber).padStart(4, '0')}`
    : null;

  async function refreshClient() {
    const res  = await fetch(`/api/clients/${client.id}`);
    const data = await res.json();
    setClient(data.client);
    setEditing(false);
  }

  return (
    <div className="min-h-screen bg-slate-50">

      {/* ── Top bar ── */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-6">
          {/* Breadcrumb + title */}
          <div className="flex items-center gap-3 py-4 border-b border-slate-100">
            <Link href="/clients" className="text-slate-400 hover:text-slate-600 transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
            </Link>
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <Link href="/clients" className="hover:text-slate-600 transition-colors">Clients</Link>
              <span>/</span>
              <span className="text-slate-800 font-semibold">{client.name}</span>
              {clientIdLabel && (
                <span className="font-mono text-[11px] px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded">{clientIdLabel}</span>
              )}
            </div>
            <div className="ml-auto flex items-center gap-2">
              {client.owner && (
                <span className="flex items-center gap-1.5 text-xs text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">
                  <svg className="w-3 h-3 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                  {client.owner.name || client.owner.email}
                </span>
              )}
              {parseJSON(client.orgTypes).map(t => (
                <span key={t} className={`text-xs font-medium px-2 py-0.5 rounded-full ${orgTypeColor(t)}`}>{t}</span>
              ))}
              {client.tier && (
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${tierColor(client.tier)}`}>Tier {client.tier}</span>
              )}
              <button onClick={() => setEditing(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                Edit
              </button>
            </div>
          </div>

          {/* Tab bar */}
          <div className="flex gap-0">
            {TABS.map(t => (
              <button key={t.id} onClick={() => setActiveTab(t.id)}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === t.id
                    ? 'border-amber-500 text-amber-600'
                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                }`}>
                {t.label}
                {t.id === 'people'    && client.contacts?.length > 0      && <span className="ml-1.5 text-[10px] font-bold text-slate-400">{client.contacts.length}</span>}
                {t.id === 'projects'  && client.projects?.length > 0     && <span className="ml-1.5 text-[10px] font-bold text-slate-400">{client.projects.length}</span>}
                {t.id === 'playbook'  && !canEditPlaybook                 && <span className="ml-1.5 text-[10px] text-slate-300">🔒</span>}
                {t.id === 'standards' && !canEditStandards                && <span className="ml-1.5 text-[10px] text-slate-300">🔒</span>}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Tab content ── */}
      <div className="max-w-6xl mx-auto px-6 py-6">
        {activeTab === 'overview'  && <OverviewTab client={client} onEditClick={() => setEditing(true)} />}
        {activeTab === 'people'    && <PeopleTab contacts={client.contacts || []} clientId={client.id} />}
        {activeTab === 'playbook'  && (
          <PlaybookTab
            clientId={client.id}
            contacts={client.contacts || []}
            canEdit={canEditPlaybook}
          />
        )}
        {activeTab === 'projects'  && (
          <ProjectsTab client={client} available={available} onRefresh={refreshClient} />
        )}
        {activeTab === 'standards' && (
          <ClientStandardsTab
            clientId={client.id}
            initialAnswers={initialStandardsAnswers}
            canEdit={canEditStandards}
          />
        )}
      </div>

      {/* Edit modal */}
      {editing && <EditModal client={client} onClose={() => setEditing(false)} onSave={refreshClient} />}
    </div>
  );
}
