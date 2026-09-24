/**
 * Unit Selections — the facts, the filters and the reconcile.
 *
 * Three things here would cost real money if they broke quietly, and none of
 * them would show up as an error on screen:
 *
 *   1. The budget cut. Every option is measured against a per-FIXTURE target,
 *      but the master price sheet quotes several of these per UNIT — three
 *      small pendants is $300 for the set, not $300 each. Divide in the wrong
 *      place and the survey either shows a developer $300 pendants on a $100
 *      job, or hides everything they can actually afford.
 *   2. The $0 vanity. A low-finish bath bar is priced at 0 on the sheet because
 *      it is already inside the base $/SF. Read that as the target and every
 *      vanity in the pool is "over budget" and the category comes up empty.
 *   3. The 6'-8" rule. A deep sconce beside a unit door mounted low sticks into
 *      the corridor. That is a code problem, not a taste problem, and the only
 *      place it is caught is here.
 *
 * Run: node --test scripts/tests/unitSelections.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CATEGORIES, CATEGORY_KEYS,
  deriveFacts, eligibleOptions, deriveFinish, fanFinish, reconcileCategory,
} from '../../src/lib/unitSelections/engine.js';
import { PRICING } from '../../src/lib/pricing.js';

/** A decorative option, with only the fields the filters actually read. */
function opt(over = {}) {
  return {
    id: over.id || 'o1',
    category: 'w1',
    name: 'Test fixture',
    shape: '',
    sortOrder: 0,
    isActive: true,
    wetRated: false,
    dampRated: false,
    projectionIn: null,
    bladeSpanIn: null,
    finishes: [{ finishKey: 'matte_black', cnPrice: 100, isActive: true }],
    ...over,
  };
}

// ── the catalogue ───────────────────────────────────────────────────────────

test('five categories, in survey order, with their fixture type codes', () => {
  assert.deepEqual(CATEGORY_KEYS, ['p1', 'v1', 'ew1', 'w1', 'f1']);
  assert.deepEqual(CATEGORIES.map(c => c.typeCode), ['P1', 'V1', 'EW1', 'W1', 'F1']);

  // Every category has to name a real questionnaire field, or its answers never
  // reach the survey and the whole thing silently falls back to house defaults.
  for (const c of CATEGORIES) {
    assert.ok(['units', 'corridors'].includes(c.section), `${c.key} section`);
    assert.ok(c.answerKey && c.priceKey && c.family, `${c.key} wiring`);
  }
});

// ── targets ─────────────────────────────────────────────────────────────────

test('a per-unit sheet price is divided into a per-fixture target', () => {
  // The sheet says three small pendants (medium) is $300. That is $100 each.
  const facts = deriveFacts({ answers: { units: { kitchenPendants: 'threeSmallMedium' } } });
  assert.equal(PRICING.kitchenPendants.threeSmallMedium.product, 300);
  assert.equal(facts.counts.p1, 3);
  assert.equal(facts.targets.p1, 100);

  // One large pendant is one fixture, so it is not divided at all.
  const one = deriveFacts({ answers: { units: { kitchenPendants: 'oneLarge' } } });
  assert.equal(one.counts.p1, 1);
  assert.equal(one.targets.p1, PRICING.kitchenPendants.oneLarge.product);
});

test('the low-finish bath bar uses the credit, not its $0 sheet price', () => {
  assert.equal(PRICING.vanity.bathBarLow.product, 0, 'sheet price really is zero');
  const facts = deriveFacts({ answers: { units: { vanity: 'bathBarLow' } } });
  assert.equal(facts.targets.v1, PRICING.vanityBathBarCredit);
  assert.ok(facts.targets.v1 > 0, 'a zero target would hide every vanity there is');
});

test('the fan target always comes off the master sheet', () => {
  const facts = deriveFacts({ answers: { units: { fans: 'masterAndLiving' } } });
  assert.equal(facts.targets.f1, PRICING.fans.conceptualPerFan);

  // And it follows a project's own sheet, not the static one.
  const custom = deriveFacts({
    answers: { units: { fans: 'masterAndLiving' } },
    pricing: { ...PRICING, fans: { ...PRICING.fans, conceptualPerFan: 210 } },
  });
  assert.equal(custom.targets.f1, 210);
});

test('the price typed on the design questionnaire beats the sheet', () => {
  const facts = deriveFacts({
    answers: { units: { kitchenPendants: 'threeSmallMedium', kitchenPendantsPrice: '450' } },
  });
  // $450 for the set of three.
  assert.equal(facts.targets.p1, 150);
  assert.match(facts.source.p1, /typed on the design questionnaire/);
});

test('a typed price with a comma in it is still a number', () => {
  const facts = deriveFacts({
    answers: { units: { vanity: 'bathBarHigh', vanityPrice: '1,200' } },
  });
  assert.equal(facts.targets.v1, 1200);
});

test('a blank price box falls through to the sheet rather than zeroing the target', () => {
  const facts = deriveFacts({
    answers: { corridors: { unitSconce: 'medium', unitSconcePrice: '' } },
  });
  assert.equal(facts.targets.w1, PRICING.corridorSconce.medium.product);
  assert.match(facts.source.w1, /answer on the design questionnaire/);
});

test('a survey override beats everything, and client standards catch what nothing else does', () => {
  const overridden = deriveFacts({
    answers: { units: { balcony: 'sconcelow', balconyPrice: '80' } },
    overrides: { targets: { ew1: 500 } },
  });
  assert.equal(overridden.targets.ew1, 500);
  assert.match(overridden.source.ew1, /typed on this survey/);

  // Client standards only apply where the sheet has nothing to say. A high bath
  // bar has a sheet price, so the client target must NOT win there.
  const withStandards = deriveFacts({
    answers: { units: { vanity: 'bathBarHigh' } },
    clientTargets: { V1: 999 },
  });
  assert.equal(withStandards.targets.v1, PRICING.vanity.bathBarHigh.product);
});

test('an unanswered category uses the house default, including "none"', () => {
  const facts = deriveFacts({ answers: {} });
  // Pendants, balconies and fans all default to None, so they are not in the survey.
  assert.deepEqual(facts.skipped.sort(), ['ew1', 'f1', 'p1']);
  assert.equal(facts.targets.p1, null);
  assert.match(facts.source.p1, /not wanted on this job/);
  // The vanity and the entry sconce default to something real.
  assert.equal(facts.levels.v1, 'low');
  assert.equal(facts.levels.w1, 'low');
});

test('the tier is a summary of the five answers, and a tie breaks high', () => {
  const value = deriveFacts({
    answers: { units: { vanity: 'bathBarLow', balcony: 'sconcelow' }, corridors: { unitSconce: 'low' } },
  });
  assert.equal(value.tier, 'value');

  // Two low, two high — the job with High fixtures in it is not a value job.
  const tie = deriveFacts({
    answers: {
      units: { vanity: 'bathBarHigh', balcony: 'sconceHigh', kitchenPendants: 'threeSmallLow' },
      corridors: { unitSconce: 'low' },
    },
  });
  assert.equal(tie.tier, 'elevated');
});

test('island length is read off the pendant answer', () => {
  const short = deriveFacts({ answers: { units: { kitchenPendants: 'oneLarge' } } });
  assert.equal(short.islandLength, 'short');
  const long = deriveFacts({ answers: { units: { kitchenPendants: 'oneLinear' } } });
  assert.equal(long.islandLength, 'long');
  const mid = deriveFacts({ answers: { units: { kitchenPendants: 'twoMediumMedium' } } });
  assert.equal(mid.islandLength, 'mid');
});

test('nobody has been asked the mounting height yet', () => {
  // It is not in the app anywhere. Until the survey asks, it is null — and null
  // must NOT behave like "mounted low", or half the pool vanishes for no reason.
  const facts = deriveFacts({ answers: { corridors: { unitSconce: 'high' } } });
  assert.equal(facts.entryMountHigh, null);

  const deep = opt({ projectionIn: 6 });
  const { eligible } = eligibleOptions('w1', { ...facts, targets: { w1: 500 } }, [deep]);
  assert.equal(eligible.length, 1, 'an unanswered height hides nothing');
});

// ── the filters ─────────────────────────────────────────────────────────────

test('the 6’-8” rule drops deep sconces, and only when the answer is no', () => {
  const facts = { targets: { w1: 500 }, entryMountHigh: false };
  const deep = opt({ id: 'deep', name: 'Deep', projectionIn: 6 });
  const shallow = opt({ id: 'shallow', name: 'Shallow', projectionIn: 3.5 });
  // Exactly 4in is allowed. The rule is 'more than', and a fixture that sits
  // right on the line is the one an argument gets had about.
  const exactly4 = opt({ id: 'four', name: 'Four', projectionIn: 4 });

  const low = eligibleOptions('w1', facts, [deep, shallow, exactly4]);
  assert.deepEqual(low.eligible.map(o => o.id).sort(), ['four', 'shallow']);
  assert.equal(low.hidden.length, 1);
  assert.match(low.hidden[0].reason, /4in/);

  // Mounted high, the deep one is fine.
  const high = eligibleOptions('w1', { ...facts, entryMountHigh: true }, [deep, shallow, exactly4]);
  assert.equal(high.eligible.length, 3);
});

test('nothing over the target is ever returned as eligible', () => {
  const facts = { targets: { w1: 125 } };
  const cheap = opt({ id: 'cheap', finishes: [{ cnPrice: 90, isActive: true }] });
  const dear  = opt({ id: 'dear',  finishes: [{ cnPrice: 400, isActive: true }] });
  // One finish inside the target is enough — you buy the fixture in that finish.
  const mixed = opt({ id: 'mixed', finishes: [
    { cnPrice: 400, isActive: true },
    { cnPrice: 120, isActive: true },
  ] });

  const { eligible, hidden } = eligibleOptions('w1', facts, [cheap, dear, mixed]);
  assert.deepEqual(eligible.map(o => o.id).sort(), ['cheap', 'mixed']);
  assert.equal(hidden.length, 1);
  assert.equal(hidden[0].option.id, 'dear');
  assert.match(hidden[0].reason, /over the \$125 target/);
});

test('a retired finish does not keep an unaffordable fixture alive', () => {
  const facts = { targets: { w1: 125 } };
  const stale = opt({ id: 'stale', finishes: [
    { cnPrice: 400, isActive: true },
    { cnPrice: 100, isActive: false },  // no longer offered
  ] });
  assert.equal(eligibleOptions('w1', facts, [stale]).eligible.length, 0);
});

test('no target on record means nothing is cut for price', () => {
  const facts = { targets: { w1: null } };
  const dear = opt({ finishes: [{ cnPrice: 4000, isActive: true }] });
  assert.equal(eligibleOptions('w1', facts, [dear]).eligible.length, 1);
});

test('a balcony fixture must be wet rated and a vanity at least damp rated', () => {
  const facts = { targets: { ew1: 500, v1: 500 } };
  const dry  = opt({ id: 'dry',  category: 'ew1' });
  const wet  = opt({ id: 'wet',  category: 'ew1', wetRated: true });
  assert.deepEqual(eligibleOptions('ew1', facts, [dry, wet]).eligible.map(o => o.id), ['wet']);
  assert.match(eligibleOptions('ew1', facts, [dry]).hidden[0].reason, /wet/);

  const damp    = opt({ id: 'damp',    category: 'v1', dampRated: true });
  const wetOnly = opt({ id: 'wetOnly', category: 'v1', wetRated: true });
  const neither = opt({ id: 'neither', category: 'v1' });
  const res = eligibleOptions('v1', facts, [damp, wetOnly, neither]);
  // Wet is a higher rating than damp — a wet fixture belongs in a bathroom.
  assert.deepEqual(res.eligible.map(o => o.id).sort(), ['damp', 'wetOnly']);
});

test('a linear pendant is not offered over a short island', () => {
  const facts = { targets: { p1: 500 }, islandLength: 'short' };
  const linear = opt({ id: 'linear', category: 'p1', shape: 'linear' });
  const round  = opt({ id: 'round',  category: 'p1', shape: 'round' });
  const res = eligibleOptions('p1', facts, [linear, round]);
  assert.deepEqual(res.eligible.map(o => o.id), ['round']);
  assert.match(res.hidden[0].reason, /short island/);

  // On a long island it is fine.
  const long = eligibleOptions('p1', { ...facts, islandLength: 'long' }, [linear, round]);
  assert.equal(long.eligible.length, 2);
});

test('the reason given is the most fundamental one, not whichever ran last', () => {
  // Too deep AND too expensive. A person needs to hear the code problem.
  const facts = { targets: { w1: 50 }, entryMountHigh: false };
  const bad = opt({ projectionIn: 9, finishes: [{ cnPrice: 900, isActive: true }] });
  assert.match(eligibleOptions('w1', facts, [bad]).hidden[0].reason, /4in/);
});

test('options come back in the order they were put in the pool', () => {
  const facts = { targets: { w1: null } };
  const a = opt({ id: 'a', name: 'Zebra', sortOrder: 1 });
  const b = opt({ id: 'b', name: 'Apple', sortOrder: 0 });
  const c = opt({ id: 'c', name: 'Aardvark', sortOrder: 0 });
  const { eligible } = eligibleOptions('w1', facts, [a, b, c]);
  assert.deepEqual(eligible.map(o => o.id), ['c', 'b', 'a']);
});

// ── finishes ────────────────────────────────────────────────────────────────

test('one person’s finish is the one they chose most, and fans do not vote', () => {
  const response = {
    fanHoldWhite: true,
    choices: [
      { category: 'p1',  kind: 'PICK', finishKey: 'aged_brass' },
      { category: 'v1',  kind: 'PICK', finishKey: 'aged_brass' },
      { category: 'w1',  kind: 'PICK', finishKey: 'matte_black' },
      // Three white fans must not make this a white job.
      { category: 'f1',  kind: 'PICK', finishKey: 'white' },
      { category: 'f1',  kind: 'PICK', finishKey: 'white' },
      { category: 'f1',  kind: 'PICK', finishKey: 'white' },
    ],
  };
  assert.equal(deriveFinish(response), 'aged_brass');
  assert.equal(fanFinish(response, 'aged_brass'), 'white', 'fans stay white by default');
  assert.equal(fanFinish({ ...response, fanHoldWhite: false }, 'aged_brass'), 'aged_brass');
});

test('a tie on finish breaks to the kitchen', () => {
  const response = { choices: [
    { category: 'p1', kind: 'PICK', finishKey: 'bronze' },
    { category: 'w1', kind: 'PICK', finishKey: 'chrome' },
  ] };
  assert.equal(deriveFinish(response), 'bronze');
});

test('a typed finish override wins outright', () => {
  const response = { finishOverride: 'chrome', choices: [
    { category: 'p1', kind: 'PICK', finishKey: 'bronze' },
    { category: 'v1', kind: 'PICK', finishKey: 'bronze' },
  ] };
  assert.equal(deriveFinish(response), 'chrome');
});

// ── reconcile ───────────────────────────────────────────────────────────────

test('three people who agree produce one unanimous row', () => {
  const responses = ['Dev', 'Arch', 'ID'].map(name => ({
    respondentName: name, respondentRole: 'DEVELOPER',
    choices: [{ category: 'p1', optionId: 'x', kind: 'PICK', finishKey: 'bronze' }],
  }));
  const result = reconcileCategory('p1', responses);
  assert.equal(result.agreement, 'UNANIMOUS');
  assert.equal(result.optionId, 'x');
  assert.equal(result.finishKey, 'bronze');
  assert.deepEqual(result.divergence, []);
});

test('three people who disagree are recorded as disagreeing, not averaged', () => {
  const responses = [
    { respondentName: 'Dev',  respondentRole: 'DEVELOPER',
      choices: [{ category: 'p1', optionId: 'x', kind: 'PICK', finishKey: 'bronze' }] },
    { respondentName: 'Arch', respondentRole: 'ARCHITECT',
      choices: [{ category: 'p1', optionId: 'x', kind: 'PICK', finishKey: 'bronze' }] },
    { respondentName: 'ID',   respondentRole: 'INTERIOR_DESIGNER',
      choices: [{ category: 'p1', optionId: 'y', kind: 'PICK', finishKey: 'chrome' }] },
  ];
  const result = reconcileCategory('p1', responses);
  assert.equal(result.agreement, 'DIVERGENT');
  assert.equal(result.optionId, 'x', 'the most-picked option leads, but nothing is settled');
  assert.equal(result.divergence.length, 1);
  assert.equal(result.divergence[0].respondentName, 'ID');
  assert.equal(result.resolvedById, undefined, 'a person still has to resolve it');
});

test('an explicit rejection of the leading option is divergence too', () => {
  const responses = [
    { respondentName: 'Dev', respondentRole: 'DEVELOPER',
      choices: [{ category: 'v1', optionId: 'x', kind: 'PICK' }] },
    { respondentName: 'ID', respondentRole: 'INTERIOR_DESIGNER',
      choices: [{ category: 'v1', optionId: 'x', kind: 'REJECT' }] },
  ];
  const result = reconcileCategory('v1', responses);
  assert.equal(result.agreement, 'DIVERGENT');
  assert.equal(result.divergence.length, 1);
  assert.equal(result.divergence[0].kind, 'REJECT');
});

test('one respondent is SINGLE, and nobody at all is nothing', () => {
  const alone = reconcileCategory('w1', [{
    respondentName: 'Dev', respondentRole: 'DEVELOPER',
    choices: [{ category: 'w1', optionId: 'x', kind: 'PICK' }],
  }]);
  assert.equal(alone.agreement, 'SINGLE');
  assert.equal(reconcileCategory('w1', []), null);
  assert.equal(reconcileCategory('w1', [{ respondentName: 'Dev', choices: [] }]), null);
});

test('a skipped fixture added on the survey comes back at a medium finish', () => {
  const facts = deriveFacts({ answers: {}, overrides: { include: ['p1', 'f1'] } });
  assert.deepEqual(facts.skipped, ['ew1']);
  assert.equal(facts.levels.p1, 'medium');
  assert.ok(facts.targets.p1 > 0, 'an added pendant needs a real target');
  assert.ok(facts.targets.f1 > 0);
  assert.match(facts.source.p1, /added on this survey/);
  // Including something the job already has changes nothing.
  const plain = deriveFacts({ answers: {} });
  const same = deriveFacts({ answers: {}, overrides: { include: ['v1'] } });
  assert.deepEqual(same.targets.v1, plain.targets.v1);
});
