/**
 * Per-area budget alerts (Mike 2026-09-24): "do it by area of the building.
 * Does that area of the building seem out of whack or totally off from the
 * questionnaire they answered originally."
 *
 * Run: node --test scripts/tests/areaNorms.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { areaNorms, areaAlerts, areaJobsAlert, areaBaseAlert, areaDollars, AREA_KEYS } from '../../src/lib/calibration/areaNorms.js';

// One garden job of 100 units with `garage` $ per unit.
const job = (garage, trust = 'real') => ({ buildingType: 'garden', units: 100, trust, areas: { garage: garage * 100, units: 1000 * 100 } });
const five = [100, 110, 120, 130, 140].map(g => job(g));
const ctx = { buildingType: 'garden', units: 200 };

test('areaDollars reads the sidebar areas off a budget', () => {
  const d = areaDollars({ sections: { units: { total: { product: 10 } }, garage: { product: 5 } }, controls: 7 });
  assert.deepEqual(Object.keys(d), AREA_KEYS);
  assert.equal(d.units, 10); assert.equal(d.garage, 5); assert.equal(d.controls, 7); assert.equal(d.boh, 0);
});

test('learns $ per unit from real jobs only; tool-guess budgets never count', () => {
  const n = areaNorms([...five, job(900, null), job(900, null)]);
  assert.equal(n.garden.garage.jobs, 5);
  assert.equal(n.garden.garage.median, 120);
});

test('client-typed budgets count only inside the normal range', () => {
  const n = areaNorms([...five, job(115, 'client'), job(2000, 'client')]);
  assert.equal(n.garden.garage.jobs, 6);
});

test('out of whack against our jobs: high, low, zero — and quiet inside the range', () => {
  const n = areaNorms(five);
  const high = areaJobsAlert('garage', 300 * 200, ctx, n);
  assert.equal(high.way, 'high');
  assert.match(high.text, /our 5 garden jobs usually run/);
  assert.equal(areaJobsAlert('garage', 40 * 200, ctx, n).way, 'low');
  assert.equal(areaJobsAlert('garage', 0, ctx, n).way, 'zero');
  assert.equal(areaJobsAlert('garage', 120 * 200, ctx, n), null);
});

test('fewer than five real jobs, or no building type → no jobs alert', () => {
  assert.equal(areaJobsAlert('garage', 999999, ctx, areaNorms(five.slice(0, 4))), null);
  assert.equal(areaJobsAlert('garage', 999999, { units: 200 }, areaNorms(five)), null);
});

test('totally off the original questionnaire: up, down, gone, new', () => {
  const check = { baseAmount: 20000, baseUnits: 200, baseFrom: 'questionnaire' };
  assert.equal(areaBaseAlert('garage', 50000, ctx, check).way, 'high');
  assert.match(areaBaseAlert('garage', 50000, ctx, check).text, /original questionnaire/);
  assert.equal(areaBaseAlert('garage', 5000, ctx, check).way, 'low');
  assert.equal(areaBaseAlert('garage', 0, ctx, check).way, 'gone');
  assert.equal(areaBaseAlert('garage', 25000, ctx, check), null);
  assert.equal(areaBaseAlert('garage', 40000, ctx, { ...check, baseAmount: 0 }).way, 'new');
  assert.match(areaBaseAlert('garage', 40000, ctx, { ...check, baseFrom: 'web-request', baseAmount: 0 }).text, /web request/);
});

test('a move is judged against the size of that area: small areas speak up, big ones need a big move', () => {
  const was = (baseAmount) => ({ baseAmount, baseUnits: 200 });
  assert.equal(areaBaseAlert('exitSigns', 4000, ctx, was(1000)).way, 'high');
  assert.equal(areaBaseAlert('exitSigns', 1300, ctx, was(1000)), null);
  assert.equal(areaBaseAlert('units', 305000, ctx, was(300000)), null);
  assert.equal(areaBaseAlert('units', 380000, ctx, was(300000)), null);
  assert.equal(areaBaseAlert('units', 700000, ctx, was(300000)).way, 'high');
  // Pennies stay quiet whatever the percentage.
  assert.equal(areaBaseAlert('exitSigns', 600, ctx, was(200)), null);
});

test('once 5+ real jobs exist, "normal size" is what our jobs spend on that area here', () => {
  const n = areaNorms(five); // garage median $120/unit × 200 units = $24,000 normal
  const was = { baseAmount: 4000, baseUnits: 200 };
  assert.equal(areaBaseAlert('garage', 10000, ctx, was, n), null);          // +$6K, under 30% of $24K
  assert.equal(areaBaseAlert('garage', 30000, ctx, was, n).way, 'high');   // +$26K
});

test('a bigger building is not a surprise: compared per unit when the unit count moved', () => {
  const check = { baseAmount: 20000, baseUnits: 100 };
  assert.equal(areaBaseAlert('garage', 40000, ctx, check), null);
  assert.equal(areaBaseAlert('garage', 90000, ctx, check).way, 'high');
});

test('"It\'s right" silences an area until it moves off the checked figure', () => {
  const n = areaNorms(five);
  const dollars = { garage: 60000 };
  assert.ok(areaAlerts(dollars, ctx, n, {}).garage);
  assert.equal(areaAlerts(dollars, ctx, n, { garage: { okAmount: 60000 } }).garage, undefined);
  assert.ok(areaAlerts({ garage: 90000 }, ctx, n, { garage: { okAmount: 60000 } }).garage);
});

test('both checks can speak for one area', () => {
  const out = areaAlerts({ garage: 60000 }, ctx, areaNorms(five), { garage: { baseAmount: 20000, baseUnits: 200 } });
  assert.deepEqual(out.garage.map(a => a.kind), ['jobs', 'questionnaire']);
});

test('the public form never gets the area alerts', () => {
  const intake = readFileSync(new URL('../../src/app/conceptual_budget/IntakeClient.jsx', import.meta.url), 'utf8');
  assert.doesNotMatch(intake, /AreaAlerts|areaNorms|areaNotes/);
  const sidebar = readFileSync(new URL('../../src/components/wizard/BudgetSidebar.jsx', import.meta.url), 'utf8');
  assert.doesNotMatch(sidebar, /import[^\n]*(AreaAlerts|areaNorms)/);
});
