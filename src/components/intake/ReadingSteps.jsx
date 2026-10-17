'use client';
import { PARSE_STEPS } from '@/lib/intake/stagedParse';
import ReadingWait from '@/components/ReadingWait';

/**
 * What the read looks like while it is happening.
 *
 * A drawing set takes about a minute to read. For that whole minute the old
 * version showed one word, "Reading…", and nothing else moved, which on a
 * phone on a job site is indistinguishable from a hung page. Mike, 2026-08-25,
 * on splitting the read into steps: "yes amazing idea with a cool sipping
 * animated thing".
 *
 * Every step here is a real HTTP request that really finished, not a timer
 * pretending to be progress. That matters: if the read stalls, this stalls too,
 * on the step that stalled, which is the honest thing to show.
 *
 * Steps that do not apply are marked "not needed" rather than removed, a step
 * disappearing mid-read reads as an error.
 */
export default function ReadingSteps({ steps, startedAt }) {
  const finished = PARSE_STEPS.filter(s => steps[s.key] === 'done' || steps[s.key] === 'skipped').length;
  const pct = Math.round((finished / PARSE_STEPS.length) * 100);

  return (
    <div className="mt-2.5 pl-1">
      <style>{SHIMMER}</style>

      {/* One bar for the whole read. It fills as steps land, and the moving
          highlight is the only thing here that is decoration. It says "still
          working" during the long gaps while a step is running. */}
      <div className="h-1 rounded-full bg-slate-100 overflow-hidden">
        <div
          className="h-full rounded-full bg-orange-400 transition-[width] duration-700 ease-out ilc-shimmer"
          style={{ width: `${Math.max(4, pct)}%` }}
        />
      </div>

      <ol className="mt-2 space-y-1">
        {PARSE_STEPS.map(step => {
          const state = steps[step.key] ?? 'pending';
          return (
            <li key={step.key} className="flex items-center gap-2 text-[11px] leading-4">
              <Mark state={state} />
              <span className={
                state === 'active'  ? 'text-slate-700 font-semibold'
                : state === 'done'  ? 'text-slate-500'
                : state === 'skipped' ? 'text-slate-300'
                : 'text-slate-300'
              }>
                {step.label}
              </span>
              {state === 'skipped' && <span className="text-slate-300">· not needed</span>}
              {state === 'active'  && <Dots />}
            </li>
          );
        })}
      </ol>

      {/* Shown once the wait is long enough to be worth explaining. A number
          that visibly counts up is what tells someone it is not stuck, and it
          used to say "about a minute", which a plotted set beats by well over a
          minute. The words live in ReadingWait now, with every other place we
          read a drawing. */}
      <ReadingWait startedAt={startedAt} className="mt-1.5" />
    </div>
  );
}

/** The marker at the head of each line: check, live ring, skip, or nothing. */
function Mark({ state }) {
  if (state === 'done') {
    return (
      <svg className="w-3 h-3 text-green-500 shrink-0" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
      </svg>
    );
  }
  if (state === 'active') {
    return (
      <span className="relative flex w-3 h-3 shrink-0 items-center justify-center">
        <span className="absolute w-3 h-3 rounded-full bg-orange-400 opacity-60 animate-ping" />
        <span className="relative w-1.5 h-1.5 rounded-full bg-orange-500" />
      </span>
    );
  }
  if (state === 'skipped') {
    return <span className="w-3 h-3 shrink-0 flex items-center justify-center text-slate-300">-</span>;
  }
  return <span className="w-3 h-3 shrink-0 flex items-center justify-center"><span className="w-1.5 h-1.5 rounded-full bg-slate-200" /></span>;
}

/** Three dots that fill in turn, the smallest possible "still going". */
function Dots() {
  return (
    <span className="inline-flex gap-0.5 ml-0.5" aria-hidden="true">
      {[0, 1, 2].map(i => (
        <span
          key={i}
          className="w-0.5 h-0.5 rounded-full bg-orange-400 ilc-dot"
          style={{ animationDelay: `${i * 0.16}s` }}
        />
      ))}
    </span>
  );
}

// Kept here rather than in the Tailwind config: these two keyframes exist for
// this one component, and putting them in the global theme would mean anyone
// reading the config has to work out where they are used.
const SHIMMER = `
@keyframes ilc-shimmer {
  0%   { background-position: -120% 0; }
  100% { background-position:  220% 0; }
}
.ilc-shimmer {
  background-image: linear-gradient(90deg, transparent 0%, rgba(255,255,255,.75) 50%, transparent 100%);
  background-size: 60% 100%;
  background-repeat: no-repeat;
  animation: ilc-shimmer 1.6s linear infinite;
}
@keyframes ilc-dot { 0%, 80%, 100% { opacity: .25; } 40% { opacity: 1; } }
.ilc-dot { animation: ilc-dot 1.2s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) {
  .ilc-shimmer, .ilc-dot { animation: none; }
  .ilc-shimmer { background-image: none; }
}
`;
