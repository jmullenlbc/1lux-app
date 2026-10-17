/**
 * The public "Report a bug" button on /conceptual_budget posts to an
 * unauthenticated route. cleanPublicBugReport is the only thing between a
 * stranger's POST and the BugReport table, so this pins its clamps.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanPublicBugReport, titleFrom, clampText, LIMITS } from '../../src/lib/publicBugReport.js';

test('a description is required: blank, whitespace or missing is refused', () => {
  assert.equal(cleanPublicBugReport({}).ok, false);
  assert.equal(cleanPublicBugReport({ description: '   \n ' }).ok, false);
  assert.equal(cleanPublicBugReport(null).ok, false);
  assert.equal(cleanPublicBugReport('just a string').ok, false);
});

test('a good report comes back tidied', () => {
  const r = cleanPublicBugReport({
    description: '  The Next button did nothing  ',
    name: ' Jane Smith ',
    email: ' Jane@Example.COM ',
    pageUrl: 'https://app.ilcstudios.com/conceptual_budget',
    userAgent: 'Mozilla/5.0',
    viewport: '390 x 844',
  });
  assert.equal(r.ok, true);
  assert.deepEqual(r.data, {
    title:         'The Next button did nothing',
    description:   'The Next button did nothing',
    reporterName:  'Jane Smith',
    reporterEmail: 'jane@example.com',
    pageUrl:       'https://app.ilcstudios.com/conceptual_budget',
    browserInfo:   'Mozilla/5.0',
    viewport:      '390 x 844',
    draftId:       null,
    step:          null,
    projectName:   null,
  });
});

test('name and email are optional and stored as null when blank', () => {
  const r = cleanPublicBugReport({ description: 'broken', name: '', email: '   ' });
  assert.equal(r.ok, true);
  assert.equal(r.data.reporterName, null);
  assert.equal(r.data.reporterEmail, null);
});

test('an email that is clearly not one is refused with a friendly message', () => {
  const r = cleanPublicBugReport({ description: 'broken', email: 'not an email' });
  assert.equal(r.ok, false);
  assert.match(r.error, /email/i);
});

test('every string is capped', () => {
  const long = 'x'.repeat(10_000);
  const r = cleanPublicBugReport({
    description: long, name: long, userAgent: long, viewport: long,
    email: `${'a'.repeat(300)}@example.com`,
  });
  // The over-long email gets cut, loses its domain, and is refused, which is
  // fine: nobody has a 300-character address.
  assert.equal(r.ok, false);

  const ok = cleanPublicBugReport({ description: long, name: long, userAgent: long, viewport: long });
  assert.equal(ok.data.description.length, LIMITS.description);
  assert.equal(ok.data.reporterName.length, LIMITS.name);
  assert.equal(ok.data.browserInfo.length, LIMITS.userAgent);
  assert.equal(ok.data.viewport.length, LIMITS.viewport);
});

test('the title is one line, at most 80 characters, with an ellipsis when cut', () => {
  assert.equal(titleFrom('short one'), 'short one');
  assert.equal(titleFrom('line one\n\nline   two'), 'line one line two');
  const t = titleFrom('word '.repeat(50));
  assert.ok(t.length <= LIMITS.title);
  assert.ok(t.endsWith('…'));
});

test('non-string inputs become blank rather than "[object Object]"', () => {
  assert.equal(clampText({ evil: true }, 100), '');
  assert.equal(clampText(['a'], 100), '');
  assert.equal(clampText(undefined, 100), '');
  assert.equal(clampText(42, 100), '42');
  const r = cleanPublicBugReport({ description: 'broken', name: { x: 1 } });
  assert.equal(r.data.reporterName, null);
});

test('NUL bytes are stripped (Postgres rejects them)', () => {
  assert.equal(clampText('a' + String.fromCharCode(0) + 'b', 100), 'ab');
  // Digits that merely look like the escape must survive (a ZIP, a square-footage).
  assert.equal(clampText('10000 SF', 100), '10000 SF');
});

test('only http(s) page URLs are kept', () => {
  assert.equal(cleanPublicBugReport({ description: 'x', pageUrl: 'javascript:alert(1)' }).data.pageUrl, null);
  assert.equal(cleanPublicBugReport({ description: 'x', pageUrl: 'http://localhost:3000/conceptual_budget' }).data.pageUrl,
    'http://localhost:3000/conceptual_budget');
});

test('the wizard draft id is kept only when it looks like one; step and project name are clamped', () => {
  const ok = cleanPublicBugReport({ description: 'x', draftId: 'cmabc123def456ghi', step: 'Amenities', projectName: 'Lincoln Ave, 100% DD' }).data;
  assert.equal(ok.draftId, 'cmabc123def456ghi');
  assert.equal(ok.step, 'Amenities');
  assert.equal(ok.projectName, 'Lincoln Ave, 100% DD');
  assert.equal(cleanPublicBugReport({ description: 'x', draftId: '../etc/passwd' }).data.draftId, null);
  assert.equal(cleanPublicBugReport({ description: 'x', draftId: 'short' }).data.draftId, null);
  assert.equal(cleanPublicBugReport({ description: 'x', draftId: 'a'.repeat(50) }).data.draftId, null);
  const long = cleanPublicBugReport({ description: 'x', step: 's'.repeat(500), projectName: 'p'.repeat(500) }).data;
  assert.equal(long.step.length, LIMITS.step);
  assert.equal(long.projectName.length, LIMITS.projectName);
  const blank = cleanPublicBugReport({ description: 'x' }).data;
  assert.equal(blank.draftId, null);
  assert.equal(blank.step, null);
  assert.equal(blank.projectName, null);
});
