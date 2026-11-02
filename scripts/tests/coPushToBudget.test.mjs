// Push to Budget makes a version holding only one change order's lines. It must
// keep a credit as a minus, and it must never pass for the job's budget.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { NOT_CO_VERSION, isCoVersion } from '../../src/lib/budgetVersions.js';

const read = (p) => readFileSync(new URL(`../../src/${p}`, import.meta.url), 'utf8');
const PUSH = 'app/api/projects/[id]/change-orders/[coId]/push-to-budget/route.js';

const READERS = [
  'lib/changeOrderProductStart.js',
  'app/api/portal/projects/[id]/budget/route.js',
  'app/api/projects/[id]/ship-schedule/push/route.js',
  'lib/budgetQCAutoChecks.js',
  'app/api/pricing/price-history/route.js',
  'app/api/projects/[id]/error-radar/route.js',
  'app/api/projects/[id]/design-bid-matrix/pdf/route.js',
  'app/api/projects/[id]/design-bid-matrix/export/route.js',
  'app/api/projects/[id]/design-bid-matrix/items/[itemId]/route.js',
  'app/api/projects/[id]/design-bid-matrix/duplicate/route.js',
  'app/api/projects/[id]/fixture-schedule/publish/route.js',
  'lib/dashboards/providers.js',
  'lib/meetingPrep/budgets.js',
  'lib/calibration/capture.js',
  'lib/mcp/tools.js',
];

test('the mark the push writes is the one the readers look for', () => {
  const summary = JSON.stringify({ source: 'change_order', coId: 'c1', coNumber: 'CO-00003' });
  assert.ok(read(PUSH).includes("source: 'change_order'"));
  assert.equal(isCoVersion({ changeSummary: summary }), true);
  assert.ok(summary.includes(NOT_CO_VERSION.OR[1].NOT.changeSummary.contains));
});

test('a normal budget version is not a change order version', () => {
  assert.equal(isCoVersion({ changeSummary: null }), false);
  assert.equal(isCoVersion({ changeSummary: JSON.stringify({ added: [{ type: 'A1' }], removed: [] }) }), false);
  assert.equal(isCoVersion(null), false);
});

test('a credit keeps its minus quantity on the push', () => {
  assert.doesNotMatch(read(PUSH), /li\.qty > 0/);
  assert.match(read(PUSH), /li\.qty == null \? null : Math\.round\(li\.qty\)/);
});

test('every read of the newest budget skips change order versions', () => {
  for (const file of READERS) assert.match(read(file), /NOT_CO_VERSION/, file);
});

test('the budget editor opens the real budget and only that one edits', () => {
  const editor = read('app/(app)/project/[id]/DesignBidMatrixEditor.jsx');
  assert.match(editor, /const isLatest\s+= selectedIdx === currentIdx/);
  assert.doesNotMatch(editor, /selectedIdx === 0/);
});
