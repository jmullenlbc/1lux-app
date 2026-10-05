import { NextResponse } from 'next/server';
import { requireAuth, isClientViewer } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { logActivity } from '@/lib/activity';
import { notifyUsers } from '@/lib/alerts';
import { inDepartment, SALES_MARKETING } from '@/lib/departments';

export const dynamic = 'force-dynamic';

// POST { userId? }: "Take it" (no userId) or "Give to" a Sales person, for a
// web budget project nobody owns yet (0117). Never takes one already owned.
export async function POST(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  if (isClientViewer(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const body = await request.json().catch(() => ({}));

  let to = { id: user.id, name: user.name };
  if (body?.userId && body.userId !== user.id) {
    const picked = await prisma.user.findFirst({
      where: { id: String(body.userId), isActive: true, ...inDepartment(SALES_MARKETING) },
      select: { id: true, name: true },
    });
    if (!picked) return NextResponse.json({ error: 'Pick somebody in Sales.' }, { status: 400 });
    to = picked;
  }

  const claim = await prisma.project.updateMany({
    where: { id: params.projectId, salesOwnerId: null },
    data: { salesOwnerId: to.id },
  });
  if (claim.count !== 1) return NextResponse.json({ error: 'Somebody already has this one.' }, { status: 409 });

  const project = await prisma.project.findUnique({ where: { id: params.projectId }, select: { id: true, name: true } });
  await logActivity(project.id, user, 'project_owner',
    to.id === user.id ? `${user.name} took this web budget from the pool.` : `${user.name} gave this web budget to ${to.name}.`,
    { source: 'desk-pool', salesOwnerId: to.id });
  if (to.id !== user.id) {
    await notifyUsers([to.id], {
      type: 'PROJECT_ASSIGNED',
      title: `Web budget for you: ${project.name}`,
      message: `${user.name} gave you this web budget from the pool.`,
      link: `/project/${project.id}`,
      dedupeKey: `pool-assigned:${project.id}:${to.id}`,
    }, { db: prisma });
  }
  return NextResponse.json({ ok: true, salesOwnerId: to.id });
}
