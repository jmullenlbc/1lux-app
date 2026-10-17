import { NextResponse } from 'next/server';
import { requireAuth, isSuperAdmin } from '@/lib/auth';
import { recordVerdict, getRun, VERDICT } from '@/lib/agent/reviewStore';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/agent-runs/[id]/verdict
 * body: { verdict: 'accepted'|'corrected'|'rejected', correction?, note? }
 *
 * A human signs one AI run, Step 17 of the Governed AI Layer.
 *
 * ── The verdict is the product, not the button ───────────────────────────────
 * These rows are what Step 18 computes trust from, so this endpoint is the point
 * where an accuracy record gets written. Three things follow from that and are
 * enforced in the store rather than here, so they hold for every caller:
 *
 *   - a verdict is write-once (no quietly re-signing a run later),
 *   - "corrected" must say what changed (an empty correction teaches nothing,
 *     and it is the easiest button to click by reflex),
 *   - the signer's id and the time are recorded.
 *
 * The endpoint's own job is the identity: `userId` comes from the session, never
 * from the request body. A client-supplied signer would make the whole record
 * worth exactly nothing.
 */
export async function POST(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  if (!isSuperAdmin(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { verdict, correction, note } = body || {};
  if (!Object.values(VERDICT).includes(verdict)) {
    return NextResponse.json(
      { error: `verdict must be one of: ${Object.values(VERDICT).join(', ')}` },
      { status: 400 },
    );
  }

  const res = await recordVerdict(params.id, {
    verdict, correction, note,
    userId: user.id,          // the session, never the body
  });

  if (!res.ok) {
    // "already reviewed" is a conflict, not a client error, two reviewers
    // opening the same queue is ordinary, and the UI should say so plainly
    // rather than showing a validation error.
    const status = /already reviewed/.test(res.error) ? 409
                 : /no such run/.test(res.error)      ? 404
                 : 400;
    return NextResponse.json({ error: res.error }, { status });
  }

  return NextResponse.json({ ok: true, run: await getRun(params.id) });
}
