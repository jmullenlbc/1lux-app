'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import ConfirmArchiveModal from '@/components/salesAutomation/ConfirmArchiveModal';
import {
  buildingTypeLabel, ORG_TYPE_OPTIONS, DEVELOPER_TYPES, developerTypeLabel,
  PROJECT_TYPES as CLIENT_PROJECT_TYPES, projectTypeLabel,
} from '@/lib/utils';
import {
  clientDealCounts, projectTypesFromProjects, contactDealCounts, contactDealProjects,
  splitName, joinName, isValidEmail, formatPhone,
} from '@/lib/crmClient';
import { rolesHeldBy } from '@/lib/projectTeam';
import {
  STANDARDS_SECTIONS, SECTION_COLOR_MAP, TAG_COLORS,
  CCT_OPTIONS, CCT_EXTERIOR_OPTIONS, CCT_INTERIOR_AREAS,
  PROJECT_TYPES, resolveAnswer,
} from '@/lib/standards-questions';
import PlaybookTab from './PlaybookTab';
import PipelineTab from './PipelineTab';
import StandardFixtureScheduleTab from './StandardFixtureScheduleTab';
import ProductOptionsTab from './ProductOptionsTab';
import ShareStandardsButton from './ShareStandardsButton';

// ── Constants ─────────────────────────────────────────────────────────────────

// Client Type and Developer Type both live in src/lib/utils.js now, so the
// new-client page, the clients list and this editor can never drift apart.
const ORG_TYPES = ORG_TYPE_OPTIONS;

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

// Seed departments (creatable — clients can add their own, e.g. a GC differs from a developer)
const CONTACT_DEPARTMENTS = ['Development', 'Design', 'Pre-construction', 'Construction', 'Finance'];

const TABS = [
  { id: 'overview',   label: 'Overview'       },
  { id: 'people',     label: 'People'         },
  { id: 'playbook',   label: 'Playbook'       },
  { id: 'standards',  label: 'Standards'      },
  { id: 'productOptions',  label: 'Product Options' },
  { id: 'fixtureSchedule', label: 'Fixture Schedule' },
  { id: 'projects',   label: 'Projects'       },
  { id: 'projectData', label: 'Project Data'  },
  { id: 'pipeline',   label: 'Pipeline'       },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseJSON(val, fallback = []) {
  if (!val) return fallback;
  // A field just changed on screen is already a real list — it has not been
  // round-tripped through the database yet, so don't try to parse it.
  if (Array.isArray(val)) return val;
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

// ── CreatableSelect ───────────────────────────────────────────────────────────
function CreatableSelect({ value, onChange, options, placeholder = 'Select or create…' }) {
  const [open,  setOpen]  = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef(null);

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const selectedLabel = options.find(o => o.value === value)?.label || value;
  const filtered = options.filter(o => o.label.toLowerCase().includes(query.toLowerCase()));
  const canCreate = query.trim() && !options.some(
    o => o.value.toLowerCase() === query.trim().toLowerCase() ||
         o.label.toLowerCase() === query.trim().toLowerCase()
  );

  function select(val) { onChange(val); setOpen(false); setQuery(''); }
  function create()    {
    if (!query.trim()) return;
    onChange(query.trim()); setOpen(false); setQuery('');
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => { setOpen(v => !v); setQuery(''); }}
        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white text-left flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-amber-500"
      >
        <span className={value ? 'text-slate-900' : 'text-slate-400'}>
          {value ? selectedLabel : placeholder}
        </span>
        <svg className="w-4 h-4 text-slate-400 shrink-0" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
      </button>
      {open && (
        <div className="absolute z-50 top-full mt-1 left-0 right-0 rounded-lg shadow-lg border border-slate-200 bg-white overflow-hidden">
          <div className="p-2 border-b border-slate-100">
            <input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (canCreate) create();
                  else if (filtered[0]) select(filtered[0].value);
                }
                if (e.key === 'Escape') setOpen(false);
              }}
              placeholder="Search or type to create…"
              className="w-full text-sm rounded px-2 py-1.5 bg-slate-50 border border-slate-200 outline-none focus:border-amber-500"
            />
          </div>
          <div className="max-h-48 overflow-y-auto">
            {filtered.map(o => (
              <button
                key={o.value}
                type="button"
                onClick={() => select(o.value)}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-50 transition-colors ${value === o.value ? 'text-amber-600 font-medium' : 'text-slate-700'}`}
              >
                {o.label}
              </button>
            ))}
            {canCreate && (
              <button
                type="button"
                onClick={create}
                className="w-full text-left px-3 py-2 text-sm text-amber-600 hover:bg-amber-50 transition-colors flex items-center gap-1.5"
              >
                <span className="font-medium">Create</span>
                <span className="bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded text-xs">"{query.trim()}"</span>
              </button>
            )}
            {filtered.length === 0 && !canCreate && (
              <div className="px-3 py-3 text-xs text-slate-400 text-center">No options</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY',
];

// ── Client info, edited in place ──────────────────────────────────────────────
// Mike, 2026-09-09: no pop-out and no Save button on the client info screen.
// Click a field, type, click away — it saves itself, the same way the project
// dashboard and the People tab already work. PersonField further down is the
// plain-text editor; these are the pickers that go beside it.

// One labelled field in the info grid.
function InfoRow({ label, children, className = '' }) {
  return (
    <div className={className}>
      <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">{label}</div>
      {children}
    </div>
  );
}

// Long free text. Click, type, click away.
function InlineTextarea({ value, onSave, placeholder, rows = 3 }) {
  const [editing, setEditing] = useState(false);
  const [draft,   setDraft]   = useState(value ?? '');
  const [busy,    setBusy]    = useState(false);

  useEffect(() => { setDraft(value ?? ''); }, [value]);

  async function commit() {
    setEditing(false);
    if ((draft ?? '') === (value ?? '')) return;
    setBusy(true);
    await onSave(draft);
    setBusy(false);
  }

  if (editing) {
    return (
      <textarea
        autoFocus
        rows={rows}
        value={draft}
        placeholder={placeholder}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Escape') { setDraft(value ?? ''); setEditing(false); } }}
        className="w-full rounded border border-amber-300 px-2 py-1.5 text-sm resize-y focus:outline-none focus:ring-1 focus:ring-amber-400"
      />
    );
  }

  return (
    <button type="button" onClick={() => setEditing(true)} title="Click to edit"
      className="block w-full text-left rounded px-1 -mx-1 py-0.5 hover:bg-amber-50 transition-colors">
      {busy
        ? <span className="text-sm text-amber-500">Saving…</span>
        : value
          ? <span className="text-sm text-slate-600 leading-relaxed whitespace-pre-line">{value}</span>
          : <span className="text-sm text-slate-300">{placeholder}</span>}
    </button>
  );
}

// Tickable chips. Every tick saves on its own, so there is nothing to submit.
function ChipPicker({
  selected, options, onSave,
  chipClass = () => 'bg-blue-50 text-blue-700 border border-blue-100',
  renderLabel,
  emptyLabel = '+ Add',
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const list = Array.isArray(selected) ? selected : [];

  async function toggle(next) {
    setBusy(true);
    await onSave(next);
    setBusy(false);
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5">
        {list.map(v => (
          <span key={v} className={`px-2.5 py-1 rounded-full text-xs font-medium ${chipClass(v)}`}>
            {renderLabel ? renderLabel(v) : v}
          </span>
        ))}
        {list.length === 0 && !open && (
          <button type="button" onClick={() => setOpen(true)}
            className="text-sm text-slate-300 hover:text-amber-600 transition-colors">{emptyLabel}</button>
        )}
        {(list.length > 0 || open) && (
          <button type="button" onClick={() => setOpen(o => !o)}
            className="text-xs text-amber-600 hover:text-amber-500 transition-colors">
            {open ? 'Done' : 'Edit'}
          </button>
        )}
        {busy && <span className="text-xs text-amber-500">Saving…</span>}
      </div>
      {open && (
        <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50/40 p-2.5">
          <MultiSelect options={options} selected={list} onChange={toggle} />
        </div>
      )}
    </div>
  );
}

// One-of choices (Tier, payment terms). Clicking the one already on clears it.
function ChoiceChips({ value, options, onSave }) {
  const [busy, setBusy] = useState(false);

  async function pick(v) {
    setBusy(true);
    await onSave(value === v ? '' : v);
    setBusy(false);
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {options.map(o => {
        const val    = typeof o === 'string' ? o : o.value;
        const lbl    = typeof o === 'string' ? o : o.label;
        const active = value === val;
        return (
          <button key={val} type="button" onClick={() => pick(val)}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors ${
              active ? 'bg-slate-800 text-white border-slate-800' : 'border-slate-200 text-slate-500 hover:border-slate-400'
            }`}>{lbl}</button>
        );
      })}
      {busy && <span className="text-xs text-amber-500">Saving…</span>}
    </div>
  );
}

// The tag library, edited from here: tick, rename, delete, add. Ticking saves
// straight away. Rename and delete still ask first — those two reach across
// every client that carries the tag, not just this one.
function TagPicker({ tagIds, onSave }) {
  const [tags, setTags]     = useState([]);
  const [open, setOpen]     = useState(false);
  const [newTag, setNewTag] = useState('');
  const [busy, setBusy]     = useState(false);
  const ids = Array.isArray(tagIds) ? tagIds : [];

  useEffect(() => {
    fetch('/api/tags').then(r => r.json()).then(d => setTags(d.tags || [])).catch(() => {});
  }, []);

  async function toggle(tagId) {
    const next = ids.includes(tagId) ? ids.filter(i => i !== tagId) : [...ids, tagId];
    setBusy(true);
    await onSave(next);
    setBusy(false);
  }

  async function createTag() {
    const name = newTag.trim();
    if (!name || busy) return;
    setBusy(true);
    try {
      const res = await fetch('/api/tags', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const d = await res.json();
      if (res.ok && d.tag) {
        setTags(t => (t.some(x => x.id === d.tag.id) ? t : [...t, d.tag]));
        setNewTag('');
        await onSave(ids.includes(d.tag.id) ? ids : [...ids, d.tag.id]);
      }
    } finally { setBusy(false); }
  }

  async function renameTag(tag) {
    const name = prompt('Rename this tag. It renames everywhere it is used.', tag.name);
    if (!name || name.trim() === tag.name) return;
    const res = await fetch(`/api/tags/${tag.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim() }),
    });
    if (res.ok) {
      const d = await res.json();
      setTags(list => list.map(t => (t.id === tag.id ? d.tag : t)));
    }
  }

  async function deleteTag(tag) {
    if (!confirm(`Delete the tag "${tag.name}"? It comes off every client that has it.`)) return;
    const res = await fetch(`/api/tags/${tag.id}`, { method: 'DELETE' });
    if (res.ok) {
      setTags(list => list.filter(t => t.id !== tag.id));
      if (ids.includes(tag.id)) await onSave(ids.filter(i => i !== tag.id));
    }
  }

  const picked = tags.filter(t => ids.includes(t.id));

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5">
        {picked.map(t => (
          <span key={t.id} className="px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
            {t.name}
          </span>
        ))}
        {picked.length === 0 && !open && (
          <button type="button" onClick={() => setOpen(true)}
            className="text-sm text-slate-300 hover:text-amber-600 transition-colors">+ Add a tag</button>
        )}
        {(picked.length > 0 || open) && (
          <button type="button" onClick={() => setOpen(o => !o)}
            className="text-xs text-amber-600 hover:text-amber-500 transition-colors">
            {open ? 'Done' : 'Edit'}
          </button>
        )}
        {busy && <span className="text-xs text-amber-500">Saving…</span>}
      </div>
      {open && (
        <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50/40 p-2.5">
          <p className="text-[11px] text-slate-400 mb-2">
            Make your own labels. Renaming or deleting one here changes it on every client that has it.
          </p>
          <div className="flex flex-wrap gap-1.5 mb-2.5">
            {tags.length === 0 && <span className="text-xs text-slate-400">No tags yet — add the first one below.</span>}
            {tags.map(tag => {
              const active = ids.includes(tag.id);
              return (
                <span key={tag.id} className={`inline-flex items-center rounded-full border text-xs font-medium transition-colors ${
                  active ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-500 border-slate-200'
                }`}>
                  <button type="button" onClick={() => toggle(tag.id)} className="pl-2.5 pr-1 py-1">{tag.name}</button>
                  <button type="button" title="Rename" onClick={() => renameTag(tag)}
                    className={`px-1 py-1 ${active ? 'text-white/70 hover:text-white' : 'text-slate-300 hover:text-slate-600'}`}>✎</button>
                  <button type="button" title="Delete" onClick={() => deleteTag(tag)}
                    className={`pr-2 pl-1 py-1 ${active ? 'text-white/70 hover:text-white' : 'text-slate-300 hover:text-red-500'}`}>✕</button>
                </span>
              );
            })}
          </div>
          <div className="flex gap-2">
            <input value={newTag} onChange={e => setNewTag(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); createTag(); } }}
              placeholder="New tag name…"
              className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" />
            <button type="button" onClick={createTag} disabled={busy || !newTag.trim()}
              className="px-3 py-1.5 rounded-lg text-sm font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50">
              Add
            </button>
          </div>
        </div>
      )}
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
    <div onClick={(e) => { if (e.target === e.currentTarget) onClose(); }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
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
function OverviewTab({ client, onPatch }) {
  const orgTypes     = parseJSON(client.orgTypes);
  const markets      = parseJSON(client.markets);
  const geographies  = parseJSON(client.geographies);
  const projectTypes = parseJSON(client.projectTypes);
  // Falls back to the legacy single column so clients saved before the
  // multi-select still show their developer type.
  const devTypes   = (() => {
    const list = parseJSON(client.developerTypes);
    if (list.length) return list;
    return client.developerType ? [client.developerType] : [];
  })();
  const locType    = LOCATION_TYPES.find(l => l.value === client.locationType)?.label;
  const location   = [client.city, client.state].filter(Boolean).join(', ');
  const isGC       = orgTypes.includes('General Contractor');
  const tagIds     = (client.tagLinks || []).map(l => l.tagId);
  // One project is one deal here. A Full Design job rides both pipelines, but
  // it is still one job we did for this client, so it counts once (Mike,
  // 2026-09-06). The pipeline boards themselves still count it on each board.
  const counts     = clientDealCounts(client.projects);
  // What they actually build, read off their own projects — the auto-populate
  // Mike asked for. Shown next to what was ticked by hand.
  const seenTypes  = projectTypesFromProjects(client.projects).map(projectTypeLabel);

  // The account owner has to be someone marked as a salesperson. If nobody is
  // marked yet, list everyone rather than show a dropdown that looks broken.
  const [users, setUsers]         = useState([]);
  const [salesOnly, setSalesOnly] = useState(true);
  useEffect(() => {
    fetch('/api/users').then(r => r.json()).then(d => setUsers(d.users || [])).catch(() => {});
  }, []);
  const salespeople = users.filter(u => (u.departments || []).includes('SALES_MARKETING'));
  const ownerOptions = salesOnly && salespeople.length ? salespeople : users;

  return (
    <div className="space-y-6">
      {/* ── One full-width client info window. Everything here edits in place:
             click it, change it, click away. Nothing to save. ── */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        {/* Top bar: Client ID + how this screen works */}
        <div className="flex items-center justify-between mb-5">
          <span className="font-mono text-xs font-semibold text-slate-400 tracking-wide">
            {client.clientNumber ? `CLT-${String(client.clientNumber).padStart(4, '0')}` : ''}
          </span>
          <span className="text-[11px] text-slate-300">Click any field to change it — it saves itself</span>
        </div>

        {/* Identity row */}
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
            <span className="text-xl font-bold text-amber-600">{(client.name || '?')[0].toUpperCase()}</span>
          </div>
          <div className="min-w-0 flex-1">
            <PersonField
              value={client.name}
              placeholder="Client name"
              width="w-full max-w-md"
              className="text-lg font-bold text-slate-900 leading-tight"
              onSave={v => onPatch({ name: v })}
            />
            {(location || locType) && (
              <p className="text-sm text-slate-500 mt-0.5">
                {location}{location && locType ? ' · ' : ''}{locType}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
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
          </div>
        </div>

        {/* Project counts — worked out live from this client's projects across
            both pipelines, so they can never disagree with the boards. */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-5 pt-5 border-t border-slate-100">
          {[
            ['Open Projects',   counts.open,      'text-slate-900'],
            ['Won',             counts.won,       'text-emerald-600'],
            ['Lost',            counts.lost,      'text-red-500'],
            ['Abandoned',       counts.abandoned, 'text-amber-600'],
            ['People',          client.contacts?.length ?? client._count?.contacts ?? 0, 'text-slate-900'],
          ].map(([label, value, tone]) => (
            <div key={label} className="rounded-lg bg-slate-50 px-3 py-2.5">
              <div className={`text-lg font-bold ${tone}`}>{value}</div>
              <div className="text-[10px] text-slate-400 uppercase tracking-wide">{label}</div>
            </div>
          ))}
        </div>

        {/* Detail grid: company + contact info | what they build */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-5 mt-5 pt-5 border-t border-slate-100">

          {/* Left: who they are and how to reach them */}
          <div className="space-y-4">
            <InfoRow label="Client type">
              <ChipPicker
                selected={orgTypes}
                options={ORG_TYPES}
                chipClass={orgTypeColor}
                emptyLabel="+ Tick every type that applies"
                onSave={v => onPatch({ orgTypes: v })}
              />
            </InfoRow>

            <InfoRow label="Developer type">
              <ChipPicker
                selected={devTypes}
                options={DEVELOPER_TYPES}
                renderLabel={developerTypeLabel}
                emptyLabel="+ Add developer type"
                onSave={v => onPatch({ developerTypes: v })}
              />
            </InfoRow>

            <div className="grid grid-cols-2 gap-4">
              <InfoRow label="Tier">
                <ChoiceChips
                  value={client.tier || ''}
                  options={['1', '2', '3'].map(t => ({ value: t, label: `Tier ${t}` }))}
                  onSave={v => onPatch({ tier: v })}
                />
              </InfoRow>
              <InfoRow label="Payment terms">
                <ChoiceChips
                  value={client.paymentTerms || ''}
                  options={['NET30', 'NET45', 'NET60', 'OTHER'].map(t => ({
                    value: t, label: t === 'OTHER' ? 'Other' : t.replace('NET', 'NET '),
                  }))}
                  onSave={v => onPatch({ paymentTerms: v })}
                />
              </InfoRow>
            </div>

            <InfoRow label="Salesperson">
              <select
                value={client.ownerId || ''}
                onChange={e => onPatch({ ownerId: e.target.value || null })}
                className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-500">
                <option value="">— Unassigned —</option>
                {ownerOptions.map(u => <option key={u.id} value={u.id}>{u.name || u.email}</option>)}
              </select>
              <label className="flex items-center gap-2 mt-1.5 text-[11px] text-slate-400">
                <input type="checkbox" checked={salesOnly} onChange={e => setSalesOnly(e.target.checked)}
                  className="rounded border-slate-300 text-amber-500 focus:ring-amber-500" />
                Only show people set up as salespeople
                {salespeople.length === 0 && <span>(nobody is yet, so everyone is listed)</span>}
              </label>
            </InfoRow>

            <div className="grid grid-cols-2 gap-4">
              <InfoRow label="City">
                <PersonField value={client.city} placeholder="City" width="w-full"
                  className="text-sm text-slate-600" onSave={v => onPatch({ city: v })} />
              </InfoRow>
              <InfoRow label="State">
                <PersonField value={client.state} placeholder="State" width="w-full" list="client-states"
                  className="text-sm text-slate-600" onSave={v => onPatch({ state: v })} />
                <datalist id="client-states">
                  {US_STATES.map(s => <option key={s} value={s} />)}
                </datalist>
              </InfoRow>
            </div>

            <InfoRow label="Location type">
              <CreatableSelect
                value={client.locationType || ''}
                onChange={v => onPatch({ locationType: v })}
                options={LOCATION_TYPES}
                placeholder="Select or create…"
              />
            </InfoRow>

            <InfoRow label="Client rating">
              <PersonField value={client.rating} width="w-full" className="text-sm text-slate-600"
                placeholder="Free text for now — the scoring rule is still to be decided"
                onSave={v => onPatch({ rating: v })} />
            </InfoRow>

            {/* Pre-construction email — GC clients only, or any client that
                already has one saved from before. */}
            {(isGC || client.email) && (
              <InfoRow label="Pre-construction email">
                <PersonField value={client.email} type="email" width="w-full"
                  className="text-sm text-slate-600" placeholder="GC pre-construction contact email"
                  onSave={v => onPatch({ email: v })} />
              </InfoRow>
            )}

            <div className="grid grid-cols-2 gap-4">
              <InfoRow label="Phone">
                <PersonField value={client.phone} type="tel" width="w-full"
                  className="text-sm text-slate-600" placeholder="Phone"
                  onSave={v => onPatch({ phone: v })} />
              </InfoRow>
              <InfoRow label="Website">
                <PersonField value={client.website} type="url" width="w-full"
                  className="text-sm text-slate-600" placeholder="https://…"
                  display={client.website ? client.website.replace(/^https?:\/\//, '') : null}
                  onSave={v => onPatch({ website: v })} />
              </InfoRow>
            </div>

            <InfoRow label="LinkedIn">
              <PersonField value={client.linkedIn} type="url" width="w-full"
                className="text-sm text-slate-600" placeholder="https://linkedin.com/company/…"
                onSave={v => onPatch({ linkedIn: v })} />
            </InfoRow>

            <InfoRow label="Tags">
              <TagPicker tagIds={tagIds} onSave={v => onPatch({ tagIds: v })} />
            </InfoRow>
          </div>

          {/* Right: what they build and where */}
          <div className="space-y-4">
            <InfoRow label="Markets">
              <ChipPicker
                selected={markets}
                options={MARKETS}
                emptyLabel="+ Add markets this client builds in"
                onSave={v => onPatch({ markets: v })}
              />
            </InfoRow>

            <InfoRow label="Geography">
              <ChipPicker
                selected={geographies}
                options={US_STATES}
                chipClass={() => 'bg-slate-100 text-slate-600 border border-slate-200'}
                emptyLabel="+ Add states this client is active in"
                onSave={v => onPatch({ geographies: v })}
              />
            </InfoRow>

            <InfoRow label="Portfolio">
              <ChipPicker
                selected={projectTypes}
                options={CLIENT_PROJECT_TYPES}
                renderLabel={projectTypeLabel}
                emptyLabel="+ Add project types this client builds"
                onSave={v => onPatch({ projectTypes: v })}
              />
              {seenTypes.length > 0 && (
                <p className="text-[11px] text-slate-400 mt-1.5">
                  From their actual projects: {seenTypes.join(', ')}
                </p>
              )}
            </InfoRow>

            <InfoRow label="Approx. projects per year">
              <PersonField value={client.projectsPerYear ?? ''} type="number" width="w-24"
                className="text-sm text-slate-600" placeholder="e.g. 12"
                onSave={v => onPatch({ projectsPerYear: v })} />
            </InfoRow>
          </div>
        </div>

        <div className="mt-5 pt-5 border-t border-slate-100">
          <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Notes</div>
          <InlineTextarea
            value={client.notes || ''}
            placeholder="Click to add notes about this client…"
            onSave={v => onPatch({ notes: v })}
          />
        </div>

        <div className="mt-5 pt-4 border-t border-slate-100 text-xs text-slate-400">
          Added by {client.createdBy?.name || client.createdBy?.email}
        </div>
      </div>

      {/* ── Stats below ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 px-4 py-4 text-center">
          <div className="text-2xl font-bold text-slate-800">{client.projects?.length || 0}</div>
          <div className="text-xs text-slate-400 mt-0.5 font-medium">Linked Projects</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 px-4 py-4 text-center">
          <div className="text-2xl font-bold text-slate-800">{client.contacts?.length || 0}</div>
          <div className="text-xs text-slate-400 mt-0.5 font-medium">Contacts</div>
        </div>
      </div>
    </div>
  );
}

// ── People Tab ────────────────────────────────────────────────────────────────
// Rebuilt 2026-09-09 for Mike. Three things he asked for on the call:
//   1. "that link profile is just making taking one big line" — every person now
//      takes TWO lines instead of one very wide table row, so nothing runs off
//      the right side of the screen.
//   2. Every field edits in place. No pop-out panel, no Edit button, no modal —
//      click the words, type, click away. It saves itself.
//   3. The Open / Won / Lost / Abandoned numbers name the jobs behind them:
//      hover to see the list, click to open it right here on the same screen.
function getCheckinStatus(contact) {
  const ref = contact.lastInPersonAt ?? contact.lastTouchpointAt;
  if (!ref || !contact.cadenceTier) return null;
  const effectiveDays = contact.cadenceDays ?? 90;
  const elapsed = Math.floor((Date.now() - new Date(ref)) / 86_400_000);
  const daysOverdue = elapsed - effectiveDays;
  if (daysOverdue > 0) return 'overdue';
  if (daysOverdue > -14) return 'due_soon';
  return 'current';
}

// A blank person, so the Add row and the "add first person" button agree.
const EMPTY_PERSON = {
  name: '', firstName: '', lastName: '', title: '', email: '',
  cellPhone: '', workPhone: '', department: '', linkedInUrl: '',
};

// The four buckets, in the order Mike reads them, with their colours.
const DEAL_BUCKETS = [
  { key: 'open',      short: 'O', label: 'Open',      on: 'bg-slate-100 text-slate-700 hover:bg-slate-200' },
  { key: 'won',       short: 'W', label: 'Won',       on: 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' },
  { key: 'lost',      short: 'L', label: 'Lost',      on: 'bg-red-50 text-red-600 hover:bg-red-100' },
  { key: 'abandoned', short: 'A', label: 'Abandoned', on: 'bg-amber-50 text-amber-700 hover:bg-amber-100' },
];

/**
 * The four deal numbers for one person.
 *
 * The number IS the button. Hovering shows the job names without a click (Mike:
 * he wants to see them "on a rollover"); clicking hands them to the popup on
 * this same screen rather than navigating away.
 */
function DealChips({ contact, onOpenList }) {
  const counts   = contactDealCounts(contact);
  const buckets  = contactDealProjects(contact);
  if (!counts.total) return <span className="text-slate-300 text-xs">No jobs yet</span>;

  return (
    <span className="inline-flex gap-1">
      {DEAL_BUCKETS.map(b => {
        const projects = buckets[b.key];
        const n = projects.length;
        return (
          <span key={b.key} className="relative group/chip">
            <button
              type="button"
              disabled={!n}
              onClick={() => n && onOpenList({ contact, bucket: b, projects })}
              className={`px-1.5 py-0.5 rounded text-[10px] font-bold transition-colors ${
                n ? `${b.on} cursor-pointer` : 'bg-slate-50 text-slate-300 cursor-default'
              }`}
            >
              {b.short}{n}
            </button>

            {/* The rollover. Names only — the click is what opens the full list. */}
            {n > 0 && (
              <span className="pointer-events-none absolute z-30 left-1/2 -translate-x-1/2 top-full mt-1 hidden group-hover/chip:block w-56 rounded-lg bg-slate-900 text-white text-[11px] px-3 py-2 shadow-xl">
                <span className="block font-semibold text-slate-300 mb-1">{b.label} ({n})</span>
                {projects.slice(0, 6).map(p => (
                  <span key={p.id} className="block truncate">{p.name}</span>
                ))}
                {n > 6 && <span className="block text-slate-400">+{n - 6} more…</span>}
                <span className="block mt-1 text-slate-400">Click to open the list</span>
              </span>
            )}
          </span>
        );
      })}
    </span>
  );
}

/**
 * The popup Mike asked for: "pop up" on the same screen, not a page change.
 * Lists the jobs behind one number. The names are still links for anyone who
 * does want to go to the job.
 */
function DealListPopup({ contact, bucket, projects, onClose }) {
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/30" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-md max-h-[70vh] flex flex-col">
        <div className="px-5 py-4 border-b border-slate-100 flex items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold text-slate-900">{bucket.label} — {projects.length}</h3>
            <p className="text-xs text-slate-400 mt-0.5">{contact.name} is the main contact on these.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close"
            className="p-1 rounded text-slate-300 hover:text-slate-600 hover:bg-slate-100 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <ul className="flex-1 overflow-y-auto divide-y divide-slate-50">
          {projects.map(p => (
            <li key={p.id} className="px-5 py-3 hover:bg-slate-50 transition-colors">
              <div className="flex items-center gap-2">
                {p.projectNumber && (
                  <span className="text-[11px] font-mono font-semibold text-slate-400 shrink-0">
                    PRJ-{String(p.projectNumber).padStart(4, '0')}
                  </span>
                )}
                <Link href={`/project/${p.id}`} className="font-medium text-slate-800 hover:text-amber-600 transition-colors truncate">
                  {p.name}
                </Link>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/**
 * One field that edits itself in place.
 *
 * Reads as plain text; click it and it becomes a box; leave it and it saves.
 * Escape puts it back. There is no Save button on purpose — Mike asked for the
 * pop-out to go away entirely.
 */
function PersonField({
  value, onSave, placeholder, type = 'text', className = '', display,
  list, width = 'min-w-[6rem]', prefixIcon,
}) {
  const [editing, setEditing] = useState(false);
  const [draft,   setDraft]   = useState(value ?? '');
  const [busy,    setBusy]    = useState(false);

  useEffect(() => { setDraft(value ?? ''); }, [value]);

  async function commit() {
    setEditing(false);
    if ((draft ?? '') === (value ?? '')) return;
    setBusy(true);
    await onSave(draft);
    setBusy(false);
  }

  if (editing) {
    return (
      <input
        autoFocus
        type={type}
        list={list}
        value={draft}
        placeholder={placeholder}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter')  { e.preventDefault(); commit(); }
          if (e.key === 'Escape') { setDraft(value ?? ''); setEditing(false); }
        }}
        className={`${width} border border-amber-300 rounded px-1.5 py-0.5 text-sm focus:outline-none focus:ring-1 focus:ring-amber-400 ${className}`}
      />
    );
  }

  const shown = display ?? (value || null);
  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      title="Click to edit"
      className={`text-left rounded px-1 -mx-1 hover:bg-amber-50 transition-colors ${className} ${shown ? '' : 'text-slate-300'}`}
    >
      {busy ? <span className="text-amber-500">Saving…</span> : (
        <>
          {prefixIcon && shown ? <span className="text-slate-300 mr-1">{prefixIcon}</span> : null}
          {shown || placeholder}
        </>
      )}
    </button>
  );
}

function PeopleTab({ contacts: initial, clientId, onContactsChange }) {
  const [contacts,  setContacts]  = useState(initial);
  const [dealList,  setDealList]  = useState(null); // {contact, bucket, projects} | null

  // Propagate any contact change up so the Overview count, tab badge, and
  // Playbook "primary national contact" dropdown stay in sync without a refresh.
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) { firstRun.current = false; return; }
    onContactsChange?.(contacts);
  }, [contacts]);
  const [addForm,   setAddForm]   = useState(null); // null | {}
  const [saving,    setSaving]    = useState(false);
  const [deletingId, setDeletingId] = useState(null);      // the one being archived
  const [archiveTarget, setArchiveTarget] = useState(null); // { id, name } waiting on "Archive it"

  const [formErr, setFormErr] = useState('');

  async function addContact() {
    if (!addForm?.name?.trim()) return;
    if (!isValidEmail(addForm.email)) { setFormErr('That email address does not look right.'); return; }
    setSaving(true); setFormErr('');
    const res = await fetch(`/api/clients/${clientId}/contacts`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(addForm),
    });
    const data = await res.json();
    if (!res.ok) { setFormErr(data.error || 'Could not add this person.'); setSaving(false); return; }
    setContacts(c => [...c, data.contact]);
    setAddForm(null);
    setSaving(false);
  }

  /**
   * Save ONE field on ONE person, straight away.
   *
   * Typing a first or last name keeps the full name in step and the other way
   * round; that logic already lives in the API, so only the one field the user
   * touched is sent and whatever comes back is what the screen shows.
   */
  async function saveField(contact, field, raw) {
    const value = typeof raw === 'string' ? raw.trim() : raw;
    if (field === 'name' && !value) { setFormErr('A person needs a name.'); return; }
    if (field === 'email' && !isValidEmail(value)) { setFormErr('That email address does not look right.'); return; }
    setFormErr('');
    const res = await fetch(`/api/clients/${clientId}/contacts/${contact.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: value }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setFormErr(data.error || 'Could not save that.'); return; }
    setContacts(c => c.map(x => x.id === contact.id ? data.contact : x));
  }

  // People are archived, never deleted (Mike, 2026-09-11).
  async function archiveContact() {
    const target = archiveTarget;
    if (!target) return;
    setDeletingId(target.id);
    try {
      const res = await fetch(`/api/clients/${clientId}/contacts/${target.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived: true }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || 'Could not archive that person.');
        return;
      }
      setContacts(c => c.filter(x => x.id !== target.id));
      setArchiveTarget(null);
    } finally {
      setDeletingId(null);
    }
  }

  const inputCls = 'w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-amber-400';

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <ConfirmArchiveModal
        open={!!archiveTarget}
        title="Archive this person?"
        what={archiveTarget?.name}
        body="They disappear from this company's People list and every picker, and the sales bot stops matching emails and meetings to them. Nothing is deleted: their history and the projects they are on are kept, and you can restore them from the Archive page at any time."
        busy={!!deletingId}
        onCancel={() => setArchiveTarget(null)}
        onConfirm={archiveContact}
      />

      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <div>
          <h2 className="font-semibold text-slate-900">People
            <span className="ml-2 text-sm font-normal text-slate-400">({contacts.length})</span>
          </h2>
          <p className="text-[11px] text-slate-400 mt-0.5">Click any field to change it. It saves when you click away.</p>
        </div>
        {addForm === null && (
          <button onClick={() => { setAddForm({ ...EMPTY_PERSON }); setFormErr(''); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
            Add Person
          </button>
        )}
      </div>

      {formErr && (
        <div className="px-5 py-2.5 text-sm text-red-600 bg-red-50 border-b border-red-100">{formErr}</div>
      )}

      {/* Cadence badge banner */}
      {(() => {
        const counts = { overdue: 0, due_soon: 0, current: 0 };
        contacts.forEach(c => {
          const status = getCheckinStatus(c);
          if (status) counts[status]++;
        });
        const hasAny = counts.overdue + counts.due_soon + counts.current > 0;
        return hasAny ? (
          <div className="px-5 py-3 bg-slate-50/50 border-b border-slate-100 flex gap-2 flex-wrap">
            {counts.overdue > 0 && (
              <span className="text-xs font-semibold px-2 py-1 rounded-full bg-red-100 text-red-700">
                {counts.overdue} overdue
              </span>
            )}
            {counts.due_soon > 0 && (
              <span className="text-xs font-semibold px-2 py-1 rounded-full bg-amber-100 text-amber-700">
                {counts.due_soon} due soon
              </span>
            )}
            {counts.current > 0 && (
              <span className="text-xs font-semibold px-2 py-1 rounded-full bg-green-100 text-green-700">
                {counts.current} current
              </span>
            )}
          </div>
        ) : null;
      })()}

      <datalist id="dept-options">
        {CONTACT_DEPARTMENTS.map(d => <option key={d} value={d} />)}
      </datalist>

      {/* ── One person, two lines ── */}
      <div className="divide-y divide-slate-100">
        {contacts.map(c => (
          <div key={c.id} className="group px-5 py-3 hover:bg-slate-50/50 transition-colors">
            {/* Line 1 — who they are, and how the jobs went. */}
            <div className="flex items-start justify-between gap-4">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 min-w-0">
                <PersonField
                  value={c.name}
                  onSave={v => saveField(c, 'name', v)}
                  placeholder="Name"
                  width="min-w-[10rem]"
                  className="font-semibold text-slate-800 text-sm"
                />
                <span className="text-slate-200">·</span>
                <PersonField
                  value={c.title}
                  onSave={v => saveField(c, 'title', v)}
                  placeholder="Add a job title"
                  width="min-w-[10rem]"
                  className="text-sm text-slate-500"
                />
                <PersonField
                  value={c.department}
                  onSave={v => saveField(c, 'department', v)}
                  placeholder="Add a department"
                  list="dept-options"
                  width="min-w-[9rem]"
                  className="text-xs text-slate-500"
                  display={c.department
                    ? <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">{c.department}</span>
                    : undefined}
                />
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <DealChips contact={c} onOpenList={setDealList} />
                <button onClick={() => setArchiveTarget({ id: c.id, name: c.name })} disabled={deletingId === c.id}
                  className="p-1 rounded text-slate-300 hover:text-amber-600 hover:bg-amber-50 opacity-0 group-hover:opacity-100 transition-all" title="Archive this person">
                  {deletingId === c.id ? <Spinner className="w-3.5 h-3.5" /> : (
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" /></svg>
                  )}
                </button>
              </div>
            </div>

            {/* Line 2 — how to reach them. This is the line that used to run off
                the side of the screen when it was all one row. */}
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
              <PersonField
                value={c.email}
                type="email"
                onSave={v => saveField(c, 'email', v)}
                placeholder="Add an email"
                width="min-w-[14rem]"
                prefixIcon="✉"
                className="text-amber-600 hover:text-amber-500"
              />
              <PersonField
                value={c.workPhone || c.phone}
                type="tel"
                onSave={v => saveField(c, 'workPhone', v)}
                placeholder="Add a work phone"
                width="min-w-[9rem]"
                prefixIcon="☎"
                display={formatPhone(c.workPhone || c.phone) || undefined}
              />
              <PersonField
                value={c.cellPhone}
                type="tel"
                onSave={v => saveField(c, 'cellPhone', v)}
                placeholder="Add a cell"
                width="min-w-[9rem]"
                prefixIcon="📱"
                display={formatPhone(c.cellPhone) || undefined}
              />
              <PersonField
                value={c.linkedInUrl}
                type="url"
                onSave={v => saveField(c, 'linkedInUrl', v)}
                placeholder="Add LinkedIn"
                width="min-w-[16rem]"
                display={c.linkedInUrl ? 'in LinkedIn' : undefined}
                className="text-amber-600 hover:text-amber-500"
              />
              {c.linkedInUrl && (
                <a href={c.linkedInUrl} target="_blank" rel="noopener noreferrer"
                  className="text-slate-300 hover:text-amber-600" title="Open their LinkedIn in a new tab">↗</a>
              )}
              {(c.lastEmailReceivedAt || c.lastEmailSentAt) && (
                <span className="text-slate-300">
                  Last email {c.lastEmailReceivedAt ? `in ${new Date(c.lastEmailReceivedAt).toLocaleDateString()}` : ''}
                  {c.lastEmailReceivedAt && c.lastEmailSentAt ? ' · ' : ''}
                  {c.lastEmailSentAt ? `out ${new Date(c.lastEmailSentAt).toLocaleDateString()}` : ''}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Add a person — still a small form, because a brand new person has no
          row to click on yet. */}
      {addForm !== null && (
        <div className="px-5 py-4 bg-blue-50/30 border-t border-blue-100">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input autoFocus value={addForm.name}
              onChange={e => setAddForm(f => ({ ...f, name: e.target.value, ...splitName(e.target.value) }))}
              placeholder="Full name *" className={inputCls} />
            <input value={addForm.title} onChange={e => setAddForm(f => ({ ...f, title: e.target.value }))} placeholder="Job title" className={inputCls} />
            <input list="dept-options" value={addForm.department} onChange={e => setAddForm(f => ({ ...f, department: e.target.value }))} placeholder="Department" className={inputCls} />
            <input type="email" value={addForm.email} onChange={e => setAddForm(f => ({ ...f, email: e.target.value }))} placeholder="Email" className={inputCls} />
            <input type="tel" value={addForm.workPhone} onChange={e => setAddForm(f => ({ ...f, workPhone: e.target.value }))} placeholder="Work phone" className={inputCls} />
            <input type="tel" value={addForm.cellPhone} onChange={e => setAddForm(f => ({ ...f, cellPhone: e.target.value }))} placeholder="Cell phone" className={inputCls} />
            <input type="url" value={addForm.linkedInUrl} onChange={e => setAddForm(f => ({ ...f, linkedInUrl: e.target.value }))} placeholder="LinkedIn profile URL (optional)" className={`${inputCls} md:col-span-3`} />
          </div>
          <div className="flex gap-2 mt-3">
            <button onClick={addContact} disabled={saving || !addForm.name?.trim()}
              className="px-3 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
              {saving ? 'Adding…' : 'Add Person'}
            </button>
            <button onClick={() => setAddForm(null)}
              className="px-3 py-1.5 text-xs font-medium text-slate-500 rounded-lg border border-slate-200 hover:bg-white transition-colors">Cancel</button>
          </div>
        </div>
      )}

      {contacts.length === 0 && addForm === null && (
        <div className="px-5 py-12 text-center">
          <p className="text-slate-400 text-sm mb-3">No people yet.</p>
          <button onClick={() => { setFormErr(''); setAddForm({ ...EMPTY_PERSON }); }}
            className="text-sm font-medium text-amber-600 hover:text-amber-500 transition-colors">
            + Add first person
          </button>
        </div>
      )}

      {dealList && (
        <DealListPopup
          contact={dealList.contact}
          bucket={dealList.bucket}
          projects={dealList.projects}
          onClose={() => setDealList(null)}
        />
      )}
    </div>
  );
}

// ── Projects Tab ──────────────────────────────────────────────────────────────
function ProjectsTab({ client, available, related = [], onRefresh }) {
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

      {/* ── Related Projects ──────────────────────────────────────────────────
          Jobs this company is ON but did not bring us. Maram, 2026-09-09: "CSI
          for example, they probably won't be bringing us a lot of projects, but
          they might be connected to several others." Kept as its own list on
          purpose — folding them in above would make an engineering firm look
          like a big client. */}
      {related.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 mt-6">
          <div className="px-6 py-4 border-b border-slate-100">
            <h2 className="font-semibold text-slate-900">
              Related Projects <span className="ml-2 text-sm font-normal text-slate-400">({related.length})</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Jobs they are on the team of. Somebody else is the client on these.
            </p>
          </div>
          <div className="divide-y divide-slate-50">
            {related.map(p => {
              const roles = rolesHeldBy(p, client.id);
              return (
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
                    <div className="text-xs text-slate-400 mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                      {p.client?.name && (
                        <span>
                          Client:{' '}
                          <Link href={`/clients/${p.client.id}`} className="text-slate-500 hover:text-amber-600">
                            {p.client.name}
                          </Link>
                        </span>
                      )}
                      <span>{[[p.city, p.state].filter(Boolean).join(', '), p.phase?.toUpperCase()].filter(Boolean).join(' · ')}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {/* Which hat they wore here. A company can wear more than one. */}
                    {roles.map(r => (
                      <span key={r.key} className="text-[10px] font-semibold text-slate-600 bg-slate-100 rounded-full px-2 py-0.5">
                        {r.label}
                      </span>
                    ))}
                    <Link href={`/project/${p.id}`}
                      className="opacity-0 group-hover:opacity-100 transition-opacity px-2.5 py-1 rounded-lg text-xs font-medium border border-slate-200 text-slate-600 hover:bg-slate-100">
                      Open
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {linking && (
        <LinkProjectsModal clientId={client.id} available={available}
          onClose={() => setLinking(false)} onSave={() => { setLinking(false); onRefresh(); }} />
      )}
    </>
  );
}

// ── Client Standards Tab ──────────────────────────────────────────────────────

function buildAnswerMap(answers) {
  const map = {};
  for (const a of answers) {
    const key = `${a.question_key}::${a.projectType || ''}::${a.region || ''}`;
    map[key] = a;
  }
  return map;
}

// ── Text answer input — defined outside parent to preserve state across renders ──
function TextAnswerInput({ question, sectionKey, currentValue: initVal, canEdit, isSav, onSave }) {
  const [localVal, setLocalVal] = useState(initVal || '');
  const timerRef = useRef(null);
  useEffect(() => { setLocalVal(initVal || ''); }, [initVal]);
  function handleChange(v) {
    setLocalVal(v);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      onSave(question, v.trim() || null, sectionKey);
    }, 800);
  }
  return (
    <textarea
      value={localVal}
      onChange={e => handleChange(e.target.value)}
      disabled={!canEdit || isSav}
      placeholder={question.hint || 'Type here…'}
      rows={2}
      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-200 resize-none disabled:opacity-50"
    />
  );
}

function ClientStandardsTab({ clientId, initialAnswers, canEdit }) {
  const [answers,          setAnswers]          = useState(() => buildAnswerMap(initialAnswers));
  const [activeSection,    setActiveSection]    = useState(STANDARDS_SECTIONS[0].key);
  const [activeProjectType, setActiveProjectType] = useState(''); // '' = Global
  const [saving,           setSaving]           = useState({});
  const [cascadeToast,     setCascadeToast]     = useState(null);

  const allAnswers = Object.values(answers);

  // Resolve the effective answer for a question + current project type
  function getAnswer(questionKey, pt = activeProjectType) {
    return resolveAnswer(allAnswers, questionKey, pt, '');
  }

  // Is the resolved value inherited (came from global, not this specific project type)?
  function isInherited(questionKey) {
    if (!activeProjectType) return false;
    return !answers[`${questionKey}::${activeProjectType}::`];
  }

  // Does this project type have a specific override?
  function hasOverride(questionKey) {
    if (!activeProjectType) return false;
    const rec = answers[`${questionKey}::${activeProjectType}::`];
    return !!rec && rec.answer_value != null;
  }

  // ── Save a standards answer ───────────────────────────────────────────────
  async function saveAnswer(question, value, sectionKey) {
    const mapKey = `${question.key}::${activeProjectType}::`;
    setSaving(prev => ({ ...prev, [mapKey]: true }));
    try {
      const res = await fetch(`/api/clients/${clientId}/standards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question_key: question.key,
          section:      sectionKey || activeSection,
          subsection:   '',
          input_type:   question.inputType || 'CHIPS',
          answer_value: value,
          projectType:  activeProjectType,
          region:       '',
        }),
      });
      if (res.ok) {
        const { answer, cascaded } = await res.json();
        setAnswers(prev => ({ ...prev, [mapKey]: answer }));

        if (cascaded > 0) {
          // Reload to pick up all cascaded records
          const allRes = await fetch(`/api/clients/${clientId}/standards`);
          if (allRes.ok) {
            const all = await allRes.json();
            setAnswers(buildAnswerMap(all));
          }
          setCascadeToast({ count: cascaded, label: question.label });
          setTimeout(() => setCascadeToast(null), 3500);
        }
      }
    } finally {
      setSaving(prev => { const n = { ...prev }; delete n[mapKey]; return n; });
    }
  }

  // ── Clear a project-type override (set answer_value to null) ─────────────
  async function clearOverride(question, sectionKey) {
    await saveAnswer({ ...question, inputType: question.inputType || 'CHIPS' }, null, sectionKey);
    // Remove from local map so inherited value shows through
    const mapKey = `${question.key}::${activeProjectType}::`;
    setAnswers(prev => {
      const n = { ...prev };
      if (n[mapKey]) n[mapKey] = { ...n[mapKey], answer_value: null };
      return n;
    });
  }

  // ── CCT save ─────────────────────────────────────────────────────────────
  async function saveCCT(questionKey, value) {
    const mapKey = `${questionKey}::${activeProjectType}::`;
    setSaving(prev => ({ ...prev, [mapKey]: true }));
    try {
      const res = await fetch(`/api/clients/${clientId}/standards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question_key: questionKey,
          section:      'COLOR_TEMPERATURE',
          subsection:   '',
          input_type:   'CHIPS',
          answer_value: value || null,
          projectType:  activeProjectType,
          region:       '',
        }),
      });
      if (res.ok) {
        const { answer } = await res.json();
        setAnswers(prev => ({ ...prev, [mapKey]: answer }));
      }
    } finally {
      setSaving(prev => { const n = { ...prev }; delete n[mapKey]; return n; });
    }
  }

  // ── Completion ────────────────────────────────────────────────────────────
  const QUESTION_SECTIONS = STANDARDS_SECTIONS.filter(s => !s.isCCT && s.questions?.length > 0);
  const totalQuestions    = QUESTION_SECTIONS.reduce((n, s) => n + s.questions.length, 0);
  const answeredGlobal    = QUESTION_SECTIONS.reduce((n, s) =>
    n + s.questions.filter(q => getAnswer(q.key, '')?.answer_value != null).length, 0);
  const pct = totalQuestions > 0 ? Math.round((answeredGlobal / totalQuestions) * 100) : 0;

  function sectionAnsweredCount(sectionKey) {
    const sec = STANDARDS_SECTIONS.find(s => s.key === sectionKey);
    if (!sec?.questions?.length) return { answered: 0, total: 0 };
    const answered = sec.questions.filter(q => getAnswer(q.key)?.answer_value != null).length;
    return { answered, total: sec.questions.length };
  }

  // ── CCT Section renderer ──────────────────────────────────────────────────
  function CCTSection() {
    const interiorCCT = getAnswer('cct_all_interior')?.answer_value || '';
    const exteriorCCT = getAnswer('cct_exterior')?.answer_value || '';
    const isSavingInterior = !!saving[`cct_all_interior::${activeProjectType}::`];
    const isSavingExterior = !!saving[`cct_exterior::${activeProjectType}::`];

    function effectiveCCT(areaKey) {
      const override = getAnswer(areaKey)?.answer_value;
      return override || interiorCCT || '';
    }

    function isAreaOverride(areaKey) {
      const v = getAnswer(areaKey)?.answer_value;
      return v && v !== interiorCCT;
    }

    function CCTChips({ questionKey, value, onChange, options = CCT_OPTIONS }) {
      const isSav = !!saving[`${questionKey}::${activeProjectType}::`];
      return (
        <div className="flex flex-wrap gap-1.5 mt-1">
          {options.map(cct => (
            <button key={cct} type="button"
              onClick={() => canEdit && !isSav && onChange(value === cct ? '' : cct)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                value === cct
                  ? 'bg-amber-500 text-white border-amber-500'
                  : 'bg-white text-slate-500 border-slate-200 hover:border-amber-400 hover:text-amber-600'
              } ${!canEdit ? 'pointer-events-none opacity-60' : ''}`}>
              {cct}
            </button>
          ))}
          {value && canEdit && (
            <button type="button" onClick={() => onChange('')}
              className="px-2 py-1.5 text-xs text-slate-400 hover:text-slate-600">✕ Clear</button>
          )}
          {isSav && <span className="text-[10px] text-slate-400 italic self-center ml-1">Saving…</span>}
        </div>
      );
    }

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400 shrink-0" />
              <span className="text-sm font-bold text-slate-800">All Interior</span>
              <span className="text-[10px] text-slate-400 ml-auto">Default for all interior areas</span>
            </div>
            <CCTChips questionKey="cct_all_interior" value={interiorCCT}
              onChange={v => saveCCT('cct_all_interior', v)} />
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-400 shrink-0" />
              <span className="text-sm font-bold text-slate-800">Exterior</span>
              <span className="text-[10px] text-slate-400 ml-auto">All exterior areas</span>
            </div>
            <CCTChips questionKey="cct_exterior" value={exteriorCCT}
              onChange={v => saveCCT('cct_exterior', v)} options={CCT_EXTERIOR_OPTIONS} />
          </div>
        </div>

        <div>
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">
            Area overrides — set only if different from interior default
          </div>
          <div className="grid grid-cols-1 gap-2">
            {CCT_INTERIOR_AREAS.map(area => {
              const current  = effectiveCCT(area.key);
              const override = isAreaOverride(area.key);
              const isSav    = !!saving[`${area.key}::${activeProjectType}::`];
              const areaSpecific = answers[`${area.key}::${activeProjectType}::`]?.answer_value;
              return (
                <div key={area.key} className={`bg-white rounded-lg border px-4 py-3 ${override ? 'border-amber-200' : 'border-slate-100'}`}>
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-semibold text-slate-700 w-44 shrink-0">{area.label}</span>
                    <div className="flex flex-wrap gap-1.5 flex-1">
                      {CCT_OPTIONS.map(cct => (
                        <button key={cct} type="button"
                          onClick={() => canEdit && !isSav && saveCCT(area.key, areaSpecific === cct ? '' : cct)}
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

  // ── Question card renderer ────────────────────────────────────────────────
  function QuestionCard({ question, sectionKey }) {
    const effectiveAnswer = getAnswer(question.key);
    const currentValue    = effectiveAnswer?.answer_value;
    const inherited       = isInherited(question.key);
    const overridden      = hasOverride(question.key);
    const isSav           = !!saving[`${question.key}::${activeProjectType}::`];

    // dependsOn check
    if (question.dependsOn) {
      const depVal = getAnswer(question.dependsOn.key)?.answer_value;
      if (depVal !== question.dependsOn.value) return null;
    }

    function handleChipClick(optValue) {
      if (!canEdit || isSav) return;
      const newVal = currentValue === optValue ? null : optValue;
      saveAnswer(question, newVal, sectionKey);
    }

    function handleToggle(checked) {
      if (!canEdit || isSav) return;
      saveAnswer(question, checked ? 'true' : 'false', sectionKey);
    }

    return (
      <div className={`bg-white rounded-xl border transition-colors ${
        currentValue != null ? 'border-slate-200' : 'border-dashed border-slate-200'
      }`}>
        {/* Card header */}
        <div className="px-4 pt-3.5 pb-2.5">
          <div className="flex items-start justify-between gap-3 mb-1">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold text-slate-800">{question.label}</span>
                {question.tags?.map(tag => (
                  <span key={tag} className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${TAG_COLORS[tag] || 'bg-slate-50 text-slate-400 border-slate-200'}`}>
                    {tag}
                  </span>
                ))}
              </div>
              {question.hint && (
                <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">{question.hint}</p>
              )}
            </div>
            <div className="shrink-0 flex items-center gap-2">
              {isSav && <span className="text-[10px] text-slate-400 italic">Saving…</span>}
              {!isSav && inherited && activeProjectType && (
                <span className="text-[10px] text-slate-400 bg-slate-50 border border-slate-200 px-1.5 py-0.5 rounded">
                  ↑ Global
                </span>
              )}
              {!isSav && overridden && (
                <span className="text-[10px] text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                  Override
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Input area */}
        <div className="px-4 pb-4">
          {question.inputType === 'CHIPS' && (
            <div className="flex flex-wrap gap-1.5">
              {question.options?.map(opt => {
                const isSelected = currentValue === opt.value;
                return (
                  <button key={opt.value} type="button"
                    onClick={() => handleChipClick(opt.value)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                      isSelected
                        ? 'bg-amber-600 text-white border-amber-600'
                        : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
                    } ${!canEdit ? 'pointer-events-none' : ''}`}>
                    {opt.label}
                  </button>
                );
              })}
              {overridden && canEdit && (
                <button type="button" onClick={() => clearOverride(question, sectionKey)}
                  className="px-2.5 py-1 text-[10px] text-slate-400 hover:text-slate-600 border border-dashed border-slate-200 rounded-full transition-colors">
                  Clear override
                </button>
              )}
            </div>
          )}

          {question.inputType === 'BOOLEAN' && (
            <div className="flex items-center justify-between py-1">
              <span className="text-xs text-slate-500">{currentValue === 'true' ? 'Yes' : currentValue === 'false' ? 'No' : 'Not set'}</span>
              <button type="button"
                onClick={() => handleToggle(currentValue !== 'true')}
                disabled={!canEdit || isSav}
                className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
                  currentValue === 'true' ? 'bg-amber-500' : 'bg-slate-200'
                }`}>
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform mt-0.5 ${
                  currentValue === 'true' ? 'translate-x-[18px]' : 'translate-x-0.5'
                }`} />
              </button>
            </div>
          )}

          {question.inputType === 'MULTI_CHIPS' && (() => {
            let selected = [];
            try { selected = currentValue ? JSON.parse(currentValue) : []; } catch { selected = []; }
            return (
              <div className="flex flex-wrap gap-1.5">
                {question.options?.map(opt => {
                  const isSelected = selected.includes(opt.value);
                  return (
                    <button key={opt.value} type="button"
                      onClick={() => {
                        if (!canEdit || isSav) return;
                        const next = isSelected
                          ? selected.filter(v => v !== opt.value)
                          : [...selected, opt.value];
                        saveAnswer(question, next.length > 0 ? JSON.stringify(next) : null, sectionKey);
                      }}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                        isSelected
                          ? 'bg-amber-600 text-white border-amber-600'
                          : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
                      } ${!canEdit ? 'pointer-events-none' : ''}`}>
                      {opt.label}
                    </button>
                  );
                })}
                {overridden && canEdit && (
                  <button type="button" onClick={() => clearOverride(question, sectionKey)}
                    className="px-2.5 py-1 text-[10px] text-slate-400 hover:text-slate-600 border border-dashed border-slate-200 rounded-full transition-colors">
                    Clear override
                  </button>
                )}
              </div>
            );
          })()}

          {question.inputType === 'TEXT' && (
            <TextAnswerInput
              question={question}
              sectionKey={sectionKey}
              currentValue={currentValue}
              canEdit={canEdit}
              isSav={isSav}
              onSave={saveAnswer}
            />
          )}
        </div>
      </div>
    );
  }

  // ── Locked view ───────────────────────────────────────────────────────────
  if (!canEdit) {
    return (
      <div className="py-16 text-center text-slate-400">
        <div className="text-3xl mb-3">🔒</div>
        <p className="text-sm font-medium text-slate-500">Standards access required</p>
        <p className="text-xs mt-1 text-slate-400">Ask an ILC admin to grant you the Client Standards Editor permission.</p>
      </div>
    );
  }

  const section = STANDARDS_SECTIONS.find(s => s.key === activeSection);
  const colors  = SECTION_COLOR_MAP[section?.color] || SECTION_COLOR_MAP.slate;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex gap-6">

      {/* ── Section sidebar ── */}
      <div className="w-56 shrink-0">
        {/* Share link */}
        {canEdit && <ShareStandardsButton clientId={clientId} />}
        {/* Overall progress */}
        <div className="mb-4 p-3 rounded-xl bg-white border border-slate-200">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Global</span>
            <span className="text-xs font-bold text-slate-700">{pct}%</span>
          </div>
          <div className="w-full h-1.5 rounded-full bg-slate-100 overflow-hidden">
            <div className="h-full rounded-full bg-amber-400 transition-all duration-300" style={{ width: `${pct}%` }} />
          </div>
          <p className="text-[10px] text-slate-400 mt-1.5">{answeredGlobal} of {totalQuestions} questions answered</p>
        </div>

        <nav className="space-y-0.5">
          {STANDARDS_SECTIONS.map(sec => {
            const c = SECTION_COLOR_MAP[sec.color] || SECTION_COLOR_MAP.slate;
            const isActive  = activeSection === sec.key;
            const { answered, total } = sectionAnsweredCount(sec.key);
            const isStub    = !sec.isCCT && total === 0;
            return (
              <button key={sec.key} onClick={() => setActiveSection(sec.key)}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-left text-xs font-medium transition-colors ${
                  isActive ? `${c.bg} ${c.text} border ${c.border}` : 'text-slate-600 hover:bg-slate-100'
                } ${isStub ? 'opacity-50' : ''}`}>
                <span className="text-sm shrink-0">{sec.icon}</span>
                <span className="flex-1 leading-snug">{sec.label}</span>
                {isStub ? (
                  <span className="text-[9px] text-slate-400 shrink-0">soon</span>
                ) : sec.isCCT ? null : (
                  <span className={`shrink-0 text-[10px] font-bold tabular-nums ${answered === total && total > 0 ? 'text-green-600' : 'text-slate-400'}`}>
                    {answered}/{total}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* ── Content area ── */}
      <div className="flex-1 min-w-0">

        {/* Section header + project type tabs */}
        <div className={`flex items-center gap-3 mb-4 px-4 py-3 rounded-xl border ${colors.bg} ${colors.border}`}>
          <span className="text-xl">{section?.icon}</span>
          <div>
            <h2 className={`text-sm font-bold ${colors.text}`}>{section?.label}</h2>
            <p className="text-[11px] text-slate-500">
              {section?.isCCT
                ? 'Color temperature per area — all interior inherits the global default'
                : section?.questions?.length > 0
                ? `${section.questions.length} question${section.questions.length !== 1 ? 's' : ''} · answers auto-save on selection`
                : 'Questions coming in a future update'}
            </p>
          </div>
        </div>

        {/* Project type tabs */}
        <div className="flex items-center gap-1 mb-5 flex-wrap">
          <button
            onClick={() => setActiveProjectType('')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
              activeProjectType === ''
                ? 'bg-slate-800 text-white border-slate-800'
                : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'
            }`}>
            Global
          </button>
          {PROJECT_TYPES.map(pt => (
            <button key={pt.value}
              onClick={() => setActiveProjectType(pt.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                activeProjectType === pt.value
                  ? 'bg-slate-800 text-white border-slate-800'
                  : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'
              }`}>
              {pt.label}
            </button>
          ))}
        </div>

        {/* Inheritance banner */}
        {activeProjectType && (
          <div className="mb-4 flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-500">
            <svg className="w-3.5 h-3.5 shrink-0 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Showing <strong className="text-slate-700">{PROJECT_TYPES.find(p => p.value === activeProjectType)?.label}</strong> — questions without overrides inherit from Global.
          </div>
        )}

        {/* Cascade toast */}
        {cascadeToast && (
          <div className="mb-4 flex items-center gap-2 px-3 py-2 rounded-lg bg-purple-50 border border-purple-200 text-xs text-purple-700">
            <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <strong>{cascadeToast.count} field{cascadeToast.count !== 1 ? 's' : ''} auto-filled</strong> from "{cascadeToast.label}" cascade
          </div>
        )}

        {/* CCT section */}
        {section?.isCCT && <CCTSection />}

        {/* Stub sections */}
        {!section?.isCCT && section?.questions?.length === 0 && (
          section?.subsections?.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs text-slate-400 mb-4">Questions coming in a future update — planned subsections:</p>
              {section.subsections.map(sub => (
                <div key={sub} className="flex items-center gap-3 px-4 py-3 rounded-xl border border-dashed border-slate-200 text-sm text-slate-500">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-300 shrink-0" />
                  {sub}
                </div>
              ))}
            </div>
          ) : (
            <div className="py-16 text-center text-slate-400 border-2 border-dashed border-slate-200 rounded-xl">
              <div className="text-3xl mb-2">🚧</div>
              <p className="text-sm font-medium text-slate-500">Questions coming soon</p>
              <p className="text-xs mt-1">This section is in the next build iteration.</p>
            </div>
          )
        )}

        {/* Question cards */}
        {!section?.isCCT && section?.questions?.length > 0 && (
          <div className="space-y-3">
            {section.questions.map(q => (
              <QuestionCard key={q.key} question={q} sectionKey={section.key} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Project Data Tab ──────────────────────────────────────────────────────────
function StatCard({ label, value, small }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 px-4 py-4 text-center">
      <div className={`font-bold text-slate-800 ${small ? 'text-xl' : 'text-2xl'}`}>{value}</div>
      <div className="text-xs text-slate-400 mt-0.5 font-medium">{label}</div>
    </div>
  );
}

function ProjectDataTab({ clientId }) {
  const [rows, setRows] = useState(null);

  useEffect(() => {
    fetch(`/api/clients/${clientId}/project-stats`)
      .then(r => r.json())
      .then(d => setRows(d.rows || []))
      .catch(() => setRows([]));
  }, [clientId]);

  if (rows === null) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-slate-400">
        <Spinner className="w-5 h-5 mr-2" /> Crunching project data…
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="py-16 text-center text-slate-400 border-2 border-dashed border-slate-200 rounded-xl">
        <div className="text-3xl mb-2">📊</div>
        <p className="text-sm font-medium text-slate-500">No project data yet</p>
        <p className="text-xs mt-1">Link projects with budgets to this client to see averages here.</p>
      </div>
    );
  }

  const sum        = (k) => rows.reduce((n, r) => n + (r[k] || 0), 0);
  const totalUnits = sum('units');
  const totalSf    = sum('grossSf');
  const grandTotal = sum('total');
  const money      = (n) => n ? '$' + Math.round(n).toLocaleString() : '—';
  const perUnitAvg = (k) => totalUnits ? sum(k) / totalUnits : 0;

  const byType = {};
  for (const r of rows) {
    const t = r.buildingType || 'unknown';
    const g = byType[t] || (byType[t] = { count: 0, units: 0, sf: 0, total: 0 });
    g.count++; g.units += r.units; g.sf += r.grossSf; g.total += r.total;
  }
  const typeRows = Object.entries(byType).map(([type, g]) => ({
    type, count: g.count, units: g.units,
    perUnit: g.units ? g.total / g.units : 0,
    perSf:   g.sf    ? g.total / g.sf    : 0,
  }));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Projects"    value={rows.length} />
        <StatCard label="Total units" value={totalUnits.toLocaleString()} />
        <StatCard label="Avg $/unit"  value={money(totalUnits ? grandTotal / totalUnits : 0)} />
        <StatCard label="Avg $/SF"    value={totalSf ? '$' + (grandTotal / totalSf).toFixed(2) : '—'} />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100"><h3 className="text-sm font-semibold text-slate-800">By building type</h3></div>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              <th className="px-5 py-2.5 text-left">Building type</th>
              <th className="px-4 py-2.5 text-right">Projects</th>
              <th className="px-4 py-2.5 text-right">Units</th>
              <th className="px-4 py-2.5 text-right">Avg $/unit</th>
              <th className="px-4 py-2.5 text-right">Avg $/SF</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {typeRows.map(tr => (
              <tr key={tr.type}>
                <td className="px-5 py-2.5 font-medium text-slate-800">{buildingTypeLabel(tr.type)}</td>
                <td className="px-4 py-2.5 text-right text-slate-600">{tr.count}</td>
                <td className="px-4 py-2.5 text-right text-slate-600">{tr.units.toLocaleString()}</td>
                <td className="px-4 py-2.5 text-right font-semibold text-slate-800">{money(tr.perUnit)}</td>
                <td className="px-4 py-2.5 text-right text-slate-600">{tr.perSf ? '$' + tr.perSf.toFixed(2) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h3 className="text-sm font-semibold text-slate-800 mb-3">Average per unit</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <StatCard label="Ceiling fans / unit"      value={perUnitAvg('numFans').toFixed(2)} small />
          <StatCard label="Accent downlights / unit" value={perUnitAvg('numAccent').toFixed(2)} small />
          <StatCard label="Vanities / unit"          value={perUnitAvg('numVanities').toFixed(2)} small />
          <StatCard label="Bathrooms / unit"         value={perUnitAvg('numBathrooms').toFixed(2)} small />
          <StatCard label="Balconies / unit"         value={perUnitAvg('numBalconies').toFixed(2)} small />
        </div>
      </div>

      <p className="text-[11px] text-slate-400">
        Weighted by unit count across {rows.length} linked project{rows.length !== 1 ? 's' : ''} with budget data.
      </p>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function ClientDetailClient({ client: initial, availableProjects, relatedProjects = [], user, canEditStandards = false, initialStandardsAnswers = [], canEditPlaybook = false }) {
  const [client,    setClient]    = useState(initial);
  const [available, setAvailable] = useState(availableProjects);
  const [activeTab, setActiveTab] = useState('overview');
  const [saveError, setSaveError] = useState('');

  const clientIdLabel = client.clientNumber
    ? `CLT-${String(client.clientNumber).padStart(4, '0')}`
    : null;

  async function refreshClient() {
    const res  = await fetch(`/api/clients/${client.id}`);
    const data = await res.json();
    setClient(data.client);
  }

  // One field at a time, saved the moment it is changed — Mike, 2026-09-09:
  // no pop-out and no Save button on the client info screen. The change shows
  // straight away and is put back if the save fails, so the screen never shows
  // something the database does not have.
  //
  // Trap: PATCH /api/clients/[id] returns the client's own columns and its tags
  // — NOT projects, contacts, owner or createdBy. Dropping the whole response
  // in would wipe those off the screen, so only the columns the server may have
  // worked out for itself are taken back.
  async function patchClient(patch) {
    const previous = client;
    setSaveError('');
    setClient(c => ({ ...c, ...patch }));
    try {
      const res = await fetch(`/api/clients/${client.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setClient(previous);
        setSaveError(d.error || 'That change could not be saved.');
        return false;
      }
      const data = await res.json();
      if (data.client) {
        setClient(c => ({
          ...c,
          type:            data.client.type,
          name:            data.client.name,
          developerType:   data.client.developerType,
          projectsPerYear: data.client.projectsPerYear,
          tagLinks:        data.client.tagLinks ?? c.tagLinks,
          // The owner's name in the top bar has to follow the dropdown, and the
          // save route does not send the person back.
          owner: patch.ownerId === undefined
            ? c.owner
            : (patch.ownerId ? c.owner : null),
        }));
      }
      // A new salesperson is the one thing the page cannot fill in on its own.
      if (patch.ownerId) refreshClient();
      return true;
    } catch {
      setClient(previous);
      setSaveError('That change could not be saved — check the connection.');
      return false;
    }
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
              <a href={`/api/clients/${client.id}/export`}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
                title="Export Standards + Playbook to Excel">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 10.5v6m0 0l-2.25-2.25M12 16.5l2.25-2.25M3 12a9 9 0 1018 0 9 9 0 00-18 0z" /></svg>
                Export Excel
              </a>
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
                {t.id === 'projects'  && (client.projects?.length > 0 || relatedProjects.length > 0) && (
                  <span className="ml-1.5 text-[10px] font-bold text-slate-400">
                    {client.projects?.length || 0}
                    {relatedProjects.length > 0 && <span className="text-slate-300"> +{relatedProjects.length}</span>}
                  </span>
                )}
                {t.id === 'playbook'  && !canEditPlaybook                 && <span className="ml-1.5 text-[10px] text-slate-300">🔒</span>}
                {t.id === 'standards' && !canEditStandards                && <span className="ml-1.5 text-[10px] text-slate-300">🔒</span>}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Tab content ── */}
      <div className="max-w-6xl mx-auto px-6 py-6">
        {saveError && (
          <div className="mb-4 rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-sm text-red-600">{saveError}</div>
        )}
        {activeTab === 'overview'  && <OverviewTab client={client} onPatch={patchClient} />}
        {activeTab === 'people'    && <PeopleTab contacts={client.contacts || []} clientId={client.id} onContactsChange={(contacts) => setClient(c => ({ ...c, contacts }))} />}
        {activeTab === 'playbook'  && (
          <PlaybookTab
            clientId={client.id}
            clientName={client.name}
            contacts={client.contacts || []}
            canEdit={canEditPlaybook}
          />
        )}
        {activeTab === 'projects'  && (
          <ProjectsTab client={client} available={available} related={relatedProjects} onRefresh={refreshClient} />
        )}
        {activeTab === 'projectData' && <ProjectDataTab clientId={client.id} />}
        {activeTab === 'pipeline' && <PipelineTab clientId={client.id} canEdit={canEditPlaybook} />}
        {activeTab === 'standards' && (
          <ClientStandardsTab
            clientId={client.id}
            initialAnswers={initialStandardsAnswers}
            canEdit={canEditStandards}
          />
        )}
        {activeTab === 'productOptions' && (
          <ProductOptionsTab clientId={client.id} canEdit={canEditStandards} />
        )}
        {activeTab === 'fixtureSchedule' && (
          <StandardFixtureScheduleTab clientId={client.id} canEdit={canEditStandards} />
        )}
      </div>

    </div>
  );
}
