/**
 * CRM dashboard filters and chart labels (Mike, 2026-09-08: "fix that screen properly").
 *
 * Two separate promises are pinned here:
 *
 *   1. A filter you pick on the screen actually narrows the query. Three of them
 *      did not — Pipeline was thrown away, Service Type was offered in a spelling
 *      the database has never held, and Project Status pointed at a column that
 *      does not exist and made the chart fail to load.
 *
 *   2. A chart never puts a stored value on screen. Grouping by stage said
 *      "PRECONSTRUCTION"; grouping by service type said "fullDesign".
 *
 * Run: node --test scripts/tests/dashboardFilters.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { filtersToWhere, RELATIVE_DATE_OPTIONS, __testing } from '../../src/lib/dashboardEngine.js';
import { DESIGN_SERVICE_TYPES } from '../../src/lib/pipeline.js';

const { getDealKey } = __testing;

// ── Filters that had been doing nothing ──────────────────────────────────────

test('filtering to the Design board narrows to design service types', () => {
  const where = filtersToWhere([{ field: 'pipeline', operator: 'is_any_of', value: ['DESIGN'] }]);
  assert.deepEqual(where, { serviceType: { in: DESIGN_SERVICE_TYPES } });
});

test('the seeded Design Fee Forecast filter (operator "is") narrows too', () => {
  // This is the shape stored in defaultDashboard.js — a plain string, not an array.
  const where = filtersToWhere([{ field: 'pipeline', operator: 'is', value: 'DESIGN' }]);
  assert.deepEqual(where, { serviceType: { in: DESIGN_SERVICE_TYPES } });
});

test('filtering to Procurement does not narrow — every project sells product', () => {
  assert.deepEqual(filtersToWhere([{ field: 'pipeline', operator: 'is', value: 'PROCUREMENT' }]), {});
});

test('a chart saved with the old uppercase service types now matches real rows', () => {
  const where = filtersToWhere([
    { field: 'serviceType', operator: 'is_any_of', value: ['FULL_SERVICE_DESIGN', 'DESIGN_ASSIST'] },
  ]);
  assert.deepEqual(where, { serviceType: { in: ['fullDesign', 'designAssist'] } });
});

test('a service type stored the right way is left alone', () => {
  const where = filtersToWhere([{ field: 'serviceType', operator: 'is_any_of', value: ['peerReview'] }]);
  assert.deepEqual(where, { serviceType: { in: ['peerReview'] } });
});

test('a chart saved with the retired Project Status filter no longer breaks the query', () => {
  // There is no projectStatus column; passing it through to Prisma threw, and the
  // whole chart came back as "Failed to load".
  assert.deepEqual(filtersToWhere([{ field: 'projectStatus', operator: 'is', value: 'ACTIVE' }]), {});
});

test('stage filters still use the stored keys, not the new labels', () => {
  const where = filtersToWhere([{ field: 'stage', operator: 'is_any_of', value: ['PRECONSTRUCTION'] }]);
  assert.deepEqual(where, { procurementStage: { in: ['PRECONSTRUCTION'] } });
});

test('two filters combine instead of one winning', () => {
  const where = filtersToWhere([
    { field: 'pipeline',   operator: 'is',        value: 'DESIGN' },
    { field: 'dealStatus', operator: 'is_any_of', value: ['OPEN'] },
  ]);
  assert.deepEqual(where, { AND: [
    { serviceType: { in: DESIGN_SERVICE_TYPES } },
    { procurementStatus: { in: ['OPEN'] } },
  ] });
});

// ── Chart labels ─────────────────────────────────────────────────────────────

test('a chart grouped by stage reads in English', () => {
  assert.equal(getDealKey({ stage: 'PRECONSTRUCTION' }, 'stage'), 'Design / Pre-Con');
  assert.equal(getDealKey({ stage: 'CONSTRUCTION' },    'stage'), 'CA / Procurement');
  // An un-migrated design row still reads properly rather than showing its key.
  assert.equal(getDealKey({ stage: 'CONSTRUCTION_ADMIN' }, 'stage'), 'CA / Procurement');
});

test('a chart grouped by service type or project type reads in English', () => {
  assert.equal(getDealKey({ serviceType: 'fullDesign' },  'serviceType'), 'Full Design');
  assert.equal(getDealKey({ serviceType: 'designAssist' },'serviceType'), 'Design Assist');
  assert.equal(getDealKey({ projectType: 'Senior' },      'projectType'), 'Senior Living');
  assert.equal(getDealKey({ projectType: 'BTR' },         'projectType'), 'Single Family For Rent');
});

test('splitting a chart by deal status no longer lumps everything into one bucket', () => {
  assert.equal(getDealKey({ dealStatus: 'OPEN' }, 'dealStatus'), 'Open');
  assert.equal(getDealKey({ dealStatus: 'WON' },  'dealStatus'), 'Won');
  assert.equal(getDealKey({ dealStatus: 'ABANDONED' }, 'dealStatus'), 'Abandoned');
});

test('a missing value says Unknown rather than showing blank', () => {
  assert.equal(getDealKey({}, 'stage'),       'Unknown');
  assert.equal(getDealKey({}, 'serviceType'), 'Unknown');
  assert.equal(getDealKey({}, 'projectType'), 'Unknown');
});

test('a chart still set to the retired Lost Reason grouping does not crash', () => {
  assert.equal(getDealKey({ dealStatus: 'LOST' }, 'lostReason'), 'Unknown');
});

// ── Date periods ─────────────────────────────────────────────────────────────

test('every date period the picker offers has a written-out name', () => {
  for (const d of RELATIVE_DATE_OPTIONS) {
    assert.ok(d.key && d.label, `${d.key} has a label`);
    assert.ok(!/_/.test(d.label), `${d.key} label reads as words, not a stored key`);
  }
});
