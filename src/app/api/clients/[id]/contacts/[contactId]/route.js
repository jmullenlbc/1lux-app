import { NextResponse } from 'next/server';
import { requireAuth, canSeeAllData } from '@/lib/auth';
import { prisma } from '@/lib/db';

async function authorizeContact(clientId, contactId, user) {
  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) return { err: NextResponse.json({ error: 'Not found' }, { status: 404 }) };
  if (!canSeeAllData(user) && client.createdById !== user.id)
    return { err: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  const contact = await prisma.clientContact.findFirst({ where: { id: contactId, clientId } });
  if (!contact) return { err: NextResponse.json({ error: 'Not found' }, { status: 404 }) };
  return { contact };
}

export async function PATCH(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const { err, contact } = await authorizeContact(params.id, params.contactId, user);
  if (err) return err;

  const { name, title, email, phone, department } = await request.json();
  if (name !== undefined && !name?.trim())
    return NextResponse.json({ error: 'Name is required' }, { status: 400 });

  const updated = await prisma.clientContact.update({
    where: { id: contact.id },
    data: {
      ...(name       !== undefined && { name: name.trim() }),
      ...(title      !== undefined && { title: title || null }),
      ...(email      !== undefined && { email: email || null }),
      ...(phone      !== undefined && { phone: phone || null }),
      ...(department !== undefined && { department: department || null }),
    },
  });

  return NextResponse.json({ contact: updated });
}

export async function DELETE(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const { err, contact } = await authorizeContact(params.id, params.contactId, user);
  if (err) return err;

  await prisma.clientContact.delete({ where: { id: contact.id } });
  return NextResponse.json({ ok: true });
}
