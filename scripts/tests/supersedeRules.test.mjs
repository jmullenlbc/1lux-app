// One building, one count (migration 0124, Mike 10-8). Pure, no DB.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kindRank, addressKey, textNamesAddress, sameBuilding, decideSupersedes } from '../../src/lib/market-intel/supersedeRules.js';

const denver  = { tags: [{ tag: { kind: 'METRO', normalized: 'denver, co' } }] };
const permit  = { id: 'p1', kind: 'PERMIT',  address: '4459 N Rifle St', unitCount: 265, publishedAt: '2026-09-23', title: 'New building, 265 units: 4459 N Rifle St', ...denver };
const article = { id: 'a1', kind: 'ARTICLE', unitCount: 265, publishedAt: '2026-03-02', title: 'Paulscorp plans 265-unit complex in Green Valley Ranch', summary: '', ...denver };
const concept = { id: 'c1', kind: 'CONCEPT', unitCount: 265, publishedAt: '2026-06-01', title: 'Concept plan filed for 4459 Rifle Street', ...denver };

test('permit outranks concept plan outranks article', () => {
  assert.ok(kindRank('PERMIT') > kindRank('CONCEPT'));
  assert.ok(kindRank('CONCEPT') > kindRank('ARTICLE'));
  assert.equal(kindRank(undefined), kindRank('ARTICLE'));
});

test('an address boils down to its number and street name', () => {
  assert.deepEqual(addressKey('4459 N Rifle St'), { number: '4459', street: 'rifle' });
  assert.deepEqual(addressKey('2777 N ZUNI ST'), { number: '2777', street: 'zuni' });
  assert.equal(addressKey('Rifle St'), null);
  assert.equal(addressKey(''), null);
  assert.ok(textNamesAddress('Groundbreaking at 4459 Rifle Street in Denver', '4459 N Rifle St'));
  assert.equal(textNamesAddress('Groundbreaking at 4460 Rifle Street', '4459 N Rifle St'), false);
});

test('same metro plus same units or the address in the text is the same building', () => {
  assert.ok(sameBuilding(permit, article));
  assert.ok(sameBuilding(permit, concept));
  assert.ok(sameBuilding(permit, { ...article, unitCount: null, summary: 'Work starts at 4459 Rifle St this fall.' }));
  assert.equal(sameBuilding(permit, { ...article, unitCount: 300 }), false);
  assert.equal(sameBuilding(permit, { ...article, tags: [{ tag: { kind: 'METRO', normalized: 'austin, tx' } }] }), false);
  assert.equal(sameBuilding(permit, { ...article, publishedAt: '2023-01-01' }), false);
  assert.equal(sameBuilding(permit, permit), false);
});

test('a new permit supersedes the article and the concept plan', () => {
  assert.deepEqual(decideSupersedes(permit, [article, concept]), { losers: ['a1', 'c1'], winner: null });
});

test('a new article is superseded by the highest-ranked match', () => {
  assert.deepEqual(decideSupersedes(article, [concept, permit]), { losers: [], winner: 'p1' });
});

test('reviewed, dismissed and already-superseded candidates are left alone', () => {
  assert.deepEqual(decideSupersedes(permit, [{ ...article, supersedeReviewed: true }]), { losers: [], winner: null });
  assert.deepEqual(decideSupersedes(permit, [{ ...article, reviewStatus: 'DISMISSED' }]), { losers: [], winner: null });
  assert.deepEqual(decideSupersedes(permit, [{ ...article, supersededById: 'p0' }]), { losers: [], winner: null });
  assert.deepEqual(decideSupersedes({ ...article, supersedeReviewed: true }, [permit]), { losers: [], winner: null });
});
