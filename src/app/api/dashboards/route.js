import { NextResponse } from 'next/server';
import { requireAuth, isAnyAdmin } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { TEMPLATES_BY_SECTION } from '@/lib/defaultDashboard';

export const dynamic = 'force-dynamic';

const WITH_WIDGETS = { widgets: { orderBy: { position: 'asc' } } };

// Templates flagged as "prebuilt" (dataSpec.kind set) are guaranteed on the
// section default even when it was created before the template existed.
async function appendMissingPrebuilt(dash, section) {
  const templates = (TEMPLATES_BY_SECTION[section] || []).filter(t => t.dataSpec?.kind);
  const have = new Set((dash.widgets || []).map(w => w.name));
  const missing = templates.filter(t => !have.has(t.name));
  if (!missing.length) return dash;
  let position = dash.widgets.length;
  await prisma.dashboardWidget.createMany({
    data: missing.map(t => ({
      dashboardId: dash.id,
      name: t.name, chartType: t.chartType || 'BAR', width: t.width || 'HALF', position: position++,
      dataSpec: JSON.stringify(t.dataSpec || {}),
      category: 'FIELD', metric: 'custom', viewBy: 'none', filters: '[]',
    })),
  });
  return prisma.dashboard.findUnique({ where: { id: dash.id }, include: WITH_WIDGETS });
}

// GET /api/dashboards?section=SALES
// Resolves the user's active dashboard: their personal copy if any, else the
// section's admin default. Also returns dashboards shared with them.
export async function GET(request) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const section = new URL(request.url).searchParams.get('section') || 'SALES';

  let active = await prisma.dashboard.findFirst({
    where: { section, ownerUserId: user.id }, include: WITH_WIDGETS,
  });
  const isPersonal = !!active;
  if (!active) {
    active = await prisma.dashboard.findFirst({
      where: { section, ownerUserId: null, isDefault: true }, include: WITH_WIDGETS,
    });
    // Prebuilt widgets added after a default was seeded (e.g. the calibration
    // set) are appended to the admin default by name, so existing defaults
    // pick them up without anyone recreating the dashboard.
    if (active) active = await appendMissingPrebuilt(active, section);
  }

  const shared = await prisma.dashboardShare.findMany({
    where: { sharedWithUserId: user.id },
    include: { dashboard: { select: { id: true, name: true, section: true } } },
  });

  return NextResponse.json({
    active, isPersonal, isAdmin: isAnyAdmin(user.role),
    shared: shared.map(s => s.dashboard),
  });
}

// POST /api/dashboards { section, name, makeDefault? }
// Admins can create the section default; everyone else creates a personal dashboard.
export async function POST(request) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const { section = 'SALES', name = 'Dashboard', makeDefault = false } = await request.json().catch(() => ({}));
  const asDefault = isAnyAdmin(user.role) && makeDefault;

  // Only ever one default per section — demote any existing default first so an
  // admin clicking "create default" twice can't leave two isDefault rows behind.
  const dashboard = await prisma.$transaction(async (tx) => {
    if (asDefault) {
      await tx.dashboard.updateMany({
        where: { section, ownerUserId: null, isDefault: true },
        data: { isDefault: false },
      });
    }
    // Seed the section's template charts so a new default isn't blank.
    const templates = TEMPLATES_BY_SECTION[section] || [];
    return tx.dashboard.create({
      data: {
        name, section, createdById: user.id,
        isDefault: asDefault,
        ownerUserId: asDefault ? null : user.id,
        widgets: {
          create: templates.map((t, i) => ({
            name: t.name, chartType: t.chartType || 'BAR', width: t.width || 'HALF', position: i,
            dataSpec: JSON.stringify(t.dataSpec || {}),
            // legacy NOT-NULL columns get inert sentinels (field-picker widgets ignore them)
            category: 'FIELD', metric: 'custom', viewBy: 'none', filters: '[]',
          })),
        },
      },
      include: WITH_WIDGETS,
    });
  });
  return NextResponse.json({ dashboard });
}
