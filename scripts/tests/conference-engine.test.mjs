import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_PLAN_SETTINGS, computeEdition, computePlan, rankRows, markClashes, settingsFromRows, settingRowsFrom, yearTotals,
} from '../../src/lib/conferences/engine.js';
import { CONFERENCE_SEED } from '../../src/lib/conferences/seedData.js';
import { seriesFromSeed, editionFromSeed, SEED_MEMBERSHIPS } from '../../src/lib/conferences/seedMap.js';

// Conference planner math held to the research file's own answers: every one
// of the 140 rows, then the scenario totals.

const rowsFrom = (settings = DEFAULT_PLAN_SETTINGS, patch = () => ({})) => CONFERENCE_SEED.map(({ series, edition }) => {
  const s = seriesFromSeed(series);
  const e = { ...editionFromSeed(edition), ...patch(edition) };
  const c = computeEdition(e, s, settings);
  return {
    ...c, key: e.key, name: e.name, slug: s.slug, vertical: s.vertical, region: e.region,
    status: e.status, start: e.startDate, end: e.endDate, expected: edition._expected,
  };
});

test('every mapped value is a known one', () => {
  for (const { series, edition } of CONFERENCE_SEED) {
    const s = seriesFromSeed(series), e = editionFromSeed(edition);
    assert.ok(s.vertical && s.accessRoute && s.format, series.slug);
    assert.ok(e.scope && e.regCostBasis, edition.key);
  }
});

test('all 140 rows match on score, tier, per person, headcount and cost', () => {
  const rows = rowsFrom();
  assert.equal(rows.length, 140);
  for (const r of rows) {
    const x = r.expected;
    assert.ok(Math.abs(r.score - x.weightedScore) <= 0.005, `${r.key} score ${r.score} vs ${x.weightedScore}`);
    assert.equal(r.tier, x.tier, `${r.key} tier`);
    assert.ok(Math.abs(r.perPerson - x.perPersonAllIn) <= 1, `${r.key} per person ${r.perPerson} vs ${x.perPersonAllIn}`);
    assert.equal(r.headcount, x.headcount, `${r.key} headcount`);
    assert.ok(Math.abs(r.plannedCost - x.costIfAttended) <= 1, `${r.key} cost ${r.plannedCost} vs ${x.costIfAttended}`);
  }
});

test('counts: 136 series, 7 undated, tiers A 19 B 19 C 100 X 2', () => {
  const rows = rowsFrom();
  assert.equal(new Set(rows.map(r => r.slug)).size, 136);
  assert.equal(rows.filter(r => !r.start).length, 7);
  const tally = {};
  for (const r of rows) tally[r.tier] = (tally[r.tier] || 0) + 1;
  assert.deepEqual(tally, { A: 19, B: 19, C: 100, X: 2 });
});

test('the two barred events cannot be included even when asked', () => {
  const rows = rowsFrom(DEFAULT_PLAN_SETTINGS, () => ({ includeOverride: true }));
  const x = rows.filter(r => r.tier === 'X');
  assert.equal(x.length, 2);
  assert.ok(x.every(r => !r.include));
});

test('Lean, Core, Full and the membership reproduce the plan', () => {
  const memberships = SEED_MEMBERSHIPS.map(m => ({ ...m }));
  const plan = computePlan(rowsFrom(), memberships);
  assert.deepEqual(plan.scenarios.lean, { events: 19, attendeeTrips: 38, subtotal: 57366, contingency: 5736.6, total: 63102.6 });
  assert.deepEqual(plan.scenarios.core, { events: 38, attendeeTrips: 57, subtotal: 89165, contingency: 8916.5, total: 98081.5 });
  assert.deepEqual(plan.scenarios.full, { events: 138, attendeeTrips: 157, subtotal: 432196, contingency: 43219.6, total: 475415.6 });
  assert.deepEqual(plan.scenarios.current, plan.scenarios.core);
  assert.ok(plan.memberships[0].on, 'NMHC turns on by itself');
  assert.equal(plan.dues, 10000);
  assert.equal(plan.grandTotal, 108081.5);
});

test('top five by rank', () => {
  const top = rankRows(rowsFrom()).slice(0, 5).map(r => r.key);
  assert.match(top[0], /^nmhc-annual-meeting/);
  assert.match(top[1], /^interface-student-housing/);
  assert.match(top[2], /^bisnow-multifamily-annual-conference-denver/);
  assert.match(top[3], /^interface-denver/);
  assert.match(top[4], /^interface-active-adult/);
});

test('turning the last NMHC event off drops the dues', () => {
  const rows = rowsFrom(DEFAULT_PLAN_SETTINGS, e => (/^nmhc-/.test(e.key) ? { includeOverride: false } : {}));
  const plan = computePlan(rows, SEED_MEMBERSHIPS.map(m => ({ ...m })));
  assert.equal(plan.memberships[0].on, false);
  assert.equal(plan.dues, 0);
});

test('a cancelled event leaves every scenario; a skipped one leaves only Current', () => {
  const base = computePlan(rowsFrom());
  const cancel = computePlan(rowsFrom(DEFAULT_PLAN_SETTINGS, e => (/^nmhc-annual/.test(e.key) ? { status: 'CANCELLED' } : {})));
  const skip = computePlan(rowsFrom(DEFAULT_PLAN_SETTINGS, e => (/^nmhc-annual/.test(e.key) ? { status: 'SKIPPED' } : {})));
  assert.equal(cancel.scenarios.full.events, base.scenarios.full.events - 1);
  assert.equal(skip.scenarios.full.events, base.scenarios.full.events);
  assert.equal(skip.scenarios.current.events, base.scenarios.current.events - 1);
});

test('clashes only count included, dated events', () => {
  const r = (name, start, end, include = true) => ({ name, start, end, include });
  const rows = markClashes([
    r('a', '2027-01-01', '2027-01-03'), r('b', '2027-01-03', '2027-01-04'),
    r('c', '2027-01-03', '2027-01-04', false), r('d', null, null), r('e', '2027-02-01', '2027-02-02'),
  ]);
  assert.deepEqual(rows.map(x => x.clash), [true, true, false, false, false]);
});

test('settings survive the trip through rows', () => {
  const rows = settingRowsFrom(DEFAULT_PLAN_SETTINGS);
  assert.deepEqual(settingsFromRows(rows), DEFAULT_PLAN_SETTINGS);
  const changed = settingsFromRows([{ key: 'perDiem', value: 150 }, { key: 'reachBands.0', value: 4000 }, { key: 'airfareByState.CO', value: 0 }]);
  assert.equal(changed.perDiem, 150);
  assert.equal(changed.reachBands[0], 4000);
  assert.equal(changed.airfareByState.CO, 0);
  assert.equal(DEFAULT_PLAN_SETTINGS.perDiem, 125);
});

test('a local event carries no air or hotel, and a 0 hotel rate stays 0', () => {
  const series = { accessRoute: 'TICKET', vertical: 'MULTIFAMILY', buyerDensity: 3, supplierAccess: 3, supplierEligible: true };
  const local = computeEdition({ isLocal: true, state: 'CO', scope: 'COLORADO', regCost: 1100, startDate: '2027-03-01', endDate: '2027-03-02' }, series);
  assert.equal(local.perPerson, 1350);
  const zero = computeEdition({ state: 'TX', scope: 'NATIONAL', regCost: 0, hotelRateOverride: 0, startDate: '2027-03-01', endDate: '2027-03-03' }, series);
  assert.equal(zero.hotel, 0);
  const undated = computeEdition({ state: 'TX', scope: 'NATIONAL' }, series);
  assert.equal(undated.days, 3);
  assert.equal(undated.quarter, 'TBD');
});

test('status decides the plan, and a typed registration wins over the access route', () => {
  const base = { tierOverride: 'C', includeOverride: null };
  const series = { supplierEligible: true, buyerDensity: 3, supplierAccess: 3, vertical: 'MULTIFAMILY', accessRoute: 'TICKET' };
  const row = (x, s = series) => computeEdition({ ...base, ...x }, s, DEFAULT_PLAN_SETTINGS);
  assert.equal(row({ status: 'REGISTERED' }).include, true);
  assert.equal(row({ status: 'CONSIDERING' }).include, false);
  assert.equal(row({ status: 'CONSIDERING', includeOverride: true }).include, true);
  assert.equal(row({ status: 'SKIPPED', includeOverride: true }).include, false);
  assert.equal(row({ status: 'PLANNED', includeOverride: false }).include, true);
  const members = { ...series, accessRoute: 'MEMBERS_ONLY' };
  assert.equal(row({ regCost: 500 }, members).reg, 0);
  assert.equal(row({ regCost: 500, regCostBasis: 'MANUAL' }, members).reg, 500);
});

test('yearTotals: spend is Registered and Attended, no contingency, YTD stops today', () => {
  const r = (status, start, plannedCost, include = true) => ({ year: 2026, status, start, plannedCost, include, headcount: 1, vertical: 'X', region: 'X', quarter: 'Q1' });
  const rows = [r('ATTENDED', '2026-02-01', 1000), r('REGISTERED', '2026-12-01', 500.25), r('PLANNED', '2026-03-01', 200), r('CONSIDERING', '2026-03-01', 75, false), r('SKIPPED', '2026-03-01', 999, false)];
  const t = yearTotals(rows, 2026, '2026-11-02', 0.1);
  assert.equal(t.ytdSpend, 1000);
  assert.equal(t.yearSpend, 1500.25);
  assert.equal(t.events, 3);
  assert.equal(yearTotals(rows, 2025, '2026-11-02', 0.1).yearSpend, 0);
});
