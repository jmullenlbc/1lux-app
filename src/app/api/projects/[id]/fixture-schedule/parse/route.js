import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';

export const maxDuration = 120;

const AI_PARSE_PROMPT = `You are extracting a lighting fixture schedule from an architectural drawing.
The schedule is a table listing fixture types with their specifications.

Respond ONLY with a valid JSON array. No prose, no markdown, no code fences.
Each element in the array is one fixture type row.

Required fields (use null if not found):
- type_code: string — the fixture type identifier (e.g. "D1", "C2", "SA-6", "P3 (ALT)")
- location: string — the space or area tag
- description: string — fixture description
- manufacturer: string — manufacturer name. Use "TBD" if the schedule shows TBD. Null if not present.
- catalog_number: string — full catalog number as it appears, including any
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
- confidence: number between 0.0 and 1.0 — your confidence that this row
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
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc      = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
  let text = '';
  const maxPages = Math.min(doc.numPages, 3); // spec: max 3 pages
  for (let i = 1; i <= maxPages; i++) {
    const page    = await doc.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map(item => item.str).join(' ') + '\n';
  }
  return { text: text.trim(), numPages: doc.numPages };
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
// multipart/form-data: file (PDF, 1–3 pages)
export async function POST(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const project = await prisma.project.findUnique({ where: { id: params.id } });
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (user.role !== 'ILC_ADMIN' && project.createdById !== user.id)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const formData = await request.formData();
  const file     = formData.get('file');
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());

  // Extract text (max 3 pages per spec)
  let extractedText = '';
  let numPages = 0;
  try {
    const result = await extractPdfText(buffer);
    extractedText = result.text;
    numPages      = result.numPages;
  } catch (e) {
    return NextResponse.json({ error: 'Failed to read PDF: ' + e.message }, { status: 422 });
  }

  if (numPages > 3) {
    return NextResponse.json({
      error: 'Please upload only the fixture schedule pages — max 3 pages. Extract those pages from the full drawing set first.',
    }, { status: 400 });
  }

  // Store the source PDF
  const uploadDir = path.join(process.cwd(), 'uploads', params.id, 'fixture-schedule-parse');
  await mkdir(uploadDir, { recursive: true });
  const stored     = `${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`;
  const storedPath = path.join(params.id, 'fixture-schedule-parse', stored);
  await writeFile(path.join(uploadDir, stored), buffer);

  // Call Claude
  const Anthropic = (await import('@anthropic-ai/sdk')).default;
  const anthropic  = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  let rows = [];
  try {
    const msg = await anthropic.messages.create({
      model:      'claude-opus-4-5',
      max_tokens: 4096,
      messages:   [{
        role:    'user',
        content: `${AI_PARSE_PROMPT}\n\nFile: ${file.name}\n\n---\n\n${extractedText.slice(0, 40000)}`,
      }],
    });

    const raw   = msg.content?.[0]?.text || '';
    let   clean = raw.trim();

    // Strip markdown fences if present
    clean = clean.replace(/^```[\w]*\n?/, '').replace(/\n?```$/, '').trim();

    // Extract array if wrapped in something else
    const firstBracket = clean.indexOf('[');
    const lastBracket  = clean.lastIndexOf(']');
    if (firstBracket !== -1 && lastBracket > firstBracket) {
      clean = clean.slice(firstBracket, lastBracket + 1);
    }

    rows = JSON.parse(clean);
    if (!Array.isArray(rows)) rows = [];
  } catch (e) {
    console.error('AI parse error:', e.message);
    // Return error but leave table open for manual entry
    return NextResponse.json({
      error: 'Parse unavailable — add fixtures manually.',
      importedCount: 0,
      flaggedCount:  0,
    }, { status: 200 });
  }

  if (rows.length === 0) {
    return NextResponse.json({
      error:         'No fixture schedule found in this PDF. Check that you uploaded the correct pages.',
      importedCount: 0,
      flaggedCount:  0,
    }, { status: 200 });
  }

  // Get or create draft, update source metadata
  const draft = await getOrCreateDraft(params.id);
  await prisma.fixtureSchedule.update({
    where: { id: draft.id },
    data:  { source: 'AI_PARSE', sourceFileUrl: storedPath },
  });

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

    // Detect alternateOf — if "P3 (ALT)", alternateOf = "P3"
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

  return NextResponse.json({
    importedCount: items.length,
    flaggedCount,
    scheduleId:    draft.id,
  });
}
