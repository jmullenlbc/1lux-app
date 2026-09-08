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
 *   3. A job counts once but appears on both boards (Mike, 2026-09-08). Each
 *      board carries only its own money and its own status, the two added
 *      together are the job's combined revenue, and deals won are always
 *      reported as design wins and procurement wins rather than one number.
 *
 * Run: node --test scripts/tests/dashboardFilters.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  filtersToWhere, rowPassesFilters, runWidget, RELATIVE_DATE_OPTIONS, __testing,
} from '../../src/lib/dashboardEngine.js';
import { DESIGN_SERVICE_TYPES, boardRows, combinedRevenue } from '../../src/lib/pipeline.js';

const { getDealKey, countJobs, wonByBoard } = __testing;

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

test('stage and status are not asked of the database at all', () => {
  // They belong to a board row, not to a job. Asking Prisma for
  // procurementStage/procurementStatus threw away any job whose DESIGN side
  // matched, which is exactly the case Mike cares about.
  assert.deepEqual(filtersToWhere([{ field: 'stage', operator: 'is_any_of', value: ['PRECONSTRUCTION'] }]), {});
  assert.deepEqual(filtersToWhere([{ field: 'dealStatus', operator: 'is_any_of', value: ['OPEN'] }]), {});
});

test('two project-level filters combine instead of one winning', () => {
  const where = filtersToWhere([
    { field: 'pipeline',    operator: 'is',        value: 'DESIGN' },
    { field: 'serviceType', operator: 'is_any_of', value: ['fullDesign'] },
  ]);
  assert.deepEqual(where, { AND: [
    { serviceType: { in: DESIGN_SERVICE_TYPES } },
    { serviceType: { in: ['fullDesign'] } },
  ] });
});

// ── One job, two boards (Mike, 2026-09-08) ──────────────────────────────────
// "It counts once, but shows on 2 dash boards. Each dashboard only cares about
// product sales (PROCUREMENT) or design fees (DESIGN)."

const FULL_DESIGN_JOB = {
  id: 'p1', serviceType: 'fullDesign',
  contractValue: 400_000, designContractValue: 60_000,
  procurementStage: 'BUYOUT',       procurementStatus: 'OPEN',
  designStage:      'CONSTRUCTION', designStatus:      'WON',
};
const BID_ONLY_JOB = {
  id: 'p2', serviceType: 'bidOnly',
  contractValue: 100_000, designContractValue: null,
  procurementStage: 'QUALIFIED', procurementStatus: 'OPEN',
};

test('a full-design job is on both boards; a bid-only job is on one', () => {
  assert.deepEqual(boardRows(FULL_DESIGN_JOB).map(r => r.pipeline), ['PROCUREMENT', 'DESIGN']);
  assert.deepEqual(boardRows(BID_ONLY_JOB).map(r => r.pipeline),    ['PROCUREMENT']);
});

test('each board carries only its own money', () => {
  const [proc, design] = boardRows(FULL_DESIGN_JOB);
  assert.equal(proc.revenue,   400_000);   // product sales
  assert.equal(design.revenue,  60_000);   // design fee
});

test('combined revenue is the design fee plus the product sales', () => {
  assert.equal(combinedRevenue(FULL_DESIGN_JOB), 460_000);
  assert.equal(combinedRevenue(BID_ONLY_JOB),    100_000);
});

test('each board carries its own status — won on one, open on the other', () => {
  const [proc, design] = boardRows(FULL_DESIGN_JOB);
  assert.equal(proc.status,   'OPEN');
  assert.equal(design.status, 'WON');
});

// ── Row-level filtering, applied after the split ────────────────────────────

test('filtering to the Design board keeps only the design row', () => {
  const filters = [{ field: 'pipeline', operator: 'is', value: 'DESIGN' }];
  const kept = boardRows(FULL_DESIGN_JOB).filter(r => rowPassesFilters(r, filters));
  assert.deepEqual(kept.map(r => r.pipeline), ['DESIGN']);
});

test('a job won on Design but open on Procurement survives a "won" filter', () => {
  const filters = [{ field: 'dealStatus', operator: 'is_any_of', value: ['WON'] }];
  const kept = boardRows(FULL_DESIGN_JOB).filter(r => rowPassesFilters(r, filters));
  assert.equal(kept.length, 1);
  assert.equal(kept[0].pipeline, 'DESIGN');
});

test('a stage filter matches a legacy design key as the stage it became', () => {
  const legacy  = { ...FULL_DESIGN_JOB, designStage: 'CONSTRUCTION_ADMIN' };
  const filters = [{ field: 'stage', operator: 'is_any_of', value: ['CONSTRUCTION'] }];
  const kept = boardRows(legacy).filter(r => rowPassesFilters(r, filters));
  assert.deepEqual(kept.map(r => r.pipeline), ['DESIGN']);
});

test('no row-level filters means every row survives', () => {
  assert.equal(boardRows(FULL_DESIGN_JOB).filter(r => rowPassesFilters(r, [])).length, 2);
});

// ── Deals won are always broken out by board ────────────────────────────────

test('wins are reported per board, never as one merged number', () => {
  const deals = [
    { id: 'p1', pipeline: 'PROCUREMENT', dealStatus: 'WON',       revenue: 400_000 },
    { id: 'p1', pipeline: 'DESIGN',      dealStatus: 'WON',       revenue:  60_000 },
    { id: 'p3', pipeline: 'PROCUREMENT', dealStatus: 'COMPLETED', revenue: 200_000 },
    { id: 'p4', pipeline: 'PROCUREMENT', dealStatus: 'LOST',      revenue: 999_999 },
  ];
  const won = wonByBoard(deals);
  assert.equal(won.PROCUREMENT.count,   2);          // won + completed both count as wins
  assert.equal(won.DESIGN.count,        1);
  assert.equal(won.PROCUREMENT.revenue, 600_000);
  assert.equal(won.DESIGN.revenue,       60_000);
  assert.equal(won.total,               3);
});

test('jobs are counted once even though they appear on two boards', () => {
  const deals = [
    { id: 'p1', pipeline: 'PROCUREMENT' },
    { id: 'p1', pipeline: 'DESIGN' },
    { id: 'p2', pipeline: 'PROCUREMENT' },
  ];
  assert.equal(deals.length,       3);   // three deals in play
  assert.equal(countJobs(deals),   2);   // on two actual jobs
});

// ── The whole widget, end to end, on a stand-in database ────────────────────

/** A stand-in for Prisma holding exactly the rows a test cares about. */
function fakeDb(projects, statusEvents = []) {
  return {
    project: { findMany: async () => projects },
    projectStatusEvent: {
      findMany: async ({ where }) => statusEvents.filter(e =>
        where.projectId.in.includes(e.projectId) &&
        (where.approximated === undefined || e.approximated === where.approximated)
      ),
    },
  };
}

const JOBS = [
  { ...FULL_DESIGN_JOB, expectedOrderDate: null, createdAt: new Date('2026-01-01'),
    salesOwner: { id: 'u1', name: 'Mike' } },
  { ...BID_ONLY_JOB,    expectedOrderDate: null, createdAt: new Date('2026-01-01'),
    salesOwner: { id: 'u1', name: 'Mike' } },
];

test('a revenue chart left on both boards shows the combined total', async () => {
  const res = await runWidget(
    { category: 'REVENUE', metric: 'value', viewBy: 'owner', segmentBy: 'pipeline', filters: '[]' },
    fakeDb(JOBS),
  );
  const mike = res.series.find(r => r.label === 'Mike');
  // 400k product + 60k design on job one, 100k product on job two.
  assert.equal(mike.Procurement + mike.Design, 560_000);
  assert.equal(mike.Design, 60_000);
  assert.equal(res.meta.dealCount, 3);   // three board rows
  assert.equal(res.meta.jobCount,  2);   // on two jobs
});

test('a design fee chart never quietly adds product sales in', async () => {
  const res = await runWidget(
    { category: 'REVENUE', metric: 'designFee', viewBy: 'owner', segmentBy: null, filters: '[]' },
    fakeDb(JOBS),
  );
  assert.equal(res.meta.totalWon, 60_000);          // the won design fee, nothing else
  assert.equal(res.meta.won.PROCUREMENT.revenue, 0);
});

test('the stat strip always breaks wins out by board', async () => {
  const res = await runWidget(
    { category: 'DEAL_COUNT', metric: 'count', viewBy: 'owner', segmentBy: 'pipeline', filters: '[]' },
    fakeDb(JOBS),
  );
  assert.equal(res.meta.won.DESIGN.count,      1);
  assert.equal(res.meta.won.PROCUREMENT.count, 0);
});

test('a duration chart measures real close dates and reports the rest', async () => {
  const events = [
    // A real close: recorded as it happened.
    { projectId: 'p1', pipeline: 'DESIGN', toStatus: 'OPEN', changedAt: new Date('2026-01-01'), approximated: false },
    { projectId: 'p1', pipeline: 'DESIGN', toStatus: 'WON',  changedAt: new Date('2026-01-31'), approximated: false },
    // A guessed close from the backfill: must not be averaged in.
    { projectId: 'p2', pipeline: 'PROCUREMENT', toStatus: 'OPEN', changedAt: new Date('2026-01-01'), approximated: true },
    { projectId: 'p2', pipeline: 'PROCUREMENT', toStatus: 'LOST', changedAt: new Date('2026-06-01'), approximated: true },
  ];
  const jobs = [
    JOBS[0],
    { ...JOBS[1], procurementStatus: 'LOST' },
  ];
  const res = await runWidget(
    { category: 'DURATION', metric: 'days', viewBy: 'owner', segmentBy: 'pipeline', filters: '[]' },
    fakeDb(jobs, events),
  );
  assert.equal(res.meta.dealCount, 1);           // only the deal with real dates
  assert.equal(res.meta.closedWithoutDate, 1);   // the guessed one is counted, not averaged
  assert.equal(res.series.find(r => r.label === 'Mike').Design, 30);
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
