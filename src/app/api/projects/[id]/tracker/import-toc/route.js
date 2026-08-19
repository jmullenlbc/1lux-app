import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getProjectFileBuffer } from '@/lib/projectFileStorage';
import Anthropic from '@anthropic-ai/sdk';
import { getAnthropicKey } from '@/lib/anthropicKey';
import { wrapClient } from '@/lib/agent/client';
import { buildUntrustedPrompt, warnOnInjection } from '@/lib/agent/untrusted';

const anthropic = new Anthropic({ apiKey: getAnthropicKey() });

// `ctx` carries the project and user this run was for — the module-level client
// cannot know either, and a ledger entry without them cannot answer "what did we
// spend on this project".
async function extractTOCWithAI(text, ctx = {}) {
  const prompt = `You are reading a lighting fixture submittal package. The Table of Contents (TOC) lists every fixture type that was submitted.

Return ONLY a valid JSON array — no markdown, no explanation:
[{"typeCode":"SP1","description":"HOLOPHANE"}, ...]

SUBMITTAL TOC FORMATS — the text may appear in any of these formats:

Format A (tab/column-aligned rows):
  SP1   HOLOPHANE   WFCL3 P40 30K MVOLT...   2
  D1    NORA LIGHTING   NIO-4RNDC30X...   63

Format B (flat/space-joined — all tokens on one or a few lines):
  ... SP1 HOLOPHANE WFCL3 P40 30K MVOLT FC5 BK SK PR7 AO PCLL L30 2 SP1 HOLOPHANE NYA 14 F5J 17S C03 BK DBB 10 A3 PRUDENTIAL BPRO2-LIN...

In Format B, find the repeating pattern: [TypeCode] [MANUFACTURER NAME] [model-number] [page-number]

RULES:
- Type codes: short alphanumeric identifiers like SP1, D1, EL1-P, V2-L, W10, A3, PS1, EB1, EW4, etc.
  They are 1–6 chars: letters + optional digits + optional dash-suffix (e.g. -P, -L, -P2)
- Use the MANUFACTURER NAME as the description (e.g. "HOLOPHANE", "NORA LIGHTING", "ELUMA")
  If no manufacturer is clear, use the fixture category (e.g. "Pendant", "Sconce")
- Do NOT use: spec section numbers (16500, 265100), page numbers, or dates as type codes
- Do NOT use: "Type", "Manufacturer", "Model", "Page", "RESUBMIT", "APPROVED" as type codes
- If a type code appears more than once (e.g. in RESUBMIT and APPROVED sections), include it only ONCE
- Include ALL fixture types — do NOT truncate
- Return [] only if no fixture types exist at all`;

  // The submittal package is the contractor's document. Fenced rather than
  // appended after a "Text:" label — see src/lib/agent/untrusted.js.
  const sealed = buildUntrustedPrompt({
    instructions: prompt,
    documents:    [{ text, descriptor: 'submittal TOC', maxChars: 10000 }],
  });
  warnOnInjection('tracker.toc.extract', ctx.projectId, sealed);

  const msg = await wrapClient(anthropic, 'tracker.toc.extract', ctx).messages.create({
    model:      'claude-haiku-4-5-20251001',
    max_tokens: 1500,
    system:     sealed.system,
    messages:   [{ role: 'user', content: sealed.content }],
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

  // Always re-extract using Y-position-aware method (reconstructs proper table rows).
  // The stored file.textContent uses naive join(' ') which collapses multi-column table rows
  // onto one line and breaks the regex parser.
  let items   = [];
  let rawText = file.textContent || null; // kept for AI fallback only

  try {
    const { extractTOCText, parseTOCFromText } = await import('@/lib/parseTOC.js');
    const buffer = await getProjectFileBuffer(file.storedPath);

    // Smart extraction: groups text items by Y position → proper tab-separated rows
    const smartText = await extractTOCText(buffer);
    items = parseTOCFromText(smartText);

    // If smart extraction still found nothing, keep rawText for AI fallback
    if (items.length === 0 && !rawText) {
      rawText = smartText; // use smart text as AI input if no stored textContent
    }
  } catch (err) {
    return NextResponse.json({ error: 'Failed to parse PDF: ' + err.message }, { status: 500 });
  }

  // AI fallback when regex finds nothing
  if (items.length === 0 && rawText) {
    try {
      items = await extractTOCWithAI(rawText, { projectId: params.id, userId: user.id });
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

  let items   = [];
  let rawText = file.textContent || null;
  try {
    const { extractTOCText, parseTOCFromText } = await import('@/lib/parseTOC.js');
    const buffer    = await getProjectFileBuffer(file.storedPath);
    const smartText = buffer ? await extractTOCText(buffer) : null;
    items = parseTOCFromText(smartText);
    if (items.length === 0 && !rawText) rawText = smartText;
  } catch {}

  // AI fallback when regex finds nothing
  if (items.length === 0 && rawText) {
    try { items = await extractTOCWithAI(rawText, { projectId: params.id, userId: user.id }); } catch {}
  }

  return NextResponse.json({ items });
}
