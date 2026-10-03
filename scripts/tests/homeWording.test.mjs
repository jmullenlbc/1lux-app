// Mike 10-2: townhomes and single-family homes read "Exterior front door" and
// "back balcony" wording; every other type keeps the corridor wording.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { INTAKE_QUESTIONS, questionFor, optionLabelFor, designChoices } from '../../src/lib/intake/questionnaire.js';

const q = key => INTAKE_QUESTIONS.find(x => x.key === key);

test('homes get the front door and back balcony wording', () => {
  for (const type of ['Town Houses (2-3 Levels)', 'Single Family (1-2 Levels)']) {
    const door = questionFor(q('unitEntrySconce'), type);
    assert.equal(door.section, 'Front door & back balcony');
    assert.match(door.question, /front door/);
    const bal = questionFor(q('balconyLighting'), type);
    assert.match(bal.question, /back balconies/);
    assert.equal(optionLabelFor(bal, 'Exterior balcony sconce (High finish)'), 'Back balcony sconce (High finish)');
  }
});

test('stored answers and prices keys do not change for homes', () => {
  const bal = questionFor(q('balconyLighting'), 'Town Houses (2-3 Levels)');
  assert.deepEqual(bal.options, q('balconyLighting').options);
  assert.deepEqual(bal.engine, q('balconyLighting').engine);
});

test('apartment types keep the corridor wording', () => {
  const door = questionFor(q('unitEntrySconce'), 'Garden (2-4 Levels)');
  assert.equal(door, q('unitEntrySconce'));
  assert.equal(optionLabelFor(q('balconyLighting'), 'Exterior balcony sconce (Low finish)'), 'Exterior balcony sconce (Low finish)');
  assert.equal(optionLabelFor(q('exteriorAmenityFinish'), '3'), '$3/SF');
});

test('design choices summary uses the home wording', () => {
  const rows = designChoices({ projectType: 'Single Family (1-2 Levels)', balconyLighting: 'Exterior balcony sconce (Medium finish)' });
  const bal = rows.find(r => /balcon/.test(r.question));
  assert.equal(bal.answer, 'Back balcony sconce (Medium finish)');
  assert.ok(rows.some(r => r.section === 'Front door & back balcony'));
  assert.equal(bal.section, 'Front door & back balcony', 'the balcony moves to the front door page');
});
