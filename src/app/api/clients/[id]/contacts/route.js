import { NextResponse } from 'next/server';
import { requireAuth, canSeeAllData } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { splitName, joinName, isValidEmail } from '@/lib/crmClient';
import { nextContactNumber } from '@/lib/contactNumber';
import { cleanDepartment } from '@/lib/contactDepartments';

// Each person carries the projects they are attached to, so the page can work
// out their own open / won / lost / abandoned counts without storing them.
const PROJECT_LINK_INCLUDE = {
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

async function authorizeClient(clientId, user) {
  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) return { err: NextResponse.json({ error: 'Not found' }, { status: 404 }) };
  if (!canSeeAllData(user) && client.createdById !== user.id)
    return { err: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  return { client };
}

export async function GET(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const { err } = await authorizeClient(params.id, user);
  if (err) return err;

  const contacts = await prisma.contact.findMany({
    where: { clientId: params.id },
    orderBy: { createdAt: 'asc' },
    include: PROJECT_LINK_INCLUDE,
  });

  return NextResponse.json({ contacts });
}

export async function POST(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const { err } = await authorizeClient(params.id, user);
  if (err) return err;

  const {
    name, firstName, lastName, title, email, phone,
    cellPhone, workPhone, linkedInUrl, department,
  } = await request.json();

  // Either a full name or a first/last pair is enough — whichever the form sent,
  // both halves end up stored so search and mail-merge always have the parts.
  const fullName = String(name ?? '').trim() || joinName(firstName, lastName);
  if (!fullName) return NextResponse.json({ error: 'Name is required' }, { status: 400 });

  if (!isValidEmail(email)) {
    return NextResponse.json({ error: 'That email address does not look right' }, { status: 400 });
  }

  const parts = splitName(fullName);
  const work = workPhone !== undefined ? workPhone : phone;

  const contact = await prisma.contact.create({
    data: {
      contactNumber: await nextContactNumber(),
      clientId:  params.id,
      name:      fullName,
      firstName: (firstName ?? '').trim() || parts.firstName,
      lastName:  (lastName  ?? '').trim() || parts.lastName,
      title:      title       || null,
      email:      email       || null,
      phone:      work        || null,   // legacy column tracks the work number
      workPhone:  work        || null,
      cellPhone:  cellPhone   || null,
      linkedInUrl: linkedInUrl || null,
      department: cleanDepartment(department),
      createdById: user.id,
    },
    include: PROJECT_LINK_INCLUDE,
  });

  return NextResponse.json({ contact }, { status: 201 });
}
