/**
 * Ship Schedule publish (Mike 2026-10-31): the client portal shows the last
 * published copy, never the live rows. A date on the job publishes once.
 *
 * Run: node --test scripts/tests/shipSchedulePublish.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  publishSchedule, publishIfDue, publishIfDueSafely, publishedView, publishedSchedule,
} from '../../src/lib/shipSchedulePublish.js';

const NOW = new Date('2026-11-05T15:00:00Z');
const DUE = new Date('2026-11-05T12:00:00Z');
const LATER = new Date('2026-11-06T12:00:00Z');

const liveLine = (over = {}) => ({
  id: 'li1', fixtureType: 'A1', description: 'Downlight', catalogNo: 'DL-4', qty: 10, qtyType: 'EA',
  fixtureStatus: 'ON_ORDER', sourceBatchLabel: null, esdDate: null, leadTimeWeeks: null, trackingNumber: null,
  sortOrder: 0, deliveryEvents: [], releases: [], ...over,
});
const liveShipment = (over = {}) => ({
  id: 's1', manufacturer: 'Acme', status: 'PENDING', esdDate: new Date('2026-12-01'), destinationType: 'WAREHOUSE',
  leadTimeWeeks: '6', trackingNumber: 'TRK1', lineItems: [liveLine()], ...over,
});

// Only what the publish code touches.
function fakeDb({ shipments = [liveShipment()], autoAt = null } = {}) {
  const db = {
    copies: [],
    autoAt,
    shipment: { findMany: async () => shipments },
    project: {
      findUnique: async () => ({ shipAutoPublishAt: db.autoAt }),
      updateMany: async () => {
        if (!db.autoAt) return { count: 0 };
        db.autoAt = null;
        return { count: 1 };
      },
    },
    shipSchedulePublish: {
      create: async ({ data }) => {
        const copy = { id: `p${db.copies.length + 1}`, publishedAt: NOW, how: data.how, data };
        db.copies.push(copy);
        return copy;
      },
      findFirst: async () => {
        const last = db.copies[db.copies.length - 1];
        return last ? { publishedAt: last.publishedAt, lines: last.data.lines.create } : null;
      },
    },
    $transaction: fn => fn(db),
  };
  return db;
}

const copyLine = (over = {}) => ({
  id: 'copy1', lineItemId: 'li1', shipmentId: 's1', manufacturer: 'Acme', shipmentStatus: 'PENDING',
  shipmentEsdDate: new Date('2026-12-01'), destinationType: 'WAREHOUSE', trackingNumber: null,
  fixtureType: 'A1', fixtureStatus: 'ON_ORDER', qtyAtWarehouse: 4, ...over,
});

test('with no publish yet the portal gets an empty schedule', () => {
  const v = publishedView(null);
  assert.deepEqual(v.shipments, []);
  assert.equal(v.publishedAt, null);
  assert.equal(v.firstDelivery, null);
  assert.deepEqual(v.stats, { toSite: 0, inWarehouse: 0, inTransit: 0, onOrder: 0 });
});

test('the view groups lines by shipment and counts each status once', () => {
  const v = publishedView({
    publishedAt: NOW,
    lines: [
      copyLine({ id: 'a', fixtureStatus: 'DELIVERED' }),
      copyLine({ id: 'b', fixtureStatus: 'AT_WAREHOUSE' }),
      copyLine({ id: 'c', fixtureStatus: 'IN_TRANSIT', shipmentId: 's2', manufacturer: 'Beta' }),
      copyLine({ id: 'd', fixtureStatus: null, shipmentId: 's2', manufacturer: 'Beta' }),
    ],
  });
  assert.equal(v.shipments.length, 2);
  assert.equal(v.shipments[0].lineItems.length, 2);
  assert.equal(v.shipments[1].manufacturer, 'Beta');
  assert.deepEqual(v.stats, { toSite: 1, inWarehouse: 1, inTransit: 1, onOrder: 1 });
});

test('first delivery is the earliest shipment still to come', () => {
  const v = publishedView({
    publishedAt: NOW,
    lines: [
      copyLine({ id: 'a', shipmentId: 'done', manufacturer: 'Old', shipmentStatus: 'DELIVERED', shipmentEsdDate: new Date('2026-01-01') }),
      copyLine({ id: 'b', shipmentId: 'late', manufacturer: 'Late', shipmentEsdDate: new Date('2026-12-20') }),
      copyLine({ id: 'c', shipmentId: 'soon', manufacturer: 'Soon', shipmentEsdDate: new Date('2026-11-20') }),
      copyLine({ id: 'd', shipmentId: 'none', manufacturer: 'NoDate', shipmentEsdDate: null }),
    ],
  });
  assert.equal(v.firstDelivery.manufacturer, 'Soon');
});

test('a release request lands on the live line, and a deleted line cannot be released', () => {
  const v = publishedView({
    publishedAt: NOW,
    lines: [copyLine({ id: 'a' }), copyLine({ id: 'b', lineItemId: null })],
  });
  const [live, gone] = v.shipments[0].lineItems;
  assert.equal(live.id, 'li1');
  assert.equal(live.qtyAtWarehouse, 4);
  assert.equal(gone.id, 'b');
  assert.equal(gone.qtyAtWarehouse, 0);
});

test('publishing copies each live line with its warehouse numbers', async () => {
  const db = fakeDb({
    shipments: [liveShipment({
      lineItems: [liveLine({
        deliveryEvents: [{ qtyReceived: 6 }],
        releases: [{ status: 'APPROVED', qtyReleased: 2 }, { status: 'PENDING', qtyReleased: 3 }],
      })],
    })],
  });
  const copy = await publishSchedule(db, 'p1', 'u1');
  assert.equal(copy.how, 'MANUAL');
  const { data } = db.copies[0];
  assert.equal(data.publishedById, 'u1');
  const [l] = data.lines.create;
  assert.equal(l.lineItemId, 'li1');
  assert.equal(l.leadTimeWeeks, '6');
  assert.equal(l.trackingNumber, 'TRK1');
  assert.equal(l.qtyAtWarehouse, 4);
  assert.equal(l.qtyOnSite, 2);
  assert.equal(l.qtyBackordered, 4);
});

test('a job with no lines has nothing to publish', async () => {
  const db = fakeDb({ shipments: [] });
  assert.equal(await publishSchedule(db, 'p1', 'u1'), null);
  assert.equal(db.copies.length, 0);
});

test('a date still to come does not publish', async () => {
  const db = fakeDb({ autoAt: LATER });
  assert.equal(await publishIfDue(db, 'p1', NOW), null);
  assert.equal(db.copies.length, 0);
  assert.equal(db.autoAt, LATER);
});

test('no date does not publish', async () => {
  const db = fakeDb();
  assert.equal(await publishIfDue(db, 'p1', NOW), null);
  assert.equal(db.copies.length, 0);
});

test('a date that has arrived publishes once and clears', async () => {
  const db = fakeDb({ autoAt: DUE });
  const copy = await publishIfDue(db, 'p1', NOW);
  assert.equal(copy.how, 'AUTOMATIC');
  assert.equal(db.copies[0].data.publishedById, null);
  assert.equal(db.autoAt, null);
  assert.equal(await publishIfDue(db, 'p1', NOW), null);
  assert.equal(db.copies.length, 1);
});

test('when two screens open at once only one publishes', async () => {
  const db = fakeDb({ autoAt: DUE });
  const results = await Promise.all([publishIfDue(db, 'p1', NOW), publishIfDue(db, 'p1', NOW)]);
  assert.equal(results.filter(Boolean).length, 1);
  assert.equal(db.copies.length, 1);
});

test('a job with no lines keeps its date until it has some', async () => {
  const db = fakeDb({ shipments: [], autoAt: DUE });
  assert.equal(await publishIfDue(db, 'p1', NOW), null);
  assert.equal(db.autoAt, DUE);
});

test('a failed automatic publish still lets the client read the last copy', async () => {
  const db = fakeDb({ autoAt: DUE });
  db.shipment.findMany = async () => { throw new Error('database down'); };
  const realError = console.error;
  console.error = () => {};
  try {
    assert.equal(await publishIfDueSafely(db, 'p1'), null);
    const v = await publishedSchedule(db, 'p1');
    assert.deepEqual(v.shipments, []);
  } finally {
    console.error = realError;
  }
});
