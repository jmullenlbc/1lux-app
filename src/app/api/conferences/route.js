import { NextResponse } from 'next/server';
import { requireAuth, isClientViewer } from '@/lib/auth';
import { canEditConferences, loadConferencePlan } from '@/lib/conferences/server';

export const dynamic = 'force-dynamic';

// GET /api/conferences: every event in the plan with its score, tier and cost,
// plus the scenario totals. The three Events tabs all read this one answer.
export async function GET() {
  const { user, error } = await requireAuth();
  if (error) return error;
  if (isClientViewer(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const data = await loadConferencePlan();
  return NextResponse.json({ ...data, canEdit: canEditConferences(user) });
}
