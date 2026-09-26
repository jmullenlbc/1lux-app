/**
 * Personal facts on contacts (Mike 9-26: "2 kids who play soccer or they like
 * golf or hiking or cold brew") and the signature name / office line.
 *
 * Run: node --test scripts/tests/personalFacts.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanCategory, cleanFact, factKey, newFacts, personalLine, personalSection } from '../../src/lib/contacts/personalFacts.js';
import { buildFactBlocks, BLOCKS } from '../../src/lib/meetingPrep/brief.js';
import { signatureBlock, officeLine } from '../../src/lib/bot/emailStyle.js';

test('categories are cleaned, unknown ones become Other', () => {
  assert.equal(cleanCategory('sports'), 'SPORTS');
  assert.equal(cleanCategory('Food & Drink'), 'FOOD_DRINK');
  assert.equal(cleanCategory('food'), 'FOOD_DRINK');
  assert.equal(cleanCategory('astrology'), 'OTHER');
  assert.equal(cleanCategory(null), 'OTHER');
});

test('the same fact twice is kept once, whatever the case or full stop', () => {
  assert.equal(cleanFact('  Likes   cold brew.  '), 'Likes cold brew');
  assert.equal(factKey('Likes cold brew.'), factKey('likes Cold Brew'));
  const out = newFacts(
    [{ category: 'FOOD_DRINK', fact: 'Likes cold brew.' }, { category: 'family', fact: 'Has two kids who play soccer' }, { category: 'x', fact: 'has two kids who play soccer!' }, { fact: ' ' }],
    [{ fact: 'likes cold brew' }],
  );
  assert.deepEqual(out.map(f => [f.category, f.fact]), [['FAMILY', 'Has two kids who play soccer']]);
});

test('the writers get at most three live facts, and nothing when none', () => {
  const facts = [{ fact: 'Golfs' }, { fact: 'Hikes', archivedAt: new Date() }, { fact: 'Likes cold brew' }, { fact: 'Two kids' }, { fact: 'Has a dog' }];
  assert.equal(personalLine(facts), 'Golfs; Likes cold brew; Two kids');
  assert.equal(personalSection('', 'Lee'), '');
  const s = personalSection('Golfs', 'Lee');
  assert.match(s, /Lee mentioned outside work: Golfs\./);
  assert.match(s, /Never invent/);
  assert.doesNotMatch(s, /—|–|--/);
});

test('Meeting Prep shows a Personal block, only for known people', () => {
  assert.ok(BLOCKS.some(b => b.key === 'personal'));
  const blocks = buildFactBlocks({
    contacts: [{ id: 'c1', name: 'Lee Park', onNote: true }],
    personal: [
      { id: 'f1', contactId: 'c1', category: 'SPORTS', fact: 'Plays golf.' },
      { id: 'f2', contactId: 'nobody', category: 'OTHER', fact: 'Should not show' },
    ],
  });
  const personal = blocks.filter(f => f.block === 'personal');
  assert.equal(personal.length, 1);
  assert.equal(personal[0].text, 'Lee Park: Plays golf.');
  assert.equal(personal[0].sourceKind, 'ContactPersonalFact');
});

test('signature: printed name override and optional office line', () => {
  const t = '{name}\n{email}\nc: {phone}\no: {office}';
  const base = { name: 'Michael Kershner', email: 'mike@ilcstudios.com', phone: '8579980556' };
  assert.equal(signatureBlock({ ...base, signatureName: 'Mike Kershner' }, t).split('\n')[0], 'Mike Kershner');
  assert.equal(signatureBlock(base, t).split('\n')[0], 'Michael Kershner');
  assert.doesNotMatch(signatureBlock(base, t), /o:/);
  assert.equal(officeLine('6175551234', 'x204'), '617.555.1234 ext 204');
  assert.equal(officeLine('', '204'), '');
  assert.match(signatureBlock({ ...base, officePhone: '6175551234', officeExt: '204' }, t), /o: 617\.555\.1234 ext 204/);
});
