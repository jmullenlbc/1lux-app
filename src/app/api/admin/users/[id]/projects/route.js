import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
import { isClientViewer } from '@/lib/auth';
import { canManageAccount } from '@/lib/roles';
import { effectiveRole } from '@/lib/permissions';
import { grantedProjectIds, setProjectAccess } from '@/lib/projectScope';

// Which jobs one Client Viewer has been handed.
//
// `ProjectAccess` has existed since the first migration and nothing ever wrote
// to it, so a Client Viewer could only ever see jobs they created, and they
// cannot create jobs. This route is the missing half.

async function guard(request, params) {
  const { user: actor, error } = await requireAdmin(request);
  if (error) return { error };

  const target = await prisma.user.findUnique({
    where:  { id: params.id },
    select: { id: true, role: true, name: true },
  });
  if (!target) return { error: NextResponse.json({ error: 'User not found' }, { status: 404 }) };

  if (!canManageAccount(effectiveRole(actor), target.role)) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { actor, target };
}

export async function GET(request, { params }) {
  const { actor, target, error } = await guard(request, params);
  if (error) return error;
  void actor;

  const projectIds = await grantedProjectIds(prisma, target.id);
  return NextResponse.json({ projectIds });
}

// PUT, replace the whole list. Body: { projectIds: string[] }
export async function PUT(request, { params }) {
  const { actor, target, error } = await guard(request, params);
  if (error) return error;

  // Staff already see every job, so handing one over would mean nothing. Say so
  // instead of writing rows that do nothing.
  if (!isClientViewer(target.role)) {
    return NextResponse.json(
      { error: 'Only a Client Viewer is given specific jobs. Everyone on staff already sees them all.' },
      { status: 400 },
    );
  }

  const body = await request.json().catch(() => ({}));
  if (!Array.isArray(body.projectIds)) {
    return NextResponse.json({ error: 'projectIds must be a list' }, { status: 400 });
  }

  // Ignore ids that aren't real jobs rather than failing the whole save.
  const wanted = await prisma.project.findMany({
    where:  { id: { in: body.projectIds.filter(Boolean) } },
    select: { id: true },
  });

  const { added, removed, total } = await setProjectAccess(prisma, target.id, wanted.map(p => p.id));

  // Names for the history line. Both sides of the change, because a job taken
  // back is not in the list that was just sent.
  const touched = await prisma.project.findMany({
    where:  { id: { in: [...added, ...removed] } },
    select: { id: true, name: true, projectNumber: true },
  });
  const nameById = Object.fromEntries(
    touched.map(p => [p.id, p.projectNumber ? `#${p.projectNumber} ${p.name}` : p.name]),
  );

  // One access-history line per job handed over or taken back. A silent grant
  // is exactly the kind of thing nobody notices until it matters.
  const rows = [
    ...added.map(id   => ({ kind: 'PROJECT_ACCESS', field: id, fromValue: null,            toValue: nameById[id] || id })),
    ...removed.map(id => ({ kind: 'PROJECT_ACCESS', field: id, fromValue: nameById[id] || id, toValue: null })),
  ];
  if (rows.length) {
    await prisma.userAccessEvent.createMany({
      data: rows.map(r => ({ ...r, userId: target.id, changedById: actor.id })),
    });
  }

  const projectIds = await grantedProjectIds(prisma, target.id);
  return NextResponse.json({ projectIds, added: added.length, removed: removed.length, total });
}
