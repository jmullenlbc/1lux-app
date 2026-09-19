import { NextResponse } from 'next/server';
import { requireAuth, canSeeAllData } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getAnthropicKey } from '@/lib/anthropicKey';
import { wrapClient } from '@/lib/agent/client';
import { modelParams, textFrom, answerBudget } from '@/lib/aiModels';
import { buildUntrustedPrompt, warnOnInjection } from '@/lib/agent/untrusted';
import { getProjectFileBuffer } from '@/lib/projectFileStorage';
import { readUploadedFile } from '@/lib/uploadIntake';
import { runParkedJob, readJobRequest, jobError, uploadToJobArgs, loadJobUpload } from '@/lib/parkedJob';
import {
  extractPdfPages,
  extractNotesFromPages,
  categorizeNote,
  inferResponsibleParty,
  detectRepeats,
} from '@/lib/submittalExtractor';

async function getOrCreateTracker(projectId) {
  let tracker = await prisma.submittalTracker.findUnique({ where: { projectId } });
  if (!tracker) {
    tracker = await prisma.submittalTracker.create({ data: { projectId } });
  }
  return tracker;
}

/**
 * POST /api/projects/[id]/tracker/extract
 *
 * Body (multipart/form-data):
 *   file        — PDF file to extract
 *   submissionName — optional name for the submission round (e.g. "R1 - Units Package")
 *
 * OR Body (JSON):
 *   fileId      — ID of an existing ProjectFile to extract from
 *   submissionName
 *
 * Pipeline:
 *   1. Extract PDF text via pdfjs
 *   2. Scan for reviewer prefix patterns → raw notes
 *   3. Map notes to SubmittalItem records (create items if new type codes found)
 *   4. Create SubmittalSubmission + SubmittalItemVersion + SubmittalReview records
 *   5. Run Claude Haiku classification on notes lacking a rule-based category
 *   6. Detect repeats against existing SubmittalOpenItems
 *   7. Upsert SubmittalOpenItem records
 */
// Park-and-poll (src/lib/parkedJob.js). A submittal review round is one PDF
// read plus up to fifty short model calls — minutes, not seconds, on a big
// package. The first request only writes the job down; the polls run it and
// collect it. In-flight window is the Lambda's own ceiling.
export const maxDuration = 300;
const EXTRACT_INFLIGHT_MS = 300_000;

export async function POST(req, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const project = await prisma.project.findUnique({ where: { id: params.id } });
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!canSeeAllData(user) && project.createdById !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { body, formData } = await readJobRequest(req);
  let args = null;
  if (!body.jobKey) {
    if (formData) {
      const upload = await readUploadedFile(formData);
      if (!upload.ok) return NextResponse.json({ error: upload.message }, { status: upload.status });
      // Not cleaned up here: the poll that runs the read needs the bytes.
      args = await uploadToJobArgs(upload, { scope: 'project' });
      args.submissionName = String(formData.get('submissionName') || '') || null;
    } else if (body.fileId) {
      const pf = await prisma.projectFile.findUnique({ where: { id: body.fileId }, select: { projectId: true } });
      if (!pf || pf.projectId !== params.id) return NextResponse.json({ error: 'File not found' }, { status: 404 });
      args = { fileId: body.fileId, submissionName: body.submissionName || null };
    } else {
      return NextResponse.json({ error: 'Provide file upload or fileId' }, { status: 400 });
    }
  }

  return runParkedJob({
    body, kind: 'tracker.extract', scope: params.id, args, inflightMs: EXTRACT_INFLIGHT_MS,
    run: (a) => extractSubmittal(a, { projectId: params.id, user }),
  });
}

/** The read itself. Returns the response body; throws jobError for the route's own failures. */
async function extractSubmittal(args, { projectId, user }) {
  let buffer, fileName, submissionName, cleanup = null;
  try {
    if (args.fileId) {
      const pf = await prisma.projectFile.findUnique({ where: { id: args.fileId } });
      if (!pf) throw jobError(404, { error: 'File not found' });
      buffer = await getProjectFileBuffer(pf.storedPath);
      if (!buffer) throw jobError(422, { error: 'Could not read stored file' });
      fileName       = pf.originalName;
      submissionName = args.submissionName || pf.originalName.replace(/\.pdf$/i, '');
    } else {
      const upload = await loadJobUpload(args);
      cleanup        = upload.cleanup;
      buffer         = upload.buffer;
      fileName       = upload.name;
      submissionName = args.submissionName || upload.name.replace(/\.pdf$/i, '');
    }

  // ── STEP 1: Extract PDF text ─────────────────────────────────────────────
  let pages;
  try {
    pages = await extractPdfPages(buffer);
  } catch (e) {
    throw jobError(422, { error: 'Failed to read PDF: ' + e.message });
  }

  // ── STEP 2: Load known type codes for this project ───────────────────────
  const tracker = await getOrCreateTracker(projectId);

  // Load existing items
  const existingItems = await prisma.submittalItem.findMany({
    where: { trackerId: tracker.id },
    select: { id: true, typeCode: true },
  });
  const knownTypeCodes = new Set(existingItems.map(i => i.typeCode.toUpperCase()));

  // ── STEP 3: Run extraction pipeline ─────────────────────────────────────
  const rawNotes = extractNotesFromPages(pages, knownTypeCodes);

  if (rawNotes.length === 0) {
    return {
      message: 'No reviewer notes detected in this PDF. The PDF may be text-layer-only without reviewer annotations, or the fixture types are not in the tracker yet.',
      notesExtracted: 0,
    };
  }

  // ── STEP 4: Ensure all referenced type codes exist as SubmittalItems ─────
  const allTypeCodes = [...new Set(rawNotes.map(n => n.fixtureType).filter(t => t !== 'GENERAL'))];
  const newCodes = allTypeCodes.filter(tc => !knownTypeCodes.has(tc));

  if (newCodes.length > 0) {
    await prisma.submittalItem.createMany({
      data: newCodes.map((tc, i) => ({
        trackerId: tracker.id,
        typeCode:  tc,
        sortOrder: existingItems.length + i,
      })),
      skipDuplicates: true,
    });
  }

  // Reload all items after potential new inserts
  const allItems = await prisma.submittalItem.findMany({
    where:  { trackerId: tracker.id },
    select: { id: true, typeCode: true },
  });
  const itemByCode = Object.fromEntries(allItems.map(i => [i.typeCode.toUpperCase(), i]));

  // ── STEP 5: Create SubmittalSubmission + versions + reviews ───────────────
  const submission = await prisma.submittalSubmission.create({
    data: {
      trackerId: tracker.id,
      name:      submissionName,
      notes:     `Auto-extracted from ${fileName} — ${rawNotes.length} notes found`,
    },
  });

  // Group notes by fixture type
  const notesByType = {};
  for (const note of rawNotes) {
    const tc = note.fixtureType.toUpperCase();
    if (!notesByType[tc]) notesByType[tc] = [];
    notesByType[tc].push(note);
  }

  let reviewsCreated = 0;
  const allVersionIds = [];

  for (const [typeCode, notes] of Object.entries(notesByType)) {
    const item = itemByCode[typeCode];
    if (!item) continue;

    // Check for discontinued / wet location flags in any note
    const isDiscontinued      = notes.some(n => n.noteCategory === 'DISCONTINUED');
    const wetLocationRequired = notes.some(n => n.noteCategory === 'WET_LOCATION');

    const version = await prisma.submittalItemVersion.create({
      data: {
        itemId:             item.id,
        submissionId:       submission.id,
        isDiscontinued:     isDiscontinued     || null,
        wetLocationRequired: wetLocationRequired || null,
      },
    });
    allVersionIds.push(version.id);

    for (const note of notes) {
      await prisma.submittalReview.create({
        data: {
          versionId:    version.id,
          reviewerRole: note.reviewerRole,
          reviewerName: note.reviewerFirm || null,
          status:       note.status,
          notes:        note.noteText,
          noteCategory: note.noteCategory,
          pageNumber:   note.pageNumber,
          isExtracted:  true,
          createdById:  user.id,
        },
      });
      reviewsCreated++;
    }
  }

  // ── STEP 6: Claude Haiku classification for OTHER-category notes ──────────
  // Only run Haiku on notes the rules couldn't confidently categorize
  const otherReviews = await prisma.submittalReview.findMany({
    where: {
      noteCategory: 'OTHER',
      isExtracted:  true,
      version:      { submissionId: submission.id },
    },
    select: { id: true, notes: true },
    take: 50, // cost cap
  });

  if (otherReviews.length > 0) {
    try {
      const Anthropic = (await import('@anthropic-ai/sdk')).default;
      // Recorded: see src/lib/agent/ledger.js. One ledger entry per note — the
      // loop below is capped at 50, so the per-run cost is bounded and worth
      // recording individually rather than as one opaque batch.
      const anthropic  = wrapClient(
        new Anthropic({ apiKey: getAnthropicKey() }),
        'tracker.review.classify',
        { projectId, userId: user.id },
      );

      const categories = Object.keys(require('@/lib/submittalExtractor').NOTE_CATEGORIES || {}).join('|') ||
        'FINISH|MODEL|ACCESSORY|VOLTAGE|LUMEN|WET_LOCATION|DRAWING_SYNC|DISCONTINUED|LED_TAPE|CODE|CRI|BOILERPLATE|OTHER';

      for (const review of otherReviews) {
        // The note is an outside reviewer's text. The old form put it in double
        // quotes, which any note containing a quote mark escapes for free.
        const sealed = buildUntrustedPrompt({
          instructions: `Classify this submittal reviewer note into exactly one category. Respond with ONLY the category name, nothing else.\n\nCategories: ${categories}`,
          documents:    [{ text: review.notes || '', descriptor: 'reviewer note', maxChars: 4000 }],
        });
        warnOnInjection('tracker.review.classify', projectId, sealed);

        const msg = await anthropic.messages.create({
          ...modelParams('tracker.extract'),
          max_tokens: answerBudget('tracker.extract', 30),
          system:     sealed.system,
          messages:   [{ role: 'user', content: sealed.content }],
        });
        const classified = textFrom(msg)?.trim().toUpperCase();
        if (classified && classified !== 'OTHER') {
          await prisma.submittalReview.update({
            where: { id: review.id },
            data:  { noteCategory: classified },
          });
        }
      }
    } catch (e) {
      console.warn('Haiku classification skipped:', e.message);
    }
  }

  // ── STEP 7: Open items + repeat detection (Phase 4) ──────────────────────
  const existingOpenItems = await prisma.submittalOpenItem.findMany({
    where: { projectId: projectId },
  });

  // Determine current round number from submission count
  const roundNumber = await prisma.submittalSubmission.count({ where: { trackerId: tracker.id } });

  // Collect all extracted notes for open item tracking
  const allExtractedReviews = await prisma.submittalReview.findMany({
    where: { isExtracted: true, version: { submissionId: submission.id }, status: { in: ['ApprovedAsNoted', 'Resubmit', 'NoAction'] } },
    include: { version: { include: { item: true } } },
  });

  for (const review of allExtractedReviews) {
    const typeCode = review.version.item.typeCode;
    const existing = existingOpenItems.find(
      oi => oi.typeCode === typeCode && oi.noteCategory === review.noteCategory && !oi.closedRound
    );

    const responsibleParty = inferResponsibleParty(review.notes || '', review.noteCategory || '');

    if (existing) {
      // Update: mark as repeat, advance to current round
      await prisma.submittalOpenItem.update({
        where: { id: existing.id },
        data: {
          isRepeat:  true,
          noteText:  review.notes || existing.noteText,
          updatedAt: new Date(),
        },
      });
    } else {
      // Create new open item
      await prisma.submittalOpenItem.create({
        data: {
          projectId:       projectId,
          typeCode,
          noteCategory:    review.noteCategory || 'OTHER',
          responsibleParty,
          noteText:        review.notes || '',
          openedRound:     roundNumber,
          isRepeat:        false,
        },
      });
    }
  }

  // Close open items for types that got fully APPROVED in this submission
  const approvedTypes = await prisma.submittalReview.findMany({
    where: { isExtracted: true, version: { submissionId: submission.id }, status: 'Approved' },
    include: { version: { include: { item: true } } },
  });
  for (const review of approvedTypes) {
    await prisma.submittalOpenItem.updateMany({
      where: { projectId, typeCode: review.version.item.typeCode, closedRound: null },
      data:  { closedRound: roundNumber },
    });
  }

  return {
    ok:             true,
    submissionId:   submission.id,
    notesExtracted: reviewsCreated,
    newTypeCodes:   newCodes,
    pagesScanned:   pages.length,
  };
  } finally {
    // The stashed upload is only needed for this one read.
    if (cleanup) await cleanup().catch(() => {});
  }
}
