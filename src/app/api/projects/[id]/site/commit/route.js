import { NextResponse } from 'next/server';
import { requireAuth, canSeeAllData } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { writableSiteKeys } from '@/lib/siteFields';
import { getRun, recordVerdict, VERDICT } from '@/lib/agent/reviewStore';
import { describeSiteCorrection } from '@/lib/agent/siteDiff';

const WRITABLE = new Set(writableSiteKeys());

async function canAccess(projectId, user) {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return false;
  return canSeeAllData(user) || project.createdById === user.id;
}

export async function POST(request, { params }) {
  const { user, error } = await requireAuth(request);
  if (error) return error;
  if (!await canAccess(params.id, user)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { fileId = null, fields = {}, runId = null } = await request.json();

  // ── The allowlist is the boundary, not the UI ──────────────────────────────
  //
  // The panel only offers the site fields, but the panel is in a browser. The
  // set of columns this route may write is defined once in `siteFields.js` and
  // enforced here, so a crafted payload cannot use the site extractor as a
  // general-purpose writer into Project Info — most pointedly into `numUnits`,
  // which the unit matrix owns and a human has already signed off on.
  const write = {};
  const rejected = [];
  for (const [key, value] of Object.entries(fields)) {
    if (!WRITABLE.has(key)) { rejected.push(key); continue; }
    const n = Number(value);
    // A field ticked on with no number is a mistake, not an instruction to
    // blank the project. Blanking is done in Project Info, deliberately.
    if (value === null || value === '' || !Number.isFinite(n) || n < 0) continue;
    write[key] = n;
  }
  if (rejected.length) {
    console.warn(`[site/commit] ignored non-site field(s) in payload: ${rejected.join(', ')}`);
  }
  if (!Object.keys(write).length) {
    return NextResponse.json({ error: 'nothing_to_apply', message: 'No site fields were selected.' }, { status: 400 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.projectData.upsert({
      where:  { projectId: params.id },
      update: write,
      create: { projectId: params.id, ...write },
    });

    if (fileId) {
      await tx.projectFile.updateMany({
        where: { id: fileId, projectId: params.id },
        data:  { analysisData: JSON.stringify({ committedAt: new Date().toISOString(), siteFields: write }) },
      });
    }
  });

  // ── Sign the extraction ────────────────────────────────────────────────────
  //
  // Ticking boxes and pressing Apply IS the review. Recording it as a verdict is
  // what lets the trust tiers measure this task type from real work rather than
  // asking anyone to review the same drawing twice in /admin/agent-runs.
  //
  // Runs AFTER the transaction and never throws outward: the site data is saved
  // either way. A governance record that could roll back a successful save would
  // be a worse failure than a missing governance record.
  let verdict = null;
  if (runId) {
    try {
      const run = await getRun(runId);
      // The runId arrives from the browser, so it is checked against this project
      // before it can attach a verdict to somebody else's extraction.
      if (!run || run.projectId !== params.id) {
        console.warn(`[site/commit] runId ${runId} does not belong to project ${params.id} — no verdict recorded.`);
      } else {
        // Diffed against the model's ORIGINAL output as stored, not against
        // anything the client claims it changed.
        const diff = describeSiteCorrection(run.output, write);
        const res = await recordVerdict(runId, {
          verdict:    diff.changed ? VERDICT.CORRECTED : VERDICT.ACCEPTED,
          correction: diff.changed ? diff.summary : null,
          note:       `Applied to project. ${Object.keys(write).length} site field(s) written to Project Info.`,
          userId:     user.id,
        });
        verdict = res.ok
          ? { recorded: true, verdict: diff.changed ? VERDICT.CORRECTED : VERDICT.ACCEPTED, summary: diff.summary }
          : { recorded: false, error: res.error };
        if (!res.ok) console.warn(`[site/commit] verdict not recorded for ${runId}: ${res.error}`);
      }
    } catch (e) {
      console.error('[site/commit] verdict recording failed:', e?.message || e);
    }
  }

  const projectData = await prisma.projectData.findUnique({ where: { projectId: params.id } });
  return NextResponse.json({ ok: true, written: Object.keys(write), projectData, verdict });
}
