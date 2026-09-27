import { NextResponse } from 'next/server';
import { requireAuth, isClientViewer } from '@/lib/auth';
import { draftCheckInFor } from '@/lib/checkIns/checkInDrafts';

// POST: "Write email" on a My Desk check-in. The email lands on the asker's desk
// for review; nothing is sent. One already waiting for that person comes back instead.
export async function POST(_request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  if (isClientViewer(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const out = await draftCheckInFor(params.contactId, user.id);
  if (out.error) return NextResponse.json({ error: out.error }, { status: out.status });
  return NextResponse.json(out);
}
