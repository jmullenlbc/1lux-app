/**
 * Property / fuzz testing for calculateBudget.
 * Throws thousands of random VALID inputs at the engine and asserts invariants
 * that must hold for every input. Catches NaN/Infinity, sign errors, broken
 * proportions, and rounding drift that hand-picked scenarios miss.
 *
 * Run: npx tsx _tests/fuzz-budget.mjs
 */
import { calculateBudget } from '../src/lib/calculations.js';

const N = 8000;
let checks = 0, fails = 0;
const failSamples = [];

function fail(inv, detail, scenario) {
  fails++;
  if (failSamples.length < 12) failSamples.push({ inv, detail, scenario: JSON.stringify(scenario).slice(0,300) });
}
function check(cond, inv, detail, scenario) { checks++; if (!cond) fail(inv, detail, scenario); }

// Seeded RNG (mulberry32) so fuzz runs are deterministic & reproducible — a
// failure can be re-run identically instead of being flaky. Change the seed to
// explore a different input space.
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
const rnd = mulberry32(0xC0FFEE);
const rint = (min, max) => Math.floor(rnd() * (max - min + 1)) + min;
const pick = arr => arr[rint(0, arr.length - 1)];
const BUILDINGS = ['singleFamily','townHouses','stackedFlats','garden','gurban','wrap','podium','midRise','highRise'];
const UC   = ['none','lineVoltage','lowVoltage'];
const PEND = ['none','threeSmallLow','threeSmallMedium','twoMediumLow','twoMediumMedium','oneLarge','oneLinear'];
const FANS = ['none','masterOnly','livingRoomOnly','masterAndLiving','masterAndSecondary','masterSecondaryLiving','masterSecondaryTertiary','masterSecondaryTertiaryLiving'];
const VAN  = ['bathBarLow','illuminatedMirrorLow','illuminatedMirrorMedium','illuminatedMirrorHigh','bathBarMedium','bathBarHigh'];
const BAL  = ['none','disk5inch','sconcelow','sconceMedium','sconceHigh'];
const SCON = ['none','low','medium','high','integrated'];
const EMG  = ['generator','frogeyes','frogeyes_inv','integrated_frogeyes','integrated_inverters','inverters'];
const AMEN = ['low','medium','high', String(rint(6,15))];
const EXT  = ['low','lowMedium','medium','high', String(rint(1,5))];

function randomScenario() {
  // Keep grossSf away from exactly 300,000 to avoid the (intentional) exit-signs discontinuity
  const grossSf = rint(0, 2_000_000);
  const pd = {
    grossSf,
    unitsSf:             rint(0, grossSf || 1),
    numUnits:            rint(0, 2000),
    numBalconies:        rint(0, 2000),
    numFans:             rnd() < 0.5 ? rint(0, 2000) : 0,
    numVanities:         rint(0, 3000),
    numBathrooms:        rint(0, 3000),
    corridorSf:          rint(0, 200000),
    interiorAmenitySf:   rint(0, 50000),
    exteriorAmenitySf:   rint(0, 50000),
    garageSf:            rint(0, 400000),
    bohSf:               rint(0, 50000),
    numEgressStairwells: rint(0, 200),
    numSurfaceParking:   rint(0, 1000),
    numCarports:         rint(0, 200),
    numGarages:          rint(0, 200),
    numExteriorDoors:    rint(0, 200),
    numAccentDownlights: rint(0, 200),
    lotSf:               rint(0, 500000),
    buildingFootprintSf: rint(0, 200000),
    buildingTypeKey:     pick(BUILDINGS),
    salesTaxPct:         rnd() < 0.5 ? 0 : rnd() * 0.12,
  };
  const r = {
    units: { undercabinet: pick(UC), kitchenPendants: pick(PEND), fans: pick(FANS), vanity: pick(VAN), balcony: pick(BAL) },
    corridors: { unitSconce: pick(SCON) },
    amenities: { interiorLevel: pick(AMEN) },
    exterior:  { amenityLevel: pick(EXT), amenityHours: pick(['beforeDusk','duskToDawn','afterSunset']) },
    emergency: { strategy: pick(EMG) },
    controls:  { energyCredit: pick(['yes','no']) },
    entryDisk: pick(['typical','12inch','decorative']),
    fanSize52: pick(['yes','no']),
  };
  return { pd, r };
}

const numeric = (obj, path='') => {
  const bad = [];
  for (const [k,v] of Object.entries(obj)) {
    if (v && typeof v === 'object') bad.push(...numeric(v, path+k+'.'));
    else if (typeof v === 'number' && !Number.isFinite(v)) bad.push(path+k+'='+v);
  }
  return bad;
};

for (let i = 0; i < N; i++) {
  const { pd, r } = randomScenario();
  let res;
  try { res = calculateBudget(pd, r); }
  catch (e) { fail('NO-THROW', e.message, { pd, r }); continue; }

  // INV1: no NaN/Infinity anywhere in the result
  const bad = numeric(res);
  check(bad.length === 0, 'INV1-finite', 'non-finite: ' + bad.join(','), { pd, r });

  // INV2: total non-negative
  check(res.totalWithControls >= 0, 'INV2-nonneg', 'total=' + res.totalWithControls, { pd, r });

  // INV3: total >= lighting subtotal (controls + F+W+T only add)
  check(res.totalWithControls >= res.lightingProductSubtotal - 0.01, 'INV3-total>=sub',
        `total=${res.totalWithControls} sub=${res.lightingProductSubtotal}`, { pd, r });

  // INV4: freight / warehousing / tax match their rates on the subtotal
  check(Math.abs(res.freight - res.lightingProductSubtotal * res.freightRate) < 0.02, 'INV4-freight', '', { pd, r });
  check(Math.abs(res.warehousing - res.lightingProductSubtotal * res.warehousingRate) < 0.02, 'INV4-warehouse', '', { pd, r });

  // INV5: perUnit * numUnits within rounding of total
  if (pd.numUnits > 0) {
    check(Math.abs(res.perUnit * pd.numUnits - res.totalWithControls) <= pd.numUnits * 0.5 + 1,
          'INV5-perUnit', `perUnit=${res.perUnit} units=${pd.numUnits} total=${res.totalWithControls}`, { pd, r });
  }

  // INV6: section products finite (designAdder may be negative; others >= 0)
  const s = res.sections;
  for (const [name, val] of [['units',s.units.total.product],['corridors',s.corridors.total.product],
       ['boh',s.boh.product],['interior',s.interior.product],['garage',s.garage.product],
       ['exterior',s.exterior.total.product],['emergency',s.emergency.product],['exitSigns',s.exitSigns.product]]) {
    check(Number.isFinite(val) && val >= -0.01, 'INV6-section-'+name, `${name}=${val}`, { pd, r });
  }
}

// INV7: monotonic in grossSf within a non-300K-crossing band
{
  const base = { unitsSf: 100000, numUnits: 200, corridorSf: 10000, garageSf: 50000, bohSf: 5000,
                 interiorAmenitySf: 5000, buildingTypeKey: 'midRise', salesTaxPct: 0.08 };
  let prev = -1, mono = true;
  for (let sf = 50000; sf <= 290000; sf += 10000) {  // stays below 300K threshold
    const t = calculateBudget({ ...base, grossSf: sf }, {}).totalWithControls;
    if (t < prev - 0.01) mono = false;
    prev = t;
  }
  check(mono, 'INV7-monotonic-grossSf', 'total decreased as grossSf rose below 300K', {});
}

// INV8: doubling unitsSf doubles the base unit product
{
  const a = calculateBudget({ grossSf: 100000, unitsSf: 100000, numUnits: 100 }, {});
  const b = calculateBudget({ grossSf: 200000, unitsSf: 200000, numUnits: 100 }, {});
  check(Math.abs(b.sections.units.base.product - 2 * a.sections.units.base.product) < 0.01,
        'INV8-linear-base', `a=${a.sections.units.base.product} b=${b.sections.units.base.product}`, {});
}

console.log('═'.repeat(70));
console.log(`  FUZZ: ${N} random scenarios + targeted invariants`);
console.log(`  Total invariant checks: ${checks}`);
console.log(`  Failures: ${fails}`);
console.log('═'.repeat(70));
if (fails) {
  console.log('\n  SAMPLE FAILURES:');
  failSamples.forEach((f,i)=>console.log(`   ${i+1}. [${f.inv}] ${f.detail}\n      ${f.scenario}`));
  process.exit(1);
} else {
  console.log('  ✓ All invariants held across every scenario.');
}
