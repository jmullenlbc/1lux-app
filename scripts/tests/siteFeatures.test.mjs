/**
 * Sporadic site features, dog parks, courtyards, playgrounds, tennis and
 * pickleball courts, turf play areas.
 *
 * Mike 2026-09-16, what each one gets:
 *   Dog park          1 area light at the entrance            ($1,400 each)
 *   Courtyard         2 twelve-foot pedestrian poles each (Mike 10-14, count only)
 *   Playground        2 twelve-foot pedestrian poles          ($2,000 each)
 *   Tennis court      4 area lights per court                 ($1,400 each)
 *   Pickleball court  4 area lights per court                 ($1,400 each)
 *   Turf play area    1 twelve-foot pedestrian pole per 50 ft ($2,000 each)
 *
 * Nothing guesses: a feature that is not on the drawings and not typed in is
 * absent, and absent prices at $0.
 *
 * Run: node --test scripts/tests/siteFeatures.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  SITE_FEATURE_TYPES, SITE_FEATURE_ROW_KEYS, SITE_FEATURE_ROW_LABELS,
  normalizeSiteFeatures, siteFeatureFixtures, priceSiteFeatures,
  siteFeaturesFromRows, siteFeaturesToRows, siteFeatureCostLine,
} from '../../src/lib/siteFeatures.js';
import {
  describeSiteFeatureFinding, siteFeatureFindings, siteFeatureLineLabel, COURTYARD_FT_EACH, courtyardsFromFt,
} from '../../src/lib/siteFeatureWords.js';
import {
  siteFeatureFromFlat, isSiteFeatureRowKey, engineProjectData, describeSiteFeatureChange,
} from '../../src/lib/siteFeatureRows.js';
import { calculateBudget } from '../../src/lib/calculations.js';
import { PRICING } from '../../src/lib/pricing.js';

const RATES = PRICING.exterior.siteFeatures;

test('master sheet carries the six site feature rules at Mike\'s prices', () => {
  assert.equal(RATES.areaLight, 1400);
  assert.equal(RATES.pedestrianPole, 2000);
  assert.equal(RATES.dogPark.areaLights, 1);
  assert.equal(RATES.playground.pedestrianPoles, 2);
  assert.equal(RATES.tennisCourt.areaLights, 4);
  assert.equal(RATES.pickleballCourt.areaLights, 4);
  assert.equal(RATES.courtyard.pedestrianPoles, 2);
  assert.equal(RATES.turfPlay.ftPerPole, 50);
});

test('dog park: 1 area light at the entrance, $1,400', () => {
  const r = siteFeatureFixtures({ type: 'dogPark', count: 1 }, RATES);
  assert.equal(r.fixtures, 1);
  assert.equal(r.fixtureKind, 'areaLight');
  assert.equal(r.product, 1400);
});

test('dog park / playground: 2 pedestrian poles, $3,000 package each (Mike 10-14)', () => {
  const r = siteFeatureFixtures({ type: 'playground', count: 2 }, RATES);
  assert.equal(r.fixtures, 4);
  assert.equal(r.fixtureKind, 'pedestrianPole');
  assert.equal(r.product, 6000);
  assert.equal(siteFeatureCostLine(r), '2 × $3,000 package (4 pedestrian poles) = $6,000');
  // the package price is editable in master pricing
  assert.equal(siteFeatureFixtures({ type: 'playground', count: 1 }, { ...RATES, playground: { pedestrianPoles: 2, packageEach: 3500 } }).product, 3500);
});

test('tennis and pickleball: 4 area lights per court', () => {
  assert.equal(siteFeatureFixtures({ type: 'tennisCourt', count: 2 }, RATES).product, 2 * 4 * 1400);
  assert.equal(siteFeatureFixtures({ type: 'pickleballCourt', count: 3 }, RATES).product, 3 * 4 * 1400);
});

test('courtyard: two poles each, never measured (Mike 10-14)', () => {
  assert.equal(siteFeatureFixtures({ type: 'courtyard', count: 1 }, RATES).fixtures, 2);
  assert.equal(siteFeatureFixtures({ type: 'courtyard', count: 2 }, RATES).product, 4 * 2000);
  // a stray length from an old row changes nothing
  assert.equal(siteFeatureFixtures({ type: 'courtyard', count: 1, lengthFt: 900 }, RATES).fixtures, 2);
});

test('turf play: one pole per 50 ft, rounded up', () => {
  assert.equal(siteFeatureFixtures({ type: 'turfPlay', count: 1, lengthFt: 50 }, RATES).fixtures, 1);
  assert.equal(siteFeatureFixtures({ type: 'turfPlay', count: 1, lengthFt: 51 }, RATES).fixtures, 2);
  assert.equal(siteFeatureFixtures({ type: 'turfPlay', count: 1, lengthFt: 200 }, RATES).product, 4 * 2000);
});

test('a linear feature with no length prices at $0 and says so', () => {
  const r = siteFeatureFixtures({ type: 'turfPlay', count: 1 }, RATES);
  assert.equal(r.product, 0);
  assert.match(r.how, /no length known/);
});

test('unknown types and empty lists are ignored, absent is $0', () => {
  assert.equal(siteFeatureFixtures({ type: 'swimmingPool', count: 1 }, RATES), null);
  assert.deepEqual(priceSiteFeatures([], RATES), { product: 0, items: [], areaLights: 0, pedestrianPoles: 0 });
  assert.equal(priceSiteFeatures(undefined, RATES).product, 0);
});

test('normalize: dedupes by type, drops junk, keeps display order', () => {
  const list = normalizeSiteFeatures([
    { type: 'tennisCourt', count: 1, sheet: 3 },
    { type: 'dogPark', count: '1.2' },
    { type: 'tennisCourt', count: 1 },
    { type: 'nope', count: 9 },
    { type: 'playground', count: 0 },
    { type: 'courtyard', count: 1, lengthFt: -5 },
  ], 7);
  // Mike 10-14: a dog park folds into the playground package.
  assert.deepEqual(list.map(f => f.type), ['courtyard', 'playground', 'tennisCourt']);
  assert.equal(list.find(f => f.type === 'tennisCourt').count, 2);
  assert.equal(list.find(f => f.type === 'tennisCourt').sheet, 3);
  assert.equal(list.find(f => f.type === 'playground').sheet, 7);
  // courtyards are a count, never a length (Mike 10-14)
  assert.equal(list.find(f => f.type === 'courtyard').count, 1);
  assert.equal(list.find(f => f.type === 'courtyard').lengthFt, null);
});

test('priceSiteFeatures totals fixtures by kind', () => {
  const r = priceSiteFeatures([
    { type: 'dogPark', count: 1 },
    { type: 'tennisCourt', count: 1 },
    { type: 'playground', count: 1 },
    { type: 'turfPlay', count: 1, lengthFt: 100 },
  ], RATES);
  // dog park + playground = 2 playground packages (4 poles)
  assert.equal(r.areaLights, 4);
  assert.equal(r.pedestrianPoles, 6);
  assert.equal(r.product, 4 * 1400 + 2 * 3000 + 2 * 2000);
  assert.equal(r.items.length, 3);
});

test('master-pricing overrides win over the defaults', () => {
  const r = siteFeatureFixtures({ type: 'dogPark', count: 2 }, { ...RATES, areaLight: 1500, dogPark: { areaLights: 2 } });
  assert.equal(r.fixtures, 4);
  assert.equal(r.product, 6000);
});

test('flat rows ⇄ feature list round trip', () => {
  const rows = { dogParks: 1, courtyards: 2, playgrounds: 0, tennisCourts: 2, pickleballCourts: 0, turfPlayFt: 0 };
  const list = siteFeaturesFromRows(rows);
  assert.deepEqual(list.map(f => f.type), ['dogPark', 'courtyard', 'tennisCourt']);
  assert.equal(list.find(f => f.type === 'courtyard').count, 2);
  // the old dog park box comes back in the merged playground box
  assert.deepEqual(siteFeaturesToRows(list), { ...rows, dogParks: 0, playgrounds: 1 });
  assert.deepEqual(siteFeaturesToRows([{ type: 'pickleballCourt', count: 2 }, { type: 'tennisCourt', count: 1 }]).tennisCourts, 3);
  // Every key present even when the list is empty, 0 means "none".
  assert.deepEqual(Object.keys(siteFeaturesToRows([])).sort(), Object.values(SITE_FEATURE_ROW_KEYS).sort());
  assert.deepEqual(Object.keys(SITE_FEATURE_ROW_LABELS), Object.values(SITE_FEATURE_ROW_KEYS));
});

test('siteFeatureFromFlat: counts for count kinds, feet for linear kinds, 0 = none', () => {
  assert.deepEqual(siteFeatureFromFlat('dogParks', '2'), { type: 'dogPark', count: 2, lengthFt: null });
  assert.deepEqual(siteFeatureFromFlat('courtyards', '2'), { type: 'courtyard', count: 2, lengthFt: null });
  // the old feet box still reads: 60 ft = one courtyard (Mike 10-14)
  assert.deepEqual(siteFeatureFromFlat('courtyardFt', 75), { type: 'courtyard', count: 1, lengthFt: null });
  assert.deepEqual(siteFeatureFromFlat('courtyardFt', 0), { type: 'courtyard', count: 0, lengthFt: null });
  assert.equal(siteFeatureFromFlat('numUnits', 5), null);
  assert.equal(siteFeatureFromFlat('dogParks', -1), null);
  assert.equal(isSiteFeatureRowKey('turfPlayFt'), true);
  assert.equal(isSiteFeatureRowKey('numStalls'), false);
});

test('engineProjectData attaches live rows and skips archived ones', () => {
  const pd = engineProjectData({
    buildingType: 'garden',
    projectData: { numUnits: 10 },
    siteFeatures: [
      { type: 'dogPark', count: 1, archivedAt: null, sheet: 4, source: 'measured' },
      { type: 'tennisCourt', count: 1, archivedAt: new Date() },
    ],
  });
  assert.equal(pd.numUnits, 10);
  assert.equal(pd.buildingTypeKey, 'garden');
  assert.deepEqual(pd.siteFeatures.map(f => f.type), ['dogPark']); // folded at pricing
  assert.equal(pd.siteFeatures[0].sheet, 4);
  assert.deepEqual(engineProjectData({ projectData: null }).siteFeatures, []);
});

test('describeSiteFeatureChange reads like the activity log', () => {
  assert.equal(describeSiteFeatureChange('dogPark', null, { count: 1 }).text, 'Dog park: 0 → 1');
  assert.equal(describeSiteFeatureChange('courtyard', { count: 1 }, { count: 2 }).text, 'Courtyard: 1 → 2');
  assert.equal(describeSiteFeatureChange('turfPlay', { lengthFt: 60 }, { lengthFt: 90 }).text, 'Turf play area: 60 ft → 90 ft');
});

test('the budget engine prices site features on their own exterior line', () => {
  const base = { numUnits: 100, numStalls: 0 };
  const without = calculateBudget(base, {});
  const withFeat = calculateBudget({ ...base, siteFeatures: [
    { type: 'dogPark', count: 1 },
    { type: 'pickleballCourt', count: 2 },
    { type: 'courtyard', count: 1 },
  ] }, {});
  const line = withFeat.sections.exterior.siteFeatures;
  assert.equal(line.product, 3000 + 2 * 4 * 1400 + 2 * 2000);
  assert.equal(line.areaLights, 8);
  assert.equal(line.pedestrianPoles, 4);
  assert.equal(without.sections.exterior.siteFeatures.product, 0);
  // The line lands in the exterior section total, never inside area lighting.
  assert.equal(withFeat.sections.exterior.areaLighting?.product ?? withFeat.sections.exterior.parking?.product ?? 0,
               without.sections.exterior.areaLighting?.product ?? without.sections.exterior.parking?.product ?? 0);
  // The section total grows by the line (plus the 5% misc buffer on top of it).
  const grew = withFeat.sections.exterior.total.product - without.sections.exterior.total.product;
  assert.ok(grew >= line.product, `exterior total grew ${grew}, expected at least ${line.product}`);
});

// ── Words on the screens (Mike 2026-09-16: "If we find 1 dog park it should
// say that" / "a breakdown of these added costs too so it's transparent") ──

test('a found feature reads as plain words with its sheet', () => {
  assert.equal(describeSiteFeatureFinding({ type: 'dogPark', count: 1, sheet: 4 }), '1 dog park (sheet 4)');
  assert.equal(describeSiteFeatureFinding({ type: 'pickleballCourt', count: 2 }), '2 pickleball courts');
  assert.equal(describeSiteFeatureFinding({ type: 'courtyard', count: 1, sheet: 6 }), '1 courtyard (sheet 6)');
  assert.equal(describeSiteFeatureFinding({ type: 'courtyard', count: 2 }), '2 courtyards');
  assert.equal(describeSiteFeatureFinding({ type: 'turfPlay', count: 1 }), 'turf play area, length not measured');
  assert.equal(describeSiteFeatureFinding({ type: 'turfPlay', count: 2, lengthFt: 1200 }), '2 turf play areas, 1,200 ft long');
  assert.equal(describeSiteFeatureFinding({ type: 'pool', count: 1 }), null);
  assert.equal(describeSiteFeatureFinding({ type: 'dogPark', count: 0 }), null);
});

test('siteFeatureFindings lists every found feature in display order and skips junk', () => {
  assert.deepEqual(siteFeatureFindings([
    { type: 'tennisCourt', count: 1, sheet: 3 },
    { type: 'dogPark', count: 1 },
    { type: 'nope', count: 3 },
  ]), ['1 dog park / playground', '1 tennis / pickleball court (sheet 3)']);
  assert.deepEqual(siteFeatureFindings(undefined), []);
  assert.deepEqual(siteFeatureFindings([]), []);
});

test('each priced feature gets its own breakdown label and its own cost line', () => {
  const dog = siteFeatureFixtures({ type: 'dogPark', count: 1 }, RATES);
  assert.equal(siteFeatureLineLabel(dog), 'Dog park × 1, 1 area light');
  assert.equal(siteFeatureCostLine(dog), '1 area light × $1,400 = $1,400');

  const courts = siteFeatureFixtures({ type: 'pickleballCourt', count: 2 }, RATES);
  assert.equal(siteFeatureLineLabel(courts), 'Pickleball courts × 2, 8 area lights');
  assert.equal(siteFeatureCostLine(courts), '8 area lights × $1,400 = $11,200');

  const yard = siteFeatureFixtures({ type: 'courtyard', count: 1 }, RATES);
  assert.equal(siteFeatureLineLabel(yard), 'Courtyard × 1, 2 pedestrian poles');
  assert.equal(siteFeatureCostLine(yard), '2 pedestrian poles (12 ft) × $2,000 = $4,000');

  const bare = siteFeatureFixtures({ type: 'turfPlay', count: 1 }, RATES);
  assert.equal(siteFeatureLineLabel(bare), 'Turf play area, no length yet');
  assert.equal(siteFeatureCostLine(bare), '$0 until a length is entered.');

  // The per-feature lines add up to the one line the engine reports.
  const priced = priceSiteFeatures([{ type: 'dogPark', count: 1 }, { type: 'pickleballCourt', count: 2 }, { type: 'courtyard', count: 1 }], RATES);
  assert.equal(priced.items.reduce((s, i) => s + i.product, 0), priced.product);
  assert.equal(priced.product, 3000 + 11200 + 4000);
});

test('the words file carries no prices and the public screens import only it', () => {
  const src = p => fs.readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
  const words = src('src/lib/siteFeatureWords.js');
  assert.ok(!/\b(1400|2000|areaLight:|pedestrianPole:|PRICING)\b/.test(words), 'siteFeatureWords.js carries a price');
  assert.ok(!/^import /m.test(words), 'siteFeatureWords.js imports something');
  // Everything a public visitor's browser loads must name features through
  // the words file, never through siteFeatures.js, which holds the dollar
  // defaults (Mike 2026-09-15: the pricing model must not ship to a public
  // visitor's browser).
  for (const p of [
    'src/app/conceptual_budget/IntakeClient.jsx',
    'src/components/intake/DrawingDropzone.jsx',
    'src/lib/mergeProposals.js',
    'src/lib/intake/combineReads.js',
    'src/lib/intake/combineResult.js',
    'src/lib/intake/stagedParse.js',
    'src/app/(app)/project/[id]/summary/SummaryBudgetBreakdown.jsx',
  ]) {
    assert.ok(!/from '[^']*\/siteFeatures(\.js)?'/.test(src(p)), `${p} imports siteFeatures.js`);
  }
});

test('all six kinds have a row key, a label and a rule', () => {
  for (const t of SITE_FEATURE_TYPES) {
    assert.ok(SITE_FEATURE_ROW_KEYS[t], t);
    assert.ok(SITE_FEATURE_ROW_LABELS[SITE_FEATURE_ROW_KEYS[t]], t);
    assert.ok(siteFeatureFixtures({ type: t, count: 1, lengthFt: 10 }, RATES), t);
  }
});

test('courtyards are a count; a measured length is ignored and old assumed feet convert (Mike 10-14)', () => {
  const [a] = normalizeSiteFeatures([{ type: 'courtyard', count: 3 }], 4);
  assert.equal(a.count, 3);
  assert.equal(a.lengthFt, null);
  assert.ok(!('lengthAssumed' in a));
  const [b] = normalizeSiteFeatures([{ type: 'courtyard', count: 2, lengthFt: 90 }], 4);
  assert.equal(b.count, 2);
  assert.equal(b.lengthFt, null);
  // a row saved before 10-14 at "60 ft each, assumed" reads back as its count
  const [c] = normalizeSiteFeatures([{ type: 'courtyard', count: 1, lengthFt: 180, lengthAssumed: true }], 4);
  assert.equal(c.count, 3);
  assert.equal(courtyardsFromFt(0), 0);
  assert.equal(courtyardsFromFt(45), 1);
  assert.equal(courtyardsFromFt(120), 2);
  assert.equal(COURTYARD_FT_EACH, 60);
});
