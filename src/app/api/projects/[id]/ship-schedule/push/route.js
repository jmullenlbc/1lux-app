import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { NOT_CO_VERSION } from '@/lib/budgetVersions';
import { chosenLineItems } from '@/lib/changeOrderTotals';

// POST /api/projects/[id]/ship-schedule/push
// Body: { sourceType?: 'DESIGN_BID'|'PEER_REVIEW', coId?: string }
// Smart-merges bid matrix or CO items into the ship schedule.
// Groups by sortOrder (type order from budget), not manufacturer.
// Removes deleted types by greying them out (isRemoved = true).

export async function POST(req, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const project = await prisma.project.findUnique({
    where: { id: params.id },
    select: { serviceType: true, createdById: true },
  });
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const { coId } = body;

  // Determine source based on service type (unless pushing from a CO)
  const isDesignBid = ['fullDesign', 'designAssist'].includes(project.serviceType);
  const sourceType  = coId ? 'CHANGE_ORDER' : (isDesignBid ? 'DESIGN_BID' : 'PEER_REVIEW');

  // ── Load source items ──────────────────────────────────────────────────────
  let sourceItems = []; // [{ id, typeCode, description, propManufacturer, propModel, qty, sortOrder }]
  let sourceVersion = null;
  let batchLabel = 'Initial Order';

  if (coId) {
    // Push from a Change Order
    const co = await prisma.changeOrder.findUnique({
      where: { id: coId },
      include: {
        optionGroups: {
          include: { lineItems: { orderBy: { sortOrder: 'asc' } } },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });
    if (!co || co.projectId !== params.id) {
      return NextResponse.json({ error: 'CO not found' }, { status: 404 });
    }
    if (co.status !== 'APPROVED') {
      return NextResponse.json({ error: 'This change order is not approved yet, so nothing was pushed. Approve it first, then push again. (CO_NOT_APPROVED)' }, { status: 400 });
    }
    if (!co.optionGroups.some(g => g.isSelected)) {
      return NextResponse.json({ error: 'No option is chosen on this change order, so nothing was pushed. Choose one and try again.' }, { status: 400 });
    }
    batchLabel = `${co.coNumber}: ${co.title}`;
    // Only the chosen option, with per line alternates resolved to the one picked
    const allItems = chosenLineItems(co);
    sourceItems = allItems.map((li, idx) => ({
      id:              li.id,
      typeCode:        li.fixtureType,
      description:     li.description || '',
      propManufacturer: li.manufacturer || null,
      propModel:       li.partNumber   || null,
      qty:             li.qty          || 0,
      sortOrder:       li.sortOrder ?? idx,
    }));
  } else if (sourceType === 'DESIGN_BID') {
    // Push from latest Design Bid Matrix
    const matrix = await prisma.designBidMatrix.findFirst({
      where:   { projectId: params.id, ...NOT_CO_VERSION },
      orderBy: { version: 'desc' },
      include: { items: { where: { isArchived: false }, orderBy: [{ sortOrder: 'asc' }] } },
    });
    if (!matrix) return NextResponse.json({ error: 'No bid matrix found, push fixture schedule to bid first' }, { status: 404 });
    sourceVersion = matrix.version;
    batchLabel = `Bid Matrix v${matrix.version}`;
    // De-dupe by type (catalog splits may produce multiple rows per type)
    const seen = new Set();
    sourceItems = matrix.items
      .filter(i => { const k = (i.type || '').toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; })
      .map((i, idx) => ({
        id:              i.id,
        typeCode:        i.type        || '',
        description:     i.description || '',
        propManufacturer: i.manufacturer || null,
        propModel:       i.partNumber  || null,
        qty:             i.qty         || 0,
        sortOrder:       i.sortOrder   ?? idx,
      }));
  } else {
    // Push from Budget Matrix (PeerReview items), proposed specs only, no spec columns
    const items = await prisma.peerReviewItem.findMany({
      where:   { projectId: params.id },
      orderBy: [{ section: 'asc' }, { sortOrder: 'asc' }],
    });
    if (items.length === 0) return NextResponse.json({ error: 'No budget matrix items found' }, { status: 404 });
    batchLabel = 'Budget Matrix';
    sourceItems = items.map((i, idx) => ({
      id:              i.id,
      typeCode:        i.typeCode        || '',
      description:     i.description    || '',
      propManufacturer: i.propManufacturer || null,
      propModel:       i.propModel       || null,
      qty:             i.qty             || 0,
      sortOrder:       i.sortOrder       ?? idx,
    }));
  }

  // ── Get or create the project's single "canonical" shipment container ──────
  // Ship schedule uses one shipment per push-source grouping; line items sorted by type.
  // For CO pushes, create a dedicated shipment. For budget pushes, use/update main one.
  let shipment;
  if (coId) {
    shipment = await prisma.shipment.create({
      data: {
        project_id:   params.id,
        manufacturer: batchLabel, // repurposed as batch label
        status:       'PENDING',
        notes:        `Pushed from ${batchLabel}`,
      },
    });
  } else {
    shipment = await prisma.shipment.findFirst({
      where: { project_id: params.id, status: { not: 'PENDING' } },
      orderBy: { createdAt: 'asc' },
    });
    if (!shipment) {
      shipment = await prisma.shipment.findFirst({
        where: { project_id: params.id },
        orderBy: { createdAt: 'asc' },
      });
    }
    if (!shipment) {
      shipment = await prisma.shipment.create({
        data: { project_id: params.id, manufacturer: 'Main', status: 'PENDING' },
      });
    }
  }

  // ── Load existing ship schedule line items (non-CO shipments) for smart merge ──
  const existingItems = coId ? [] : await prisma.shipmentLineItem.findMany({
    where: { shipment: { project_id: params.id }, sourceType: { not: 'CHANGE_ORDER' } },
  });

  // Index by typeCode for merge logic
  const existingByType = new Map();
  existingItems.forEach(li => {
    const key = (li.fixtureType || '').toLowerCase().trim();
    if (!existingByType.has(key)) existingByType.set(key, li);
  });

  const sourceTypeCodes = new Set(sourceItems.map(i => (i.typeCode || '').toLowerCase().trim()));

  let added = 0, updated = 0, removed = 0;

  // Grey out types removed from the source
  for (const [key, existing] of existingByType) {
    if (!sourceTypeCodes.has(key) && !existing.isRemoved) {
      await prisma.shipmentLineItem.update({
        where: { id: existing.id },
        data:  { isRemoved: true },
      });
      removed++;
    }
  }

  // Add or update from source
  for (const src of sourceItems) {
    const key = (src.typeCode || '').toLowerCase().trim();
    const existing = existingByType.get(key);

    if (existing) {
      // UPDATE: refresh type/description/manufacturer/sortOrder, preserve logistics
      await prisma.shipmentLineItem.update({
        where: { id: existing.id },
        data: {
          fixtureType:      src.typeCode,
          description:      src.description,
          propManufacturer: src.propManufacturer,
          propModel:        src.propModel,
          qty:              src.qty,
          sortOrder:        src.sortOrder,
          sourceItemId:     src.id,
          sourceType:       coId ? 'CHANGE_ORDER' : sourceType,
          isRemoved:        false, // un-grey if previously removed
        },
      });
      updated++;
    } else {
      // CREATE new line item
      await prisma.shipmentLineItem.create({
        data: {
          shipment_id:      shipment.id,
          fixtureType:      src.typeCode,
          description:      src.description,
          propManufacturer: src.propManufacturer,
          propModel:        src.propModel,
          qty:              src.qty,
          sortOrder:        src.sortOrder,
          sourceItemId:     src.id,
          sourceType:       coId ? 'CHANGE_ORDER' : sourceType,
          sourceBatchLabel: batchLabel,
          fixtureStatus:    'NOT_ORDERED',
          isRemoved:        false,
        },
      });
      added++;
    }
  }

  // Record the push
  await prisma.shipSchedulePush.create({
    data: {
      projectId:    params.id,
      sourceType,
      sourceVersion,
      sourceCoId:   coId || null,
      pushedById:   user.id,
      summary: JSON.stringify({ added, updated, removed }),
    },
  });

  return NextResponse.json({ ok: true, added, updated, removed, batchLabel });
}
