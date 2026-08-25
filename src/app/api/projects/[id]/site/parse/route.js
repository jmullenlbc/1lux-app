import { NextResponse } from 'next/server';
import { getProjectFileBuffer } from '@/lib/projectFileStorage';
import Anthropic from '@anthropic-ai/sdk';
import { requireAuth, canSeeAllData } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getAnthropicKey } from '@/lib/anthropicKey';
import { renderPdfPages, extractSiteData, SITE_VISION_PROMPT_VERSION } from '@/lib/siteVision';
import { extractPdfPages } from '@/lib/drawingExtract';
import { buildSheetIndex, pickKeySheets, pagesToRender, SET_PAGE_THRESHOLD } from '@/lib/sheetIndex';
import { proposeSiteFields } from '@/lib/siteFields';
import { wrapClient } from '@/lib/agent/client';
import { submitAgentOutput } from '@/lib/agent/review';
import { summariseInput } from '@/lib/agent/untrusted';

/**
 * Fallback only, for a PDF with no readable text layer to index.
 * A site plan exported on its own is one sheet; a cover sheet sometimes carries
 * the data block. When the file HAS text, the sheet index decides instead.
 */
const DEFAULT_PAGES = 1;
const MAX_PAGES = 3;

/**
 * Two sheets, not three. The site plan and the area summary are where the
 * written site data lives, and every page kept is a page rendered and paid for
 * by the pixel. Same cap the public intake route uses.
 */
const SHEETS_TO_READ = 2;

async function canAccess(projectId, user) {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return false;
  return canSeeAllData(user) || project.createdById === user.id;
}

export async function POST(request, { params }) {
  const { user, error } = await requireAuth(request);
  if (error) return error;
  if (!await canAccess(params.id, user)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { fileId, pages } = await request.json();
  if (!fileId) return NextResponse.json({ error: 'fileId required' }, { status: 400 });

  const file = await prisma.projectFile.findFirst({ where: { id: fileId, projectId: params.id } });
  if (!file) return NextResponse.json({ error: 'File not found' }, { status: 404 });

  const ext = file.originalName.split('.').pop()?.toLowerCase();
  if (ext !== 'pdf') {
    return NextResponse.json({
      error: 'unsupported_type',
      message: 'Site data is read from a PDF site plan. Please upload the site or concept plan as a PDF.',
    }, { status: 422 });
  }

  const apiKey = getAnthropicKey()?.trim();
  if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 503 });

  const client = (task) =>
    wrapClient(new Anthropic({ apiKey }), task, { projectId: params.id, userId: user.id });

  let images;
  let sheetsRead = null;
  try {
    // Files live in S3 in prod (project-files/ prefix) and on disk in dev.
    // Reading the Lambda's own disk here found nothing once storage moved.
    const buffer = await getProjectFileBuffer(file.storedPath);
    if (!buffer) {
      return NextResponse.json({
        error: 'render_failed',
        message: 'That file is no longer available. Re-upload the site plan and try again.',
      }, { status: 404 });
    }

    // ── Which sheets are worth opening ──
    //
    // This route used to render from the FRONT of the file, which is right for
    // a site plan somebody exported on its own and wrong for everything else.
    // Hand it a real drawing set and page 1 is a title page with a vicinity map
    // on it; the site plan is somewhere around page 30 and nothing was looking
    // there. The public intake route has read the sheet index since it was
    // written — this is the same jump, finally wired into the in-app tool.
    //
    // An explicit `pages` from the caller still wins: someone who has opened
    // the PDF and knows which sheet they want should not be argued with.
    let chosenPages = [];
    if (!pages) {
      const scan = await extractPdfPages(buffer).catch(() => ({ pages: [] }));
      const pageScan = scan.pages ?? [];
      if (pageScan.length) {
        // The model is only paid for when there is actually a set to index.
        // Below the threshold the free deterministic scan answers on its own.
        const picked = await pickKeySheets(
          buildSheetIndex(pageScan),
          pageScan.length > SET_PAGE_THRESHOLD ? client('site.sheetPick') : null,
        );
        chosenPages = pagesToRender(picked.picks, { max: SHEETS_TO_READ });
      }
    }

    images = chosenPages.length
      ? await renderPdfPages(buffer, { pageNumbers: chosenPages, pages: chosenPages.length })
      : await renderPdfPages(buffer, {
          pages: Math.min(Math.max(Number(pages) || DEFAULT_PAGES, 1), MAX_PAGES),
        });
    sheetsRead = chosenPages.length ? chosenPages : null;
  } catch (e) {
    console.error('[site/parse] could not render', file.originalName, e?.message || e);
    return NextResponse.json({ error: 'render_failed', message: 'Could not open that PDF.' }, { status: 502 });
  }
  if (!images.length) {
    return NextResponse.json({ error: 'render_failed', message: 'That PDF has no pages to read.' }, { status: 422 });
  }

  const vision = await extractSiteData(images, client('site.vision'));
  if (!vision.ok) {
    return NextResponse.json({ error: vision.code, message: vision.message }, { status: 502 });
  }

  // ── The reconciliation that makes this extraction worth governing ───────────
  //
  // The project's existing data is loaded for two different reasons, and it
  // matters that they are different. `projectUnits` goes into the CHECKS: a
  // unit count a human already accepted off the unit matrix is the strongest
  // thing on this project to grade a site plan's "324 D.U." against. `current`
  // goes into the DISPLAY: it lets the panel show what each proposal would
  // replace, so overwriting a number somebody typed is a visible decision
  // rather than a silent one.
  const current = await prisma.projectData.findUnique({ where: { projectId: params.id } });

  let review = null;
  try {
    const decision = await submitAgentOutput({
      taskType:      'extract.siteParking',
      feature:       'site-vision',
      promptVersion: SITE_VISION_PROMPT_VERSION,
      model:         vision.data.model,
      output:        vision.data,
      confidence:    vision.data.confidence ?? null,
      // Hash of the rendered page bytes plus a descriptor. The drawing itself is
      // never stored on the run.
      inputSummary:  summariseInput(images[0].png, `${file.originalName} p${images[0].page ?? 1} @${images[0].width}x${images[0].height}`),
      context:       { projectUnits: current?.numUnits ?? null },
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
    // This flow is human-in-the-loop by construction — nothing is written until
    // somebody ticks boxes and presses Apply — so a lost review row costs the
    // accuracy record, not the safety.
    console.error('[site/parse] review submission failed:', e?.message || e);
  }

  return NextResponse.json({
    fileId,
    fileName: file.originalName,
    pagesRead: images.length,
    // Which sheets the index sent us to, so the panel can say "read from C1.0"
    // rather than leaving the reviewer to guess. Null when the file had no text
    // layer to index and we fell back to the front of the document.
    sheetsRead,
    site: vision.data,
    // What the reader may write, already translated into Project Info's
    // vocabulary and paired with what it would replace.
    proposal: proposeSiteFields(vision.data, current),
    review,
  });
}
