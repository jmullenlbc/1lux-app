import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { readFile } from 'fs/promises';
import path from 'path';
import Anthropic from '@anthropic-ai/sdk';
import { getAnthropicKey } from '@/lib/anthropicKey';
import { extractScheduleMilestones } from '@/lib/scheduleExtract';

// POST /api/projects/[id]/files/[fileId]/reparse
// Re-runs construction-schedule milestone extraction on an uploaded file.
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

  // Read the file from disk and run the row-structured, whole-document extractor.
  let buffer;
  try {
    buffer = await readFile(path.join(process.cwd(), 'uploads', record.storedPath));
  } catch {
    return NextResponse.json({ error: 'File not found on disk' }, { status: 404 });
  }

  let milestones = [], text = null;
  try {
    ({ milestones, text } = await extractScheduleMilestones(buffer, anthropic));
  } catch (e) {
    return NextResponse.json({ error: `Extraction failed: ${e.message}`, milestones: [] });
  }
  if (!text) {
    return NextResponse.json({ error: 'Could not extract text — scanned PDF?', milestones: [] });
  }
  if (milestones.length === 0) {
    return NextResponse.json({ error: 'No milestone dates found in the document', milestones: [] });
  }

  // Save to takeoffData (+ refresh stored row text)
  await prisma.projectFile.update({
    where: { id: params.fileId },
    data:  { takeoffData: JSON.stringify({ milestones }), textContent: text },
  });

  // Update project-level date columns (earliest start/mep, latest end).
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
