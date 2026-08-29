/**
 * Driving the read from the browser, one step at a time.
 *
 * ── Why the browser drives it ─────────────────────────────────────────────────
 * Reading a real drawing set takes about a minute. Amplify's front door hangs
 * up on any single request that runs longer than ~30 seconds and returns an
 * empty 504, so the one-request version of this had NEVER once finished on the
 * live site — at any file size. (Measured 2026-08-25: 504 at 28.1s, every time,
 * including on a 472 KB single sheet.)
 *
 * The read is therefore four short requests instead of one long one, and the
 * thing that knows how far along we are is this file. Each request is
 * comfortably inside the ceiling; the work between them is parked server-side
 * under a `scanKey`, because it is far too big to hand back and forth.
 *
 * ── The side benefit, which is really the point ───────────────────────────────
 * A single long request has nothing to say until it ends. Four short ones can
 * tell a GC standing on a job site exactly what is happening — which is what
 * Mike asked for, and what turns a one-minute wait from "it's broken" into
 * "it's working".
 *
 * @see src/app/api/intake/parse/route.js — the matching stages
 * @see src/components/intake/ReadingSteps.jsx — what the visitor sees
 */
import { combineIntakeResult, siteHasNumbers } from './combineResult.js';

/**
 * The steps, in the order they run, in words a contractor would use.
 *
 * Two of them do not always run: a spreadsheet has no sheets to open, and a
 * clean unit matrix means the site plan never has to be looked at. They are
 * still listed, and reported as skipped rather than quietly dropped — a step
 * that vanishes mid-read looks like something went wrong.
 */
export const PARSE_STEPS = [
  { key: 'scan',   label: 'Looking through the set' },
  { key: 'render', label: 'Opening the sheets we need' },
  { key: 'matrix', label: 'Reading the unit counts' },
  { key: 'site',   label: 'Reading the site plan' },
];

/**
 * Plain words for the step that was running, for an error a GC has to read.
 * Exported so the dropzone says the same thing this file does.
 */
export const STEP_WORDS = {
  scan:   'looking through the set',
  render: 'opening the sheets',
  matrix: 'reading the unit counts',
  site:   'reading the site plan',
};

/** How many slices the scan may take before we stop asking. See stageScan. */
const MAX_SCAN_SLICES = 30;

/**
 * Post one stage. A non-2xx carries a message written for a public reader.
 *
 * `file` is only ever set on the first step, and only when there was nowhere to
 * upload to first -- a laptop with no bucket. The file rides along with that
 * one short request and the server parks it; every step after works from the
 * key it hands back, exactly as it does in production.
 */
async function stage(body, signal, file) {
  const r = await fetch('/api/intake/parse', {
    method: 'POST',
    ...(file
      ? { body: (() => {
          const fd = new FormData();
          fd.append('file', file);
          fd.append('stage', body.stage);
          return fd;
        })() }
      : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    signal,
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) {
    // Every error this route returns carries a message, so a failure WITHOUT
    // one did not come from our code: it is the front door hanging up at ~30
    // seconds, or the Lambda dying. That used to print a bare "Could not read
    // this file", which reads as "your drawing is bad" and names neither the
    // step nor the status -- the two things that actually locate the fault.
    const err = new Error(d.message
      || `The read stopped while ${STEP_WORDS[body.stage] ?? 'reading the file'} (${r.status}). Please try again. (R3/${body.stage})`);
    err.shown = true;          // already public-readable; don't dress it up
    throw err;
  }
  return d;
}

/**
 * Run the staged read.
 *
 * @param {object}   a
 * @param {string}   a.s3Key      where the browser already PUT the file
 * @param {File}     [a.file]     the file itself, when there was nowhere to PUT
 *                                it (local dev). Sent with the first step only.
 * @param {string}   a.fileName
 * @param {Function} a.onStep     (key, state, extra) — state is
 *                                'active' | 'done' | 'skipped'
 * @param {AbortSignal} [a.signal]
 * @returns {Promise<object|null>} the proposal, or null if the server declined
 *          to stage this file and the caller should fall back to one request
 */
export async function runStagedParse({ s3Key, file, fileName, onStep = () => {}, signal }) {
  onStep('scan', 'active');
  let scan = await stage({ stage: 'scan', s3Key, fileName }, signal, s3Key ? null : file);

  // A set can be too big to read inside one request even now: 158 sheets of a
  // 60 MB architectural set took longer than the front door allows, and the
  // whole read died on its first step. So the scan is allowed to come back and
  // say "still reading" -- each slice is short, and together they finish.
  for (let slice = 0; scan.staging && scan.more; slice++) {
    if (slice >= MAX_SCAN_SLICES) {
      const err = new Error(
        'This set is taking longer to read than we can hold a line open for. '
        + "Send it to budgets@ilcstudios.com and we'll take it from there.");
      err.shown = true;
      throw err;
    }
    onStep('scan', 'active', { totalPages: scan.totalPages, pagesRead: scan.pagesRead });
    scan = await stage({ stage: 'scan', scanKey: scan.scanKey }, signal);
  }

  // The server can decline to stage — no bucket to park the scan in. That is
  // not a failure; it means "this one is small enough to do in one go".
  if (!scan.staging) return null;

  onStep('scan', 'done', { totalPages: scan.totalPages, sheetsRead: scan.sheetsRead });

  const { scanKey } = scan;
  try {
    let keptSheets = null;
    let sheetsRead = scan.sheetsRead;

    if (scan.needsRender) {
      onStep('render', 'active');
      const r = await stage({ stage: 'render', scanKey }, signal);
      keptSheets = r.keptSheets;
      sheetsRead = r.sheetsRead ?? sheetsRead;
      onStep('render', 'done', { keptSheets });
    } else {
      onStep('render', 'skipped');
    }

    onStep('matrix', 'active');
    const m = await stage({ stage: 'matrix', scanKey }, signal);
    onStep('matrix', 'done', { unitTypes: m.matrix?.unitTypes?.length ?? 0 });

    let siteData = null;
    if (m.needsSite) {
      onStep('site', 'active');
      try {
        siteData = (await stage({ stage: 'site', scanKey }, signal)).siteData;
        onStep('site', 'done');
      } catch (e) {
        // With a unit matrix in hand the answer is still good, and a failed
        // second look should not throw it away. With no text layer -- or with a
        // unit-counts read that FAILED rather than came up empty -- there was
        // never any other way in, so those really are failures.
        if (!scan.hasText || m.matrixError) throw e;
        onStep('site', 'skipped');
      }
    } else {
      onStep('site', 'skipped');
    }

    // Both reads are out. Report what went wrong rather than letting this come
    // back as "no numbers found", which would blame the drawing for our failure.
    if (m.matrixError && !siteHasNumbers(siteData)) {
      const err = new Error(m.matrixError);
      err.shown = true;
      throw err;
    }

    // Combined by the SAME function the single-request route uses, so the two
    // paths cannot disagree about which read won.
    return combineIntakeResult({
      fileName,
      totalPages: scan.totalPages,
      sheetsRead,
      keptSheets,
      matrix: m.matrix,
      siteData,
    });
  } finally {
    // Best effort, and deliberately not awaited into the result: the visitor
    // has his numbers, and a stray parked scan is swept by the storage
    // lifecycle rule anyway.
    stage({ stage: 'done', scanKey }).catch(() => {});
  }
}
