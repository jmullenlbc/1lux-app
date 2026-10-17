import { NextResponse } from 'next/server';
import { requireAuth, canSeeAllData } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getAnthropicKey } from '@/lib/anthropicKey';
import Anthropic from '@anthropic-ai/sdk';
import { getProjectFileBuffer } from '@/lib/projectFileStorage';
// Shared with the public intake route (/api/intake/parse). The extraction
// prompt and model choice live in ONE place so the internal tool and the
// public tool can never disagree about the same document.
import { xlsxToText, parseUnitMatrix, extractPdfPages, EXTRACT_PROMPT_VERSION } from '@/lib/drawingExtract';
import { buildSheetIndex, pickKeySheets, SET_PAGE_THRESHOLD } from '@/lib/sheetIndex';
import { wrapClient } from '@/lib/agent/client';
import { submitAgentOutput } from '@/lib/agent/review';
import { summariseInput } from '@/lib/agent/untrusted';
import { runParkedJob, readJobRequest, jobError } from '@/lib/parkedJob';

async function canAccess(projectId, user) {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return false;
  return canSeeAllData(user) || project.createdById === user.id;
}


/**
 * Park-and-poll (src/lib/parkedJob.js). On a full set this chains a sheet
 * pick and the matrix extraction inside one request, which runs past
 * Amplify's ~30-second front door. The first request only writes the job
 * down; the polls run it and collect it.
 */
export const maxDuration = 300;

export async function POST(request, { params }) {
  const { user, error } = await requireAuth(request);
  if (error) return error;
  if (!await canAccess(params.id, user)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { body } = await readJobRequest(request);
  let args = null;
  if (!body.jobKey) {
    const { fileId } = body;
    if (!fileId) return NextResponse.json({ error: 'fileId required' }, { status: 400 });
    const exists = await prisma.projectFile.findFirst({ where: { id: fileId, projectId: params.id }, select: { id: true } });
    if (!exists) return NextResponse.json({ error: 'File not found' }, { status: 404 });
    args = { fileId };
  }

  return runParkedJob({
    body, kind: 'unitMatrix.parse', scope: params.id, args,
    run: (a) => readUnitMatrix(a, { projectId: params.id, user }),
  });
}

/** The read itself. Returns the response body; throws jobError for the route's own failures. */
async function readUnitMatrix({ fileId }, { projectId, user }) {
  const file = await prisma.projectFile.findFirst({
    where: { id: fileId, projectId },
  });
  if (!file) throw jobError(404, { error: 'File not found' });

  const ext = file.originalName.split('.').pop()?.toLowerCase();

  // Image path, not supported in Phase 1
  if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) {
    throw jobError(422, { error: 'vision_not_supported' });
  }

  let contentText = null;
  let pages = null;
  let sheetsRead = null;

  if (ext === 'xlsx' || ext === 'xls') {
    const buffer = await getProjectFileBuffer(file.storedPath);
    if (!buffer) throw jobError(404, { error: 'File not found. It may have been deleted.' });
    contentText = await xlsxToText(buffer);
  } else if (ext === 'pdf') {
    // Use pre-extracted text from upload (textContent stored on file record)
    contentText = file.textContent;
    if (!contentText || contentText.trim().length < 30) {
      throw jobError(422, { error: 'vision_not_supported' });
    }

    // Re-read the PDF from disk purely to recover PAGE BOUNDARIES.
    //
    // `textContent` is one flattened blob, and flattening is exactly what breaks
    // the net-vs-gross call: a full set contains the life-safety "ACTUAL AREA",
    // the room schedule's "AVG AREA" and sometimes a "GROSS SF", all true, all
    // about different numbers. Read as one string they cancel out and every
    // upload comes back "not sure". Per page, each label sits with the table it
    // belongs to and the answer is clean.
    //
    // Best-effort by design: an older file whose bytes are gone still parses,
    // it just falls back to classifying the flat text (and will more often ask
    // for a human look, which is the safe direction to fail).
    try {
      const buffer = await getProjectFileBuffer(file.storedPath);
      const scan = buffer ? await extractPdfPages(buffer) : { pages: [] };
      if (scan.pages.length) pages = scan.pages;

      // ── On a full set, read the right sheets instead of the first 30,000
      //    characters ──
      //
      // `textContent` is the whole document flattened. The relevance windowing
      // in selectRelevantText keeps that honest on a handful of sheets, but a
      // 442-page DD set is roughly two million characters, so the 30,000 that
      // survive are 1.5% of the document chosen by keyword. If the unit matrix
      // is on sheet A2.10 and a dozen other sheets say "UNIT TYPE" in a note,
      // the real table can lose.
      //
      // The sheet index already knows which page the matrix is on. Narrowing
      // the text to those pages costs one cheap model call on the index, sheet
      // numbers and titles only, and hands the extractor the table rather than
      // a keyword sample of the building.
      //
      // Best-effort throughout: any failure here leaves contentText exactly as
      // it was, which is the behaviour this route had before.
      if (pages && pages.length > SET_PAGE_THRESHOLD) {
        const anthropicKey = getAnthropicKey()?.trim();
        const picked = await pickKeySheets(
          buildSheetIndex(pages),
          anthropicKey
            ? wrapClient(new Anthropic({ apiKey: anthropicKey }), 'unitMatrix.sheetPick', { projectId, userId: user.id })
            : null,
        );
        // The matrix first, then the area summary: the net-vs-gross call needs
        // the area table sitting next to the unit table, not instead of it.
        const wanted = [...(picked.picks?.unitMatrix ?? []), ...(picked.picks?.areaSummary ?? [])];
        const keep = pages.filter(pg => wanted.includes(pg.page));
        if (keep.length) {
          contentText = keep.map(pg => pg.text).join('\n\n');
          pages       = keep;
          sheetsRead  = keep.map(pg => pg.page);
        }
      }
    } catch (e) {
      console.warn('[unit-matrix/parse] page re-read unavailable for', file.originalName, e?.message ?? e);
    }
  } else {
    throw jobError(422, { error: 'Unsupported file type' });
  }

  const apiKey = getAnthropicKey()?.trim();
  if (!apiKey) throw jobError(503, { error: 'ANTHROPIC_API_KEY not configured' });

  // Truncation, model choice, the prompt, code-fence stripping and shape
  // validation all live in the shared core now.
  // Recorded: see src/lib/agent/ledger.js. Deliberately a different task name
  // from the public intake route's call into the same helper, they share a
  // prompt but not a caller, and the rollup should be able to tell them apart.
  const client = wrapClient(new Anthropic({ apiKey }), 'unitMatrix.parse', { projectId, userId: user.id });
  const result = await parseUnitMatrix(contentText, file.originalName, client, { pages, projectId });
  if (!result.ok) {
    // Preserve the original error strings, UnitMatrixUpload.jsx branches on them.
    const error = result.code === 'extraction_failed' ? 'Extraction failed' : 'Could not parse extraction output';
    throw jobError(502, { error });
  }

  // ── The governance boundary ────────────────────────────────────────────────
  //
  // The unit matrix is the first extraction wired through Steps 16 to 18, and it is
  // the budget one on purpose: unit count and unit SF are upstream of every
  // dollar in a conceptual budget, so a quiet miss here is the most expensive
  // quiet miss the app can make.
  //
  // Note what is NOT being decided here. This feature is human-in-the-loop by
  // construction, nothing is written until somebody clicks "Apply to Project"
  // in the review modal, so we do not consult `shouldWrite`. What we want from
  // this call is the two things the modal cannot work out for itself: the
  // deterministic checks, shown to the reviewer at the moment they are deciding,
  // and a queue row whose verdict the commit route will sign. The click that was
  // already happening becomes the accuracy record.
  //
  // A store failure is not fatal here for the same reason: the human review
  // still happens. It costs the record, not the safety, so we log and continue
  // rather than blocking a parse the user is standing in front of.
  let review = null;
  try {
    const decision = await submitAgentOutput({
      taskType:      'extract.unitMatrix',
      feature:       'unit-matrix',
      promptVersion: EXTRACT_PROMPT_VERSION,
      model:         result.proposal.model,
      output:        result.proposal,
      confidence:    result.proposal.overallConfidence ?? null,
      // Hash + descriptor only. The drawing text itself is never stored.
      inputSummary:  JSON.stringify(summariseInput(contentText, file.originalName)),
      projectId:     projectId,
      userId:        user.id,
      sourceFileId:  fileId,
    });
    review = {
      runId:      decision.runId,
      stored:     decision.stored,
      checks:     decision.autoChecks?.checks ?? [],
      pass:       decision.autoChecks?.pass ?? null,
      tier:       decision.tier?.label ?? null,
      tierReason: decision.tier?.reason ?? null,
    };
  } catch (e) {
    // Governance must never be the reason an extraction fails to reach the user.
    console.error('[unit-matrix/parse] review submission failed:', e?.message || e);
  }

  // `sheetsRead` is null unless the sheet index narrowed a full set, the
  // review panel uses it to say which sheets the numbers came off.
  return { ...result.proposal, fileId, sheetsRead, review };
}
