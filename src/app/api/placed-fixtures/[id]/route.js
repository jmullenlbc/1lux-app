import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';

// PATCH /api/placed-fixtures/[id]
export async function PATCH(req, { params }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { status, x, y, note, type_code } = body;

  const existing = await prisma.placedFixture.findUnique({ where: { id: params.id } });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const data = {};
  if (x != null)    data.x    = x;
  if (y != null)    data.y    = y;
  if (note != null) data.note = note;
  if (type_code !== undefined) data.type_code = type_code;
  if (status) {
    data.status = status;
    if (status === 'CONFIRMED') {
      data.confirmedById = session.id;
      data.confirmed_at  = new Date();
    }
  }

  const fixture = await prisma.placedFixture.update({
    where: { id: params.id },
    data,
    include: { masterType: { select: { code: true, fixture_family: true, symbol_svg: true } } },
  });

  return NextResponse.json(fixture);
}

// DELETE /api/placed-fixtures/[id]
export async function DELETE(req, { params }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  await prisma.placedFixture.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
