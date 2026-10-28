// Bid step 3 (Mike 10-28): the Sage alternate column, from the list Mike approved.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sageAlternate, sageColumn } from '../../src/lib/bidLeveling/sageAlternates.js';
import { buildMatrix } from '../../src/lib/bidLeveling/engine.js';
import { leveledSheets } from '../../src/lib/bidLeveling/exportSheet.js';
import { ILC_BID, FISHER_BID } from './_sunValleyBids.mjs';

const name = (description, extra = {}) => sageAlternate({ description, qty: 10, ...extra }).name;

test('main items get a plain Sage name with the size matched', () => {
  assert.equal(name('7" LED surface disk'), 'Eluma 7 inch disk');
  assert.equal(name('LED disk', { catalog: 'DL-6-30K' }), 'Eluma 6 inch disk');
  assert.equal(name('4 in canless wafer'), 'Candela 4 inch slim recessed wafer');
  assert.equal(name('6" recessed downlight'), 'Candela 6 inch recessed downlight');
  assert.equal(name('52" ceiling fan with light kit'), 'Eluma 52 inch ceiling fan with light');
  assert.equal(name('Exit sign, edge lit, double face'), 'Eluma edge lit exit sign');
  assert.equal(name('Emergency light, two head, thermoplastic'), 'Eluma dual head emergency light');
  assert.equal(name('8 ft LED wrap'), 'Two Eluma 4 ft strip lights');
  assert.equal(name('2x4 flat panel'), 'Eluma 2x4 flat panel');
  assert.equal(name('Vapor tight garage fixture'), 'Eluma garage light');
  assert.equal(name('Area light, Type IV, pole mounted'), 'Eluma area light, Type 4');
  assert.equal(name('Exterior wall sconce at patio'), 'Eluma outdoor wall lantern');
  assert.equal(name('Wall sconce'), 'Eluma cylinder wall sconce');
  assert.equal(name('12" under cabinet light'), 'Eluma 12 inch under cabinet light');
});

test('a disk with a battery is still a disk, not an emergency light', () => {
  assert.equal(name('6" disk with EM battery backup'), 'Eluma 6 inch disk');
});

test('poles are their own row with height', () => {
  assert.equal(sageAlternate({ description: '20 ft square steel pole', isPole: true }).name, 'Terrain 20 ft square steel pole');
});

test('unit decoratives and the corridor unit entry sconce', () => {
  assert.equal(name('24" vanity light, 3 lamp'), 'Eluma 24 inch vanity bar');
  assert.equal(name('Lighted mirror 30 x 36'), 'Eluma lighted mirror');
  assert.equal(name('Unit kitchen island pendant'), 'Eluma mini pendant');
  assert.equal(name('Wall sconce at unit entry door'), 'Dunton House unit number sconce');
  assert.equal(sageAlternate({ description: 'Unit kitchen island pendant', qty: 5 }).group, 'UNIT');
});

test('other decoratives only over 50', () => {
  const few = sageAlternate({ description: 'Lobby chandelier', qty: 2 });
  assert.equal(few.name, null);
  assert.match(few.why, /50 or fewer/);
  assert.equal(sageAlternate({ description: 'Amenity pendant', qty: 51 }).name, 'Dunton House pendant, closest look');
});

test('no alternate for lamps, large fans and track; Sage lines stay as they are', () => {
  assert.equal(name('A19 LED lamp'), null);
  assert.equal(name('72" amenity ceiling fan'), null);
  assert.equal(name('Track head'), null);
  assert.equal(sageAlternate({ description: '7" disk', mfr: 'Eluma' }).why, 'Already Sage');
  assert.equal(sageAlternate({ description: 'Thing' }).why, 'Kind not read');
});

test('the Excel By type tab carries the Sage name and no part number', () => {
  const bids = [ILC_BID, FISHER_BID];
  const matrix = buildMatrix(bids, 'fisher');
  const view = { bids, matrix, normalized: { perBid: {} }, leveling: {} };
  const col = sageColumn(view);
  assert.equal(Object.keys(col).length, matrix.types.length);
  const t = leveledSheets(view).find((x) => x.name === 'By type');
  assert.equal(t.rows[0][1], 'Sage alternate');
  for (const r of t.rows.slice(2)) assert.equal(r[1], col[matrix.types[t.rows.indexOf(r) - 2].key].name || '');
  assert.equal(t.merges[0].s.c, 2);
});
