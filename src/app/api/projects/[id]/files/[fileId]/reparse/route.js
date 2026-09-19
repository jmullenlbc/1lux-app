import { NextResponse } from 'next/server';
import { requireAuth, canSeeAllData } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getProjectFileBuffer } from '@/lib/projectFileStorage';
import Anthropic from '@anthropic-ai/sdk';
import { getAnthropicKey } from '@/lib/anthropicKey';
import { extractScheduleMilestones, extractScheduleMilestonesFromText } from '@/lib/scheduleExtract';
import { extractDesignMilestonesWithAI } from '@/lib/parseDesignSchedule';
import { wrapClient } from '@/lib/agent/client';
import { runParkedJob, readJobRequest, jobError } from '@/lib/parkedJob';

/**
 * Park-and-poll (src/lib/parkedJob.js). Reading a full construction schedule
 * takes ~30s on an 84-page P6 export — right at Amplify's front door. The
 * first request only writes the job down; the polls run it and collect it.
 *
 * This is now the ONE place schedule milestones are read. The upload route
 * used to do it inline; it no longer does, and the browser calls here as soon
 * as the upload row exists (src/lib/scheduleReadClient.js).
 */
export const maxDuration = 300;

/** Which read a file gets, from the tags it was uploaded with. */
function scheduleKindOf(file) {
  let tags = [];
  try { tags = JSON.parse(file?.tags || '[]'); } catch { tags = []; }
  if (!Array.isArray(tags)) tags = [];
  if (file?.tab === 'designInfo' && tags.includes('Design Schedule')) return 'design';
  if (file?.tab === 'ca' && tags.includes('Construction Schedule')) return 'construction';
  // An untagged file on CA or Design Info that someone asks to reparse by hand
  // still gets the construction read — that is what this route always did.
  return file?.tab === 'designInfo' ? 'design' : 'construction';
}

// POST /api/projects/[id]/files/[fileId]/reparse
// Runs (or re-runs) milestone extraction on an uploaded schedule.
export async function POST(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const record = await prisma.projectFile.findUnique({
    where: { id: params.fileId },
    include: { project: true },
  });
  if (!record || record.projectId !== params.id) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!canSeeAllData(user) && record.project.createdById !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { body } = await readJobRequest(request);
  return runParkedJob({
    body, kind: 'schedule.reparse', scope: params.id,
    args: body.jobKey ? null : { fileId: params.fileId },
    run: (a) => readSchedule(a, { projectId: params.id, user }),
  });
}

/**
 * The read itself. Soft failures (no text, no dates) come back as 200 bodies
 * with an `error` string and an empty list, exactly as before — the schedule
 * card shows that string next to the file.
 */
async function readSchedule({ fileId }, { projectId, user }) {
  const record = await prisma.projectFile.findUnique({ where: { id: fileId } });
  if (!record || record.projectId !== projectId) throw jobError(404, { error: 'Not found' });

  const kind = scheduleKindOf(record);
  if (kind === 'design') return readDesignSchedule(record, { projectId });
  return readConstructionSchedule(record, { projectId, user });
}

async function readDesignSchedule(record, { projectId }) {
  const text = record.textContent;
  if (!text || text.trim().length < 50) {
    return { error: 'No text was saved from this file, so its dates cannot be read. Please re-upload the schedule as a text PDF.', milestones: [] };
  }
  let milestones = [];
  try {
    milestones = await extractDesignMilestonesWithAI(text, { projectId });
  } catch (e) {
    return { error: `Extraction failed: ${e.message}`, milestones: [] };
  }
  if (!milestones || milestones.length === 0) {
    return { error: 'No milestone dates found in the document', milestones: [] };
  }
  await prisma.projectFile.update({
    where: { id: record.id },
    data:  { takeoffData: JSON.stringify({ milestones }) },
  });
  // Persist to questionnaire responses so the widget pre-populates on reload.
  await prisma.questionnaireResponse.upsert({
    where:  { projectId_section_questionKey: { projectId, section: 'design-info', questionKey: 'designMilestones' } },
    update: { answerValue: JSON.stringify(milestones) },
    create: { projectId, section: 'design-info', questionKey: 'designMilestones', answerValue: JSON.stringify(milestones) },
  });
  return { milestones, count: milestones.length, designScheduleUpdate: { milestones } };
}

async function readConstructionSchedule(record, { projectId, user }) {
  // Recorded: see src/lib/agent/ledger.js.
  const anthropic = wrapClient(
    new Anthropic({ apiKey: getAnthropicKey() }),
    'schedule.milestones.reparse',
    { projectId, userId: user.id },
  );

  // Prefer the stored object — S3 since the file-storage migration. Files uploaded
  // BEFORE that migration only ever lived on a Lambda's ephemeral disk, so their
  // bytes are gone for good; fall back to the row text extracted at upload time so
  // an old file can still be reparsed without asking for a re-upload.
  const buffer = await getProjectFileBuffer(record.storedPath);
  if (!buffer && (!record.textContent || record.textContent.trim().length < 50)) {
    throw jobError(404, {
      error: 'The original file is no longer available on the server, and no text was saved from it. Please re-upload the PDF.',
    });
  }

  let milestones = [], text = null, diag = null;
  try {
    ({ milestones, text, diag } = buffer
      ? await extractScheduleMilestones(buffer, anthropic, { projectId })
      : await extractScheduleMilestonesFromText(record.textContent, anthropic, { projectId }));
  } catch (e) {
    return { error: `Extraction failed: ${e.message}`, milestones: [] };
  }
  if (!text) {
    const d = diag || {};
    const detail = `pages=${d.numPages ?? '?'} read=${d.pagesRead ?? 0}${d.error ? ` err=${d.error}` : ''}`;
    return { error: `Could not extract text (${detail})`, milestones: [], diag };
  }
  if (milestones.length === 0) {
    return { error: 'No milestone dates found in the document', milestones: [] };
  }

  // Save to takeoffData (+ refresh stored row text)
  await prisma.projectFile.update({
    where: { id: record.id },
    data:  { takeoffData: JSON.stringify({ milestones }), textContent: text },
  });

  // Update project-level date columns (earliest start/mep, latest end).
  const get = (id) => milestones.find(m => m.id === id)?.date ?? null;
  const getEarliest = (prefix) => {
    const dates = milestones.filter(m => m.id === prefix || m.id.startsWith(prefix + '-')).map(m => m.date).filter(Boolean).sort();
    return dates[0] ?? null;
  };
  const start = get('construction-start');
  const mep   = getEarliest('mep-rough');
  const end   = get('construction-end');
  try {
    const data = {};
    if (start) data.constructionStartDate = start;
    if (mep)   data.mepRoughInDate        = mep;
    if (end)   data.constructionEndDate   = end;
    if (Object.keys(data).length > 0) {
      await prisma.project.update({ where: { id: projectId }, data });
    }
  } catch (e) { console.error('[reparse date sync] failed:', e?.message ?? e); }

  return {
    milestones, count: milestones.length,
    scheduleUpdate: { milestones, constructionStartDate: start, mepRoughInDate: mep, constructionEndDate: end },
  };
}
