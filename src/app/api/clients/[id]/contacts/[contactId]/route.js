import { NextResponse } from 'next/server';
import { requireAuth, canSeeAllData } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { archiveData, readArchivedFlag, deleteRefused, ARCHIVED_FLAG_HELP } from '@/lib/archive';
import { splitName, joinName, isValidEmail } from '@/lib/crmClient';
import { cleanDepartment } from '@/lib/contactDepartments';

const PROJECT_LINK_INCLUDE = {
  tagLinks: { include: { tag: { select: { id: true, name: true } } } },
  projectLinks: {
    where: { project: { archivedAt: null } },
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
    cellPhone, workPhone, linkedInUrl, department, tagIds,
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

  // tagIds replaces the person's tags (same as company tags).
  if (Array.isArray(tagIds)) {
    const ids = [...new Set(tagIds.map(String))];
    const real = ids.length ? await prisma.contactTag.findMany({ where: { id: { in: ids } }, select: { id: true } }) : [];
    await prisma.contactTagLink.deleteMany({ where: { contactId: contact.id } });
    if (real.length) await prisma.contactTagLink.createMany({ data: real.map(t => ({ contactId: contact.id, tagId: t.id })) });
  }

  const updated = await prisma.contact.update({
    where: { id: contact.id },
    data: {
      ...nameData,
      ...phoneData,
      ...(title       !== undefined && { title: title || null }),
      ...(email       !== undefined && { email: email || null }),
      ...(cellPhone   !== undefined && { cellPhone: cellPhone || null }),
      ...(linkedInUrl !== undefined && { linkedInUrl: linkedInUrl || null }),
      ...(department  !== undefined && { department: cleanDepartment(department) }),
    },
    include: PROJECT_LINK_INCLUDE,
  });

  return NextResponse.json({ contact: updated });
}

// DELETE, refused. People are archived, never deleted (Mike, 2026-09-11).
export async function DELETE() {
  return NextResponse.json({ error: deleteRefused('People') }, { status: 405 });
}

// POST /api/clients/[id]/contacts/[contactId]  { archived: true | false }
export async function POST(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const { err, contact } = await authorizeContact(params.id, params.contactId, user);
  if (err) return err;

  const archived = await readArchivedFlag(request);
  if (archived === null) return NextResponse.json({ error: ARCHIVED_FLAG_HELP }, { status: 400 });

  const updated = await prisma.contact.update({
    where:   { id: contact.id },
    data:    archiveData(archived, user),
    include: PROJECT_LINK_INCLUDE,
  });
  return NextResponse.json({ contact: updated });
}
