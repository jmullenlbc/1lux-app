'use client';
import { useState, useRef, useCallback, useEffect } from 'react';
import ConfirmArchiveModal from '@/components/salesAutomation/ConfirmArchiveModal';
import MeetingPrep from './MeetingPrep';
import { draftsChanged } from '@/components/layout/useDraftReminder';
import { isReminderDraft } from '@/lib/calendar/draftReminder';
import { attendeesToText, textToAttendees, toLocalInput, fromLocalInput } from '@/lib/noteAttendees';
import { groupNotesForAgenda, agendaGroup, defaultNoteTab } from '@/lib/notes/agenda';
import { shouldAutoPrep } from '@/lib/meetingPrep/due';

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
  // Waiting on THEM (intro, reply, drawings, invite): the email watch + reminder ladder.
  const isIntro  = WAIT_EXECUTOR_SET.has(typeDef?.executor);
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
            {!editing && isIntro && !a.watch && (
              <span className="text-[11px] text-emerald-600" title="First reminder, in days after the meeting, if they haven't done it">
                ⏰ first reminder at {waitDays ?? '—'}d
              </span>
            )}
          </div>
          {!editing && a.watch && (
            <p className={`text-[11px] mt-0.5 ${a.watch.state === 'done' ? 'text-emerald-700 font-semibold' : a.watch.state === 'gave up' ? 'text-rose-600' : 'text-slate-500'}`}
               title={a.fulfilledByEmail?.subject ? `Email: ${a.fulfilledByEmail.subject}` : undefined}>
              {a.watch.state === 'done' ? '✔ ' : a.watch.state === 'gave up' ? '⚠ ' : '👀 '}{a.watch.text}
            </p>
          )}

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
                  <span className="text-[11px] text-slate-500 whitespace-nowrap">First reminder after</span>
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

// Things they offered to do are thanked in the same recap email (composeOutreach RECAP_EMAIL_METHODS).
const WAIT_EXECUTOR_SET = new Set(['EXPECT_INTRO', 'EXPECT_REPLY', 'EXPECT_FILES', 'EXPECT_INVITE']);
const OUTREACH_METHODS = new Set(['EMAIL', 'SEND_MATERIALS', 'SCHEDULE', ...WAIT_EXECUTOR_SET]);

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
        <label className="text-sm font-semibold text-slate-800">Next steps <span className="text-xs font-normal text-slate-400">pulled from your notes automatically</span></label>
        {busy
          ? <span className="text-xs text-slate-500">Reading note…</span>
          : <button onClick={runExtract} className="text-xs text-slate-500 hover:text-amber-600" title="Re-extract now">↻</button>}
      </div>
      {visible.length === 0 ? (
        <p className="text-xs text-slate-600">{busy ? 'Reading your note…' : 'Next steps show up here a few seconds after you write them — "send Jane the cut sheets", "call back Tuesday".'}</p>
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

function formFromNote(note) {
  return {
    title:        note.title       || '',
    noteBody:     note.body        || '',
    meetingDate:  toLocalInput(note.meetingDate),
    attendees:    attendeesToText(note.attendees),
    meetingLink:  note.meetingLink || '',
    activityType: note.activityType || '',
  };
}
function contactsFromNote(note) {
  return (note.contacts || []).filter(nc => nc.contact).map(nc => ({
    id: nc.contactId, name: nc.contact.name, company: nc.contact.client?.name || nc.contact.company || '',
  }));
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
function IconNote() {
  return <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>;
}

// ── Agenda list (Mike 9-25: "it just looks like an email inbox") ────────────

function fmtTime(d) {
  return new Date(d).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}
function fmtWhen(d) {
  if (!d) return '';
  return new Date(d).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function DateTile({ date, tone }) {
  const d = date ? new Date(date) : null;
  const tones = {
    upcoming:   'bg-amber-500 text-white',
    needsNotes: 'bg-white text-slate-700 border border-slate-200',
    done:       'bg-slate-100 text-slate-500',
  };
  return (
    <div className={`w-11 shrink-0 rounded-lg text-center py-1 ${tones[tone]}`}>
      {d ? (
        <>
          <div className="text-[9px] font-bold uppercase leading-none tracking-wide">{d.toLocaleDateString('en-US', { month: 'short' })}</div>
          <div className="text-base font-semibold leading-tight">{d.getDate()}</div>
        </>
      ) : <div className="text-[10px] py-1.5">No date</div>}
    </div>
  );
}

function NoteRow({ note, tone, active, onClick }) {
  const meta = ACTIVITY_META[note.activityType];
  const company = note.clients?.map(nc => nc.client?.name).filter(Boolean).join(', ');
  return (
    <button onClick={onClick}
      className={`w-full text-left flex gap-3 px-3 py-2.5 rounded-lg transition-colors ${active ? 'bg-amber-50 ring-1 ring-amber-300' : 'hover:bg-white'}`}>
      <DateTile date={note.meetingDate} tone={tone} />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-slate-800 truncate">
          {note.title || <span className="text-slate-400 italic">Untitled meeting</span>}
        </div>
        <div className="text-[11px] text-slate-500 truncate">
          {note.meetingDate && fmtTime(note.meetingDate)}
          {meta && <> · {meta.emoji} {meta.label}</>}
          {note.calendarRef && <span title="Came from the calendar"> · 📅</span>}
        </div>
        {company && <div className="text-[11px] text-slate-400 truncate">{company}</div>}
      </div>
    </button>
  );
}

const GROUPS = [
  ['upcoming',   'Coming up',   'Prep builds itself before the meeting.'],
  ['needsNotes', 'Needs notes', 'The meeting happened — write what was said, then mark it complete.'],
  ['done',       'Done',        null],
];

// ── Small pieces ──────────────────────────────────────────────────────────────

function LinkedTag({ label, onRemove }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs bg-slate-100 text-slate-700">
      {label}
      {onRemove && (
        <button onClick={onRemove} className="text-slate-500 hover:text-slate-900 transition-colors ml-0.5">
          <IconX />
        </button>
      )}
    </span>
  );
}

function AddLinkDropdown({ placeholder, items, onAdd, onClose }) {
  const [q, setQ] = useState('');
  const inputRef = useRef(null);
  useEffect(() => { inputRef.current?.focus(); }, []);

  const filtered = items.filter(it =>
    it.label.toLowerCase().includes(q.toLowerCase())
  ).slice(0, 20);

  return (
    <div className="absolute z-50 top-full mt-1 right-0 w-72 rounded-lg shadow-xl border border-slate-300 bg-white overflow-hidden">
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

function MoreMenu({ onArchive }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(v => !v)} title="More"
        className="w-8 h-8 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 text-lg leading-none">⋯</button>
      {open && (
        <div className="absolute right-0 z-50 mt-1 w-44 rounded-lg border border-slate-200 bg-white shadow-xl py-1">
          <button onClick={() => { setOpen(false); onArchive(); }} className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">Archive</button>
        </div>
      )}
    </div>
  );
}

// ── New note (manual) ─────────────────────────────────────────────────────────

const BLANK_NEW = { title: '', meetingDate: '', activityType: '', meetingLink: '', clientId: '' };

function NewNoteModal({ open, clients, onClose, onCreated }) {
  const [f, setF] = useState(BLANK_NEW);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => { if (open) { setF(BLANK_NEW); setErr(''); } }, [open]);
  if (!open) return null;

  async function create(e) {
    e.preventDefault();
    setBusy(true); setErr('');
    try {
      const res = await fetch('/api/crm/notes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title:        f.title,
          noteBody:     '',
          meetingDate:  fromLocalInput(f.meetingDate),
          activityType: f.activityType || undefined,
          meetingLink:  f.meetingLink.trim() || null,
          clientIds:    f.clientId ? [f.clientId] : [],
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(d.error || 'Could not create the note.'); return; }
      onCreated(d);
    } catch { setErr('Network error — try again.'); }
    finally { setBusy(false); }
  }

  const input = 'w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-amber-500';
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 px-4" onMouseDown={onClose}>
      <form onSubmit={create} className="w-full max-w-md rounded-xl bg-white shadow-2xl p-5 space-y-3" onMouseDown={e => e.stopPropagation()}>
        <h2 className="text-base font-semibold text-slate-900">New meeting note</h2>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Meeting</label>
          <input autoFocus value={f.title} onChange={e => setF({ ...f, title: e.target.value })} placeholder="Coffee with Jane — Hilltop Apartments" className={input} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Date &amp; time</label>
            <input type="datetime-local" value={f.meetingDate} onChange={e => setF({ ...f, meetingDate: e.target.value })} className={input} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Type</label>
            <select value={f.activityType} onChange={e => setF({ ...f, activityType: e.target.value })} className={input}>
              <option value="">—</option>
              {Object.entries(ACTIVITY_META).filter(([, m]) => !m.legacy).map(([k, m]) => <option key={k} value={k}>{m.emoji} {m.label}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Company <span className="font-normal text-slate-400">(optional)</span></label>
          <select value={f.clientId} onChange={e => setF({ ...f, clientId: e.target.value })} className={input}>
            <option value="">—</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Calendar link <span className="font-normal text-slate-400">(optional — paste the Outlook event link)</span></label>
          <input value={f.meetingLink} onChange={e => setF({ ...f, meetingLink: e.target.value })} placeholder="https://outlook.office.com/calendar/item/…" className={input} />
          <p className="mt-1 text-[11px] text-slate-400">When the calendar syncs, this note joins that meeting instead of a second note appearing.</p>
        </div>
        {err && <p className="text-xs text-red-600">{err}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="px-3 py-1.5 rounded-lg text-sm text-slate-600 hover:bg-slate-100">Cancel</button>
          <button type="submit" disabled={busy} className="px-3 py-1.5 rounded-lg text-sm font-medium bg-amber-500 text-white hover:bg-amber-400 disabled:opacity-50">
            {busy ? 'Creating…' : 'Create note'}
          </button>
        </div>
      </form>
    </div>
  );
}

// ── NoteDetail ────────────────────────────────────────────────────────────────

function NoteDetail({ note, clients, projects, onUpdate, onDelete, currentUser }) {
  const canPrep = currentUser?.canPrep === true;
  const [tab, setTab] = useState(() => defaultNoteTab(note, { canPrep }));
  const hasLinks = (note.clients?.length || 0) + (note.projects?.length || 0) + (note.contacts?.length || 0) > 0;
  const [detailsOpen, setDetailsOpen] = useState(() => !note.title && !note.meetingDate && !hasLinks);

  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiving,   setArchiving]   = useState(false);
  const [publishing,  setPublishing]  = useState(false);

  const [form, setForm] = useState(() => formFromNote(note));
  // Only fields a person actually touched are saved — so opening a calendar
  // draft never stamps it 'manual' or rewrites its guest list.
  const dirtyRef = useRef(new Set());
  const formRef   = useRef(form);
  formRef.current = form;

  // Contact attendee search state
  const [contactSearch,    setContactSearch]    = useState('');
  const [contactResults,   setContactResults]   = useState([]);
  const [contactSearching, setContactSearching] = useState(false);
  const [selectedContacts, setSelectedContacts] = useState(() => contactsFromNote(note));
  const contactDebounce  = useRef(null);
  const debounceRef   = useRef(null);
  const savedTimerRef = useRef(null);
  const [saveStatus, setSaveStatus] = useState('idle');
  const [saveError,  setSaveError]  = useState('');

  const persist = useCallback(async (snapshot, contacts) => {
    const keys = [...dirtyRef.current];
    dirtyRef.current = new Set();
    const body = {};
    for (const k of keys) {
      if (k === 'meetingDate')       body.meetingDate  = fromLocalInput(snapshot.meetingDate);
      else if (k === 'attendees')    body.attendees    = textToAttendees(snapshot.attendees, note.attendees);
      else if (k === 'meetingLink')  body.meetingLink  = snapshot.meetingLink.trim() || null;
      else if (k === 'activityType') body.activityType = snapshot.activityType || null;
      else body[k] = snapshot[k];
    }
    if (contacts) body.contactIds = contacts.map(c => c.id);
    if (!Object.keys(body).length) return;
    setSaveStatus('saving');
    setSaveError('');
    try {
      const res = await fetch(`/api/crm/notes/${note.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        if (res.status === 400) { setSaveError(d.error || ''); setSaveStatus('error'); return; }
        throw new Error(d.error || String(res.status));
      }
      const updated = await res.json();
      onUpdate(updated);
      setSaveStatus('saved');
      clearTimeout(savedTimerRef.current);
      savedTimerRef.current = setTimeout(() => setSaveStatus('idle'), 2500);
    } catch {
      for (const k of keys) dirtyRef.current.add(k);
      setSaveStatus('error');
    }
  }, [note.id, note.attendees, onUpdate]);

  async function togglePublish() {
    setPublishing(true);
    // Save any typing still waiting on the autosave first, so publishing reads the final words.
    clearTimeout(debounceRef.current);
    await persist(formRef.current);
    try {
      const res = await fetch(`/api/crm/notes/${note.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publish: !note.isPublished }),
      });
      if (res.ok) {
        const updated = await res.json();
        onUpdate(updated);
        draftsChanged();
      } else alert('Could not save: ' + ((await res.json().catch(() => null))?.error || res.status));
    } catch {}
    setPublishing(false);
  }

  function scheduleSave(newForm, delay = 1000) {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => persist(newForm), delay);
  }

  function set(key, val, delay = 1000) {
    dirtyRef.current.add(key);
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
          const selectedIds = new Set(selectedContacts.map(c => c.id));
          setContactResults(contacts.filter(c => !selectedIds.has(c.id)).slice(0, 10));
        }
      } catch {}
      setContactSearching(false);
    }, 300);
  }

  function addContact(contact) {
    const next = [...selectedContacts, { id: contact.id, name: contact.name, company: contact.client?.name || contact.company?.name || '' }];
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

  const linkedClientIds  = new Set(note.clients?.map(nc => nc.clientId) || []);
  const linkedProjectIds = new Set(note.projects?.map(np => np.projectId) || []);
  const [showClientDrop,  setShowClientDrop]  = useState(false);
  const [showProjectDrop, setShowProjectDrop] = useState(false);
  const clientDropRef  = useRef(null);
  const projectDropRef = useRef(null);

  useEffect(() => {
    function handleClick(e) {
      if (clientDropRef.current  && !clientDropRef.current.contains(e.target))  setShowClientDrop(false);
      if (projectDropRef.current && !projectDropRef.current.contains(e.target)) setShowProjectDrop(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  async function patchLinks(body, what) {
    const res = await fetch(`/api/crm/notes/${note.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) onUpdate(await res.json());
    else alert(`Could not ${what}: ` + ((await res.json().catch(() => null))?.error || res.status));
  }
  const addClient     = id => patchLinks({ addClientIds:     [id] }, 'link that company');
  const removeClient  = id => patchLinks({ removeClientIds:  [id] }, 'unlink that company');
  const addProject    = id => patchLinks({ addProjectIds:    [id] }, 'link that project');
  const removeProject = id => patchLinks({ removeProjectIds: [id] }, 'unlink that project');

  // Archive: hidden, restorable from the Archive page. Anyone may (Mike 9-25).
  async function handleArchive() {
    setArchiving(true);
    try {
      const res = await fetch(`/api/crm/notes/${note.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived: true }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || 'Could not archive that note.');
        return;
      }
      setArchiveOpen(false);
      onDelete(note.id);
      draftsChanged();
    } finally {
      setArchiving(false);
    }
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
  const saveText  = saveStatus === 'saving' ? 'Saving…' : saveStatus === 'saved' ? 'Saved ✓' : saveStatus === 'error' ? (saveError || 'Save failed') : '';

  const meta = ACTIVITY_META[note.activityType];
  const upcoming = agendaGroup(note) === 'upcoming';
  const input = 'w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-amber-500 transition-colors';

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-6 pt-4 pb-0 border-b border-slate-200 shrink-0 bg-white">
        <div className="flex items-center gap-2 mb-2">
          {note.isPublished ? (
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700 border border-green-200">✓ Complete</span>
          ) : upcoming ? (
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-500 text-white">Coming up</span>
          ) : (
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">Needs notes</span>
          )}
          <span className="text-xs text-slate-400">#{note.noteNumber}</span>
          {note.calendarRef && <span className="text-[11px] text-emerald-700" title="This note follows a meeting on the calendar">📅 On the calendar</span>}
          {note.meetingLink && (
            <a href={note.meetingLink} target="_blank" rel="noopener noreferrer" className="text-[11px] text-amber-700 hover:underline">Open in calendar ↗</a>
          )}
          <span className={`ml-auto text-xs transition-colors ${saveColor}`}>{saveText}</span>
          <MoreMenu onArchive={() => setArchiveOpen(true)} />
        </div>

        <input
          value={form.title}
          onChange={e => set('title', e.target.value)}
          placeholder="What was the meeting?"
          className="w-full bg-transparent text-xl font-semibold text-slate-900 placeholder:text-slate-400 outline-none"
        />

        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1 text-xs text-slate-500">
          {note.meetingDate ? <span>{fmtWhen(note.meetingDate)}</span> : <span className="italic">No date yet</span>}
          {meta && <><span>·</span><span>{meta.emoji} {meta.label}</span></>}
          {note.isInPerson && <><span>·</span><span className="text-amber-700">In person</span></>}
          {note.createdBy?.name && <><span>·</span><span>Owner: {note.createdBy.name}</span></>}
          <button onClick={() => setDetailsOpen(v => !v)} className="ml-1 text-amber-700 hover:underline">
            {detailsOpen ? 'Hide details' : 'Edit details'}
          </button>
        </div>

        {/* Who and what it is about, at a glance */}
        {!detailsOpen && (note.clients?.length > 0 || note.projects?.length > 0 || selectedContacts.length > 0) && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {note.clients?.map(nc => <span key={nc.clientId} className="px-2 py-0.5 rounded-md text-[11px] bg-slate-100 text-slate-700">🏢 {nc.client?.name}</span>)}
            {note.projects?.map(np => <span key={np.projectId} className="px-2 py-0.5 rounded-md text-[11px] bg-blue-50 text-blue-700">{np.project?.name || 'Project'}</span>)}
            {selectedContacts.map(c => <span key={c.id} className="px-2 py-0.5 rounded-md text-[11px] bg-orange-50 text-orange-700">{c.name}</span>)}
          </div>
        )}

        {/* Details — everything that describes the meeting, folded away once filled */}
        {detailsOpen && (
          <div className="mt-3 mb-1 rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-4 max-h-[45vh] overflow-y-auto">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-2">Type</label>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(ACTIVITY_META).filter(([, m]) => !m.legacy).map(([key, m]) => (
                  <button key={key} type="button"
                    onClick={() => set('activityType', form.activityType === key ? '' : key, 0)}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${
                      form.activityType === key
                        ? 'border-orange-500 bg-orange-500 text-white shadow-sm'
                        : m.inPerson
                          ? 'border-amber-200 bg-amber-50 text-amber-700 hover:border-amber-400'
                          : 'border-slate-300 bg-white text-slate-500 hover:border-slate-400'
                    }`}>
                    {m.emoji} {m.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Date &amp; time</label>
                <input type="datetime-local" value={form.meetingDate} onChange={e => set('meetingDate', e.target.value, 0)} className={input} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Calendar link</label>
                <input value={form.meetingLink} onChange={e => set('meetingLink', e.target.value)}
                  placeholder="Paste the Outlook event link" className={input} />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Who was there <span className="font-normal text-slate-400">(names, comma-separated)</span></label>
              <input value={form.attendees} onChange={e => set('attendees', e.target.value)} placeholder="Jane Smith, John Doe…" className={input} />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-slate-500">Companies</label>
                <div className="relative" ref={clientDropRef}>
                  <button onClick={() => setShowClientDrop(v => !v)} className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900"><IconPlus /> Add</button>
                  {showClientDrop && <AddLinkDropdown placeholder="Search companies…" items={availableClients} onAdd={addClient} onClose={() => setShowClientDrop(false)} />}
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {!note.clients?.length && <span className="text-xs text-slate-400 italic">None linked</span>}
                {note.clients?.map(nc => <LinkedTag key={nc.clientId} label={nc.client?.name || nc.clientId} onRemove={() => removeClient(nc.clientId)} />)}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-slate-500">Projects</label>
                <div className="relative" ref={projectDropRef}>
                  <button onClick={() => setShowProjectDrop(v => !v)} className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900"><IconPlus /> Add</button>
                  {showProjectDrop && <AddLinkDropdown placeholder="Search projects…" items={availableProjects} onAdd={addProject} onClose={() => setShowProjectDrop(false)} />}
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {!note.projects?.length && <span className="text-xs text-slate-400 italic">None linked</span>}
                {note.projects?.map(np => <LinkedTag key={np.projectId} label={np.project?.name || np.projectId} onRemove={() => removeProject(np.projectId)} />)}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">People</label>
              {selectedContacts.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {selectedContacts.map(c => (
                    <span key={c.id} className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs bg-orange-50 text-orange-700 border border-orange-200">
                      <span className={`w-4 h-4 rounded-full flex items-center justify-center text-white text-[9px] font-bold shrink-0 ${avatarColor(c.name)}`}>{initials(c.name)}</span>
                      <span>{c.name}</span>
                      {c.company && <span className="text-orange-500 text-[10px]">{c.company}</span>}
                      <button onClick={() => removeContact(c.id)} className="text-orange-600 hover:text-slate-900 ml-0.5"><IconX /></button>
                    </span>
                  ))}
                </div>
              )}
              <div className="relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500"><IconSearch /></span>
                <input value={contactSearch} onChange={e => handleContactSearch(e.target.value)} placeholder="Search people to add…"
                  className="w-full bg-white border border-slate-200 rounded-lg pl-8 pr-3 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-amber-500" />
                {contactSearching && (
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2">
                    <div className="w-3.5 h-3.5 border-2 border-slate-400 border-t-amber-400 rounded-full animate-spin" />
                  </span>
                )}
                {contactResults.length > 0 && (
                  <div className="absolute z-50 top-full mt-1 left-0 right-0 rounded-lg shadow-xl border border-slate-300 bg-white overflow-hidden max-h-48 overflow-y-auto">
                    {contactResults.map(c => (
                      <button key={c.id} onClick={() => addContact(c)} className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-slate-100">
                        <div className={`w-6 h-6 rounded-full shrink-0 flex items-center justify-center text-white text-[10px] font-bold ${avatarColor(c.name)}`}>{initials(c.name)}</div>
                        <div>
                          <div className="text-sm text-slate-700 font-medium">{c.name}</div>
                          {c.company?.name && <div className="text-xs text-slate-500">{c.company.name}</div>}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Tabs — Prep before the meeting, Notes after it (Mike 9-25) */}
        <div className="flex gap-5 mt-3">
          {[...(canPrep ? [['prep', 'Prep']] : []), ['notes', 'Notes']].map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)}
              className={`pb-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === key ? 'border-amber-500 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab body */}
      <div className="flex-1 overflow-y-auto px-6 py-5 bg-slate-50">
        {tab === 'prep' && canPrep && (
          <div className="max-w-3xl space-y-3">
            {!hasLinks && (
              <p className="text-sm text-slate-600 rounded-lg border border-dashed border-slate-300 bg-white px-4 py-3">
                Link a company, project or person in <button onClick={() => setDetailsOpen(true)} className="text-amber-700 hover:underline">Edit details</button> and the prep builds itself before the meeting.
              </p>
            )}
            <MeetingPrep noteId={note.id} autoRun={shouldAutoPrep(note, false)} />
          </div>
        )}

        {tab === 'notes' && (
          <div className="max-w-3xl space-y-5">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">What was said, decided and promised</label>
              <textarea
                value={form.noteBody}
                onChange={e => set('noteBody', e.target.value)}
                placeholder="Type as you go — next steps are pulled out below automatically."
                rows={10}
                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-amber-500 resize-y leading-relaxed"
              />
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <NoteActions noteId={note.id} noteBody={form.noteBody} published={note.isPublished} />
            </div>

            <div className={`rounded-lg border p-4 flex flex-wrap items-center gap-3 ${note.isPublished ? 'border-green-200 bg-green-50' : 'border-amber-200 bg-amber-50'}`}>
              <p className="text-xs text-slate-700 flex-1 min-w-[16rem]">
                {note.isPublished
                  ? 'Complete. The bot is working the next steps — drafts land in the Bot Queue for review, and reminders are set.'
                  : 'Nothing happens until you mark it complete. Then the bot drafts the follow-up emails, sets the reminders, and moves "last met" for everyone on the note.'}
              </p>
              <button
                onClick={togglePublish}
                disabled={publishing}
                className={`text-sm font-semibold px-4 py-2 rounded-lg transition-colors disabled:opacity-50 ${
                  note.isPublished ? 'text-slate-600 border border-slate-300 bg-white hover:bg-slate-50' : 'bg-green-600 text-white hover:bg-green-700'
                }`}>
                {publishing ? '…' : note.isPublished ? 'Back to draft' : 'Mark complete ✓'}
              </button>
            </div>
          </div>
        )}
      </div>

      <ConfirmArchiveModal
        open={archiveOpen}
        title="Archive this note?"
        what={note.title || `Note #${note.noteNumber}`}
        body="It disappears from the notes list and from the companies and projects it is linked to. Any follow-up emails it set up that have not gone out yet are held. You can restore it from the Archive page at any time."
        busy={archiving}
        onCancel={() => setArchiveOpen(false)}
        onConfirm={handleArchive}
      />
    </div>
  );
}

// ── NotesClient (main) ────────────────────────────────────────────────────────

function firstInAgenda(notes) {
  const g = groupNotesForAgenda(notes);
  return (g.upcoming[0] || g.needsNotes[0] || g.done[0])?.id || null;
}

export default function NotesClient({ initialNotes, clients, projects, currentUser, initialStatus = 'all' }) {
  const [notes,        setNotes]        = useState(initialNotes);
  const [selected,     setSelected]     = useState(() => {
    const mine = initialStatus === 'mine' ? initialNotes.find(n => isReminderDraft(n, currentUser?.id)) : null;
    return mine?.id || firstInAgenda(initialNotes);
  });
  const [search,       setSearch]       = useState('');
  const [statusFilter, setStatusFilter] = useState(initialStatus);
  const [newOpen,      setNewOpen]      = useState(false);
  const [doneOpen,     setDoneOpen]     = useState(false);

  // The reminder's "Open them" link can be clicked while already on this screen.
  useEffect(() => {
    setStatusFilter(initialStatus);
    if (initialStatus === 'mine') {
      const first = notes.find(n => isReminderDraft(n, currentUser?.id));
      if (first) setSelected(first.id);
    }
  }, [initialStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  const activeNote = notes.find(n => n.id === selected) || null;

  const filtered = notes.filter(n => {
    if (statusFilter === 'draft'     &&  n.isPublished) return false;
    if (statusFilter === 'published' && !n.isPublished) return false;
    // Same rule as the reminder banner: my calendar meetings, already happened, not published.
    if (statusFilter === 'mine'      && !isReminderDraft(n, currentUser?.id)) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      n.title?.toLowerCase().includes(q) ||
      n.body?.toLowerCase().includes(q)  ||
      n.clients?.some(nc => nc.client?.name?.toLowerCase().includes(q)) ||
      n.projects?.some(np => np.project?.name?.toLowerCase().includes(q)) ||
      n.contacts?.some(c => c.contact?.name?.toLowerCase().includes(q))
    );
  });
  const groups = groupNotesForAgenda(filtered);

  function handleCreated(note) {
    setNotes(prev => [note, ...prev]);
    setSelected(note.id);
    setNewOpen(false);
    setStatusFilter('all');
  }

  function handleUpdate(updated) {
    setNotes(prev => prev.map(n => n.id === updated.id ? updated : n));
  }

  function handleDelete(id) {
    const next = notes.filter(n => n.id !== id);
    setNotes(next);
    setSelected(firstInAgenda(next));
  }

  return (
    <div className="flex h-screen bg-slate-50 text-slate-800">
      {/* ── Left: the agenda ── */}
      <div className="w-80 shrink-0 flex flex-col border-r border-slate-200 bg-slate-100/60">
        <div className="px-4 pt-4 pb-3 shrink-0 border-b border-slate-200">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h1 className="text-base font-semibold text-slate-900">Sales Meetings</h1>
              <p className="text-xs text-slate-500">
                {groups.upcoming.length} coming up · {groups.needsNotes.length} need notes
              </p>
            </div>
            <button
              onClick={() => setNewOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-500 hover:bg-amber-400 text-white transition-colors"
            >
              <IconPlus /> New note
            </button>
          </div>
          <div className="relative mb-2">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500"><IconSearch /></span>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search meetings, companies, people…"
              className="w-full bg-white border border-slate-200 rounded-lg pl-8 pr-3 py-1.5 text-sm text-slate-900 placeholder:text-slate-500 outline-none focus:border-amber-500 transition-colors"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {[['all', 'All'], ['mine', 'Mine to publish']].map(([val, label]) => (
              <button
                key={val}
                onClick={() => setStatusFilter(val)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${
                  statusFilter === val ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 hover:text-slate-900 border border-slate-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-2">
          {filtered.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-slate-500">
              {search ? 'Nothing matches your search' : 'No meetings yet — accepted invites show up here, or click New note.'}
            </div>
          )}
          {GROUPS.map(([key, label, hint]) => {
            const rows = groups[key];
            if (!rows.length) return null;
            const folded = key === 'done' && !doneOpen && !search;
            return (
              <section key={key} className="mb-3">
                <button
                  onClick={key === 'done' ? () => setDoneOpen(v => !v) : undefined}
                  className="w-full flex items-center justify-between px-2 pt-2 pb-1 text-[11px] font-bold uppercase tracking-wider text-slate-500"
                >
                  <span>{label} <span className="font-normal text-slate-400">{rows.length}</span></span>
                  {key === 'done' && !search && <span className="font-normal normal-case text-slate-400">{doneOpen ? 'Hide' : 'Show'}</span>}
                </button>
                {hint && !folded && <p className="px-2 pb-1 text-[11px] text-slate-400">{hint}</p>}
                {!folded && rows.map(n => (
                  <NoteRow key={n.id} note={n} tone={key} active={n.id === selected} onClick={() => setSelected(n.id)} />
                ))}
              </section>
            );
          })}
        </div>
      </div>

      {/* ── Right: the meeting ── */}
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
            <p className="text-sm">Pick a meeting, or start a new note</p>
          </div>
        )}
      </div>

      <NewNoteModal open={newOpen} clients={clients} onClose={() => setNewOpen(false)} onCreated={handleCreated} />
    </div>
  );
}
