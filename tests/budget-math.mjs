/**
 * ILC Budget Math — Test Harness
 *
 * Stress-tests the calculateBudget() function in src/lib/calculations.js
 * with controlled scenarios. Pure-function testing — does not touch the
 * database, the UI, or production.
 *
 * Run with:   npx tsx _tests/budget-math.mjs
 *
 * Author: Sean (with Claude's help)
 * Status: scratch-space until promoted to a committed regression suite.
 */

import { calculateBudget, formatCurrency } from '../src/lib/calculations.js';

// ───────────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────────

const $ = (v) => formatCurrency(v);
const pct = (a, b) => (b === 0 ? '∞' : ((a / b) * 100).toFixed(2) + '%');

let totalAssertions = 0;
let passedAssertions = 0;
const failures = [];

function assert(condition, message) {
  totalAssertions += 1;
  if (condition) {
    passedAssertions += 1;
    console.log(`  ✓ ${message}`);
  } else {
    failures.push(message);
    console.log(`  ✗ ${message}`);
  }
}

function assertEqualCurrency(actual, expected, tolerance, label) {
  totalAssertions += 1;
  const diff = Math.abs(actual - expected);
  if (diff <= tolerance) {
    passedAssertions += 1;
    console.log(`  ✓ ${label}: ${$(actual)} (expected ${$(expected)} ±${$(tolerance)})`);
  } else {
    failures.push(`${label}: got ${$(actual)}, expected ${$(expected)}, diff ${$(diff)}`);
    console.log(`  ✗ ${label}: ${$(actual)} (expected ${$(expected)} ±${$(tolerance)}, off by ${$(diff)})`);
  }
}

function section(title) {
  console.log('\n' + '━'.repeat(75));
  console.log(`  ${title}`);
  console.log('━'.repeat(75));
}

function summarize(result) {
  console.log('  ── INPUTS:');
  console.log('  ── OUTPUT:');
  console.log(`     base unit product       ${$(result.sections.units.base.product)}`);
  console.log(`     units total             ${$(result.sections.units.total.product)}`);
  console.log(`     corridors total         ${$(result.sections.corridors.total.product)}`);
  console.log(`     boh                     ${$(result.sections.boh.product)}`);
  console.log(`     interior                ${$(result.sections.interior.product)}`);
  console.log(`     garage                  ${$(result.sections.garage.product)}`);
  console.log(`     exterior total          ${$(result.sections.exterior.total.product)}`);
  console.log(`     emergency               ${$(result.sections.emergency.product)}`);
  console.log(`     exit signs              ${$(result.sections.exitSigns.product)}`);
  console.log(`     design adders           ${$(result.sections.designAdder.product)}`);
  console.log(`     ─────`);
  console.log(`     lighting subtotal       ${$(result.lightingProductSubtotal)}`);
  console.log(`     + freight (${(result.freightRate * 100).toFixed(1)}%)         ${$(result.freight)}`);
  console.log(`     + warehousing (${(result.warehousingRate * 100).toFixed(1)}%)     ${$(result.warehousing)}`);
  console.log(`     + sales tax (${(result.salesTaxPct * 100).toFixed(2)}%)        ${$(result.lightingTaxAmount)}`);
  console.log(`     subtotal lighting only  ${$(result.subtotalLightingOnly)}`);
  console.log(`     controls product        ${$(result.controls)}`);
  console.log(`     controls total          ${$(result.controlsTotal)}`);
  console.log(`     ════`);
  console.log(`     TOTAL WITH CONTROLS     ${$(result.totalWithControls)}`);
  console.log(`     per SF                  ${$(result.perSf)}`);
  console.log(`     per unit                ${$(result.perUnit)}`);
  console.log(`     fan count               ${result.fanCount}`);
}

// ───────────────────────────────────────────────────────────────────────────
// Scenario 1: Baseline residential — show what the engine produces
// ───────────────────────────────────────────────────────────────────────────

section('SCENARIO 1: Baseline 200-unit multifamily (no questionnaire overrides)');

const baselinePD = {
  grossSf:            150000,
  unitsSf:            120000,
  numUnits:                200,
  numBalconies:          200,
  numVanities:           400,  // 2 bathrooms per unit
  corridorSf:           15000,
  interiorAmenitySf:     5000,
  exteriorAmenitySf:     3000,
  garageSf:             20000,
  bohSf:                 5000,
  numEgressStairwells:      3,
  numSurfaceParking:       50,
  numCarports:              0,
  numGarages:               0,
  numExteriorDoors:        12,
  lotSf:               200000,
  buildingFootprintSf:  30000,
  numAccentDownlights:      0,
  buildingTypeKey:    'midRise',
  salesTaxPct:           0.0915,  // ~9.15% — typical
};

const result1 = calculateBudget(baselinePD, {});
console.log('  ── INPUTS: 150K gross SF, 120K units SF, 200 units, 400 vanities, 15K corridor,');
console.log('             50 parking, midRise, 9.15% sales tax');
summarize(result1);
console.log('\n  ── SEAN: Does the total magnitude look right for a 200-unit midRise?');
console.log('     A typical such project ballpark? Per-unit and per-SF in sane range?');

// ───────────────────────────────────────────────────────────────────────────
// Scenario 2: Exit signs threshold rule (FIXED in commit f7a45e8)
// ───────────────────────────────────────────────────────────────────────────
// Pricing.js declares exitSigns.largeProjectThreshold = 300000 with comment
// "above this, divide result by 2". Originally the code did not apply this
// rule. The fix in src/lib/calculations.js applies it. This scenario now
// serves as a regression check.

section('SCENARIO 2: Exit signs threshold rule (regression check)');

const smallPD = { ...baselinePD, grossSf: 299999 };
const largePD = { ...baselinePD, grossSf: 300001 };

const small = calculateBudget(smallPD, {});
const large = calculateBudget(largePD, {});

console.log(`  small project (299,999 SF) exit signs: ${$(small.sections.exitSigns.product)}`);
console.log(`  large project (300,001 SF) exit signs: ${$(large.sections.exitSigns.product)}`);
console.log(`  ratio large/small:                     ${(large.sections.exitSigns.product / small.sections.exitSigns.product).toFixed(4)}`);
console.log('');
console.log('  Per pricing.js: large should be ~50% of small per-SF basis');
console.log('  So large/small ratio for total $ should be ~0.5 × (300001/299999) ≈ 0.500');
console.log('  If ratio is ~1.0, the threshold rule is not applied (bug).');
assert(
  large.sections.exitSigns.product < small.sections.exitSigns.product,
  'Exit signs cost SHOULD drop above 300K SF threshold (per pricing.js comment)'
);

// ───────────────────────────────────────────────────────────────────────────
// Scenario 3: Energy credit — does it compound through F/W/T?
// ───────────────────────────────────────────────────────────────────────────

section('SCENARIO 3: Energy credit — applied as reduction pre-FWT (post Q1 refactor)');

const noCredit   = calculateBudget(baselinePD, { controls: { energyCredit: 'no'  } });
const withCredit = calculateBudget(baselinePD, { controls: { energyCredit: 'yes' } });

// Per Mike's intent: credit reduces lighting subtotal BEFORE F+W+T,
// so savings = (3% × full subtotal) × (1 + freightRate + warehousingRate + salesTaxPct)
const fullSubtotal       = noCredit.lightingProductSubtotal;
const expectedCreditAmt  = fullSubtotal * 0.03;
const fwtMultiplier      = 1 + 0.06 + 0.03 + baselinePD.salesTaxPct;
const expectedSavings    = expectedCreditAmt * fwtMultiplier;
const actualSavings      = noCredit.totalWithControls - withCredit.totalWithControls;

console.log(`  full lighting subtotal (no credit): ${$(fullSubtotal)}`);
console.log(`  3% credit amount:                   ${$(expectedCreditAmt)}`);
console.log(`  F+W+T multiplier (at ${(baselinePD.salesTaxPct*100).toFixed(2)}% tax): ${fwtMultiplier.toFixed(4)}`);
console.log(`  expected savings:                   ${$(expectedSavings)}`);
console.log(`  total without credit:               ${$(noCredit.totalWithControls)}`);
console.log(`  total with credit:                  ${$(withCredit.totalWithControls)}`);
console.log(`  actual savings:                     ${$(actualSavings)}`);
console.log(`  withCredit.energyCreditAmount:      ${$(withCredit.energyCreditAmount)}`);
console.log('');
console.log('  Q1 (Mike): credit should reduce lighting subtotal before F+W+T, savings = credit × (1+F+W+T)');

assert(
  Math.abs(actualSavings - expectedSavings) < 0.01,
  `Energy credit reduces total by credit × (1+F+W+T): expected savings ${$(expectedSavings)}, got ${$(actualSavings)}`
);
assert(
  Math.abs(withCredit.energyCreditAmount - expectedCreditAmt) < 0.01,
  'withCredit.energyCreditAmount matches 3% of pre-credit subtotal'
);
assert(
  noCredit.energyCreditAmount === 0,
  'noCredit.energyCreditAmount === 0 when energyCredit is not "yes"'
);
assert(
  withCredit.totalWithControls < noCredit.totalWithControls,
  'Energy credit REDUCES total (Q1 intent — savings, not adder)'
);

// ───────────────────────────────────────────────────────────────────────────
// Scenario 4: Controls override — does it replace or compound?
// ───────────────────────────────────────────────────────────────────────────

section('SCENARIO 4: Controls override behavior');

const noOverride = calculateBudget(baselinePD, {});
const overridden = calculateBudget(baselinePD, { controls: { controlsOverride: 50000 } });

console.log(`  computed controls product:        ${$(noOverride.controls)}`);
console.log(`  computed controls total (w/ FWT): ${$(noOverride.controlsTotal)}`);
console.log(`  override entered:                 ${$(50000)}`);
console.log(`  controls product after override:  ${$(overridden.controls)}`);
console.log(`  controls TOTAL after override:    ${$(overridden.controlsTotal)}`);
console.log('');
console.log('  Mike Q2 ANSWERED: override is the PRODUCT cost; F+W+T correctly layer on top.');
console.log('  So controls TOTAL should be $50K × (1 + freight + warehousing + tax).');
const expectedControlsTotal = 50000 * (1 + 0.06 + 0.03 + baselinePD.salesTaxPct);
assert(
  Math.abs(overridden.controls - 50000) < 0.01,
  'Override sets controls product to exactly the entered value'
);
assert(
  Math.abs(overridden.controlsTotal - expectedControlsTotal) < 0.01,
  `Override controls TOTAL = $50K × (1+F+W+T) = ${$(expectedControlsTotal)} (Mike Q2: F+W+T layer on top)`
);

// ───────────────────────────────────────────────────────────────────────────
// Scenario 5: Zero / missing input edge cases — does it crash?
// ───────────────────────────────────────────────────────────────────────────

section('SCENARIO 5: Edge cases — empty / zero / missing inputs');

const zeroAll   = calculateBudget({}, {});
const zeroUnits = calculateBudget({ ...baselinePD, numUnits: 0 }, {});
const zeroSf    = calculateBudget({ ...baselinePD, grossSf: 0, unitsSf: 0 }, {});

console.log(`  empty input total:                ${$(zeroAll.totalWithControls)}`);
console.log(`  empty input perSf:                ${zeroAll.perSf}`);
console.log(`  empty input perUnit:              ${zeroAll.perUnit}`);
console.log(`  numUnits=0 total:                 ${$(zeroUnits.totalWithControls)}`);
console.log(`  numUnits=0 perUnit:               ${zeroUnits.perUnit}`);
console.log(`  grossSf=0 total:                  ${$(zeroSf.totalWithControls)}`);
console.log(`  grossSf=0 perSf:                  ${zeroSf.perSf}`);

assert(isFinite(zeroAll.totalWithControls), 'Empty input does not produce NaN/Infinity for total');
assert(zeroAll.perUnit === 0,                'numUnits=0 produces perUnit = 0 (not NaN/Infinity)');
assert(zeroSf.perSf === 0,                   'grossSf=0 produces perSf = 0 (not NaN/Infinity)');

// ───────────────────────────────────────────────────────────────────────────
// Scenario 6: Large project — does the math still make sense?
// ───────────────────────────────────────────────────────────────────────────

section('SCENARIO 6: Large project sanity (1M SF, 1000 units)');

const largeProject = {
  ...baselinePD,
  grossSf:    1000000,
  unitsSf:     800000,
  numUnits:       1000,
  corridorSf:   100000,
  garageSf:     150000,
};
const largeResult = calculateBudget(largeProject, {});

console.log(`  total:                            ${$(largeResult.totalWithControls)}`);
console.log(`  per SF:                           $${largeResult.perSf}`);
console.log(`  per unit:                         ${$(largeResult.perUnit)}`);
console.log(`  controls (after cap):             ${$(largeResult.controls)}`);
console.log('');
console.log('  Sanity check: per-SF and per-unit should be in same ballpark as baseline');
console.log(`  baseline per SF was $${result1.perSf}, large is $${largeResult.perSf}`);

assert(largeResult.perSf > 0 && largeResult.perSf < 50,    'large project per-SF in sane range ($0–$50)');
assert(largeResult.perUnit > 0 && largeResult.perUnit < 50000, 'large project per-unit in sane range ($0–$50K)');

// ───────────────────────────────────────────────────────────────────────────
// Scenario 7: Building type matrix — controls behavior across all 9 types
// ───────────────────────────────────────────────────────────────────────────

section('SCENARIO 7: Building type controls comparison (same project, different type)');

const buildingTypes = [
  'singleFamily', 'townHouses', 'stackedFlats', 'garden', 'gurban',
  'wrap', 'podium', 'midRise', 'highRise',
];

console.log('  type           | controls $    | controls + FWT  | total project   | per-unit');
console.log('  ─'.repeat(38));
for (const bt of buildingTypes) {
  const r = calculateBudget({ ...baselinePD, buildingTypeKey: bt }, {});
  const ctrl = r.controls.toString().padStart(10);
  const ctrlT = $(r.controlsTotal).padStart(12);
  const tot  = $(r.totalWithControls).padStart(13);
  const pu   = $(r.perUnit).padStart(8);
  console.log(`  ${bt.padEnd(14)} | $${ctrl}   | ${ctrlT}   | ${tot}  | ${pu}`);
}

// Verify singleFamily and townHouses produce $0 controls (rate is 0)
const sf = calculateBudget({ ...baselinePD, buildingTypeKey: 'singleFamily' }, {});
const th = calculateBudget({ ...baselinePD, buildingTypeKey: 'townHouses'   }, {});
assert(sf.controls === 0, 'singleFamily produces $0 controls (rate is 0)');
assert(th.controls === 0, 'townHouses produces $0 controls (rate is 0)');

// Verify midRise cap is respected at very large grossSf
const huge = calculateBudget({ ...baselinePD, grossSf: 5000000, buildingTypeKey: 'midRise' }, {});
assert(huge.controls === 175000, 'midRise controls capped at $175,000 even at 5M SF');

// ───────────────────────────────────────────────────────────────────────────
// Scenario 8: Sales tax = 0 sanity
// ───────────────────────────────────────────────────────────────────────────

section('SCENARIO 8: Sales tax = 0 (verify no artifacts)');

const noTax = calculateBudget({ ...baselinePD, salesTaxPct: 0 }, {});
console.log(`  lighting subtotal:                ${$(noTax.lightingProductSubtotal)}`);
console.log(`  lighting tax:                     ${$(noTax.lightingTaxAmount)} (should be exactly $0)`);
console.log(`  controls tax:                     ${$(noTax.controlsTaxAmount)} (should be exactly $0)`);
console.log(`  total:                            ${$(noTax.totalWithControls)}`);

assert(noTax.lightingTaxAmount === 0, 'salesTaxPct=0 → lightingTaxAmount = $0');
assert(noTax.controlsTaxAmount === 0, 'salesTaxPct=0 → controlsTaxAmount = $0');
assert(isFinite(noTax.totalWithControls), 'salesTaxPct=0 does not produce NaN/Infinity');

// ───────────────────────────────────────────────────────────────────────────
// Scenario 9: Per-unit / per-SF internal consistency
// ───────────────────────────────────────────────────────────────────────────
// perUnit is rounded to whole dollars, perSf to cents. Check the rounding
// hasn't introduced significant drift versus the unrounded math.

section('SCENARIO 9: perUnit / perSf rounding consistency');

const r9 = calculateBudget(baselinePD, {});
const expectedPerUnitRaw = r9.totalWithControls / baselinePD.numUnits;
const expectedPerSfRaw   = r9.totalWithControls / baselinePD.grossSf;

console.log(`  total:                       ${$(r9.totalWithControls)}`);
console.log(`  total / numUnits (raw):      ${$(expectedPerUnitRaw)}`);
console.log(`  perUnit (rounded to $1):     ${$(r9.perUnit)}`);
console.log(`  delta from raw:              ${$(Math.abs(expectedPerUnitRaw - r9.perUnit))}`);
console.log(`  total / grossSf (raw):       $${expectedPerSfRaw.toFixed(4)}`);
console.log(`  perSf (rounded to $0.01):    $${r9.perSf.toFixed(4)}`);

assert(Math.abs(expectedPerUnitRaw - r9.perUnit) <= 0.5, 'perUnit rounding is within $0.50 of raw');
assert(Math.abs(expectedPerSfRaw   - r9.perSf  ) <= 0.005, 'perSf rounding is within $0.005 of raw');

// ───────────────────────────────────────────────────────────────────────────
// Scenario 10: Garage design level (REPLACES flat garage rate, not adds)
// ───────────────────────────────────────────────────────────────────────────
// The garageDesignLevel logic is unusual: it computes a new garage value
// and ADDS (newValue - oldGarageProduct) to designAdder, effectively
// replacing the original $0.27/SF flat rate. Test this carefully.

section('SCENARIO 10: Garage design level replacement');

const plainGarage = calculateBudget(baselinePD, {});
const stdGarage   = calculateBudget(baselinePD, { corridors: { garageDesignLevel: 'standard'  } });
const enhGarage   = calculateBudget(baselinePD, { corridors: { garageDesignLevel: 'enhanced'  } });

const plainGarageVal = plainGarage.sections.garage.product;       // $0.27/SF
const expectedStd    = 20000 * 0.30;                              // standard $0.30/SF
const expectedEnh    = 20000 * 0.45;                              // enhanced $0.45/SF
const stdNetAdder    = stdGarage.sections.designAdder.product;
const enhNetAdder    = enhGarage.sections.designAdder.product;

console.log(`  garage SF: 20,000`);
console.log(`  plain garage product (0.27/SF):       ${$(plainGarageVal)}`);
console.log(`  expected standard (0.30/SF):          ${$(expectedStd)}`);
console.log(`  expected enhanced (0.45/SF):          ${$(expectedEnh)}`);
console.log(`  standard design adder delta:          ${$(stdNetAdder)} (should be ${$(expectedStd - plainGarageVal)})`);
console.log(`  enhanced design adder delta:          ${$(enhNetAdder)} (should be ${$(expectedEnh - plainGarageVal)})`);

assert(Math.abs(stdNetAdder - (expectedStd - plainGarageVal)) < 0.01, 'standard garage adder = expected - plain');
assert(Math.abs(enhNetAdder - (expectedEnh - plainGarageVal)) < 0.01, 'enhanced garage adder = expected - plain');

// ───────────────────────────────────────────────────────────────────────────
// Scenario 11: Emergency strategies — same project, all 6 strategies
// ───────────────────────────────────────────────────────────────────────────

section('SCENARIO 11: Emergency strategies comparison');

const strategies = [
  'generator', 'frogeyes', 'frogeyes_inv',
  'integrated_frogeyes', 'integrated_inverters', 'inverters',
];

console.log('  strategy              | emergency product');
console.log('  ─'.repeat(35));
for (const s of strategies) {
  const r = calculateBudget(baselinePD, { emergency: { strategy: s } });
  console.log(`  ${s.padEnd(22)}| ${$(r.sections.emergency.product)}`);
}

// 'generator' strategy should produce $0 emergency cost
const genStrat = calculateBudget(baselinePD, { emergency: { strategy: 'generator' } });
assert(genStrat.sections.emergency.product === 0, 'generator strategy produces $0 emergency cost');

// 'inverters' should be the most expensive (highest $/SF on all categories)
const allStrats = strategies.map(s => ({
  s,
  cost: calculateBudget(baselinePD, { emergency: { strategy: s } }).sections.emergency.product,
}));
const maxStrat = allStrats.reduce((a, b) => (a.cost > b.cost ? a : b));
assert(maxStrat.s === 'inverters' || maxStrat.s === 'integrated_inverters',
  'highest-cost emergency strategy is "inverters" or "integrated_inverters"');

// ───────────────────────────────────────────────────────────────────────────
// Scenario 12: Fan count derivation
// ───────────────────────────────────────────────────────────────────────────
// fanCount = pd.numFans if set, else ROUND(numUnits × multiplier).
// Multipliers: none=0, masterOnly=1, livingRoomOnly=1, masterAndLiving=2,
// masterAndSecondary=1.5, masterSecondaryLiving=2.5, masterSecondaryTertiary=2.5,
// masterSecondaryTertiaryLiving=2.75

section('SCENARIO 12: Fan count derivation from numUnits × multiplier');

const fanCases = [
  { fans: 'none',                          mult: 0,    expectedFor200: 0   },
  { fans: 'masterOnly',                    mult: 1,    expectedFor200: 200 },
  { fans: 'livingRoomOnly',                mult: 1,    expectedFor200: 200 },
  { fans: 'masterAndLiving',               mult: 2,    expectedFor200: 400 },
  { fans: 'masterAndSecondary',            mult: 1.5,  expectedFor200: 300 },
  { fans: 'masterSecondaryLiving',         mult: 2.5,  expectedFor200: 500 },
  { fans: 'masterSecondaryTertiary',       mult: 2.5,  expectedFor200: 500 },
  { fans: 'masterSecondaryTertiaryLiving', mult: 2.75, expectedFor200: 550 },
];

for (const c of fanCases) {
  const r = calculateBudget({ ...baselinePD, numFans: 0 }, { units: { fans: c.fans } });
  const ok = r.fanCount === c.expectedFor200;
  console.log(`  fans=${c.fans.padEnd(34)} mult=${c.mult.toString().padStart(4)}  got fanCount=${r.fanCount.toString().padStart(3)}  expected ${c.expectedFor200}`);
  assert(ok, `fanCount for "${c.fans}" with 200 units = ${c.expectedFor200}`);
}

// Override: explicit numFans takes precedence
const overrideFans = calculateBudget({ ...baselinePD, numFans: 73 }, { units: { fans: 'masterSecondaryLiving' } });
assert(overrideFans.fanCount === 73, 'explicit pd.numFans overrides the multiplier calculation');

// ───────────────────────────────────────────────────────────────────────────
// Scenario X: REALISTIC 350-unit midRise with typical questionnaire choices
// ───────────────────────────────────────────────────────────────────────────
// Mason said "$267K seems pretty low" — but baseline used an empty questionnaire.
// Realistic projects have actual unit/corridor/exterior choices made. Show what
// a representative full-questionnaire project produces and verify it lands in
// Mike's stated $500K–$1.9M procurement range.

section('SCENARIO X: Realistic 350-unit midRise (Mason calibration check)');

const realisticPD = {
  grossSf:             380000,
  unitsSf:             280000,
  numUnits:                350,
  numBalconies:          300,
  numVanities:           600,  // ~1.7 baths per unit
  corridorSf:           35000,
  interiorAmenitySf:     6000,
  exteriorAmenitySf:     4000,
  garageSf:             60000,
  bohSf:                12000,
  numEgressStairwells:      6,
  numSurfaceParking:      120,
  numCarports:              0,
  numGarages:               0,
  numExteriorDoors:        20,
  lotSf:               350000,
  buildingFootprintSf:  50000,
  numAccentDownlights:     20,
  buildingTypeKey:    'midRise',
  salesTaxPct:          0.0825,  // typical
};

const realisticResponses = {
  units: {
    undercabinet:     'lowVoltage',          // +$220/unit
    kitchenPendants:  'twoMediumMedium',     // +$330/unit
    fans:             'masterAndLiving',     // 700 fans, +$140 each
    vanity:           'illuminatedMirrorMedium', // +$155/vanity
    balcony:          'sconceMedium',        // +$135/balcony
  },
  corridors: {
    unitSconce:       'medium',              // +$125/unit
    fixtureSpacing:   '10',                  // disks at 10ft = $0.25/SF
  },
  amenities: { interiorLevel: 'medium' },     // $10/SF
  exterior:  { amenityLevel:  'medium' },     // $3/SF (default)
  emergency: { strategy: 'integrated_inverters' },
  controls:  { energyCredit: 'no' },
};

const realistic = calculateBudget(realisticPD, realisticResponses);
summarize(realistic);
console.log('');
console.log('  Mike said: typical project procurement is $500K–$1.9M average.');
console.log('  Mason said: $267K (empty questionnaire) was likely low if it included controls + site.');
console.log(`  Realistic-questionnaire total: ${$(realistic.totalWithControls)}`);
console.log(`  Per-unit: ${$(realistic.perUnit)} | per-SF: $${realistic.perSf.toFixed(2)}`);

assert(
  realistic.totalWithControls >= 400000 && realistic.totalWithControls <= 2000000,
  'Realistic 350-unit midRise lands in $400K–$2M range (Mike\'s stated procurement bracket)'
);

// ───────────────────────────────────────────────────────────────────────────
// Scenario 13: Misc design adders (spot check several at once)
// ───────────────────────────────────────────────────────────────────────────

section('SCENARIO 13: Design adders — spot check individual adders');

const baseR = calculateBudget(baselinePD, {});
const baseAdder = baseR.sections.designAdder.product;
console.log(`  baseline design adder total:         ${$(baseAdder)} (no overrides set)`);

// Backlit disk: should be -$0.04 × unitsSf credit
const backlit = calculateBudget(baselinePD, { units: { diskType: 'backlit' } });
const expectedBacklitDelta = baselinePD.unitsSf * -0.04;
console.log(`  backlit disk delta:                  ${$(backlit.sections.designAdder.product - baseAdder)} (expected ${$(expectedBacklitDelta)})`);
assert(Math.abs((backlit.sections.designAdder.product - baseAdder) - expectedBacklitDelta) < 0.01,
  'backlit disk credit = -$0.04 × unitsSf');

// Boiler room: +$15/unit
const boiler = calculateBudget(baselinePD, { units: { boilerRoom: 'yes' } });
const expectedBoilerDelta = baselinePD.numUnits * 15;
console.log(`  boiler room delta:                   ${$(boiler.sections.designAdder.product - baseAdder)} (expected ${$(expectedBoilerDelta)})`);
assert(Math.abs((boiler.sections.designAdder.product - baseAdder) - expectedBoilerDelta) < 0.01,
  'boiler room adder = $15 × numUnits');

// Living room 4 disks: +$34/unit
const livingDisks = calculateBudget(baselinePD, { units: { livingRoomDisks: '4small' } });
const expectedLivingDelta = baselinePD.numUnits * 34;
console.log(`  4 small living room disks delta:     ${$(livingDisks.sections.designAdder.product - baseAdder)} (expected ${$(expectedLivingDelta)})`);
assert(Math.abs((livingDisks.sections.designAdder.product - baseAdder) - expectedLivingDelta) < 0.01,
  'living room 4-disk adder = $34 × numUnits');

// Stairwell elevated: +$50/stairwell
const elevStair = calculateBudget(baselinePD, { corridors: { stairwellDesign: 'elevated' } });
const expectedStairDelta = baselinePD.numEgressStairwells * 50;
console.log(`  stairwell elevated delta:            ${$(elevStair.sections.designAdder.product - baseAdder)} (expected ${$(expectedStairDelta)})`);
assert(Math.abs((elevStair.sections.designAdder.product - baseAdder) - expectedStairDelta) < 0.01,
  'stairwell elevated adder = $50 × numEgressStairwells');

// ───────────────────────────────────────────────────────────────────────────
// Summary
// ───────────────────────────────────────────────────────────────────────────

console.log('\n' + '═'.repeat(75));
console.log(`  RESULTS: ${passedAssertions} / ${totalAssertions} assertions passed`);
console.log('═'.repeat(75));

if (failures.length > 0) {
  console.log('\n  FAILURES (likely bugs or expectation mismatches):');
  failures.forEach((f, i) => console.log(`    ${i + 1}. ${f}`));
}

console.log('\n  Re-run with:  npm test  (or: npx tsx tests/budget-math.mjs)\n');

// Non-zero exit on any failure so `npm test` / CI reports correctly.
if (failures.length > 0) process.exit(1);
