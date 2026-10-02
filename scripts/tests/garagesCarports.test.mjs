/**
 * Garages and carports on the public form (Mike, 2026-09-13): "we should only
 * have detached garages for single family homes, townhomes and, garden
 * walk-up and stacked flats. For carports the same, but add wraps." Townhomes
 * start at 1 garage per home when the box is left blank.
 *
 * Ladder in the takeoff: written on the site plan → typed by the visitor →
 * townhomes 1 per home (no-drawings only). A typed 0 is a real "none". Any
 * other building type prices neither, even when the site plan shows some.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { computeQuantities } from '../../src/lib/intake/quantities.js';
import { validateAnswers, GARAGE_TYPE_KEYS, CARPORT_TYPE_KEYS } from '../../src/lib/intake/questionnaire.js';
import { computeIntakeEstimate } from '../../src/lib/intake/estimate.js';
import { PRICING } from '../../src/lib/pricing.js';
import { calculateBudget } from '../../src/lib/calculations.js';

const TOWN = 'Town Houses (2-3 Levels)';
const GARDEN = 'Garden (3 Levels)';
const WRAP = 'Wrap (3-5 Levels)';
const PODIUM = 'Podium (3-8 Levels)';

const byKey = list => Object.fromEntries(list.map(r => [r.key, r]));
const manualRows = answers => byKey(computeQuantities(null, { noDrawings: 'yes', ...answers }));
const drawingRows = (siteData, answers = {}) => byKey(computeQuantities(
  { sources: ['site.pdf'], unitTypes: [], projectTotals: null, siteData: { confidence: 0.9, ...siteData } },
  answers));

const TOWN_BASE = { projectType: TOWN, figureTotalUnits: '64', figureAvgUnitSf: '1800', figureStories: '3', figureSurfaceParking: '0', figureExteriorAmenitySf: '0' };

test('which building types get garages and carports', () => {
  assert.deepEqual(GARAGE_TYPE_KEYS, ['singleFamily', 'townHouses', 'stackedFlats', 'garden']);
  assert.deepEqual(CARPORT_TYPE_KEYS, ['singleFamily', 'townHouses', 'stackedFlats', 'garden', 'wrap']);
});

test('townhomes with the garage box blank: 1 garage per home, marked as an estimate', () => {
  const r = manualRows(TOWN_BASE);
  assert.equal(r.garages.value, 64);
  assert.equal(r.garages.source, 'derived');
  assert.match(r.garages.flag, /no drawings/i);
  assert.equal(r.carports.value, null, 'carports are asked, never guessed');
});

test('a typed number beats the guess, and a typed 0 means none', () => {
  assert.equal(manualRows({ ...TOWN_BASE, figureGarages: '40' }).garages.value, 40);
  const zero = manualRows({ ...TOWN_BASE, figureGarages: '0', figureCarports: '0' });
  assert.equal(zero.garages.value, 0);
  assert.equal(zero.garages.source, 'questionnaire');
  assert.equal(zero.carports.value, 0);
});

test('garden: garages and carports are asked, not guessed', () => {
  const blank = manualRows({ projectType: GARDEN, figureTotalUnits: '200', figureGrossSf: '250000', figureStories: '3', figureSurfaceParking: '300' });
  assert.equal(blank.garages.value, null);
  const typed = manualRows({ projectType: GARDEN, figureTotalUnits: '200', figureGrossSf: '250000', figureStories: '3', figureSurfaceParking: '300', figureGarages: '24', figureCarports: '60' });
  assert.equal(typed.garages.value, 24);
  assert.equal(typed.carports.value, 60);
});

test('wrap gets carports but not garages', () => {
  const r = manualRows({ projectType: WRAP, figureTotalUnits: '300', figureGrossSf: '330000', figureStories: '5', figureSurfaceParking: '0', figureGarages: '20', figureCarports: '40' });
  assert.equal(r.carports.value, 40);
  assert.equal(r.garages.value, null);
  assert.match(r.garages.how, /no garage lights/);
});

test('podium gets neither, even with numbers typed', () => {
  const r = manualRows({ projectType: PODIUM, figureTotalUnits: '300', figureGrossSf: '330000', figureStories: '5', figureSurfaceParking: '0', figureGarages: '20', figureCarports: '40' });
  assert.equal(r.garages.value, null);
  assert.equal(r.carports.value, null);
});

test('drawings: a site-plan count wins on an allowed type, and is flagged on a disallowed one', () => {
  const garden = drawingRows({ totalUnits: 200, garages: 30, carports: 50 }, { projectType: GARDEN, figureGarages: '10' });
  assert.equal(garden.garages.value, 30);
  assert.equal(garden.garages.source, 'drawing');
  assert.equal(garden.carports.value, 50);
  const podium = drawingRows({ totalUnits: 300, garages: 30 }, { projectType: PODIUM });
  assert.equal(podium.garages.value, null);
  assert.match(podium.garages.flag, /not priced for this building type/);
});

test('drawings: the townhome guess never fills a drawing-read budget', () => {
  const r = drawingRows({ totalUnits: 64 }, { projectType: TOWN });
  assert.equal(r.garages.value, null);
});

test('the budget prices the townhome guess at one strip per garage', () => {
  const { budget } = computeIntakeEstimate({ answers: { noDrawings: 'yes', ...TOWN_BASE } });
  assert.equal(budget.sections.exterior.garages.product, 64 * PRICING.exterior.detachedGarage.stripPerGarage);
});

test('internal budgets: garages/carports only count on the types that have them', () => {
  const pd = t => ({ numUnits: 100, grossSf: 120000, numGarages: 20, numCarports: 40, ...(t ? { buildingTypeKey: t } : {}) });
  const ext = t => calculateBudget(pd(t), {}).sections.exterior;
  const door = PRICING.exterior.detachedGarage.stripPerGarage;
  const disk = PRICING.exterior.carport.diskEveryOther;
  assert.equal(ext('garden').garages.product, 20 * door);
  assert.equal(ext('garden').carports.product, 20 * disk);
  assert.equal(ext('wrap').garages.product, 0, 'wrap: no garages');
  assert.equal(ext('wrap').carports.product, 20 * disk, 'wrap: carports yes');
  assert.equal(ext('podium').garages.product, 0);
  assert.equal(ext('podium').carports.product, 0);
  assert.equal(ext(null).garages.product, 20 * door, 'no type chosen yet: typed numbers kept');
});

test('the public form keeps a typed 0 for garages and carports', () => {
  const rows = validateAnswers({ figureGarages: '0', figureCarports: '12' });
  assert.equal(rows.find(r => r.questionKey === 'figureGarages')?.answer, '0');
  assert.equal(rows.find(r => r.questionKey === 'figureCarports')?.answer, '12');
});
