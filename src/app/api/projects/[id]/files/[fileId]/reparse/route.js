import { NextResponse } from 'next/server';
import { requireAuth, canSeeAllData } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getProjectFileBuffer } from '@/lib/projectFileStorage';
import Anthropic from '@anthropic-ai/sdk';
import { getAnthropicKey } from '@/lib/anthropicKey';
import { extractScheduleMilestones, extractScheduleMilestonesFromText } from '@/lib/scheduleExtract';
import { wrapClient } from '@/lib/agent/client';

// Reading a full construction schedule with Fable 5 takes ~30s on an 84-page P6
// export. Without this the request is cut off long before the answer arrives and
// the upload silently lands with no milestones. Matches the ceiling already set
// on the other AI parse routes.
export const maxDuration = 120;


// POST /api/projects/[id]/files/[fileId]/reparse
// Re-runs construction-schedule milestone extraction on an uploaded file.
export async function POST(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  // Recorded: see src/lib/agent/ledger.js. Same extractor as the upload path,
  // different task name — a reparse is a retry of something that already ran,
  // and averaging the two hides how often the first attempt was not good enough.
  const anthropic = wrapClient(
    new Anthropic({ apiKey: getAnthropicKey() }),
    'schedule.milestones.reparse',
    { projectId: params.id, userId: user.id },
  );

  const record = await prisma.projectFile.findUnique({
    where: { id: params.fileId },
    include: { project: true },
  });
  if (!record) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!canSeeAllData(user) && record.project.createdById !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Prefer the stored object — S3 since the file-storage migration. Files uploaded
  // BEFORE that migration only ever lived on a Lambda's ephemeral disk, so their
  // bytes are gone for good; fall back to the row text extracted at upload time so
  // an old file can still be reparsed without asking for a re-upload.
  const buffer = await getProjectFileBuffer(record.storedPath);
  if (!buffer && (!record.textContent || record.textContent.trim().length < 50)) {
    return NextResponse.json({
      error: 'The original file is no longer available on the server, and no text was saved from it. Please re-upload the PDF.',
    }, { status: 404 });
  }

  let milestones = [], text = null, diag = null;
  try {
    ({ milestones, text, diag } = buffer
      ? await extractScheduleMilestones(buffer, anthropic, { projectId: params.id })
      : await extractScheduleMilestonesFromText(record.textContent, anthropic, { projectId: params.id }));
  } catch (e) {
    return NextResponse.json({ error: `Extraction failed: ${e.message}`, milestones: [] });
  }
  if (!text) {
    const d = diag || {};
    const detail = `pages=${d.numPages ?? '?'} read=${d.pagesRead ?? 0}${d.error ? ` err=${d.error}` : ''}`;
    return NextResponse.json({ error: `Could not extract text (${detail})`, milestones: [], diag }, { status: 200 });
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
    const data = {};
    if (start) data.constructionStartDate = start;
    if (mep)   data.mepRoughInDate        = mep;
    if (end)   data.constructionEndDate   = end;
    if (Object.keys(data).length > 0) {
      await prisma.project.update({ where: { id: params.id }, data });
    }
  } catch (e) { console.error('[reparse date sync] failed:', e?.message ?? e); }

  return NextResponse.json({ milestones, count: milestones.length });
}
