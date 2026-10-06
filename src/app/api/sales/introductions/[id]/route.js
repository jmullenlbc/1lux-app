import { NextResponse } from 'next/server';
import { requireAuth, isClientViewer } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { quickContact } from '@/lib/crm/quickContact';

export const dynamic = 'force-dynamic';

// PATCH /api/sales/introductions/[id]  { do: 'confirm' | 'dismiss' | 'addContact' }
//   confirm    = CONFIRMED, and the Contact is made if there is none yet
//   dismiss    = DISMISSED ("Not an intro")
//   addContact = make the Contact only, the row stays NEW
export async function PATCH(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  if (isClientViewer(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const action = body?.do;
  if (!['confirm', 'dismiss', 'addContact'].includes(action)) {
    return NextResponse.json({ error: 'Say what to do: confirm, dismiss or addContact.' }, { status: 400 });
  }

  const row = await prisma.introduction.findUnique({ where: { id: params.id } });
  if (!row || row.archivedAt) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (action === 'dismiss') {
    const updated = await prisma.introduction.update({
      where: { id: row.id },
      data:  { status: 'DISMISSED', confirmedById: user.id, confirmedAt: new Date() },
    });
    return NextResponse.json({ introduction: updated });
  }

  let contactId = row.introducedContactId;
  let created = false;
  if (!contactId) {
    const made = await quickContact(prisma, {
      email: row.introducedEmail, name: row.introducedName, clientId: row.clientId, ownerId: user.id, createdById: user.id,
    });
    contactId = made.contact.id;
    created = made.created;
  }

  const data = { introducedContactId: contactId };
  if (action === 'confirm') Object.assign(data, { status: 'CONFIRMED', confirmedById: user.id, confirmedAt: new Date() });
  const updated = await prisma.introduction.update({ where: { id: row.id }, data });

  // LinkedIn (G5): NoteAction needs a note to hang on and an introduction has
  // none, so the "Look up on LinkedIn" step is not made here. The contact's
  // card has the LinkedIn field; the type exists for notes that mention it.
  return NextResponse.json({ introduction: updated, contactId, created });
}
