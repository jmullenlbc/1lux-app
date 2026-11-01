import { NextResponse } from 'next/server';
import { notifyProjectManagers } from '@/lib/alerts';
import { requirePortalAuth } from '@/lib/portalAuth';
import { prisma } from '@/lib/db';
import { enrichLineItem, LINE_ITEM_INCLUDE } from '@/lib/shipScheduleHelpers';

// POST /api/portal/projects/[id]/release-requests
// Contractor submits a warehouse release request for one or more line items.
export async function POST(req, { params }) {
  const { portalUser, error } = await requirePortalAuth();
  if (error) return error;

  const contact = await prisma.projectExternalContact.findFirst({
    where: { project_id: params.id, portalUserId: portalUser.portalUserId, acceptedAt: { not: null } },
  });
  if (!contact?.canViewShipSchedule) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  }

  // body: [{ lineItemId, qtyRequested }]
  const items = await req.json();
  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: 'Provide array of { lineItemId, qtyRequested }' }, { status: 400 });
  }

  // Verify all line items belong to this project and have sufficient warehouse qty
  const lineItems = await prisma.shipmentLineItem.findMany({
    where:   { id: { in: items.map(i => i.lineItemId) }, shipment: { project_id: params.id } },
    include: LINE_ITEM_INCLUDE,
  });

  const enriched = lineItems.map(enrichLineItem);
  const errors = [];
  for (const req_item of items) {
    const li = enriched.find(l => l.id === req_item.lineItemId);
    if (!li) { errors.push('A line on this request is no longer on the Ship Schedule.'); continue; }
    if (li.qtyAtWarehouse < req_item.qtyRequested) {
      errors.push(`${li.fixtureType}: you asked for ${req_item.qtyRequested}, but ${li.qtyAtWarehouse} are at the warehouse right now.`);
    }
  }
  if (errors.length) {
    return NextResponse.json({ error: `${errors.join(' ')} This screen shows the last published schedule, so the warehouse may have changed. Nothing was requested. Lower the quantity or call your rep.` }, { status: 400 });
  }

  // Create WarehouseRelease records with PENDING status
  const releases = await Promise.all(
    items.map(({ lineItemId, qtyRequested }) =>
      prisma.warehouseRelease.create({
        data: {
          lineItemId,
          qty:                     qtyRequested,
          // releasedById intentionally omitted for PENDING, set to approving User on APPROVED
          status:                  'PENDING',
          requestedAt:             new Date(),
          requestedByPortalUserId: portalUser.portalUserId,
        },
      })
    )
  );

  const project = await prisma.project.findUnique({
    where:  { id: params.id },
    select: { name: true },
  });

  const totalQty = items.reduce((s, i) => s + i.qtyRequested, 0);
  await notifyProjectManagers(params.id, {
      type:      'WAREHOUSE_RELEASE_REQUEST',
      title:     `Release request: ${project.name}`,
      message:   `${portalUser.name || portalUser.email} requested ${totalQty} units across ${items.length} fixture type${items.length !== 1 ? 's' : ''}`,
      link:      `/project/${params.id}?tab=ship-schedule`,
      dedupeKey: `release-request-${params.id}-${Date.now()}`,
  });

  // TODO: send confirmation email to contractor (Step 5)

  return NextResponse.json({ ok: true, releases }, { status: 201 });
}
