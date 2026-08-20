import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getAnthropicKey } from '@/lib/anthropicKey';
import { extractDrawingText, parseUnitMatrix, fileExt, ACCEPTED_EXTS, IMAGE_EXTS } from '@/lib/drawingExtract';
import { renderPdfPages, extractSiteData } from '@/lib/siteVision';
import { getUploadedObject, deleteUploadedObject, MAX_DIRECT_UPLOAD_BYTES } from '@/lib/uploadStorage';
import { rateLimit, clientIp } from '@/lib/rateLimit';
import { wrapClient } from '@/lib/agent/client';

export const dynamic = 'force-dynamic';

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
 *    PUT the file to S3 via a presigned slip (/api/uploads/presign); we fetch
 *    the bytes back, parse them, and DELETE the object — stateless stays
 *    stateless. Files to 50 MB.
 *
 * ── Abuse surface ──
 * Every call costs an Anthropic request. Throttled per IP, size-capped, and
 * extension-checked before any model call. See the limitation note in
 * `rateLimit.js` — the counter is per warm Lambda instance, not global.
 */

const MAX_BYTES = MAX_DIRECT_UPLOAD_BYTES; // 50 MB, shared with the presign desk
const LIMIT = { limit: 12, windowMs: 60_000 };

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
    if (typeof file.size === 'number' && file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: 'too_large', message: 'That file is larger than 50 MB. Please upload a smaller file.' },
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

  if (s3Key) {
    const fetched = await getUploadedObject(s3Key); // re-checks the object's ACTUAL size
    if (!fetched.ok) {
      const status = fetched.code === 'too_large' ? 413 : fetched.code === 'not_found' ? 404 : 400;
      return NextResponse.json({ error: fetched.code, message: fetched.message }, { status });
    }
    buffer = fetched.buffer;
  }
  if (buffer.length > MAX_BYTES) {
    return NextResponse.json({ error: 'too_large', message: 'That file is larger than 50 MB.' }, { status: 413 });
  }

  try {
    // A damaged or mislabeled file makes the extractor throw, and an unhandled
    // throw becomes a bare 500 with no message — the UI can only show its
    // generic fallback. Catch it and say something a public visitor can act on.
    let extracted;
    try {
      extracted = await extractDrawingText(buffer, name);
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

    // Vision read of page 1 — used for scanned PDFs (no text layer) and as a
    // second look when the text parse finds no unit matrix (a vector SITE PLAN
    // has plenty of text but no unit types; its site-data block is exactly what
    // vision extracts). Gated rather than run always: vision is materially more
    // expensive per call, and when a text matrix exists it is both cheaper and
    // more accurate.
    const visionSiteRead = async () => {
      const images = await renderPdfPages(buffer, { pages: 1 });
      // Recorded at the injection point rather than inside extractSiteData:
      // the helper is handed a client precisely so it does not have to know
      // where the call came from, and the task name is a property of the caller.
      return extractSiteData(images, wrapClient(new Anthropic({ apiKey }), 'intake.siteVision'));
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
        wrapClient(new Anthropic({ apiKey }), 'intake.unitMatrix.parse'),
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
            });
          }
        } catch (e) {
          // The unit-matrix answer below is still a valid response; a failed
          // second look shouldn't turn it into an error.
          console.error('intake/parse: vision fallback failed for', name, e?.message ?? e);
        }
      }

      return NextResponse.json({ ...result.proposal, fileName: name });
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
    // Stateless means stateless: the S3 object was a hand-off, not storage.
    // Best-effort — the 1-day lifecycle rule on uploads/ catches any miss.
    if (s3Key) await deleteUploadedObject(s3Key);
  }
}
