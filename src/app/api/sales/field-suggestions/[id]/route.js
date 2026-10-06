import { NextResponse } from 'next/server';
import { requireAuth, isClientViewer } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { FIELD_TO_COLUMN } from '@/lib/email/signatureApply';

export const dynamic = 'force-dynamic';

// PATCH /api/sales/field-suggestions/[id]  { do: 'accept' | 'reject' }
// accept writes the value onto the person's card; reject keeps ours.
export async function PATCH(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  if (isClientViewer(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const action = body?.do;
  if (!['accept', 'reject'].includes(action)) {
    return NextResponse.json({ error: 'Say what to do: accept or reject.' }, { status: 400 });
  }

  const row = await prisma.contactFieldSuggestion.findUnique({ where: { id: params.id } });
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (row.status !== 'PENDING') return NextResponse.json({ error: 'Already decided.' }, { status: 409 });

  if (action === 'accept') {
    const column = FIELD_TO_COLUMN[row.field];
    if (column) {
      const data = { [column]: row.suggestedValue };
      if (column === 'workPhone') data.phone = row.suggestedValue; // legacy column kept in sync
      await prisma.contact.update({ where: { id: row.contactId }, data });
    } else if (row.field === 'website') {
      // No website on a person; it goes on their company when that is blank.
      const c = await prisma.contact.findUnique({ where: { id: row.contactId }, select: { clientId: true, client: { select: { website: true } } } });
      if (c?.clientId && !c.client?.website) await prisma.client.update({ where: { id: c.clientId }, data: { website: row.suggestedValue } });
    }
  }

  const updated = await prisma.contactFieldSuggestion.update({
    where: { id: row.id },
    data:  { status: action === 'accept' ? 'ACCEPTED' : 'REJECTED', decidedById: user.id, decidedAt: new Date() },
  });
  return NextResponse.json({ suggestion: updated });
}
