'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import ConfirmArchiveModal from '@/components/salesAutomation/ConfirmArchiveModal';

// ── Toolbar button ────────────────────────────────────────────────────────────
function Btn({ title, onMouseDown, children }) {
  return (
    <button
      title={title}
      onMouseDown={onMouseDown}
      className="px-2 py-1 rounded text-sm font-medium transition-colors select-none text-slate-500 hover:bg-slate-100 hover:text-slate-700"
    >
      {children}
    </button>
  );
}

// ── @mention dropdown ────────────────────────────────────────────────────────
function MentionDropdown({ users, query, position, onSelect, onClose }) {
  const filtered = users.filter(u => {
    const name  = (u.name  || '').toLowerCase();
    const email = (u.email || '').toLowerCase();
    const q     = query.toLowerCase();
    return name.includes(q) || email.includes(q);
  }).slice(0, 6);

  useEffect(() => {
    if (filtered.length === 0) onClose();
  }, [filtered.length]); // eslint-disable-line

  if (filtered.length === 0) return null;

  return (
    <div
      className="fixed z-50 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden"
      style={{ top: position.top + 24, left: position.left, minWidth: 220 }}
    >
      {filtered.map(u => (
        <button
          key={u.id}
          onMouseDown={e => { e.preventDefault(); onSelect(u); }}
          className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-amber-50 text-left transition-colors"
        >
          {/* Avatar */}
          <div className="w-6 h-6 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
            <span className="text-[10px] font-bold text-amber-600">
              {(u.name || u.email || '?')[0].toUpperCase()}
            </span>
          </div>
          <div className="min-w-0">
            <div className="text-sm font-medium text-slate-800 truncate">{u.name || u.email}</div>
            {u.name && <div className="text-[11px] text-slate-400 truncate">{u.email}</div>}
          </div>
        </button>
      ))}
    </div>
  );
}

// ── useUsers hook, fetch once per mount ─────────────────────────────────────
function useUsers() {
  const [users, setUsers] = useState([]);
  useEffect(() => {
    fetch('/api/users').then(r => r.json()).then(d => setUsers(d.users || [])).catch(() => {});
  }, []);
  return users;
}

// ── Note detail / editor view ─────────────────────────────────────────────────
function NoteDetail({ note, projectId, onBack, onUpdated, onDeleted }) {
  const [title,             setTitle]             = useState(note.title || '');
  const [meetingDate,       setMeetingDate]       = useState(note.meetingDate || '');
  const [meetingLink,       setMeetingLink]       = useState(note.meetingLink || '');
  const [isExternalVisible, setIsExternalVisible] = useState(
    note.isExternalVisible === 1 || note.isExternalVisible === true
  );
  const [attendees,    setAttendees]    = useState(() => {
    try { return note.attendees ? JSON.parse(note.attendees) : []; }
    catch { return []; }
  });
  const [attendeeInput, setAttendeeInput] = useState('');
  const [dirty,    setDirty]   = useState(false);
  const [saving,   setSaving]  = useState(false);
  const [deleting, setDeleting] = useState(false);       // archiving in flight
  const [archiveOpen, setArchiveOpen] = useState(false);
  const editorRef = useRef(null);

  // @mention state
  const users = useUsers();
  const [mention,      setMention]      = useState(null); // { query, position }
  const mentionStartRef = useRef(null); // the Range at which @ was typed

  // Populate editor when note changes
  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.innerHTML = note.content || '';
    }
  }, [note.id]);

  async function patch(data) {
    const res = await fetch(`/api/projects/${projectId}/meeting-notes/${note.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      const { note: updated } = await res.json();
      onUpdated(updated);
    }
  }

  async function toggleExternal() {
    const next = !isExternalVisible;
    setIsExternalVisible(next);
    await patch({ isExternalVisible: next });
  }

  async function saveContent() {
    if (!editorRef.current) return;
    setSaving(true);
    await patch({ content: editorRef.current.innerHTML });
    setSaving(false);
    setDirty(false);
  }

  function exec(cmd, val = null) {
    editorRef.current?.focus();
    document.execCommand(cmd, false, val);
    setDirty(true);
  }

  function toolbar(e, cmd, val = null) {
    e.preventDefault();
    exec(cmd, val);
  }

  // ── @mention detection ─────────────────────────────────────────────────────
  function detectMention() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    const range = sel.getRangeAt(0);
    if (!range.collapsed) return null;

    // Walk backwards from caret to find @
    const node = range.startContainer;
    if (node.nodeType !== Node.TEXT_NODE) return null;
    const text = node.textContent.slice(0, range.startOffset);
    const atIdx = text.lastIndexOf('@');
    if (atIdx === -1) return null;
    const query = text.slice(atIdx + 1);
    // Stop if there's whitespace (user typed past end of mention)
    if (query.includes(' ') || query.includes('\n')) return null;

    // Get pixel position for dropdown
    const rect = range.getBoundingClientRect();

    // Save the range start so we can replace later
    const startRange = range.cloneRange();
    startRange.setStart(node, atIdx);
    startRange.setEnd(node, range.startOffset);
    mentionStartRef.current = startRange;

    return { query, position: { top: rect.top + window.scrollY, left: rect.left } };
  }

  function handleEditorInput() {
    setDirty(true);
    const m = detectMention();
    setMention(m);
  }

  function handleEditorKeyDown(e) {
    if (e.key === 'Tab') {
      e.preventDefault();
      exec('insertHTML', '&nbsp;&nbsp;&nbsp;&nbsp;');
    }
    if (e.key === 'Escape' && mention) {
      e.preventDefault();
      setMention(null);
    }
  }

  function insertMention(user) {
    const displayName = user.name || user.email;
    // Replace the @query text with the mention span
    if (mentionStartRef.current) {
      mentionStartRef.current.deleteContents();
      const span = document.createElement('span');
      span.className = 'mention';
      span.dataset.userId = user.id;
      span.contentEditable = 'false';
      span.textContent = `@${displayName}`;
      span.style.cssText = 'color:#d97706;font-weight:600;border-radius:4px;padding:0 2px;';
      mentionStartRef.current.insertNode(span);
      // Move caret after the span
      const sel = window.getSelection();
      const after = document.createRange();
      after.setStartAfter(span);
      after.collapse(true);
      sel.removeAllRanges();
      sel.addRange(after);
      // Insert a space so the next char doesn't join the span
      document.execCommand('insertText', false, ' ');
    }
    setMention(null);
    setDirty(true);
  }

  function addAttendee(name) {
    const trimmed = name.trim();
    if (!trimmed || attendees.includes(trimmed)) return;
    const next = [...attendees, trimmed];
    setAttendees(next);
    patch({ attendees: JSON.stringify(next) });
  }

  function removeAttendee(name) {
    const next = attendees.filter(a => a !== name);
    setAttendees(next);
    patch({ attendees: JSON.stringify(next) });
  }

  // Meeting notes are archived, never deleted (Mike, 2026-09-11).
  async function archive() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/meeting-notes/${note.id}`, {
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
      onDeleted(note.id);
    } finally {
      setDeleting(false);
    }
  }

  const createdStr = new Date(note.createdAt).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
  const edited = note.updatedAt !== note.createdAt;

  return (
    <div className="space-y-4" onClick={() => mention && setMention(null)}>
      {/* Back nav */}
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-600 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        All Notes
      </button>

      {/* Metadata card */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
        {/* Title */}
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          onBlur={() => patch({ title })}
          onKeyDown={e => e.key === 'Enter' && e.target.blur()}
          placeholder="Meeting title…"
          className="w-full text-xl font-bold text-slate-800 bg-transparent focus:outline-none placeholder:text-slate-300"
        />

        {/* Date + Link row */}
        <div className="flex flex-wrap gap-5">
          {/* Meeting date */}
          <label className="flex items-center gap-2 text-slate-500 text-sm">
            <svg className="w-4 h-4 shrink-0 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <input
              type="date"
              value={meetingDate}
              onChange={e => setMeetingDate(e.target.value)}
              onBlur={() => patch({ meetingDate })}
              className="text-sm text-slate-600 bg-transparent border-b border-slate-200 focus:outline-none focus:border-amber-400 transition-colors"
            />
          </label>

          {/* Meeting link */}
          <label className="flex items-center gap-2 text-slate-500 text-sm flex-1 min-w-[220px]">
            <svg className="w-4 h-4 shrink-0 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
            <input
              type="url"
              value={meetingLink}
              onChange={e => setMeetingLink(e.target.value)}
              onBlur={() => patch({ meetingLink })}
              placeholder="Meeting link (Zoom, Google Meet…)"
              className="flex-1 text-sm text-slate-600 bg-transparent border-b border-slate-200 focus:outline-none focus:border-amber-400 transition-colors placeholder:text-slate-300"
            />
            {meetingLink && (
              <a href={meetingLink} target="_blank" rel="noopener noreferrer"
                className="text-amber-500 hover:text-amber-600 text-xs shrink-0">
                Open ↗
              </a>
            )}
          </label>
        </div>

        {/* Attendees */}
        <div className="flex flex-wrap items-center gap-2">
          <svg className="w-4 h-4 shrink-0 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          {attendees.map(a => (
            <span key={a}
              className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 text-xs font-medium"
            >
              {a}
              <button onClick={() => removeAttendee(a)}
                className="text-slate-300 hover:text-red-400 ml-0.5 leading-none">×</button>
            </span>
          ))}
          <input
            value={attendeeInput}
            onChange={e => setAttendeeInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault();
                addAttendee(attendeeInput);
                setAttendeeInput('');
              }
            }}
            onBlur={() => {
              if (attendeeInput.trim()) {
                addAttendee(attendeeInput);
                setAttendeeInput('');
              }
            }}
            placeholder={attendees.length === 0 ? 'Add attendees (press Enter)…' : 'Add another…'}
            className="text-sm text-slate-500 bg-transparent focus:outline-none placeholder:text-slate-300 min-w-[160px]"
          />
        </div>

        {/* External visibility toggle */}
        <div className="flex items-center justify-between pt-1 border-t border-slate-100">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            <span className="text-sm text-slate-600">Visible to external contacts</span>
            {isExternalVisible && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 font-mono">EXT</span>
            )}
          </div>
          <button
            onClick={toggleExternal}
            className={`relative w-9 h-5 rounded-full transition-colors shrink-0 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-1 ${isExternalVisible ? 'bg-amber-500' : 'bg-slate-200'}`}
            aria-label={isExternalVisible ? 'Hide from external contacts' : 'Make visible to external contacts'}
          >
            <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${isExternalVisible ? 'translate-x-4' : ''}`} />
          </button>
        </div>

        <p className="text-[11px] text-slate-300">
          Created {createdStr}{edited && ' · edited'}
        </p>
      </div>

      {/* Rich text editor card */}
      <div className="border border-slate-200 rounded-xl overflow-visible bg-white shadow-sm relative">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-0.5 px-3 py-2 border-b border-slate-100 bg-slate-50 rounded-t-xl">
          <Btn title="Bold (Ctrl+B)"      onMouseDown={e => toolbar(e, 'bold')}><strong>B</strong></Btn>
          <Btn title="Italic (Ctrl+I)"    onMouseDown={e => toolbar(e, 'italic')}><em>I</em></Btn>
          <Btn title="Underline (Ctrl+U)" onMouseDown={e => toolbar(e, 'underline')}><u>U</u></Btn>
          <div className="w-px h-5 bg-slate-200 mx-1" />
          <Btn title="Heading 1" onMouseDown={e => toolbar(e, 'formatBlock', 'H1')}>H1</Btn>
          <Btn title="Heading 2" onMouseDown={e => toolbar(e, 'formatBlock', 'H2')}>H2</Btn>
          <Btn title="Normal"    onMouseDown={e => toolbar(e, 'formatBlock', 'P')}>¶</Btn>
          <div className="w-px h-5 bg-slate-200 mx-1" />
          <Btn title="Bullet list"   onMouseDown={e => toolbar(e, 'insertUnorderedList')}>• List</Btn>
          <Btn title="Numbered list" onMouseDown={e => toolbar(e, 'insertOrderedList')}>1. List</Btn>
          <div className="w-px h-5 bg-slate-200 mx-1" />
          <Btn title="Indent"  onMouseDown={e => toolbar(e, 'indent')}>→</Btn>
          <Btn title="Outdent" onMouseDown={e => toolbar(e, 'outdent')}>←</Btn>
          <div className="w-px h-5 bg-slate-200 mx-1" />
          <span className="text-[11px] text-slate-300 px-1">@ to mention a user</span>
          <div className="flex-1" />
          {dirty && (
            <button
              onClick={saveContent}
              disabled={saving}
              className="px-4 py-2 text-sm font-semibold rounded-lg bg-orange-500 hover:bg-orange-600 text-white transition-colors disabled:opacity-60"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          )}
        </div>

        {/* Editable body */}
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onInput={handleEditorInput}
          onKeyDown={handleEditorKeyDown}
          className="min-h-[320px] p-5 text-sm text-slate-800 leading-relaxed focus:outline-none
            prose prose-sm max-w-none
            [&_h1]:text-xl [&_h1]:font-bold [&_h1]:mb-2 [&_h1]:mt-3
            [&_h2]:text-base [&_h2]:font-semibold [&_h2]:mb-1.5 [&_h2]:mt-2.5
            [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-1
            [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-1
            [&_li]:my-0.5 [&_strong]:font-semibold [&_p]:my-1
            [&_.mention]:text-amber-600 [&_.mention]:font-semibold [&_.mention]:rounded [&_.mention]:px-0.5"
          data-placeholder="Start typing your meeting notes… type @ to mention a user"
        />

        {/* @mention dropdown */}
        {mention && (
          <MentionDropdown
            users={users}
            query={mention.query}
            position={mention.position}
            onSelect={insertMention}
            onClose={() => setMention(null)}
          />
        )}

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 bg-slate-50 rounded-b-xl">
          <button
            onClick={() => setArchiveOpen(true)}
            disabled={deleting}
            className="text-xs text-slate-400 hover:text-amber-600 transition-colors disabled:opacity-60"
          >
            {deleting ? 'Archiving…' : 'Archive note'}
          </button>
          <ConfirmArchiveModal
            open={archiveOpen}
            title="Archive this meeting note?"
            what={note.title || 'Untitled meeting note'}
            body="It disappears from this project's meeting notes. Nothing is deleted, and you can restore it from the Archive page at any time."
            busy={deleting}
            onCancel={() => setArchiveOpen(false)}
            onConfirm={archive}
          />
          <button
            onClick={saveContent}
            disabled={saving || !dirty}
            className="px-4 py-2 text-sm font-semibold rounded-lg bg-orange-500 hover:bg-orange-600 text-white transition-colors disabled:opacity-40"
          >
            {saving ? 'Saving…' : 'Save Note'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Note list row ─────────────────────────────────────────────────────────────
function NoteRow({ note, onClick }) {
  const attendees = (() => {
    try { return note.attendees ? JSON.parse(note.attendees) : []; }
    catch { return []; }
  })();

  const displayDate = note.meetingDate
    ? new Date(note.meetingDate + 'T12:00:00').toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
      })
    : new Date(note.createdAt).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
      });

  // Extract @mentions from HTML for preview
  const parser = typeof window !== 'undefined' ? new DOMParser() : null;
  const mentions = (() => {
    if (!note.content || !parser) return [];
    try {
      const doc = parser.parseFromString(note.content, 'text/html');
      return [...doc.querySelectorAll('.mention')].map(el => el.textContent);
    } catch { return []; }
  })();

  const snippet = note.content
    ? note.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80)
    : '';

  return (
    <button
      onClick={onClick}
      className="w-full text-left flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50 border-b border-slate-100 last:border-b-0 transition-colors group"
    >
      <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center shrink-0">
        <svg className="w-4 h-4 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round"
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-700 truncate group-hover:text-slate-900">
          {note.title || 'Untitled Note'}
        </p>
        {/* Show attendees or mentions or snippet */}
        {attendees.length > 0 ? (
          <p className="text-xs text-slate-400 mt-0.5 truncate">{attendees.join(', ')}</p>
        ) : mentions.length > 0 ? (
          <p className="text-xs text-amber-500 mt-0.5 truncate">{mentions.join(', ')}</p>
        ) : snippet ? (
          <p className="text-xs text-slate-400 mt-0.5 truncate">{snippet}</p>
        ) : null}
      </div>

      <div className="shrink-0 flex items-center gap-2">
        {(note.isExternalVisible === 1 || note.isExternalVisible === true) && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 font-mono">EXT</span>
        )}
        <span className="text-xs text-slate-400">{displayDate}</span>
        <svg className="w-4 h-4 text-slate-300 group-hover:text-slate-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </button>
  );
}

// ── Main MeetingNotes component ───────────────────────────────────────────────
export default function MeetingNotes({ projectId }) {
  const [notes,      setNotes]      = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [activeNote, setActiveNote] = useState(null);
  const [creating,   setCreating]   = useState(false);

  useEffect(() => {
    fetch(`/api/projects/${projectId}/meeting-notes`)
      .then(r => r.json())
      .then(d => { setNotes(d.notes ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [projectId]);

  async function createNote() {
    setCreating(true);
    const title = new Date().toLocaleDateString('en-US', {
      month: 'long', day: 'numeric', year: 'numeric',
    }) + ': Meeting Notes';

    const res = await fetch(`/api/projects/${projectId}/meeting-notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, content: '' }),
    });
    if (res.ok) {
      const { note } = await res.json();
      setNotes(prev => [note, ...prev]);
      setActiveNote(note);
    }
    setCreating(false);
  }

  function handleUpdated(updated) {
    setNotes(prev => prev.map(n => n.id === updated.id ? updated : n));
    setActiveNote(updated);
  }

  function handleDeleted(id) {
    setNotes(prev => prev.filter(n => n.id !== id));
    setActiveNote(null);
  }

  if (activeNote) {
    return (
      <NoteDetail
        note={activeNote}
        projectId={projectId}
        onBack={() => setActiveNote(null)}
        onUpdated={handleUpdated}
        onDeleted={handleDeleted}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">Meeting Notes</h2>
          <p className="text-sm text-slate-400 mt-0.5">
            {loading
              ? 'Loading…'
              : notes.length > 0
                ? `${notes.length} note${notes.length !== 1 ? 's' : ''}`
                : 'No notes yet'}
          </p>
        </div>
        <button
          onClick={createNote}
          disabled={creating}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg bg-orange-500 hover:bg-orange-600 text-white transition-colors shadow-sm disabled:opacity-60"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          {creating ? 'Creating…' : 'New Note'}
        </button>
      </div>

      {!loading && notes.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
          <div className="px-5 py-2.5 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Title</span>
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Date</span>
          </div>
          {notes.map(note => (
            <NoteRow
              key={note.id}
              note={note}
              onClick={() => setActiveNote(note)}
            />
          ))}
        </div>
      )}

      {!loading && notes.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center mb-3">
            <svg className="w-6 h-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
          </div>
          <p className="text-sm font-medium text-slate-500">No meeting notes yet</p>
          <p className="text-xs text-slate-400 mt-1">Click New Note to create your first one</p>
        </div>
      )}
    </div>
  );
}
