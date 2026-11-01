/**
 * Ship Schedule publish. The client portal shows the last published copy, never
 * the live rows: a PM publishes, or a date on the job publishes once
 * (Mike 2026-10-31). The copy keeps the live line id, so a release request
 * still lands on the real line and is checked against live warehouse numbers.
 *
 * No scheduler runs in this app, so a date that has passed publishes the next
 * time the portal or the staff Ship Schedule opens.
 *
 * Every function takes `db` so plain node tests can pass a fake.
 */
import { enrichLineItem, LINE_ITEM_INCLUDE } from './shipScheduleHelpers.js';

const STATUS_RELEASED  = ['RELEASED', 'DELIVERED'];
const STATUS_WAREHOUSE = ['AT_WAREHOUSE', 'PARTIALLY_RELEASED'];
const STATUS_TRANSIT   = ['SHIPPED', 'IN_TRANSIT'];

async function liveLines(db, projectId) {
  const shipments = await db.shipment.findMany({
    where:   { project_id: projectId },
    include: {
      lineItems: {
        where:   { isRemoved: false },
        include: LINE_ITEM_INCLUDE,
        orderBy: { sortOrder: 'asc' },
      },
    },
    orderBy: { esdDate: 'asc' },
  });

  return shipments.flatMap(s => s.lineItems.map(enrichLineItem).map(li => ({
    lineItemId:       li.id,
    shipmentId:       s.id,
    manufacturer:     s.manufacturer,
    shipmentStatus:   s.status,
    shipmentEsdDate:  s.esdDate,
    destinationType:  s.destinationType,
    fixtureType:      li.fixtureType,
    description:      li.description,
    catalogNo:        li.catalogNo,
    qty:              li.qty,
    qtyType:          li.qtyType,
    fixtureStatus:    li.fixtureStatus,
    sourceBatchLabel: li.sourceBatchLabel,
    esdDate:          li.esdDate || s.esdDate,
    leadTimeWeeks:    li.leadTimeWeeks || s.leadTimeWeeks,
    trackingNumber:   li.trackingNumber || s.trackingNumber,
    sortOrder:        li.sortOrder,
    qtyAtWarehouse:   li.qtyAtWarehouse,
    qtyOnSite:        li.qtyOnSite,
    qtyBackordered:   li.qtyBackordered,
  })));
}

function writeCopy(db, projectId, lines, how, userId) {
  return db.shipSchedulePublish.create({
    data:   { projectId, how, publishedById: userId, lines: { create: lines } },
    select: { id: true, publishedAt: true, how: true },
  });
}

/** Copies the live schedule. Null when the job has no lines to copy. */
export async function publishSchedule(db, projectId, userId) {
  const lines = await liveLines(db, projectId);
  if (!lines.length) return null;
  return writeCopy(db, projectId, lines, 'MANUAL', userId);
}

/**
 * Publishes once when the job's date has passed, then clears the date. A job
 * with no lines yet keeps its date and publishes once it has some.
 */
export async function publishIfDue(db, projectId, now = new Date()) {
  const project = await db.project.findUnique({
    where:  { id: projectId },
    select: { shipAutoPublishAt: true },
  });
  const at = project?.shipAutoPublishAt;
  if (!at || new Date(at) > now) return null;

  const lines = await liveLines(db, projectId);
  if (!lines.length) return null;

  return db.$transaction(async tx => {
    // Two screens can open at once: only the one that clears the date publishes.
    const { count } = await tx.project.updateMany({
      where: { id: projectId, shipAutoPublishAt: { not: null, lte: now } },
      data:  { shipAutoPublishAt: null },
    });
    return count ? writeCopy(tx, projectId, lines, 'AUTOMATIC', null) : null;
  });
}

/** A failed automatic publish must not stop anyone seeing the last copy. */
export async function publishIfDueSafely(db, projectId) {
  try {
    return await publishIfDue(db, projectId);
  } catch (err) {
    console.error('[shipSchedulePublish] automatic publish failed:', err?.message ?? err);
    return null;
  }
}

/** The portal's Ship Schedule, built from a published copy (or null). */
export function publishedView(publish) {
  const stats = { toSite: 0, inWarehouse: 0, inTransit: 0, onOrder: 0 };
  if (!publish) return { publishedAt: null, shipments: [], stats, firstDelivery: null };

  const byShipment = new Map();
  for (const l of publish.lines) {
    if (STATUS_RELEASED.includes(l.fixtureStatus))       stats.toSite++;
    else if (STATUS_WAREHOUSE.includes(l.fixtureStatus)) stats.inWarehouse++;
    else if (STATUS_TRANSIT.includes(l.fixtureStatus))   stats.inTransit++;
    else                                                 stats.onOrder++;

    if (!byShipment.has(l.shipmentId)) {
      byShipment.set(l.shipmentId, {
        id:              l.shipmentId,
        manufacturer:    l.manufacturer,
        status:          l.shipmentStatus,
        esdDate:         l.shipmentEsdDate,
        destinationType: l.destinationType,
        trackingNumber:  l.trackingNumber,
        lineItems:       [],
      });
    }
    // A line deleted since the publish has no live id, so it cannot be released.
    byShipment.get(l.shipmentId).lineItems.push({
      ...l,
      id:             l.lineItemId ?? l.id,
      qtyAtWarehouse: l.lineItemId ? l.qtyAtWarehouse : 0,
    });
  }

  const shipments = [...byShipment.values()];
  const next = shipments
    .filter(s => s.esdDate && !STATUS_RELEASED.includes(s.status))
    .sort((a, b) => new Date(a.esdDate) - new Date(b.esdDate))[0];

  return {
    publishedAt: publish.publishedAt,
    shipments,
    stats,
    firstDelivery: next ? { manufacturer: next.manufacturer, esdDate: next.esdDate } : null,
  };
}

/** What the portal reads: runs a due date first, then the newest copy. */
export async function publishedSchedule(db, projectId) {
  await publishIfDueSafely(db, projectId);
  const publish = await db.shipSchedulePublish.findFirst({
    where:   { projectId },
    orderBy: { publishedAt: 'desc' },
    include: { lines: { orderBy: { sortOrder: 'asc' } } },
  });
  return publishedView(publish);
}
