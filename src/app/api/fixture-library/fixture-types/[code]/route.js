import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function PATCH(req, { params }) {
  // Fixture library: Pre-con, Design, Construction and admins (src/lib/permissions.js).
  const { error } = await requirePermission(req, 'editProducts');
  if (error) return error;

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
