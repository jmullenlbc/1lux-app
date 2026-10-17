import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';

// GET /api/system-config?keys=key1,key2
export async function GET(req) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const keys = new URL(req.url).searchParams.get('keys')?.split(',').filter(Boolean) ?? [];

  const records = keys.length > 0
    ? await prisma.systemConfig.findMany({ where: { key: { in: keys } } })
    : await prisma.systemConfig.findMany();

  const config = Object.fromEntries(records.map(r => [r.key, r.value]));
  return NextResponse.json({ config });
}

// PATCH /api/system-config, upserts one or more key/value pairs
// ILC_ADMIN / SUPER_ADMIN only
export async function PATCH(req) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const isAdmin = user.role === 'ILC_ADMIN' || user.role === 'SUPER_ADMIN';
  if (!isAdmin) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const updates = await req.json(); // { key: value, ... }
  if (!updates || typeof updates !== 'object') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  await Promise.all(
    Object.entries(updates).map(([key, value]) =>
      prisma.systemConfig.upsert({
        where:  { key },
        create: { key, value: String(value), updatedById: user.id },
        update: { value: String(value), updatedById: user.id },
      })
    )
  );

  return NextResponse.json({ ok: true, updated: Object.keys(updates) });
}
