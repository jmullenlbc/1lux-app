// Public share links hand data to outsiders. Found 2026-09-15 on the fixture-schedule
// link: it returned every column (internal notes included), and an edit link could
// write any column on any fixture row in the database, on any job, by id.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SHARED_FIXTURE_FIELDS, publicFixtureItem, cleanShareEdit,
} from '../../src/lib/share/fixtureShare.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const read = rel => readFileSync(join(ROOT, rel), 'utf8');

const ROW = {
  id: 'i1', scheduleId: 's1', type: 'P1', location: 'Units', description: 'Pendant',
  manufacturer: 'Acme', catalogNumber: 'X-1', finish: null, cct: '3000K', lumens: null,
  wattage: null, voltage: null, dimming: null, mounting: null, notes: 'ok',
  internalNotes: 'buy from rep at $41 net', aiFlagged: true, aiConfidence: 0.4,
  drawingSheetReference: 'EL-101', sortOrder: 0, createdAt: new Date(), updatedAt: new Date(),
};

test('an outsider sees only the allowlisted fixture columns', () => {
  const out = publicFixtureItem(ROW);
  assert.deepEqual(Object.keys(out).sort(), ['id', ...SHARED_FIXTURE_FIELDS].sort());
  assert.equal(out.internalNotes, undefined);
  assert.equal(out.scheduleId, undefined);
});

test('no internal, price or DN column is ever on the share allowlist', () => {
  for (const f of SHARED_FIXTURE_FIELDS) {
    assert.doesNotMatch(f, /internal|price|cost|dn|margin|net|buy/i, `${f} must not be shared`);
  }
});

test('an edit link can change only the allowlisted columns, with text', () => {
  for (const f of ['internalNotes', 'scheduleId', 'id', 'aiFlagged', 'sortOrder', '__proto__']) {
    assert.ok(cleanShareEdit(f, 'x').error, `${f} must be refused`);
  }
  assert.ok(cleanShareEdit('notes', { nested: true }).error);
  assert.deepEqual(cleanShareEdit('notes', '  hi  ').data, { notes: 'hi' });
  assert.deepEqual(cleanShareEdit('notes', '').data, { notes: null });
  assert.deepEqual(cleanShareEdit('type', null).data, { type: '' }); // required column stays text
  assert.equal(cleanShareEdit('notes', 'x'.repeat(5000)).data.notes.length, 2000);
});

test('the share route filters output and checks the row belongs to the shared job', () => {
  const src = read('src/app/api/share/fixture/[token]/route.js');
  assert.match(src, /items[^\n]*\.map\(publicFixtureItem\)/, 'GET must filter each row');
  assert.match(src, /NextResponse\.json\(publicFixtureItem\(updated\)\)/, 'PATCH must filter its reply');
  assert.match(src, /cleanShareEdit\(field, value\)/);
  assert.match(src, /schedule:\s*\{\s*projectId:\s*share\.projectId/, 'PATCH must check the row is on this job');
  assert.doesNotMatch(src, /data:\s*\{\s*\[field\]/, 'never write a column named by the request');
});

test('the shared-schedule screen only shows columns the link actually sends', () => {
  const src = read('src/app/share/fixture/[token]/SharedFixtureSchedule.jsx');
  const keys = [...src.matchAll(/\{ key: '(\w+)'/g)].map(m => m[1]);
  assert.ok(keys.length > 0);
  for (const k of keys) assert.ok(SHARED_FIXTURE_FIELDS.includes(k), `${k} is shown but not shared`);
});
