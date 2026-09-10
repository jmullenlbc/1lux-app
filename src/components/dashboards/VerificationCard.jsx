'use client';
// "Things Needing a Look" — the Main-dashboard card.
//
// Mike, 2026-09-09: "do we need to have a verification area for things that are
// conflicting or need attention in general but it can't be overwhelming. like
// maybe a few a week at most."
//
// Five checks, never more than five items on screen, never more than five new
// ones surfaced in a week, and only ever about open jobs or jobs closed in the
// last 90 days. Every item has a "That's fine" button that puts it away for
// everyone.
//
// Mike, 2026-09-10: "I don't think these cards should ever get deleted. they
// should get archived somewhere into an archive that is accessible but not
// easily." That is the closed line at the bottom — one click away, out of the
// way, and only fetched when somebody opens it.
//
// This card fetches its own data rather than going through the dashboard render
// route, because it also has to WRITE (it stamps which items have been shown).
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

const TONE = {
  TEAM_MISMATCH:     'bg-red-50 text-red-700 border-red-200',
  CLOSE_DATE_MISSING:'bg-amber-50 text-amber-700 border-amber-200',
  CLOSE_DATE_GUESSED:'bg-amber-50 text-amber-700 border-amber-200',
  NO_LEAD:           'bg-amber-50 text-amber-700 border-amber-200',
  DUPLICATE_EMAIL:   'bg-sky-50 text-sky-700 border-sky-200',
  PERSON_NO_COMPANY: 'bg-sky-50 text-sky-700 border-sky-200',
};

const LABEL = {
  TEAM_MISMATCH:     'Two answers',
  CLOSE_DATE_MISSING:'No close date',
  CLOSE_DATE_GUESSED:'Guessed date',
  NO_LEAD:           'No main contact',
  DUPLICATE_EMAIL:   'Same email',
  PERSON_NO_COMPANY: 'No company',
};

function whenPutAway(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function VerificationCard() {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [err,     setErr]     = useState(null);
  const [busy,    setBusy]    = useState(null);

  // The archive. Closed by default and never fetched until it is opened.
  const [archiveOpen,    setArchiveOpen]    = useState(false);
  const [archive,        setArchive]        = useState(null);
  const [archiveLoading, setArchiveLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/verification');
      const j   = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setData(j);
      setErr(null);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const loadArchive = useCallback(async () => {
    setArchiveLoading(true);
    try {
      const res = await fetch('/api/verification/archive');
      const j   = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setArchive(j.items || []);
    } catch (e) {
      setErr(e.message);
    } finally {
      setArchiveLoading(false);
    }
  }, []);

  function toggleArchive() {
    const next = !archiveOpen;
    setArchiveOpen(next);
    if (next && archive === null) loadArchive();
  }

  // "That's fine" — take it off the list. Nothing is deleted: it goes into the
  // archive below and can be brought back. The row is removed here rather than
  // by reloading, so nothing new slides into its place mid-click and gets put
  // away by accident.
  async function dismiss(item) {
    setBusy(item.key);
    try {
      const res = await fetch('/api/verification/dismiss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: item.key }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      setData(d => d && {
        ...d,
        items:         d.items.filter(i => i.key !== item.key),
        totalOpen:     Math.max(0, (d.totalOpen || 1) - 1),
        archivedCount: (d.archivedCount || 0) + 1,
      });
      // Whatever the archive last showed is now out of date.
      setArchive(null);
      if (archiveOpen) loadArchive();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(null);
    }
  }

  // Bring one back out of the archive and onto the card.
  async function restore(item) {
    setBusy(item.key);
    try {
      const res = await fetch('/api/verification/archive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: item.key }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      setArchive(a => (a || []).filter(i => i.key !== item.key));
      setData(d => d && { ...d, archivedCount: Math.max(0, (d.archivedCount || 1) - 1) });
      await load();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return <p className="text-xs text-slate-400 italic px-3 py-6 text-center">Having a look…</p>;
  }

  if (err && !data) {
    return <p className="text-xs text-red-500 px-3 py-6 text-center">{err}</p>;
  }

  const items         = data?.items || [];
  const archivedCount = data?.archivedCount || 0;

  // The archive line. Deliberately plain and small — reachable, not prominent.
  const archiveSection = archivedCount > 0 && (
    <div className="border-t border-slate-100 mt-1">
      <button
        type="button"
        onClick={toggleArchive}
        className="w-full flex items-center gap-1.5 px-2 py-2 text-[11px] text-slate-400 hover:text-slate-600 transition-colors"
      >
        <svg
          className={`w-3 h-3 shrink-0 transition-transform ${archiveOpen ? 'rotate-90' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
        </svg>
        Put away ({archivedCount})
      </button>

      {archiveOpen && (
        <div className="px-2 pb-3">
          {archiveLoading && <p className="text-[11px] text-slate-400 italic py-2">Fetching…</p>}

          {!archiveLoading && archive && archive.length === 0 && (
            <p className="text-[11px] text-slate-400 py-2">Nothing in here.</p>
          )}

          {!archiveLoading && archive && archive.length > 0 && (
            <>
              <p className="text-[11px] text-slate-400 pb-2">
                Nothing is ever thrown away. Anything here can be put back on the list.
              </p>
              <ul className="divide-y divide-slate-100 border border-slate-100 rounded-lg">
                {archive.map(item => (
                  <li key={item.key} className="px-2.5 py-2">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-slate-600">{item.title}</p>
                        {item.detail && (
                          <p className="text-[11px] text-slate-400 mt-0.5">{item.detail}</p>
                        )}
                        <p className="text-[10px] text-slate-400 mt-1">
                          {item.stillTrue
                            ? 'Still reads this way'
                            : 'Has been sorted out since'}
                          {item.putAwayBy ? ` · put away by ${item.putAwayBy}` : ''}
                          {whenPutAway(item.putAwayAt) ? ` · ${whenPutAway(item.putAwayAt)}` : ''}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        {item.href && (
                          <Link
                            href={item.href}
                            className="text-[11px] font-medium text-blue-600 hover:text-blue-800 hover:underline"
                          >
                            {item.hrefLabel || 'Open it'} →
                          </Link>
                        )}
                        {item.stillTrue && (
                          <button
                            onClick={() => restore(item)}
                            disabled={busy === item.key}
                            className="text-[11px] text-slate-400 hover:text-slate-700 hover:underline disabled:opacity-50"
                            title="Put this back on the list"
                          >
                            {busy === item.key ? 'Bringing it back…' : 'Bring it back'}
                          </button>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );

  if (!items.length) {
    return (
      <div className="px-1">
        <div className="px-3 py-8 text-center">
          <p className="text-sm text-slate-600">Nothing needs a look right now.</p>
          <p className="text-xs text-slate-400 mt-1">
            This checks open jobs and anything closed in the last {data?.scopeDays ?? 90} days.
          </p>
        </div>
        {archiveSection}
      </div>
    );
  }

  return (
    <div className="px-1">
      {err && <p className="text-xs text-red-500 px-2 pb-2">{err}</p>}

      <ul className="divide-y divide-slate-100">
        {items.map(item => (
          <li key={item.key} className="py-3 px-2 flex items-start gap-3">
            <span
              className={`shrink-0 mt-0.5 text-[10px] font-semibold uppercase tracking-wide px-2 py-1 rounded border ${TONE[item.kind] || 'bg-slate-50 text-slate-600 border-slate-200'}`}
            >
              {LABEL[item.kind] || 'Look'}
            </span>

            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-slate-800">{item.title}</p>
              <p className="text-xs text-slate-500 mt-0.5">{item.detail}</p>

              <div className="flex items-center gap-3 mt-2">
                {item.href && (
                  <Link
                    href={item.href}
                    className="text-xs font-medium text-blue-600 hover:text-blue-800 hover:underline"
                  >
                    {item.hrefLabel || 'Open it'} →
                  </Link>
                )}
                <button
                  onClick={() => dismiss(item)}
                  disabled={busy === item.key}
                  className="text-xs text-slate-400 hover:text-slate-700 hover:underline disabled:opacity-50"
                  title="Takes it off the list for everyone. Nothing is thrown away — it goes to Put away at the bottom."
                >
                  {busy === item.key ? 'Putting it away…' : "That's fine"}
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>

      <p className="text-[11px] text-slate-400 px-2 pt-2 pb-1">
        {data.totalOpen > items.length
          ? `${data.totalOpen - items.length} more waiting — a few at a time, at most ${data.weeklyLimit} new ones a week.`
          : `At most ${data.weeklyLimit} new ones a week. Open jobs and anything closed in the last ${data.scopeDays} days.`}
      </p>

      {archiveSection}
    </div>
  );
}
