'use client';
import { useEffect, useState } from 'react';

/**
 * How long a drawing read takes, said out loud.
 *
 * ── Why this exists ──
 * Mike, 2026-08-28: "we need a warning that a drawing could take a few minutes
 * to read anywhere where we are doing that right? don't you think so the user
 * understands the timing?"
 *
 * He is right, and the reason is worth writing down. Reading a real set is not
 * a page load. The set is opened, its index is read off a picture, the sheets
 * worth opening are drawn and read, and every one of those is a separate trip
 * to a model — because Amplify's front door hangs up on any single request that
 * runs past about thirty seconds. A 120-sheet set measures around two and a
 * half minutes end to end.
 *
 * Two and a half minutes with nothing said about it is indistinguishable from a
 * broken page, and the person waiting is often a GC on a phone on a job site.
 * So the timing is said TWICE: once before the file is picked, so nobody is
 * surprised, and once while the read is running, with a number that visibly
 * counts up — a counter is what says "working", where a spinner only says
 * "something is spinning".
 *
 * ── Why the copy is here and not in each panel ──
 * A drawing is read in five different places in this app, and until now they
 * each guessed: "about a minute", "15–30 seconds", or nothing at all. The
 * 15–30 was the worst of them, because it is roughly the number the request
 * dies at. One file, one set of words, one place to correct them when the
 * timing changes.
 */

/** The up-front warning. Said before a file is chosen, not after. */
export const READING_TIME_HINT =
  'Reading a full set takes a few minutes — leave this page open while it works.';

/** The same thing in one short clause, for panels with no room for a sentence. */
export const READING_TIME_SHORT = 'takes a few minutes';

/**
 * The line shown WHILE a read is running.
 *
 * Quiet for the first few seconds: a small file really does come back quickly,
 * and warning about minutes on something that takes eight seconds trains people
 * to ignore the warning. Past ninety seconds it says so explicitly, because by
 * then someone is deciding whether to give up, and "still going" is the only
 * thing they actually want to know.
 *
 * @param startedAt  Date.now() when the read began; nothing renders without it
 * @param quietFor   seconds before the line appears at all
 */
export default function ReadingWait({ startedAt, quietFor = 6, className = '' }) {
  const elapsed = useElapsed(startedAt);
  if (!startedAt || elapsed < quietFor) return null;

  return (
    <p className={`text-[11px] text-slate-400 tabular-nums ${className}`}>
      {formatElapsed(elapsed)} · {elapsed >= 90
        ? 'still reading — sets plotted as pictures take the longest'
        : 'a full set takes a few minutes'}
    </p>
  );
}

/** Seconds up to a minute, then minutes and seconds — 143 means nothing at a glance. */
export function formatElapsed(seconds) {
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, '0')}s`;
}

/**
 * Seconds since the read started.
 *
 * Its own hook so the once-a-second re-render stays inside this component and
 * does not drag a whole file list along with it.
 */
export function useElapsed(startedAt) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!startedAt) return undefined;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [startedAt]);
  if (!startedAt) return 0;
  return Math.max(0, Math.floor((now - startedAt) / 1000));
}
