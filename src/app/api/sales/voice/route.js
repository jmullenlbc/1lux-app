import { NextResponse } from 'next/server';
import { requireAuth, isSalesAdmin } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { addVoiceBatch, cleanEmails } from '@/lib/tone/library';
import { SOURCES, whoseLibrary, libraryState } from '@/lib/tone/voiceApi';

// Voice Training (Mike 9-26): each salesperson uploads batches of their own
// emails so the bot learns their tone, words, phrases and subject lines.
// Everyone works on their own library; a Sales Admin can pick anyone's.

// GET /api/sales/voice?userId=
export async function GET(request) {
  const { user, error } = await requireAuth(request);
  if (error) return error;
  const who = whoseLibrary(user, new URL(request.url).searchParams.get('userId'));
  if (who.error) return who.error;
  const admin = isSalesAdmin(user);
  const people = admin
    ? await prisma.user.findMany({ where: { isActive: true }, orderBy: { name: 'asc' }, select: { id: true, name: true, email: true } })
    : [];
  return NextResponse.json({ me: user.id, canPickAnyone: admin, people, ...(await libraryState(who.userId)) });
}

// POST /api/sales/voice  { userId?, fileName, source, emails: [{subject, body, date}] }
// The browser reads the files and sends only the words, in chunks, then calls
// /api/sales/voice/rebuild once (parked: the model call can pass 30 seconds).
export async function POST(request) {
  const { user, error } = await requireAuth(request);
  if (error) return error;
  const b = await request.json().catch(() => ({}));
  const who = whoseLibrary(user, b.userId);
  if (who.error) return who.error;
  const source = SOURCES.has(b.source) ? b.source : 'TEXT';
  const emails = cleanEmails(b.emails);

  let added = 0, skipped = 0;
  if (emails.length) {
    ({ added, skipped } = await addVoiceBatch({ userId: who.userId, uploadedById: user.id, fileName: b.fileName, source, emails }));
  }
  return NextResponse.json({ added, skipped, ...(await libraryState(who.userId)) });
}
