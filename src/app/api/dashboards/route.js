import { NextResponse } from 'next/server';
import { requireAuth, actsAsAdmin } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { TEMPLATES_BY_SECTION } from '@/lib/defaultDashboard';
import { missingPrebuilt, hiddenCards } from '@/lib/dashboards/prebuilt';

export const dynamic = 'force-dynamic';

const WITH_WIDGETS = { widgets: { orderBy: { position: 'asc' } } };

// The prebuilt cards somebody has taken off this dashboard (migration 0074).
async function hiddenKeysFor(dashboardId) {
  const rows = await prisma.dashboardHiddenWidget.findMany({ where: { dashboardId }, select: { widgetKey: true } });
  return rows.map(r => r.widgetKey);
}

// Templates flagged as "prebuilt" (dataSpec.kind set) are added to a dashboard
// that lacks them, even one created before the template existed — unless that
// dashboard had the card taken off. Matched by what the card is, not its title,
// so a renamed card is not added a second time. Rules: src/lib/dashboards/prebuilt.js.
async function appendMissingPrebuilt(dash, section, hiddenKeys) {
  const missing = missingPrebuilt(TEMPLATES_BY_SECTION[section] || [], dash.widgets, hiddenKeys);
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
  }
  // Prebuilt widgets added after a dashboard was created (the calibration set,
  // then Things Needing a Look) are appended by name, so nobody has to rebuild
  // a dashboard to get them.
  //
  // This runs on personal copies as well as the admin default, because most
  // people are on a personal copy and would otherwise never see a new card.
  //
  // Taking a prebuilt card off now sticks (Mike, 2026-09-11: "Make it stick"):
  // the widget DELETE route records it in DashboardHiddenWidget and this load
  // skips it. hiddenCards goes back to the screen so it can offer to put one back.
  let hidden = [];
  if (active) {
    hidden = await hiddenKeysFor(active.id);
    active = await appendMissingPrebuilt(active, section, hidden);
  }

  const shared = await prisma.dashboardShare.findMany({
    where: { sharedWithUserId: user.id },
    include: { dashboard: { select: { id: true, name: true, section: true } } },
  });

  return NextResponse.json({
    active, isPersonal, isAdmin: actsAsAdmin(user),
    shared: shared.map(s => s.dashboard),
    hiddenCards: hiddenCards(TEMPLATES_BY_SECTION[section] || [], hidden),
  });
}

// POST /api/dashboards { section, name, makeDefault? }
// Admins can create the section default; everyone else creates a personal dashboard.
export async function POST(request) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const { section = 'SALES', name = 'Dashboard', makeDefault = false } = await request.json().catch(() => ({}));
  const asDefault = actsAsAdmin(user) && makeDefault;

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
