import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import path from 'path';
import { readFile } from 'fs/promises';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function extractTOCWithAI(text) {
  const prompt = `You are reading a lighting fixture submittal package. Extract every fixture type from the table of contents or fixture schedule index.

Return ONLY a valid JSON array — no markdown, no explanation:
[{"typeCode":"A","description":"Recessed Downlight"}, ...]

What to look for:
- Type codes are identifiers like: A, B, C, LP, WP, A1, B2, LP-1, EL-1, SP1, D1, etc.
- Descriptions are fixture category names like "Recessed Downlight", "Wall Sconce", "Linear Strip", "Pendant", "Exit/Emergency"
- In a TOC, each line typically has: [type code]  [description]  [page number]
- Fixture schedule indexes often list: [type code] followed by manufacturer/model info

Rules:
- Include ALL fixture types you find — don't truncate the list
- Do NOT include specification section numbers (16500, 265100, etc.) as type codes
- Do NOT include page numbers, dates, or revision numbers as type codes
- If a type code appears multiple times, include it only once
- Return [] if genuinely no fixture types are present

Text (first 8000 chars):
${text.slice(0, 8000)}`;

  const msg = await anthropic.messages.create({
    model:      'claude-haiku-4-5-20251001',
    max_tokens: 800,
    messages:   [{ role: 'user', content: prompt }],
  });

  const raw   = msg.content.map(b => b.text || '').join('');
  const start = raw.indexOf('[');
  const end   = raw.lastIndexOf(']');
  if (start === -1 || end === -1) return [];

  try {
    const parsed = JSON.parse(raw.slice(start, end + 1));
    return parsed.filter(m =>
      m.typeCode && m.description &&
      typeof m.typeCode === 'string' &&
      typeof m.description === 'string' &&
      m.typeCode.length <= 10
    );
  } catch {
    return [];
  }
}

// POST /api/projects/[id]/tracker/import-toc
// Body: { fileId } — ID of a ProjectFile in the submittals tab
// Parses its TOC and bulk-creates SubmittalItems on the tracker.
export async function POST(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const project = await prisma.project.findUnique({ where: { id: params.id } });
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (user.role !== 'ILC_ADMIN' && project.createdById !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json();
  const { fileId } = body;

  if (!fileId) return NextResponse.json({ error: 'fileId required' }, { status: 400 });

  const file = await prisma.projectFile.findUnique({ where: { id: fileId } });
  if (!file || file.projectId !== params.id) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }

  // Parse TOC — prefer already-extracted textContent, else re-extract from disk.
  // Regex parser first; AI fallback when it returns nothing.
  let items = [];
  let rawText = file.textContent || null;

  try {
    const { parseTOCFromText, parseTOCFromBuffer } = await import('@/lib/parseTOC.js');

    if (rawText) {
      items = parseTOCFromText(rawText);
    } else {
      const filePath = path.join(process.cwd(), 'uploads', file.storedPath);
      const buffer   = await readFile(filePath);
      items  = await parseTOCFromBuffer(buffer);
      // Also extract raw text so AI fallback can use it
      try {
        const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
        const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
        let t = '';
        const maxPages = Math.min(doc.numPages, 8);
        for (let i = 1; i <= maxPages; i++) {
          const page = await doc.getPage(i);
          const content = await page.getTextContent();
          t += content.items.map(it => it.str).join(' ') + '\n';
        }
        rawText = t.trim();
      } catch {}
    }
  } catch (err) {
    return NextResponse.json({ error: 'Failed to parse PDF: ' + err.message }, { status: 500 });
  }

  // AI fallback when regex finds nothing
  if (items.length === 0 && rawText) {
    try {
      items = await extractTOCWithAI(rawText);
    } catch {}
  }

  if (items.length === 0) {
    return NextResponse.json({ error: 'No fixture types found in this PDF. The TOC may not be in a recognisable format.' }, { status: 422 });
  }

  // Ensure tracker exists
  let tracker = await prisma.submittalTracker.findUnique({ where: { projectId: params.id } });
  if (!tracker) {
    tracker = await prisma.submittalTracker.create({
      data: { projectId: params.id },
    });
  }

  // Get existing type codes to avoid duplicates
  const existing = await prisma.submittalItem.findMany({
    where: { trackerId: tracker.id },
    select: { typeCode: true },
  });
  const existingCodes = new Set(existing.map(i => i.typeCode.toUpperCase()));

  const newItems = items.filter(i => !existingCodes.has(i.typeCode.toUpperCase()));

  // Bulk create
  if (newItems.length > 0) {
    const maxSort = await prisma.submittalItem.aggregate({
      where: { trackerId: tracker.id },
      _max: { sortOrder: true },
    });
    let sortOrder = (maxSort._max.sortOrder ?? 0) + 1;

    await prisma.submittalItem.createMany({
      data: newItems.map(item => ({
        trackerId:   tracker.id,
        typeCode:    item.typeCode,
        description: item.description,
        sortOrder:   sortOrder++,
      })),
    });
  }

  return NextResponse.json({
    created:   newItems.length,
    skipped:   items.length - newItems.length,
    total:     items.length,
    trackerId: tracker.id,
  });
}

// GET /api/projects/[id]/tracker/import-toc?fileId=xxx — preview without creating
export async function GET(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const project = await prisma.project.findUnique({ where: { id: params.id } });
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (user.role !== 'ILC_ADMIN' && project.createdById !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const fileId = searchParams.get('fileId');
  if (!fileId) return NextResponse.json({ error: 'fileId required' }, { status: 400 });

  const file = await prisma.projectFile.findUnique({ where: { id: fileId } });
  if (!file || file.projectId !== params.id) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }

  let items = [];
  let rawText = file.textContent || null;
  try {
    const { parseTOCFromText, parseTOCFromBuffer } = await import('@/lib/parseTOC.js');
    if (rawText) {
      items = parseTOCFromText(rawText);
    } else {
      const filePath = path.join(process.cwd(), 'uploads', file.storedPath);
      const buffer   = await (await import('fs/promises')).readFile(filePath);
      items = await parseTOCFromBuffer(buffer);
      try {
        const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
        const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
        let t = '';
        const maxPages = Math.min(doc.numPages, 8);
        for (let i = 1; i <= maxPages; i++) {
          const page = await doc.getPage(i);
          const content = await page.getTextContent();
          t += content.items.map(it => it.str).join(' ') + '\n';
        }
        rawText = t.trim();
      } catch {}
    }
  } catch {}

  // AI fallback when regex finds nothing
  if (items.length === 0 && rawText) {
    try { items = await extractTOCWithAI(rawText); } catch {}
  }

  return NextResponse.json({ items });
}
