import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function PATCH(req, { params }) {
  const { user, error } = await requireAuth(request);
  if (error) return error;
  if (user.role !== 'ILC_ADMIN' && user.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { code } = params;
  const body = await req.json();
  const allowed = ['is_active', 'family', 'description'];
  const data = {};
  for (const key of allowed) {
    if (key in body) data[key] = body[key];
  }

  try {
    const updated = await prisma.fixtureType.update({ where: { code }, data });
    return NextResponse.json(updated);
  } catch (e) {
    if (e.code === 'P2025') return NextResponse.json({ error: 'Not found' }, { status: 404 });
    console.error(e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
