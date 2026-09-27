import { NextResponse } from 'next/server';
import { requireAuth, isClientViewer, actsAsAdmin } from '@/lib/auth';
import { addPersonToMeeting, skipMeetingPeople } from '@/lib/desk/meetingPeople';

// POST { do: 'add', contactId } | { do: 'skip' }: a meeting on My Desk whose
// guests are not in the CRM. 'add' puts a person on it (and, once published,
// writes their follow-up email for review; nothing sends). 'skip' = nobody to add.
export async function POST(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  if (isClientViewer(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const opts = { isAdmin: actsAsAdmin(user) };
  const out = body.do === 'add' && body.contactId ? await addPersonToMeeting(user, params.noteId, body.contactId, opts)
    : body.do === 'skip' ? await skipMeetingPeople(user, params.noteId, opts)
    : { error: 'Unknown action', status: 400 };
  if (out.error) return NextResponse.json({ error: out.error }, { status: out.status });
  return NextResponse.json(out);
}
