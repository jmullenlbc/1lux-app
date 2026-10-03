/**
 * Drive-lane area lights by drive LENGTH (Mike, 2026-09-13): "correlate it to
 * the width of 9 spaces and just keep that and measure the drive". One area
 * light per 81 ft of private drive (9 stalls × 9 ft), townhouse and
 * single-family only.
 *
 * Ladder in the takeoff: typed length → length measured off a scaled site
 * plan → ½ light per home less the lot's own poles.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { computeQuantities } from '../../src/lib/intake/quantities.js';
import { validateAnswers } from '../../src/lib/intake/questionnaire.js';
import { computeIntakeEstimate } from '../../src/lib/intake/estimate.js';
import { calculateBudget } from '../../src/lib/calculations.js';
import { PRICING } from '../../src/lib/pricing.js';
import { mergeProposals } from '../../src/lib/mergeProposals.js';
import { SITE_NUMBER_KEYS, siteHasNumbers } from '../../src/lib/intake/combineResult.js';

const TOWN = 'Town Houses (2-3 Levels)';
const GARDEN = 'Garden (3 Levels)';
const PD = { numUnits: 64, grossSf: 115200, unitsSf: 115200, numSurfaceParking: 90, buildingTypeKey: 'townHouses' };

const byKey = list => Object.fromEntries(list.map(r => [r.key, r]));
const manualRows = answers => byKey(computeQuantities(null, { noDrawings: 'yes', ...answers }));
const drawingRows = (siteData, answers = {}) => byKey(computeQuantities(
  { sources: ['site.pdf'], unitTypes: [], projectTotals: null, siteData: { confidence: 0.9, ...siteData } },
  answers));

test('master pricing: one light per 81 ft of drive', () => {
  assert.equal(PRICING.exterior.surfaceParking.driveLaneFtPerLight, 81);
});

// Mike 2026-10-02 (890 Fremont): the length is every drive aisle, parking or
// not, so its poles already light the stalls along it. Larger count wins.
test('engine: a drive length becomes ceil(ft ÷ 81) lights and replaces the lot poles', () => {
  const p = calculateBudget(PD, { exterior: { driveLaneFt: 2430 } }).sections.exterior.parking;
  assert.equal(p.driveLaneLights, 30, '2,430 ÷ 81');
  assert.equal(p.fixtures, 30, '30 drive poles beat 10 lot poles; they do not stack');
  assert.equal(calculateBudget(PD, { exterior: { driveLaneFt: 405 } }).sections.exterior.parking.fixtures, 10, 'a short drive never drops below the stall count');
  assert.equal(calculateBudget(PD, { exterior: { driveLaneFt: 2431 } }).sections.exterior.parking.driveLaneLights, 31, 'rounds up');
});

test('engine: a length beats a straight count; a typed area-light total still beats both', () => {
  const both = calculateBudget(PD, { exterior: { driveLaneFt: 810, driveLaneLightsQty: 22 } }).sections.exterior.parking;
  assert.equal(both.driveLaneLights, 10);
  const cleared = calculateBudget(PD, { exterior: { driveLaneFt: 'auto', driveLaneLightsQty: 22 } }).sections.exterior.parking;
  assert.equal(cleared.driveLaneLights, 22, "'auto' (cleared) falls back to the count");
  const typed = calculateBudget(PD, { exterior: { driveLaneFt: 2430, areaLightsQty: '15' } }).sections.exterior.parking;
  assert.equal(typed.fixtures, 15);
});

test('engine: the feet-per-light knob comes from master pricing', () => {
  const pricing = structuredClone(PRICING);
  pricing.exterior.surfaceParking.driveLaneFtPerLight = 100;
  assert.equal(calculateBudget(PD, { exterior: { driveLaneFt: 2430 } }, pricing).sections.exterior.parking.driveLaneLights, 25);
});

test('takeoff (no drawings): a typed length wins and the lot poles are NOT subtracted', () => {
  const r = manualRows({ projectType: TOWN, figureTotalUnits: '64', figureAvgUnitSf: '1800', figureSurfaceParking: '90', figureDriveLengthFt: '2430' });
  assert.equal(r.driveLengthFt.value, 2430);
  assert.equal(r.driveLengthFt.source, 'questionnaire');
  assert.equal(r.driveLaneLights.value, 30);
  assert.equal(r.driveLaneLights.flag, null);
});

// Mike 2026-10-02: no length → the stalls stand in at one pole per 81 ft
// (90 ÷ 9 = 10 lot poles), nothing added on top. No stalls → ½ per home.
test('takeoff (no drawings): no length lets the stalls carry the drive at 1 per 81 ft', () => {
  const r = manualRows({ projectType: TOWN, figureTotalUnits: '64', figureAvgUnitSf: '1800', figureSurfaceParking: '90' });
  assert.equal(r.driveLengthFt, undefined);
  assert.equal(r.driveLaneLights.value, 0);
  assert.match(r.driveLaneLights.how, /90 stalls/);
  assert.match(r.driveLaneLights.flag, /no drawings/);
  const none = manualRows({ projectType: TOWN, figureTotalUnits: '64', figureAvgUnitSf: '1800', figureSurfaceParking: '0' });
  assert.equal(none.driveLaneLights.value, 32, 'no stalls either: ½ per home');
});

test('takeoff (drawings): a length measured off the site plan is used and flagged to confirm', () => {
  const r = drawingRows({ totalUnits: 64, driveLengthFtMeasured: 1620 }, { projectType: TOWN });
  assert.equal(r.driveLengthFt.value, 1620);
  assert.equal(r.driveLengthFt.source, 'drawing');
  assert.match(r.driveLengthFt.flag, /confirm/);
  assert.equal(r.driveLaneLights.value, 20);
});

test('takeoff (drawings): a typed length beats the measured one', () => {
  const r = drawingRows({ totalUnits: 64, driveLengthFtMeasured: 1620 }, { projectType: TOWN, figureDriveLengthFt: '810' });
  assert.equal(r.driveLengthFt.source, 'questionnaire');
  assert.equal(r.driveLaneLights.value, 10);
});

test('takeoff (drawings): no length now falls back to ½ per home instead of nothing', () => {
  const r = drawingRows({ totalUnits: 64 }, { projectType: TOWN });
  assert.equal(r.driveLaneLights.value, 32);
  assert.match(r.driveLaneLights.flag, /drawings gave no private drive length/);
});

test('takeoff: the drawing\'s own building type is enough when the form gave none', () => {
  const r = drawingRows({ totalUnits: 40, buildingType: 'singleFamily', driveLengthFtMeasured: 810 });
  assert.equal(r.driveLaneLights.value, 10);
});

test('takeoff: an odd length per home is flagged', () => {
  const r = manualRows({ projectType: TOWN, figureTotalUnits: '64', figureAvgUnitSf: '1800', figureSurfaceParking: '0', figureDriveLengthFt: '50000' });
  assert.match(r.driveLengthFt.flag, /unusual/);
});

test('apartment types never get drive-lane lights, even with a length typed', () => {
  const r = manualRows({ projectType: GARDEN, figureTotalUnits: '200', figureGrossSf: '250000', figureDriveLengthFt: '2430' });
  assert.equal(r.driveLengthFt, undefined);
  assert.equal(r.driveLaneLights, undefined);
});

test('the estimate hands the engine feet, so the budget carries the ÷ 81 lights', () => {
  const answers = {
    noDrawings: 'yes', projectType: TOWN, figureTotalUnits: '64', figureAvgUnitSf: '1800',
    figureStories: '3', figureSurfaceParking: '90', figureDriveLengthFt: '2430', figureExteriorAmenitySf: '0',
  };
  const { budget } = computeIntakeEstimate({ answers });
  assert.equal(budget.sections.exterior.parking.driveLaneLights, 30);
  assert.equal(budget.sections.exterior.parking.fixtures, 30);
});

test('the public form keeps a typed drive length', () => {
  const row = validateAnswers({ figureDriveLengthFt: '2400' }).find(r => r.questionKey === 'figureDriveLengthFt');
  assert.equal(row?.answer, '2400');
});

test('the drawing reader\'s measured length survives merging and counts as a site number', () => {
  assert.ok(SITE_NUMBER_KEYS.includes('driveLengthFtMeasured'));
  assert.equal(siteHasNumbers({ driveLengthFtMeasured: 1200 }), true);
  const merged = mergeProposals([{ fileName: 'a.pdf', proposal: { kind: 'site_data', unitTypes: [], siteData: { driveLengthFtMeasured: 1200 } } }]);
  assert.equal(merged.siteData.driveLengthFtMeasured, 1200);
});
