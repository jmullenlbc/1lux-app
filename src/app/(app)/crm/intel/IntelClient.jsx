'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { CARD, INPUT, BTN_COMPACT, HELPER } from '@/components/ui/tokens';
import { FilterToolbar, FilterPanel } from '@/components/ui/FilterPanel';

const STATUS_FIELD = [{ key: 'status', label: 'Show', kind: 'pick' }];
const STATUS_CHOICES = { status: [['confirmed', 'Verified only']] };

function initials(name) {
  if (!name) return '?';
  return name.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2);
}
function avatarColor(name) {
  if (!name) return 'bg-slate-400';
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  const colors = ['bg-orange-500','bg-amber-500','bg-sky-500','bg-indigo-500','bg-green-500','bg-teal-500','bg-violet-500','bg-red-500'];
  return colors[Math.abs(h) % colors.length];
}
function fmt(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Inline contact link picker (mirrors the one on the Notes screen).
function ContactLinkPicker({ initialQuery, linked, onPick, onUnlink, onClose }) {
  const [q, setQ] = useState(initialQuery || '');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const ref = useRef(null);
  const deb = useRef(null);

  useEffect(() => {
    function h(e) { if (ref.current && !ref.current.contains(e.target)) onClose(); }
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [onClose]);

  useEffect(() => {
    clearTimeout(deb.current);
    if (!q.trim()) { setResults([]); return; }
    deb.current = setTimeout(async () => {
      setSearching(true);
      try {
        const r = await fetch(`/api/crm/contacts?search=${encodeURIComponent(q)}`);
        if (r.ok) { const d = await r.json(); setResults((d.contacts || d || []).slice(0, 8)); }
      } catch {}
      setSearching(false);
    }, 250);
    return () => clearTimeout(deb.current);
  }, [q]);

  return (
    <div ref={ref} className="absolute z-50 mt-1 left-0 w-64 rounded-lg shadow-xl border border-slate-200 bg-white overflow-hidden">
      <div className="p-2 border-b border-slate-100">
        <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Search CRM contacts…"
          className={`${INPUT} text-xs px-2 py-1.5`} />
      </div>
      <div className="max-h-44 overflow-y-auto">
        {searching && <div className="px-3 py-2 text-[11px] text-slate-500">Searching...</div>}
        {!searching && q && results.length === 0 && <div className="px-3 py-2 text-[11px] text-slate-500">No matches</div>}
        {results.map(c => (
          <button key={c.id} onClick={() => { onPick(c); onClose(); }}
            className="w-full text-left px-3 py-1.5 flex items-center gap-2 hover:bg-orange-50 transition-colors">
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-white text-[11px] font-bold shrink-0 ${avatarColor(c.name)}`}>{initials(c.name)}</span>
            <span className="min-w-0">
              <span className="block text-xs text-slate-800 font-semibold truncate">{c.name}</span>
              {c.company?.name && <span className="block text-[11px] text-slate-500 truncate">{c.company.name}</span>}
            </span>
          </button>
        ))}
      </div>
      {linked && (
        <div className="p-2 border-t border-slate-100">
          <button onClick={() => { onUnlink(); onClose(); }} className="text-[11px] text-red-600 hover:text-red-700">Unlink contact</button>
        </div>
      )}
    </div>
  );
}

function IntelCard({ item, onPatch }) {
  const [linking, setLinking] = useState(false);
  const confirmed = item.status === 'CONFIRMED' || item.status === 'DONE';
  const person = item.contactName || item.targetName;

  return (
    <div className={`rounded-xl border shadow-sm px-4 py-3 ${confirmed ? 'border-green-200 bg-green-50/60' : CARD}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm text-slate-800">{item.detail || item.rawText}</p>
          <div className="flex items-center gap-2 flex-wrap mt-2">
            {person && (
              <span className="relative inline-flex">
                <button type="button" onClick={() => setLinking(v => !v)}
                  title={item.contactId ? 'Linked to a CRM contact. Click to change.' : 'Not linked. Click to link a CRM contact.'}
                  className={`inline-flex items-center gap-1 pl-0.5 pr-1.5 py-0.5 rounded-full text-[11px] border transition-colors ${
                    item.contactId ? 'bg-white border-slate-200 text-slate-700 hover:border-orange-400'
                                   : 'bg-white border-dashed border-slate-300 text-slate-500 hover:border-orange-400 hover:text-orange-700'}`}>
                  <span className={`w-4 h-4 rounded-full flex items-center justify-center text-white text-[8px] font-bold shrink-0 ${item.contactId ? avatarColor(person) : 'bg-slate-300'}`}>{initials(person)}</span>
                  <span>{person}</span>
                  {item.contactId ? <span className="text-green-600">✓</span> : <span className="text-slate-400">↗</span>}
                </button>
                {linking && (
                  <ContactLinkPicker initialQuery={person} linked={!!item.contactId}
                    onPick={c => onPatch(item, { contactId: c.id, contactName: c.name, company: c.company?.name || item.company || '' })}
                    onUnlink={() => onPatch(item, { contactId: '' })}
                    onClose={() => setLinking(false)} />
                )}
              </span>
            )}
            {item.company && <span className="text-[11px] text-slate-500">· {item.company}</span>}
            {item.note && <span className="text-[11px] text-slate-500">Note #{item.note.noteNumber}{item.note.title ? `, ${item.note.title}` : ''}</span>}
            <span className="text-[11px] text-slate-500 tabular-nums">{fmt(item.createdAt)}</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {!confirmed
            ? <button onClick={() => onPatch(item, { status: 'CONFIRMED' })} title="Confirm as verified knowledge"
                className={`${BTN_COMPACT} border-green-200 text-green-700 bg-green-50 hover:bg-green-100`}>Confirm</button>
            : <span className="text-[11px] font-semibold px-2 py-1 rounded-lg bg-green-50 text-green-700 border border-green-200">✓ Verified</span>}
          <button onClick={() => onPatch(item, { status: 'DISMISSED' })} title="Dismiss"
            className="text-slate-600 hover:text-red-600 hover:bg-slate-100 rounded-lg text-sm px-1.5 py-0.5">✕</button>
        </div>
      </div>
    </div>
  );
}

export default function IntelClient() {
  const [items, setItems] = useState(null);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('active'); // active | confirmed
  const [filtersOpen, setFiltersOpen] = useState(false);
  const debRef = useRef(null);

  const load = useCallback(async (query, st) => {
    const sp = new URLSearchParams();
    if (query) sp.set('q', query);
    if (st === 'confirmed') sp.set('status', 'CONFIRMED');
    try {
      const r = await fetch(`/api/crm/intel?${sp.toString()}`);
      const d = await r.json();
      setItems(d.items || []);
    } catch { setItems([]); }
  }, []);

  useEffect(() => { load('', 'active'); }, [load]);

  useEffect(() => {
    clearTimeout(debRef.current);
    debRef.current = setTimeout(() => load(q, status), 250);
    return () => clearTimeout(debRef.current);
  }, [q, status, load]);

  async function patch(item, fields) {
    // Optimistic-ish: re-load after patch.
    await fetch(`/api/crm/notes/${item.note.id}/actions`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actionId: item.id, ...fields }),
    }).catch(() => {});
    load(q, status);
  }

  return (
    <div>
      <p className="text-xs text-slate-500">
        Facts the bot pulled from your notes: who does what, where, and for whom. Search across everything,
        link a fact to its CRM contact, and confirm the ones worth keeping.
      </p>

      <div className="flex flex-wrap items-center gap-3 mt-3 mb-4">
        <div className="relative flex-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 15.803a7.5 7.5 0 0010.607 0z" /></svg>
          </span>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search intel by person, company, or keyword…"
            className={`${INPUT} pl-9`} />
        </div>
        <FilterToolbar count={status === 'confirmed' ? 1 : 0} open={filtersOpen} onToggle={() => setFiltersOpen(o => !o)}
          onClear={() => setStatus('active')} />
        <FilterPanel open={filtersOpen} fields={STATUS_FIELD} filters={{ status: status === 'confirmed' ? 'confirmed' : '' }}
          choices={STATUS_CHOICES} onChange={(_, v) => setStatus(v || 'active')} className="basis-full mt-0" />
      </div>

      {items === null ? (
        <p className="text-sm text-slate-500 py-10 text-center">Loading...</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-slate-500 py-10 text-center">
          {q ? 'No intel matches your search.' : 'No intel yet. It appears on its own as the bot reads your published notes.'}
        </p>
      ) : (
        <div className="space-y-2">
          <p className={HELPER}>{items.length} item{items.length !== 1 ? 's' : ''}</p>
          {items.map(it => <IntelCard key={it.id} item={it} onPatch={patch} />)}
        </div>
      )}
    </div>
  );
}
