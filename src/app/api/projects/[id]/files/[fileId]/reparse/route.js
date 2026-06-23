import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { readFile } from 'fs/promises';
import path from 'path';
import Anthropic from '@anthropic-ai/sdk';
import { getAnthropicKey } from '@/lib/anthropicKey';

async function extractPdfText(buffer) {
  try {
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const uint8    = new Uint8Array(buffer);
    const doc      = await pdfjsLib.getDocument({ data: uint8 }).promise;
    let text = '';
    const maxPages = Math.min(doc.numPages, 60);
    for (let i = 1; i <= maxPages; i++) {
      const page    = await doc.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map(item => item.str).join(' ') + '\n';
    }
    const trimmed = text.trim();
    if (trimmed.length > 50) return trimmed;
  } catch {}
  return null;
}

async function extractScheduleMilestonesWithAI(textContent, anthropic) {
  const prompt = `You are reading a construction schedule (may be Primavera P6, MS Project, Excel, or similar Gantt export).

Extract milestone dates and return ONLY a valid JSON array — no markdown, no explanation.

Return format: [{"id":"milestone-id","label":"Milestone Label","date":"YYYY-MM-DD"}, ...]

Milestone types to find:

• "construction-start" — NTP, Notice to Proceed, mobilization, project start, first day of construction. "A" (Actual) dates are valid.

• "electrical-rough-1", "electrical-rough-2", ... — Overhead electrical rough, electrical rough-in, in-wall electrical.
  If the schedule has separate phases or buildings, return ONE entry per phase/building, numbered sequentially.
  Use the EARLIEST start date for each phase. Sort by date ascending.
  Label each entry with phase/building info, e.g. "Electrical Rough-In — Phase 1".
  If only one phase, use id "electrical-rough-1" and label "Electrical Rough-In".
  Exclude: switchgear, panelboard, fire alarm, underground/conduit, transformers.

• "mep-rough-1", "mep-rough-2", ... — MEP rough-in, overhead mechanical, plumbing overhead.
  Same multi-phase rule. Only include if listed separately from electrical rough.

• "light-fixtures" — Light fixture install, install lighting, light fixtures / fans.
  Exclude: site lighting, exterior lighting, bollards.

• "site-lighting" — Site lighting, exterior lighting, parking lot lighting, bollard install.

• "electrical-devicing" — Electrical devicing, devicing / trims, electrical trim.

• "tco" — Temporary Certificate of Occupancy. If multiple phases, use the FIRST phase date.

• "construction-end" — Substantial completion, final completion, project closeout. If multiple phases use the LAST date.

Rules:
- Only include milestones explicitly in the schedule — do NOT guess or invent dates
- Dates marked "A" (Actual/already happened) are valid — include them
- Return [] if no recognizable milestone dates are found

Schedule text (first 50000 chars):
${textContent.slice(0, 50000)}`;

  const msg = await anthropic.messages.create({
    model:      'claude-haiku-4-5',
    max_tokens: 1200,
    messages:   [{ role: 'user', content: prompt }],
  });

  const raw   = msg.content.map(b => b.text || '').join('');
  const start = raw.indexOf('[');
  const end   = raw.lastIndexOf(']');
  if (start === -1 || end === -1) return [];

  const parsed = JSON.parse(raw.slice(start, end + 1));

  const SINGLETON_IDS = new Set(['construction-start', 'light-fixtures', 'site-lighting', 'electrical-devicing', 'tco', 'construction-end']);
  const MULTI_RE = /^(electrical-rough|mep-rough)-\d+$/;

  return parsed.filter(m =>
    m.id && m.label && /^\d{4}-\d{2}-\d{2}$/.test(m.date) &&
    parseInt(m.date) >= 2020 && parseInt(m.date) <= 2035 &&
    (SINGLETON_IDS.has(m.id) || MULTI_RE.test(m.id))
  );
}

// POST /api/projects/[id]/files/[fileId]/reparse
// Re-runs AI milestone extraction on a construction schedule file
export async function POST(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const anthropic = new Anthropic({ apiKey: getAnthropicKey() });

  const record = await prisma.projectFile.findUnique({
    where: { id: params.fileId },
    include: { project: true },
  });
  if (!record) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (user.role !== 'ILC_ADMIN' && record.project.createdById !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Read file from disk
  let buffer;
  try {
    buffer = await readFile(path.join(process.cwd(), 'uploads', record.storedPath));
  } catch {
    return NextResponse.json({ error: 'File not found on disk' }, { status: 404 });
  }

  // Extract text
  const textContent = record.textContent || await extractPdfText(buffer);
  if (!textContent) {
    return NextResponse.json({ error: 'Could not extract text — scanned PDF?', milestones: [] });
  }

  // Run AI extraction
  let milestones = [];
  try {
    milestones = await extractScheduleMilestonesWithAI(textContent, anthropic);
  } catch (e) {
    return NextResponse.json({ error: `AI extraction failed: ${e.message}`, milestones: [] });
  }

  if (milestones.length === 0) {
    return NextResponse.json({ error: 'No milestone dates found in the document', milestones: [] });
  }

  // Save to takeoffData
  const takeoffData = JSON.stringify({ milestones });
  await prisma.projectFile.update({
    where: { id: params.fileId },
    data:  { takeoffData },
  });

  // Also update project-level date columns
  try {
    const get = (id) => milestones.find(m => m.id === id)?.date ?? null;
    const getEarliest = (prefix) => {
      const dates = milestones.filter(m => m.id === prefix || m.id.startsWith(prefix + '-')).map(m => m.date).filter(Boolean).sort();
      return dates[0] ?? null;
    };
    const start = get('construction-start');
    const mep   = getEarliest('mep-rough');
    const end   = get('construction-end');
    const cols = [], vals = [];
    if (start) { cols.push('"constructionStartDate" = ?'); vals.push(start); }
    if (mep)   { cols.push('"mepRoughInDate" = ?');        vals.push(mep); }
    if (end)   { cols.push('"constructionEndDate" = ?');   vals.push(end); }
    if (cols.length > 0) {
      vals.push(params.id);
      await prisma.$executeRawUnsafe(`UPDATE "Project" SET ${cols.join(', ')} WHERE "id" = ?`, ...vals);
    }
  } catch {}

  return NextResponse.json({ milestones, count: milestones.length });
}
