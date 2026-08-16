'use client';
import { useState, useRef, useCallback } from 'react';
// From the standalone module, not '@/lib/drawingExtract' — that one reaches the
// model and would pull server-only code (node:crypto) into the browser bundle.
import { mergeProposals } from '@/lib/mergeProposals';

/**
 * Multi-file drawing upload + parse for the conceptual-budget intake.
 *
 * Differs from `unitMatrix/UnitMatrixUpload.jsx` in three ways that matter:
 *   1. Accepts MANY files, each parsed independently with its own status, so
 *      one bad sheet never blocks the rest of the set.
 *   2. Talks to the stateless public route — no project, nothing persisted.
 *   3. Merges results across files and surfaces disagreements rather than
 *      silently picking a winner.
 */

// Our own route accepts 25 MB, but Amplify's front door rejects request bodies
// over ~4.4 MB with an empty 413 the UI can't explain (measured on prod
// 2026-08-15: 4 MB reaches the route, 5 MB bounces). Check here, before the
// upload, so the visitor gets an honest message instead of a generic failure.
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

const STATUS = {
  queued:  { label: 'Queued',    cls: 'bg-slate-100 text-slate-500 border-slate-200' },
  parsing: { label: 'Reading…',  cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  done:    { label: 'Read',      cls: 'bg-green-50 text-green-700 border-green-200' },
  error:   { label: 'Failed',    cls: 'bg-red-50 text-red-600 border-red-200' },
};

function fmtBytes(n) {
  if (n == null) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function fmt(n) { return n == null ? '—' : Number(n).toLocaleString(); }

let uid = 0;

export default function DrawingDropzone({ onResults }) {
  const [items, setItems]   = useState([]);
  const [dragging, setDrag] = useState(false);
  const inputRef = useRef(null);

  const parsing = items.some(i => i.status === 'parsing' || i.status === 'queued');
  const done    = items.filter(i => i.status === 'done');

  const merged = done.length ? mergeProposals(done.map(i => ({ fileName: i.name, proposal: i.proposal }))) : null;

  function publish(next) {
    const ok = next.filter(i => i.status === 'done');
    onResults?.(ok.length ? mergeProposals(ok.map(i => ({ fileName: i.name, proposal: i.proposal }))) : null);
  }

  const parseOne = useCallback(async (item) => {
    // Checked here rather than in addFiles so Retry can't sneak past it.
    if (item.file?.size > MAX_UPLOAD_BYTES) {
      setItems(prev => {
        const next = prev.map(i => i.id === item.id
          ? { ...i, status: 'error', error: `This file is ${fmtBytes(item.file.size)} — files over 4 MB can't be uploaded yet. Splitting the PDF or compressing it usually gets it under the limit.` }
          : i);
        publish(next);
        return next;
      });
      return;
    }

    setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: 'parsing' } : i));

    const body = new FormData();
    body.append('file', item.file);

    let patch;
    try {
      const r = await fetch('/api/intake/parse', { method: 'POST', body });
      const d = await r.json().catch(() => ({}));
      patch = r.ok
        ? { status: 'done', proposal: d, error: null }
        // The API's `message` is written for a public reader, so show it as-is.
        : { status: 'error', error: d.message || 'Could not read this file.' };
    } catch {
      patch = { status: 'error', error: 'Upload failed. Please check your connection and try again.' };
    }

    setItems(prev => {
      const next = prev.map(i => i.id === item.id ? { ...i, ...patch } : i);
      publish(next);
      return next;
    });
  }, [onResults]);

  const addFiles = useCallback((fileList) => {
    const incoming = Array.from(fileList ?? []);
    if (!incoming.length) return;

    const fresh = incoming.map(file => ({
      id: `f${++uid}`, file, name: file.name, size: file.size,
      status: 'queued', proposal: null, error: null,
    }));

    setItems(prev => [...prev, ...fresh]);
    // Sequential rather than parallel: each parse is a paid model call, and the
    // public route is rate-limited per IP. Firing ten at once would trip it.
    (async () => { for (const item of fresh) await parseOne(item); })();
  }, [parseOne]);

  function removeItem(id) {
    setItems(prev => {
      const next = prev.filter(i => i.id !== id);
      publish(next);
      return next;
    });
  }

  function retry(id) {
    const item = items.find(i => i.id === id);
    if (item) parseOne(item);
  }

  return (
    <div className="space-y-4">
      {/* Dropzone */}
      <div
        onDragOver={e => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={e => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files); }}
        onClick={() => inputRef.current?.click()}
        className={`rounded-xl border-2 border-dashed px-6 py-10 flex flex-col items-center gap-3 cursor-pointer transition-colors
          ${dragging ? 'border-amber-400 bg-amber-50' : 'border-slate-200 bg-white hover:border-amber-300 hover:bg-amber-50/30'}`}
      >
        <svg className="w-9 h-9 text-slate-300" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
        </svg>
        <div className="text-center">
          <p className="text-sm font-semibold text-slate-700">Drop your drawings here</p>
          <p className="text-xs text-slate-500 mt-1 max-w-md">
            Include the sheet with the <strong>building square footage and unit count</strong> — that&apos;s what we read to
            fill in your budget. You can add several files.
          </p>
          <p className="text-[11px] text-slate-400 mt-1.5">Vector PDF or Excel · up to 4 MB each · scans aren&apos;t readable yet</p>
        </div>
        <span className="text-xs font-semibold text-amber-600 border border-amber-200 rounded-lg px-3 py-1.5 hover:bg-amber-50">
          Browse files
        </span>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".pdf,.xlsx,.xls"
          className="hidden"
          onChange={e => { addFiles(e.target.files); e.target.value = null; }}
        />
      </div>

      {/* Per-file status */}
      {items.length > 0 && (
        <ul className="space-y-2">
          {items.map(item => {
            const s = STATUS[item.status] ?? STATUS.queued;
            const types = item.proposal?.unitTypes?.length ?? 0;
            return (
              <li key={item.id} className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border shrink-0 ${s.cls}`}>
                    {s.label}
                  </span>
                  <span className="text-sm font-mono text-slate-700 truncate flex-1" title={item.name}>{item.name}</span>
                  <span className="text-xs text-slate-400 shrink-0">{fmtBytes(item.size)}</span>
                  {item.status === 'error' && (
                    <button onClick={() => retry(item.id)} className="text-xs font-semibold text-amber-600 hover:text-amber-700 shrink-0">
                      Retry
                    </button>
                  )}
                  <button
                    onClick={() => removeItem(item.id)}
                    className="text-slate-300 hover:text-red-400 text-lg leading-none shrink-0"
                    aria-label={`Remove ${item.name}`}
                  >
                    &times;
                  </button>
                </div>

                {item.status === 'done' && (
                  <p className="text-xs text-slate-500 mt-1.5 pl-1">
                    {types > 0
                      ? <>Found <span className="font-semibold text-slate-700">{types}</span> unit type{types !== 1 ? 's' : ''}</>
                      : 'No unit types found on this sheet'}
                    {item.proposal?.overallConfidence != null && types > 0 &&
                      <> · {Math.round(item.proposal.overallConfidence * 100)}% confidence</>}
                  </p>
                )}
                {item.status === 'error' && (
                  <p className="text-xs text-red-500 mt-1.5 pl-1">{item.error}</p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* Merged rollup */}
      {merged && merged.unitTypes.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-3">
          <div className="text-[10px] font-bold text-amber-700 uppercase tracking-wider mb-2">
            Combined from {merged.sources.length} file{merged.sources.length !== 1 ? 's' : ''}
          </div>
          <div className="flex items-center gap-4 flex-wrap text-sm text-slate-700">
            <span><span className="font-mono font-semibold">{merged.unitTypes.length}</span> unit types</span>
            <span className="text-slate-300">·</span>
            <span><span className="font-mono font-semibold">
              {fmt(merged.unitTypes.reduce((s, r) => s + (Number(r.qty) || 0), 0))}
            </span> units</span>
            {merged.projectTotals.grossInteriorSf != null && (
              <>
                <span className="text-slate-300">·</span>
                <span><span className="font-mono font-semibold">{fmt(merged.projectTotals.grossInteriorSf)}</span> gross SF</span>
              </>
            )}
          </div>

          {merged.conflicts.length > 0 && (
            <div className="mt-3 rounded-lg bg-white border border-amber-200 px-3 py-2">
              <p className="text-xs font-semibold text-amber-800">
                {merged.conflicts.length} disagreement{merged.conflicts.length !== 1 ? 's' : ''} between files
              </p>
              <ul className="mt-1 space-y-0.5">
                {merged.conflicts.slice(0, 4).map((c, i) => (
                  <li key={i} className="text-xs text-slate-600">
                    <span className="font-medium">{c.field}:</span>{' '}
                    {c.values.map(v => fmt(v.value)).join(' vs ')}
                  </li>
                ))}
              </ul>
              <p className="text-[11px] text-slate-400 mt-1">
                We kept the most confident reading. Someone at ILC will confirm these.
              </p>
            </div>
          )}
        </div>
      )}

      {parsing && (
        <p className="text-xs text-slate-500 flex items-center gap-2">
          <svg className="w-3.5 h-3.5 text-amber-400 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Reading your drawings…
        </p>
      )}
    </div>
  );
}
