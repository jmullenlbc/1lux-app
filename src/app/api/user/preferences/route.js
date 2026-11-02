import { NextResponse } from 'next/server';
import { requireAuth }  from '@/lib/auth';
import { prisma }       from '@/lib/db';

// GET /api/user/preferences
export async function GET(request) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const u = await prisma.user.findUnique({
    where:  { id: user.id },
    select: { dashboardConfig: true, notificationPrefs: true, homeCity: true, homeState: true },
  });

  return NextResponse.json({
    dashboardConfig:   u?.dashboardConfig   || null,
    notificationPrefs: u?.notificationPrefs || null,
    homeCity:          u?.homeCity          || '',
    homeState:         u?.homeState         || '',
  });
}

// PATCH /api/user/preferences
// Body: { dashboardConfig?: string (JSON), notificationPrefs?: string (JSON), name?, homeCity?, homeState? }
export async function PATCH(request) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const body = await request.json();
  const data = {};

  if ('dashboardConfig' in body) {
    if (body.dashboardConfig !== null && body.dashboardConfig !== undefined) {
      try { JSON.parse(body.dashboardConfig); }
      catch { return NextResponse.json({ error: 'dashboardConfig must be valid JSON' }, { status: 400 }); }
    }
    data.dashboardConfig = body.dashboardConfig ?? null;
  }

  if ('notificationPrefs' in body) {
    if (body.notificationPrefs !== null && body.notificationPrefs !== undefined) {
      try { JSON.parse(body.notificationPrefs); }
      catch { return NextResponse.json({ error: 'notificationPrefs must be valid JSON' }, { status: 400 }); }
    }
    data.notificationPrefs = body.notificationPrefs ?? null;
  }

  if ('name' in body) {
    const name = String(body.name || '').trim();
    if (!name) return NextResponse.json({ error: 'Your name can\'t be blank. Nothing was saved.' }, { status: 400 });
    data.name = name;
  }
  if ('homeCity' in body) data.homeCity = String(body.homeCity || '').trim() || null;
  if ('homeState' in body) data.homeState = String(body.homeState || '').trim().toUpperCase() || null;

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  await prisma.user.update({ where: { id: user.id }, data });
  return NextResponse.json({ ok: true });
}
