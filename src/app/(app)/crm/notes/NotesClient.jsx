'use client';
import { useState, useRef, useCallback, useEffect } from 'react';

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
function pipelineBadge(pipeline) {
  if (pipeline === 'PROCUREMENT') return <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-blue-900/50 text-blue-300">Proc</span>;
  if (pipeline === 'DESIGN')      return <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-purple-900/50 text-purple-300">Design</span>;
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
  const linkedClients = note.clients?.map(nc => nc.client?.name).filter(Boolean).join(', ');
  const linkedDeals   = note.deals?.length || 0;

  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-3 border-b transition-colors ${
        active
          ? 'bg-slate-800 border-l-2 border-l-amber-400'
          : 'hover:bg-slate-800/60 border-l-2 border-l-transparent'
      }`}
      style={{ borderBottomColor: '#1e293b' }}
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <span className="text-sm font-medium text-slate-100 line-clamp-1 flex-1">
          {note.title || <span className="text-slate-500 italic">Untitled note</span>}
        </span>
        <span className="text-[10px] text-slate-500 shrink-0 mt-0.5">#{note.noteNumber}</span>
      </div>
      {note.meetingDate && (
        <div className="flex items-center gap-1 text-[11px] text-amber-400/80 mb-1">
          <IconCalendar />
          {fmt(note.meetingDate)}
        </div>
      )}
      {linkedClients && (
        <div className="text-[11px] text-slate-400 line-clamp-1 mb-0.5">{linkedClients}</div>
      )}
      <div className="flex items-center gap-2 mt-1">
        {linkedDeals > 0 && (
          <span className="text-[10px] text-slate-500">{linkedDeals} deal{linkedDeals !== 1 ? 's' : ''}</span>
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
    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs bg-slate-700 text-slate-200">
      {label}
      <button onClick={onRemove} className="text-slate-400 hover:text-white transition-colors ml-0.5">
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
    <div className="absolute z-50 top-full mt-1 left-0 w-72 rounded-lg shadow-xl border border-slate-600 bg-slate-800 overflow-hidden">
      <div className="p-2 border-b border-slate-700">
        <input
          ref={inputRef}
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder={placeholder}
          className="w-full bg-slate-900 text-sm text-slate-100 rounded px-2.5 py-1.5 outline-none placeholder:text-slate-500"
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
            className="w-full text-left px-3 py-2 text-sm text-slate-200 hover:bg-slate-700 transition-colors"
          >
            <span className="font-medium">{it.label}</span>
            {it.sub && <span className="ml-2 text-xs text-slate-400">{it.sub}</span>}
          </button>
        ))}
      </div>
      <div className="p-2 border-t border-slate-700">
        <button onClick={onClose} className="text-xs text-slate-400 hover:text-slate-200 transition-colors">Cancel</button>
      </div>
    </div>
  );
}

// ── NoteDetail ────────────────────────────────────────────────────────────────

function NoteDetail({ note, clients, deals, onUpdate, onDelete, currentUser }) {
  const isAdmin = ['SUPER_ADMIN', 'ILC_ADMIN', 'COMPANY_ADMIN', 'ADMIN'].includes(currentUser?.role);

  const [form, setForm] = useState({
    title:       note.title       || '',
    noteBody:    note.body        || '',
    meetingDate: fmtInput(note.meetingDate),
    attendees:   (() => {
      try { return JSON.parse(note.attendees || '[]').join(', '); } catch { return ''; }
    })(),
    calendarRef: note.calendarRef || '',
  });
  const formRef   = useRef(form);
  formRef.current = form;
  const debounceRef   = useRef(null);
  const savedTimerRef = useRef(null);
  const [saveStatus, setSaveStatus] = useState('idle');

  // Reset form when note changes
  useEffect(() => {
    const f = {
      title:       note.title       || '',
      noteBody:    note.body        || '',
      meetingDate: fmtInput(note.meetingDate),
      attendees:   (() => {
        try { return JSON.parse(note.attendees || '[]').join(', '); } catch { return ''; }
      })(),
      calendarRef: note.calendarRef || '',
    };
    setForm(f);
    formRef.current = f;
    setSaveStatus('idle');
    clearTimeout(debounceRef.current);
  }, [note.id]);

  const persist = useCallback(async (snapshot) => {
    setSaveStatus('saving');
    try {
      const attendeesArr = snapshot.attendees
        ? snapshot.attendees.split(',').map(s => s.trim()).filter(Boolean)
        : [];
      const res = await fetch(`/api/crm/notes/${note.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title:       snapshot.title,
          noteBody:    snapshot.noteBody,
          meetingDate: snapshot.meetingDate || null,
          attendees:   JSON.stringify(attendeesArr),
          calendarRef: snapshot.calendarRef || null,
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
  }, [note.id, onUpdate]);

  function scheduleSave(newForm, delay = 1000) {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => persist(newForm), delay);
  }

  function set(key, val, delay = 1000) {
    const next = { ...formRef.current, [key]: val };
    setForm(next);
    scheduleSave(next, delay);
  }

  // Linked clients
  const linkedClientIds = new Set(note.clients?.map(nc => nc.clientId) || []);
  const [showClientDrop, setShowClientDrop] = useState(false);
  const clientDropRef = useRef(null);

  // Linked deals
  const linkedDealIds = new Set(note.deals?.map(nd => nd.dealId) || []);
  const [showDealDrop, setShowDealDrop] = useState(false);
  const dealDropRef = useRef(null);

  useEffect(() => {
    function handleClick(e) {
      if (clientDropRef.current && !clientDropRef.current.contains(e.target)) setShowClientDrop(false);
      if (dealDropRef.current   && !dealDropRef.current.contains(e.target))   setShowDealDrop(false);
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
  async function addDeal(dealId) {
    const res = await fetch(`/api/crm/notes/${note.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ addDealIds: [dealId] }),
    });
    if (res.ok) onUpdate(await res.json());
    else alert('Failed to link deal: ' + await res.text());
  }
  async function removeDeal(dealId) {
    const res = await fetch(`/api/crm/notes/${note.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ removeDealIds: [dealId] }),
    });
    if (res.ok) onUpdate(await res.json());
    else alert('Failed to unlink deal: ' + await res.text());
  }

  async function handleDelete() {
    if (!confirm(`Delete note #${note.noteNumber}? This cannot be undone.`)) return;
    const res = await fetch(`/api/crm/notes/${note.id}`, { method: 'DELETE' });
    if (res.ok) onDelete(note.id);
  }

  const availableClients = clients.filter(c => !linkedClientIds.has(c.id)).map(c => ({
    id: c.id, label: c.name, sub: `#${c.clientNumber}`,
  }));
  const availableDeals = deals.filter(d => !linkedDealIds.has(d.id)).map(d => ({
    id: d.id,
    label: d.title || '(Untitled)',
    sub: `#${d.dealNumber} · ${d.pipeline === 'PROCUREMENT' ? 'Proc' : 'Design'}${d.client?.name ? ' · ' + d.client.name : ''}`,
  }));

  const saveColor = saveStatus === 'saving' ? 'text-slate-400' : saveStatus === 'saved' ? 'text-emerald-400' : saveStatus === 'error' ? 'text-red-400' : 'text-slate-600';
  const saveText  = saveStatus === 'saving' ? 'Saving…' : saveStatus === 'saved' ? 'Saved ✓' : saveStatus === 'error' ? 'Save failed' : '';

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-6 pt-5 pb-3 border-b border-slate-700/60 shrink-0">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs text-slate-500">Note #{note.noteNumber}</span>
          <span className={`text-xs transition-colors ${saveColor}`}>{saveText}</span>
        </div>
        <input
          value={form.title}
          onChange={e => set('title', e.target.value)}
          placeholder="Note title…"
          className="w-full bg-transparent text-xl font-semibold text-white placeholder:text-slate-600 outline-none"
        />
        <div className="flex items-center gap-1 mt-1 text-[11px] text-slate-500">
          <span>Created {fmt(note.createdAt)}</span>
          {note.createdBy?.name && <><span>·</span><span>{note.createdBy.name}</span></>}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">

        {/* Meeting date + Calendar ref */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Meeting Date</label>
            <input
              type="date"
              value={form.meetingDate}
              onChange={e => set('meetingDate', e.target.value, 0)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-amber-500 transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">
              Calendar Ref
              <span className="ml-1 text-slate-600 font-normal">(Outlook / Google)</span>
            </label>
            <input
              value={form.calendarRef}
              onChange={e => set('calendarRef', e.target.value)}
              placeholder="Event ID or URL"
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600 outline-none focus:border-amber-500 transition-colors"
            />
          </div>
        </div>

        {/* Attendees */}
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1">Attendees</label>
          <input
            value={form.attendees}
            onChange={e => set('attendees', e.target.value)}
            placeholder="Jane Smith, John Doe…  (comma-separated)"
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600 outline-none focus:border-amber-500 transition-colors"
          />
        </div>

        {/* Notes body */}
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1">Notes</label>
          <textarea
            value={form.noteBody}
            onChange={e => set('noteBody', e.target.value)}
            placeholder="Meeting notes, action items, follow-ups…"
            rows={10}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600 outline-none focus:border-amber-500 transition-colors resize-y leading-relaxed"
          />
        </div>

        {/* Linked Clients */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-medium text-slate-400">Linked Clients</label>
            <div className="relative" ref={clientDropRef}>
              <button
                onClick={() => setShowClientDrop(v => !v)}
                className="flex items-center gap-1 text-xs text-slate-400 hover:text-white transition-colors"
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

        {/* Linked Deals */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-medium text-slate-400">Linked Deals</label>
            <div className="relative" ref={dealDropRef}>
              <button
                onClick={() => setShowDealDrop(v => !v)}
                className="flex items-center gap-1 text-xs text-slate-400 hover:text-white transition-colors"
              >
                <IconPlus /> Add
              </button>
              {showDealDrop && (
                <AddLinkDropdown
                  placeholder="Search deals…"
                  items={availableDeals}
                  onAdd={addDeal}
                  onClose={() => setShowDealDrop(false)}
                />
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {note.deals?.length === 0 && (
              <span className="text-xs text-slate-600 italic">No deals linked</span>
            )}
            {note.deals?.map(nd => (
              <LinkedTag
                key={nd.dealId}
                label={`#${nd.deal?.dealNumber} ${nd.deal?.title || ''}`}
                onRemove={() => removeDeal(nd.dealId)}
              />
            ))}
          </div>
        </div>

      </div>

      {/* Footer */}
      {isAdmin && (
        <div className="shrink-0 px-6 py-3 border-t border-slate-700/60">
          <button
            onClick={handleDelete}
            className="text-xs text-slate-600 hover:text-red-400 transition-colors"
          >
            Delete this note
          </button>
        </div>
      )}
    </div>
  );
}

// ── NotesClient (main) ────────────────────────────────────────────────────────

export default function NotesClient({ initialNotes, clients, deals, currentUser }) {
  const isAdmin = ['SUPER_ADMIN', 'ILC_ADMIN', 'COMPANY_ADMIN', 'ADMIN'].includes(currentUser?.role);
  const [notes,    setNotes]    = useState(initialNotes);
  const [selected, setSelected] = useState(initialNotes[0]?.id || null);
  const [search,   setSearch]   = useState('');
  const [creating, setCreating] = useState(false);

  const activeNote = notes.find(n => n.id === selected) || null;

  const filtered = notes.filter(n => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      n.title?.toLowerCase().includes(q) ||
      n.body?.toLowerCase().includes(q)  ||
      n.clients?.some(nc => nc.client?.name?.toLowerCase().includes(q)) ||
      n.deals?.some(nd => nd.deal?.title?.toLowerCase().includes(q))
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
    <div className="flex h-screen bg-slate-900 text-slate-100">
      {/* ── Left panel ── */}
      <div className="w-80 shrink-0 flex flex-col border-r border-slate-700/60">
        {/* Header */}
        <div className="px-4 pt-4 pb-3 shrink-0 border-b border-slate-700/60">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h1 className="text-base font-semibold text-white">Sales Notes</h1>
              <p className="text-xs text-slate-500">{notes.length} note{notes.length !== 1 ? 's' : ''}</p>
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
          <div className="relative">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500"><IconSearch /></span>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search notes…"
              className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-8 pr-3 py-1.5 text-sm text-white placeholder:text-slate-500 outline-none focus:border-amber-500 transition-colors"
            />
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
            deals={deals}
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
