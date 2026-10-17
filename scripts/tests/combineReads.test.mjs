// The dropzone's hold rule: nothing is shown or priced until every dropped
// file has been read, and the merge then runs once over everything.
// Mike 2026-09-16: "It shouldn't show data until it reads all drawings and
// then decides if it needs to guess or if there is something real it can use."
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { combineReads, EARLIER_NAME } from '../../src/lib/intake/combineReads.js';

const read = (name, rows, totals = {}, conf = 0.9) => ({
  id: name, name, status: 'done', proposal: {
    unitTypes: rows, overallConfidence: conf,
    projectTotals: { grossInteriorSf: null, garageSf: null, corridorSf: null, buildingType: null, ...totals },
  },
});
const pending = (name, status = 'parsing') => ({ id: name, name, status, proposal: null });
const failed = name => ({ id: name, name, status: 'error', proposal: null, error: 'x' });

test('nothing dropped → nothing merged, nothing reading', () => {
  assert.deepEqual(combineReads([]), { merged: null, reading: 0, done: 0, failed: 0, total: 0 });
  assert.deepEqual(combineReads(null), { merged: null, reading: 0, done: 0, failed: 0, total: 0 });
});

test('one finished file merges on its own', () => {
  const out = combineReads([read('a.pdf', [{ code: 'A1', qty: 10, confidence: 0.9 }])]);
  assert.equal(out.reading, 0);
  assert.equal(out.merged.unitTypes[0].qty, 10);
  assert.deepEqual(out.merged.sources, ['a.pdf']);
});

test('a finished file shows NOTHING while another is still queued, uploading or parsing', () => {
  for (const status of ['queued', 'uploading', 'parsing']) {
    const out = combineReads([read('a.pdf', [{ code: 'A1', qty: 10, confidence: 0.9 }]), pending('b.pdf', status)]);
    assert.equal(out.merged, null, `held while b is ${status}`);
    assert.equal(out.reading, 1);
    assert.equal(out.done, 1);
    assert.equal(out.total, 2);
  }
});

test('the figures appear only once the last file lands, from one merge over everything', () => {
  const a = read('arch.pdf', [{ code: 'A1', qty: 60, confidence: 0.5 }], {}, 0.95);
  const g = read('gen.pdf', [
    { code: 'A1', qty: 100, confidence: 0.9 }, { code: 'B1', qty: 68, confidence: 0.9 },
  ], { statedTotalUnits: 168 }, 0.7);
  // arch finished first, before this change the screen would have said 60 units here.
  assert.equal(combineReads([a, pending('gen.pdf')]).merged, null);
  const out = combineReads([a, g]);
  assert.equal(out.merged.unitSchedule.file, 'gen.pdf');
  assert.equal(out.merged.unitTypes.reduce((s, r) => s + r.qty, 0), 168);
});

test('a file that failed does not hold the others back', () => {
  const out = combineReads([read('a.pdf', [{ code: 'A1', qty: 10, confidence: 0.9 }]), failed('b.pdf')]);
  assert.equal(out.reading, 0);
  assert.equal(out.failed, 1);
  assert.equal(out.merged.unitTypes[0].qty, 10);
});

test('a Retry puts a failed file back in flight and pulls the figures again', () => {
  const a = read('a.pdf', [{ code: 'A1', qty: 10, confidence: 0.9 }]);
  assert.ok(combineReads([a, failed('b.pdf')]).merged);
  assert.equal(combineReads([a, pending('b.pdf', 'uploading')]).merged, null);
});

test('the read kept from a saved draft passes through alone, untouched', () => {
  const kept = { unitTypes: [{ code: 'K', qty: 5 }], sources: ['old.pdf'], marker: 'same object' };
  const out = combineReads([], kept);
  assert.equal(out.merged, kept);
});

test('the kept read joins new files as one more source, and is held with them', () => {
  const kept = {
    unitTypes: [{ code: 'K', qty: 5, confidence: 0.9 }], overallConfidence: 0.9,
    projectTotals: { grossInteriorSf: null, garageSf: null, corridorSf: null, buildingType: null },
  };
  assert.equal(combineReads([pending('n.pdf')], kept).merged, null, 'held even though the kept read is ready');
  const out = combineReads([read('n.pdf', [{ code: 'N', qty: 7, confidence: 0.9 }])], kept);
  assert.deepEqual(out.merged.sources, [EARLIER_NAME, 'n.pdf']);
  assert.equal(out.merged.unitTypes.length, 2);
});
