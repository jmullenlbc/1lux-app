/**
 * Deal history, written for a person reading one project.
 *
 * Mike, 2026-09-08: "All of this should write in the history of a project right?"
 *
 * The charts and the History tab must never tell different stories, so both are
 * fed from the rows recordStatusChanges() writes. These tests pin two things:
 * the sentence a person reads uses the BOARD names and the STATUS labels from
 * src/lib/pipeline.js (never a second typed-out copy, that is this codebase's
 * recurring bug), and recordStatusChanges hands its rows back so the History tab
 * can be written from the same source.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { describeStatusChange, recordStatusChanges } from '../../src/lib/statusEvents.js';

test('a brand-new board reads as an opening, not a move', () => {
  const line = describeStatusChange({ pipeline: 'DESIGN', fromStatus: null, toStatus: 'OPEN' });
  assert.equal(line, 'Added to the **Design** board as **Open**');
});

test('a status move names the board, both ends and the reason', () => {
  const line = describeStatusChange({
    pipeline: 'PROCUREMENT', fromStatus: 'OPEN', toStatus: 'LOST', reason: 'Price',
  });
  assert.equal(line, 'Procurement project moved from Open to **Lost**: Price');
});

test('no reason given means no dangling dash', () => {
  const line = describeStatusChange({ pipeline: 'DESIGN', fromStatus: 'OPEN', toStatus: 'WON' });
  assert.equal(line, 'Design project moved from Open to **Won**');
});

/** A stand-in for Prisma that just remembers what it was asked to write. */
function fakeDb() {
  const written = [];
  return { written, projectStatusEvent: { createMany: async ({ data }) => { written.push(...data); } } };
}

const FULL_DESIGN = { id: 'p1', serviceType: 'fullDesign' };

test('the rows written come back so the History tab can use them', async () => {
  const db = fakeDb();
  const rows = await recordStatusChanges(
    db,
    { ...FULL_DESIGN, procurementStatus: 'OPEN', designStatus: 'OPEN' },
    { ...FULL_DESIGN, procurementStatus: 'OPEN', designStatus: 'WON' },
    'u1',
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].pipeline, 'DESIGN');
  assert.equal(rows[0].toStatus, 'WON');
  assert.deepEqual(db.written, rows);
  assert.equal(describeStatusChange(rows[0]), 'Design project moved from Open to **Won**');
});

test('joining the Design board is an opening row, not a status move', async () => {
  const db = fakeDb();
  const rows = await recordStatusChanges(
    db,
    { id: 'p1', serviceType: 'bidOnly', procurementStatus: 'OPEN' },
    { ...FULL_DESIGN, procurementStatus: 'OPEN', designStatus: 'OPEN' },
    'u1',
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].pipeline, 'DESIGN');
  assert.equal(rows[0].fromStatus, null);
});

test('nothing moved means nothing written and nothing to say', async () => {
  const db = fakeDb();
  const same = { ...FULL_DESIGN, procurementStatus: 'OPEN', designStatus: 'OPEN' };
  assert.deepEqual(await recordStatusChanges(db, same, same, 'u1'), []);
  assert.equal(db.written.length, 0);
});

test('a failed history write never throws at the person saving the project', async () => {
  const db = { projectStatusEvent: { createMany: async () => { throw new Error('db down'); } } };
  const rows = await recordStatusChanges(
    db,
    { ...FULL_DESIGN, procurementStatus: 'OPEN', designStatus: 'OPEN' },
    { ...FULL_DESIGN, procurementStatus: 'OPEN', designStatus: 'WON' },
    'u1',
  );
  assert.deepEqual(rows, []);
});
