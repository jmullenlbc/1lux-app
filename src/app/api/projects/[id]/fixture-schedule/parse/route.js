import '@/lib/pdfPolyfill';
import { loadPdfjs } from '@/lib/pdfjsNode';
import { NextResponse } from 'next/server';
import { requireAuth, canSeeAllData } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { createRequire } from 'module';
import { getAnthropicKey } from '@/lib/anthropicKey';
import { wrapClient } from '@/lib/agent/client';
import { modelParams, textFrom, answerBudget, warnIfTruncated } from '@/lib/aiModels';
import { buildUntrustedPrompt } from '@/lib/agent/untrusted';
import { readUploadedFile } from '@/lib/uploadIntake';
import { runParkedJob, readJobRequest, jobError, uploadToJobArgs, loadJobUpload } from '@/lib/parkedJob';

// Park-and-poll (src/lib/parkedJob.js). Three pages of a fixture schedule
// through one model call is usually quick, but a dense sheet runs past
// Amplify's ~30-second front door. The first request only writes the job
// down; the polls run it and collect it.
export const maxDuration = 300;

// Resolve pdfjs's bundled standard fonts (same setup as scheduleExtract.js / ocr.js).
// Without this, getTextContent can throw in Amplify's serverless runtime, which is
// why prod parsing fails while local works. See scheduleExtract.js for the full note.
let FONTS_URL = null;
try {
  const req = createRequire(import.meta.url);
  FONTS_URL = `file://${path.dirname(req.resolve('pdfjs-dist/package.json'))}/standard_fonts/`.replace(/\\/g, '/');
} catch {}

const AI_PARSE_PROMPT = `You are extracting a lighting fixture schedule from an architectural drawing.
The schedule is a table listing fixture types with their specifications.

Respond ONLY with a valid JSON array. No prose, no markdown, no code fences.
Each element in the array is one fixture type row.

Required fields (use null if not found):
- type_code: string, the fixture type identifier. This is ALWAYS the short code in the
  FIRST (leftmost) column of the schedule, typically 1 to 6 characters (e.g. "D1", "GBM",
  "C2", "SA-6", "P3 (ALT)", "WM"). Never use a longer label or description from a secondary
  column as the type_code, even if it looks like a code (e.g. "WM_WALL PACK" is NOT a
  type_code, the real type_code would be the short identifier to its left, like "WM" or "GBM").
- location: string, the space or area tag
- description: string, fixture description
- manufacturer: string, manufacturer name. Use "TBD" if the schedule shows TBD. Null if not present.
- catalog_number: string, full catalog number as it appears, including any
  multi-part strings joined with ' + '. Do NOT split multi-part numbers.
  Preserve the original delimiter exactly. Use "TBD" if TBD. Null if not present.

Optional fields (use null if not found):
- finish: string
- cct: string
- lumens: string
- wattage: string
- voltage: string
- dimming: string
- mounting: string
- notes: string

Confidence field (always required):
- confidence: number between 0.0 and 1.0, your confidence that this row
  was correctly extracted and mapped. Use 0.5 or below if:
  - the type code is ambiguous or unclear
  - manufacturer and catalog number appear to be in the same cell and you had to split them
  - any required field is uncertain
  - the row structure does not clearly match the standard fixture schedule format

Special handling rules:
- If manufacturer and catalog number are in the same cell, do your best to
  split them and set confidence to 0.5 or below.
- Alternate fixtures (e.g. "P3 (ALT)", "D1-ALT") are separate rows.
  Set type_code exactly as it appears. Do not merge alternates with their primary fixture.
- OR-EQUAL / MULTI-MANUFACTURER rows: When a single fixture type lists multiple manufacturers
  as acceptable alternates (separated by semicolons, slashes, "or", line breaks, or similar
  delimiters), split them into SEPARATE rows, one row per manufacturer.
  The first manufacturer listed is the basis of design (isAlternate omitted or false).
  Each subsequent manufacturer becomes its own row with the SAME type_code and confidence 0.6.
  Example: "W1" with "AXIS LIGHTING: ARLED SERIES; PRUDENTIAL: P23 SERIES; FOCAL POINT" becomes:
    Row 1: type_code "W1",  manufacturer "AXIS LIGHTING",  catalog_number "ARLED SERIES", confidence 0.9
    Row 2: type_code "W1",  manufacturer "PRUDENTIAL",     catalog_number "P23 SERIES",   confidence 0.6
    Row 3: type_code "W1",  manufacturer "FOCAL POINT",    catalog_number null,           confidence 0.6
  Set confidence to 0.6 or below on the split rows since catalog numbers may be incomplete.
- If a row is clearly a note, header, or non-fixture content, skip it.
- Preserve multi-part catalog numbers exactly as written with ' + ' delimiter.
  Example: "NHIOICD-48-LE4 + NIO-4RD30X-HW + NIO-REFLTIR25" stays as-is.
- Never fabricate values. A null with low confidence is always correct over a guess.

Return ONLY the JSON array. Example of expected output format:
[
  {
    "type_code": "D1",
    "location": "CORRIDOR",
    "description": "7 INCH ADJUSTABLE LED RECESSED DOWNLIGHT",
    "manufacturer": "NORA",
    "catalog_number": "NHIOICD-48-LE4 + NIO-4RD30X-HW + NIO-REFLTIR25",
    "finish": null,
    "cct": "3000",
    "lumens": "1000",
    "wattage": "15",
    "voltage": "120",
    "dimming": "MLV",
    "mounting": "RECESSED",
    "notes": null,
    "confidence": 0.95
  }
]`;

async function extractPdfText(buffer) {
  const pdfjsLib = await loadPdfjs();
  const doc      = await pdfjsLib.getDocument({
    data: new Uint8Array(buffer),
    ...(FONTS_URL ? { standardFontDataUrl: FONTS_URL } : {}),
    disableFontFace: true,
    isEvalSupported: false,
    useSystemFonts: false,
    verbosity: 0,
  }).promise;
  const numPages = doc.numPages;
  let text = '';
  let pageError = null;
  const maxPages = Math.min(numPages, 3); // spec: max 3 pages
  for (let i = 1; i <= maxPages; i++) {
    try {
      const page    = await doc.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map(item => item.str).join(' ') + '\n';
    } catch (pe) {
      pageError = `page ${i}: ${pe?.message ?? pe}`;
    }
  }
  try { await doc.destroy(); } catch {}
  const trimmed = text.trim();
  // Surface a precise diagnostic when nothing came out (we can't read prod logs).
  if (!trimmed && pageError) throw new Error(pageError);
  return { text: trimmed, numPages };
}

async function getOrCreateDraft(projectId) {
  let draft = await prisma.fixtureSchedule.findFirst({
    where: { projectId, state: 'DRAFT' },
  });
  if (!draft) {
    draft = await prisma.fixtureSchedule.create({
      data: { projectId, state: 'DRAFT', version: 0 },
    });
  }
  return draft;
}

// POST /api/projects/[id]/fixture-schedule/parse
// multipart/form-data: file (PDF, 1 to 3 pages)
export async function POST(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const project = await prisma.project.findUnique({ where: { id: params.id } });
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!canSeeAllData(user) && project.createdById !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { body, formData } = await readJobRequest(request);
  let args = null;
  if (!body.jobKey) {
    if (!formData) return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    const upload = await readUploadedFile(formData);
    if (!upload.ok) return NextResponse.json({ error: upload.message }, { status: upload.status });
    // Not cleaned up here: the poll that runs the read needs the bytes.
    args = await uploadToJobArgs(upload, { scope: 'project' });
  }

  return runParkedJob({
    body, kind: 'fixtureSchedule.parse', scope: params.id, args,
    run: (a) => parseSchedule(a, { projectId: params.id, user }),
  });
}

/**
 * The read itself. Soft failures stay 200 bodies with an `error` string and
 * zero counts, the editor branches on `data.error && data.importedCount === 0`.
 * Anything unexpected becomes the same "Server error" body the route always
 * sent, just as a parked 500 now.
 */
async function parseSchedule(args, { projectId, user }) {
  let cleanup = null;
  try {
    const upload = await loadJobUpload(args);
    cleanup = upload.cleanup;
    const buffer = upload.buffer;
    // Keeps the rest of the read reading the same as before the direct-to-S3 split.
    const file = { name: upload.name, type: upload.type };

  // Extract text (max 3 pages per spec)
  let extractedText = '';
  let numPages = 0;
  try {
    const result = await extractPdfText(buffer);
    extractedText = result.text;
    numPages      = result.numPages;
  } catch (e) {
    throw jobError(422, { error: 'Failed to read PDF: ' + e.message });
  }

  if (numPages > 3) {
    throw jobError(400, {
      error: 'Please upload only the fixture schedule pages, max 3 pages. Extract those pages from the full drawing set first.',
    });
  }

  // Store the source PDF (non-critical, parse continues even if storage fails)
  let storedPath = null;
  try {
    const uploadDir = path.join(process.cwd(), 'uploads', projectId, 'fixture-schedule-parse');
    await mkdir(uploadDir, { recursive: true });
    const stored = `${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`;
    storedPath   = path.join(projectId, 'fixture-schedule-parse', stored);
    await writeFile(path.join(uploadDir, stored), buffer);
  } catch (e) {
    console.warn('PDF storage skipped:', e.message);
  }

  // Call Claude
  let rows = [];
  try {
    const apiKey = (await getAnthropicKey());
    if (!apiKey) {
      throw new Error('Anthropic API key not configured on the server. Set ANTHROPIC_API_KEY in the Amplify environment variables.');
    }
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    // Recorded: see src/lib/agent/ledger.js.
    const anthropic  = wrapClient(
      new Anthropic({ apiKey }),
      'fixtureSchedule.parse',
      { projectId, userId: user.id },
    );
    // A contractor's fixture schedule is third-party text, so the instructions
    // and the document go in separate, labelled halves rather than either side
    // of a `---`. The file name is inside the fence too, it arrives from the
    // same upload. See src/lib/agent/untrusted.js.
    const sealed = buildUntrustedPrompt({
      instructions: AI_PARSE_PROMPT,
      documents:    [{ text: extractedText, descriptor: file.name, maxChars: 40000 }],
    });
    if (sealed.injection.found) {
      console.warn('[fixtureSchedule.parse] uploaded document contains instruction-like text',
        { projectId, input: sealed.seals[0].summary, markers: sealed.injection.markers.length });
    }

    const msg = await anthropic.messages.create({
      ...modelParams('fixtureSchedule.parse'),
      max_tokens: answerBudget('fixtureSchedule.parse', 8192),
      system:     sealed.system,
      messages:   [{ role: 'user', content: sealed.content }],
    });

    warnIfTruncated(msg, 'fixtureSchedule.parse');
    const raw   = textFrom(msg) || '';
    let   clean = raw.trim();

    // Strip markdown fences if present
    clean = clean.replace(/^```[\w]*\n?/, '').replace(/\n?```$/, '').trim();

    // Extract array portion
    const firstBracket = clean.indexOf('[');
    if (firstBracket !== -1) {
      clean = clean.slice(firstBracket);
    }

    // Attempt full parse first
    try {
      rows = JSON.parse(clean);
    } catch {
      // Truncated response, recover all complete objects before the cutoff
      const lastClose = clean.lastIndexOf('},');
      const lastCloseAlt = clean.lastIndexOf('}]');
      const cutAt = Math.max(lastClose, lastCloseAlt);
      if (cutAt > 0) {
        const partial = clean.slice(0, lastClose !== -1 ? lastClose + 1 : cutAt + 1) + ']';
        try {
          rows = JSON.parse(partial);
          console.warn(`PDF parse: response was truncated, recovered ${rows.length} rows`);
        } catch {
          throw new Error('AI response was truncated and could not be recovered. Try a PDF with fewer fixture types or split across multiple uploads.');
        }
      } else {
        throw new Error('AI response was not valid JSON.');
      }
    }

    if (!Array.isArray(rows)) rows = [];

    // ── Post-processing: fix malformed type codes ─────────────────────────────
    // Edge case: AI grabs a label like "WM_WALL PACK" instead of the short code
    // "WM" or "GBM" when the catalog number also contains the type code string.
    // Rule: a valid type code is 1 to 8 alphanumeric chars with at most one hyphen.
    // If type_code contains spaces or underscores, it grabbed the wrong column.
    const VALID_TYPE_CODE = /^[A-Z0-9]{1,8}(-[A-Z0-9]+)?(\s*\(ALT\))?$/i;
    rows = rows.map(r => {
      if (!r.type_code) return r;
      const tc = r.type_code.trim();
      if (/[\s_]/.test(tc) && !VALID_TYPE_CODE.test(tc)) {
        // Split on space or underscore, take the first token if it looks like a valid code
        const firstToken = tc.split(/[\s_]+/)[0];
        if (firstToken && VALID_TYPE_CODE.test(firstToken)) {
          console.warn(`PDF parse: corrected type_code "${tc}" → "${firstToken}"`);
          return {
            ...r,
            type_code:  firstToken,
            confidence: Math.min(typeof r.confidence === 'number' ? r.confidence : 1, 0.5),
          };
        }
      }
      return r;
    });
    // ─────────────────────────────────────────────────────────────────────────

  } catch (e) {
    console.error('AI parse error:', e.message, e.status ?? '');
    return {
      error: `AI parse failed: ${e.message}`,
      importedCount: 0,
      flaggedCount:  0,
    };
  }

  if (rows.length === 0) {
    return {
      error:         'No fixture schedule found in this PDF. Check that you uploaded the correct pages.',
      importedCount: 0,
      flaggedCount:  0,
    };
  }

  // Get or create draft
  const draft = await getOrCreateDraft(projectId);

  // Clear existing DRAFT items (replacing with fresh parse)
  await prisma.fixtureScheduleItem.deleteMany({ where: { scheduleId: draft.id } });

  // Write parsed rows
  let flaggedCount = 0;
  const items = [];
  for (let i = 0; i < rows.length; i++) {
    const r          = rows[i];
    const confidence = typeof r.confidence === 'number' ? r.confidence : null;
    const aiFlagged  = confidence !== null ? confidence < 0.7 : false;
    const isAlt      = !!(r.type_code && /alt/i.test(r.type_code));
    if (aiFlagged) flaggedCount++;

    // Detect alternateOf, if "P3 (ALT)", alternateOf = "P3"
    let alternateOf = null;
    if (isAlt && r.type_code) {
      alternateOf = r.type_code.replace(/[\s\-_(]+alt[)]*$/i, '').trim() || null;
    }

    const item = await prisma.fixtureScheduleItem.create({
      data: {
        scheduleId:    draft.id,
        type:          r.type_code   || '',
        location:      r.location    || '',
        description:   r.description || '',
        manufacturer:  r.manufacturer  || null,
        catalogNumber: r.catalog_number || null,
        finish:        r.finish  || null,
        cct:           r.cct     || null,
        lumens:        r.lumens  || null,
        wattage:       r.wattage || null,
        voltage:       r.voltage || null,
        dimming:       r.dimming || null,
        mounting:      r.mounting || null,
        notes:         r.notes   || null,
        isAlternate:   isAlt,
        alternateOf,
        aiConfidence:  confidence,
        aiFlagged,
        sortOrder:     i,
      },
    });
    items.push(item);
  }

  return {
    importedCount: items.length,
    flaggedCount,
    scheduleId:    draft.id,
  };

  } catch (e) {
    if (e?.isJobError) throw e;
    // Safety net, always a JSON body so the client never gets an empty 500
    console.error('fixture-schedule/parse unhandled error:', e.message);
    throw jobError(500, {
      error: `Server error: ${e.message}`,
      importedCount: 0,
      flaggedCount: 0,
    });
  } finally {
    // The stashed upload is only needed for this one read.
    if (cleanup) await cleanup().catch(() => {});
  }
}
