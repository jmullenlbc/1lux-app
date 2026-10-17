import test from 'node:test';
import assert from 'node:assert/strict';
import { readView, writeView } from '../../src/lib/useUrlView.js';

const fields = [{ key: 'q', kind: 'text' }, { key: 'city', kind: 'pick' }, { key: 'units', kind: 'range' }, { key: 'sent', kind: 'yesno' }];
const def = { key: '', dir: 'asc' };

test('address round-trips filters and sort, and leaves other values alone', () => {
  const q = writeView('?tab=open&as=a%40x.com', fields, { q: 'lone', city: 'Denver, CO', units: { min: '10', max: '' } }, { key: 'units', dir: 'desc' }, def);
  assert.ok(q.includes('tab=open') && q.includes('as=a%40x.com'));
  const back = readView(q, fields, def);
  assert.deepEqual(back.filters, { q: 'lone', city: 'Denver, CO', units: { min: '10', max: '' } });
  assert.deepEqual(back.sort, { key: 'units', dir: 'desc' });
});

test('empty filters and the default sort write nothing', () => {
  assert.equal(writeView('', fields, {}, def, def), '');
  assert.equal(writeView('?q=a', fields, {}, def, def), '');
});

test('a sort key the page does not know is ignored', () => {
  assert.deepEqual(readView('?sort=bogus.desc', fields, def).sort, def);
});
