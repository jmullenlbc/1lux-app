import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getAnthropicKey } from '@/lib/anthropicKey';
import { extractDrawingText, parseUnitMatrix, fileExt, ACCEPTED_EXTS, IMAGE_EXTS } from '@/lib/drawingExtract';
import { renderPdfPages, extractSiteData } from '@/lib/siteVision';
import { buildSheetIndex, pickKeySheets, pagesToRender, SET_PAGE_THRESHOLD } from '@/lib/sheetIndex';
import { openUploadedPdf } from '@/lib/pdfRange';
import { getUploadedObject, deleteUploadedObject, putSheetImage, MAX_INTAKE_UPLOAD_BYTES } from '@/lib/uploadStorage';
import { rateLimit, clientIp } from '@/lib/rateLimit';
import { wrapClient } from '@/lib/agent/client';

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
 * It accepts a file, returns structured data, and keeps NOTHING. No
 * ProjectFile row, no disk write, no Project. Two reasons:
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
 * ── Abuse surface ──
 * Every call costs an Anthropic request. Throttled per IP, size-capped, and
 * extension-checked before any model call. See the limitation note in
 * `rateLimit.js` — the counter is per warm Lambda instance, not global.
 */

const MAX_BYTES = MAX_INTAKE_UPLOAD_BYTES;          // 400 MB, shared with the presign desk
const MAX_SHEET_BYTES = 50 * 1024 * 1024;           // spreadsheets are read whole
const LIMIT = { limit: 12, windowMs: 60_000 };

/** Scanning budget for a big set. Well under maxDuration, above a normal scan. */
const BIG_SET_SCAN_MS = 90_000;

const mb = (n) => Math.round(n / (1024 * 1024));

export async function POST(request) {
  const ip = clientIp(request);
  const { allowed, retryAfterSec } = rateLimit(`intake-parse:${ip}`, LIMIT);
  if (!allowed) {
    return NextResponse.json(
      { error: 'rate_limited', message: 'Too many uploads. Please wait a moment and try again.' },
      { status: 429, headers: { 'Retry-After': String(retryAfterSec) } },
    );
  }

  // ── Get the bytes, from whichever door they came in ──
  let buffer = null;
  let name = 'upload';
  let s3Key = null;

  const contentType = request.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'bad_request', message: 'Could not read the upload.' }, { status: 400 });
    }
    s3Key = body?.s3Key;
    name = String(body?.fileName || 'upload');
    if (!s3Key) {
      return NextResponse.json({ error: 'bad_request', message: 'No file received.' }, { status: 400 });
    }
  } else {
    let file;
    try {
      const form = await request.formData();
      file = form.get('file');
    } catch {
      return NextResponse.json({ error: 'bad_request', message: 'Could not read the upload.' }, { status: 400 });
    }
    if (!file || typeof file.arrayBuffer !== 'function') {
      return NextResponse.json({ error: 'bad_request', message: 'No file received.' }, { status: 400 });
    }
    name = file.name || 'upload';
    // The multipart door is local dev and small files only — Amplify caps this
    // path at ~4.4 MB regardless — so the modest ceiling is the right one here.
    if (typeof file.size === 'number' && file.size > MAX_SHEET_BYTES) {
      return NextResponse.json(
        { error: 'too_large', message: `That file is larger than ${mb(MAX_SHEET_BYTES)} MB.` },
        { status: 413 },
      );
    }
    buffer = Buffer.from(await file.arrayBuffer());
  }

  const ext = fileExt(name);

  // Reject on extension BEFORE fetching from S3 / calling the model.
  if (IMAGE_EXTS.includes(ext)) {
    return NextResponse.json(
      { error: 'image_not_supported', message: 'Image files can\'t be read yet. Please upload the original PDF or an Excel file.' },
      { status: 422 },
    );
  }
  if (!ACCEPTED_EXTS.includes(ext)) {
    return NextResponse.json(
      { error: 'unsupported_type', message: 'Unsupported file type. Please upload a PDF or Excel file.' },
      { status: 422 },
    );
  }

  // `source` is what the extractor and the renderer both read from: raw bytes
  // for a spreadsheet or a small file, an open pdfjs document for a big set.
  // Neither of them cares which, and that is the point — see pdfRange.js.
  let source = buffer;
  let opened = null;

  try {
    if (s3Key) {
      if (ext === 'pdf') {
        opened = await openUploadedPdf(s3Key, { limit: MAX_BYTES });
        if (!opened.ok) {
          const status = opened.code === 'too_large' ? 413 : opened.code === 'not_found' ? 404 : 400;
          return NextResponse.json({ error: opened.code, message: opened.message }, { status });
        }
        source = opened.doc;
      } else {
        const fetched = await getUploadedObject(s3Key, { limit: MAX_SHEET_BYTES });
        if (!fetched.ok) {
          const status = fetched.code === 'too_large' ? 413 : fetched.code === 'not_found' ? 404 : 400;
          return NextResponse.json({ error: fetched.code, message: fetched.message }, { status });
        }
        source = fetched.buffer;
      }
    }

    // A damaged or mislabeled file makes the extractor throw, and an unhandled
    // throw becomes a bare 500 with no message — the UI can only show its
    // generic fallback. Catch it and say something a public visitor can act on.
    let extracted;
    try {
      extracted = await extractDrawingText(
        source, name,
        opened?.ranged ? { timeBudgetMs: BIG_SET_SCAN_MS, shouldStop: opened.overBudget } : {},
      );
    } catch (e) {
      console.error('intake/parse: extractor threw for', name, e);
      return NextResponse.json(
        { error: 'unreadable', message: 'This file appears to be damaged or isn\'t really a PDF or Excel file. Try re-exporting it and uploading again.' },
        { status: 422 },
      );
    }

    const apiKey = getAnthropicKey()?.trim();
    if (!apiKey) {
      // Bare 503 rather than a detailed message — this is a config fault on our
      // side and a public caller should not learn about our key setup.
      console.error('intake/parse: ANTHROPIC_API_KEY not configured');
      return NextResponse.json({ error: 'unavailable', message: 'Parsing is temporarily unavailable.' }, { status: 503 });
    }
    const client = (task) => wrapClient(new Anthropic({ apiKey }), task);

    // ── Which sheets are worth opening? ──
    // On a one-sheet upload this is free and answers "page 1". On a 400-page set
    // it is the difference between reading the site plan and reading the title
    // page. The model is only paid for when there is actually a set to index.
    const pageScan = extracted.pages ?? [];
    const isSet = pageScan.length > SET_PAGE_THRESHOLD;
    let sheets = null;
    if (pageScan.length) {
      sheets = await pickKeySheets(
        buildSheetIndex(pageScan),
        isSet ? client('intake.sheetPick') : null,
      );
    }
    // Two sheets, not three: the site plan and the area summary are where the
    // written site data lives, and each rendered page is paid for by the pixel.
    const chosenPages = sheets ? pagesToRender(sheets.picks, { max: 2 }) : [];
    const sheetsRead = chosenPages.length ? chosenPages : null;

    // ── Keep a small copy of the sheets we read ──
    // Mike, 2026-08-21: "keep the small, compressed version for sure. So they
    // can reference." The original set is deleted the moment this route
    // finishes — it is far too big to keep — so without this, a reviewer
    // looking at a submission has the numbers we pulled and no way to see
    // where they came from.
    //
    // Rendered ONCE, at the resolution the vision read already uses, and shared
    // between the two: the reviewer sees exactly the image the model saw. The
    // whole thing is best-effort — a set with no text layer has no picks yet,
    // and a storage hiccup here must not cost the GC his upload.
    let rendered = null;
    let keptSheets = null;
    if (ext === 'pdf' && chosenPages.length) {
      try {
        const render = renderPdfPages(source, {
          pageNumbers: chosenPages, pages: chosenPages.length, alsoJpeg: true,
        });
        rendered = opened?.failed ? await Promise.race([render, opened.failed]) : await render;
        const stored = await Promise.all(rendered.map(async img => {
          const key = await putSheetImage(img.jpeg, 'image/jpeg');
          return key ? { page: img.page, key, bytes: img.jpeg.length } : null;
        }));
        keptSheets = stored.filter(Boolean);
        if (!keptSheets.length) keptSheets = null;
      } catch (e) {
        console.error('intake/parse: could not keep sheet images for', name, e?.message ?? e);
      }
    }

    // Vision read — used for scanned PDFs (no text layer) and as a second look
    // when the text parse finds no unit matrix (a vector SITE PLAN has plenty of
    // text but no unit types; its site-data block is exactly what vision
    // extracts). Gated rather than run always: vision is materially more
    // expensive per call, and when a text matrix exists it is both cheaper and
    // more accurate.
    const visionSiteRead = async () => {
      // Raced against `opened.failed` because rendering is the last place that
      // pulls bytes. If storage stops answering mid-render, pdfjs waits for
      // bytes that are not coming rather than raising anything — so without the
      // race this sits until the 300-second ceiling and the visitor is left
      // watching a spinner instead of being told to try again.
      // Reuse the render from the keep step when there is one — same pixels,
      // and a second render of a big sheet is not cheap.
      if (rendered) return extractSiteData(rendered, client('intake.siteVision'));
      const render = chosenPages.length
        ? renderPdfPages(source, { pageNumbers: chosenPages, pages: chosenPages.length })
        : renderPdfPages(source, { pages: 1 });
      const images = opened?.failed ? await Promise.race([render, opened.failed]) : await render;
      // Recorded at the injection point rather than inside extractSiteData:
      // the helper is handed a client precisely so it does not have to know
      // where the call came from, and the task name is a property of the caller.
      return extractSiteData(images, client('intake.siteVision'));
    };

    try {
      if (!extracted.ok) {
        if (extracted.code === 'no_text_layer' && ext === 'pdf') {
          const vision = await visionSiteRead();
          if (vision.ok) {
            return NextResponse.json({
              kind: 'site_data',
              fileName: name,
              source: 'vision',
              siteData: vision.data,
              unitTypes: [],   // vision reads summary blocks, not per-type matrices
              sheetsRead,
              keptSheets,
              totalPages: extracted.scan?.totalPages ?? null,
            });
          }
          return NextResponse.json({ error: vision.code, message: vision.message }, { status: 502 });
        }
        // Images and unsupported types are user-fixable, not server errors.
        return NextResponse.json({ error: extracted.code, message: extracted.message }, { status: 422 });
      }

      // `pages` lets the area-sheet finder score sheet-by-sheet instead of
      // guessing from one flattened blob — that's what tells net from gross.
      const result = await parseUnitMatrix(
        extracted.text, name,
        client('intake.unitMatrix.parse'),
        { pages: extracted.pages },
      );
      if (!result.ok) {
        return NextResponse.json({ error: result.code, message: result.message }, { status: 502 });
      }

      // No unit matrix on this sheet? Take the vision look before giving up —
      // this is the vector-site-plan case, and site data is half of what the
      // conceptual questionnaire needs from drawings.
      if (ext === 'pdf' && (result.proposal.unitTypes?.length ?? 0) === 0) {
        try {
          const vision = await visionSiteRead();
          // "Found something" means an actual site number — confidence/notes are
          // always present, so they don't count.
          const SITE_NUMBER_KEYS = ['lotAcres', 'lotSf', 'totalUnits', 'parkingProvided', 'parkingRequired',
            'surfaceParking', 'garages', 'carports', 'buildingCount', 'clubhouseSf', 'amenitySf'];
          if (vision.ok && vision.data && SITE_NUMBER_KEYS.some(k => vision.data[k] != null)) {
            return NextResponse.json({
              kind: 'site_data',
              fileName: name,
              source: 'vision',
              siteData: vision.data,
              unitTypes: [],
              sheetsRead,
              keptSheets,
              totalPages: extracted.scan?.totalPages ?? null,
            });
          }
        } catch (e) {
          // The unit-matrix answer below is still a valid response; a failed
          // second look shouldn't turn it into an error.
          console.error('intake/parse: vision fallback failed for', name, e?.message ?? e);
        }
      }

      return NextResponse.json({
        ...result.proposal,
        fileName: name,
        sheetsRead,
        keptSheets,
        totalPages: extracted.scan?.totalPages ?? null,
      });
    } catch (e) {
      // Same rationale as the extractor guard: never let a throw surface as a
      // message-less 500 on a public page. A corrupt PDF can survive text
      // extraction (it just reads as "no text layer") and only blow up when the
      // vision path tries to render it — that's the visitor's file, not us.
      if (e?.name === 'InvalidPDFException') {
        return NextResponse.json(
          { error: 'unreadable', message: 'This file appears to be damaged or isn\'t really a PDF. Try re-exporting it and uploading again.' },
          { status: 422 },
        );
      }
      console.error('intake/parse: parse failed for', name, e);
      return NextResponse.json(
        { error: 'parse_failed', message: 'Something went wrong reading this file on our side. Please try again in a minute.' },
        { status: 502 },
      );
    }
  } finally {
    // Stateless means stateless: the S3 object was a hand-off, not storage. The
    // 400 MB set is discarded the moment we are done with it — the only thing
    // that survives this request is the handful of numbers we read off it.
    // Best-effort; the 1-day lifecycle rule on uploads/ catches any miss.
    if (opened?.destroy) await opened.destroy();
    if (s3Key) await deleteUploadedObject(s3Key);
  }
}
