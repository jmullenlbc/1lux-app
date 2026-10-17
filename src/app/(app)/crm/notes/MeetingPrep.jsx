'use client';
/**
 * Meeting Prep panel on a sales note. Shows the latest brief, 3 to 5 talking
 * points, each with chips naming the facts it rests on, and the facts
 * themselves, folded away. "Prep for this meeting" builds a new one.
 * autoRun: build one by itself when none exists yet, an upcoming meeting with
 * something linked, so the Prep tab is never empty the day before (Mike 9-25).
 * Internal only; the route refuses a CLIENT_VIEWER. Budgets and sale totals
 * can appear; DN and buy price never do.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { BLOCKS, BLOCK_LABEL } from '@/lib/meetingPrep/brief';
import { TILE, BTN_COMPACT, LABEL } from '@/components/ui/tokens';

export default function MeetingPrep({ noteId, autoRun = false }) {
  const [brief, setBrief]         = useState(null);
  const [loading, setLoading]     = useState(true);
  const [busy, setBusy]           = useState(false);
  const [error, setError]         = useState('');
  const [showFacts, setShowFacts] = useState(false);
  const [lit, setLit]             = useState(null); // ref highlighted from a chip
  const autoRanRef                = useRef(null);   // the note autoRun already fired for

  useEffect(() => {
    let live = true;
    setLoading(true);
    setError('');
    fetch(`/api/crm/notes/${noteId}/meeting-prep`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (live) setBrief(d?.brief || null); })
      .catch(() => {})
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [noteId]);

  const run = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const r = await fetch(`/api/crm/notes/${noteId}/meeting-prep`, { method: 'POST' });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || `Could not build the brief (error ${r.status}).`);
      setBrief(d.brief);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }, [noteId]);

  // Once the saved brief has loaded and there is none, build one, once per note.
  useEffect(() => {
    if (!autoRun || loading || brief || busy || autoRanRef.current === noteId) return;
    autoRanRef.current = noteId;
    run();
  }, [autoRun, loading, brief, busy, noteId, run]);

  const factByRef = Object.fromEntries((brief?.facts || []).map(f => [f.ref, f]));

  const openFact = ref => {
    setShowFacts(true);
    setLit(ref);
    setTimeout(() => document.getElementById(`mp-${noteId}-${ref}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 0);
  };

  return (
    <div className={TILE}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <p className={LABEL}>Meeting prep</p>
          {brief?.createdAt && (
            <p className="text-[11px] text-slate-500 tabular-nums">
              Built {new Date(brief.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={run}
          disabled={busy}
          className={BTN_COMPACT}
        >
          {busy ? 'Reading the CRM...' : brief ? 'Refresh brief' : 'Prep for this meeting'}
        </button>
      </div>

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      {loading && !brief && <p className="mt-2 text-xs text-slate-500">Loading...</p>}

      {!loading && !brief && !error && (
        <p className="mt-2 text-xs text-slate-500">
          Pulls what the CRM already knows about the people, companies and deals on this note: the jobs we have with them, their budgets, open follow-ups and recent news. It also suggests a few talking points.
        </p>
      )}

      {brief && (
        <>
          {brief.points.length > 0 ? (
            <ol className="mt-3 space-y-2">
              {brief.points.map((p, i) => (
                <li key={p.id} className="text-sm text-slate-800 flex gap-2">
                  <span className="text-slate-400 w-4 shrink-0">{i + 1}.</span>
                  <span>
                    {p.text}{' '}
                    {p.refs.map(ref => (
                      <button
                        key={ref}
                        type="button"
                        title={factByRef[ref]?.text || ''}
                        onClick={() => openFact(ref)}
                        className="inline-block align-middle ml-0.5 px-1.5 py-0 rounded bg-orange-50 text-orange-700 text-[11px] font-semibold hover:bg-orange-100"
                      >
                        {ref}
                      </button>
                    ))}
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-2 text-xs text-slate-500">
              {brief.status === 'error'
                ? `The talking points could not be written this time${brief.error ? ` (${brief.error})` : ''}. The facts below are still current.`
                : 'Not enough on file yet for talking points.'}
            </p>
          )}

          {brief.facts.length > 0 && (
            <div className="mt-3">
              <button
                type="button"
                onClick={() => setShowFacts(s => !s)}
                className="text-xs text-slate-500 hover:text-slate-700"
              >
                {showFacts ? '▾' : '▸'} Facts used ({brief.facts.length})
              </button>
              {showFacts && (
                <div className="mt-2 space-y-2">
                  {BLOCKS.filter(b => brief.facts.some(f => f.block === b.key)).map(b => (
                    <div key={b.key}>
                      <p className={LABEL}>{BLOCK_LABEL[b.key]}</p>
                      <ul className="mt-0.5 space-y-0.5">
                        {brief.facts.filter(f => f.block === b.key).map(f => (
                          <li
                            key={f.id}
                            id={`mp-${noteId}-${f.ref}`}
                            className={`text-xs text-slate-600 flex gap-2 rounded px-1 ${lit === f.ref ? 'bg-orange-50' : ''}`}
                          >
                            <span className="text-orange-600 font-semibold w-7 shrink-0">{f.ref}</span>
                            <span>{f.text}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
