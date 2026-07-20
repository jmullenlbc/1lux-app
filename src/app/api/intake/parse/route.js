import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getAnthropicKey } from '@/lib/anthropicKey';
import { extractDrawingText, parseUnitMatrix, fileExt, ACCEPTED_EXTS, IMAGE_EXTS } from '@/lib/drawingExtract';
import { renderPdfPages, extractSiteData } from '@/lib/siteVision';
import { rateLimit, clientIp } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

/**
 * PUBLIC, UNAUTHENTICATED drawing parse for the conceptual-budget intake.
 *
 * ── Design decision: this route is STATELESS ──
 * It accepts a file, returns structured data, and writes NOTHING. No
 * ProjectFile row, no disk write, no S3 object, no Project. Two reasons:
 *
 *   1. It sidesteps the schema that doesn't exist yet (ConceptualSubmission is
 *      still with Sean), so the UI can be finished and tested now.
 *   2. It is the right shape regardless. A public form should not create
 *      durable records from anonymous input. Nothing persists until a human at
 *      ILC accepts the submission — which is exactly the review-queue model
 *      Mike asked for. An abandoned form leaves no trace to clean up.
 *
 * The client holds parsed results in memory and sends them along at submit.
 *
 * ── Abuse surface ──
 * Every call costs an Anthropic request. Throttled per IP, size-capped, and
 * extension-checked before any model call. See the limitation note in
 * `rateLimit.js` — the counter is per warm Lambda instance, not global.
 */

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB — large enough for a real drawing set
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

  const name = file.name || 'upload';
  const ext  = fileExt(name);

  // Reject on extension BEFORE reading the body into memory or calling the model.
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
  if (typeof file.size === 'number' && file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: 'too_large', message: 'That file is larger than 25 MB. Please upload a smaller file.' },
      { status: 413 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.length > MAX_BYTES) {
    return NextResponse.json({ error: 'too_large', message: 'That file is larger than 25 MB.' }, { status: 413 });
  }

  const extracted = await extractDrawingText(buffer, name);

  const apiKey = getAnthropicKey()?.trim();
  if (!apiKey) {
    // Bare 503 rather than a detailed message — this is a config fault on our
    // side and a public caller should not learn about our key setup.
    console.error('intake/parse: ANTHROPIC_API_KEY not configured');
    return NextResponse.json({ error: 'unavailable', message: 'Parsing is temporarily unavailable.' }, { status: 503 });
  }

  // ── Vision fallback ──
  // A quarter of real conceptual drawings have no text layer, and they skew
  // toward the site plans we most need. Vision is gated to this path rather
  // than run always: it is materially more expensive per call, and when a text
  // layer exists it is both cheaper and more accurate.
  if (!extracted.ok) {
    if (extracted.code === 'no_text_layer' && ext === 'pdf') {
      const images = await renderPdfPages(buffer, { pages: 1 });
      const vision = await extractSiteData(images, new Anthropic({ apiKey }));
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

  const result = await parseUnitMatrix(extracted.text, name, new Anthropic({ apiKey }));
  if (!result.ok) {
    return NextResponse.json({ error: result.code, message: result.message }, { status: 502 });
  }

  return NextResponse.json({ ...result.proposal, fileName: name });
}
