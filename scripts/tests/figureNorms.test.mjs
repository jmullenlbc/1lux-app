/**
 * Learn only from real numbers + on-screen figure alerts (Mike 2026-09-24).
 *
 * "We should learn from budgets we enter too though. That is real stuff. It's
 * the conceptual tool where things can not be concrete and we should only
 * learn from non made up info." Client-typed figures count only inside the
 * normal range; tool guesses never count; a person adopts a learned figure.
 *
 * Run: node --test scripts/tests/figureNorms.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  figureNorms, figureAlert, guessSuggestions, confirmedGuessMap, currentGuess, REAL_SOURCES,
} from '../../src/lib/calibration/figureNorms.js';
import { planHandoff } from '../../src/lib/intake/handoff.js';

// One garden job of 100 units with `vanities` per unit from `source`.
const job = (perUnit, source = 'staff', extra = {}) => ({
  buildingType: 'garden', units: 100, grossSf: 100000,
  figures: { numVanities: { value: perUnit * 100, source }, ...extra },
});
const five = [1.4, 1.5, 1.5, 1.6, 1.6].map(v => job(v));

test('real sources are drawings, staff, fixtures and imports, never client or guess', () => {
  assert.deepEqual([...REAL_SOURCES].sort(), ['drawing', 'fixtures', 'import', 'staff']);
});

test('learns from real figures and never from tool guesses', () => {
  const n = figureNorms([...five, job(9, 'guess'), job(9, 'guess')]);
  assert.equal(n.garden.numVanities.jobs, 5);
  assert.equal(n.garden.numVanities.median, 1.5);
});

test('a client-typed figure counts when it sits in the normal range, not when it is far out', () => {
  const n = figureNorms([...five, job(1.5, 'client'), job(12, 'client')]);
  assert.equal(n.garden.numVanities.jobs, 6);
});

test('a guess a person marked "It\'s right" counts as real', () => {
  const rows = [job(1.5, 'guess')];
  rows[0].figures.numVanities.confirmed = true;
  assert.equal(figureNorms(rows).garden.numVanities.jobs, 1);
});

test('vanities fall back to bathrooms when no vanity count was kept', () => {
  const r = { buildingType: 'garden', units: 100, figures: { numBathrooms: { value: 150, source: 'drawing' } } };
  assert.equal(figureNorms([r]).garden.numVanities.median, 1.5);
});

test('alerts: high, low and zero against five real jobs', () => {
  const n = figureNorms(five.map(r => ({ ...r, figures: { ...r.figures, numBalconies: { value: 100, source: 'staff' } } })));
  const ctx = { buildingType: 'garden', units: 200 };
  const high = figureAlert('numVanities', 900, ctx, n);
  assert.equal(high.way, 'high');
  assert.match(high.text, /our 5 garden jobs usually run/);
  assert.equal(figureAlert('numVanities', 100, ctx, n).way, 'low');
  assert.equal(figureAlert('numBalconies', 0, ctx, n).way, 'zero');
  assert.equal(figureAlert('numVanities', 300, ctx, n), null);
});

test('alerts: fewer than five jobs → the standing guess with a 4× band', () => {
  const ctx = { buildingType: 'garden', units: 100 };
  const a = figureAlert('numVanities', 600, ctx, {});
  assert.equal(a.way, 'high');
  assert.match(a.text, /fewer than 5 real jobs/);
  assert.equal(figureAlert('numVanities', 500, ctx, {}), null);
  assert.equal(figureAlert('numVanities', 30, ctx, {}).way, 'low');
});

test('no building type, no alert', () => {
  assert.equal(figureAlert('numVanities', 9999, { units: 100 }, {}), null);
});

test('suggestions: adoptable only with five real jobs and a figure that differs', () => {
  const rows = guessSuggestions(figureNorms([...five.slice(0, 4)]));
  assert.equal(rows.find(r => r.field === 'numVanities').canAdopt, false);
  const ready = guessSuggestions(figureNorms(five)).find(r => r.field === 'numVanities');
  assert.equal(ready.canAdopt, true);
  assert.equal(ready.learnedValue, 1.5);
  assert.equal(ready.adopted, false);
  // Once adopted it matches what we use, nothing more to adopt.
  const after = guessSuggestions(figureNorms(five), { vanitiesPerUnit: { garden: 1.5 } }).find(r => r.field === 'numVanities');
  assert.equal(after.canAdopt, false);
  assert.equal(after.adopted, true);
});

test('adopted figures: newest live row wins, archived rows are ignored', () => {
  const map = confirmedGuessMap([
    { guessKey: 'vanitiesPerUnit', buildingType: 'garden', value: 1.5, confirmedAt: '2026-09-01' },
    { guessKey: 'vanitiesPerUnit', buildingType: 'garden', value: 1.6, confirmedAt: '2026-09-20' },
    { guessKey: 'vanitiesPerUnit', buildingType: 'garden', value: 9, confirmedAt: '2026-09-22', archivedAt: '2026-09-23' },
  ]);
  assert.equal(map.vanitiesPerUnit.garden, 1.6);
  assert.equal(currentGuess('numVanities', 'garden', map), 1.6);
  assert.equal(currentGuess('numVanities', 'garden'), 1.4);
});

test('web-request hand-off tags typed figures as client and filled-in ones as guesses', () => {
  const plan = planHandoff({ answers: {
    noDrawings: 'yes', projectType: 'Garden (3 Levels)', figureTotalUnits: '200',
    figureGrossSf: '250000', figureStories: '3', figureSurfaceParking: '300', figureExteriorAmenitySf: '5000', hasPool: 'no',
  }, drawings: null });
  assert.equal(plan.sources.numSurfaceParking, 'client');
  assert.equal(plan.sources.numUnits, 'client');
  assert.equal(plan.sources.numVanities, 'guess');
  for (const s of Object.values(plan.sources)) assert.ok(['drawing', 'client', 'guess'].includes(s));
});
