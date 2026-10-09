// No-drawings path on the public budget tool (Mike 10-9: "the live budgeting
// on the right side isn't populating"). The server prices only once the five
// required boxes are in; the sidebar must say which ones are still blank
// instead of "Upload your drawings".
// Run: node --test scripts/tests/intakeNoDrawingsSidebar.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { noDrawingsReady } from '../../src/lib/intake/questionnaire.js';
import { computeIntakeEstimate } from '../../src/lib/intake/estimate.js';

const ROOT = new URL('../../', import.meta.url);
const read = p => readFileSync(new URL(p, ROOT), 'utf8');

const full = {
  projectType: 'Garden (3 Levels)', noDrawings: 'yes',
  figureTotalUnits: '120', figureStories: '3', figureSurfaceParking: '150', figureExteriorAmenitySf: '0', figureAvgUnitSf: '900',
};

test('noDrawingsReady names every blank required box', () => {
  assert.deepEqual(noDrawingsReady(full), { ready: true, missing: [] });
  const { ready, missing } = noDrawingsReady({ ...full, figureExteriorAmenitySf: '', figureSurfaceParking: '' });
  assert.equal(ready, false);
  assert.deepEqual(missing, ['Surface parking stalls', 'Exterior amenity SF (0 if none)']);
  // Average unit size alone satisfies the size requirement; neither size does not.
  assert.equal(noDrawingsReady({ ...full, figureAvgUnitSf: '' }).ready, false);
  assert.equal(noDrawingsReady({ ...full, figureAvgUnitSf: '', figureGrossSf: '108,000' }).ready, true);
});

test('the typed-in estimate prices once the minimum is in, and not before', () => {
  const r = computeIntakeEstimate({ answers: full, drawings: null });
  assert.ok(r.projectData.grossSf > 0, 'gross SF is derived from units x average unit size');
  assert.ok(r.budget && r.budget.sections, 'a budget comes back');
  const partial = computeIntakeEstimate({ answers: { ...full, figureExteriorAmenitySf: '' }, drawings: null });
  assert.equal(partial.budget, null);
  assert.equal(partial.projectData, null);
});

test('provisional: the sidebar prices from a unit count alone, labeled rough; strict callers still refuse', () => {
  const onlyUnits = { noDrawings: 'yes', figureTotalUnits: '120' };
  const r = computeIntakeEstimate({ answers: onlyUnits, drawings: null, provisional: true });
  assert.ok(r.budget && r.budget.totalWithControls > 0, 'a rough number comes back');
  assert.equal(r.provisional, true);
  assert.equal(r.range, null, 'no "likely between" band on a rough number');
  assert.ok(r.missing.includes('Project type') && r.missing.includes('Stories'));
  // The PDF and hand-off call without provisional and still get nothing.
  assert.equal(computeIntakeEstimate({ answers: onlyUnits, drawings: null }).budget, null);
  // No units, no number, even provisionally.
  assert.equal(computeIntakeEstimate({ answers: { noDrawings: 'yes' }, drawings: null, provisional: true }).budget, null);
  // Filling the five boxes turns the rough number into the real one.
  const real = computeIntakeEstimate({ answers: full, drawings: null, provisional: true });
  assert.ok(!real.provisional && real.range);
  // Partial: typed figures move the rough number.
  const more = computeIntakeEstimate({ answers: { ...onlyUnits, projectType: 'Garden (3 Levels)', figureAvgUnitSf: '1200' }, drawings: null, provisional: true });
  assert.ok(more.budget.totalWithControls !== r.budget.totalWithControls);
});

test('the sidebar placeholder lists the missing boxes and reports a failed price call', () => {
  const src = read('src/app/conceptual_budget/IntakeClient.jsx');
  assert.match(src, /manual && !manualCheck\.ready \? \(/);
  assert.match(src, /manualCheck\.missing\.map\(/);
  assert.match(src, /setEstimateStatus\(res\.status\)/);
  assert.match(src, /The live price did not come back/);
});
