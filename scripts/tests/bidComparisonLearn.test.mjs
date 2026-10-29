// Bid Comparison learning, the pure part (0139): which rule changes a set of
// staff marks adds up to. No database.
import test from 'node:test';
import assert from 'node:assert/strict';
import { wordCandidates, proposeFromMarks, MIN_MARKS } from '../../src/lib/bidComparison/learnRules.js';

const rules = {
  kinds: [
    { key: 'sconce', match: ['SCONCE', 'WALL BRACKET'] },
    { key: 'pendant', match: ['PENDANT'] },
  ],
  brands: new Map([['HALO', 'BUILDER'], ['NEWCO', 'SPEC']]),
};

const wrongKind = (description, kindShould, extra = {}) => ({ mark: 'WRONG_KIND', description, kindShould, kindRead: 'pendant', mfr: 'Acme', ...extra });
const right = (description, kindRead, extra = {}) => ({ mark: 'RIGHT', description, kindRead, mfr: 'Acme', ...extra });
const wrongGrade = (mfr, gradeShould, extra = {}) => ({ mark: 'WRONG_GRADE', description: 'LED fixture', mfr, gradeShould, gradeBy: 'brand', gradeRead: 'BUILDER', ...extra });

test('word candidates: 4+ letters, not a number, common words dropped', () => {
  assert.deepEqual(wordCandidates('LED Vanity light, 24in, 3000K, white with trim'), ['VANITY']);
  assert.deepEqual(wordCandidates('Wall mounted lantern'), ['WALL', 'LANTERN']);
});

test(`${MIN_MARKS} agreeing Wrong kind marks propose a word for that kind`, () => {
  const marks = [
    wrongKind('Bath vanity bar 24in', 'sconce'),
    wrongKind('Vanity light 3 lamp', 'sconce'),
    wrongKind('LED vanity strip', 'sconce'),
  ];
  const out = proposeFromMarks(marks, rules);
  assert.equal(out.length, 1);
  assert.equal(out[0].key, 'KIND_WORD|sconce|VANITY');
  assert.equal(out[0].marks, 3);
  assert.equal(out[0].against, 0);
  assert.equal(out[0].sample, 'Bath vanity bar 24in');
});

test('two marks are not enough; a word the kind already reads from is not proposed', () => {
  assert.deepEqual(proposeFromMarks([wrongKind('Vanity bar', 'sconce'), wrongKind('Vanity light', 'sconce')], rules), []);
  const marks = [wrongKind('Sconce one', 'sconce'), wrongKind('Sconce two', 'sconce'), wrongKind('Sconce three', 'sconce')];
  assert.deepEqual(proposeFromMarks(marks, rules), []);
});

test('Right marks that read the word as another kind count against; more against than for drops it', () => {
  const marks = [
    wrongKind('Vanity bar', 'sconce'),
    wrongKind('Vanity light', 'sconce'),
    wrongKind('Vanity strip', 'sconce'),
    right('Vanity pendant', 'pendant'),
    right('Vanity sconce', 'sconce'), // same kind, does not count against
  ];
  const [p] = proposeFromMarks(marks, rules);
  assert.equal(p.against, 1);
  const dropped = proposeFromMarks([...marks, right('Vanity drop', 'pendant'), right('Vanity down', 'pendant')], rules);
  assert.deepEqual(dropped, []);
});

test(`${MIN_MARKS} Wrong grade marks on one brand propose a brand grade`, () => {
  const marks = [wrongGrade('Halo', 'SPEC'), wrongGrade('Halo Lighting', 'SPEC'), wrongGrade('HALO', 'SPEC')];
  const [p] = proposeFromMarks(marks, rules);
  assert.equal(p.key, 'BRAND_GRADE|HALO|SPEC');
  assert.equal(p.marks, 3);
  assert.equal(p.grade, 'SPEC');
});

test('a brand already at that grade, or a grade the words set, is not proposed', () => {
  assert.deepEqual(proposeFromMarks([wrongGrade('Newco', 'SPEC'), wrongGrade('Newco', 'SPEC'), wrongGrade('Newco', 'SPEC')], rules), []);
  const words = [wrongGrade('Halo', 'SPEC', { gradeBy: 'words' }), wrongGrade('Halo', 'SPEC', { gradeBy: 'words' }), wrongGrade('Halo', 'SPEC', { gradeBy: 'words' })];
  assert.deepEqual(proposeFromMarks(words, rules), []);
});

test('Right marks on the brand at another grade count against a brand grade', () => {
  const marks = [wrongGrade('Halo', 'SPEC'), wrongGrade('Halo', 'SPEC'), wrongGrade('Halo', 'SPEC'), right('Halo can', 'downlight', { mfr: 'Halo', gradeRead: 'BUILDER' })];
  const [p] = proposeFromMarks(marks, rules);
  assert.equal(p.against, 1);
});
