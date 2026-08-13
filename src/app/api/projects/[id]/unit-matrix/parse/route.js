import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getAnthropicKey } from '@/lib/anthropicKey';
import Anthropic from '@anthropic-ai/sdk';
import { getProjectFileBuffer } from '@/lib/projectFileStorage';
// Shared with the public intake route (/api/intake/parse). The extraction
// prompt and model choice live in ONE place so the internal tool and the
// public tool can never disagree about the same document.
import { xlsxToText, parseUnitMatrix, extractPdfPages, EXTRACT_PROMPT_VERSION } from '@/lib/drawingExtract';
import { wrapClient } from '@/lib/agent/client';
import { submitAgentOutput } from '@/lib/agent/review';
import { summariseInput } from '@/lib/agent/untrusted';

async function canAccess(projectId, user) {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return false;
  return isSuperAdmin(user.role) || user.role === 'SUPER_ADMIN' || project.createdById === user.id;
}


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
  let pages = null;

  if (ext === 'xlsx' || ext === 'xls') {
    const buffer = await getProjectFileBuffer(file.storedPath);
    if (!buffer) return NextResponse.json({ error: 'File not found — it may have been deleted.' }, { status: 404 });
    contentText = await xlsxToText(buffer);
  } else if (ext === 'pdf') {
    // Use pre-extracted text from upload (textContent stored on file record)
    contentText = file.textContent;
    if (!contentText || contentText.trim().length < 30) {
      return NextResponse.json({ error: 'vision_not_supported' }, { status: 422 });
    }

    // Re-read the PDF from disk purely to recover PAGE BOUNDARIES.
    //
    // `textContent` is one flattened blob, and flattening is exactly what breaks
    // the net-vs-gross call: a full set contains the life-safety "ACTUAL AREA",
    // the room schedule's "AVG AREA" and sometimes a "GROSS SF" — all true, all
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
    } catch (e) {
      console.warn('[unit-matrix/parse] page re-read unavailable for', file.originalName, e?.message ?? e);
    }
  } else {
    return NextResponse.json({ error: 'Unsupported file type' }, { status: 422 });
  }

  const apiKey = getAnthropicKey()?.trim();
  if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 503 });

  // Truncation, model choice, the prompt, code-fence stripping and shape
  // validation all live in the shared core now.
  // Recorded: see src/lib/agent/ledger.js. Deliberately a different task name
  // from the public intake route's call into the same helper — they share a
  // prompt but not a caller, and the rollup should be able to tell them apart.
  const client = wrapClient(new Anthropic({ apiKey }), 'unitMatrix.parse', { projectId: params.id, userId: user.id });
  const result = await parseUnitMatrix(contentText, file.originalName, client, { pages, projectId: params.id });
  if (!result.ok) {
    // Preserve the original error strings — UnitMatrixUpload.jsx branches on them.
    const error = result.code === 'extraction_failed' ? 'Extraction failed' : 'Could not parse extraction output';
    return NextResponse.json({ error }, { status: 502 });
  }

  // ── The governance boundary ────────────────────────────────────────────────
  //
  // The unit matrix is the first extraction wired through Steps 16–18, and it is
  // the budget one on purpose: unit count and unit SF are upstream of every
  // dollar in a conceptual budget, so a quiet miss here is the most expensive
  // quiet miss the app can make.
  //
  // Note what is NOT being decided here. This feature is human-in-the-loop by
  // construction — nothing is written until somebody clicks "Apply to Project"
  // in the review modal — so we do not consult `shouldWrite`. What we want from
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
      projectId:     params.id,
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

  return NextResponse.json({ ...result.proposal, fileId, review });
}
