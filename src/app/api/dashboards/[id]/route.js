import { NextResponse } from 'next/server';
import { requireAuth, actsAsAdmin } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

async function canEdit(dash, user) {
  if (!dash) return false;
  if (dash.ownerUserId === user.id) return true;          // own personal
  if (dash.ownerUserId === null && actsAsAdmin(user)) return true; // admin default
  return false;
}

// PATCH /api/dashboards/[id] { name }
export async function PATCH(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const dash = await prisma.dashboard.findUnique({ where: { id: params.id } });
  if (!await canEdit(dash, user)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { name } = await request.json().catch(() => ({}));
  const updated = await prisma.dashboard.update({
    where: { id: params.id },
    data: { ...(name !== undefined && { name }) },
    include: { widgets: { orderBy: { position: 'asc' } } },
  });
  return NextResponse.json({ dashboard: updated });
}

// DELETE /api/dashboards/[id] — deletes a personal copy (= "reset to default"),
// or an admin deletes a default.
export async function DELETE(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const dash = await prisma.dashboard.findUnique({ where: { id: params.id } });
  if (!await canEdit(dash, user)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  await prisma.dashboard.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
