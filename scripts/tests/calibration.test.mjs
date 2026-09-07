/**
 * Pricing calibration — the learning loop (2026-09-04).
 *
 * buildSamples() turns one engine run into one row per budget line
 * (quantity × rate = model $, beside the actual when one is known), and
 * rateDriftReport() rolls those rows up into the Pre-Con dashboard table
 * with a suggested rate an admin can apply back to /admin/pricing.
 *
 * Rules worth protecting:
 *   1. Every sample's model $ equals what the engine put on the budget —
 *      the table never disagrees with the budget page.
 *   2. A hand-entered pathway figure is the ACTUAL for that line and the
 *      model number is rebuilt beside it (the engine suppresses it).
 *   3. suggested rate = actual ÷ quantity, pooled across projects.
 *   4. Only true rate × quantity lines get a pricing key (emergency,
 *      controls, total never do) — and only allowlisted keys can be written.
 *
 * Run: node --test scripts/tests/calibration.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateBudget } from '../../src/lib/calculations.js';
import { PRICING } from '../../src/lib/pricing.js';
import { buildSamples, isAppliablePricingKey, withPricingKey, readPricingKey, LINE_KEYS } from '../../src/lib/calibration/lines.js';
import { rateDriftReport, runCalibrationWidget, driftByBuildingType, applySampleFilters } from '../../src/lib/calibration/report.js';

// Fulshear-shaped garden project (372 units, 537 stalls, conventional site).
const FULSHEAR = {
  grossSf: 491_450, unitsSf: 491_450, numUnits: 372, corridorSf: 132_370, interiorAmenitySf: 3_800,
  exteriorAmenitySf: 3_000, garageSf: 0, bohSf: 11_400, numEgressStairwells: 0, numSurfaceParking: 537,
  lotSf: 600_000, buildingFootprintSf: 185_500, buildingTypeKey: 'garden',
};
const SECTIONS = { exterior: { amenityLevel: 'medium', siteDesignLevel: 'conventional' }, amenities: { interiorLevel: 'medium' } };

function samplesFor(pd = FULSHEAR, sections = SECTIONS) {
  const budget = calculateBudget(pd, sections);
  return { budget, samples: buildSamples({ projectData: pd, sections, budget, pricing: PRICING }) };
}
const byKey = (rows, k) => rows.find(r => r.lineKey === k);

// ── buildSamples ─────────────────────────────────────────────────────────────

test('one sample per budget line, model $ equal to the budget page', () => {
  const { budget, samples } = samplesFor();
  const s = budget.sections;
  assert.equal(byKey(samples, 'units.base').modelAmount,        Math.round(s.units.base.product * 100) / 100);
  assert.equal(byKey(samples, 'corridors.disks').modelAmount,   Math.round(s.corridors.disks.product * 100) / 100);
  assert.equal(byKey(samples, 'boh').modelAmount,               Math.round(s.boh.product * 100) / 100);
  assert.equal(byKey(samples, 'interior').modelAmount,          Math.round(s.interior.product * 100) / 100);
  assert.equal(byKey(samples, 'exterior.parking').modelAmount,  Math.round(s.exterior.parking.product * 100) / 100);
  assert.equal(byKey(samples, 'exterior.wallpacks').modelAmount,Math.round(s.exterior.wallpacks.product * 100) / 100);
  assert.equal(byKey(samples, 'exterior.pathway').modelAmount,  Math.round(s.exterior.pathway.product * 100) / 100);
  assert.equal(byKey(samples, 'exterior.landscape').modelAmount,Math.round(s.exterior.landscape.product * 100) / 100);
  assert.equal(byKey(samples, 'emergency').modelAmount,         Math.round(s.emergency.product * 100) / 100);
  assert.equal(byKey(samples, 'exitSigns').modelAmount,         Math.round(s.exitSigns.product * 100) / 100);
  assert.equal(byKey(samples, 'controls').modelAmount,          Math.round(budget.controls * 100) / 100);
  assert.equal(byKey(samples, 'total').modelAmount,             Math.round(budget.totalWithControls * 100) / 100);
  // no parkingEntrances row without a hand-entered figure
  assert.equal(byKey(samples, 'exterior.parkingEntrances'), undefined);
  for (const r of samples) assert.ok(LINE_KEYS.includes(r.lineKey), `unknown lineKey ${r.lineKey}`);
});

test('quantity × rateUsed reproduces the model $ on the rate × quantity lines', () => {
  const { samples } = samplesFor();
  for (const k of ['units.base', 'corridors.disks', 'boh', 'interior', 'exterior.amenities', 'exterior.parking', 'exterior.wallpacks', 'exterior.pathway', 'exitSigns']) {
    const r = byKey(samples, k);
    assert.ok(r.quantity > 0, `${k} has a quantity`);
    assert.ok(Math.abs(r.quantity * r.rateUsed - r.modelAmount) < 1, `${k}: ${r.quantity} × ${r.rateUsed} ≈ ${r.modelAmount}`);
  }
  // parking: fixtures = ceil(537 / 9) = 60 at $1,325
  const p = byKey(samples, 'exterior.parking');
  assert.equal(p.quantity, 60); assert.equal(p.quantityUnit, 'fixtures'); assert.equal(p.rateUsed, 1325);
  // pathway: 372 units × garden $60
  const pw = byKey(samples, 'exterior.pathway');
  assert.equal(pw.quantity, 372); assert.equal(pw.rateUsed, 60); assert.equal(pw.pricingKey, 'exterior.pathway.dollarsPerUnit.garden');
});

test('pricing keys: rate lines carry one, strategy/total lines do not', () => {
  const { samples } = samplesFor();
  assert.equal(byKey(samples, 'units.base').pricingKey, 'base.perSf');
  assert.equal(byKey(samples, 'interior').pricingKey, 'interiorAmenities.medium');
  assert.equal(byKey(samples, 'exterior.landscape').pricingKey, 'exterior.landscape.pctOfNetLotSf');
  assert.equal(byKey(samples, 'emergency').pricingKey, null);
  assert.equal(byKey(samples, 'controls').pricingKey, null);
  assert.equal(byKey(samples, 'total').pricingKey, null);
  for (const r of samples) if (r.pricingKey) assert.ok(readPricingKey(PRICING, r.pricingKey) != null, `${r.pricingKey} exists on the sheet`);
});

test('a hand-entered pathway figure becomes the ACTUAL, with the model rebuilt beside it', () => {
  const sections = { ...SECTIONS, exterior: { ...SECTIONS.exterior, exteriorManualItems: JSON.stringify({ pathwayLighting: 12800, parkingEntrances: 3000 }) } };
  const { budget, samples } = samplesFor(FULSHEAR, sections);
  assert.equal(budget.sections.exterior.pathway.suppressedByManual, true);
  const pw = byKey(samples, 'exterior.pathway');
  assert.equal(pw.actualAmount, 12800);
  assert.equal(pw.modelAmount, 372 * 60);            // what the model WOULD have said
  assert.equal(pw.impliedRate, Math.round((12800 / 372) * 10000) / 10000);
  const pe = byKey(samples, 'exterior.parkingEntrances');
  assert.equal(pe.modelAmount, 0); assert.equal(pe.actualAmount, 3000); assert.equal(pe.pricingKey, null);
});

test('solar site: parking and pathway rates carry the multipliers the engine applied', () => {
  const sections = { ...SECTIONS, exterior: { ...SECTIONS.exterior, siteDesignLevel: 'solar' } };
  const { samples } = samplesFor(FULSHEAR, sections);
  assert.equal(byKey(samples, 'exterior.parking').rateUsed, 1325 * PRICING.exterior.solarMultiplier);
  assert.equal(byKey(samples, 'exterior.pathway').rateUsed, 60 * PRICING.exterior.pathway.solarMultiplier);
  assert.equal(byKey(samples, 'exterior.parking').siteDesignLevel, 'solar');
});

test('empty project → samples with zero model and null quantities, never NaN', () => {
  const { samples } = samplesFor({ buildingTypeKey: 'garden' }, {});
  for (const r of samples) {
    assert.ok(Number.isFinite(r.modelAmount), `${r.lineKey} modelAmount finite`);
    assert.ok(r.quantity === null || Number.isFinite(r.quantity));
    assert.ok(r.rateUsed === null || Number.isFinite(r.rateUsed), `${r.lineKey} rateUsed`);
  }
});

// ── rateDriftReport ──────────────────────────────────────────────────────────

const row = (projectId, lineKey, quantity, rateUsed, actualAmount, extra = {}) => ({
  projectId, projectName: projectId, lineKey, quantity, quantityUnit: 'units', rateUsed,
  modelAmount: quantity * rateUsed, actualAmount, impliedRate: actualAmount / quantity,
  pricingKey: 'exterior.pathway.dollarsPerUnit.garden', buildingType: 'garden', source: 'engine',
  capturedAt: '2026-09-04T12:00:00Z', ...extra,
});

test('suggested rate = pooled actual ÷ pooled quantity; drift = (actual − model) ÷ model', () => {
  const samples = [
    row('A', 'exterior.pathway', 100, 60, 4000),   // model 6,000
    row('B', 'exterior.pathway', 300, 60, 12000),  // model 18,000
    row('C', 'exterior.pathway', 200, 60, 9600),   // model 12,000 → no actual on D
    { ...row('D', 'exterior.pathway', 50, 60, null), actualAmount: null },
  ];
  const [r] = rateDriftReport(samples);
  assert.equal(r.lineKey, 'exterior.pathway');
  assert.equal(r.projects, 3);                         // D has no actual → excluded
  assert.equal(r.modelSum, 36000);
  assert.equal(r.actualSum, 25600);
  assert.equal(r.driftPct, -28.9);                     // engine pricing high
  assert.equal(r.rateUsed, 60);
  assert.equal(r.suggestedRate, Math.round((25600 / 600) * 10000) / 10000); // 42.6667
  assert.equal(r.pricingKey, 'exterior.pathway.dollarsPerUnit.garden');
  assert.equal(r.flag, 'review');                      // |drift| ≥ 15 with 3 projects
  assert.equal(r.details.length, 3);
});

test('flags: big drift on too few projects is "watch", small drift is "ok"', () => {
  const [watch] = rateDriftReport([row('A', 'boh', 100, 1.85, 300)]);
  assert.equal(watch.flag, 'watch');
  const [ok] = rateDriftReport([row('A', 'boh', 100, 1.85, 190), row('B', 'boh', 100, 1.85, 180), row('C', 'boh', 100, 1.85, 185)]);
  assert.equal(ok.flag, 'ok');
});

test('lines without a rate (total, emergency) report drift but no suggested rate', () => {
  const [r] = rateDriftReport([{ ...row('A', 'total', 100000, 2.5, 260000), pricingKey: null, source: 'bidmatrix' }]);
  assert.equal(r.driftPct, 4);
  assert.equal(r.pricingKey, null);
  assert.equal(r.suggestedRate, 2.6); // implied $/SF is still informative
});

test('worst drift sorts first; widget wraps the table in the TABLE shape', () => {
  const samples = [row('A', 'boh', 100, 1.85, 190), row('A', 'exterior.pathway', 100, 60, 3000)];
  const out = runCalibrationWidget({ kind: 'calibration', report: 'rateDrift' }, samples);
  assert.equal(out.chartType, 'TABLE');
  assert.equal(out.table.rows[0].lineKey, 'exterior.pathway');
  assert.ok(out.table.columns.length >= 6);
  assert.equal(out.series.length, 2);
  const bars = runCalibrationWidget({ kind: 'calibration', report: 'modelVsActualByLine' }, samples);
  assert.equal(bars.chartType, 'BAR'); assert.equal(bars.series[0].value, -50);
  assert.equal(runCalibrationWidget({ kind: 'calibration', report: 'nope' }, samples).error.includes('Unknown'), true);
});

test('global filters narrow samples by client / building type; drift by building type pools lines', () => {
  const samples = [
    row('A', 'boh', 100, 1.85, 200, { clientName: 'Mill Creek', buildingType: 'garden' }),
    row('B', 'boh', 100, 1.85, 100, { clientName: 'Other', buildingType: 'podium' }),
  ];
  assert.equal(applySampleFilters(samples, [{ field: 'client', op: 'is', value: 'Mill Creek' }]).length, 1);
  assert.equal(applySampleFilters(samples, [{ field: 'nonsense', value: 'x' }]).length, 2);
  const bt = driftByBuildingType(samples);
  assert.deepEqual(bt.map(b => b.label).sort(), ['garden', 'podium']);
  assert.equal(bt.find(b => b.label === 'podium').value, -45.9);
});

// ── apply-rate guard rails ──────────────────────────────────────────────────

test('only rate keys are appliable; nested write leaves the rest of the sheet intact', () => {
  assert.equal(isAppliablePricingKey('base.perSf'), true);
  assert.equal(isAppliablePricingKey('exterior.pathway.dollarsPerUnit.garden'), true);
  assert.equal(isAppliablePricingKey('interiorAmenities.high'), true);
  assert.equal(isAppliablePricingKey('controls.cap'), false);
  assert.equal(isAppliablePricingKey('freight'), false);
  assert.equal(isAppliablePricingKey('exterior.pathway.dollarsPerUnit.garden.extra'), false);
  assert.equal(isAppliablePricingKey(''), false);
  const next = withPricingKey(PRICING, 'exterior.pathway.dollarsPerUnit.garden', 42.67);
  assert.equal(readPricingKey(next, 'exterior.pathway.dollarsPerUnit.garden'), 42.67);
  assert.equal(readPricingKey(next, 'exterior.pathway.dollarsPerUnit.podium'), PRICING.exterior.pathway.dollarsPerUnit.podium);
  assert.equal(readPricingKey(PRICING, 'exterior.pathway.dollarsPerUnit.garden'), 60); // original untouched
});
