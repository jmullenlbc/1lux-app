/**
 * Per-project manual price overrides.
 *
 * Five questionnaire answers can carry a typed-in unit price that replaces the
 * master price sheet for that one project: kitchen island pendants, ceiling
 * fans, vanities, balcony sconces, and corridor unit-entry sconces.
 *
 * The rules worth protecting, in plain terms:
 *   1. A typed number is used EXACTLY as typed. No hidden credit is applied on
 *      top of it. Master pricing carries two of those credits ($45 off a vanity,
 *      $35 off a fan); a person typing "$200 per vanity" means $200.
 *   2. An override on a question answered "None" changes nothing. Otherwise a
 *      stale number left in a box would quietly charge for something the project
 *      said no to.
 *   3. The string 'auto' means "no override". The form writes 'auto' rather than
 *      an empty string when someone clears the box, because the responses store
 *      refuses to overwrite a real answer with a blank one, a cleared field
 *      sending '' would be skipped and the old override would never go away.
 *   4. Anything that is not a sane non-negative number falls back to master
 *      pricing rather than pricing the line at zero or NaN.
 *
 * Run: node --test scripts/tests/priceOverride.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateBudget, priceOverride } from '../../src/lib/calculations.js';
import { PRICING } from '../../src/lib/pricing.js';

// A deliberately plain project: 100 units, 100 vanities, 100 balconies, no SF.
// Zero square footage keeps every rate-per-SF line at $0 so the per-unit lines
// under test are the only thing moving.
const PD = { numUnits: 100, numVanities: 100, numBalconies: 100 };

const budget = (responses) => calculateBudget(PD, responses);
const units  = (responses) => budget(responses).sections.units;
const corr   = (responses) => budget(responses).sections.corridors;

// ── the parser ───────────────────────────────────────────────────────────────

test('a plain number is an override', () => {
  assert.equal(priceOverride('200'), 200);
  assert.equal(priceOverride(200), 200);
  assert.equal(priceOverride(' 200 '), 200);
  assert.equal(priceOverride('199.5'), 199.5);
  assert.equal(priceOverride('0'), 0);
});

test('blank, missing and the cleared sentinel all mean "use master pricing"', () => {
  assert.equal(priceOverride(''), null);
  assert.equal(priceOverride('   '), null);
  assert.equal(priceOverride(null), null);
  assert.equal(priceOverride(undefined), null);
  assert.equal(priceOverride('auto'), null);
  assert.equal(priceOverride('AUTO'), null);
  assert.equal(priceOverride(' Auto '), null);
});

test('garbage and negatives fall back to master pricing, never to NaN', () => {
  for (const bad of ['abc', '$200', '12abc', '-50', 'Infinity', '-Infinity', {}, []]) {
    assert.equal(priceOverride(bad), null, `expected no override for ${JSON.stringify(bad)}`);
  }
});

// ── kitchen island pendants ──────────────────────────────────────────────────

test('pendant override replaces the master rate', () => {
  const master = units({ units: { kitchenPendants: 'oneLarge' } }).pendants.product;
  assert.equal(master, PRICING.kitchenPendants.oneLarge.product * 100);

  const over = units({ units: { kitchenPendants: 'oneLarge', kitchenPendantsPrice: '400' } }).pendants.product;
  assert.equal(over, 400 * 100);
});

test('pendant override is inert when the answer is None', () => {
  const over = units({ units: { kitchenPendants: 'none', kitchenPendantsPrice: '400' } }).pendants.product;
  assert.equal(over, 0);
});

test("pendant override cleared with 'auto' returns to master pricing", () => {
  const over = units({ units: { kitchenPendants: 'oneLarge', kitchenPendantsPrice: 'auto' } }).pendants.product;
  assert.equal(over, PRICING.kitchenPendants.oneLarge.product * 100);
});

// ── ceiling fans ─────────────────────────────────────────────────────────────

test('fan override is the net adder per fan: the disk credit is NOT taken off it', () => {
  const base = budget({ units: { fans: 'masterOnly', fanLevel: 'medium' } });
  const fanCount = base.fanCount;
  assert.ok(fanCount > 0, 'expected fans on this project');

  const over = budget({ units: { fans: 'masterOnly', fanLevel: 'medium', fansPrice: '250' } });
  assert.equal(over.sections.units.fans.product, fanCount * 250);

  // Master pricing at the same level goes through the $35 disk credit, so the
  // two numbers must differ, otherwise this test would pass by coincidence.
  assert.notEqual(base.sections.units.fans.product, over.sections.units.fans.product);
});

test('fan override is inert when no fans are selected', () => {
  const over = units({ units: { fans: 'none', fansPrice: '250' } }).fans.product;
  assert.equal(over, 0);
});

// ── vanities ─────────────────────────────────────────────────────────────────

test('vanity override is the net adder: the $45 bath-bar credit is NOT taken off it', () => {
  const gross  = PRICING.vanity.illuminatedMirrorHigh.product;
  const credit = PRICING.vanityBathBarCredit;

  const master = units({ units: { vanity: 'illuminatedMirrorHigh' } }).vanity.product;
  assert.equal(master, (gross - credit) * 100);

  const over = units({ units: { vanity: 'illuminatedMirrorHigh', vanityPrice: '300' } }).vanity.product;
  assert.equal(over, 300 * 100, 'what you type is what you get, no credit subtracted');
});

test('vanity override is inert on the base bath-bar answer (no upgrade selected)', () => {
  const over = units({ units: { vanity: 'bathBarLow', vanityPrice: '300' } }).vanity.product;
  assert.equal(over, 0);
});

// ── balconies ────────────────────────────────────────────────────────────────

test('balcony override replaces the master rate', () => {
  const master = units({ units: { balcony: 'sconceMedium' } }).balcony.product;
  assert.equal(master, PRICING.balcony.sconceMedium.product * 100);

  const over = units({ units: { balcony: 'sconceMedium', balconyPrice: '90' } }).balcony.product;
  assert.equal(over, 90 * 100);
});

test('balcony override is inert when the answer is None', () => {
  assert.equal(units({ units: { balcony: 'none', balconyPrice: '90' } }).balcony.product, 0);
});

// ── corridor unit-entry sconces ──────────────────────────────────────────────

test('corridor sconce override replaces the master rate', () => {
  const master = corr({ corridors: { unitSconce: 'medium' } }).sconces.product;
  assert.equal(master, PRICING.corridorSconce.medium.product * 100);

  const over = corr({ corridors: { unitSconce: 'medium', unitSconcePrice: '175' } }).sconces.product;
  assert.equal(over, 175 * 100);
});

test('corridor sconce override is inert when the answer is None', () => {
  assert.equal(corr({ corridors: { unitSconce: 'none', unitSconcePrice: '175' } }).sconces.product, 0);
});

// ── an override of zero is a real answer, not a missing one ──────────────────

test('typing 0 prices the line at zero rather than falling back to master', () => {
  const over = units({ units: { kitchenPendants: 'oneLarge', kitchenPendantsPrice: '0' } }).pendants.product;
  assert.equal(over, 0);
  assert.ok(PRICING.kitchenPendants.oneLarge.product > 0, 'master rate is non-zero, so this is a real change');
});

// ── nothing else moves ───────────────────────────────────────────────────────

test('an override changes only its own line', () => {
  const answers = {
    units:     { kitchenPendants: 'oneLarge', vanity: 'bathBarHigh', balcony: 'sconceMedium', fans: 'masterOnly', fanLevel: 'medium' },
    corridors: { unitSconce: 'medium' },
  };
  const before = budget(answers);
  const after  = budget({
    ...answers,
    units: { ...answers.units, vanityPrice: '999' },
  });

  assert.notEqual(before.sections.units.vanity.product, after.sections.units.vanity.product);
  assert.equal(before.sections.units.pendants.product,  after.sections.units.pendants.product);
  assert.equal(before.sections.units.fans.product,      after.sections.units.fans.product);
  assert.equal(before.sections.units.balcony.product,   after.sections.units.balcony.product);
  assert.equal(before.sections.corridors.sconces.product, after.sections.corridors.sconces.product);
});
