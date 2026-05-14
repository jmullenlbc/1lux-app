import { NextResponse } from 'next/server';
import { requireAuth }  from '@/lib/auth';
import { prisma }       from '@/lib/db';

// GET /api/user/preferences
export async function GET(request) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const u = await prisma.user.findUnique({
    where:  { id: user.id },
    select: { dashboardConfig: true },
  });

  return NextResponse.json({ dashboardConfig: u?.dashboardConfig || null });
}

// PATCH /api/user/preferences
// Body: { dashboardConfig: string (JSON) }
export async function PATCH(request) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const { dashboardConfig } = await request.json();

  // Validate it's valid JSON before saving
  if (dashboardConfig !== null && dashboardConfig !== undefined) {
    try { JSON.parse(dashboardConfig); }
    catch { return NextResponse.json({ error: 'dashboardConfig must be valid JSON' }, { status: 400 }); }
  }

  await prisma.user.update({
    where: { id: user.id },
    data:  { dashboardConfig: dashboardConfig ?? null },
  });

  return NextResponse.json({ ok: true });
}
