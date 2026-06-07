import { NextResponse } from 'next/server';
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
    if (!li) { errors.push(`Line item ${req_item.lineItemId} not found`); continue; }
    if (li.qtyAtWarehouse < req_item.qtyRequested) {
      errors.push(`${li.fixtureType}: requested ${req_item.qtyRequested} but only ${li.qtyAtWarehouse} at warehouse`);
    }
  }
  if (errors.length) return NextResponse.json({ error: errors.join('; ') }, { status: 400 });

  // Create WarehouseRelease records with PENDING status
  const releases = await Promise.all(
    items.map(({ lineItemId, qtyRequested }) =>
      prisma.warehouseRelease.create({
        data: {
          lineItemId,
          qty:                     qtyRequested,
          // releasedById intentionally omitted for PENDING — set to approving User on APPROVED
          status:                  'PENDING',
          requestedAt:             new Date(),
          requestedByPortalUserId: portalUser.portalUserId,
        },
      })
    )
  );

  // Alert the project owner (TODO: update to constructionPmId when roles are wired)
  const project = await prisma.project.findUnique({
    where:  { id: params.id },
    select: { name: true, createdById: true },
  });

  const totalQty = items.reduce((s, i) => s + i.qtyRequested, 0);
  await prisma.userAlert.create({
    data: {
      userId:    project.createdById,
      type:      'WAREHOUSE_RELEASE_REQUEST',
      title:     `Release request — ${project.name}`,
      message:   `${portalUser.name || portalUser.email} requested ${totalQty} units across ${items.length} fixture type${items.length !== 1 ? 's' : ''}`,
      link:      `/project/${params.id}?tab=ship-schedule`,
      dedupeKey: `release-request-${params.id}-${Date.now()}`,
    },
  }).catch(() => {}); // non-blocking

  // TODO: send confirmation email to contractor (Step 5)

  return NextResponse.json({ ok: true, releases }, { status: 201 });
}
