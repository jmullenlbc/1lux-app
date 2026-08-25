import { NextResponse } from 'next/server';
import { requireAuth, canSeeAllData } from '@/lib/auth';
import { prisma } from '@/lib/db';

async function canAccess(projectId, user) {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return false;
  return canSeeAllData(user) || project.createdById === user.id;
}

export async function GET(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  if (!await canAccess(params.id, user)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const assignees = await prisma.projectAssignee.findMany({
    where: { projectId: params.id },
    include: { user: { select: { id: true, name: true, email: true } } },
  });

  return NextResponse.json({ assignees: assignees.map(a => a.user) });
}

export async function POST(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  if (!await canAccess(params.id, user)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { userId } = await request.json();
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });

  await prisma.projectAssignee.upsert({
    where: { projectId_userId: { projectId: params.id, userId } },
    create: { projectId: params.id, userId },
    update: {},
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  if (!await canAccess(params.id, user)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { userId } = await request.json();
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });

  await prisma.projectAssignee.deleteMany({
    where: { projectId: params.id, userId },
  });

  return NextResponse.json({ ok: true });
}
