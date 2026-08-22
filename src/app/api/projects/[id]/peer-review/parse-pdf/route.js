import '@/lib/pdfPolyfill';
import { loadPdfjs } from '@/lib/pdfjsNode';
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
// `getAnthropicKey` was used below but never imported — this route threw a
// ReferenceError on every call. Found while wiring the ledger, fixed here.
import { getAnthropicKey } from '@/lib/anthropicKey';
import { recordRawCall } from '@/lib/agent/client';
import { modelParams, answerBudget, textFrom, warnIfTruncated } from '@/lib/aiModels';
import { readUploadedFile } from '@/lib/uploadIntake';

export const maxDuration = 120;

const SYSTEM_PROMPT = `You are a lighting fixture schedule parser for an electrical engineering firm (ILC Studios). You will receive raw text extracted from a PDF electrical drawing sheet.

IMPORTANT: The document may contain MULTIPLE sections — controls schematics, panel schedules, wiring diagrams, sequence of operations, AND a lighting fixture schedule all on the same sheet. You MUST search the ENTIRE text for any section labeled "LIGHT FIXTURE SCHEDULE", "LUMINAIRE SCHEDULE", "LIGHTING FIXTURE SCHEDULE", or similar, and extract fixtures from that section even if the rest of the document contains unrelated electrical content.

Extract all lighting fixture TYPE entries and return them as a JSON array.

Each fixture entry must have:
- typeCode: string — fixture type identifier (e.g. "A", "A1", "D1", "D1E", "G1", "S4"). Also called "MARK" in some schedules. Strip single quotes ('AA1' → "AA1"). Required.
- description: string — fixture description (e.g. "3\" RECESSED ADJUSTABLE DOWNLIGHT"). Required.
- manufacturer: string | null — primary manufacturer name only. Strip "OR EQUAL" and "APPROVED EQUAL" suffixes ("LITHONIA LIGHTING OR EQUAL" → "LITHONIA LIGHTING"). Null if TBD.
- catalogNumber: string | null — primary catalog/model number. Also called SERIES in some schedules. Null if TBD.
- watts: number | null — wattage as a decimal number (extract from "14W", "14.00 W", "7.2W/FT", "VA" columns). Null if not determinable.
- suggestedSection: string — one of: "units" | "corridor" | "garage" | "boh" | "office" | "amenity" | "exterior" | "controls" | "other"
  - "units": residential unit fixtures — bedrooms, bathrooms, kitchens, vanities, balconies, ceiling fans. Type prefixes: U, CP, R, F, G1
  - "corridor": hallways, corridors, stairwells, exit passageways. Type prefixes: C, CL
  - "garage": parking garage, parking level. Type prefixes: G, L (lensed strip)
  - "boh": back of house — mechanical rooms, utility areas, service corridors, loading dock, storage. Type prefixes: S (strip), BOH
  - "office": leasing office, management office, admin spaces. Type prefixes: O, OF
  - "amenity": lobby, fitness, clubhouse, bike room, pool, rooftop, common area amenities. Type prefixes: AA, AD, AL, AP, A
  - "exterior": exterior site, pole lights, bollards, step lights, wall sconces (outdoor), in-grade, pathway. Type prefixes: SP, LB, SW, ST, SU, E
  - "controls": lighting controls, dimmers, occupancy sensors, control panels, relay panels
  - "other": anything that doesn't clearly fit the above

CRITICAL RULES:
1. Emergency VARIANTS (D1E, S4E) are ALWAYS separate entries — never merge with the base type (D1, S4). The "E" suffix means that specific fixture is on an emergency circuit.
2. When multiple manufacturers are listed as alternatives/approved-equals, use ONLY the first/primary one.
3. SKIP non-fixture rows: standalone exit signs (X, X1, X2), standalone emergency light units (EM1, EM2 described as "EMERGENCY LIGHT UNIT"), exhaust fans (EF-*), water heaters (EWH-*), smoke detectors, CO detectors, fire alarm devices, mechanical equipment, condensing units. Keep D1E / S4E style emergency-circuit fixtures.
4. Do NOT include section headers, table headers, or general notes as fixture entries.
5. If the extracted text has very little content (< 200 characters of actual content), it is likely an image-based PDF.
6. The text extraction may have garbled column order — use context clues to map fields correctly. Column names vary by project: TYPE/MARK = fixture type code; SERIES/MODEL/CATALOG = catalog number; VA = watts in some schedules.
7. Some schedules use "MARK" instead of "TYPE" for the fixture type code column — treat them the same.

Return ONLY a JSON object, no markdown fences, no explanation:
{"fixtures": [...], "warning": null}

If no fixture schedule is found anywhere in the document:
{"fixtures": [], "warning": "No fixture schedule found. The document appears to contain: [briefly describe what you found instead]."}

If image-based PDF (too little text):
{"fixtures": [], "warning": "This PDF appears to be image-based — text could not be extracted. Please use a text-based PDF or export as a searchable PDF."}`;

async function extractPdfText(buffer) {
  const pdfjsLib = await loadPdfjs();
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
  let text = '';
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map(item => item.str).join(' ') + '\n';
  }
  return text.trim();
}

export async function POST(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const project = await prisma.project.findUnique({ where: { id: params.id } });
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (user.role !== 'ILC_ADMIN' && project.createdById !== user.id)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const formData = await request.formData();
  // Bytes may have come through the form or straight to S3 — see uploadIntake.js.
  const upload = await readUploadedFile(formData);
  if (!upload.ok) return NextResponse.json({ error: upload.message }, { status: upload.status });
  const buffer = upload.buffer;
  // Keeps the rest of the route reading the same as before the direct-to-S3 split.
  const file = { name: upload.name, type: upload.type };
  await upload.cleanup();

  // Extract text from PDF
  let extractedText = '';
  try {
    extractedText = await extractPdfText(buffer);
  } catch (e) {
    return NextResponse.json({ error: 'Failed to read PDF: ' + e.message }, { status: 422 });
  }

  // Call Claude to parse. This site talks to the REST endpoint directly rather
  // than through the SDK, so it is recorded via recordRawCall — otherwise it is
  // invisible to the ledger and every cost total is quietly short.
  const payload = {
    ...modelParams('peerReview.parsePdf'),
    max_tokens: answerBudget('peerReview.parsePdf', 4096),
    system:     SYSTEM_PROMPT,
    messages:   [{
      role:    'user',
      content: `Parse the lighting fixture schedule from this extracted PDF text. File: ${file.name}\n\n---\n\n${extractedText.slice(0, 40000)}`,
    }],
  };

  let aiData;
  try {
    aiData = await recordRawCall('peerReview.parsePdf', payload, { projectId: params.id, userId: user.id }, async () => {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key':         getAnthropicKey(),
          'anthropic-version': '2023-06-01',
          'content-type':      'application/json',
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        // Thrown rather than returned so the ledger sees a failure. A non-2xx
        // that returned normally would be recorded as a successful run with no
        // tokens, which is worse than not recording it at all.
        const err = await res.text();
        throw new Error(`Claude API ${res.status}: ${err.slice(0, 300)}`);
      }
      return res.json();
    });
  } catch (e) {
    console.error('Claude API error:', e.message);
    return NextResponse.json({ error: 'AI parsing failed' }, { status: 500 });
  }

  warnIfTruncated(aiData, 'peerReview.parsePdf');
  const raw = textFrom(aiData) || '';

  let parsed;
  try {
    // Strip markdown fences if present
    let clean = raw.replace(/^```[\w]*\n?/, '').replace(/\n?```$/, '').trim();

    // If Claude returned a text explanation instead of JSON, extract the JSON object
    const firstBrace = clean.indexOf('{');
    const lastBrace  = clean.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      clean = clean.slice(firstBrace, lastBrace + 1);
    }

    parsed = JSON.parse(clean);
  } catch {
    // Claude returned prose (no JSON at all) — treat as "no schedule found"
    console.warn('Claude returned non-JSON for fixture schedule parse:', raw.slice(0, 300));
    const looksEmpty = extractedText.length < 200;
    parsed = {
      fixtures: [],
      warning: looksEmpty
        ? 'This PDF appears to be image-based — text could not be extracted. Please use a text-based PDF.'
        : 'No fixture schedule found in this PDF. This sheet appears to contain electrical details, controls diagrams, or other non-schedule content. Try uploading the E-sheet that shows the Luminaire Schedule or Light Fixture Schedule table.',
    };
  }

  return NextResponse.json({
    fixtures: parsed.fixtures || [],
    warning:  parsed.warning  || null,
    fileName: file.name,
    charCount: extractedText.length,
  });
}
