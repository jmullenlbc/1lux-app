import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getAnthropicKey } from '@/lib/anthropicKey';
import Anthropic from '@anthropic-ai/sdk';
import path from 'path';
import { readFile } from 'fs/promises';

async function canAccess(projectId, user) {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return false;
  return user.role === 'ILC_ADMIN' || user.role === 'SUPER_ADMIN' || project.createdById === user.id;
}

// Parse XLSX into flat text for the LLM
async function xlsxToText(buffer) {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const lines = [];
  for (const name of wb.SheetNames) {
    lines.push(`=== Sheet: ${name} ===`);
    const ws = wb.Sheets[name];
    const csv = XLSX.utils.sheet_to_csv(ws);
    lines.push(csv);
  }
  return lines.join('\n');
}

const EXTRACT_SYSTEM = `You are a structured data extractor for architectural unit matrix documents.
Extract the residential unit type breakdown from the provided text. Ignore drawing indices, abbreviation
legends, revision notes, and anything unrelated to unit types and square footage.

Return ONLY valid JSON matching this exact schema — no markdown, no explanation:
{
  "unitTypes": [
    {
      "code": "string (e.g. 2BR-K)",
      "label": "string or null",
      "qty": number,
      "unitSf": number or null,
      "bedrooms": number or null,
      "bathrooms": number or null,
      "balconies": number or null,
      "confidence": number (0.0–1.0)
    }
  ],
  "projectTotals": {
    "grossInteriorSf": number or null,
    "garageSf": number or null,
    "corridorSf": number or null,
    "buildingType": "string or null"
  },
  "granularity": "PER_UNIT or PER_TYPE or PROJECT_TOTAL_ONLY",
  "overallConfidence": number (0.0–1.0),
  "notes": "string describing anything ambiguous"
}

Rules:
- Per-type matrices: each row is a unit type with a quantity. Roll up in your head to verify totals.
- Per-unit matrices: each row is one unit; group them by type code.
- Bedrooms: use the bedroom column if present; otherwise infer from the type code (e.g. "2BR" → 2, "1BR" → 1, "STUDIO" → 0).
- confidence per row: how confident you are in this row's data. 1.0 = exact numbers clearly stated; 0.5 = inferred/ambiguous.
- If a column is missing entirely, set that field to null for all rows — do not guess.
- grossInteriorSf: look for GSF, NRSF, GIA, "Total SF", or a summary total line. Only populate if explicitly stated.`;

export async function POST(request, { params }) {
  const { user, error } = await requireAuth(request);
  if (error) return error;
  if (!await canAccess(params.id, user)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { fileId } = await request.json();
  if (!fileId) return NextResponse.json({ error: 'fileId required' }, { status: 400 });

  const file = await prisma.projectFile.findFirst({
    where: { id: fileId, projectId: params.id },
  });
  if (!file) return NextResponse.json({ error: 'File not found' }, { status: 404 });

  const ext = file.originalName.split('.').pop()?.toLowerCase();

  // Image path — not supported in Phase 1
  if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) {
    return NextResponse.json({ error: 'vision_not_supported' }, { status: 422 });
  }

  let contentText = null;

  if (ext === 'xlsx' || ext === 'xls') {
    // Read from disk and convert to CSV text
    const filePath = path.join(process.cwd(), 'uploads', file.storedPath);
    const buffer = await readFile(filePath);
    contentText = await xlsxToText(buffer);
  } else if (ext === 'pdf') {
    // Use pre-extracted text from upload (textContent stored on file record)
    contentText = file.textContent;
    if (!contentText || contentText.trim().length < 30) {
      return NextResponse.json({ error: 'vision_not_supported' }, { status: 422 });
    }
  } else {
    return NextResponse.json({ error: 'Unsupported file type' }, { status: 422 });
  }

  // Truncate to avoid overwhelming context (matrices rarely need more than 8k chars)
  const truncated = contentText.length > 12000 ? contentText.slice(0, 12000) + '\n[truncated]' : contentText;

  const apiKey = getAnthropicKey()?.trim();
  if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 503 });

  const anthropic = new Anthropic({ apiKey });

  // Use Haiku for clean text; escalate to Sonnet for dense/noisy sheets
  const isNoisy = truncated.length > 6000 || (file.originalName.toLowerCase().includes('full') || file.originalName.toLowerCase().includes('combined'));
  const model = isNoisy ? 'claude-sonnet-4-6' : 'claude-haiku-4-5-20251001';

  let raw;
  try {
    const msg = await anthropic.messages.create({
      model,
      max_tokens: 2048,
      system: EXTRACT_SYSTEM,
      messages: [{ role: 'user', content: `Extract the unit matrix from this document:\n\n${truncated}` }],
    });
    raw = msg.content[0]?.text ?? '';
  } catch (e) {
    console.error('Claude unit matrix parse error:', e);
    return NextResponse.json({ error: 'Extraction failed' }, { status: 502 });
  }

  // Strip code fences defensively
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    console.error('Unit matrix parse — bad JSON from Claude:', raw.slice(0, 500));
    return NextResponse.json({ error: 'Could not parse extraction output' }, { status: 502 });
  }

  // Validate shape
  if (!Array.isArray(parsed.unitTypes)) {
    return NextResponse.json({ error: 'Unexpected extraction shape' }, { status: 502 });
  }

  return NextResponse.json({ ...parsed, model, fileId });
}
