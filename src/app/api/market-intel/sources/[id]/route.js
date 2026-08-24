import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function PATCH(request, { params }) {
  const session = await getSession();
  if (!user || (user.role !== 'ILC_ADMIN' && user.role !== 'SUPER_ADMIN')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const data = {};
  if (body.isActive         !== undefined) data.isActive         = body.isActive;
  if (body.pollingFrequency !== undefined) data.pollingFrequency = body.pollingFrequency;
  if (body.notes            !== undefined) data.notes            = body.notes;

  const source = await prisma.marketSource.update({ where: { id: params.id }, data });
  return NextResponse.json(source);
}

export async function DELETE(request, { params }) {
  const session = await getSession();
  if (!user || (user.role !== 'ILC_ADMIN' && user.role !== 'SUPER_ADMIN')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  await prisma.marketSource.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
