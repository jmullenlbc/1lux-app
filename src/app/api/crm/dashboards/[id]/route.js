import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import db from '@/lib/db';

// PATCH /api/crm/dashboards/[id]
export async function PATCH(request, { params }) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  try {
    const { name, isDefault } = await request.json();
    const data = {};
    if (name !== undefined) data.name = name.trim();
    if (isDefault !== undefined) data.isDefault = isDefault;

    const dashboard = await db.dashboard.update({
      where: { id: params.id },
      data,
      include: { widgets: { orderBy: { position: 'asc' } } },
    });
    return NextResponse.json(dashboard);
  } catch (err) {
    console.error('[dashboard PATCH]', err?.message ?? err);
    return NextResponse.json({ error: 'Failed to update dashboard' }, { status: 500 });
  }
}

// DELETE /api/crm/dashboards/[id]
export async function DELETE(request, { params }) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  try {
    await db.dashboard.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[dashboard DELETE]', err?.message ?? err);
    return NextResponse.json({ error: 'Failed to delete dashboard' }, { status: 500 });
  }
}
