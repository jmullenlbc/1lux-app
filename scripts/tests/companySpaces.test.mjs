// Company spaces (0165): the one list every picker, filter and badge reads.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SPACES, SPACE_CODES, NO_SPACE, spaceOf, spaceLabel, spaceOptions, businessUnitIdFrom, cleanSpaces,
  spaceKeys, inSpace, spaceWhere, spacesFor, spaceFilterChoices,
} from '../../src/lib/companySpaces.js';

test('the three spaces carry the fixed ids migration 0165 inserts', () => {
  assert.deepEqual(SPACE_CODES, ['LOGIQ', 'SAGE', 'SHIFT']);
  assert.deepEqual(SPACES.map(s => s.id), ['bu_logiq', 'bu_sage', 'bu_shift']);
});

test('a space is found by id or by code in any case; anything else is null', () => {
  assert.equal(spaceOf('bu_sage').code, 'SAGE');
  assert.equal(spaceOf('shift').id, 'bu_shift');
  assert.equal(spaceOf(' LOGIQ ').id, 'bu_logiq');
  assert.equal(spaceOf('ILC'), null);
  assert.equal(spaceOf(null), null);
  assert.equal(spaceLabel('bu_shift'), 'Shift');
  assert.equal(spaceLabel(null), '');
});

test('what a request may store: a known id or code, null to clear, undefined to refuse', () => {
  assert.equal(businessUnitIdFrom('SAGE'), 'bu_sage');
  assert.equal(businessUnitIdFrom('bu_logiq'), 'bu_logiq');
  assert.equal(businessUnitIdFrom(''), null);
  assert.equal(businessUnitIdFrom(null), null);
  assert.equal(businessUnitIdFrom('bu_nope'), undefined);
});

test('select options: the three spaces, with a blank first when asked', () => {
  assert.equal(spaceOptions().length, 3);
  assert.deepEqual(spaceOptions({ blankLabel: 'Not set yet' })[0], { value: '', label: 'Not set yet' });
});

test('sells-for lists keep known codes only, once each, and refuse a non-list', () => {
  assert.deepEqual(cleanSpaces(['sage', 'SAGE', 'bu_logiq', 'ILC']), ['SAGE', 'LOGIQ']);
  assert.deepEqual(cleanSpaces([]), []);
  assert.equal(cleanSpaces('SAGE'), null);
  assert.deepEqual(spaceKeys({ businessUnits: [{ space: 'SHIFT' }, { space: 'LOGIQ' }] }), ['LOGIQ', 'SHIFT']);
  assert.deepEqual(spaceKeys(null), []);
});

test('the filter: blank = all, a code = that space, NONE = no space yet', () => {
  const sage = { businessUnitId: 'bu_sage' };
  const none = { businessUnitId: null };
  assert.equal(inSpace(sage, ''), true);
  assert.equal(inSpace(sage, 'SAGE'), true);
  assert.equal(inSpace(sage, 'LOGIQ'), false);
  assert.equal(inSpace(none, NO_SPACE), true);
  assert.equal(inSpace(sage, NO_SPACE), false);
  assert.deepEqual(spaceWhere(''), {});
  assert.deepEqual(spaceWhere('SHIFT'), { businessUnitId: 'bu_shift' });
  assert.deepEqual(spaceWhere(NO_SPACE), { businessUnitId: null });
  assert.deepEqual(spaceWhere('junk'), {});
});

test('a person sees their own spaces first, then the rest, then "No company yet"', () => {
  assert.deepEqual(spacesFor(['SHIFT']).map(s => s.code), ['SHIFT', 'LOGIQ', 'SAGE']);
  assert.deepEqual(spaceFilterChoices(['SAGE']).map(c => c[0]), ['SAGE', 'LOGIQ', 'SHIFT', NO_SPACE]);
});
