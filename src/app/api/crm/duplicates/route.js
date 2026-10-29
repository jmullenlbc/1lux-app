import { NextResponse } from 'next/server';
import { requireAuth, isClientViewer } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { findCrmDuplicates, recordDifferent, mergeClients, mergeContacts } from '@/lib/crmMerge';

export const dynamic = 'force-dynamic';

// GET  the open "Same company?" / "Same person?" questions about records
//      already in the CRM (My Desk, Pool tab).
export async function GET() {
  const { user, error } = await requireAuth();
  if (error) return error;
  if (isClientViewer(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  return NextResponse.json(await findCrmDuplicates(prisma));
}

// POST { kind: 'client'|'contact', keepId, otherId, answer: 'same'|'different' }
// same = merge into keepId and archive the other. Archive only, never delete.
export async function POST(request) {
  const { user, error } = await requireAuth();
  if (error) return error;
  if (isClientViewer(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { kind, keepId, otherId, answer } = await request.json().catch(() => ({}));
  if (!['client', 'contact'].includes(kind) || !keepId || !otherId || keepId === otherId || !['same', 'different'].includes(answer)) {
    return NextResponse.json({ error: 'The answer was missing a piece, a problem on our side. Nothing was changed. Reload My Desk and try again. (MERGE_BAD_REQUEST)' }, { status: 400 });
  }
  if (answer === 'different') {
    await recordDifferent(prisma, kind, keepId, otherId, user);
    return NextResponse.json({ ok: true });
  }
  try {
    const moved = kind === 'client'
      ? await mergeClients(prisma, keepId, otherId, user)
      : await mergeContacts(prisma, keepId, otherId, user);
    return NextResponse.json({ ok: true, moved });
  } catch (e) {
    if (e.message === 'MERGE_GONE') {
      return NextResponse.json({ error: 'One of the two was already archived or merged by someone else. Nothing was changed. Reload My Desk. (MERGE_GONE)' }, { status: 409 });
    }
    console.error('[crm/duplicates] merge failed', e);
    return NextResponse.json({ error: 'The merge stopped partway on our side and was rolled back, so nothing was changed. Try again; if it fails twice, report a bug. (MERGE_FAILED)' }, { status: 500 });
  }
}
