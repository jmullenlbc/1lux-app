import { NextResponse } from 'next/server';
import { requireAuth, canSeeAllData } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { splitName, joinName, isValidEmail } from '@/lib/crmClient';

const PROJECT_LINK_INCLUDE = {
  projectLinks: {
    include: {
      project: {
        select: {
          id: true, name: true, projectNumber: true, serviceType: true,
          procurementStatus: true, procurementStatusReason: true,
          designStatus: true, designStatusReason: true,
        },
      },
    },
  },
};

async function authorizeContact(clientId, contactId, user) {
  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) return { err: NextResponse.json({ error: 'Not found' }, { status: 404 }) };
  if (!canSeeAllData(user) && client.createdById !== user.id)
    return { err: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  const contact = await prisma.contact.findFirst({ where: { id: contactId, clientId } });
  if (!contact) return { err: NextResponse.json({ error: 'Not found' }, { status: 404 }) };
  return { contact };
}

export async function PATCH(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const { err, contact } = await authorizeContact(params.id, params.contactId, user);
  if (err) return err;

  const {
    name, firstName, lastName, title, email, phone,
    cellPhone, workPhone, linkedInUrl, department,
  } = await request.json();

  if (name !== undefined && !name?.trim())
    return NextResponse.json({ error: 'Name is required' }, { status: 400 });

  if (email !== undefined && !isValidEmail(email)) {
    return NextResponse.json({ error: 'That email address does not look right' }, { status: 400 });
  }

  // Keep the full name and the two halves telling the same story: edit the full
  // name and it re-splits; edit either half and the full name is rebuilt.
  const nameData = {};
  if (name !== undefined) {
    nameData.name = name.trim();
    const parts = splitName(nameData.name);
    if (firstName === undefined) nameData.firstName = parts.firstName;
    if (lastName  === undefined) nameData.lastName  = parts.lastName;
  }
  if (firstName !== undefined) nameData.firstName = (firstName || '').trim() || null;
  if (lastName  !== undefined) nameData.lastName  = (lastName  || '').trim() || null;
  if (name === undefined && (firstName !== undefined || lastName !== undefined)) {
    const rebuilt = joinName(
      firstName !== undefined ? firstName : contact.firstName,
      lastName  !== undefined ? lastName  : contact.lastName,
    );
    if (rebuilt) nameData.name = rebuilt;
  }

  // The work number and the legacy `phone` column are the same number.
  const phoneData = {};
  if (workPhone !== undefined) { phoneData.workPhone = workPhone || null; phoneData.phone = workPhone || null; }
  else if (phone !== undefined) { phoneData.phone = phone || null; phoneData.workPhone = phone || null; }

  const updated = await prisma.contact.update({
    where: { id: contact.id },
    data: {
      ...nameData,
      ...phoneData,
      ...(title       !== undefined && { title: title || null }),
      ...(email       !== undefined && { email: email || null }),
      ...(cellPhone   !== undefined && { cellPhone: cellPhone || null }),
      ...(linkedInUrl !== undefined && { linkedInUrl: linkedInUrl || null }),
      ...(department  !== undefined && { department: department || null }),
    },
    include: PROJECT_LINK_INCLUDE,
  });

  return NextResponse.json({ contact: updated });
}

export async function DELETE(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const { err, contact } = await authorizeContact(params.id, params.contactId, user);
  if (err) return err;

  await prisma.contact.delete({ where: { id: contact.id } });
  return NextResponse.json({ ok: true });
}
