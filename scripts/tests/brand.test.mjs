// Whose name is on a document (2026-11-10): the job's company, else 1LUX; blank details are left off.
import test from 'node:test';
import assert from 'node:assert/strict';
import { APP_NAME, DEFAULT_BRAND, brandFor, docName, contactLine, confidentialLine, subjectTag } from '../../src/lib/brand.js';

test('no company = 1LUX with no address', () => {
  assert.equal(APP_NAME, '1LUX');
  assert.equal(brandFor(null), DEFAULT_BRAND);
  assert.equal(docName(brandFor(null)), '1LUX');
  assert.equal(confidentialLine(brandFor(null)), 'Confidential: 1LUX');
});

test('a company row wins over the built-in list, and blanks are left off', () => {
  const logiq = brandFor({ id: 'bu_logiq', name: 'LOGIQ', legalName: 'Logiq Supply', address: '2727 W 2nd Ave,\nDenver, CO 80219', ordersEmail: 'orders@example.test' });
  assert.equal(logiq.code, 'LOGIQ');
  assert.equal(docName(logiq), 'Logiq Supply');
  assert.equal(logiq.address, '2727 W 2nd Ave, Denver, CO 80219');
  assert.equal(contactLine(logiq), 'Logiq Supply | 2727 W 2nd Ave, Denver, CO 80219 | orders@example.test');
  assert.equal(subjectTag(logiq), '[LOGIQ]');
});

test('an id alone still names the company', () => {
  const sage = brandFor({ id: 'bu_sage' });
  assert.equal(sage.name, 'SAGE');
  assert.equal(docName(sage), 'SAGE');
  assert.equal(confidentialLine(sage), 'Confidential: SAGE');
  assert.equal(brandFor({ businessUnitId: 'bu_shift' }).name, 'Shift');
});

test('nothing on a document says ILC', () => {
  for (const b of [brandFor(null), brandFor({ id: 'bu_logiq' }), brandFor({ id: 'bu_sage' }), brandFor({ id: 'bu_shift' })]) {
    assert.doesNotMatch(confidentialLine(b), /ILC/);
  }
});
