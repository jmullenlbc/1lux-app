import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getAnthropicKey } from '@/lib/anthropicKey';
import { extractDrawingText, parseUnitMatrix, fileExt, ACCEPTED_EXTS, IMAGE_EXTS } from '@/lib/drawingExtract';
import { renderPdfPages, extractSiteData } from '@/lib/siteVision';
import { buildSheetIndex, pickKeySheets, pagesToRender, SET_PAGE_THRESHOLD } from '@/lib/sheetIndex';
import { openUploadedPdf } from '@/lib/pdfRange';
import {
  getUploadedObject, deleteUploadedObject, putUploadedObjectDev,
  putSheetImage, getSheetImage, deleteSheetImage,
  putScanState, putScanStateAt, getScanState, deleteScanState,
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
  { error: 'rate_limited', message: 'Too many uploads. Please wait a moment and try again.' },
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
 * 12s rather than something closer to the wall because the LAST slice also pays
 * for opening the file, the sheet-pick model call, and parking the result on
 * top of its reading time.
 */
const SCAN_SLICE_MS = 12_000;

/** A backstop on slices, so a set that never finishes cannot loop forever. */
const MAX_SCAN_SLICES = 30;

/**
 * Stages that resume from a parked scan rather than from a file.
 * Kept as a list because "did the caller send a file or a scan key" is the
 * first branch in the route and it should read as one word.
 */
const RESUME_STAGES = ['render', 'matrix', 'site', 'done'];
const ALL_STAGES = ['scan', ...RESUME_STAGES];

const mb = (n) => Math.round(n / (1024 * 1024));

const bad = (code, message, status = 400) =>
  NextResponse.json({ error: code, message }, { status });

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

    const ext = parked.state.ext || 'pdf';
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
      });
    } catch (e) {
      return unexpected(e, parked.state?.fileName || 'upload');
    } finally {
      // The uploaded file stays put -- later slices and the render stage still
      // have to read from it. Only `done` clears it.
      if (opened.handle?.destroy) await opened.handle.destroy();
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
      if (stage === 'render') return await stageRender(scanKey, parked.state);
      if (stage === 'matrix') return await stageMatrix(parked.state);
      if (stage === 'site')   return await stageSite(parked.state);
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

  const opened = await openSource({ s3Key, buffer, ext });
  if (opened.error) return opened.error;

  try {
    return stage === 'scan'
      ? await stageScan({ source: opened.source, opened: opened.handle, name, ext, s3Key, buffer })
      : await runWhole({ source: opened.source, opened: opened.handle, name, ext });
  } catch (e) {
    return unexpected(e, name);
  } finally {
    // The scan stage hands the open document off to later stages by parking a
    // key, not by holding it — so the handle is always closed here. What is NOT
    // always deleted is the uploaded object: `scan` leaves it in place because
    // `render` still has to draw from it, and `done` clears it.
    if (opened.handle?.destroy) await opened.handle.destroy();
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
        // door, not by the Lambda. It also carries the pages earlier slices
        // already read, and the page to pick up from.
        ...(slice ? {
          timeBudgetMs: SCAN_SLICE_MS,
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
  const sheets = pageScan.length
    ? await pickKeySheets(buildSheetIndex(pageScan), isSet ? client('intake.sheetPick') : null)
    : null;

  // Two sheets, not three: the site plan and the area summary are where the
  // written site data lives, and each rendered page is paid for by the pixel.
  const chosenPages = sheets ? pagesToRender(sheets.picks, { max: 2 }) : [];

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
async function stageScan({ source, opened, name, ext, s3Key, buffer, state = null, scanKey = null }) {
  const client = anthropicClient();
  if (!client) return unavailable();

  const picked = await readAndPick({
    source, name, ext, opened, client,
    // Always a slice here. A staged read is bounded by the front door, and the
    // set may well be too big to read inside one request.
    slice: { fromPage: state?.nextPage ?? 1, priorPages: state?.pages ?? null },
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

  // -- Finished reading --
  // A scanned set has no text layer, so there is no sheet index to pick from
  // and nothing lands in `chosenPages` -- but that is precisely the case where
  // the vision read is the ONLY way in, so something has to be drawn. Page 1,
  // matching what the single-request path falls back to.
  const chosenPages = picked.chosenPages.length || ext !== 'pdf'
    ? picked.chosenPages
    : [1];

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
  });
}

/** Stage 2 — draw the chosen sheets and keep them. */
async function stageRender(scanKey, state) {
  if (!state.chosenPages?.length || state.ext !== 'pdf') {
    return NextResponse.json({ stage: 'render', keptSheets: null, sheetsRead: state.sheetsRead ?? null });
  }

  const opened = await openSource({ s3Key: state.s3Key, ext: 'pdf' });
  if (opened.error) return opened.error;

  try {
    const { keptSheets } = await renderAndKeep({
      source: opened.source, chosenPages: state.chosenPages, opened: opened.handle,
      keepPng: true,
    });
    // Park the keys so the site stage can pick the images up without redrawing.
    await putScanStateAt(scanKey, { ...state, keptSheets });
    return NextResponse.json({
      stage: 'render',
      sheetsRead: state.sheetsRead ?? null,
      // `pngKey` is our scaffolding, not the visitor's business.
      keptSheets: keptSheets?.map(({ page, key, bytes }) => ({ page, key, bytes })) ?? null,
    });
  } catch (e) {
    // A kept copy is a convenience. Losing it must never cost a GC his upload,
    // so this reports success with nothing kept and the read carries on.
    console.error('intake/parse: could not keep sheet images for', state.fileName, e?.message ?? e);
    return NextResponse.json({ stage: 'render', keptSheets: null, sheetsRead: state.sheetsRead ?? null });
  } finally {
    if (opened.handle?.destroy) await opened.handle.destroy();
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

/** Stage 4 — read the site plan. Only asked for when the matrix came up short. */
async function stageSite(state) {
  const client = anthropicClient();
  if (!client) return unavailable();

  const images = await loadKeptImages(state);
  if (!images.length) {
    return bad('no_pages', 'We could not open the sheets from this file. Please try uploading it again.', 502);
  }

  // Recorded at the injection point rather than inside extractSiteData: the
  // helper is handed a client precisely so it does not have to know where the
  // call came from, and the task name is a property of the caller.
  const vision = await extractSiteData(images, client('intake.siteVision'));
  if (!vision.ok) return bad(vision.code, vision.message, 502);

  return NextResponse.json({ stage: 'site', siteData: vision.data });
}

/** Stage 5 — throw away everything the read was standing on. */
async function stageDone(scanKey, state) {
  if (state.s3Key) await deleteUploadedObject(state.s3Key);
  // The PNGs were scaffolding for the vision read. The JPEGs are the reviewer's
  // copy and are deliberately left behind.
  for (const s of state.keptSheets ?? []) {
    if (s.pngKey) await deleteSheetImage(s.pngKey);
  }
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
