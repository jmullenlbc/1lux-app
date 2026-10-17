/**
 * The public conceptual-budget questionnaire and its review flags.
 *
 * validateAnswers() is the boundary between a public, unauthenticated form and
 * our database, every clamping behavior here is a security property, not a
 * convenience. computeReviewFlags() feeds both the notification email and the
 * admin review panel; its contract is "plain-English sentences, never a crash,
 * whatever the payload looks like."
 *
 * Run: node --test scripts/tests/questionnaire.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { INTAKE_QUESTIONS, validateAnswers, answersToEngine } from '../../src/lib/intake/questionnaire.js';
import { computeReviewFlags } from '../../src/lib/intake/reviewFlags.js';

// ── questionnaire shape ──────────────────────────────────────────────────────

test('every question has a key, section, question text, and at least 2 options', () => {
  assert.ok(INTAKE_QUESTIONS.length >= 12, `expected 12+ questions, got ${INTAKE_QUESTIONS.length}`);
  for (const q of INTAKE_QUESTIONS) {
    assert.ok(q.key && typeof q.key === 'string', 'missing key');
    assert.ok(q.section, `${q.key}: missing section`);
    assert.ok(q.question, `${q.key}: missing question text`);
    assert.ok(Array.isArray(q.options) && q.options.length >= 2, `${q.key}: needs 2+ options`);
    if (q.default != null) {
      assert.ok(q.options.includes(q.default), `${q.key}: default "${q.default}" is not one of its options`);
    }
  }
});

test('question keys are unique', () => {
  const keys = INTAKE_QUESTIONS.map(q => q.key);
  assert.equal(new Set(keys).size, keys.length);
});

// ── validateAnswers ──────────────────────────────────────────────────────────

test('valid answers pass through with section and question text attached', () => {
  const rows = validateAnswers({ ceilingFans: 'Master bed + Secondary bed', energyCredit: 'LEED' });
  const fans = rows.find(r => r.questionKey === 'ceilingFans');
  assert.equal(fans.answer, 'Master bed + Secondary bed');
  assert.equal(fans.section, 'Residential units');
  assert.ok(fans.question.length > 0);
  assert.equal(rows.find(r => r.questionKey === 'energyCredit').answer, 'LEED');
});

test('unanswered questions fall back to their default so the reviewer sees a full set', () => {
  const rows = validateAnswers({});
  const withDefaults = INTAKE_QUESTIONS.filter(q => q.default != null).length;
  assert.equal(rows.length, withDefaults);
  assert.equal(rows.find(r => r.questionKey === 'vanityLighting').answer, 'Mirror and bath bar (Low finish)');
});

test('free text on an option question is rejected and clamped to the default', () => {
  const rows = validateAnswers({ ceilingFans: '<script>alert(1)</script>' });
  assert.equal(rows.find(r => r.questionKey === 'ceilingFans').answer, 'None');
});

test('unknown keys are dropped entirely', () => {
  const rows = validateAnswers({ notAQuestion: 'whatever', __proto__: 'x' });
  assert.ok(rows.every(r => INTAKE_QUESTIONS.some(q => q.key === r.questionKey)));
});

test('projectType with no answer and no default produces no row', () => {
  const rows = validateAnswers({});
  assert.equal(rows.find(r => r.questionKey === 'projectType'), undefined);
});

test('projectType with a valid answer produces a row', () => {
  const rows = validateAnswers({ projectType: 'Podium (3-8 Levels)' });
  assert.equal(rows.find(r => r.questionKey === 'projectType').answer, 'Podium (3-8 Levels)');
});

test('non-object and garbage input behaves like an empty submission', () => {
  for (const bad of [null, undefined, 'text', 42, [], { ceilingFans: 12 }]) {
    const rows = validateAnswers(bad);
    assert.ok(Array.isArray(rows) && rows.length > 0, `input ${JSON.stringify(bad)} should fall back to defaults`);
  }
});

// ── answersToEngine ───────────────────────────────────────────────────────────

test('verbatim answers map onto the exact engine enums the internal wizard saves', () => {
  const { sections, buildingTypeKey } = answersToEngine({
    undercabinet: 'Low voltage',
    islandPendants: '3 small pendants (Medium finish)',
    ceilingFans: 'Master bed/Secondary bed/Tertiary bed + Living room',
    vanityLighting: 'Illuminated mirror (High finish)',
    balconyLighting: 'Exterior balcony sconce (Medium finish)',
    egressLighting: 'Frogeyes everywhere',
    interiorAmenityFinish: '12',
    unitEntrySconce: '1 sconce (High finish)',
    exteriorAmenityFinish: '3',
    amenityHours: '24hrs or after dark',
    projectType: 'Gurban (4-5 Levels)',
    energyCredit: 'LEED',
  });
  assert.equal(buildingTypeKey, 'gurban');
  assert.equal(sections.units.undercabinet, 'lowVoltage');
  assert.equal(sections.units.kitchenPendants, 'threeSmallMedium');
  assert.equal(sections.units.fans, 'masterSecondaryTertiaryLiving');
  assert.equal(sections.units.vanity, 'illuminatedMirrorHigh');
  assert.equal(sections.units.balcony, 'sconceMedium');
  assert.equal(sections.emergency.strategy, 'frogeyes');
  assert.equal(sections.amenities.interiorLevel, '12');
  assert.equal(sections.corridors.unitSconce, 'high');
  assert.equal(sections.exterior.amenityLevel, '3');
  assert.equal(sections.exterior.amenityHours, 'afterSunset');
  assert.equal(sections.controls.energyCreditProgram, 'leed');
  assert.equal(sections.controls.energyCredit, 'yes');
});

test('the finish-word options map, and the old bare-finish strings still map (stored submissions)', () => {
  const { sections } = answersToEngine({
    islandPendants: '3 small pendants (Medium)',       // pre-2026-09 stored string
    vanityLighting: 'Mirror and bath bar (High)',
    balconyLighting: 'Exterior balcony sconce (Low)',
    unitEntrySconce: '1 sconce (Medium)',
  });
  assert.equal(sections.units.kitchenPendants, 'threeSmallMedium');
  assert.equal(sections.units.vanity, 'bathBarHigh');
  assert.equal(sections.units.balcony, 'sconcelow');
  assert.equal(sections.corridors.unitSconce, 'medium');
});

test('Dusk to Dawn keeps its own engine value; an old saved "Other" still reads', () => {
  const { sections } = answersToEngine({ amenityHours: 'Dusk to Dawn' });
  assert.equal(sections.exterior.amenityHours, 'duskToDawn');
  const other = answersToEngine({ amenityHours: 'Other' });
  assert.equal(other.sections.exterior.amenityHours, 'beforeDusk');
});

// Mike 2026-09-11: drop "Other", say "external amenities", and no year after IECC.
test('amenity hours offers only the two real choices and names external amenities', () => {
  const q = INTAKE_QUESTIONS.find(x => x.key === 'amenityHours');
  assert.deepEqual(q.options, ['24hrs or after dark', 'Dusk to Dawn']);
  assert.equal(q.default, 'Dusk to Dawn');
  assert.match(q.question, /external amenities/);
});

test('project type hint says IECC with no year', () => {
  const q = INTAKE_QUESTIONS.find(x => x.key === 'projectType');
  assert.match(q.hint, /\(IECC\)/);
  assert.doesNotMatch(q.hint, /2021/);
});

test('energy credit None means program none and engine credit no', () => {
  const { sections } = answersToEngine({ energyCredit: 'None' });
  assert.equal(sections.controls.energyCreditProgram, 'none');
  assert.equal(sections.controls.energyCredit, 'no');
});

test('NGBS/WELL/Other still flip the 3% credit on without being LEED', () => {
  for (const program of ['NGBS', 'WELL', 'Other']) {
    const { sections } = answersToEngine({ energyCredit: program });
    assert.equal(sections.controls.energyCreditProgram, program.toLowerCase());
    assert.equal(sections.controls.energyCredit, 'yes');
  }
});

test('garbage answers clamp to defaults and never leak free text into sections', () => {
  const { sections, buildingTypeKey } = answersToEngine({
    ceilingFans: '<script>x</script>', projectType: 'Castle', energyCredit: 'yes please',
  });
  assert.equal(sections.units.fans, 'none');           // clamped to the default
  assert.equal(buildingTypeKey, null);                 // no default for project type
  assert.equal(sections.controls.energyCreditProgram, 'none');
  const flat = JSON.stringify(sections);
  assert.ok(!flat.includes('script') && !flat.includes('Castle'));
});

test('answersToEngine accepts stored rows as well as a plain map', () => {
  const { sections } = answersToEngine([
    { questionKey: 'undercabinet', answer: '120v' },
    { questionKey: 'energyCredit', answer: 'WELL' },
  ]);
  assert.equal(sections.units.undercabinet, 'lineVoltage');
  assert.equal(sections.controls.energyCreditProgram, 'well');
});

// ── computeReviewFlags ───────────────────────────────────────────────────────

const CLEAN = {
  sources: ['plans.pdf'],
  overallConfidence: 0.92,
  unitTypes: [{ count: 200 }, { count: 100 }],
  projectTotals: { grossInteriorSf: 295000 },
  siteData: { totalUnits: 300, grossSf: 295000, parkingProvided: 470, surfaceParking: 400 },
  conflicts: [],
};

test('a clean, confident read produces no flags', () => {
  assert.deepEqual(computeReviewFlags(CLEAN), []);
});

test('no drawings at all is a single unambiguous flag', () => {
  for (const empty of [null, undefined, {}, { sources: [] }]) {
    const flags = computeReviewFlags(empty);
    assert.equal(flags.length, 1);
    assert.match(flags[0], /No drawings/i);
  }
});

test('low confidence is flagged with the percentage', () => {
  const flags = computeReviewFlags({ ...CLEAN, overallConfidence: 0.5 });
  assert.ok(flags.some(f => f.includes('50%')), flags.join(' | '));
});

test('matrix vs site unit disagreement over 10% is flagged with both numbers', () => {
  const flags = computeReviewFlags({ ...CLEAN, siteData: { ...CLEAN.siteData, totalUnits: 250 } });
  const f = flags.find(x => x.includes('disagree'));
  assert.ok(f && f.includes('300') && f.includes('250'), flags.join(' | '));
});

test('small unit disagreement (under 10%) is NOT flagged', () => {
  const flags = computeReviewFlags({ ...CLEAN, siteData: { ...CLEAN.siteData, totalUnits: 290 } });
  assert.ok(!flags.some(x => x.includes('disagree')), flags.join(' | '));
});

test('missing units, SF, and parking each get their own flag', () => {
  const flags = computeReviewFlags({ sources: ['x.pdf'], overallConfidence: 0.9, unitTypes: [], siteData: {} });
  assert.ok(flags.some(f => /unit count/i.test(f)), 'units flag missing');
  assert.ok(flags.some(f => /square footage/i.test(f)), 'SF flag missing');
  assert.ok(flags.some(f => /parking/i.test(f)), 'parking flag missing');
});

test('surface stalls exceeding total provided is flagged', () => {
  const flags = computeReviewFlags({ ...CLEAN, siteData: { ...CLEAN.siteData, surfaceParking: 500, parkingProvided: 470 } });
  assert.ok(flags.some(f => f.includes('500') && f.includes('470')), flags.join(' | '));
});

test('cross-file conflicts are rendered with values and file names', () => {
  const flags = computeReviewFlags({
    ...CLEAN,
    conflicts: [{ field: 'totalUnits', values: [{ value: 300, file: 'a.pdf' }, { value: 320 }] }],
  });
  const f = flags.find(x => x.includes('totalUnits'));
  assert.ok(f && f.includes('300 (a.pdf)') && f.includes('320'), flags.join(' | '));
});

test('malformed drawings payloads never throw', () => {
  for (const bad of [
    { sources: ['x'], unitTypes: 'nope', siteData: 'nope' },
    { sources: ['x'], conflicts: [null, {}, { field: 'y', values: null }] },
    { sources: ['x'], overallConfidence: 'high' },
  ]) {
    assert.ok(Array.isArray(computeReviewFlags(bad)));
  }
});
