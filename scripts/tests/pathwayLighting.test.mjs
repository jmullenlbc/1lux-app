/**
 * Pathway lighting, the model line wired into the exterior formula 2026-09-04.
 *
 * The deal Mike signed off on:
 *   pathway = units × dollarsPerUnit[buildingType], floored at pathway.minTotal.
 *
 * Rates (master pricing, Mike's 2026-09-04 corrections): townhome/single-family
 * $320, garden/stacked/gurban/wrap $60, podium/mid/high $35.
 *
 * The rules worth protecting:
 *   1. A hand-entered pathway figure (exteriorManualItems.pathwayLighting)
 *      SUPPRESSES the model line, counted numbers are never doubled. Modera
 *      Town Lake carries $4,800 hand-built and must stay at $4,800.
 *   2. The $4,000 floor applies only when the project has real scale; a
 *      zero-unit project prices pathway at $0, same rule as wallpacks.
 *   3. The model line rides inside the misc-buffer base like every other
 *      formula line.
 *
 * Run: node --test scripts/tests/pathwayLighting.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateBudget } from '../../src/lib/calculations.js';
import { PRICING } from '../../src/lib/pricing.js';

const pathway = (pd, responses = {}) =>
  calculateBudget(pd, responses).sections.exterior.pathway;

// ── the formula ──────────────────────────────────────────────────────────────

test('high-rise: units × the high-rise rate (Modera Town Lake shape: 381 units)', () => {
  const p = pathway({ numUnits: 381, buildingTypeKey: 'highRise' });
  assert.equal(p.product, 381 * PRICING.exterior.pathway.dollarsPerUnit.highRise);
  assert.equal(p.product, 381 * 35);
  assert.equal(p.buildingType, 'highRise');
  assert.equal(p.floorApplied, false);
  assert.equal(p.suppressedByManual, false);
});

test('every building type prices at its own master-pricing rate', () => {
  for (const [type, rate] of Object.entries(PRICING.exterior.pathway.dollarsPerUnit)) {
    // Townhomes and single-family price bollards / pedestrian poles instead.
    if (['townHouses', 'singleFamily'].includes(type)) continue;
    const p = pathway({ numUnits: 200, buildingTypeKey: type }, {});
    assert.equal(p.product, Math.max(200 * rate, PRICING.exterior.pathway.minTotal),
      `expected ${type} at $${rate}/unit`);
  }
});

// Mike 2026-10-02: homes get "bollards / pedestrian poles", one every 40 ft of
// walkway at $1,000 each, no floor. No walkway length: 1 per 8 homes (890
// Fremont: 25 bollards on 293 homes).
test('townhomes Yes: one bollard / pedestrian pole per 40 ft of walkway at $1,000', () => {
  assert.equal(PRICING.exterior.pedestrianPole.each, 1000);
  assert.equal(PRICING.exterior.pedestrianPole.ftPerPole, 40);
  const p = pathway({ numUnits: 100, buildingTypeKey: 'townHouses' }, { exterior: { pathwayBollards: 'yes', walkwayLengthFt: 1010 } });
  assert.equal(p.poles, 26, '1,010 ft / 40, rounded up');
  assert.equal(p.product, 26000);
  assert.equal(p.floorApplied, false);
});

test('townhomes Yes with no walkway length: 1 per 8 homes', () => {
  const p = pathway({ numUnits: 100, buildingTypeKey: 'townHouses' }, { exterior: { pathwayBollards: 'yes' } });
  assert.equal(p.poles, 13, '100 / 8 = 12.5, rounded up');
  assert.equal(p.product, 13000);
  const small = pathway({ numUnits: 5, buildingTypeKey: 'townHouses' }, { exterior: { pathwayBollards: 'yes' } });
  assert.equal(small.product, 1000, 'no $4,000 floor for homes');
});

test('the walkway length is ignored for every other building type', () => {
  const a = pathway({ numUnits: 200, buildingTypeKey: 'garden' }, {});
  const b = pathway({ numUnits: 200, buildingTypeKey: 'garden' }, { exterior: { walkwayLengthFt: 4000 } });
  assert.equal(a.product, b.product);
  assert.equal(b.poles, 0);
});

// ── townhome walking-path bollards (Mike, 2026-09-12) ───────────────────────
// "if townhomes are chosen we then ask on the exterior section screen if they
// want to light walking paths with bollards. It should be yes or no and no is $0"

test('townhomes and single-family: No or unanswered = $0, and the line says it was declined', () => {
  for (const type of ['townHouses', 'singleFamily']) {
    for (const ans of [undefined, '', 'no']) {
      const p = pathway({ numUnits: 100, buildingTypeKey: type }, { exterior: { pathwayBollards: ans } });
      assert.equal(p.product, 0, `${type} answer ${JSON.stringify(ans)} should be $0`);
      assert.equal(p.asksBollards, true);
      assert.equal(p.bollardsDeclined, true);
    }
  }
});

test('single-family Yes prices bollards at its own rate (Mike 2026-09-12: "Yes")', () => {
  const p = pathway({ numUnits: 100, buildingTypeKey: 'singleFamily' }, { exterior: { pathwayBollards: 'yes', walkwayLengthFt: 800 } });
  assert.equal(p.product, 20 * 1000);
  assert.equal(p.bollardsDeclined, false);
});

test('the bollard question is townhome/single-family only: other types ignore a No', () => {
  for (const type of ['stackedFlats', 'garden', 'podium']) {
    const p = pathway({ numUnits: 200, buildingTypeKey: type }, { exterior: { pathwayBollards: 'no' } });
    assert.ok(p.product > 0, `${type} should still price pathway`);
    assert.equal(p.asksBollards, false);
  }
});

test('townhomes Yes on a solar site gets the 1.6× bump', () => {
  const p = pathway({ numUnits: 100, buildingTypeKey: 'townHouses' },
    { exterior: { pathwayBollards: 'yes', siteDesignLevel: 'solar' } });
  assert.ok(Math.abs(p.product - 13000 * 1.6) < 0.01, `got ${p.product}`);
});

test("Mike's 2026-09-04 corrections landed: garden/wrap $60, podium tier $35", () => {
  const d = PRICING.exterior.pathway.dollarsPerUnit;
  assert.equal(d.garden, 60);
  assert.equal(d.stackedFlats, 60);
  assert.equal(d.gurban, 60);
  assert.equal(d.wrap, 60);
  assert.equal(d.podium, 35);
  assert.equal(d.midRise, 35);
  assert.equal(d.highRise, 35);
});

// ── the floor ────────────────────────────────────────────────────────────────

test('small projects floor at minTotal (50-unit podium: $1,750 → $4,000)', () => {
  const p = pathway({ numUnits: 50, buildingTypeKey: 'podium' });
  assert.equal(p.product, PRICING.exterior.pathway.minTotal);
  assert.equal(p.product, 4000);
  assert.equal(p.floorApplied, true);
});

test('no units means no pathway line at all: the floor never charges a phantom site', () => {
  const p = pathway({ numUnits: 0, buildingTypeKey: 'garden' });
  assert.equal(p.product, 0);
  assert.equal(p.floorApplied, false);
});

// ── manual entries win ───────────────────────────────────────────────────────

test('a hand-entered pathway figure suppresses the model line (Town Lake: $4,800 stays $4,800)', () => {
  const b = calculateBudget(
    { numUnits: 381, buildingTypeKey: 'highRise' },
    { exterior: { exteriorManualItems: { pathwayLighting: 4800 } } },
  );
  const p = b.sections.exterior.pathway;
  assert.equal(p.product, 0, 'model line must go quiet');
  assert.equal(p.suppressedByManual, true);
  assert.equal(b.sections.exterior.manualAdderTotal, 4800, 'the manual figure carries the scope');
});

test('manual suppression also works when exteriorManualItems arrives as a JSON string', () => {
  const b = calculateBudget(
    { numUnits: 381, buildingTypeKey: 'highRise' },
    { exterior: { exteriorManualItems: JSON.stringify({ pathwayLighting: 4800 }) } },
  );
  assert.equal(b.sections.exterior.pathway.product, 0);
  assert.equal(b.sections.exterior.manualAdderTotal, 4800);
});

test('other manual adders do NOT suppress the model pathway line', () => {
  const p = pathway(
    { numUnits: 381, buildingTypeKey: 'highRise' },
    { exterior: { exteriorManualItems: { parkingEntrances: 3000 } } },
  );
  assert.equal(p.product, 381 * 35);
  assert.equal(p.suppressedByManual, false);
});

// ── solar sites ──────────────────────────────────────────────────────────────
// Mike 2026-09-04: "yes pathway should get a bump of 1.6x". Solar bollards ran
// ~1.53× conventional on the Avilla actuals. Parking keeps its own 2.3.

test('solar site design multiplies the model pathway line by pathway.solarMultiplier (1.6)', () => {
  assert.equal(PRICING.exterior.pathway.solarMultiplier, 1.6);
  const conv  = pathway({ numUnits: 372, buildingTypeKey: 'garden' });
  const solar = pathway({ numUnits: 372, buildingTypeKey: 'garden' }, { exterior: { siteDesignLevel: 'solar' } });
  assert.equal(conv.product, 372 * 60);
  assert.equal(conv.solarMultiplier, 1);
  assert.equal(solar.solarMultiplier, 1.6);
  assert.ok(Math.abs(solar.product - 372 * 60 * 1.6) < 0.01, `got ${solar.product}`);
});

test('solar applies AFTER the floor, a floored site still gets the premium ($4,000 → $6,400)', () => {
  const p = pathway({ numUnits: 50, buildingTypeKey: 'podium' }, { exterior: { siteDesignLevel: 'solar' } });
  assert.equal(p.floorApplied, true);
  assert.ok(Math.abs(p.product - 4000 * 1.6) < 0.01, `got ${p.product}`);
});

test('a hand-entered pathway figure is never multiplied, solar or not', () => {
  const b = calculateBudget(
    { numUnits: 381, buildingTypeKey: 'highRise' },
    { exterior: { siteDesignLevel: 'solar', exteriorManualItems: { pathwayLighting: 4800 } } },
  );
  assert.equal(b.sections.exterior.pathway.product, 0);
  assert.equal(b.sections.exterior.manualAdderTotal, 4800);
});

test('surface parking keeps its own 2.3× solar multiplier, the pathway bump does not leak', () => {
  const pd = { numUnits: 372, numSurfaceParking: 90, buildingTypeKey: 'garden' };
  const conv  = calculateBudget(pd).sections.exterior;
  const solar = calculateBudget(pd, { exterior: { siteDesignLevel: 'solar' } }).sections.exterior;
  assert.equal(solar.solar.multiplier, PRICING.exterior.solarMultiplier);
  assert.equal(solar.solar.multiplier, 2.3);
  assert.ok(Math.abs(solar.parking.product - conv.parking.product * 2.3) < 0.01);
});

// ── plumbing ─────────────────────────────────────────────────────────────────

test('the pathway line rides in the exterior total and the misc-buffer base', () => {
  const pd = { numUnits: 200, buildingTypeKey: 'garden' };
  const withP    = calculateBudget(pd).sections.exterior;
  // Same project, but pathway zeroed via a pricing override, the delta must be
  // exactly the pathway line grossed up by the misc buffer. The rate is set to
  // 0 explicitly: a snapshot that simply LACKS the table falls through to the
  // master sheet (see pricingSnapshotFill.test.mjs), so emptying it is not
  // "zero", it is "never had it".
  const zeroRates = structuredClone(PRICING);
  zeroRates.exterior.pathway.dollarsPerUnit.garden = 0;
  const withoutP = calculateBudget(pd, {}, zeroRates).sections.exterior;

  const expectedLine = 200 * 60; // garden
  assert.equal(withP.pathway.product, expectedLine);
  assert.equal(withoutP.pathway.product, 0);
  const delta = withP.total.product - withoutP.total.product;
  const grossed = expectedLine * (1 + PRICING.exterior.miscBufferPct);
  assert.ok(Math.abs(delta - grossed) < 0.01,
    `exterior total moved by ${delta}, expected ${grossed} (line + 5% buffer)`);
});

test('an exterior override still replaces everything, pathway included', () => {
  const b = calculateBudget(
    { numUnits: 381, buildingTypeKey: 'highRise' },
    { exterior: { exteriorOverride: '12345' } },
  );
  assert.equal(b.sections.exterior.total.product, 12345);
});
