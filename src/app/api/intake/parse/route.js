import { NextResponse } from 'next/server';
import { stampError } from '@/lib/intake/errorNumbers';
import Anthropic from '@anthropic-ai/sdk';
import { getAnthropicKey } from '@/lib/anthropicKey';
import { extractDrawingText, parseUnitMatrix, fileExt, ACCEPTED_EXTS, IMAGE_EXTS } from '@/lib/drawingExtract';
import { renderPdfPages, renderPdfCrops, extractSiteData, mergeSiteData, validateSiteData } from '@/lib/siteVision';
import {
  INDEX_CANDIDATE_PAGES, locateIndexBlock, readIndexTile, probeSheetNumber,
  padBox, indexTiles, offsetFromSelf, mapPicksToPages, reanchor, landedRight,
  mergeIndexEntries, mergePicks, TITLE_BLOCK_BOX, nextTileAfterBlank, planHunt,
} from '@/lib/sheetIndexVision';
import { buildSheetIndex, pickKeySheets, pagesToRender, SET_PAGE_THRESHOLD } from '@/lib/sheetIndex';
import { openUploadedPdf } from '@/lib/pdfRange';
import {
  getUploadedObject, deleteUploadedObject, putUploadedObjectDev,
  putSheetImage, getSheetImage, deleteSheetImage,
  putScanState, putScanStateAt, getScanState, deleteScanState,
  putScanAttempt, getScanAttempt, deleteScanAttempt,
  MAX_INTAKE_UPLOAD_BYTES,
} from '@/lib/uploadStorage';
import { rateLimit, clientIp } from '@/lib/rateLimit';
import { wrapClient } from '@/lib/agent/client';
import { combineIntakeResult, needsSiteRead, siteHasNumbers } from '@/lib/intake/combineResult';

export const dynamic = 'force-dynamic';

/**
 * Reading a 400 MB set takes longer than reading a 4 MB one, and the default
 * ceiling would cut it off mid-scan. The budgets below are the real limits;
 * this is the backstop behind them.
 */
export const maxDuration = 300;

/**
 * PUBLIC, UNAUTHENTICATED drawing parse for the conceptual-budget intake.
 *
 * ── Design decision: this route is STATELESS ──
 * It accepts a file, returns structured data, and keeps NOTHING durable. No
 * ProjectFile row, no Project. Two reasons:
 *
 *   1. A public form should not create durable records from anonymous input.
 *      Nothing persists until a human at ILC accepts the submission — which is
 *      exactly the review-queue model Mike asked for. An abandoned form leaves
 *      no trace to clean up.
 *   2. The client holds parsed results in memory and sends them along at submit.
 *
 * ── Two ways in ──
 * 1. multipart form-data with `file` — the classic path. Works everywhere, but
 *    on production Amplify's front door rejects bodies over ~4.4 MB before this
 *    code runs, so it effectively serves small files and local dev.
 * 2. JSON `{ s3Key, fileName }` — the direct-to-S3 path. The browser already
 *    PUT the file to S3 via a presigned slip (/api/uploads/presign); we read the
 *    bytes back, parse them, and DELETE the object — stateless stays stateless.
 *
 * ── Reading a whole set, not a sheet (2026-08-21) ──
 * The size ceiling is 400 MB because a GC sends the drawings he has, not the
 * two sheets we want. Three things make a number that large safe:
 *
 *   - Nothing ever holds the file. The browser streams it straight to S3, and
 *     a PDF that big is read back BY BYTE RANGE (src/lib/pdfRange.js), so peak
 *     memory tracks the pages we touch rather than the size of the set.
 *   - We read the sheet index, not the drawings. Fable 5 is shown one line per
 *     sheet — number, title, snippet — and names the four sheets that matter
 *     (src/lib/sheetIndex.js). Only those are rendered and read in full.
 *   - Everything is time-budgeted and degrades instead of failing. A scan that
 *     runs long returns what it has; a model that is unreachable falls back to
 *     the deterministic sheet scan. "Never fails unless it is absurdly big."
 *
 * Spreadsheets keep a much smaller ceiling: an xlsx has to be read whole, so
 * the argument above does not apply to it.
 *
 * ── STAGES, and the 30-second wall (2026-08-25) ─────────────────────────────
 * Everything above was designed against `maxDuration` — 300 seconds. It turns
 * out a second, lower ceiling sits in FRONT of that one and nobody knew: the
 * CloudFront distribution Amplify manages on our behalf hangs up on any origin
 * response slower than ~30 seconds, and returns an empty 504. That distribution
 * is not visible or editable in our AWS console — Amplify owns it — so the
 * limit cannot simply be raised.
 *
 * Measured on production, 2026-08-25, with a real 245 MB / 120-sheet set:
 *
 *      upload straight to S3            18.8s   fine — never touches this app
 *      the read, one 472 KB sheet       ~49s    504 at 28.1s
 *      the read, the full 120 sheets    ~66s    504 at 28.1s
 *
 * So the public conceptual-budget page had NEVER completed a read in
 * production, at any file size. The 504 arrives with no body, which is why it
 * looked like a generic failure rather than a timeout.
 *
 * The fix is not to make the read faster — 17.5s of it is PDF work and the rest
 * is model latency we do not control. It is to stop asking one long question.
 * The read is now four requests the BROWSER drives, each comfortably inside the
 * ceiling, with the working state parked in storage between them:
 *
 *      stage           what it does                              measured
 *      ─────────────────────────────────────────────────────────────────────
 *      scan            text layer + pick which sheets matter     ~16s
 *      render          draw those sheets, keep a copy            ~8s
 *      matrix          read the unit matrix off the text         ~16s
 *      site            read the site plan (only when needed)     ~25s
 *      done            throw away the working files              <1s
 *
 * `site` is still conditional, exactly as before — it is the more expensive
 * call and a sheet with a clean matrix never needs it. Being separate requests
 * rather than one means running them in sequence costs nothing; each is judged
 * against the ceiling on its own.
 *
 * Omitting `stage` runs the whole thing in one request, as it always did. That
 * path is not dead code: it is local dev, the multipart door, and any caller
 * that would rather wait — none of which sit behind CloudFront.
 *
 * ── Abuse surface ──
 * Every call costs an Anthropic request. Throttled per IP, size-capped, and
 * extension-checked before any model call. See the limitation note in
 * `rateLimit.js` — the counter is per warm Lambda instance, not global.
 */

const MAX_BYTES = MAX_INTAKE_UPLOAD_BYTES;          // 400 MB, shared with the presign desk
const MAX_SHEET_BYTES = 50 * 1024 * 1024;           // spreadsheets are read whole
/**
 * Two throttles, because one read is now many requests.
 *
 * UPLOADS is the one that protects the wallet: it is charged only when a
 * request STARTS a read, which is the only thing that can cost an Anthropic
 * call. 12 fresh drawing sets a minute from one address is already generous.
 *
 * REQUESTS is a flood brake in front of it. A staged read of a large set is a
 * dozen-plus short requests -- scan slices, then render/matrix/site/done -- so
 * the old single 12-per-minute counter rejected an honest GC partway through
 * his own upload with "Too many uploads. Please wait a moment." Continuations
 * are cheap and cannot be made without first paying for a scan key, so they
 * get the loose limit; the tight one still stands where the money is.
 */
const UPLOADS  = { limit: 12,  windowMs: 60_000 };
const REQUESTS = { limit: 150, windowMs: 60_000 };

const tooMany = (retryAfterSec) => NextResponse.json(
  { error: 'rate_limited', message: stampError('rate_limited', 'Too many uploads. Please wait a moment and try again.') },
  { status: 429, headers: { 'Retry-After': String(retryAfterSec) } },
);

/** Scanning budget for a big set. Well under maxDuration, above a normal scan. */
const BIG_SET_SCAN_MS = 90_000;

/**
 * Scanning budget for ONE slice of a staged read.
 *
 * The staged path exists because CloudFront hangs up at about 30 seconds, so
 * BIG_SET_SCAN_MS is not a budget it may ever spend -- a 60 MB, 158-sheet set
 * used the whole 90s and died at 28.06s with nothing to show. A slice reads for
 * this long, parks what it got, and asks to be called again, which keeps every
 * request short no matter how large the set is.
 *
 * 12s rather than something closer to the wall because a slice also pays for
 * opening the file and parking the result on top of its reading time.
 */
const SCAN_SLICE_MS = 12_000;

/**
 * The least a slice may spend reading, however long the open took.
 *
 * Opening a 300 MB set from S3 is dozens of range round-trips, and on the
 * Skyline Ridge failure that unbudgeted open is part of what pushed one slice
 * past the ~30s front door. So the open is charged against the slice
 * (sliceBudgetMs below) — but never all the way to zero, because a slice that
 * reads nothing parks nothing and the scan stops moving.
 */
const MIN_SLICE_READ_MS = 3_000;

/** What a slice may spend READING, after what it already spent opening. */
const sliceBudgetMs = (openMs = 0) =>
  Math.max(MIN_SLICE_READ_MS, SCAN_SLICE_MS - Math.max(0, openMs));

/** A backstop on slices, so a set that never finishes cannot loop forever. */
const MAX_SCAN_SLICES = 80;

// Closing a ranged document is best-effort, never load-bearing. pdfjs's
// destroy() waits for in-flight work, and a page read that was raced out by
// the slice budget can leave a range fetch stuck underneath it — awaiting
// that would hold the RESPONSE hostage until the front door hangs up, which
// is the exact 504 the staged read exists to avoid. Two seconds of grace,
// then the response leaves; a leaked handle dies with the Lambda instance.
const closeQuietly = (handle) => {
  if (!handle?.destroy) return Promise.resolve();
  return Promise.race([
    Promise.resolve(handle.destroy()).catch(() => {}),
    new Promise((res) => setTimeout(res, 2_000).unref?.()),
  ]);
};

/**
 * Stages that resume from a parked scan rather than from a file.
 * Kept as a list because "did the caller send a file or a scan key" is the
 * first branch in the route and it should read as one word.
 */
const RESUME_STAGES = ['index', 'sheets', 'render', 'matrix', 'site', 'done'];
const ALL_STAGES = ['scan', ...RESUME_STAGES];

const mb = (n) => Math.round(n / (1024 * 1024));

const bad = (code, message, status = 400) =>
  NextResponse.json({ error: code, message: stampError(code, message) }, { status });

export async function POST(request) {
  const ip = clientIp(request);
  // The flood brake goes first, before we agree to read a body off the wire.
  const flood = rateLimit(`intake-parse-req:${ip}`, REQUESTS);
  if (!flood.allowed) return tooMany(flood.retryAfterSec);

  // ── Get the bytes, or the scan key, from whichever door they came in ──
  let buffer = null;
  let name = 'upload';
  let s3Key = null;
  let stage = null;
  let scanKey = null;

  const contentType = request.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    let body;
    try {
      body = await request.json();
    } catch {
      return bad('bad_request', 'Could not read the upload.');
    }
    stage   = body?.stage ? String(body.stage) : null;
    scanKey = body?.scanKey ?? null;
    s3Key   = body?.s3Key ?? null;
    name    = String(body?.fileName || 'upload');
  } else {
    let file;
    try {
      const form = await request.formData();
      file  = form.get('file');
      stage = form.get('stage') ? String(form.get('stage')) : null;
    } catch {
      return bad('bad_request', 'Could not read the upload.');
    }
    if (!file || typeof file.arrayBuffer !== 'function') {
      return bad('bad_request', 'No file received.');
    }
    name = file.name || 'upload';
    // The multipart door is local dev and small files only — Amplify caps this
    // path at ~4.4 MB regardless — so the modest ceiling is the right one here.
    if (typeof file.size === 'number' && file.size > MAX_SHEET_BYTES) {
      return bad('too_large', `That file is larger than ${mb(MAX_SHEET_BYTES)} MB.`, 413);
    }
    buffer = Buffer.from(await file.arrayBuffer());
  }

  // A visitor's first request lands on a server that may need fifteen seconds
  // to wake, and the front door hangs up at thirty -- so the intake page rings
  // the bell the moment it opens, while the visitor is still choosing a file.
  // This does nothing on purpose; being asked is the point.
  if (stage === 'warm') {
    return NextResponse.json({ stage: 'warm', ok: true });
  }

  if (stage && !ALL_STAGES.includes(stage)) {
    return bad('bad_request', 'Unknown stage.');
  }

  // Now that we know which kind of request this is, charge the upload counter
  // -- but only for one that begins a read. Everything carrying a scan key is
  // continuing work already paid for.
  if (!scanKey) {
    const fresh = rateLimit(`intake-parse:${ip}`, UPLOADS);
    if (!fresh.allowed) return tooMany(fresh.retryAfterSec);
  }

  // ── A scan that is being continued ──
  // Reading a big set takes longer than one request is allowed to run, so the
  // scan comes back for another slice. It carries a scan key like the stages
  // below, but unlike them it still has to open the file to read more of it.
  if (stage === 'scan' && scanKey) {
    const parked = await getScanState(scanKey);
    if (!parked.ok) return bad(parked.code, parked.message, parked.code === 'bad_key' ? 400 : 410);

    // The reading is done and only the sheet pick is left. It works from the
    // parked pages alone, so this request never pays to open the file at all —
    // the pick used to ride on the FINAL reading slice, and on a big set that
    // stack-up (open + read + model call + park) is what breached the front
    // door's ~30 seconds.
    if (parked.state.pickPending) {
      try {
        return await stageScanPick(scanKey, parked.state);
      } catch (e) {
        return unexpected(e, parked.state?.fileName || 'upload');
      }
    }

    const ext = parked.state.ext || 'pdf';
    const openStarted = Date.now();
    const opened = await openSource({ s3Key: parked.state.s3Key, ext });
    if (opened.error) return opened.error;
    try {
      return await stageScan({
        source:  opened.source,
        opened:  opened.handle,
        name:    parked.state.fileName,
        ext,
        s3Key:   parked.state.s3Key,
        state:   parked.state,
        scanKey,
        openMs:  Date.now() - openStarted,
      });
    } catch (e) {
      return unexpected(e, parked.state?.fileName || 'upload');
    } finally {
      // The uploaded file stays put -- later slices and the render stage still
      // have to read from it. Only `done` clears it.
      await closeQuietly(opened.handle);
    }
  }

  // ── Stages that resume from a parked scan ──
  // These carry no file at all; everything they need was worked out by `scan`.
  if (stage && RESUME_STAGES.includes(stage)) {
    const parked = await getScanState(scanKey);
    // `scan_expired` is the honest answer for a key that has been swept, a key
    // that never existed, and a bucket that is unreachable — from the visitor's
    // side all three mean the same thing and have the same remedy.
    if (!parked.ok) return bad(parked.code, parked.message, parked.code === 'bad_key' ? 400 : 410);
    try {
      if (stage === 'index')  return await stageIndex(scanKey, parked.state);
      if (stage === 'sheets') return await stageSheets(scanKey, parked.state);
      if (stage === 'render') return await stageRender(scanKey, parked.state);
      if (stage === 'matrix') return await stageMatrix(parked.state);
      if (stage === 'site')   return await stageSite(scanKey, parked.state);
      return await stageDone(scanKey, parked.state);
    } catch (e) {
      return unexpected(e, parked.state?.fileName || 'upload');
    }
  }

  // ── Everything below starts from a file ──
  if (!s3Key && !buffer) return bad('bad_request', 'No file received.');

  const ext = fileExt(name);

  // Reject on extension BEFORE fetching from S3 / calling the model.
  if (IMAGE_EXTS.includes(ext)) {
    return bad('image_not_supported',
      'Image files can\'t be read yet. Please upload the original PDF or an Excel file.', 422);
  }
  if (!ACCEPTED_EXTS.includes(ext)) {
    return bad('unsupported_type', 'Unsupported file type. Please upload a PDF or Excel file.', 422);
  }

  const openStarted = Date.now();
  const opened = await openSource({ s3Key, buffer, ext });
  if (opened.error) return opened.error;

  try {
    return stage === 'scan'
      ? await stageScan({ source: opened.source, opened: opened.handle, name, ext, s3Key, buffer,
                          openMs: Date.now() - openStarted })
      : await runWhole({ source: opened.source, opened: opened.handle, name, ext });
  } catch (e) {
    return unexpected(e, name);
  } finally {
    // The scan stage hands the open document off to later stages by parking a
    // key, not by holding it — so the handle is always closed here. What is NOT
    // always deleted is the uploaded object: `scan` leaves it in place because
    // `render` still has to draw from it, and `done` clears it.
    await closeQuietly(opened.handle);
    if (s3Key && stage !== 'scan') await deleteUploadedObject(s3Key);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Opening
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get to something the extractor and the renderer can both read.
 *
 * `source` is raw bytes for a spreadsheet or a small file, and an open pdfjs
 * document for a big set. Neither caller cares which — see pdfRange.js.
 */
async function openSource({ s3Key, buffer, ext }) {
  if (!s3Key) return { source: buffer, handle: null };

  if (ext === 'pdf') {
    const handle = await openUploadedPdf(s3Key, { limit: MAX_BYTES });
    if (!handle.ok) {
      const status = handle.code === 'too_large' ? 413 : handle.code === 'not_found' ? 404 : 400;
      return { error: bad(handle.code, handle.message, status) };
    }
    return { source: handle.doc, handle };
  }

  const fetched = await getUploadedObject(s3Key, { limit: MAX_SHEET_BYTES });
  if (!fetched.ok) {
    const status = fetched.code === 'too_large' ? 413 : fetched.code === 'not_found' ? 404 : 400;
    return { error: bad(fetched.code, fetched.message, status) };
  }
  return { source: fetched.buffer, handle: null };
}

function anthropicClient() {
  const apiKey = getAnthropicKey()?.trim();
  if (!apiKey) {
    // Bare 503 rather than a detailed message — this is a config fault on our
    // side and a public caller should not learn about our key setup.
    console.error('intake/parse: ANTHROPIC_API_KEY not configured');
    return null;
  }
  return (task) => wrapClient(new Anthropic({ apiKey }), task);
}

const unavailable = () =>
  bad('unavailable', 'Parsing is temporarily unavailable.', 503);

/** One place for "a throw reached the top", so every stage fails the same way. */
function unexpected(e, name) {
  // A corrupt PDF can survive text extraction (it reads as "no text layer") and
  // only blow up when the vision path tries to render it — that's the visitor's
  // file, not us, and it must never surface as a message-less 500.
  if (e?.name === 'InvalidPDFException') {
    return bad('unreadable',
      'This file appears to be damaged or isn\'t really a PDF. Try re-exporting it and uploading again.', 422);
  }
  console.error('intake/parse: failed for', name, e);
  return bad('parse_failed',
    'Something went wrong reading this file on our side. Please try again in a minute.', 502);
}

// ─────────────────────────────────────────────────────────────────────────────
// The work, in pieces
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Read the text layer, then work out which sheets are worth opening.
 *
 * On a one-sheet upload the sheet pick is free and answers "page 1". On a
 * 400-page set it is the difference between reading the site plan and reading
 * the title page. The model is only paid for when there is actually a set.
 */
async function readAndPick({ source, name, ext, opened, client, slice = null }) {
  let extracted;
  try {
    extracted = await extractDrawingText(
      source, name,
      {
        ...(opened?.ranged ? { timeBudgetMs: BIG_SET_SCAN_MS, shouldStop: opened.overBudget } : {}),
        // A staged read overrides the budget above: it is bounded by the front
        // door, not by the Lambda — and what the slice already spent OPENING
        // the file comes out of the same budget, because the front door's
        // clock started at the request, not at the first page. It also carries
        // the pages earlier slices already read, and the page to pick up from.
        ...(slice ? {
          timeBudgetMs: sliceBudgetMs(slice.openMs),
          fromPage:     slice.fromPage,
          priorPages:   slice.priorPages ?? undefined,
        } : {}),
      },
    );
  } catch (e) {
    // A damaged or mislabeled file makes the extractor throw, and an unhandled
    // throw becomes a bare 500 with no message — the UI can only show its
    // generic fallback. Say something a public visitor can act on.
    console.error('intake/parse: extractor threw for', name, e);
    return {
      error: bad('unreadable',
        'This file appears to be damaged or isn\'t really a PDF or Excel file. Try re-exporting it and uploading again.', 422),
    };
  }

  // Not finished reading. There is nothing to judge yet and nothing to pick
  // from, so this goes straight back to the caller, which parks it and asks
  // for another slice.
  if (extracted.partial) return { partial: true, extracted };

  // Images and unsupported types are user-fixable, not server errors. A missing
  // text layer is NOT one of those — it is the scanned-set case, which vision
  // handles, so it travels on rather than ending here.
  if (!extracted.ok && !(extracted.code === 'no_text_layer' && ext === 'pdf')) {
    return { error: bad(extracted.code, extracted.message, 422) };
  }

  const pageScan = extracted.pages ?? [];
  const isSet = pageScan.length > SET_PAGE_THRESHOLD;

  // On a staged read of a real set, the sheet pick is a model call and this
  // slice has already spent its budget reading. Hand the finished pages back
  // to be parked; the pick runs as its OWN short request (stageScanPick),
  // which never has to open the file. Only a set pays the model, so only a
  // set is worth another round trip.
  if (slice && isSet) return { deferPick: true, extracted, isSet };

  const sheets = pageScan.length
    ? await pickKeySheets(buildSheetIndex(pageScan), isSet ? client('intake.sheetPick') : null)
    : null;

  // Four sheets: the site plan and area summary carry the written site data,
  // and — since Mike's 2026-08-31 takeoff ask — a floor plan for counting
  // egress stairwells and exit doors, and an elevation for counting stories.
  // Each rendered page is paid for by the pixel, and the site stage reads one
  // sheet per request, so four sheets is four short requests, not one long one.
  const chosenPages = sheets ? pagesToRender(sheets.picks, { max: 4 }) : [];

  return { extracted, isSet, chosenPages, sheetsRead: chosenPages.length ? chosenPages : null };
}

/**
 * Draw the chosen sheets and keep them.
 *
 * Mike, 2026-08-21: "keep the small, compressed version for sure. So they can
 * reference." The uploaded set is discarded as soon as the read is done — far
 * too big to keep — so without this a reviewer has the numbers we pulled and no
 * way to see where they came from.
 *
 * Rendered ONCE and used twice: the JPEG is the reviewer's copy, and the PNG is
 * what the vision read is actually shown, so the reviewer sees exactly the
 * image the model saw.
 */
async function renderAndKeep({ source, chosenPages, opened, keepPng = false }) {
  // Raced against `opened.failed` because rendering is the last place that
  // pulls bytes. If storage stops answering mid-render, pdfjs waits for bytes
  // that are not coming rather than raising anything — so without the race this
  // sits until the 300-second ceiling and the visitor watches a spinner.
  const render = renderPdfPages(source, {
    pageNumbers: chosenPages, pages: chosenPages.length, alsoJpeg: true,
  });
  const rendered = opened?.failed ? await Promise.race([render, opened.failed]) : await render;

  // The PNG is only stored for the staged read, where the site step is a
  // separate request and would otherwise have to redraw the sheet -- 7.5s of
  // rendering on top of a 25s read, which is what put the whole thing over the
  // ceiling in the first place. The one-request path still has the rendered
  // image in hand, so storing a second copy there is pure waste.
  const stored = await Promise.all(rendered.map(async (img) => {
    const [jpeg, png] = await Promise.all([
      putSheetImage(img.jpeg, 'image/jpeg'),
      keepPng ? putSheetImage(img.png, 'image/png') : null,
    ]);
    return jpeg ? { page: img.page, key: jpeg, bytes: img.jpeg.length, pngKey: png } : null;
  }));

  const kept = stored.filter(Boolean);
  return { rendered, keptSheets: kept.length ? kept : null };
}

// ─────────────────────────────────────────────────────────────────────────────
// The stages
// ─────────────────────────────────────────────────────────────────────────────

/** Stage 1 — read the text layer, pick the sheets, park the result. */
async function stageScan({ source, opened, name, ext, s3Key, buffer, state = null, scanKey = null, openMs = 0 }) {
  const client = anthropicClient();
  if (!client) return unavailable();

  const picked = await readAndPick({
    source, name, ext, opened, client,
    // Always a slice here. A staged read is bounded by the front door, and the
    // set may well be too big to read inside one request.
    slice: { fromPage: state?.nextPage ?? 1, priorPages: state?.pages ?? null, openMs },
  });
  if (picked.error) return picked.error;

  // Where the file lives, so the next slice and the later stages can reopen it.
  // On a resume it was written down the first time round; on the first slice a
  // local multipart upload has to be parked before anything can find it again.
  const fileKey = state?.s3Key || s3Key || await putUploadedObjectDev(buffer, ext);

  // Nowhere to leave the file means the later stages have nothing to open. Only
  // reachable from a multipart POST in production -- which Amplify caps at
  // ~4.4 MB anyway, and a file that small finishes in one request comfortably.
  if (!fileKey) {
    return NextResponse.json({ stage: 'scan', staging: false, fileName: name });
  }

  // Resuming writes over the object the browser already has a key for. Minting
  // a second key would leave it holding a stale one.
  const park = async (next) => (scanKey ? putScanStateAt(scanKey, next) : putScanState(next));

  // -- Still reading --
  // Park the pages banked so far and the page to pick up from, then ask for
  // another short request. Nothing is judged yet: a set is not "without a text
  // layer" until every sheet has actually been looked at.
  if (picked.partial) {
    const key = await park({
      fileName:    name,
      ext,
      s3Key:       fileKey,
      text:        null,
      pages:       picked.extracted.scan.pages,
      hasText:     null,
      totalPages:  picked.extracted.scan.totalPages ?? null,
      nextPage:    picked.extracted.scan.nextPage,
      chosenPages: null,
      sheetsRead:  null,
      keptSheets:  null,
    });
    if (!key) {
      console.error('intake/parse: could not park partial scan for', name);
      return NextResponse.json({ stage: 'scan', staging: false, fileName: name });
    }
    return NextResponse.json({
      stage:      'scan',
      staging:    true,
      more:       true,
      scanKey:    key,
      fileName:   name,
      totalPages: picked.extracted.scan.totalPages ?? null,
      pagesRead:  picked.extracted.scan.pages.length,
    });
  }

  // -- Finished reading, sheet pick still to do --
  // The pick is a model call, and this slice has already spent its budget
  // reading. Park the finished pages and ask to be called once more; that
  // request (stageScanPick) does the pick alone, without even opening the
  // file. Stacking it onto the final reading slice is part of what pushed
  // the Skyline Ridge read past the ~30s front door.
  if (picked.deferPick) {
    const key = await park({
      fileName:    name,
      ext,
      s3Key:       fileKey,
      text:        picked.extracted.text ?? null,
      pages:       picked.extracted.pages ?? null,
      hasText:     picked.extracted.ok === true,
      totalPages:  picked.extracted.scan?.totalPages ?? null,
      nextPage:    null,
      pickPending: true,
      chosenPages: null,
      sheetsRead:  null,
      keptSheets:  null,
    });
    if (!key) {
      console.error('intake/parse: could not park finished scan for', name);
      return NextResponse.json({ stage: 'scan', staging: false, fileName: name });
    }
    return NextResponse.json({
      stage:      'scan',
      staging:    true,
      more:       true,
      scanKey:    key,
      fileName:   name,
      totalPages: picked.extracted.scan?.totalPages ?? null,
      pagesRead:  picked.extracted.pages?.length ?? null,
      picking:    true,
    });
  }

  // -- Finished reading --
  // A scanned set has no text layer, so there is no sheet index to pick from
  // and nothing lands in `chosenPages` -- but that is precisely the case where
  // the vision read is the ONLY way in, so something has to be drawn. Page 1,
  // matching what the single-request path falls back to.
  const chosenPages = picked.chosenPages.length || ext !== 'pdf'
    ? picked.chosenPages
    : [1];

  // A plotted set has no text layer, so nothing landed in `chosenPages` and the
  // fallback above is about to draw the cover -- which has no numbers on it.
  // For a set that big it is worth going and READING the drawing index off the
  // cover as a picture, which is what the two stages below do. Page 1 stays
  // parked as the answer if that read comes back with nothing.
  const needsIndex = ext === 'pdf'
    && !picked.chosenPages.length
    && picked.extracted.ok !== true
    && (picked.extracted.scan?.totalPages ?? 0) > SET_PAGE_THRESHOLD;

  const key = await park({
    fileName:    name,
    ext,
    s3Key:       fileKey,
    text:        picked.extracted.text ?? null,
    pages:       picked.extracted.pages ?? null,
    hasText:     picked.extracted.ok === true,
    totalPages:  picked.extracted.scan?.totalPages ?? null,
    nextPage:    null,
    chosenPages,
    sheetsRead:  picked.sheetsRead,
    keptSheets:  null,
  });

  if (!key) {
    // Nowhere to park it means the staged read cannot continue. Rather than
    // fail, tell the browser to fall back to the one-shot path -- which is the
    // right answer for the small files that can still fit through it.
    console.error('intake/parse: could not park scan state for', name);
    return NextResponse.json({ stage: 'scan', staging: false, fileName: name });
  }

  return NextResponse.json({
    stage:      'scan',
    staging:    true,
    scanKey:    key,
    fileName:   name,
    totalPages: picked.extracted.scan?.totalPages ?? null,
    sheetsRead: picked.sheetsRead,
    isSet:      picked.isSet,
    hasText:    picked.extracted.ok === true,
    // Only a PDF with sheets to draw needs the render stage; a spreadsheet
    // goes straight to the matrix read.
    needsRender: ext === 'pdf' && chosenPages.length > 0,
    needsIndex,
  });
}

/**
 * Stage 1a½ — the sheet pick, as its own short request.
 *
 * Runs when a staged scan finished its reading and parked with `pickPending`.
 * Everything it needs — the text of every page — is in the parked state, so
 * this request never opens the file: it is one model call and one park,
 * comfortably inside the front door on its own. The response is exactly the
 * one the finishing scan slice used to send, so the browser's loop does not
 * know or care that the pick moved.
 */
async function stageScanPick(scanKey, state) {
  const client = anthropicClient();
  if (!client) return unavailable();

  const pageScan = state.pages ?? [];
  const sheets = pageScan.length
    ? await pickKeySheets(buildSheetIndex(pageScan), client('intake.sheetPick'))
    : null;
  const picks = sheets ? pagesToRender(sheets.picks, { max: 4 }) : [];
  const sheetsRead = picks.length ? picks : null;
  // Same fallback as the finished-reading branch of stageScan: a PDF with
  // nothing picked still opens its front sheet.
  const chosenPages = picks.length || state.ext !== 'pdf' ? picks : [1];

  const key = await putScanStateAt(scanKey, {
    ...state,
    pickPending: false,
    chosenPages,
    sheetsRead,
  });
  if (!key) {
    console.error('intake/parse: could not park sheet pick for', state.fileName);
    return NextResponse.json({ stage: 'scan', staging: false, fileName: state.fileName });
  }

  return NextResponse.json({
    stage:      'scan',
    staging:    true,
    scanKey,
    fileName:   state.fileName,
    totalPages: state.totalPages ?? null,
    sheetsRead,
    isSet:      true,
    hasText:    state.hasText === true,
    needsRender: state.ext === 'pdf' && chosenPages.length > 0,
    // The pick is only ever deferred when the text layer answered, and the
    // picture-read of the index exists for sets where it did not.
    needsIndex: false,
  });
}

/**
 * Stage 1b — find the drawing index on the cover and cut close-ups of it.
 *
 * Only runs for a set with no text layer at all.
 *
 * ONE CANDIDATE SHEET PER REQUEST. Looking at both front sheets in one call and
 * then cutting the close-ups measured 23.7 seconds against a front door that
 * hangs up at 30 -- and it got slower, not faster, when the drawing jobs all
 * moved to the strongest model. Asking about one sheet at a time also usually
 * costs LESS in total, because the index is normally on the first sheet asked
 * about and the rest are never drawn at all.
 *
 * So this returns `more: true` until it finds an index or runs out of front
 * sheets to look at. The request that finds one goes on to read the anchor and
 * cut the close-ups, and that request is the long one -- about eight seconds.
 */
async function stageIndex(scanKey, state) {
  const nothing = (reason) => NextResponse.json({ stage: 'index', found: false, reason });
  if (state.ext !== 'pdf' || !state.s3Key) return nothing('not_a_set');

  const client = anthropicClient();
  if (!client) return nothing('no_client');

  // Which front sheet this request is about. Parked rather than passed, so a
  // replayed or reordered call cannot make us skip one.
  const at = state.indexLookedAt ?? 0;
  if (at >= INDEX_CANDIDATE_PAGES.length) return nothing('no_index_found');
  const candidate = INDEX_CANDIDATE_PAGES[at];

  const opened = await openSource({ s3Key: state.s3Key, ext: 'pdf' });
  if (opened.error) return opened.error;

  try {
    const fronts = await renderPdfPages(opened.source, {
      pageNumbers: [candidate],
      pages: 1,
    });
    if (!fronts.length) return nothing('nothing_to_draw');

    const found = await locateIndexBlock(fronts.map(f => f.png), client('intake.indexLocate'));

    // Nothing on THIS sheet. If there is another front sheet to try, say so and
    // come back for it; if there is not, the read carries on against page 1,
    // which is exactly what it did before any of this existed.
    if (!found.box || found.imageIndex == null) {
      const next = at + 1;
      if (next < INDEX_CANDIDATE_PAGES.length) {
        await putScanStateAt(scanKey, { ...state, indexLookedAt: next });
        return NextResponse.json({ stage: 'index', found: false, more: true, lookedAt: next });
      }
      await putScanStateAt(scanKey, { ...state, indexLookedAt: next, visionIndex: null });
      return nothing('no_index_found');
    }

    const sheet = fronts[found.imageIndex];
    // columns matters as much as the box: a close-up that spans two printed
    // columns of the index comes back with the rows braided together, and the
    // position of a row is what tells us which page to open.
    const rects = indexTiles(padBox(found.box), {
      pageW: sheet.ptWidth,
      pageH: sheet.ptHeight,
      columns: found.columns ?? 1,
    });
    if (!rects.length) return nothing('no_tiles');

    // The anchor. Locate has already guessed at it from a whole shrunk sheet,
    // and on a real set that guess was wrong about one time in three — so the
    // corner gets cut out and read properly, and the guess is only the
    // fallback. Everything the index says hangs on this one number.
    let selfSheetNumber = found.selfSheetNumber ?? null;
    const corner = await renderPdfCrops(opened.source, { page: sheet.page, rects: [TITLE_BLOCK_BOX] });
    if (corner[0]?.png) {
      selfSheetNumber = await probeSheetNumber(corner[0].png, client('intake.sheetProbe'))
        ?? selfSheetNumber;
    }

    const crops = await renderPdfCrops(opened.source, { page: sheet.page, rects });
    // Parked all at once, not one after another. Fourteen close-ups stored in
    // turn is fourteen round trips to S3 inside a single request, and this
    // request is already the longest of the read -- measured at 24 seconds on
    // Mike's Lowell set against a front door that hangs up at 30.
    const stored = await Promise.all(crops.map(c => putSheetImage(c.png, 'image/png')));
    const tileKeys = [];
    const tileCols = [];
    for (let i = 0; i < stored.length; i++) {
      if (!stored[i]) continue;
      tileKeys.push(stored[i]);
      tileCols.push(crops[i].rect?.col ?? 0);
    }
    if (!tileKeys.length) return nothing('no_storage');

    await putScanStateAt(scanKey, {
      ...state,
      indexLookedAt: at + 1,
      visionIndex: {
        selfPage: sheet.page,
        selfSheetNumber,
        tileKeys,
        tileCols,
        tilesDone: 0,
        entries: [],
        picks: null,
      },
    });
    return NextResponse.json({ stage: 'index', found: true, tiles: tileKeys.length });
  } catch (e) {
    // Reading the index is an improvement on drawing the cover, never a
    // requirement. A failure here leaves page 1 parked and the read carries on.
    console.error('intake/parse: index locate failed for', state.fileName, e?.message ?? e);
    return nothing('failed');
  } finally {
    await closeQuietly(opened.handle);
  }
}

/**
 * Stage 1c — read the index close-ups and work out which pages to draw.
 *
 * ONE close-up per request, the same way the scan reads a few sheets at a time.
 * Reading a whole 127-row index in one go was measured at 32 seconds, and the
 * front door hangs up around 30 — and the cost is the transcript, not the
 * pictures, so a 158-sheet index would have failed with an empty 504 no matter
 * how the images were packed. Split by tile, each request writes about forty
 * rows and lands near ten seconds, whatever the size of the set.
 *
 * The rows are stitched back together in code rather than by the model, and the
 * seam is checked: the tiles overlap, so the tail of what we have should be the
 * head of what just arrived. Getting that wrong lists a row twice and shifts
 * every sheet after it onto the wrong page.
 *
 * Once the last tile is in: the index lists the sheet it is printed on, and we
 * know which page that is because we just drew it. That gives the offset
 * between a row's position in the list and its page in the file, for free. A
 * pick that lands outside the file is DROPPED, never clamped — a clamped pick
 * quietly becomes some other drawing and its numbers get reported as answer.
 */
async function stageSheets(scanKey, state) {
  const vi = state.visionIndex;
  const nothing = (reason) => NextResponse.json({
    stage: 'sheets', sheetsRead: state.sheetsRead ?? null, mapped: false, reason,
  });
  if (!vi?.tileKeys?.length) return nothing('no_tiles');

  const client = anthropicClient();
  if (!client) return nothing('no_client');

  // A hunt already under way continues; the tiles below are all read by now.
  if (vi.hunt) return await stageHunt(scanKey, state, client, nothing);

  const done = vi.tilesDone ?? 0;
  const png = await getSheetImage(vi.tileKeys[done]);
  if (!png) return nothing('tiles_gone');

  try {
    const read = await readIndexTile(png, client('intake.sheetIndexVision'));
    // A tile we cannot read is a hole in the MIDDLE of the list, and a hole
    // shifts every sheet after it onto the wrong page. Better to give up on
    // the index and open the front of the set than to answer confidently off
    // the wrong drawing.
    if (!read.ok) return nothing(read.code);

    const entries = mergeIndexEntries(vi.entries ?? [], read.data.entries);
    const picks = mergePicks(vi.picks, read.data.picks);
    // An empty close-up partway down a column means the list ran out there, so
    // the rest of that column is blank paper and reading it costs a request
    // each for nothing. See nextTileAfterBlank.
    const tilesDone = read.data.entries.length
      ? done + 1
      : nextTileAfterBlank(vi.tileCols, done);

    if (tilesDone < vi.tileKeys.length) {
      await putScanStateAt(scanKey, {
        ...state,
        visionIndex: { ...vi, entries, picks, tilesDone },
      });
      return NextResponse.json({
        stage: 'sheets', more: true,
        tilesDone, tiles: vi.tileKeys.length, rows: entries.length,
      });
    }

    // The cover usually lists itself, and that gives the offset for free --
    // and when it does, counting down the list is one cheap step. When it does
    // not, counting is abandoned for hunting: read sheet numbers out of
    // corners and home in. Counting also quietly assumes the index is HONEST,
    // which Lowell's is not -- 80 rows over 158 bound sheets -- and hunting is
    // the only one of the two that survives that.
    const offset = offsetFromSelf({
      entries, selfSheetNumber: vi.selfSheetNumber, selfPage: vi.selfPage,
    });
    if (offset == null) {
      await putScanStateAt(scanKey, {
        ...state,
        visionIndex: { ...vi, entries, picks, tilesDone, offset: null, hunt: { probes: {} } },
      });
      return NextResponse.json({
        stage: 'sheets', more: true, hunting: true, rows: entries.length,
      });
    }
    const { targets } = mapPicksToPages({
      entries, picks, offset, totalPages: state.totalPages ?? 0,
    });
    if (!targets.length) {
      await putScanStateAt(scanKey, {
        ...state,
        visionIndex: { ...vi, entries, picks, tilesDone, offset: offset ?? null, targets: [] },
      });
      return nothing(offset == null ? 'no_anchor' : 'no_targets');
    }

    const chosenPages = targets.map(t => t.page);
    await putScanStateAt(scanKey, {
      ...state,
      chosenPages,
      sheetsRead: chosenPages,
      visionIndex: { ...vi, entries, picks, tilesDone, offset, targets },
    });
    return NextResponse.json({
      stage: 'sheets',
      mapped: true,
      rows: entries.length,
      sheetsRead: chosenPages,
      picked: targets.map(({ role, sheetNumber, page }) => ({ role, sheetNumber, page })),
    });
  } catch (e) {
    console.error('intake/parse: index read failed for', state.fileName, e?.message ?? e);
    return nothing('failed');
  }
}

/**
 * Which pages to look at when the index sheet does not list itself.
 *
 * The two sheets straight after it, because those are the ones the list is
 * most likely to name: a set opens with its cover and then its first listed
 * drawing. Two, not one, so a divider or a bound-in addendum on the first of
 * them does not cost the whole read.
 */
/** Corners looked at per request; several requests may be spent hunting. */
const HUNT_PROBES_PER_REQUEST = 5;
/** Corners looked at per hunt, total. Three sheets should fall well inside it. */
const MAX_HUNT_PROBES = 16;

/**
 * Find the picked sheets by looking, not counting.
 *
 * planHunt (sheetIndexVision.js) says which corner to look at next; this reads
 * it and hands the answer back, a few corners per request so no single request
 * outstays the front door. When the plan settles, the targets are parked
 * exactly as the counting path would have parked them, and the read continues
 * none the wiser about which of the two found its sheets.
 */
async function stageHunt(scanKey, state, client, nothing) {
  const vi = state.visionIndex;
  const probes = { ...(vi.hunt?.probes ?? {}) };
  const spent = () => Object.keys(probes).length;

  let plan = planHunt({
    entries: vi.entries, picks: vi.picks, probes, totalPages: state.totalPages ?? 0,
  });

  if (plan.probePage != null && spent() < MAX_HUNT_PROBES) {
    const opened = await openSource({ s3Key: state.s3Key, ext: state.ext || 'pdf' });
    if (opened.error) return nothing('open_failed');
    try {
      for (let i = 0; i < HUNT_PROBES_PER_REQUEST
        && plan.probePage != null && spent() < MAX_HUNT_PROBES; i++) {
        const corner = await renderPdfCrops(opened.source, {
          page: plan.probePage, rects: [TITLE_BLOCK_BOX],
        });
        probes[plan.probePage] = corner[0]?.png
          ? await probeSheetNumber(corner[0].png, client('intake.sheetProbe'))
          : null;
        plan = planHunt({
          entries: vi.entries, picks: vi.picks, probes, totalPages: state.totalPages ?? 0,
        });
      }
    } catch (e) {
      console.error('intake/parse: hunt failed for', state.fileName, e?.message ?? e);
      return nothing('failed');
    } finally {
      await closeQuietly(opened.handle);
    }
  }

  if (plan.probePage != null && spent() < MAX_HUNT_PROBES) {
    await putScanStateAt(scanKey, {
      ...state, visionIndex: { ...vi, hunt: { probes } },
    });
    return NextResponse.json({
      stage: 'sheets', more: true, hunting: true, probed: spent(),
    });
  }

  const targets = plan.targets;
  if (!targets.length) {
    await putScanStateAt(scanKey, {
      ...state, visionIndex: { ...vi, hunt: { probes }, targets: [] },
    });
    return nothing('hunt_lost');
  }

  const chosenPages = targets.map(t => t.page);
  console.warn('intake/parse: hunted', targets.map(t => `${t.sheetNumber}->p${t.page}`).join(' '),
    'in', spent(), 'looks');
  await putScanStateAt(scanKey, {
    ...state,
    chosenPages,
    sheetsRead: chosenPages,
    visionIndex: { ...vi, hunt: { probes }, offset: null, targets },
  });
  return NextResponse.json({
    stage: 'sheets',
    mapped: true,
    rows: vi.entries?.length ?? 0,
    sheetsRead: chosenPages,
    picked: targets.map(({ role, sheetNumber, page }) => ({ role, sheetNumber, page })),
  });
}

/**
 * Check a picture-read set landed on the sheet the index named, and re-aim if
 * it did not.
 *
 * Returns null when there is nothing to correct — which covers every set that
 * has a text layer, an unreadable title block, and a landing that was right.
 * Only a title block that plainly disagrees produces a new set of pages, and
 * only once: the corrected offset comes from a sheet number we have actually
 * seen, so there is nothing further to learn by going round again.
 */
async function recheckLanding(state, landedPage, fallbackPng, source) {
  const vi = state.visionIndex;
  if (!vi?.entries?.length || !vi.targets?.length || !landedPage) return null;

  const client = anthropicClient();
  if (!client) return null;

  const expected = vi.targets[0].sheetNumber;
  // The corner, not the sheet: a title block read off a whole shrunk sheet is
  // wrong often enough that checking the landing that way would sometimes
  // re-aim a read that had landed correctly.
  const corner = await renderPdfCrops(source, { page: landedPage, rects: [TITLE_BLOCK_BOX] });
  const shot = corner[0]?.png ?? fallbackPng;
  if (!shot) return null;
  const seen = await probeSheetNumber(shot, client('intake.sheetProbe'));
  if (landedRight(expected, seen)) return null;

  const offset = reanchor({ entries: vi.entries, seenSheetNumber: seen, seenPage: landedPage });
  if (offset == null || offset === vi.offset) return null;

  const { targets } = mapPicksToPages({
    entries: vi.entries, picks: vi.picks, offset, totalPages: state.totalPages ?? 0,
  });
  const chosenPages = targets.map(t => t.page);
  if (!chosenPages.length || chosenPages.join() === state.chosenPages.join()) return null;

  console.warn('intake/parse: index off by', offset - vi.offset, 'sheets; re-aiming to', chosenPages);
  return { chosenPages, targets, offset };
}

/** Stage 2 — draw the chosen sheets and keep them, a slice at a time.
 *
 * Sliced for the same reason the scan is: on the Skyline Ridge set the old
 * one-request version (open the 334 MB file + draw four full-size 42x30
 * plots + the landing recheck, all before answering) measured ~28.1s on
 * production three times in a row — a deterministic front-door 504 that no
 * retry could save. Each request now opens the file, draws sheets until the
 * slice budget is spent (always at least one), parks progress, and answers
 * `more: true`; the browser simply asks again. A small set still finishes in
 * one request, so the common case costs no extra round trips.
 */
async function stageRender(scanKey, state) {
  if (!state.chosenPages?.length || state.ext !== 'pdf') {
    return NextResponse.json({ stage: 'render', keptSheets: null, sheetsRead: state.sheetsRead ?? null });
  }

  const openStarted = Date.now();
  const opened = await openSource({ s3Key: state.s3Key, ext: 'pdf' });
  if (opened.error) return opened.error;
  const openMs = Date.now() - openStarted;
  // ONE wall for the whole request, and every piece of work below is capped by
  // what REMAINS of it — never by a fixed per-piece constant. Round 3 learned
  // this the hard way on Skyline Ridge: the loop asked "is there budget left?"
  // (~12s) before starting a sheet, then gave that sheet its own ~23s ceiling,
  // so two quick sheets followed by one slow one answered at ~30s — past the
  // front door, deterministically, three times. A cap that ignores the clock
  // already spent is no cap at all.
  const wallMs = Math.max(8_000, 24_000 - openMs);
  // Below this remainder, don't START anything new — park and answer. Starting
  // work that can't finish inside the wall is how Round 3 died.
  const FLOOR_MS = 6_000;
  const RECHECK_CAP_MS = 10_000;
  const drawStarted = Date.now();
  const remaining = () => wallMs - (Date.now() - drawStarted);
  const raceMs = (p, ms) => Promise.race([
    p, new Promise((res) => setTimeout(() => res('timeout'), ms).unref?.()),
  ]);

  // The wall and the races above only work when the event loop turns. One
  // Skyline Ridge sheet proved it can NOT turn: pdfjs drew that sheet in one
  // synchronous 12-20-second bite, no timer fired, the front door hung up,
  // the Lambda died with nothing parked, and every retry replayed the same
  // death. So each render below writes its page number to a tiny marker
  // BEFORE starting. Finding that marker here, naming the very page we are
  // about to draw, means the last attempt at it ate a whole request alive —
  // and the only winning move is not to draw it again.
  const prior = await getScanAttempt(scanKey);

  try {
    let chosenPages = state.chosenPages;
    let kept = state.renderKept ?? [];
    let next = state.renderNext ?? 0;
    // A set read from its text layer has no picture-read index to second-guess,
    // so the landing check is already "done" before it starts.
    const checkable = !!(state.visionIndex?.entries?.length && state.visionIndex?.targets?.length);
    let recheckDone = state.renderRecheckDone ?? !checkable;
    let reAimed = state.renderReAimed ?? false;
    let fix = null;
    let firstOfSlice = true;
    let landed = null; // { page, png } of a sheet drawn THIS slice, for the recheck

    while (next < chosenPages.length) {
      // One sheet per request is as thin as this stage can slice, so the FIRST
      // sheet of a slice always runs (with the whole wall as its ceiling) —
      // otherwise a monster sheet could stall the read forever. Later sheets
      // only start if the remainder gives them a fair chance.
      if (!firstOfSlice && remaining() < FLOOR_MS) break;
      const capMs = firstOfSlice ? Math.max(8_000, remaining()) : remaining();
      const fullCap = firstOfSlice;

      // The page that killed the last request gets skipped, not retried — a
      // lost drawn copy degrades the site read; replaying the death kills the
      // whole read. Skipping costs nothing off the wall, so it does not
      // consume this slice's first-sheet privilege.
      if (prior?.stage === 'render' && prior.page === chosenPages[next]) {
        console.warn('intake/parse: page', chosenPages[next], 'of', state.fileName,
          'ate a whole request last attempt — skipping it');
        next += 1;
        continue;
      }
      await putScanAttempt(scanKey, { stage: 'render', page: chosenPages[next] });

      const one = await raceMs(renderAndKeep({
        source: opened.source, chosenPages: [chosenPages[next]], opened: opened.handle, keepPng: true,
      }), capMs);
      if (one === 'timeout') {
        // The abandoned render is still chewing this Lambda's one CPU, so
        // nothing more useful can happen in THIS request — park and answer.
        // A sheet that blew a FULL ceiling is skipped for good (losing one
        // drawn copy degrades the site read; sitting on it kills the whole
        // read). A sheet that merely hit the wall's remainder gets retried
        // next slice, where it is first and the ceiling is honest.
        if (fullCap) {
          console.warn('intake/parse: sheet render timed out, skipping page', chosenPages[next], 'of', state.fileName);
          next += 1;
        }
        break;
      }
      firstOfSlice = false;
      kept = kept.concat(one.keptSheets ?? []);
      landed = { page: one.rendered?.[0]?.page ?? chosenPages[next], png: one.rendered?.[0]?.png ?? null };
      next += 1;

      // Did we land where the index said? Only asked of a set whose pages were
      // worked out by reading the index as a picture, and only worth asking
      // because progress sets are routinely bound a few sheets short of their
      // own index, which slides every page number after it. One cheap look at
      // a drawn title block catches that; without it a wrong sheet is
      // indistinguishable from a right one, and its numbers get reported as
      // the answer. The look costs a crop render plus an AI probe, so it obeys
      // the wall like everything else: raced against the remainder, deferred
      // to a later slice when there is no room, and if it blows its own
      // ceiling the landing is simply accepted — a rare mis-aim is better
      // than a killed read.
      if (!recheckDone && remaining() >= FLOOR_MS) {
        recheckDone = true;
        // The recheck crop-renders a sheet corner, so it carries the same
        // synchronous-bite risk as a full sheet — same marker, same rule: a
        // recheck that ate a whole request is not retried, the landing is
        // simply accepted.
        if (prior?.stage === 'recheck') {
          console.warn('intake/parse: landing recheck ate a whole request — accepting landing for', state.fileName);
          fix = null;
        } else {
          await putScanAttempt(scanKey, { stage: 'recheck', page: landed.page });
          fix = await raceMs(
            recheckLanding(state, landed.page, landed.png, opened.source),
            Math.min(RECHECK_CAP_MS, remaining()),
          );
        }
        if (fix === 'timeout') {
          console.warn('intake/parse: landing recheck timed out, accepting landing for', state.fileName);
          fix = null;
        }
        if (fix) {
          for (const sheet of kept) {
            if (sheet.pngKey) await deleteSheetImage(sheet.pngKey);
            if (sheet.key) await deleteSheetImage(sheet.key);
          }
          chosenPages = fix.chosenPages;
          kept = [];
          next = 0;
          reAimed = true;
        }
      }
    }

    // All sheets drawn but the landing never had room to be checked: a slice
    // that arrives with nothing left to draw does the recheck as ITS one unit
    // of work. The crop is re-rendered from the source, so no drawn copy is
    // needed in hand — any chosen page anchors it.
    if (!recheckDone && next >= chosenPages.length && (firstOfSlice || remaining() >= FLOOR_MS)) {
      recheckDone = true;
      if (prior?.stage === 'recheck') {
        console.warn('intake/parse: landing recheck ate a whole request — accepting landing for', state.fileName);
        fix = null;
      } else {
        await putScanAttempt(scanKey, { stage: 'recheck', page: landed?.page ?? chosenPages[0] });
        fix = await raceMs(
          recheckLanding(state, landed?.page ?? chosenPages[0], landed?.png ?? null, opened.source),
          Math.min(RECHECK_CAP_MS, Math.max(5_000, remaining())),
        );
      }
      if (fix === 'timeout') {
        console.warn('intake/parse: landing recheck timed out, accepting landing for', state.fileName);
        fix = null;
      }
      if (fix) {
        for (const sheet of kept) {
          if (sheet.pngKey) await deleteSheetImage(sheet.pngKey);
          if (sheet.key) await deleteSheetImage(sheet.key);
        }
        chosenPages = fix.chosenPages;
        kept = [];
        next = 0;
        reAimed = true;
      }
    }

    const more = next < chosenPages.length || !recheckDone;
    const keptSheets = kept.length ? kept : null;
    const sheetsRead = reAimed ? chosenPages : state.sheetsRead;

    // Park the keys so the site stage can pick the images up without
    // redrawing — and, mid-set, so the next slice knows where to resume.
    await putScanStateAt(scanKey, {
      ...state,
      chosenPages,
      renderKept: kept,
      renderNext: next,
      renderRecheckDone: recheckDone,
      renderReAimed: reAimed,
      ...(more ? {} : { keptSheets }),
      sheetsRead,
      ...(fix ? { visionIndex: { ...state.visionIndex, offset: fix.offset, targets: fix.targets } } : {}),
    });
    return NextResponse.json({
      stage: 'render',
      ...(more ? { more: true } : {}),
      sheetsRead: sheetsRead ?? null,
      // `pngKey` is our scaffolding, not the visitor's business.
      keptSheets: keptSheets?.map(({ page, key, bytes }) => ({ page, key, bytes })) ?? null,
    });
  } catch (e) {
    // A kept copy is a convenience. Losing it must never cost a GC his upload,
    // so this reports success with nothing kept and the read carries on.
    console.error('intake/parse: could not keep sheet images for', state.fileName, e?.message ?? e);
    return NextResponse.json({ stage: 'render', keptSheets: null, sheetsRead: state.sheetsRead ?? null });
  } finally {
    await closeQuietly(opened.handle);
  }
}

/** Stage 3 — read the unit matrix off the text layer. */
async function stageMatrix(state) {
  if (!state.hasText) {
    // A scanned set has no text to read. Not an error — the site stage is what
    // handles this, and the browser is told to go there next.
    return NextResponse.json({ stage: 'matrix', matrix: null, needsSite: true });
  }

  const client = anthropicClient();
  if (!client) return unavailable();

  // `pages` lets the area-sheet finder score sheet-by-sheet instead of guessing
  // from one flattened blob — that's what tells net from gross.
  const result = await parseUnitMatrix(
    state.text, state.fileName, client('intake.unitMatrix.parse'), { pages: state.pages },
  );

  // A failed text read is NOT the end of the read. Seen locally 2026-08-25 on a
  // code-review sheet: the model ran long and its answer was cut off mid-JSON,
  // so the whole upload came back "Could not read the extraction result" -- even
  // though the site-plan read on that same sheet goes on to find 250 units and
  // 12 buildings. It is also intermittent, so the same file can fail and then
  // succeed, which is the worst kind of thing to hand a GC.
  //
  // So a failed matrix read is treated like an empty one: fall through to the
  // site read. The error travels with it, and only becomes the answer if the
  // site read cannot produce numbers either -- because "we could not read this"
  // and "this drawing has no numbers on it" are different things to be told.
  if (!result.ok) {
    return NextResponse.json({
      stage: 'matrix', matrix: null, needsSite: true, matrixError: result.message,
    });
  }

  return NextResponse.json({
    stage:     'matrix',
    matrix:    result.proposal,
    needsSite: needsSiteRead({ hasText: true, matrix: result.proposal }),
  });
}

/**
 * Stage 4 — read the drawings we picked. Only asked for when the matrix came up
 * short.
 *
 * ONE SHEET PER REQUEST. Handing the model both sheets together measured 29.4
 * seconds against a front door that hangs up at 30 -- close enough that a
 * denser set, or a slow afternoon, is an empty 504 and a GC who uploaded a file
 * for nothing. A single sheet lands around fifteen.
 *
 * The pieces are folded together by mergeSiteData as they arrive: first answer
 * wins per field, a null never overwrites a number, and the confidence is the
 * lowest of the sheets that contributed anything.
 *
 * The cross-checks run ONCE, on the finished merge, and that is not just tidier
 * -- it is what lets a bed mix read off one drawing be checked against a unit
 * total read off another. Running them per sheet would only ever check a sheet
 * against itself.
 */
async function stageSite(scanKey, state) {
  const client = anthropicClient();
  if (!client) return unavailable();

  const images = await loadKeptImages(state);
  if (!images.length) {
    return bad('no_pages', 'We could not open the sheets from this file. Please try uploading it again.', 502);
  }

  const done = state.siteRead?.done ?? 0;
  const image = images[done];
  if (!image) return bad('no_pages', 'We could not open the sheets from this file. Please try uploading it again.', 502);

  // Recorded at the injection point rather than inside extractSiteData: the
  // helper is handed a client precisely so it does not have to know where the
  // call came from, and the task name is a property of the caller.
  const vision = await extractSiteData([image], client('intake.siteVision'));

  // One unreadable sheet is not a failed read -- the others may hold everything
  // we came for. It only fails if NO sheet gave us anything.
  const merged = vision.ok
    ? mergeSiteData(state.siteRead?.data ?? null, vision.data, image.page)
    : (state.siteRead?.data ?? null);

  const next = done + 1;
  if (next < images.length) {
    await putScanStateAt(scanKey, { ...state, siteRead: { done: next, data: merged } });
    return NextResponse.json({ stage: 'site', more: true, sheetsDone: next, sheets: images.length });
  }

  if (!merged) return bad(vision.code ?? 'extraction_failed', vision.message ?? 'Could not read the drawing.', 502);
  return NextResponse.json({ stage: 'site', siteData: validateSiteData(merged) });
}

/** Stage 5 — throw away everything the read was standing on. */
async function stageDone(scanKey, state) {
  if (state.s3Key) await deleteUploadedObject(state.s3Key);
  // The PNGs were scaffolding for the vision read. The JPEGs are the reviewer's
  // copy and are deliberately left behind.
  for (const s of state.keptSheets ?? []) {
    if (s.pngKey) await deleteSheetImage(s.pngKey);
  }
  // The index close-ups were scaffolding too, and nobody ever looks at them.
  for (const key of state.visionIndex?.tileKeys ?? []) await deleteSheetImage(key);
  await deleteScanAttempt(scanKey);
  await deleteScanState(scanKey);
  return NextResponse.json({ stage: 'done', ok: true });
}

/** Fetch back the sheets the render stage drew, so vision need not redraw them. */
async function loadKeptImages(state) {
  const out = [];
  for (const s of state.keptSheets ?? []) {
    if (!s.pngKey) continue;
    const png = await getSheetImage(s.pngKey);
    if (png) out.push({ page: s.page, png });
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// The whole thing in one request — local dev, multipart, and small files
// ─────────────────────────────────────────────────────────────────────────────

/**
 * What this route always did, unchanged in behaviour.
 *
 * Kept because it is genuinely the right shape where there is no 30-second
 * ceiling in front of it, and because it is the fallback when a scan cannot be
 * parked. It shares every piece of work with the staged path and applies the
 * same precedence rule, so the two cannot drift.
 */
async function runWhole({ source, opened, name, ext }) {
  const client = anthropicClient();
  if (!client) return unavailable();

  const picked = await readAndPick({ source, name, ext, opened, client });
  if (picked.error) return picked.error;

  let keptSheets = null;
  let rendered = null;
  if (ext === 'pdf' && picked.chosenPages.length) {
    try {
      ({ rendered, keptSheets } = await renderAndKeep({
        source, chosenPages: picked.chosenPages, opened,
      }));
    } catch (e) {
      console.error('intake/parse: could not keep sheet images for', name, e?.message ?? e);
    }
  }

  const hasText = picked.extracted.ok === true;

  // Kept in step with the staged path on purpose -- see stageMatrix for why a
  // failed text read falls through to the site read instead of ending here.
  let matrix = null;
  let matrixError = null;
  if (hasText) {
    const result = await parseUnitMatrix(
      picked.extracted.text, name, client('intake.unitMatrix.parse'), { pages: picked.extracted.pages },
    );
    if (result.ok) matrix = result.proposal;
    else matrixError = result.message;
  }

  let siteData = null;
  if (needsSiteRead({ hasText, matrix })) {
    try {
      const images = rendered?.length
        ? rendered
        : await renderPdfPages(source, picked.chosenPages.length
            ? { pageNumbers: picked.chosenPages, pages: picked.chosenPages.length }
            : { pages: 1 });
      const vision = await extractSiteData(images, client('intake.siteVision'));
      if (vision.ok) siteData = vision.data;
      else if (!hasText || matrixError) return bad(vision.code, vision.message, 502);
    } catch (e) {
      // With a matrix in hand the answer below is still valid; a failed second
      // look should not turn it into an error. With no text layer -- or with a
      // text read that FAILED rather than came up empty -- there is no answer
      // without vision, so those are the 502 above.
      if (!hasText || matrixError) throw e;
      console.error('intake/parse: vision fallback failed for', name, e?.message ?? e);
    }
  }

  // Both reads are out: say what actually went wrong rather than reporting
  // "no numbers found", which would blame the drawing for our failure.
  if (matrixError && !siteHasNumbers(siteData)) return bad('bad_output', matrixError, 502);

  return NextResponse.json(combineIntakeResult({
    fileName:   name,
    totalPages: picked.extracted.scan?.totalPages ?? null,
    sheetsRead: picked.sheetsRead,
    keptSheets: keptSheets?.map(({ page, key, bytes }) => ({ page, key, bytes })) ?? null,
    matrix,
    siteData,
  }));
}
