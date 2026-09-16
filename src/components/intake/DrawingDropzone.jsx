'use client';
import { useState, useRef, useCallback, useEffect } from 'react';
// From the standalone module, not '@/lib/drawingExtract' — that one reaches the
// model and would pull server-only code (node:crypto) into the browser bundle.
import { mergeProposals } from '@/lib/mergeProposals';
import { uploadDirect, holdScreenAwake } from '@/lib/uploadClient';
import { READING_TIME_HINT } from '@/components/ReadingWait';
import { runStagedParse, STEP_WORDS } from '@/lib/intake/stagedParse';
import ReadingSteps from './ReadingSteps';

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

// Files go straight to cloud storage via a presigned slip (see uploadClient.js),
// which sidesteps Amplify's ~4.4 MB front-door cap entirely — the request that
// does pass through our server carries only a short key.
//
// 400 MB is our own ceiling. Mike, 2026-08-21, after a GC's 246 MB set was
// refused on the live site: "We have to make it so it never fails unless it is
// absurdly big." A full DD/CD set is 200–350 MB and the server never holds one
// — it reads the sheets it needs out of cloud storage a slice at a time. This
// check exists so an absurd file is refused before the phone spends an hour
// uploading it, not because the parser couldn't cope.
const MAX_UPLOAD_BYTES = 400 * 1024 * 1024;

// Landscape, site and architectural are often three separate exports, and a GC
// sends what he has. Five covers that; past five it is someone dragging a whole
// folder in, and every file is a paid read.
const MAX_FILES = 5;

const STATUS = {
  queued:    { label: 'Queued',      cls: 'bg-slate-100 text-slate-500 border-slate-200' },
  uploading: { label: 'Uploading…',  cls: 'bg-sky-50 text-sky-700 border-sky-200' },
  parsing:   { label: 'Reading…',    cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  done:      { label: 'Read',        cls: 'bg-green-50 text-green-700 border-green-200' },
  error:     { label: 'Failed',      cls: 'bg-red-50 text-red-600 border-red-200' },
};

function fmtBytes(n) {
  if (n == null) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function fmt(n) { return n == null ? '—' : Number(n).toLocaleString(); }

let uid = 0;

/**
 * The whole read in one request.
 *
 * Still here for the two cases that genuinely want it: a multipart POST, which
 * carries no storage key for the stages to work from, and a server that
 * declined to stage because it had nowhere to park the working scan (local dev
 * without a bucket). Both are small-file cases that finish well inside the
 * 30-second ceiling.
 */
async function parseInOneRequest(item, sent) {
  try {
    const r = sent
      ? await fetch('/api/intake/parse', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ s3Key: sent.key, fileName: item.file.name }),
        })
      : await fetch('/api/intake/parse', {
          method: 'POST',
          body: (() => { const fd = new FormData(); fd.append('file', item.file); return fd; })(),
        });
    const d = await r.json().catch(() => ({}));
    return r.ok
      ? { status: 'done', proposal: d, error: null }
      // The API's `message` is written for a public reader, so show it as-is.
      : { status: 'error', error: d.message || 'Could not read this file. (R0)' };
  } catch {
    return { status: 'error', error: 'We lost the connection while reading the file. Please try again. (R2)' };
  }
}

/**
 * @param {Function} onResults  called with the merged proposal (or null) every
 *                              time the set of read files changes
 * @param {?Object}  restored   a merged proposal saved in the browser last
 *                              time (IntakeClient's draft). The files behind
 *                              it are gone — only their READ survived — so it
 *                              is shown as one "read earlier" entry and kept
 *                              in the count when more files are dropped.
 */
export default function DrawingDropzone({ onResults, restored = null }) {
  // Ring the server's doorbell the moment the page opens. A server nobody has
  // used for a while takes about fifteen seconds to wake, the front door hangs
  // up at thirty, and both together mean the FIRST visitor's upload dies while
  // later ones sail through. Waking it here spends those fifteen seconds while
  // the visitor is still choosing a file, where nobody feels them.
  useEffect(() => {
    fetch('/api/intake/parse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage: 'warm' }),
    }).catch(() => {});
  }, []);

  const [items, setItems]   = useState([]);
  const [dragging, setDrag] = useState(false);
  const [notice, setNotice] = useState(null);   // "we left some files out"
  const inputRef = useRef(null);

  // The read restored from a saved draft (see `restored`). Taken on the first
  // non-null value only: it is a one-time hand-off, not a live mirror, so a
  // later publish() from here never feeds back in as "another earlier read".
  const [earlier, setEarlier] = useState(null);
  // Mirrored in a ref because parseOne is memoised on onResults alone and its
  // publish() would otherwise see the `earlier` of the render it was made in
  // — null — and drop the kept read the moment a new file finished.
  const earlierRef = useRef(null);
  useEffect(() => {
    if (restored && typeof restored === 'object' && !earlierRef.current) {
      earlierRef.current = restored;
      setEarlier(restored);
    }
  }, [restored]);

  const parsing = items.some(i => i.status === 'parsing' || i.status === 'uploading' || i.status === 'queued');
  const done    = items.filter(i => i.status === 'done');

  // One combined proposal from the files read now plus the read kept from
  // last time. Alone, the earlier read passes through untouched (re-merging
  // a merge would re-derive verdicts it already settled); with new files it
  // joins the merge as one more source, so nothing read last time is lost.
  const EARLIER_NAME = 'Read earlier';
  function combine(list, kept) {
    const ok = list.filter(i => i.status === 'done').map(i => ({ fileName: i.name, proposal: i.proposal }));
    if (!ok.length) return kept ?? null;
    if (kept) ok.unshift({ fileName: EARLIER_NAME, proposal: kept });
    return mergeProposals(ok);
  }
  const merged = combine(items, earlier);

  function publish(next) {
    onResults?.(combine(next, earlierRef.current));
  }

  function removeEarlier() {
    earlierRef.current = null;
    setEarlier(null);
    publish(items);
  }

  const parseOne = useCallback(async (item) => {
    // Checked here rather than in addFiles so Retry can't sneak past it.
    if (item.file?.size > MAX_UPLOAD_BYTES) {
      setItems(prev => {
        const next = prev.map(i => i.id === item.id
          // No instructions to a GC standing on a job site about how to split a
          // PDF. Say the number, say what to do, and give him a person.
          ? { ...i, status: 'error', error: `This file is ${fmtBytes(item.file.size)}, which is past what we can take (${fmtBytes(MAX_UPLOAD_BYTES)}). Send it to us at precon@ilcstudios.com and we'll take it from there. (F1)` }
          : i);
        publish(next);
        return next;
      });
      return;
    }

    // ── The screen stays awake for the WHOLE journey, not just the upload ──
    // The wake lock inside uploadDirect is released the moment the upload
    // finishes -- and the read that follows is the LONG part. A phone dimming
    // its screen two minutes into "looking through the set" suspends the page
    // and kills the request in flight, which surfaced as R1/scan on every one
    // of Mike's screenshots. Hold one lock across upload AND read, re-grabbed
    // if the visitor flips away and back, and remember whether the page ever
    // went dark so a failure can say what actually happened.
    const releaseWake = holdScreenAwake();
    let slept = false;
    const sawHide = () => { if (document.visibilityState === 'hidden') slept = true; };
    document.addEventListener('visibilitychange', sawHide);
    const settle = () => { document.removeEventListener('visibilitychange', sawHide); releaseWake(); };

    // ── Step 1: get the file where the parser can reach it ──
    // Preferred: straight to cloud storage via a presigned slip — no size cap
    // that matters, with a progress bar. Fallback: the classic multipart POST
    // (local dev, where presigning is off; or if the direct PUT fails and the
    // file is small enough to fit through the ~4.4 MB front door).
    //
    // A retry after a failed READ skips this step entirely: the file is
    // already up there under the key we kept, and re-sending 300 MB because a
    // 30-second request hiccupped is the wrong end of the stick. If the
    // parked copy turns out to have been swept, the read comes back
    // `not_found` and we start over with a fresh upload below.
    let sent = null;
    let reusedKey = false;
    if (item.s3Key) {
      sent = { key: item.s3Key };
      reusedKey = true;
    } else {
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: 'uploading', progress: 0 } : i));
      try {
        sent = await uploadDirect(item.file, {
          onProgress: pct => setItems(prev => prev.map(i => i.id === item.id ? { ...i, progress: pct } : i)),
        });
      } catch (err) {
        // An unreadable file (a Google Drive pipe that never finished coming
        // down) fails the multipart fallback identically, so falling back
        // would just trade an honest message for a mystifying R1. Show it
        // regardless of size.
        if (item.file.size > 4 * 1024 * 1024 || err.unreadable) {
          setItems(prev => {
            const next = prev.map(i => i.id === item.id
              ? { ...i, status: 'error', error: err.message || 'Upload failed. Please try again. (U0)' }
              : i);
            publish(next);
            return next;
          });
          settle();
          return;
        }
        sent = null; // small file — the multipart fallback below still works
      }
    }

    // ── Step 2: read it ──
    // Four short requests rather than one long one. The one-request version
    // could not finish on the live site at all -- Amplify hangs up at ~30
    // seconds and a set takes about a minute -- and short requests are also
    // the only way to tell the visitor what is happening while he waits.
    setItems(prev => prev.map(i => i.id === item.id
      ? { ...i, status: 'parsing', progress: null, steps: {}, startedAt: Date.now() }
      : i));

    // Tracked outside React state as well, because if this throws we need to
    // name the step that was running and setItems has not necessarily flushed.
    let atStep = 'scan';
    const onStep = (key, state) => {
      if (state === 'active') atStep = key;
      setItems(prev => prev.map(i =>
        i.id === item.id ? { ...i, steps: { ...i.steps, [key]: state } } : i));
    };

    let patch;
    try {
      // Staged either way. With cloud storage the file is already up there and
      // we hand over the key; without it (a laptop) the file rides along with
      // the first short step and the server parks it. Falling back to one long
      // request just because there is no bucket would mean the laptop runs the
      // shape we just spent this whole change removing -- and it is the laptop
      // Mike tests on from his phone.
      const staged = await runStagedParse({
        s3Key: sent?.key, file: sent ? null : item.file, fileName: item.file.name, onStep,
      });

      patch = staged
        ? { status: 'done', proposal: staged, error: null }
        : await parseInOneRequest(item, sent);
    } catch (err) {
      // A retry that reused the kept key, on a file that has since been swept:
      // nothing is wrong with the file HE has, so "could not be found" would
      // only mystify. Start over with a fresh upload.
      if (reusedKey && err?.code === 'not_found') {
        settle();
        return parseOne({ ...item, s3Key: null });
      }
      // `shown` means the server already wrote this for a public reader.
      // Anything else is the browser losing the same request three times over
      // (stage() retries the dropped ones) -- and the two ways that happens on
      // a phone deserve different words. If the page went dark mid-read, the
      // phone cut the line, not the network, and "try again" alone would just
      // send him around the same loop.
      //
      // Either way the uploaded file is still parked, so keep its key on the
      // item: Retry then re-asks the READ without re-sending a third of a
      // gigabyte over a job-site connection.
      patch = { status: 'error', s3Key: sent?.key ?? null, error: err?.shown
        ? err.message
        : slept
          ? `Your phone put this page to sleep while we were ${STEP_WORDS[atStep] ?? 'reading the file'}, and that cuts the line mid-read. Keep the screen on and this page in front until the read finishes, then try again. (R1/${atStep}/slept)`
          : `We kept losing the connection while ${STEP_WORDS[atStep] ?? 'reading the file'}, even after retrying. Please try again — and if it happens twice, send the file to precon@ilcstudios.com. (R1/${atStep})` };
    }

    settle();
    setItems(prev => {
      const next = prev.map(i => i.id === item.id ? { ...i, ...patch } : i);
      publish(next);
      return next;
    });
  }, [onResults]);

  const addFiles = useCallback((fileList) => {
    const incoming = Array.from(fileList ?? []);
    if (!incoming.length) return;

    // The cap is on the LIST, not on one drop — dropping three files twice is
    // the same as dropping six at once, and the second drop is where someone
    // would otherwise be surprised. Take what fits, say plainly what didn't.
    const room = Math.max(0, MAX_FILES - items.length);
    const accepted = incoming.slice(0, room);
    const turnedAway = incoming.length - accepted.length;
    setNotice(turnedAway > 0
      ? `We can read ${MAX_FILES} files at a time, so ${turnedAway} ${turnedAway === 1 ? 'file was' : 'files were'} left out. Remove one below to make room, or send the rest to precon@ilcstudios.com.`
      : null);
    if (!accepted.length) return;

    const fresh = accepted.map(file => ({
      id: `f${++uid}`, file, name: file.name, size: file.size,
      status: 'queued', proposal: null, error: null,
    }));

    setItems(prev => [...prev, ...fresh]);
    // Sequential rather than parallel: each parse is a paid model call, and the
    // public route is rate-limited per IP. Firing ten at once would trip it.
    (async () => { for (const item of fresh) await parseOne(item); })();
  }, [parseOne, items.length]);

  function removeItem(id) {
    setNotice(null);   // removing one is exactly how you make room
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
            Send the whole set if that's what you have — we'll find the sheets we need. Most useful are
            the <strong>unit matrix</strong> (unit counts and square footage) and the{' '}
            <strong>site plan</strong> (lot size, parking, buildings). Landscape or civil can be separate files.
          </p>
          <p className="text-[11px] text-slate-400 mt-1.5">
            PDF or Excel · up to {MAX_FILES} files, {Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))} MB each
          </p>
          {/* Said before anything is chosen, not after. A set is read sheet by
              sheet and takes minutes, and someone who was not told that reads a
              working page as a broken one and closes it. */}
          <p className="text-[11px] text-slate-500 mt-1">{READING_TIME_HINT}</p>
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

      {notice && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800 leading-snug">
          {notice}
        </p>
      )}

      {/* The read kept from last time — the files themselves were never
          stored, so there is nothing to re-open, only what we found. */}
      {earlier && (
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
          <div className="flex items-center gap-3">
            <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border shrink-0 ${STATUS.done.cls}`}>
              Read earlier
            </span>
            <span className="text-sm font-mono text-slate-700 truncate flex-1" title={(earlier.sources ?? []).join(', ')}>
              {(earlier.sources ?? []).length ? (earlier.sources ?? []).join(', ') : 'Your drawings'}
            </span>
            <button
              onClick={removeEarlier}
              className="text-slate-300 hover:text-red-400 text-lg leading-none shrink-0"
              aria-label="Remove the drawings read earlier"
            >
              &times;
            </button>
          </div>
          <p className="text-xs text-slate-500 mt-1.5 pl-1">
            Kept from your last visit — still counted below. Drop more files to add to it, or remove it to start the drawings over.
          </p>
        </div>
      )}

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
                  <span className="text-xs text-slate-400 shrink-0 tabular-nums">
                    {item.status === 'uploading' && item.progress != null
                      // A percentage alone reads as frozen on a 250 MB set over a
                      // job-site connection. Megabytes moved is the number that
                      // visibly changes.
                      ? `${fmtBytes(Math.round(item.size * item.progress / 100))} of ${fmtBytes(item.size)}`
                      : fmtBytes(item.size)}
                  </span>
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

                {item.status === 'uploading' && item.progress != null && (
                  <div className="mt-2 h-1 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full bg-sky-400 transition-[width] duration-300"
                      style={{ width: `${Math.max(2, item.progress)}%` }}
                    />
                  </div>
                )}

                {item.status === 'parsing' && (
                  <ReadingSteps steps={item.steps ?? {}} startedAt={item.startedAt} />
                )}

                {item.status === 'done' && (
                  <p className="text-xs text-slate-500 mt-1.5 pl-1">
                    {item.proposal?.kind === 'site_data'
                      ? <>Read <span className="font-semibold text-slate-700">site data</span>
                          {item.proposal.siteData?.totalUnits != null && <> · {fmt(item.proposal.siteData.totalUnits)} units</>}
                          {item.proposal.siteData?.grossSf != null && <> · {fmt(item.proposal.siteData.grossSf)} gross SF</>}
                          {item.proposal.siteData?.lotSf != null
                            ? <> · {fmt(item.proposal.siteData.lotSf)} SF lot</>
                            : item.proposal.siteData?.lotAcres != null && <> · {item.proposal.siteData.lotAcres} acres</>}
                          {item.proposal.siteData?.buildingCount != null && <> · {fmt(item.proposal.siteData.buildingCount)} buildings</>}
                        </>
                      : types > 0
                        ? <>Found <span className="font-semibold text-slate-700">{types}</span> unit type{types !== 1 ? 's' : ''}</>
                        : 'No unit matrix or site data found on this sheet'}
                    {item.proposal?.overallConfidence != null && types > 0 &&
                      <> · {Math.round(item.proposal.overallConfidence * 100)}% confidence</>}
                  </p>
                )}
                {/* On a full set, saying WHICH sheets we opened is the difference
                    between "it read my drawings" and "it read something". */}
                {item.status === 'done' && item.proposal?.totalPages > 1 && (
                  <p className="text-[11px] text-slate-400 mt-1 pl-1">
                    {item.proposal.sheetsRead?.length
                      ? <>Read {item.proposal.sheetsRead.length === 1 ? 'page' : 'pages'}{' '}
                          {item.proposal.sheetsRead.join(', ')} of {fmt(item.proposal.totalPages)}</>
                      : item.proposal.readBraked
                        ? <>Searched {fmt(item.proposal.pagesRead ?? 0)} of {fmt(item.proposal.totalPages)} pages</>
                        : <>Searched {fmt(item.proposal.totalPages)} pages</>}
                    {/* The memory brake stopped the text read early: say so, or a
                        set read one page deep looks the same as one read in full. */}
                    {item.proposal.readBraked && (
                      <span className="text-amber-600"> · too large to hold open in full — a smaller PDF of just the site plan, area summary and unit matrix sheets reads best</span>
                    )}
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
      {merged && (merged.unitTypes.length > 0 || merged.siteData) && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-3">
          <div className="text-[10px] font-bold text-amber-700 uppercase tracking-wider mb-2">
            Combined from {merged.sources.length} file{merged.sources.length !== 1 ? 's' : ''}
          </div>
          <div className="flex items-center gap-4 flex-wrap text-sm text-slate-700">
            {merged.unitTypes.length > 0 && (
              <>
                <span><span className="font-mono font-semibold">{merged.unitTypes.length}</span> unit types</span>
                <span className="text-slate-300">·</span>
                <span><span className="font-mono font-semibold">
                  {fmt(merged.unitTypes.reduce((s, r) => s + (Number(r.qty) || 0), 0))}
                </span> units</span>
              </>
            )}
            {merged.unitTypes.length === 0 && merged.siteData?.totalUnits != null && (
              <span><span className="font-mono font-semibold">{fmt(merged.siteData.totalUnits)}</span> units</span>
            )}
            {merged.projectTotals.grossInteriorSf != null && (
              <>
                <span className="text-slate-300">·</span>
                <span className={merged.projectTotals.grossSfNeedsReview ? 'text-red-700' : undefined}>
                  <span className="font-mono font-semibold">{fmt(merged.projectTotals.grossInteriorSf)}</span> gross SF
                  {merged.projectTotals.grossSfConfidence != null && (
                    <span className="ml-1 text-[11px] font-semibold">
                      ({Math.round(merged.projectTotals.grossSfConfidence * 100)}%)
                    </span>
                  )}
                </span>
              </>
            )}
            {/* The text path's stated-GSF verdict wins the chip when it exists;
                this one covers the vision path, where the total arrives as a
                site-data field instead. Both never render at once. */}
            {merged.projectTotals?.grossInteriorSf == null && merged.siteData?.grossSf != null && (
              <>
                <span className="text-slate-300">·</span>
                <span><span className="font-mono font-semibold">{fmt(merged.siteData.grossSf)}</span> gross SF</span>
              </>
            )}
            {merged.siteData?.lotSf != null && (
              <>
                <span className="text-slate-300">·</span>
                <span><span className="font-mono font-semibold">{fmt(merged.siteData.lotSf)}</span> SF lot</span>
              </>
            )}
            {merged.siteData?.surfaceParking != null && (
              <>
                <span className="text-slate-300">·</span>
                <span><span className="font-mono font-semibold">{fmt(merged.siteData.surfaceParking)}</span> surface stalls</span>
              </>
            )}
            {merged.siteData?.buildingCount != null && (
              <>
                <span className="text-slate-300">·</span>
                <span><span className="font-mono font-semibold">{fmt(merged.siteData.buildingCount)}</span> buildings</span>
              </>
            )}
          </div>

          {/* Net-vs-gross is invisible to a visitor unless we say it out loud.
              The three totals an architect publishes for one building differ by
              5–8%, and the wrong one produces a budget that looks completely
              normal. See src/lib/areaSheet.js. */}
          {merged.projectTotals.grossSfNeedsReview && (
            <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 leading-snug">
              <span className="font-semibold">Check the square footage. </span>
              {merged.projectTotals.grossSfSummary}
              {merged.projectTotals.grossSfSheet ? ` Read from sheet ${merged.projectTotals.grossSfSheet}.` : ''}
            </p>
          )}
          {!merged.projectTotals.grossSfNeedsReview && merged.projectTotals.grossSfAdjusted && (
            <p className="mt-2 text-xs text-slate-500 leading-snug">{merged.projectTotals.grossSfNote}</p>
          )}

          {(() => {
            // The document's own arithmetic check: the row quantities have to add
            // up to the total printed on the drawing. Same rule as the
            // 'stated-total' check in src/lib/agent/autoChecks.js — mirrored here
            // because the public intake route is stateless and never runs the
            // agent pipeline, so without this line a shortfall (rows sum to 229,
            // cover sheet says 260) would reach the review queue looking plausible.
            const rowSum = merged.unitTypes.reduce((s, r) => s + (Number(r.qty) || 0), 0);
            const statedRaw = merged.projectTotals.statedTotalUnits ?? merged.siteData?.totalUnits;
            const stated = Number(statedRaw);
            if (!merged.unitTypes.length || !Number.isFinite(stated) || stated <= 0 || rowSum === stated) return null;
            const diff = Math.abs(stated - rowSum);
            return (
              <div className="mt-3 rounded-lg bg-white border border-red-200 px-3 py-2">
                <p className="text-xs font-semibold text-red-700">
                  The unit rows add up to {fmt(rowSum)}, but the drawings state {fmt(stated)} total units.
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {fmt(diff)} unit{diff !== 1 ? 's are' : ' is'} {rowSum < stated ? 'missing from' : 'extra in'} the
                  breakdown — a unit type may {rowSum < stated ? 'be missing' : 'be double-counted'}. Someone at ILC
                  will reconcile this before anything is priced.
                </p>
              </div>
            );
          })()}

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
          {items.some(i => i.status === 'uploading')
            ? 'Sending your drawings… you can leave this page open, a full set takes a few minutes.'
            : 'Reading your drawings…'}
        </p>
      )}
    </div>
  );
}
