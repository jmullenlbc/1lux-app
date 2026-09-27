import { NextResponse } from 'next/server';
import { requireAuth, isClientViewer } from '@/lib/auth';
import { takeContact } from '@/lib/checkIns/checkInDrafts';

// POST: "Take them" on My Desk. The asker now looks after a person nobody owned,
// and their due check-in email is written for review (nothing sends).
export async function POST(_request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  if (isClientViewer(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const out = await takeContact(params.contactId, user.id);
  if (out.error) return NextResponse.json({ error: out.error }, { status: out.status });
  return NextResponse.json(out);
}
