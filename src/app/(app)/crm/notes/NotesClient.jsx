'use client';
import { useState, useRef, useCallback, useEffect } from 'react';

// ── Contact tag chip + inline link picker ────────────────────────────────────
function ContactChip({ name, linked, onClick }) {
  return (
    <button type="button" onClick={onClick} title={linked ? 'Linked to a CRM contact — click to change' : 'Not linked — click to link a CRM contact'}
      className={`inline-flex items-center gap-1 pl-0.5 pr-1.5 py-0.5 rounded-full text-[11px] border transition-colors ${
        linked
          ? 'bg-white border-slate-200 text-slate-700 hover:border-amber-400'
          : 'bg-white border-dashed border-slate-300 text-slate-500 hover:border-amber-400 hover:text-amber-700'
      }`}>
      <span className={`w-4 h-4 rounded-full flex items-center justify-center text-white text-[8px] font-bold shrink-0 ${linked ? avatarColor(name) : 'bg-slate-300'}`}>
        {initials(name)}
      </span>
      <span>{name}</span>
      {linked
        ? <span className="text-emerald-600" title="Linked">✓</span>
        : <span className="text-slate-400" title="Unlinked">↗</span>}
    </button>
  );
}

function ContactLinkPicker({ initialQuery, defaultCompany, linked, onPick, onUnlink, onClose }) {
  const [q, setQ] = useState(initialQuery || '');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: initialQuery || '', email: '', company: defaultCompany || '' });
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState('');
  const ref = useRef(null);
  const deb = useRef(null);

  useEffect(() => {
    function h(e) { if (ref.current && !ref.current.contains(e.target)) onClose(); }
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [onClose]);

  useEffect(() => {
    clearTimeout(deb.current);
    if (adding || !q.trim()) { setResults([]); return; }
    deb.current = setTimeout(async () => {
      setSearching(true);
      try {
        const r = await fetch(`/api/crm/contacts?search=${encodeURIComponent(q)}`);
        if (r.ok) { const d = await r.json(); setResults((d.contacts || d || []).slice(0, 8)); }
      } catch {}
      setSearching(false);
    }, 250);
    return () => clearTimeout(deb.current);
  }, [q, adding]);

  async function createContact() {
    if (!form.name.trim()) { setErr('Name is required.'); return; }
    setCreating(true); setErr('');
    try {
      const r = await fetch('/api/crm/contacts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: form.name.trim(), email: form.email.trim() || null, company: form.company.trim() || null }),
      });
      const c = await r.json();
      if (!r.ok) { setErr(c.error || 'Could not create'); setCreating(false); return; }
      onPick(c); onClose();
    } catch { setErr('Network error'); }
    setCreating(false);
  }

  const cls = 'w-full bg-slate-50 text-xs text-slate-900 rounded px-2 py-1.5 outline-none placeholder:text-slate-400 focus:bg-white border border-transparent focus:border-amber-400';

  return (
    <div ref={ref} className="absolute z-50 mt-1 left-0 w-64 rounded-lg shadow-xl border border-slate-200 bg-white overflow-hidden">
      {!adding ? (
        <>
          <div className="p-2 border-b border-slate-100">
            <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Search CRM contacts…" className={cls} />
          </div>
          <div className="max-h-44 overflow-y-auto">
            {searching && <div className="px-3 py-2 text-[11px] text-slate-400">Searching…</div>}
            {!searching && q && results.length === 0 && <div className="px-3 py-2 text-[11px] text-slate-400">No matches</div>}
            {results.map(c => (
              <button key={c.id} onClick={() => { onPick(c); onClose(); }}
                className="w-full text-left px-3 py-1.5 flex items-center gap-2 hover:bg-amber-50 transition-colors">
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-white text-[9px] font-bold shrink-0 ${avatarColor(c.name)}`}>{initials(c.name)}</span>
                <span className="min-w-0">
                  <span className="block text-xs text-slate-800 font-medium truncate">{c.name}</span>
                  {c.company?.name && <span className="block text-[10px] text-slate-400 truncate">{c.company.name}</span>}
                </span>
              </button>
            ))}
          </div>
          <div className="p-2 border-t border-slate-100 flex items-center justify-between">
            <button onClick={() => { setForm({ name: q || initialQuery || '', email: '', company: defaultCompany || '' }); setAdding(true); }}
              className="text-[11px] text-amber-700 hover:text-amber-800 font-medium">+ Add new contact</button>
            {linked && <button onClick={() => { onUnlink(); onClose(); }} className="text-[11px] text-rose-600 hover:text-rose-700">Unlink</button>}
          </div>
        </>
      ) : (
        <div className="p-2 space-y-1.5">
          <div className="text-[11px] font-semibold text-slate-700 px-0.5">New contact</div>
          <input autoFocus value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Full name" className={cls} />
          <input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="Email" className={cls} />
          <input value={form.company} onChange={e => setForm({ ...form, company: e.target.value })} placeholder="Company (optional)" className={cls} />
          {err && <p className="text-[11px] text-rose-600">{err}</p>}
          <div className="flex items-center gap-2 pt-0.5">
            <button onClick={createContact} disabled={creating}
              className="text-[11px] font-semibold px-2 py-1 rounded bg-amber-500 text-white hover:bg-amber-400 disabled:opacity-50">{creating ? 'Adding…' : 'Add & link'}</button>
            <button onClick={() => setAdding(false)} className="text-[11px] text-slate-500 hover:text-slate-700">Back</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── AI action items (extracted from the note prose) ──────────────────────────
function ActionRow({ a, onPatch, intel, types }) {
  const confirmed = a.status === 'CONFIRMED' || a.status === 'DONE';
  const [editing, setEditing] = useState(false);
  const [linking, setLinking] = useState(false);
  const [f, setF] = useState({ detail: a.detail || a.rawText || '', contactName: a.contactName || '', targetName: a.targetName || '', company: a.company || '' });
  const inputCls = 'w-full bg-white border border-slate-200 rounded px-2 py-1 text-xs text-slate-900 placeholder:text-slate-500 outline-none focus:border-amber-500';

  const typeList = types && types.length ? types : [{ key: a.type, label: a.type }];
  const typeDef  = typeList.find(t => t.key === a.type);
  const isIntro  = typeDef?.executor === 'EXPECT_INTRO';
  const waitDays = a.reminderDays ?? typeDef?.reminderDays ?? null;

  function save() { onPatch(a.id, { detail: f.detail, contactName: f.contactName, targetName: f.targetName, company: f.company }); setEditing(false); }

  return (
    <div className={`rounded-lg border px-3 py-2 ${confirmed ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 bg-slate-100'}`}>
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <select value={a.type} onChange={e => onPatch(a.id, { type: e.target.value })}
              className="text-[11px] font-semibold bg-white border border-slate-200 rounded px-1.5 py-0.5 text-amber-700 outline-none">
              {typeList.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
              {!typeList.some(t => t.key === a.type) && <option value={a.type}>{a.type}</option>}
            </select>
            {!editing && (
              <span className="relative inline-flex">
                {a.contactName ? (
                  <ContactChip name={a.contactName} linked={!!a.contactId} onClick={() => setLinking(v => !v)} />
                ) : (
                  <button type="button" onClick={() => setLinking(v => !v)}
                    className="text-[11px] text-slate-400 hover:text-amber-700 border border-dashed border-slate-300 rounded-full px-2 py-0.5">＋ link person</button>
                )}
                {linking && (
                  <ContactLinkPicker
                    initialQuery={a.contactName || ''}
                    defaultCompany={a.company || ''}
                    linked={!!a.contactId}
                    onPick={c => onPatch(a.id, { contactId: c.id, contactName: c.name, company: (typeof c.company === 'string' ? c.company : c.company?.name) || a.company || '' })}
                    onUnlink={() => onPatch(a.id, { contactId: '' })}
                    onClose={() => setLinking(false)}
                  />
                )}
              </span>
            )}
            {!editing && a.targetName && <span className="text-[11px] text-slate-500">→ {a.targetName}</span>}
            {!editing && a.company && <span className="text-[11px] text-slate-500">· {a.company}</span>}
            {!editing && isIntro && (
              <span className="text-[11px] text-emerald-600" title="Bot reminds if the intro hasn't happened by then">
                ⏰ remind in {waitDays ?? '—'}d
              </span>
            )}
          </div>

          {!editing ? (
            <p className="text-xs text-slate-500 mt-0.5">{a.detail || a.rawText}</p>
          ) : (
            <div className="mt-2 space-y-1.5">
              <input value={f.detail} onChange={e => setF({ ...f, detail: e.target.value })} placeholder="Description" className={inputCls} />
              <div className="grid grid-cols-3 gap-1.5">
                <input value={f.contactName} onChange={e => setF({ ...f, contactName: e.target.value })} placeholder="Person" className={inputCls} />
                <input value={f.targetName} onChange={e => setF({ ...f, targetName: e.target.value })} placeholder="Target" className={inputCls} />
                <input value={f.company} onChange={e => setF({ ...f, company: e.target.value })} placeholder="Company" className={inputCls} />
              </div>
              {isIntro && (
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-slate-500 whitespace-nowrap">Remind after</span>
                  <input type="number" min="0" defaultValue={a.reminderDays ?? ''}
                    placeholder={typeDef?.reminderDays != null ? String(typeDef.reminderDays) : 'days'}
                    onBlur={e => onPatch(a.id, { reminderDays: e.target.value })}
                    className={inputCls + ' w-20'} />
                  <span className="text-[11px] text-slate-500">days {a.reminderDays == null && typeDef?.reminderDays != null ? `(default ${typeDef.reminderDays})` : '(override)'}</span>
                </div>
              )}
              <div className="flex gap-2">
                <button onClick={save} className="text-[11px] font-semibold px-2 py-0.5 rounded bg-amber-500 text-white hover:bg-amber-400">Save</button>
                <button onClick={() => setEditing(false)} className="text-[11px] px-2 py-0.5 rounded text-slate-500 hover:text-slate-700">Cancel</button>
              </div>
            </div>
          )}
        </div>

        {!editing && (
          <div className="flex items-center gap-1.5 shrink-0">
            <button onClick={() => setEditing(true)} className="text-slate-500 hover:text-slate-600 text-xs" title="Edit">✎</button>
            {!intel && !confirmed && <button onClick={() => onPatch(a.id, { status: 'CONFIRMED' })} className="text-emerald-600 hover:text-emerald-300 text-sm" title="Confirm">✓</button>}
            <button onClick={() => onPatch(a.id, { status: 'DISMISSED' })} className="text-slate-500 hover:text-rose-400 text-sm" title="Dismiss">✕</button>
          </div>
        )}
      </div>
    </div>
  );
}

const OUTREACH_METHODS = new Set(['EMAIL', 'SEND_MATERIALS', 'SCHEDULE']);

function NoteActions({ noteId, noteBody, published }) {
  const [actions, setActions] = useState(null);
  const [types, setTypes] = useState([]);
  const [busy, setBusy] = useState(false);
  const bodyRef          = useRef(noteBody);
  const lastExtractedRef = useRef(null);
  const timerRef         = useRef(null);
  bodyRef.current = noteBody;

  // Load the admin-controlled taxonomy once (for the dropdown + reminder defaults).
  useEffect(() => {
    fetch('/api/crm/note-action-types?active=1')
      .then(r => r.json()).then(d => setTypes(d.types || [])).catch(() => {});
  }, []);

  async function fetchActions() {
    try { const r = await fetch(`/api/crm/notes/${noteId}/actions`); const d = await r.json(); return d.actions || []; }
    catch { return []; }
  }
  async function runExtract() {
    setBusy(true);
    lastExtractedRef.current = (bodyRef.current || '').trim();
    try { const r = await fetch(`/api/crm/notes/${noteId}/actions`, { method: 'POST' }); const d = await r.json(); setActions(d.actions || []); }
    catch {} finally { setBusy(false); }
  }
  async function patch(actionId, fields) {
    await fetch(`/api/crm/notes/${noteId}/actions`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ actionId, ...fields }) }).catch(() => {});
    setActions(await fetchActions());
  }

  // Initial load; auto-extract if the note has prose but no actions yet.
  useEffect(() => {
    let alive = true;
    (async () => {
      const a = await fetchActions();
      if (!alive) return;
      setActions(a);
      lastExtractedRef.current = (bodyRef.current || '').trim();
      if ((bodyRef.current || '').trim() && a.length === 0) runExtract();
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId]);

  // Auto re-extract a few seconds after edits settle (no button needed).
  useEffect(() => {
    if (actions === null) return;
    const b = (noteBody || '').trim();
    if (!b || b === lastExtractedRef.current) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(runExtract, 6000);
    return () => clearTimeout(timerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteBody, actions]);

  if (actions === null) return null;
  const visible = actions.filter(a => a.status !== 'DISMISSED');
  const acts    = visible.filter(a => a.kind === 'ACTION');
  const intel   = visible.filter(a => a.kind === 'INTEL');

  // Confirmed outreach asks grouped by contact — one consolidated email each
  // (drafted automatically on confirm). Asks without a linked contact can't be
  // emailed yet, so they're surfaced as "link a contact" prompts.
  const execOf = key => types.find(t => t.key === key)?.executor;
  const outreach = acts.filter(a => a.status === 'CONFIRMED' && OUTREACH_METHODS.has(execOf(a.type)));
  const groups = [];
  for (const a of outreach) {
    const k = a.contactId || `name:${a.contactName || a.id}`;
    let g = groups.find(x => x.key === k);
    if (!g) { g = { key: k, contactId: a.contactId, name: a.contactName || 'contact', items: [], drafted: false }; groups.push(g); }
    g.items.push(a);
    if (a.botDraftId) g.drafted = true;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="text-xs font-medium text-slate-500">Action items <span className="text-slate-600">(AI · automatic)</span></label>
        {busy
          ? <span className="text-xs text-slate-500">Reading note…</span>
          : <button onClick={runExtract} className="text-xs text-slate-500 hover:text-amber-600" title="Re-extract now">↻</button>}
      </div>
      {visible.length === 0 ? (
        <p className="text-xs text-slate-600">{busy ? 'Reading your note…' : 'Action items appear here automatically as you write.'}</p>
      ) : (
        <div className="space-y-2">
          {acts.map(a => <ActionRow key={a.id} a={a} onPatch={patch} types={types} />)}
          {intel.length > 0 && <div className="text-[10px] uppercase tracking-wide text-slate-500 pt-1">Intel</div>}
          {intel.map(a => <ActionRow key={a.id} a={a} onPatch={patch} intel types={types} />)}
        </div>
      )}

      {/* Consolidated outreach — one email per contact, drafted automatically */}
      {groups.length > 0 && (
        <div className="mt-3 pt-3 border-t border-slate-200">
          <label className="text-xs font-medium text-slate-500">Outreach <span className="text-slate-400">(one email per person, all their items)</span></label>
          <div className="mt-1.5 space-y-1.5">
            {groups.map(g => (
              <div key={g.key} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5">
                <span className="text-xs text-slate-600 min-w-0 truncate">
                  <span className="font-medium text-slate-800">{g.name}</span> · {g.items.length} item{g.items.length !== 1 ? 's' : ''}
                  <span className="text-slate-400"> ({g.items.map(i => i.detail || i.rawText).join('; ').slice(0, 60)})</span>
                </span>
                {!g.contactId
                  ? <span className="shrink-0 text-[11px] text-amber-600">link a contact to email</span>
                  : g.drafted
                    ? <span className="shrink-0 text-[11px] font-medium text-emerald-700">✉ 1 email drafted</span>
                    : published
                      ? <span className="shrink-0 text-[11px] text-slate-400">drafting…</span>
                      : <span className="shrink-0 text-[11px] text-slate-400">✉ on publish</span>}
              </div>
            ))}
          </div>
          <p className="text-[10px] text-slate-400 mt-1.5">
            {published ? 'Drafts land in the Bot Queue for your review.' : 'The bot drafts these once you publish the note.'}
          </p>
        </div>
      )}
    </div>
  );
}

// ── Activity meta ─────────────────────────────────────────────────────────────

const ACTIVITY_META = {
  COFFEE:     { emoji: '☕', label: 'Coffee',      color: 'bg-amber-50 text-amber-700 border-amber-200',    inPerson: true },
  MEAL:       { emoji: '🍽', label: 'Meal',        color: 'bg-orange-50 text-orange-700 border-orange-200',  inPerson: true },
  LUNCH:      { emoji: '🍽', label: 'Meal',        color: 'bg-orange-50 text-orange-700 border-orange-200',  inPerson: true, legacy: true },  // notes written before the rename
  TRAVEL:     { emoji: '✈️', label: 'Travel',      color: 'bg-sky-50 text-sky-700 border-sky-200',           inPerson: false },
  HAPPY_HOUR: { emoji: '🍺', label: 'Happy Hour',  color: 'bg-yellow-50 text-yellow-700 border-yellow-200',  inPerson: true },
  GOLF:       { emoji: '⛳', label: 'Golf',         color: 'bg-green-50 text-green-700 border-green-200',     inPerson: true },
  SITE_VISIT: { emoji: '🏗', label: 'Site Visit',  color: 'bg-blue-50 text-blue-700 border-blue-200',        inPerson: true },
  CALL:       { emoji: '📞', label: 'Call',         color: 'bg-slate-100 text-slate-600 border-slate-200',    inPerson: false },
  EMAIL:      { emoji: '📧', label: 'Email',        color: 'bg-slate-100 text-slate-600 border-slate-200',    inPerson: false },
  EVENT:      { emoji: '🎉', label: 'Event',        color: 'bg-purple-50 text-purple-700 border-purple-200',  inPerson: false },
  OTHER:      { emoji: '📋', label: 'Other',        color: 'bg-slate-100 text-slate-500 border-slate-200',    inPerson: false },
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function fmtInput(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toISOString().slice(0, 10);
}
function initials(name) {
  if (!name) return '?';
  return name.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2);
}
function avatarColor(name) {
  if (!name) return 'bg-slate-400';
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  const colors = [
    'bg-orange-500', 'bg-amber-500', 'bg-blue-500', 'bg-indigo-500',
    'bg-emerald-500', 'bg-teal-500', 'bg-violet-500', 'bg-rose-500',
  ];
  return colors[Math.abs(h) % colors.length];
}
function pipelineBadge(pipeline) {
  if (pipeline === 'PROCUREMENT') return <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-blue-100 text-blue-700">Proc</span>;
  if (pipeline === 'DESIGN')      return <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-purple-100 text-purple-700">Design</span>;
  return null;
}

// ── Icons ────────────────────────────────────────────────────────────────────

function IconPlus() {
  return <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>;
}
function IconSearch() {
  return <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 15.803a7.5 7.5 0 0010.607 0z" /></svg>;
}
function IconX() {
  return <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>;
}
function IconCalendar() {
  return <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 9v7.5m-9-6h.008v.008H12v-.008zM12 15h.008v.008H12V15zm0 2.25h.008v.008H12v-.008zM9.75 15h.008v.008H9.75V15zm0 2.25h.008v.008H9.75v-.008zM7.5 15h.008v.008H7.5V15zm0 2.25h.008v.008H7.5v-.008zm6.75-4.5h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V15zm0 2.25h.008v.008h-.008v-.008zm2.25-4.5h.008v.008H16.5v-.008zm0 2.25h.008v.008H16.5V15z" /></svg>;
}
function IconNote() {
  return <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>;
}

// ── NoteCard ─────────────────────────────────────────────────────────────────

function NoteCard({ note, active, onClick }) {
  const linkedClients  = note.clients?.map(nc => nc.client?.name).filter(Boolean).join(', ');
  const linkedProjects = note.projects?.length || 0;

  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-3 border-b transition-colors ${
        active
          ? 'bg-amber-50 border-l-2 border-l-amber-500'
          : 'hover:bg-slate-100 border-l-2 border-l-transparent'
      }`}
      style={{ borderBottomColor: '#e2e8f0' }}
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <span className="text-sm font-medium text-slate-800 line-clamp-1 flex-1">
          {note.title || <span className="text-slate-500 italic">Untitled note</span>}
        </span>
        <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
          {!note.isPublished && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 border border-amber-200 uppercase tracking-wide">
              Draft
            </span>
          )}
          <span className="text-[10px] text-slate-500">#{note.noteNumber}</span>
        </div>
      </div>
      {note.meetingDate && (
        <div className="flex items-center gap-1.5 text-[11px] text-amber-600 mb-1">
          <IconCalendar />
          {fmt(note.meetingDate)}
          {note.activityType && (() => {
            const meta = ACTIVITY_META[note.activityType];
            return meta ? (
              <span className="text-slate-500">{meta.emoji} {meta.label}</span>
            ) : null;
          })()}
        </div>
      )}
      {linkedClients && (
        <div className="text-[11px] text-slate-500 line-clamp-1 mb-0.5">{linkedClients}</div>
      )}
      <div className="flex items-center gap-2 mt-1">
        {linkedProjects > 0 && (
          <span className="text-[10px] text-slate-500">{linkedProjects} project{linkedProjects !== 1 ? 's' : ''}</span>
        )}
        {note.body && (
          <span className="text-[10px] text-slate-600 line-clamp-1 flex-1">{note.body.slice(0, 60)}</span>
        )}
      </div>
    </button>
  );
}

// ── LinkedItem (small tag) ────────────────────────────────────────────────────

function LinkedTag({ label, onRemove }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs bg-slate-100 text-slate-700">
      {label}
      <button onClick={onRemove} className="text-slate-500 hover:text-slate-900 transition-colors ml-0.5">
        <IconX />
      </button>
    </span>
  );
}

// ── AddLinkDropdown ───────────────────────────────────────────────────────────

function AddLinkDropdown({ placeholder, items, onAdd, onClose }) {
  const [q, setQ] = useState('');
  const inputRef = useRef(null);
  useEffect(() => { inputRef.current?.focus(); }, []);

  const filtered = items.filter(it =>
    it.label.toLowerCase().includes(q.toLowerCase())
  ).slice(0, 20);

  return (
    <div className="absolute z-50 top-full mt-1 left-0 w-72 rounded-lg shadow-xl border border-slate-300 bg-white overflow-hidden">
      <div className="p-2 border-b border-slate-200">
        <input
          ref={inputRef}
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder={placeholder}
          className="w-full bg-white text-sm text-slate-800 rounded px-2.5 py-1.5 outline-none placeholder:text-slate-500"
        />
      </div>
      <div className="max-h-48 overflow-y-auto">
        {filtered.length === 0 && (
          <div className="px-3 py-2 text-xs text-slate-500">No results</div>
        )}
        {filtered.map(it => (
          <button
            key={it.id}
            onClick={() => { onAdd(it.id); onClose(); }}
            className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <span className="font-medium">{it.label}</span>
            {it.sub && <span className="ml-2 text-xs text-slate-500">{it.sub}</span>}
          </button>
        ))}
      </div>
      <div className="p-2 border-t border-slate-200">
        <button onClick={onClose} className="text-xs text-slate-500 hover:text-slate-700 transition-colors">Cancel</button>
      </div>
    </div>
  );
}

// ── NoteDetail ────────────────────────────────────────────────────────────────

function NoteDetail({ note, clients, projects, onUpdate, onDelete, currentUser }) {
  const isAdmin = ['SUPER_ADMIN', 'ILC_ADMIN', 'COMPANY_ADMIN', 'ADMIN'].includes(currentUser?.role);

  const [publishing, setPublishing] = useState(false);

  async function togglePublish(n) {
    setPublishing(true);
    try {
      const res = await fetch(`/api/crm/notes/${n.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publish: !n.isPublished }),
      });
      if (res.ok) {
        const updated = await res.json();
        onUpdate(updated);
      }
    } catch {}
    setPublishing(false);
  }

  const [form, setForm] = useState({
    title:        note.title       || '',
    noteBody:     note.body        || '',
    meetingDate:  fmtInput(note.meetingDate),
    attendees:    (() => {
      try { return JSON.parse(note.attendees || '[]').join(', '); } catch { return ''; }
    })(),
    calendarRef:  note.calendarRef || '',
    activityType: note.activityType || '',
  });
  const formRef   = useRef(form);
  formRef.current = form;

  // Contact attendee search state
  const [contactSearch,    setContactSearch]    = useState('');
  const [contactResults,   setContactResults]   = useState([]);
  const [contactSearching, setContactSearching] = useState(false);
  const [selectedContacts, setSelectedContacts] = useState(
    note.noteContacts?.map(nc => ({ id: nc.contactId || nc.id, name: nc.contact?.name || nc.name || nc.contactId, company: nc.contact?.company?.name || '' })) || []
  );
  const contactSearchRef = useRef(null);
  const contactDebounce  = useRef(null);
  const debounceRef   = useRef(null);
  const savedTimerRef = useRef(null);
  const [saveStatus, setSaveStatus] = useState('idle');

  // Reset form when note changes
  useEffect(() => {
    const f = {
      title:        note.title       || '',
      noteBody:     note.body        || '',
      meetingDate:  fmtInput(note.meetingDate),
      attendees:    (() => {
        try { return JSON.parse(note.attendees || '[]').join(', '); } catch { return ''; }
      })(),
      calendarRef:  note.calendarRef || '',
      activityType: note.activityType || '',
    };
    setForm(f);
    formRef.current = f;
    setSaveStatus('idle');
    clearTimeout(debounceRef.current);
    setSelectedContacts(
      note.noteContacts?.map(nc => ({ id: nc.contactId || nc.id, name: nc.contact?.name || nc.name || nc.contactId, company: nc.contact?.company?.name || '' })) || []
    );
    setContactSearch('');
    setContactResults([]);
  }, [note.id]);

  const persist = useCallback(async (snapshot, contacts) => {
    setSaveStatus('saving');
    try {
      const attendeesArr = snapshot.attendees
        ? snapshot.attendees.split(',').map(s => s.trim()).filter(Boolean)
        : [];
      const res = await fetch(`/api/crm/notes/${note.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title:        snapshot.title,
          noteBody:     snapshot.noteBody,
          meetingDate:  snapshot.meetingDate || null,
          attendees:    JSON.stringify(attendeesArr),
          calendarRef:  snapshot.calendarRef || null,
          activityType: snapshot.activityType || null,
          contactIds:   (contacts || selectedContacts).map(c => c.id),
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const updated = await res.json();
      onUpdate(updated);
      setSaveStatus('saved');
      clearTimeout(savedTimerRef.current);
      savedTimerRef.current = setTimeout(() => setSaveStatus('idle'), 2500);
    } catch {
      setSaveStatus('error');
    }
  }, [note.id, onUpdate, selectedContacts]);

  function scheduleSave(newForm, delay = 1000) {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => persist(newForm), delay);
  }

  function set(key, val, delay = 1000) {
    const next = { ...formRef.current, [key]: val };
    setForm(next);
    scheduleSave(next, delay);
  }

  // Contact search
  function handleContactSearch(q) {
    setContactSearch(q);
    clearTimeout(contactDebounce.current);
    if (!q.trim()) { setContactResults([]); return; }
    contactDebounce.current = setTimeout(async () => {
      setContactSearching(true);
      try {
        const res = await fetch(`/api/crm/contacts?search=${encodeURIComponent(q)}`);
        if (res.ok) {
          const data = await res.json();
          const contacts = data.contacts || data || [];
          // Filter out already-selected
          const selectedIds = new Set(selectedContacts.map(c => c.id));
          setContactResults(contacts.filter(c => !selectedIds.has(c.id)).slice(0, 10));
        }
      } catch {}
      setContactSearching(false);
    }, 300);
  }

  function addContact(contact) {
    const next = [...selectedContacts, { id: contact.id, name: contact.name, company: contact.company?.name || '' }];
    setSelectedContacts(next);
    setContactSearch('');
    setContactResults([]);
    persist(formRef.current, next);
  }

  function removeContact(contactId) {
    const next = selectedContacts.filter(c => c.id !== contactId);
    setSelectedContacts(next);
    persist(formRef.current, next);
  }

  // Linked clients
  const linkedClientIds = new Set(note.clients?.map(nc => nc.clientId) || []);
  const [showClientDrop, setShowClientDrop] = useState(false);
  const clientDropRef = useRef(null);

  // Linked projects
  const linkedProjectIds = new Set(note.projects?.map(np => np.projectId) || []);
  const [showProjectDrop, setShowProjectDrop] = useState(false);
  const projectDropRef = useRef(null);

  useEffect(() => {
    function handleClick(e) {
      if (clientDropRef.current  && !clientDropRef.current.contains(e.target))  setShowClientDrop(false);
      if (projectDropRef.current && !projectDropRef.current.contains(e.target)) setShowProjectDrop(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  async function addClient(clientId) {
    const res = await fetch(`/api/crm/notes/${note.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ addClientIds: [clientId] }),
    });
    if (res.ok) onUpdate(await res.json());
    else alert('Failed to link client: ' + await res.text());
  }
  async function removeClient(clientId) {
    const res = await fetch(`/api/crm/notes/${note.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ removeClientIds: [clientId] }),
    });
    if (res.ok) onUpdate(await res.json());
    else alert('Failed to unlink client: ' + await res.text());
  }
  async function addProject(projectId) {
    const res = await fetch(`/api/crm/notes/${note.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ addProjectIds: [projectId] }),
    });
    if (res.ok) onUpdate(await res.json());
    else alert('Failed to link project: ' + await res.text());
  }
  async function removeProject(projectId) {
    const res = await fetch(`/api/crm/notes/${note.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ removeProjectIds: [projectId] }),
    });
    if (res.ok) onUpdate(await res.json());
    else alert('Failed to unlink project: ' + await res.text());
  }

  async function handleDelete() {
    if (!confirm(`Delete note #${note.noteNumber}? This cannot be undone.`)) return;
    const res = await fetch(`/api/crm/notes/${note.id}`, { method: 'DELETE' });
    if (res.ok) onDelete(note.id);
  }

  const availableClients = clients.filter(c => !linkedClientIds.has(c.id)).map(c => ({
    id: c.id, label: c.name, sub: `#${c.clientNumber}`,
  }));
  const availableProjects = projects.filter(p => !linkedProjectIds.has(p.id)).map(p => ({
    id: p.id,
    label: p.name || '(Untitled)',
    sub: `${p.projectNumber ? 'PRJ-' + String(p.projectNumber).padStart(4, '0') : ''}${p.client?.name ? ' · ' + p.client.name : ''}`,
  }));

  const saveColor = saveStatus === 'saving' ? 'text-slate-500' : saveStatus === 'saved' ? 'text-emerald-600' : saveStatus === 'error' ? 'text-red-600' : 'text-slate-600';
  const saveText  = saveStatus === 'saving' ? 'Saving…' : saveStatus === 'saved' ? 'Saved ✓' : saveStatus === 'error' ? 'Save failed' : '';

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-6 pt-5 pb-3 border-b border-slate-200 shrink-0">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs text-slate-500">Note #{note.noteNumber}</span>
          <span className={`text-xs transition-colors ${saveColor}`}>{saveText}</span>
        </div>

        {/* Draft/Published badge + toggle */}
        <div className="flex items-center gap-2 mb-3">
          {note.isPublished ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-green-100 text-green-700 border border-green-200">
              ✓ Published
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
              ● Draft — bot paused
            </span>
          )}
          <button
            onClick={() => togglePublish(note)}
            disabled={publishing}
            className={`text-xs font-semibold px-3 py-1 rounded-lg transition-colors disabled:opacity-50 ${
              note.isPublished
                ? 'text-slate-500 hover:text-slate-700 border border-slate-200 hover:bg-slate-50'
                : 'bg-green-600 text-white hover:bg-green-700'
            }`}
          >
            {publishing ? '...' : note.isPublished ? 'Revert to Draft' : 'Mark Complete ✓'}
          </button>
        </div>

        <input
          value={form.title}
          onChange={e => set('title', e.target.value)}
          placeholder="Note title…"
          className="w-full bg-transparent text-xl font-semibold text-slate-900 placeholder:text-slate-500 outline-none"
        />
        <div className="flex items-center gap-1 mt-1 text-[11px] text-slate-500">
          <span>Created {fmt(note.createdAt)}</span>
          {note.createdBy?.name && <><span>·</span><span>{note.createdBy.name}</span></>}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">

        {/* Activity type picker */}
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-2">Activity Type</label>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(ACTIVITY_META).filter(([, meta]) => !meta.legacy).map(([key, meta]) => (
              <button
                key={key}
                type="button"
                onClick={() => set('activityType', form.activityType === key ? '' : key, 0)}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${
                  form.activityType === key
                    ? 'border-orange-500 bg-orange-500 text-white shadow-sm'
                    : meta.inPerson
                      ? 'border-amber-200 bg-amber-50 text-amber-700 hover:border-amber-400'
                      : 'border-slate-300 bg-white text-slate-500 hover:border-slate-400'
                }`}
              >
                {meta.emoji} {meta.label}
              </button>
            ))}
          </div>
        </div>

        {/* Meeting date + Calendar ref */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Meeting Date</label>
            <input
              type="date"
              value={form.meetingDate}
              onChange={e => set('meetingDate', e.target.value, 0)}
              className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 outline-none focus:border-amber-500 transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">
              Calendar Ref
              <span className="ml-1 text-slate-600 font-normal">(Outlook / Google)</span>
            </label>
            <input
              value={form.calendarRef}
              onChange={e => set('calendarRef', e.target.value)}
              placeholder="Event ID or URL"
              className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 placeholder:text-slate-500 outline-none focus:border-amber-500 transition-colors"
            />
          </div>
        </div>

        {/* Attendees */}
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Attendees</label>
          <input
            value={form.attendees}
            onChange={e => set('attendees', e.target.value)}
            placeholder="Jane Smith, John Doe…  (comma-separated)"
            className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 placeholder:text-slate-500 outline-none focus:border-amber-500 transition-colors"
          />
        </div>

        {/* Notes body */}
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Notes</label>
          <textarea
            value={form.noteBody}
            onChange={e => set('noteBody', e.target.value)}
            placeholder="Meeting notes, action items, follow-ups…"
            rows={10}
            className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 placeholder:text-slate-500 outline-none focus:border-amber-500 transition-colors resize-y leading-relaxed"
          />
        </div>

        {/* AI-extracted action items */}
        <NoteActions noteId={note.id} noteBody={form.noteBody} published={note.isPublished} />

        {/* Linked Clients */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-medium text-slate-500">Linked Clients</label>
            <div className="relative" ref={clientDropRef}>
              <button
                onClick={() => setShowClientDrop(v => !v)}
                className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900 transition-colors"
              >
                <IconPlus /> Add
              </button>
              {showClientDrop && (
                <AddLinkDropdown
                  placeholder="Search clients…"
                  items={availableClients}
                  onAdd={addClient}
                  onClose={() => setShowClientDrop(false)}
                />
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {note.clients?.length === 0 && (
              <span className="text-xs text-slate-600 italic">No clients linked</span>
            )}
            {note.clients?.map(nc => (
              <LinkedTag
                key={nc.clientId}
                label={nc.client?.name || nc.clientId}
                onRemove={() => removeClient(nc.clientId)}
              />
            ))}
          </div>
        </div>

        {/* Linked Projects */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-medium text-slate-500">Linked Projects</label>
            <div className="relative" ref={projectDropRef}>
              <button
                onClick={() => setShowProjectDrop(v => !v)}
                className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900 transition-colors"
              >
                <IconPlus /> Add
              </button>
              {showProjectDrop && (
                <AddLinkDropdown
                  placeholder="Search projects…"
                  items={availableProjects}
                  onAdd={addProject}
                  onClose={() => setShowProjectDrop(false)}
                />
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {note.projects?.length === 0 && (
              <span className="text-xs text-slate-600 italic">No projects linked</span>
            )}
            {note.projects?.map(np => (
              <LinkedTag
                key={np.projectId}
                label={np.project?.name || np.projectId}
                onRemove={() => removeProject(np.projectId)}
              />
            ))}
          </div>
        </div>

        {/* Contact attendees picker */}
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-2">Attendees</label>
          {/* Selected contacts chips */}
          {selectedContacts.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {selectedContacts.map(c => (
                <span key={c.id} className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs bg-orange-50 text-orange-700 border border-orange-200">
                  <span className={`w-4 h-4 rounded-full flex items-center justify-center text-white text-[9px] font-bold shrink-0 ${avatarColor(c.name)}`}>
                    {initials(c.name)}
                  </span>
                  <span>{c.name}</span>
                  {c.company && <span className="text-orange-500 text-[10px]">{c.company}</span>}
                  <button onClick={() => removeContact(c.id)} className="text-orange-600 hover:text-slate-900 transition-colors ml-0.5">
                    <IconX />
                  </button>
                </span>
              ))}
            </div>
          )}
          {/* Search input */}
          <div className="relative" ref={contactSearchRef}>
            <div className="relative">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500"><IconSearch /></span>
              <input
                value={contactSearch}
                onChange={e => handleContactSearch(e.target.value)}
                placeholder="Search contacts to add…"
                className="w-full bg-white border border-slate-200 rounded-lg pl-8 pr-3 py-1.5 text-sm text-slate-900 placeholder:text-slate-500 outline-none focus:border-amber-500 transition-colors"
              />
              {contactSearching && (
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2">
                  <div className="w-3.5 h-3.5 border-2 border-slate-400 border-t-amber-400 rounded-full animate-spin" />
                </span>
              )}
            </div>
            {contactResults.length > 0 && (
              <div className="absolute z-50 top-full mt-1 left-0 right-0 rounded-lg shadow-xl border border-slate-300 bg-white overflow-hidden">
                <div className="max-h-48 overflow-y-auto">
                  {contactResults.map(c => (
                    <button
                      key={c.id}
                      onClick={() => addContact(c)}
                      className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-slate-100 transition-colors"
                    >
                      <div className={`w-6 h-6 rounded-full shrink-0 flex items-center justify-center text-white text-[10px] font-bold ${avatarColor(c.name)}`}>
                        {initials(c.name)}
                      </div>
                      <div>
                        <div className="text-sm text-slate-700 font-medium">{c.name}</div>
                        {c.company?.name && <div className="text-xs text-slate-500">{c.company.name}</div>}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Footer */}
      {isAdmin && (
        <div className="shrink-0 px-6 py-3 border-t border-slate-200">
          <button
            onClick={handleDelete}
            className="text-xs text-slate-600 hover:text-red-600 transition-colors"
          >
            Delete this note
          </button>
        </div>
      )}
    </div>
  );
}

// ── NotesClient (main) ────────────────────────────────────────────────────────

export default function NotesClient({ initialNotes, clients, projects, currentUser }) {
  const isAdmin = ['SUPER_ADMIN', 'ILC_ADMIN', 'COMPANY_ADMIN', 'ADMIN'].includes(currentUser?.role);
  const [notes,        setNotes]        = useState(initialNotes);
  const [selected,     setSelected]     = useState(initialNotes[0]?.id || null);
  const [search,       setSearch]       = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [creating,     setCreating]     = useState(false);

  const activeNote = notes.find(n => n.id === selected) || null;

  const filtered = notes.filter(n => {
    if (statusFilter === 'draft'     &&  n.isPublished) return false;
    if (statusFilter === 'published' && !n.isPublished) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      n.title?.toLowerCase().includes(q) ||
      n.body?.toLowerCase().includes(q)  ||
      n.clients?.some(nc => nc.client?.name?.toLowerCase().includes(q)) ||
      n.projects?.some(np => np.project?.name?.toLowerCase().includes(q))
    );
  });

  async function createNote() {
    setCreating(true);
    try {
      const res = await fetch('/api/crm/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: '', noteBody: '' }),
      });
      if (!res.ok) throw new Error('Failed to create');
      const note = await res.json();
      setNotes(prev => [note, ...prev]);
      setSelected(note.id);
    } catch (err) {
      alert('Could not create note: ' + err.message);
    } finally {
      setCreating(false);
    }
  }

  function handleUpdate(updated) {
    setNotes(prev => prev.map(n => n.id === updated.id ? updated : n));
  }

  function handleDelete(id) {
    setNotes(prev => {
      const next = prev.filter(n => n.id !== id);
      setSelected(next[0]?.id || null);
      return next;
    });
  }

  return (
    <div className="flex h-screen bg-slate-50 text-slate-800">
      {/* ── Left panel ── */}
      <div className="w-80 shrink-0 flex flex-col border-r border-slate-200">
        {/* Header */}
        <div className="px-4 pt-4 pb-3 shrink-0 border-b border-slate-200">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h1 className="text-base font-semibold text-slate-900">Sales Notes</h1>
              <p className="text-xs text-slate-500">{filtered.length} note{filtered.length !== 1 ? 's' : ''}</p>
            </div>
            <button
              onClick={createNote}
              disabled={creating}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-500 hover:bg-amber-400 text-white transition-colors disabled:opacity-50"
            >
              <IconPlus /> New
            </button>
          </div>
          {/* Search */}
          <div className="relative mb-2">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500"><IconSearch /></span>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search notes…"
              className="w-full bg-white border border-slate-200 rounded-lg pl-8 pr-3 py-1.5 text-sm text-slate-900 placeholder:text-slate-500 outline-none focus:border-amber-500 transition-colors"
            />
          </div>
          {/* Status filter pills */}
          <div className="flex gap-1.5">
            {[['all', 'All'], ['draft', 'Drafts'], ['published', 'Published']].map(([val, label]) => (
              <button
                key={val}
                onClick={() => setStatusFilter(val)}
                className={`px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wide transition-colors ${
                  statusFilter === val
                    ? 'bg-amber-500 text-white'
                    : 'bg-white text-slate-500 hover:text-slate-900 border border-slate-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Note list */}
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-slate-500">
              {search ? 'No notes match your search' : 'No notes yet — click New to start'}
            </div>
          )}
          {filtered.map(note => (
            <NoteCard
              key={note.id}
              note={note}
              active={note.id === selected}
              onClick={() => setSelected(note.id)}
            />
          ))}
        </div>
      </div>

      {/* ── Right panel ── */}
      <div className="flex-1 min-w-0 overflow-hidden">
        {activeNote ? (
          <NoteDetail
            key={activeNote.id}
            note={activeNote}
            clients={clients}
            projects={projects}
            onUpdate={handleUpdate}
            onDelete={handleDelete}
            currentUser={currentUser}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-3">
            <IconNote />
            <p className="text-sm">Select a note or create a new one</p>
          </div>
        )}
      </div>
    </div>
  );
}
