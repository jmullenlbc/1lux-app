import { NextResponse } from 'next/server';
import { requireAuth, isSuperAdmin } from '@/lib/auth';
import { listRuns, storeHealth, STATUS } from '@/lib/agent/reviewStore';
import { computeTier, TIER_LABEL } from '@/lib/agentTrust';
import { verdictHistory } from '@/lib/agent/reviewStore';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/agent-runs?status=AWAITING_REVIEW&taskType=…&limit=100
 *
 * The review queue — Step 17 of the Governed AI Layer.
 *
 * ── Super admin only, same reasoning as /api/admin/metrics ───────────────────
 * Every admin is ILC staff (Mike, 2026-09-14), but this is an engineering view:
 * it spans every project and client at once, and the rows carry AI-extracted
 * output from their documents. Gated on `isSuperAdmin` (SUPER_ADMIN | ILC_ADMIN).
 *
 * ── Why the store's health ships with the payload ────────────────────────────
 * An empty queue means either "nothing needs review" or "the AgentRun table does
 * not exist and the store is a stand-in that loses rows". Those look identical
 * in a list, and only one of them is good news. The UI states which.
 */
export async function GET(request) {
  const { user, error } = await requireAuth();
  if (error) return error;
  if (!isSuperAdmin(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const status   = searchParams.get('status') || STATUS.AWAITING_REVIEW;
  const taskType = searchParams.get('taskType') || null;
  const limit    = Math.min(Number(searchParams.get('limit')) || 100, 500);

  const [runs, health] = await Promise.all([
    listRuns({ status: status === 'ALL' ? null : status, taskType, limit }),
    storeHealth(),
  ]);

  // Tier per task type present in the queue. Computed server-side and sent as
  // plain data: `agentTrust.js` reaches node:crypto through the store, so a
  // client component importing it fails the webpack build outright.
  const taskTypes = [...new Set(runs.map(r => r.taskType))];
  const tiers = {};
  for (const t of taskTypes) {
    const versions = [...new Set(runs.filter(r => r.taskType === t).map(r => r.promptVersion || null))];
    for (const v of versions) {
      const info = computeTier(t, await verdictHistory(t, v, 50));
      tiers[`${t}@${v || 'unversioned'}`] = { ...info, label: TIER_LABEL[info.tier] };
    }
  }

  return NextResponse.json({
    runs: runs.map(r => ({
      id: r.id,
      taskType: r.taskType,
      feature: r.feature,
      model: r.model,
      promptVersion: r.promptVersion,
      projectId: r.projectId,
      createdAt: r.createdAt,
      status: r.status,
      verdict: r.verdict,
      correction: r.correction,
      confidence: r.confidence,
      inputSummary: r.inputSummary,
      output: r.output,
      citations: r.citations,
      autoChecks: r.autoChecks,
      autoCheckPass: r.autoCheckPass,
      latencyMs: r.latencyMs,
    })),
    tiers,
    health,
    counts: {
      awaitingReview: (await listRuns({ status: STATUS.AWAITING_REVIEW, limit: 500 })).length,
    },
  });
}
