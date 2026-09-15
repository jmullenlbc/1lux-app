import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function PATCH(req, { params }) {
  // Fixture library: Pre-con, Design, Construction and admins (src/lib/permissions.js).
  const { error } = await requirePermission(req, 'editProducts');
  if (error) return error;

  const { id } = params;
  const body = await req.json();
  const allowed = ['budget_cost', 'is_default', 'is_active', 'tier', 'design_notes'];
  const data = {};
  for (const key of allowed) {
    if (key in body) data[key] = body[key];
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
  }

  try {
    const updated = await prisma.iLCSpec.update({ where: { id }, data });
    return NextResponse.json(updated);
  } catch (e) {
    if (e.code === 'P2025') return NextResponse.json({ error: 'Not found' }, { status: 404 });
    console.error(e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
