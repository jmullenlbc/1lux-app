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
/**
 * The runaway stop on the drawing-read loop.
 *
 * Above the most sheets the render stage will ever keep, for the same reason as
 * the close-up stop: quitting with sheets unread throws away the drawing we
 * came for and reports the answer as if it were complete.
 */
const MAX_SITE_SHEET_READS = 16;

/** The runaway stop on the front-sheet loop; the server looks at very few. */
const MAX_INDEX_LOOKS = 8;

/**
 * The runaway stop on the close-up loop.
 *
 * Kept ABOVE the most close-ups the server will ever cut (MAX_INDEX_TILES in
 * sheetIndexVision.js) so this never ends a read early: a loop that quits with
 * close-ups still unread drops the tail of the index, and the sheets it names
 * are exactly the ones we came for. This is only here so a server that keeps
 * saying "one more" cannot spin the visitor forever.
 */
const MAX_INDEX_TILE_READS = 24;

export const PARSE_STEPS = [
  { key: 'scan',   label: 'Looking through the set' },
  { key: 'index',  label: 'Reading the drawing index' },
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
  // Two server stages sit behind the one step the visitor sees: finding the
  // index on the cover, then reading it. Both name the same thing here, because
  // "the read stopped while reading the drawing index" is what he needs to know
  // and the split between them is our business, not his.
  index:  'reading the drawing index',
  sheets: 'reading the drawing index',
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

    // A scanned set -- paper that was photographed, or a plot with the text
    // stripped out -- has nothing to search, so the sheets to open have to be
    // found by READING the drawing index off the cover as a picture. A run of
    // short requests: look at the front sheets one at a time until one of them
    // has an index on it, then read that index one close-up at a time. None of
    // it is allowed to sink the read: if any of it comes up empty we open the
    // front of the set, which is what happened before any of this existed.
    if (scan.needsIndex) {
      onStep('index', 'active');
      try {
        // One front sheet per request. Usually the first one answers and the
        // rest are never drawn, so this is normally ONE call, not a loop.
        let found = await stage({ stage: 'index', scanKey }, signal);
        for (let i = 0; found?.more && i < MAX_INDEX_LOOKS; i++) {
          found = await stage({ stage: 'index', scanKey }, signal);
        }

        // The index is transcribed one close-up at a time so no single request
        // can outstay the front door's patience. The server says when it has
        // run out of close-ups; the cap is only here so a server that never
        // says so cannot spin forever.
        let read = found.found ? await stage({ stage: 'sheets', scanKey }, signal) : null;
        for (let i = 0; read?.more && i < MAX_INDEX_TILE_READS; i++) {
          read = await stage({ stage: 'sheets', scanKey }, signal);
        }

        if (read?.mapped) {
          sheetsRead = read.sheetsRead ?? sheetsRead;
          onStep('index', 'done', { sheetsRead });
        } else {
          onStep('index', 'skipped');
        }
      } catch {
        onStep('index', 'skipped');
      }
    } else {
      onStep('index', 'skipped');
    }

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
        // One drawing per request, same reason as the index close-ups: both
        // sheets in one call measured 29.4s against a ~30s front door.
        let read = await stage({ stage: 'site', scanKey }, signal);
        for (let i = 0; read?.more && i < MAX_SITE_SHEET_READS; i++) {
          read = await stage({ stage: 'site', scanKey }, signal);
        }
        siteData = read.siteData;
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
