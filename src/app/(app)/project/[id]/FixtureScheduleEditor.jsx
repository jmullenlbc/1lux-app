'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import FixtureImportModal from './FixtureImportModal';
import PushToBidModal from './PushToBidModal';
import { oversizeMessage, uploadErrorMessage } from '@/lib/uploadErrorMessage';
import { appendUpload } from '@/lib/uploadClient';
import { postParked } from '@/lib/parkedFetch';
import { FilterButton } from '@/components/ui/FilterPanel';
import SortHeader from '@/components/ui/SortHeader';
import { BTN_COMPACT, BTN_COMPACT_PRIMARY, BTN_PRIMARY, BTN_SECONDARY, CARD, INPUT, LABEL, MODAL } from '@/components/ui/tokens';

// ── Location tags, matches Peer Review Matrix exactly ───────────────────────
const LOCATION_TAGS = [
  { id: 'units',    label: 'Units'         },
  { id: 'corridor', label: 'Corridor'      },
  { id: 'garage',   label: 'Garage'        },
  { id: 'boh',      label: 'BOH'           },
  { id: 'amenity',  label: 'Amenity'       },
  { id: 'exterior', label: 'Exterior/Site' },
  { id: 'controls', label: 'Controls'      },
  { id: 'other',    label: 'Other'         },
];

const LOCATION_TAG_COLORS = {
  units:    'bg-pink-100 text-pink-700',
  corridor: 'bg-cyan-100 text-cyan-700',
  garage:   'bg-teal-600 text-white',
  boh:      'bg-orange-100 text-orange-700',
  amenity:  'bg-green-500 text-white',
  exterior: 'bg-green-100 text-green-700',
  controls: 'bg-violet-100 text-violet-700',
  other:    'bg-slate-100 text-slate-500',
};

// Resolve a stored value (id or legacy label string) to a tag object
function resolveLocationTag(value) {
  if (!value) return null;
  const v = value.toLowerCase().trim();
  return LOCATION_TAGS.find(t => t.id === v || t.label.toLowerCase() === v) || null;
}

// pct = percentage of total table width (must sum to ~100 for the visible set)
const COLUMNS = [
  { key: 'type',          label: 'Type',        pct: 6  },
  { key: 'location',      label: 'Location',    pct: 7  },
  { key: 'description',   label: 'Description', pct: 19 }, // ~30% of non-utility cols
  { key: 'manufacturer',  label: 'Mfr',         pct: 7  },
  { key: 'catalogNumber', label: 'Catalog #',   pct: 14 }, // ~75% of description
  { key: 'finish',        label: 'Finish',      pct: 7  }, // ~50% of catalog
  { key: 'cct',           label: 'CCT',         pct: 5  },
  { key: 'lumens',        label: 'Lumens',      pct: 5  },
  { key: 'wattage',       label: 'Watts',       pct: 4  },
  { key: 'voltage',       label: 'Voltage',     pct: 4  },
  { key: 'dimming',       label: 'Dimming',     pct: 5  },
  { key: 'mounting',      label: 'Mounting',    pct: 6  },
  { key: 'notes',         label: 'Notes',       pct: 9  }, // ~40% of description
];

const AI_SERVICE_TYPES = ['peerReview', 'bidOnly'];

function VersionBadge({ version, state, publishedAt }) {
  if (state === 'DRAFT') {
    return (
      <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">
        Draft
      </span>
    );
  }
  return (
    <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">
      v{version} · {new Date(publishedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
    </span>
  );
}

function Cell({ value, colKey, readOnly, isAlternate, onSave }) {
  const [editing, setEditing] = useState(false);
  const [local,   setLocal]   = useState(value ?? '');
  const inputRef = useRef(null);

  useEffect(() => { setLocal(value ?? ''); }, [value]);

  function startEdit() {
    if (readOnly) return;
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function commit() {
    setEditing(false);
    const trimmed = local.trim();
    if (trimmed !== (value ?? '').trim()) onSave(trimmed || null);
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        className="w-full h-full px-1.5 py-1 text-xs bg-orange-50 border border-orange-300 rounded outline-none"
        value={local}
        onChange={e => setLocal(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); commit(); }
          if (e.key === 'Escape') { setLocal(value ?? ''); setEditing(false); }
        }}
      />
    );
  }

  // Type cell gets special treatment for alternates
  if (colKey === 'type' && isAlternate) {
    return (
      <div
        className={`px-1.5 py-1 text-xs flex items-start gap-1.5 min-h-[28px] ${readOnly ? '' : 'cursor-text hover:bg-slate-50'}`}
        onClick={startEdit}
      >
        <span className="ml-3 text-slate-500 whitespace-nowrap font-mono font-semibold">{local || <span className="italic text-slate-400">—</span>}</span>
        <span className="text-[11px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-400 uppercase tracking-wide shrink-0 mt-0.5">ALT</span>
      </div>
    );
  }

  // Type column: monospace, no-wrap, always fits on one line
  if (colKey === 'type') {
    return (
      <div
        className={`px-1.5 py-1.5 text-xs rounded min-h-[28px] whitespace-nowrap font-mono font-semibold leading-snug ${readOnly ? 'text-slate-600' : 'cursor-text hover:bg-slate-50 text-slate-700'} ${!local ? 'text-slate-400' : ''}`}
        onClick={startEdit}
      >
        {local || (readOnly ? '—' : <span className="italic font-normal text-slate-400">—</span>)}
      </div>
    );
  }

  return (
    <div
      className={`px-1.5 py-1.5 text-xs rounded min-h-[28px] whitespace-normal break-words leading-snug ${readOnly ? 'text-slate-600' : 'cursor-text hover:bg-slate-50 text-slate-700'} ${!local ? 'text-slate-400' : ''}`}
      onClick={startEdit}
    >
      {local || (readOnly ? '—' : <span className="italic text-slate-400">—</span>)}
    </div>
  );
}

// ── Location tag chip + dropdown ─────────────────────────────────────────────
function LocationCell({ value, readOnly, onSave }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const tag = resolveLocationTag(value);

  useEffect(() => {
    function handler(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  if (readOnly) {
    return tag
      ? <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap ${LOCATION_TAG_COLORS[tag.id]}`}>{tag.label}</span>
      : <span className="text-xs text-slate-500">{value || '—'}</span>;
  }

  return (
    <div ref={ref} className="relative px-1 py-1">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`px-2 py-0.5 rounded-full text-[11px] font-semibold cursor-pointer whitespace-nowrap transition-colors ${
          tag ? LOCATION_TAG_COLORS[tag.id] : 'bg-slate-100 text-slate-400 hover:bg-slate-200 italic'
        }`}
      >
        {tag?.label || 'Set tag…'}
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 w-36 bg-white rounded-lg shadow-xl border border-slate-200 z-50 overflow-hidden py-1">
          <button
            onClick={() => { onSave(null); setOpen(false); }}
            className="w-full text-left px-3 py-1.5 hover:bg-slate-50 text-xs text-slate-500 italic"
          >
            Clear
          </button>
          {LOCATION_TAGS.map(t => (
            <button
              key={t.id}
              onClick={() => { onSave(t.id); setOpen(false); }}
              className={`w-full text-left px-3 py-1.5 hover:bg-slate-50 flex items-center gap-2 ${value === t.id ? 'bg-slate-50' : ''}`}
            >
              <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${LOCATION_TAG_COLORS[t.id]}`}>
                {t.label}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function DragHandle({ dragging }) {
  return (
    <div className={`cursor-grab active:cursor-grabbing flex items-center justify-center w-5 text-slate-500 hover:text-slate-700 ${dragging ? 'text-orange-500' : ''}`}>
      <svg viewBox="0 0 10 16" className="w-2.5 h-4 fill-current">
        <circle cx="3" cy="2"  r="1.5" />
        <circle cx="7" cy="2"  r="1.5" />
        <circle cx="3" cy="6"  r="1.5" />
        <circle cx="7" cy="6"  r="1.5" />
        <circle cx="3" cy="10" r="1.5" />
        <circle cx="7" cy="10" r="1.5" />
        <circle cx="3" cy="14" r="1.5" />
        <circle cx="7" cy="14" r="1.5" />
      </svg>
    </div>
  );
}

// ── Parse from PDF modal ──────────────────────────────────────────────────────
function ParseFromPdfModal({ projectId, onParsed, onClose }) {
  const [file,     setFile]     = useState(null);
  const [parsing,  setParsing]  = useState(false);
  const [error,    setError]    = useState(null);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef(null);

  function onDrop(e) {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) { setFile(dropped); setError(null); }
  }

  async function doParse() {
    if (!file) return;
    const tooBig = oversizeMessage(file);
    if (tooBig) { setError(tooBig); return; }
    setParsing(true);
    setError(null);
    try {
      const fd = new FormData();
      await appendUpload(fd, file, { scope: 'project' });
      // Park-and-poll: the read runs in steps behind the front door and the
      // answer arrives with the same body and status it always had.
      const res  = await postParked(`/api/projects/${projectId}/fixture-schedule/parse`, fd);
      if (!res.ok) throw new Error(await uploadErrorMessage(res, file));
      const data = await res.json();
      if (data.error && data.importedCount === 0) {
        setError(data.error);
        setParsing(false);
        return;
      }
      onParsed({ importedCount: data.importedCount || 0, flaggedCount: data.flaggedCount || 0 });
    } catch (e) {
      setError(e.message || 'Parse failed');
      setParsing(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h2 className="font-semibold text-slate-800">Parse Fixture Schedule from PDF</h2>
            <p className="text-xs text-slate-500 mt-0.5">Upload 1 to 3 pages containing the fixture schedule table</p>
          </div>
          <button className="text-slate-500 hover:text-slate-700" onClick={onClose} disabled={parsing}>
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Drop zone */}
          <div
            onClick={() => !parsing && fileRef.current?.click()}
            onDragOver={e => { e.preventDefault(); if (!parsing) setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center gap-2 transition-colors ${
              parsing  ? 'border-orange-200 bg-orange-50 pointer-events-none' :
              dragging ? 'border-orange-400 bg-orange-50 cursor-copy' :
              file     ? 'border-green-300 bg-green-50 cursor-pointer' :
                         'border-slate-200 hover:border-slate-400 hover:bg-slate-50 cursor-pointer'
            }`}
          >
            {parsing ? (
              <>
                <svg className="animate-spin w-7 h-7 text-orange-500" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
                </svg>
                <p className="text-sm font-medium text-slate-700">Parsing with AI…</p>
                <p className="text-xs text-slate-500">This may take 15 to 30 seconds</p>
              </>
            ) : file ? (
              <>
                <svg className="w-7 h-7 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
                <p className="text-sm font-semibold text-slate-800 truncate max-w-full px-4 text-center">{file.name}</p>
                <p className="text-xs text-slate-500">Click to change file</p>
              </>
            ) : (
              <>
                <svg className="w-7 h-7 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                </svg>
                <p className="text-sm text-slate-600">Drop PDF or click to browse</p>
                <p className="text-xs text-slate-500">PDF only · max 3 pages</p>
              </>
            )}
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,application/pdf"
              className="hidden"
              onChange={e => { if (e.target.files[0]) { setFile(e.target.files[0]); setError(null); } e.target.value = ''; }}
            />
          </div>

          <p className="text-xs text-slate-500">
            Extract just the fixture schedule pages from the full drawing set in Bluebeam or Acrobat before uploading.
            The AI will map each row to ILC's canonical fixture schedule columns.
          </p>

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-600">{error}</div>
          )}

          <div className="flex justify-end gap-3">
            <button
              className="text-sm px-4 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
              onClick={onClose}
              disabled={parsing}
            >
              Cancel
            </button>
            <button
              className="text-sm px-5 py-2 rounded-lg bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-40 transition-colors flex items-center gap-2"
              onClick={doParse}
              disabled={!file || parsing}
            >
              {parsing && (
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <circle className="opacity-25" cx="12" cy="12" r="10"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
                </svg>
              )}
              {parsing ? 'Parsing…' : 'Parse'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Share Modal ───────────────────────────────────────────────────────────────
function ShareModal({ projectId, onClose }) {
  const [share,      setShare]      = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [generating, setGenerating] = useState(false);
  const [permission, setPermission] = useState('view');
  const [copied,     setCopied]     = useState(false);
  const [emailMode,  setEmailMode]  = useState(false);
  const [emailTo,    setEmailTo]    = useState('');
  const [emailMsg,   setEmailMsg]   = useState('');
  const [sending,    setSending]    = useState(false);
  const [sent,       setSent]       = useState(false);

  useEffect(() => {
    fetch(`/api/projects/${projectId}/fixture-schedule/share`)
      .then(r => r.json())
      .then(d => { setShare(d.share); setLoading(false); })
      .catch(() => setLoading(false));
  }, [projectId]);

  async function generate() {
    setGenerating(true);
    try {
      const res  = await fetch(`/api/projects/${projectId}/fixture-schedule/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permission }),
      });
      const data = await res.json();
      setShare(data.share);
    } finally { setGenerating(false); }
  }

  async function revoke() {
    if (!confirm('Revoke this share link? Anyone with the current link will lose access.')) return;
    await fetch(`/api/projects/${projectId}/fixture-schedule/share`, { method: 'DELETE' });
    setShare(null);
  }

  function shareUrl() {
    const base = window.location.origin;
    return `${base}/share/fixture/${share.token}`;
  }

  function copyLink() {
    navigator.clipboard.writeText(shareUrl()).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  async function sendEmail() {
    if (!emailTo.trim()) return;
    setSending(true);
    try {
      await fetch(`/api/projects/${projectId}/notify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type:    'FIXTURE_SHARE',
          to:      emailTo.trim(),
          message: emailMsg.trim() || `Please review the fixture schedule for this project.`,
          shareUrl: shareUrl(),
          permission: share.permission,
        }),
      });
      setSent(true);
      setTimeout(() => { setSent(false); setEmailMode(false); setEmailTo(''); setEmailMsg(''); }, 2500);
    } catch {} finally { setSending(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h2 className="font-semibold text-slate-800">Share Fixture Schedule</h2>
            <p className="text-xs text-slate-500 mt-0.5">Share a live link with external consultants</p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-700">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-slate-400 gap-2 text-sm">
              <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
              </svg>
              Loading…
            </div>
          ) : share ? (
            <>
              {/* Active link */}
              <div className="bg-green-50 border border-green-200 rounded-xl p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-green-500" />
                  <span className="text-xs font-semibold text-green-700 uppercase tracking-wide">Active link</span>
                  <span className={`ml-auto text-[11px] font-bold px-2 py-0.5 rounded-full border ${share.permission === 'edit' ? 'bg-orange-50 text-orange-700 border-orange-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                    {share.permission === 'edit' ? '✎ Edit' : '👁 View only'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    readOnly
                    value={shareUrl()}
                    className="flex-1 text-xs bg-white border border-green-200 rounded-lg px-3 py-1.5 text-slate-600 focus:outline-none"
                    onClick={e => e.target.select()}
                  />
                  <button
                    onClick={copyLink}
                    className={`shrink-0 text-xs px-3 py-1.5 rounded-lg font-semibold transition-colors ${copied ? 'bg-green-500 text-white' : 'bg-slate-800 text-white hover:bg-slate-700'}`}
                  >
                    {copied ? '✓ Copied!' : 'Copy'}
                  </button>
                </div>
                {share.lastViewedAt && (
                  <p className="text-[11px] text-green-600">Last viewed: {new Date(share.lastViewedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                )}
              </div>

              {/* Email option */}
              {!emailMode ? (
                <button onClick={() => setEmailMode(true)}
                  className="w-full flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition-colors">
                  <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                  </svg>
                  Email this link…
                </button>
              ) : (
                <div className="space-y-3 bg-slate-50 rounded-xl p-4 border border-slate-200">
                  <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Send via email</p>
                  <input
                    type="email"
                    placeholder="recipient@firm.com"
                    value={emailTo}
                    onChange={e => setEmailTo(e.target.value)}
                    className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                  <textarea
                    placeholder="Optional message…"
                    value={emailMsg}
                    onChange={e => setEmailMsg(e.target.value)}
                    rows={2}
                    className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none"
                  />
                  <div className="flex gap-2">
                    <button onClick={() => setEmailMode(false)} className="flex-1 px-3 py-2 rounded-lg text-sm border border-slate-200 text-slate-600 hover:bg-slate-100 transition-colors">
                      Cancel
                    </button>
                    <button
                      onClick={sendEmail}
                      disabled={!emailTo.trim() || sending}
                      className="flex-1 px-3 py-2 rounded-lg text-sm font-semibold bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-50 transition-colors"
                    >
                      {sent ? '✓ Sent!' : sending ? 'Sending…' : 'Send Email'}
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-500">Or use your email client: <a href={`mailto:${emailTo}?subject=Fixture Schedule&body=${encodeURIComponent(`Hi,\n\n${emailMsg}\n\nView the fixture schedule here: ${shareUrl()}\n\nShared via ILC Studios Budget Platform`)}`} className="text-orange-600 underline" target="_blank" rel="noopener noreferrer">Open in Mail app ↗</a></p>
                </div>
              )}

              {/* Revoke + regenerate */}
              <div className="flex gap-2 pt-1 border-t border-slate-100">
                <button onClick={generate} disabled={generating}
                  className="flex-1 text-xs px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">
                  {generating ? 'Regenerating…' : 'Regenerate link'}
                </button>
                <button onClick={revoke}
                  className="flex-1 text-xs px-3 py-2 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition-colors">
                  Revoke link
                </button>
              </div>
            </>
          ) : (
            <>
              {/* No link yet, create one */}
              <div className="space-y-3">
                <p className="text-sm text-slate-600">Create a shareable link to this fixture schedule. Share it with external design consultants.</p>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Permission</label>
                  <div className="flex gap-2">
                    {[
                      { value: 'view', label: '👁  View only', desc: 'Can see the schedule but not edit' },
                      { value: 'edit', label: '✎  Can edit',  desc: 'Can update any cell directly' },
                    ].map(opt => (
                      <label key={opt.value} className={`flex-1 flex flex-col gap-1 rounded-lg border p-3 cursor-pointer transition-colors ${permission === opt.value ? 'border-orange-400 bg-orange-50' : 'border-slate-200 hover:border-slate-300'}`}>
                        <input type="radio" name="perm" value={opt.value} checked={permission === opt.value} onChange={() => setPermission(opt.value)} className="hidden" />
                        <span className="text-sm font-semibold text-slate-700">{opt.label}</span>
                        <span className="text-[11px] text-slate-500">{opt.desc}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <button
                  onClick={generate}
                  disabled={generating}
                  className="w-full py-2.5 rounded-lg bg-orange-500 text-white text-sm font-semibold hover:bg-orange-600 disabled:opacity-50 transition-colors"
                >
                  {generating ? 'Creating link…' : 'Create share link'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Manufacturer select cell ──────────────────────────────────────────────────
function MfrSelectCell({ value, manufacturers, readOnly, onSave, onOpenCreate }) {
  const [open, setOpen] = useState(false);
  const [q,    setQ]    = useState('');
  const ref = useRef(null);

  useEffect(() => {
    function handler(e) { if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setQ(''); } }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  if (readOnly) {
    return (
      <div className="px-1.5 py-1.5 text-xs text-slate-800 font-medium whitespace-normal break-words min-h-[28px]">
        {value || <span className="text-slate-400 italic">—</span>}
      </div>
    );
  }

  const filtered = manufacturers.filter(m => m.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <div ref={ref} className="relative">
      <div
        onClick={() => { setOpen(o => !o); setQ(''); }}
        className="px-1.5 py-1.5 text-xs cursor-pointer hover:bg-slate-50 rounded min-h-[28px] text-slate-800 font-medium whitespace-normal break-words"
      >
        {value || <span className="text-slate-400 italic">Select mfr…</span>}
      </div>
      {open && (
        <div className="absolute top-full left-0 mt-0.5 w-56 bg-white rounded-lg shadow-xl border border-slate-200 z-50 overflow-hidden">
          <div className="p-1.5 border-b border-slate-100">
            <input
              autoFocus
              value={q}
              onChange={e => setQ(e.target.value)}
              className="w-full text-xs border border-slate-200 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-orange-500"
              placeholder="Search manufacturers…"
              onKeyDown={e => e.key === 'Escape' && setOpen(false)}
            />
          </div>
          <div className="max-h-48 overflow-y-auto">
            {filtered.length > 0 ? filtered.map(m => (
              <button key={m.id} onClick={() => { onSave(m.name); setOpen(false); setQ(''); }}
                className={`w-full text-left px-3 py-1.5 text-xs hover:bg-orange-50 hover:text-orange-700 transition-colors ${value === m.name ? 'bg-orange-50 text-orange-700 font-semibold' : ''}`}>
                {m.name}
              </button>
            )) : (
              <p className="px-3 py-2 text-xs text-slate-500 italic">No match</p>
            )}
          </div>
          <div className="border-t border-slate-100 p-1.5">
            <button onClick={() => { setOpen(false); onOpenCreate(); }}
              className="w-full text-left px-2 py-1 text-xs text-orange-600 hover:bg-orange-50 rounded font-semibold transition-colors">
              + New Manufacturer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── New Manufacturer modal (admin) ────────────────────────────────────────────
function NewMfrModal({ onCreated, onClose }) {
  const [name,    setName]    = useState('');
  const [website, setWebsite] = useState('');
  const [saving,  setSaving]  = useState(false);
  const [err,     setErr]     = useState('');

  async function submit(e) {
    e.preventDefault();
    if (!name.trim()) { setErr('Name required'); return; }
    setSaving(true);
    const res = await fetch('/api/manufacturers', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), website: website.trim() || null }),
    });
    const data = await res.json();
    if (!res.ok) { setErr(data.error || 'Failed'); setSaving(false); return; }
    onCreated(data.manufacturer);
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xl w-full max-w-sm p-6">
        <h3 className="font-bold text-slate-900 mb-4">New Manufacturer</h3>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Name *</label>
            <input autoFocus value={name} onChange={e => setName(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              placeholder="e.g. Lithonia Lighting" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Website</label>
            <input value={website} onChange={e => setWebsite(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              placeholder="https://" />
          </div>
          {err && <p className="text-xs text-red-600">{err}</p>}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
            <button type="submit" disabled={saving}
              className="flex-1 px-4 py-2 rounded-lg bg-orange-500 text-white text-sm font-semibold hover:bg-orange-600 disabled:opacity-60">
              {saving ? 'Saving…' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function FixtureScheduleEditor({ projectId, serviceType }) {
  const [draft,         setDraft]         = useState(null);
  const [published,     setPublished]     = useState([]);
  const [selectedId,    setSelectedId]    = useState('draft');
  const [loading,       setLoading]       = useState(true);
  const [saving,        setSaving]        = useState(false);
  const [error,         setError]         = useState(null);
  const [showInternal,  setShowInternal]  = useState(false);
  const [showImport,    setShowImport]    = useState(false);
  const [showPush,      setShowPush]      = useState(false);
  const [showParse,     setShowParse]     = useState(false);
  const [showShare,     setShowShare]     = useState(false);
  const [parseBanner,   setParseBanner]   = useState(null); // { importedCount, flaggedCount }
  const [renamingVerId, setRenamingVerId] = useState(null); // versionId being renamed
  const [renameInput,   setRenameInput]   = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(null); // { id, label }
  const [dragOverId,    setDragOverId]    = useState(null);
  const [sortCol,       setSortCol]       = useState(null);
  const [sortDir,       setSortDir]       = useState('asc');
  const [searchQuery,   setSearchQuery]   = useState('');
  const [conditions,    setConditions]    = useState([]);   // [{ id, field, op, value }]
  const [showFilters,   setShowFilters]   = useState(false);
  const [manufacturers, setManufacturers] = useState([]);
  const [showNewMfr,    setShowNewMfr]    = useState(false);
  const dragItemId = useRef(null);

  const FILTER_OPS = [
    { value: 'contains',    label: 'contains'    },
    { value: 'not_contains', label: 'does not contain' },
    { value: 'equals',      label: 'equals'      },
    { value: 'starts_with', label: 'starts with' },
    { value: 'empty',       label: 'is empty'    },
    { value: 'not_empty',   label: 'is not empty'},
  ];

  function addCondition() {
    setConditions(prev => [...prev, { id: Date.now(), field: 'type', op: 'contains', value: '' }]);
    setShowFilters(true);
  }

  function updateCondition(id, patch) {
    setConditions(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c));
  }

  function removeCondition(id) {
    setConditions(prev => prev.filter(c => c.id !== id));
  }

  function matchesCondition(item, cond) {
    const cellVal = (item[cond.field] ?? '').toString().toLowerCase().trim();
    const condVal = (cond.value ?? '').toLowerCase().trim();
    switch (cond.op) {
      case 'contains':     return cellVal.includes(condVal);
      case 'not_contains': return !cellVal.includes(condVal);
      case 'equals':       return cellVal === condVal;
      case 'starts_with':  return cellVal.startsWith(condVal);
      case 'empty':        return cellVal === '';
      case 'not_empty':    return cellVal !== '';
      default:             return true;
    }
  }

  function toggleSort(key) {
    if (sortCol === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(key); setSortDir('asc'); }
  }

  const isAiServiceType = AI_SERVICE_TYPES.includes(serviceType);
  const activeSchedule  = selectedId === 'draft' ? draft : published.find(p => p.id === selectedId);
  const isReadOnly      = selectedId !== 'draft';

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/fixture-schedule`);
      if (!res.ok) throw new Error('Failed to load');
      const data = await res.json();
      setDraft(data.draft);
      setPublished(data.published);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    fetch('/api/manufacturers').then(r => r.json()).then(d => setManufacturers(d.manufacturers || []));
  }, [projectId]);

  async function renameVersion(versionId) {
    await fetch(`/api/projects/${projectId}/fixture-schedule/versions/${versionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ submissionTag: renameInput }),
    });
    setPublished(prev => prev.map(p => p.id === versionId ? { ...p, submissionTag: renameInput.trim() || null } : p));
    setRenamingVerId(null);
    setRenameInput('');
  }

  async function deleteVersion(versionId) {
    // Refused when a budget version was built from this schedule: budget
    // versions are archive-only and would go with it (migration 0076).
    const res = await fetch(`/api/projects/${projectId}/fixture-schedule/versions/${versionId}`, { method: 'DELETE' }).catch(() => null);
    if (!res?.ok) {
      const data = res ? await res.json().catch(() => ({})) : {};
      setDeleteConfirm(null);
      alert(data.error || 'Could not delete it. Nothing was changed.');
      return;
    }
    setPublished(prev => prev.filter(p => p.id !== versionId));
    if (selectedId === versionId) setSelectedId('draft');
    setDeleteConfirm(null);
  }

  // afterId: insert after this item ID (or null to append at end)
  async function addRow(afterId = null) {
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/fixture-schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error('Failed to add row');
      const item = await res.json();
      setDraft(prev => {
        const items = [...prev.items];
        if (afterId) {
          const idx = items.findIndex(i => i.id === afterId);
          items.splice(idx + 1, 0, item);
        } else {
          items.push(item);
        }
        return { ...prev, items };
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function saveCell(itemId, field, value) {
    try {
      const body = { [field]: value };
      // When user edits any cell on a flagged row, clear the ai flag
      const item = draft?.items?.find(i => i.id === itemId);
      if (item?.aiFlagged) body.aiFlagged = false;

      const res = await fetch(`/api/projects/${projectId}/fixture-schedule/items/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Failed to save');
      const updated = await res.json();
      setDraft(prev => ({
        ...prev,
        items: prev.items.map(i => i.id === itemId ? { ...i, ...updated } : i),
      }));
    } catch (e) {
      setError(e.message);
    }
  }

  async function deleteRow(itemId) {
    if (!confirm('Delete this row?')) return;
    try {
      const res = await fetch(`/api/projects/${projectId}/fixture-schedule/items/${itemId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete');
      setDraft(prev => ({ ...prev, items: prev.items.filter(i => i.id !== itemId) }));
    } catch (e) {
      setError(e.message);
    }
  }

  // ── Drag-to-reorder ───────────────────────────────────────────────────────

  function onDragStart(e, itemId) {
    dragItemId.current = itemId;
    e.dataTransfer.effectAllowed = 'move';
  }

  function onDragOver(e, itemId) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverId(itemId);
  }

  function onDragLeave() { setDragOverId(null); }

  async function onDrop(e, targetId) {
    e.preventDefault();
    setDragOverId(null);
    const srcId = dragItemId.current;
    if (!srcId || srcId === targetId) return;

    const items = [...(draft?.items ?? [])];
    const srcIdx = items.findIndex(i => i.id === srcId);
    const tgtIdx = items.findIndex(i => i.id === targetId);
    if (srcIdx < 0 || tgtIdx < 0) return;

    const [moved] = items.splice(srcIdx, 1);
    items.splice(tgtIdx, 0, moved);
    const reordered = items.map((item, idx) => ({ ...item, sortOrder: idx }));
    setDraft(prev => ({ ...prev, items: reordered }));

    try {
      await fetch(`/api/projects/${projectId}/fixture-schedule`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reorder: reordered.map(i => ({ id: i.id, sortOrder: i.sortOrder })) }),
      });
    } catch {
      load();
    }
  }

  function onDragEnd() {
    dragItemId.current = null;
    setDragOverId(null);
  }

  // ── After AI parse ────────────────────────────────────────────────────────

  async function handleParsed({ importedCount, flaggedCount }) {
    setShowParse(false);
    setParseBanner({ importedCount, flaggedCount });
    await load(); // reload table with AI-parsed rows
    setSelectedId('draft');
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-400 text-sm">
        Loading fixture schedule…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl bg-red-50 border border-red-100 p-4 text-sm text-red-600">
        {error} <button className="underline ml-2" onClick={load}>Retry</button>
      </div>
    );
  }

  const rawItems = activeSchedule?.items ?? [];
  const flaggedCount = rawItems.filter(i => i.aiFlagged).length;
  const visibleCols = showInternal
    ? [...COLUMNS, { key: 'internalNotes', label: 'Internal Notes', pct: 9 }]
    : COLUMNS;

  // Apply global search
  const searchedItems = searchQuery.trim()
    ? rawItems.filter(item =>
        Object.values(item).some(v =>
          v != null && v.toString().toLowerCase().includes(searchQuery.toLowerCase())
        )
      )
    : rawItems;

  // Apply conditions (all must match, AND logic)
  const activeConditions = conditions.filter(c => c.op === 'empty' || c.op === 'not_empty' || c.value.trim() !== '');
  const filteredItems = activeConditions.length === 0
    ? searchedItems
    : searchedItems.filter(item => activeConditions.every(c => matchesCondition(item, c)));

  // Apply sort
  const items = sortCol
    ? [...filteredItems].sort((a, b) => {
        const av = (a[sortCol] ?? '').toString().toLowerCase();
        const bv = (b[sortCol] ?? '').toString().toLowerCase();
        return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      })
    : filteredItems;

  const isFiltering = searchQuery.trim() || activeConditions.length > 0;

  return (
    <div className="space-y-4">

      {/* ── Parse banner ───────────────────────────────────────────────────── */}
      {parseBanner && (
        <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-lg px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-slate-700">
            <svg className="w-4 h-4 text-slate-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>
              <strong>{parseBanner.importedCount}</strong> fixture{parseBanner.importedCount !== 1 ? 's' : ''} imported.
              {parseBanner.flaggedCount > 0 && (
                <span className="text-amber-700"> <strong>{parseBanner.flaggedCount}</strong> row{parseBanner.flaggedCount !== 1 ? 's' : ''} flagged for review.</span>
              )}
            </span>
          </div>
          <button className="text-slate-500 hover:text-slate-700" onClick={() => setParseBanner(null)}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* ── Flagged rows warning ────────────────────────────────────────────── */}
      {!isReadOnly && flaggedCount > 0 && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
          <svg className="w-4 h-4 text-amber-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          <span><strong>{flaggedCount}</strong> row{flaggedCount !== 1 ? 's' : ''} flagged for review, highlighted in amber below. Edit any cell to clear the flag.</span>
        </div>
      )}

      {/* ── Header bar ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Version selector */}
          <select
            className="text-xs border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-500"
            value={selectedId}
            onChange={e => setSelectedId(e.target.value)}
          >
            <option value="draft">Draft (current)</option>
            {published.map(p => (
              <option key={p.id} value={p.id}>
                v{p.version} · {new Date(p.publishedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                {p.submissionTag ? ` · ${p.submissionTag}` : ''}
              </option>
            ))}
          </select>

          {/* Rename / delete controls for the selected published version */}
          {isReadOnly && activeSchedule && (
            renamingVerId === activeSchedule.id ? (
              <div className="flex items-center gap-1.5">
                <input
                  autoFocus
                  value={renameInput}
                  onChange={e => setRenameInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') renameVersion(activeSchedule.id); if (e.key === 'Escape') { setRenamingVerId(null); setRenameInput(''); } }}
                  placeholder="Label (optional)"
                  className="text-xs border border-slate-300 rounded-lg px-2 py-1 w-32 focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
                <button onClick={() => renameVersion(activeSchedule.id)} className="text-xs font-semibold px-2 py-1 rounded-lg bg-orange-500 text-white hover:bg-orange-600">Save</button>
                <button onClick={() => { setRenamingVerId(null); setRenameInput(''); }} className="text-xs font-semibold px-2 py-1 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50">Cancel</button>
              </div>
            ) : (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => { setRenamingVerId(activeSchedule.id); setRenameInput(activeSchedule.submissionTag || ''); }}
                  title="Rename this version"
                  className="p-1.5 rounded text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
                <button
                  onClick={() => setDeleteConfirm({ id: activeSchedule.id, label: `v${activeSchedule.version}${activeSchedule.submissionTag ? ` · ${activeSchedule.submissionTag}` : ''}` })}
                  title="Delete this version"
                  className="p-1.5 rounded text-slate-500 hover:text-red-600 hover:bg-red-50 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            )
          )}

          {activeSchedule && (
            <VersionBadge
              version={activeSchedule.version}
              state={activeSchedule.state}
              publishedAt={activeSchedule.publishedAt}
            />
          )}

          {isReadOnly && (
            <span className="px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-500">
              Read-only snapshot
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Global search */}
          <div className="relative">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <input
              type="text"
              placeholder="Search all fields…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="text-xs pl-7 pr-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500 w-44"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            )}
          </div>

          {/* Condition filter toggle */}
          <FilterButton
            count={activeConditions.length}
            open={showFilters}
            onClick={() => setShowFilters(v => !v)}
          />

          <button
            className={BTN_COMPACT}
            onClick={() => setShowInternal(v => !v)}
          >
            {showInternal ? 'Hide' : 'Show'} Internal Notes
          </button>

          <a
            href={`/api/projects/${projectId}/fixture-schedule/export?version=${isReadOnly ? activeSchedule?.version : 'draft'}`}
            className={`${BTN_COMPACT} no-underline`}
            download
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            Export
          </a>

          <button
            className={BTN_COMPACT}
            onClick={() => setShowShare(true)}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" />
            </svg>
            Share
          </button>

          {!isReadOnly && (
            <button
              className={BTN_COMPACT}
              onClick={() => setShowImport(true)}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              Import
            </button>
          )}

          {/* Parse from PDF, only for Peer Review / Bid Only */}
          {!isReadOnly && isAiServiceType && (
            <button
              className={BTN_COMPACT}
              onClick={() => setShowParse(true)}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23-.693L5 14.5m14.8.8l1.402 1.402c1 1 .3 2.7-1.17 2.7H3.97c-1.47 0-2.17-1.7-1.17-2.7L5 14.5" />
              </svg>
              Parse from PDF
            </button>
          )}

          {!isReadOnly && (
            <>
              <button
                className={BTN_COMPACT_PRIMARY}
                disabled={items.length === 0}
                onClick={() => setShowPush(true)}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" />
                </svg>
                Push to Bid
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Empty state ─────────────────────────────────────────────────────── */}
      {items.length === 0 && !loading && (
        <div className={`${CARD} py-16 flex flex-col items-center gap-4 text-center px-8`}>
          <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center">
            <svg className="w-6 h-6 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" />
            </svg>
          </div>
          {isReadOnly ? (
            <p className="text-sm text-slate-500">No items in this version</p>
          ) : isAiServiceType ? (
            <>
              <p className="text-sm text-slate-700 font-medium">No fixtures yet</p>
              <p className="text-xs text-slate-500 max-w-xs">Upload a fixture schedule PDF to auto-populate this table, or add fixtures manually.</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowParse(true)}
                  className={BTN_PRIMARY}
                >
                  Parse from PDF
                </button>
                <button
                  onClick={addRow}
                  disabled={saving}
                  className={BTN_SECONDARY}
                >
                  + Add Fixture
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-slate-700 font-medium">No fixtures yet</p>
              <p className="text-xs text-slate-500">Add your first fixture type to get started.</p>
              <button
                onClick={addRow}
                disabled={saving}
                className={BTN_PRIMARY}
              >
                + Add Fixture
              </button>
            </>
          )}
        </div>
      )}

      {/* ── Condition filter builder ──────────────────────────────────────────── */}
      {showFilters && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-2.5">
          <div className="flex items-center justify-between mb-1">
            <span className={LABEL}>Filter conditions</span>
            <span className="text-xs text-slate-500">All conditions must match (AND)</span>
          </div>

          {conditions.length === 0 && (
            <p className="text-xs text-slate-500">No conditions yet. Click "Add condition" below.</p>
          )}

          {conditions.map((cond, i) => (
            <div key={cond.id} className="flex items-center gap-2 flex-wrap">
              <span className={`${LABEL} w-6 shrink-0 text-right`}>
                {i === 0 ? 'If' : 'And'}
              </span>
              <select
                value={cond.field}
                onChange={e => updateCondition(cond.id, { field: e.target.value })}
                className={`${INPUT} w-auto py-1.5 text-xs`}
              >
                {visibleCols.map(col => (
                  <option key={col.key} value={col.key}>{col.label}</option>
                ))}
              </select>
              <select
                value={cond.op}
                onChange={e => updateCondition(cond.id, { op: e.target.value })}
                className={`${INPUT} w-auto py-1.5 text-xs`}
              >
                {FILTER_OPS.map(op => (
                  <option key={op.value} value={op.value}>{op.label}</option>
                ))}
              </select>
              {cond.op !== 'empty' && cond.op !== 'not_empty' && (
                <input
                  type="text"
                  value={cond.value}
                  onChange={e => updateCondition(cond.id, { value: e.target.value })}
                  placeholder="value…"
                  className={`${INPUT} w-36 py-1.5 text-xs`}
                />
              )}
              <button
                onClick={() => removeCondition(cond.id)}
                className="text-slate-500 hover:text-red-600 transition-colors p-1 rounded-lg hover:bg-red-50"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}

          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={addCondition}
              className={BTN_COMPACT}
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
              Add condition
            </button>
            {conditions.length > 0 && (
              <button onClick={() => setConditions([])} className="text-xs font-semibold text-orange-600 hover:text-orange-700 transition-colors">
                Clear all
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Table ──────────────────────────────────────────────────────────── */}
      {rawItems.length > 0 && (
        <div className={`${CARD} overflow-x-auto`}>
          <table className="w-full text-left border-collapse table-fixed">
            <colgroup>
              {!isReadOnly && <col style={{ width: '24px' }} />}  {/* + insert */}
              {!isReadOnly && <col style={{ width: '32px' }} />}  {/* delete */}
              {!isReadOnly && <col style={{ width: '24px' }} />}  {/* drag */}
              {visibleCols.map(col => (
                <col key={col.key} style={{ width: `${col.pct}%` }} />
              ))}
            </colgroup>
            <thead>
              {/* ── Sort row ── */}
              <tr className="bg-slate-50 border-b border-slate-100">
                {!isReadOnly && <th className="px-1" />}  {/* + */}
                {!isReadOnly && <th className="px-1" />}  {/* delete */}
                {!isReadOnly && <th className="px-1" />}  {/* drag */}
                {visibleCols.map(col => (
                  <SortHeader
                    key={col.key}
                    label={col.label}
                    field={col.key}
                    sort={sortCol ? { key: sortCol, dir: sortDir } : null}
                    onSort={toggleSort}
                    className="px-1.5 pt-2.5 pb-1"
                  />
                ))}
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr>
                  <td colSpan={visibleCols.length + (isReadOnly ? 0 : 2)} className="py-8 text-center text-xs text-slate-500">
                    No rows match. <button onClick={() => { setConditions([]); setSearchQuery(''); }} className="underline hover:text-orange-600">Clear filters</button>
                  </td>
                </tr>
              )}
              {items.map((item, idx) => {
                const rowBg = item.aiFlagged
                  ? 'bg-amber-50 border-amber-100'
                  : dragOverId === item.id
                    ? 'bg-orange-50 border-slate-100'
                    : idx % 2 === 0
                      ? 'bg-white border-slate-100'
                      : 'bg-slate-50/50 border-slate-100';

                return (
                  <tr
                    key={item.id}
                    className={`border-b last:border-0 transition-colors align-top ${rowBg}`}
                    draggable={!isReadOnly}
                    onDragStart={e => onDragStart(e, item.id)}
                    onDragOver={e => onDragOver(e, item.id)}
                    onDragLeave={onDragLeave}
                    onDrop={e => onDrop(e, item.id)}
                    onDragEnd={onDragEnd}
                  >
                    {/* + Insert row below */}
                    {!isReadOnly && (
                      <td className="px-0.5 py-1">
                        <button
                          className="w-5 h-5 flex items-center justify-center rounded text-slate-400 hover:text-green-600 hover:bg-green-50 transition-colors"
                          onClick={() => addRow(item.id)}
                          disabled={saving}
                          title="Insert row below"
                        >
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                          </svg>
                        </button>
                      </td>
                    )}
                    {/* Delete */}
                    {!isReadOnly && (
                      <td className="px-1 py-1 w-8">
                        <button
                          className="w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                          onClick={() => deleteRow(item.id)}
                          title="Delete row"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </td>
                    )}
                    {/* Drag handle */}
                    {!isReadOnly && (
                      <td className="px-1 py-1">
                        <DragHandle dragging={dragItemId.current === item.id} />
                      </td>
                    )}
                    {visibleCols.map(col => (
                      <td key={col.key} className="px-0.5 py-0.5">
                        {col.key === 'location' ? (
                          <LocationCell
                            value={item.location}
                            readOnly={isReadOnly}
                            onSave={val => saveCell(item.id, 'location', val)}
                          />
                        ) : col.key === 'manufacturer' ? (
                          <MfrSelectCell
                            value={item.manufacturer}
                            manufacturers={manufacturers}
                            readOnly={isReadOnly}
                            onSave={val => saveCell(item.id, 'manufacturer', val)}
                            onOpenCreate={() => setShowNewMfr(true)}
                          />
                        ) : col.key === 'type' && item.aiFlagged ? (
                          <div className="flex items-start gap-1">
                            <span title={`AI confidence: ${item.aiConfidence != null ? Math.round(item.aiConfidence * 100) + '%' : 'low'}`} className="mt-1.5 shrink-0">
                              <svg className="w-3.5 h-3.5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                              </svg>
                            </span>
                            <Cell value={item[col.key]} colKey={col.key} readOnly={isReadOnly} isAlternate={item.isAlternate} onSave={val => saveCell(item.id, col.key, val)} />
                          </div>
                        ) : (
                          <Cell value={item[col.key]} colKey={col.key} readOnly={isReadOnly} isAlternate={item.isAlternate} onSave={val => saveCell(item.id, col.key, val)} />
                        )}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      {!isReadOnly && rawItems.length > 0 && (
        <div className="flex items-center justify-between text-xs text-slate-500 px-1">
          <span>
            {isFiltering
              ? `${items.length} of ${rawItems.length} rows · `
              : `${rawItems.length} row${rawItems.length !== 1 ? 's' : ''} · `}
            Click any cell to edit · Drag to reorder
          </span>
          <button
            className="text-orange-600 hover:text-orange-700 font-semibold transition-colors flex items-center gap-1"
            onClick={() => addRow()}
            disabled={saving}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
            Add row at end
          </button>
        </div>
      )}

      {/* ── Delete version confirm modal ───────────────────────────────────── */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl w-full max-w-sm p-6">
            <h3 className="text-base font-bold text-slate-800 mb-2">Delete version?</h3>
            <p className="text-sm text-slate-500 mb-1">
              You're about to permanently delete <strong className="text-slate-700">{deleteConfirm.label}</strong> of the fixture schedule.
            </p>
            <p className="text-sm text-red-600 mb-6">This cannot be undone. All fixture rows in this version will be deleted.</p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setDeleteConfirm(null)} className="px-4 py-2 text-sm rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">
                Cancel
              </button>
              <button onClick={() => deleteVersion(deleteConfirm.id)} className="px-4 py-2 text-sm rounded-lg bg-red-600 text-white font-semibold hover:bg-red-700">
                Delete version
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modals ─────────────────────────────────────────────────────────── */}
      {showImport && (
        <FixtureImportModal
          projectId={projectId}
          onImported={updatedDraft => {
            setDraft(updatedDraft);
            setSelectedId('draft');
            setShowImport(false);
          }}
          onClose={() => setShowImport(false)}
        />
      )}

      {showPush && (
        <PushToBidModal
          projectId={projectId}
          itemCount={items.length}
          nextVersion={(published.filter(p => p.state === 'PUBLISHED').length) + 1}
          onPushed={({ draft: newDraft, bidMatrix }) => {
            setDraft(newDraft);
            setPublished(prev => [{ ...bidMatrix, _isBid: true }, ...prev]);
            setShowPush(false);
            load();
          }}
          onClose={() => setShowPush(false)}
        />
      )}

      {showParse && (
        <ParseFromPdfModal
          projectId={projectId}
          onParsed={handleParsed}
          onClose={() => setShowParse(false)}
        />
      )}

      {showShare && (
        <ShareModal
          projectId={projectId}
          onClose={() => setShowShare(false)}
        />
      )}

      {showNewMfr && (
        <NewMfrModal
          onCreated={mfr => {
            setManufacturers(prev => [...prev, mfr].sort((a, b) => a.name.localeCompare(b.name)));
            setShowNewMfr(false);
          }}
          onClose={() => setShowNewMfr(false)}
        />
      )}
    </div>
  );
}
