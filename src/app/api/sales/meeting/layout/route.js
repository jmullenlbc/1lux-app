import { NextResponse } from 'next/server';
import { requireAuth, actsAsAdmin } from '@/lib/auth';
import { prisma } from '@/lib/db';
import {
  MEETING_CARDS, MEETING_SECTION, MEETING_CATEGORY,
  defaultLayout, normalizeLayout, getCard,
} from '@/lib/meeting/cards';

export const dynamic = 'force-dynamic';

/**
 * Which cards are on the Weekly Meeting screen, and in what order.
 *
 * Maram runs the meeting, so there are two layers and the shared one is the one
 * that matters: an admin-owned default set the whole room sees, plus an optional
 * personal copy for anyone who wants their own order. A personal copy simply
 * wins when it exists. Deleting it drops you back to the shared set.
 *
 * Rows are Dashboard + DashboardWidget with section="MEETING", no new tables.
 */

async function findLayoutRow(ownerUserId) {
  return prisma.dashboard.findFirst({
    where: ownerUserId
      ? { section: MEETING_SECTION, ownerUserId }
      : { section: MEETING_SECTION, ownerUserId: null, isDefault: true },
    include: { widgets: { orderBy: { position: 'asc' } } },
  });
}

const keysOf = (row) => normalizeLayout((row?.widgets || []).map(w => w.metric));

// GET /api/sales/meeting/layout, the effective layout plus the whole catalog,
// so the screen can render the add/remove list without a second round trip.
export async function GET() {
  const { user, error } = await requireAuth();
  if (error) return error;

  const [personal, shared] = await Promise.all([
    findLayoutRow(user.id).catch(() => null),
    findLayoutRow(null).catch(() => null),
  ]);

  const source = personal ? 'personal' : shared ? 'shared' : 'built-in';
  const cards  = personal ? keysOf(personal) : shared ? keysOf(shared) : defaultLayout();

  return NextResponse.json({
    cards,
    source,                       // which layer the room is looking at
    hasPersonal: !!personal,
    canEditShared: actsAsAdmin(user),
    catalog: MEETING_CARDS.map(c => ({
      key: c.key, title: c.title, subtitle: c.subtitle,
      showsOwner: c.showsOwner, needs: c.needs || null, level: c.level,
    })),
  });
}

/**
 * PUT /api/sales/meeting/layout
 * Body: { cards: string[], scope?: 'personal' | 'shared' }
 *
 * Saving the shared set changes what the whole room sees, so it is admin-only.
 */
export async function PUT(request) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const body  = await request.json().catch(() => ({}));
  const scope = body.scope === 'shared' ? 'shared' : 'personal';
  const cards = normalizeLayout(body.cards);

  if (scope === 'shared' && !actsAsAdmin(user)) {
    return NextResponse.json(
      { error: 'Only an admin can change the set everyone sees.' },
      { status: 403 },
    );
  }

  const ownerUserId = scope === 'shared' ? null : user.id;
  const existing = await findLayoutRow(ownerUserId);

  const widgetRows = cards.map((key, i) => {
    const card = getCard(key);
    return {
      name:     card.title,
      category: MEETING_CATEGORY,
      metric:   key,
      viewBy:   'NONE',
      position: i,
      width:    'FULL',
    };
  });

  // Replace the card rows wholesale rather than diffing them. The layout is a
  // short ordered list, and a partial update that half-applied would leave the
  // meeting screen in an order nobody chose.
  const saved = await prisma.$transaction(async (tx) => {
    if (existing) {
      await tx.dashboardWidget.deleteMany({ where: { dashboardId: existing.id } });
      await tx.dashboardWidget.createMany({
        data: widgetRows.map(w => ({ ...w, dashboardId: existing.id })),
      });
      return existing;
    }
    return tx.dashboard.create({
      data: {
        name:        scope === 'shared' ? 'Weekly Meeting' : `Weekly Meeting: ${user.name || user.email}`,
        section:     MEETING_SECTION,
        isDefault:   scope === 'shared',
        ownerUserId,
        createdById: user.id,
        widgets:     { create: widgetRows },
      },
    });
  });

  return NextResponse.json({ ok: true, cards, scope, dashboardId: saved.id });
}

// DELETE /api/sales/meeting/layout, drop my personal copy, go back to the room's set.
export async function DELETE() {
  const { user, error } = await requireAuth();
  if (error) return error;

  const personal = await findLayoutRow(user.id);
  if (personal) await prisma.dashboard.delete({ where: { id: personal.id } });

  const shared = await findLayoutRow(null);
  return NextResponse.json({
    ok: true,
    cards: shared ? keysOf(shared) : defaultLayout(),
    source: shared ? 'shared' : 'built-in',
  });
}
