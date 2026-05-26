import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';

// PATCH /api/placed-fixtures/[id]
export async function PATCH(req, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const body = await req.json();
  const { status, x, y, x2, y2, note, master_type_id } = body;

  const existing = await prisma.placedFixture.findUnique({ where: { id: params.id } });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const data = {};
  if (x  != null)             data.x             = x;
  if (y  != null)             data.y             = y;
  if (x2 != null)             data.x2            = x2;
  if (y2 != null)             data.y2            = y2;
  if (note != null)           data.note          = note;
  if (master_type_id)         data.master_type_id = master_type_id;
  if (status) {
    data.status = status;
    if (status === 'CONFIRMED') {
      data.confirmedById = user.id;
      data.confirmed_at  = new Date();
    }
  }

  const fixture = await prisma.placedFixture.update({
    where: { id: params.id },
    data,
  });

  return NextResponse.json(fixture);
}

// DELETE /api/placed-fixtures/[id]
export async function DELETE(req, { params }) {
  const { error } = await requireAuth();
  if (error) return error;

  await prisma.placedFixture.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
