import { NextResponse } from 'next/server';
import { requireAuth, canSeeAllData, isClientViewer } from '@/lib/auth';
import { prisma } from '@/lib/db';

// The people from a client who are attached to this project. This is what makes
// a person's own deal counts possible: their open / won / lost / abandoned
// numbers are just the projects they are linked to, counted on read.
//
// Not to be confused with /api/projects/[id]/contacts, which is the outside
// portal-guest list (ProjectExternalContact), a different thing entirely.

async function canAccess(projectId, user) {
  const p = await prisma.project.findUnique({ where: { id: projectId } });
  if (!p) return null;
  if (!canSeeAllData(user) && p.createdById !== user.id) return null;
  return p;
}

const CONTACT_SELECT = {
  id: true, name: true, firstName: true, lastName: true, title: true,
  email: true, cellPhone: true, workPhone: true, department: true,
  // Where they work, both ways it can be recorded: the linked company and the
  // name somebody typed by hand. The screen needs both to tell "no employer at
  // all" apart from "typed but never linked" (Mike, 2026-09-09).
  clientId: true, company: true,
  client: { select: { id: true, name: true } },
};

export async function GET(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const project = await canAccess(params.id, user);
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const links = await prisma.projectContact.findMany({
    where: { projectId: params.id },
    orderBy: [{ isLead: 'desc' }, { createdAt: 'asc' }],
    include: { contact: { select: CONTACT_SELECT } },
  });

  return NextResponse.json({ links });
}

// POST, attach a person. { contactId, isLead }. Marking someone the lead
// stands the previous lead down, since a project has one Lead Person.
export async function POST(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  if (isClientViewer(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const project = await canAccess(params.id, user);
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { contactId, isLead = false } = await request.json();
  if (!contactId) return NextResponse.json({ error: 'contactId is required' }, { status: 400 });

  const contact = await prisma.contact.findUnique({ where: { id: contactId } });
  if (!contact) return NextResponse.json({ error: 'Person not found' }, { status: 404 });

  const link = await prisma.$transaction(async (tx) => {
    if (isLead) {
      await tx.projectContact.updateMany({
        where: { projectId: params.id, isLead: true },
        data:  { isLead: false },
      });
    }
    return tx.projectContact.upsert({
      where:  { projectId_contactId: { projectId: params.id, contactId } },
      update: { isLead: Boolean(isLead) },
      create: { projectId: params.id, contactId, isLead: Boolean(isLead) },
      include: { contact: { select: CONTACT_SELECT } },
    });
  });

  return NextResponse.json({ link }, { status: 201 });
}

// DELETE /api/projects/[id]/people?contactId=…, detach a person.
export async function DELETE(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  if (isClientViewer(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const project = await canAccess(params.id, user);
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const contactId = new URL(request.url).searchParams.get('contactId');
  if (!contactId) return NextResponse.json({ error: 'contactId is required' }, { status: 400 });

  await prisma.projectContact.deleteMany({ where: { projectId: params.id, contactId } });
  return NextResponse.json({ ok: true });
}
