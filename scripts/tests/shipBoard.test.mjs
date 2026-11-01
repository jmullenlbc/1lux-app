// The cross job Ship Schedules screen reads the job's own rows: soonest open ship
// date first, a line's date beats the manufacturer's, finished rows sink.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shipBoardRows, shipStatusMeta } from '../../src/lib/shipBoard.js';

const line = (over = {}) => ({ id: 'l', isRemoved: false, qty: 10, esdDate: null, fixtureStatus: null, deliveryEvents: [], releases: [], ...over });
const ship = (over = {}) => ({ id: 's', manufacturer: 'Acme', esdDate: null, deliveredDate: null, status: 'PO_PLACED', lineItems: [line()], ...over });
const job  = (shipments, over = {}) => ({ id: 'p', name: 'Job', assignees: [], shipments, ...over });

test('a line date wins, the manufacturer date covers lines with none, finished lines do not count', () => {
  const [r] = shipBoardRows([job([ship({
    esdDate: '2026-12-20T00:00:00.000Z',
    lineItems: [
      line({ esdDate: '2026-12-01T00:00:00.000Z', fixtureStatus: 'DELIVERED' }),
      line({ esdDate: '2026-12-10T00:00:00.000Z' }),
      line(),
    ],
  })])]);
  assert.equal(r.nextShip, '2026-12-10T00:00:00.000Z');
  assert.equal(r.openLines, 2);
  assert.equal(r.lines, 3);
});

test('removed lines are not counted', () => {
  const [r] = shipBoardRows([job([ship({ lineItems: [line(), line({ isRemoved: true })] })])]);
  assert.equal(r.lines, 1);
});

test('all landed reads as delivered with no next date', () => {
  const [r] = shipBoardRows([job([ship({
    esdDate: '2026-12-20T00:00:00.000Z',
    lineItems: [line({ deliveryEvents: [{ qtyReceived: 10 }] })],
  })])]);
  assert.equal(r.done, true);
  assert.equal(r.status, 'DELIVERED');
  assert.equal(r.nextShip, null);
  assert.equal(r.warning, null);
});

test('a delivered date on the manufacturer finishes the row', () => {
  const [r] = shipBoardRows([job([ship({ deliveredDate: '2026-10-01T00:00:00.000Z' })])]);
  assert.equal(r.done, true);
});

test('a shipment with no lines still shows its own date', () => {
  const [r] = shipBoardRows([job([ship({ esdDate: '2026-12-20T00:00:00.000Z', lineItems: [] })])]);
  assert.equal(r.done, false);
  assert.equal(r.nextShip, '2026-12-20T00:00:00.000Z');
});

test('a past date warns red', () => {
  const [r] = shipBoardRows([job([ship({ esdDate: '2020-01-01T00:00:00.000Z' })])]);
  assert.equal(r.warning, 'red');
});

test('soonest first, then no date, then finished', () => {
  const rows = shipBoardRows([job([
    ship({ id: 'done', deliveredDate: '2026-10-01T00:00:00.000Z' }),
    ship({ id: 'none' }),
    ship({ id: 'late', esdDate: '2026-12-20T00:00:00.000Z' }),
    ship({ id: 'soon', esdDate: '2026-12-01T00:00:00.000Z' }),
  ])]);
  assert.deepEqual(rows.map(r => r.id), ['soon', 'late', 'none', 'done']);
});

test('mine means this person is a picked PM on the job', () => {
  const rows = shipBoardRows([job([ship()], { assignees: [{ id: 'a' }] }), job([ship()], { id: 'q', name: 'Other' })]);
  assert.deepEqual(rows.map(r => r.mine), [true, false]);
});

test('every status the board can show has a label', () => {
  for (const s of ['PO_PLACED', 'LEAD_TIME_CONFIRMED', 'ESD_CONFIRMED', 'SHIPPED', 'DELIVERED', 'AT_WAREHOUSE', 'PARTIALLY_DELIVERED']) {
    assert.ok(shipStatusMeta(s).label, s);
  }
});
