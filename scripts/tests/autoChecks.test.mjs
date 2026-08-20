/**
 * Deterministic auto-checks — Step 16.
 *
 * Focused on `extract.unitMatrix`, the first check wired to a real feature and
 * the one every conceptual budget depends on. Pure arithmetic, so these tests
 * need no database, no model and no store: they hand the checker an extraction
 * and assert what it concludes.
 *
 * The cases that matter most are the ones where the answer is `null` rather than
 * `true`. A check that could not run must never read as a check that passed.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runAutoChecks, bedroomsFromCode } from '../../src/lib/agent/autoChecks.js';

const TASK = 'extract.unitMatrix';

/** A clean extraction that should pass everything it can run. */
function goodMatrix(over = {}) {
  return {
    unitTypes: [
      { code: 'STUDIO', qty: 20, unitSf: 520,  bedrooms: 0, confidence: 0.95 },
      { code: '1BR-A',  qty: 60, unitSf: 720,  bedrooms: 1, confidence: 0.95 },
      { code: '2BR-K',  qty: 40, unitSf: 1080, bedrooms: 2, confidence: 0.9  },
    ],
    projectTotals: {
      grossInteriorSf: 120000,   // net = 10400+43200+43200 = 96,800 → 81% of gross
      statedTotalUnits: 120,
    },
    ...over,
  };
}

function statusOf(res, key) {
  return res.checks.find(c => c.key === key)?.status ?? null;
}

// ── the happy path ───────────────────────────────────────────────────────────

test('a consistent unit matrix passes every check it can run', async () => {
  const res = await runAutoChecks(TASK, goodMatrix());
  assert.equal(res.ran, true);
  assert.equal(res.pass, true, res.checks.map(c => `${c.key}:${c.status} ${c.detail}`).join('\n'));
  assert.equal(statusOf(res, 'stated-total'), 'PASS');
  assert.equal(statusOf(res, 'sf-reconcile'), 'PASS');
  assert.equal(statusOf(res, 'bedroom-code'), 'PASS');
});

// ── the check that catches the expensive mistake ─────────────────────────────

test('rows that do not add up to the stated total fail', async () => {
  const m = goodMatrix();
  m.unitTypes.pop();                       // 40 two-bedrooms vanish
  const res = await runAutoChecks(TASK, m);
  assert.equal(res.pass, false);
  assert.equal(statusOf(res, 'stated-total'), 'FAIL');
  assert.match(res.checks.find(c => c.key === 'stated-total').detail, /80 units but the document states 120/);
  assert.match(res.checks.find(c => c.key === 'stated-total').detail, /40 unit\(s\) missing/);
});

test('a matrix with more rows than the document states also fails', async () => {
  const m = goodMatrix();
  m.unitTypes.push({ code: '3BR-B', qty: 10, unitSf: 1400, bedrooms: 3 });
  const res = await runAutoChecks(TASK, m);
  assert.equal(statusOf(res, 'stated-total'), 'FAIL');
  assert.match(res.checks.find(c => c.key === 'stated-total').detail, /10 unit\(s\) extra/);
});

test('no stated total means SKIP — never a silent pass', async () => {
  const m = goodMatrix();
  m.projectTotals.statedTotalUnits = null;
  const res = await runAutoChecks(TASK, m);
  assert.equal(statusOf(res, 'stated-total'), 'SKIP');
  // The other checks still ran, so the overall verdict is still a real one.
  assert.equal(res.pass, true);
});

// ── SF reconciliation ────────────────────────────────────────────────────────

test('units cannot occupy more space than the building', async () => {
  const m = goodMatrix();
  m.projectTotals.grossInteriorSf = 50000;  // net is 96,800
  const res = await runAutoChecks(TASK, m);
  assert.equal(statusOf(res, 'sf-reconcile'), 'FAIL');
  assert.match(res.checks.find(c => c.key === 'sf-reconcile').detail, /cannot occupy more space/);
});

test('unit SF far below gross means rows are missing', async () => {
  const m = goodMatrix();
  m.projectTotals.grossInteriorSf = 400000; // net is 24% of gross
  const res = await runAutoChecks(TASK, m);
  assert.equal(statusOf(res, 'sf-reconcile'), 'FAIL');
  assert.match(res.checks.find(c => c.key === 'sf-reconcile').detail, /probably missing/);
});

test('net rentable sitting a hair above gross is inside tolerance', async () => {
  const m = goodMatrix();
  m.projectTotals.grossInteriorSf = 96000;  // net 96,800 — 0.8% over
  const res = await runAutoChecks(TASK, m);
  assert.equal(statusOf(res, 'sf-reconcile'), 'PASS');
});

test('missing gross interior SF skips the reconciliation rather than failing it', async () => {
  const m = goodMatrix();
  m.projectTotals.grossInteriorSf = null;
  const res = await runAutoChecks(TASK, m);
  assert.equal(statusOf(res, 'sf-reconcile'), 'SKIP');
});

// ── row integrity ────────────────────────────────────────────────────────────

test('an empty matrix fails — there is nothing to price', async () => {
  const res = await runAutoChecks(TASK, { unitTypes: [], projectTotals: {} });
  assert.equal(res.pass, false);
  assert.equal(statusOf(res, 'rows'), 'FAIL');
});

test('a fractional or zero quantity fails', async () => {
  for (const qty of [0, -3, 2.5]) {
    const m = goodMatrix();
    m.unitTypes[0].qty = qty;
    const res = await runAutoChecks(TASK, m);
    assert.equal(statusOf(res, 'rows'), 'FAIL', `qty ${qty} should fail`);
  }
});

test('a duplicated type code fails — those units would be counted twice', async () => {
  const m = goodMatrix();
  m.unitTypes.push({ code: '1br-a', qty: 5, unitSf: 720, bedrooms: 1 });
  const res = await runAutoChecks(TASK, m);
  assert.equal(statusOf(res, 'duplicate-codes'), 'FAIL');
  assert.match(res.checks.find(c => c.key === 'duplicate-codes').detail, /1br-a/);
});

test('a building total landing in a per-unit cell fails the range check', async () => {
  const m = goodMatrix();
  m.unitTypes[1].unitSf = 164000;
  const res = await runAutoChecks(TASK, m);
  assert.equal(statusOf(res, 'unit-sf-range'), 'FAIL');
});

test('no unit SF at all skips the range check', async () => {
  const m = goodMatrix();
  m.unitTypes.forEach(r => { r.unitSf = null; });
  const res = await runAutoChecks(TASK, m);
  assert.equal(statusOf(res, 'unit-sf-range'), 'SKIP');
  assert.equal(statusOf(res, 'sf-reconcile'), 'SKIP');
});

// ── bedroom counts vs the code that names them ───────────────────────────────

test('a bedroom count contradicting its own type code fails', async () => {
  const m = goodMatrix();
  m.unitTypes[2].bedrooms = 3;              // code says 2BR
  const res = await runAutoChecks(TASK, m);
  assert.equal(statusOf(res, 'bedroom-code'), 'FAIL');
  assert.match(res.checks.find(c => c.key === 'bedroom-code').detail, /2BR-K says 3 bedroom/);
});

test('bedroomsFromCode only answers when the code actually says', () => {
  assert.equal(bedroomsFromCode('2BR-K'),   2);
  assert.equal(bedroomsFromCode('1 BR'),    1);
  assert.equal(bedroomsFromCode('3BEDROOM'),3);
  assert.equal(bedroomsFromCode('STUDIO-A'),0);
  assert.equal(bedroomsFromCode('EFF'),     0);
  // Stack and building codes must not be read as bedroom counts.
  assert.equal(bedroomsFromCode('S-1'),   null);
  assert.equal(bedroomsFromCode('B2'),    null);
  assert.equal(bedroomsFromCode('A1'),    null);
  assert.equal(bedroomsFromCode(null),    null);
  // A bathroom count is not a bedroom count.
  assert.equal(bedroomsFromCode('2BA'),   null);
});

test('codes that state no bedroom count skip the check rather than guessing', async () => {
  const m = goodMatrix();
  m.unitTypes = [{ code: 'A1', qty: 120, unitSf: 800, bedrooms: 1 }];
  m.projectTotals.grossInteriorSf = null;
  const res = await runAutoChecks(TASK, m);
  assert.equal(statusOf(res, 'bedroom-code'), 'SKIP');
});

// ── the three-valued contract ────────────────────────────────────────────────

test('an unknown task type has no opinion — null, not true', async () => {
  const res = await runAutoChecks('extract.somethingNobodyWiredYet', { anything: 1 });
  assert.equal(res.ran, false);
  assert.equal(res.pass, null);
});

test('a check that throws reports FAIL, not SKIP', async () => {
  // A getter that blows up mid-check stands in for any future check crashing on
  // a shape it did not expect. Evidence about this output routes to a human.
  const hostile = { get unitTypes() { throw new Error('boom'); } };
  const res = await runAutoChecks(TASK, hostile);
  assert.equal(res.ran, true);
  assert.equal(res.pass, false);
  assert.equal(res.checks[0].key, 'check-error');
});
