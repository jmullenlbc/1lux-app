import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { looseInteger } from '@/lib/numberInput';

// GET, release history for a line item
export async function GET(req, { params }) {
  const { error } = await requireAuth();
  if (error) return error;

  const releases = await prisma.warehouseRelease.findMany({
    where:   { lineItemId: params.itemId },
    orderBy: { releasedAt: 'desc' },
    include: { releasedBy: { select: { name: true, email: true } } },
  });

  const totalReleased = releases.reduce((s, r) => s + r.qty, 0);
  return NextResponse.json({ releases, totalReleased });
}

// POST, record a new warehouse release
// Body: { qty, notes? }
export async function POST(req, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const item = await prisma.shipmentLineItem.findUnique({
    where:   { id: params.itemId },
    include: { shipment: { select: { project_id: true } } },
  });
  if (!item || item.shipment.project_id !== params.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const qty  = looseInteger(body.qty);
  if (!qty || qty <= 0) return NextResponse.json({ error: 'qty must be a positive integer' }, { status: 400 });

  const release = await prisma.warehouseRelease.create({
    data: {
      lineItemId:   params.itemId,
      qty,
      notes:        body.notes || null,
      releasedById: user.id,
    },
    include: { releasedBy: { select: { name: true, email: true } } },
  });

  // Alert the project's assigned users (construction PM), best-effort
  try {
    const assignees = await prisma.projectAssignee.findMany({
      where: { projectId: params.id },
      select: { userId: true },
    });
    const message = `${qty} unit${qty !== 1 ? 's' : ''} of "${item.fixtureType}" released from warehouse by ${user.name || user.email}${body.notes ? `: "${body.notes}"` : ''}.`;
    for (const { userId } of assignees) {
      if (userId === user.id) continue; // don't alert yourself
      await prisma.userAlert.create({
        data: {
          userId,
          type:      'WAREHOUSE_RELEASE',
          title:     `Warehouse Release: ${item.fixtureType}`,
          message,
          link:      `/project/${params.id}?tab=ship-schedule`,
          dedupeKey: null,
        },
      });
    }
  } catch {}

  const totalReleased = await prisma.warehouseRelease.aggregate({
    where: { lineItemId: params.itemId },
    _sum:  { qty: true },
  });

  return NextResponse.json({
    release,
    totalReleased: totalReleased._sum.qty || 0,
  }, { status: 201 });
}
