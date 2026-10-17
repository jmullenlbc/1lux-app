/**
 * The two controlled lists Mike settled on 2026-09-19.
 *
 * What this pins:
 *   1. Service Type offers exactly four choices, "Other" was dropped because
 *      it carried no meaning and split the reporting. A project ALREADY saved
 *      as 'other' must still read "Other", still be filterable, and must not
 *      be silently reassigned when somebody opens its dropdown.
 *   2. A CRM person's department is one of Mike's eight from CRM
 *      ORGANIZATION.xlsx. The old five-word list's odd one out (Finance) stays
 *      readable, common spellings convert, and a word we have never seen is
 *      KEPT AS TYPED, a bulk import must never wipe somebody's department.
 *   3. This is NOT the ILC staff department list in src/lib/departments.js.
 *      Different question, different file, and they must not merge by accident.
 *
 * Run: node --test scripts/tests/serviceAndDepartments.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SERVICE_TYPES, LEGACY_SERVICE_TYPES, ALL_SERVICE_TYPES,
  SETTABLE_SERVICE_TYPE_KEYS, serviceTypeOptions, serviceTypeLabel,
} from '../../src/lib/utils.js';
import {
  CONTACT_DEPARTMENTS, LEGACY_CONTACT_DEPARTMENTS, ALL_CONTACT_DEPARTMENTS,
  CONTACT_DEPARTMENT_KEYS, ALL_CONTACT_DEPARTMENT_KEYS,
  contactDepartmentLabel, isSettableContactDepartment,
  normalizeContactDepartment, cleanDepartment, departmentOptions,
} from '../../src/lib/contactDepartments.js';
import { DEPARTMENTS as STAFF_DEPARTMENTS } from '../../src/lib/departments.js';

// ── 1. Service types ─────────────────────────────────────────────────────────
test('the service-type picker offers five choices and not Other', () => {
  assert.deepEqual(SERVICE_TYPES.map(t => t.value),
    ['fullDesign', 'designAssist', 'peerReview', 'bidOnly', 'conceptual']);
  assert.equal(serviceTypeLabel('conceptual'), 'Conceptual Budget');
  assert.equal(SERVICE_TYPES.some(t => t.value === 'other'), false);
  assert.equal(serviceTypeLabel('fullDesign'), 'Full Design');
});

test('an old Other project still reads and still filters', () => {
  assert.equal(serviceTypeLabel('other'), 'Other');
  assert.equal(ALL_SERVICE_TYPES.some(t => t.value === 'other'), true);
  assert.equal(SETTABLE_SERVICE_TYPE_KEYS.includes('other'), false);
});

test('opening the dropdown on an Other project cannot silently move it', () => {
  // The option has to be IN the list, or the browser shows the first option
  // and the next save writes fullDesign over a real answer.
  assert.equal(serviceTypeOptions('other').some(t => t.value === 'other'), true);
  assert.equal(serviceTypeOptions('fullDesign').some(t => t.value === 'other'), false);
  assert.equal(serviceTypeOptions(null).length, 5);
});

test('an unknown service type prints itself rather than a blank', () => {
  assert.equal(serviceTypeLabel('somethingNew'), 'somethingNew');
  assert.equal(serviceTypeLabel(null), '—');
});

// ── 2. Contact departments ───────────────────────────────────────────────────
test('the department list is Mike’s eight, in his order', () => {
  assert.deepEqual(CONTACT_DEPARTMENT_KEYS, [
    'CORPORATE', 'PRECONSTRUCTION', 'CONSTRUCTION', 'PROCUREMENT',
    'DESIGN', 'DEVELOPMENT', 'ARCHITECT', 'INTERIOR_DESIGN',
  ]);
  assert.equal(CONTACT_DEPARTMENTS.length, 8);
  assert.equal(contactDepartmentLabel('INTERIOR_DESIGN'), 'Interior Design');
});

test('Finance is readable but no longer settable', () => {
  assert.deepEqual(LEGACY_CONTACT_DEPARTMENTS.map(d => d.key), ['FINANCE']);
  assert.equal(contactDepartmentLabel('FINANCE'), 'Finance');
  assert.equal(isSettableContactDepartment('FINANCE'), false);
  assert.equal(isSettableContactDepartment('PROCUREMENT'), true);
  assert.equal(ALL_CONTACT_DEPARTMENTS.length, 9);
  assert.equal(ALL_CONTACT_DEPARTMENT_KEYS.length, 9);
});

test('the spellings people actually type convert', () => {
  assert.equal(normalizeContactDepartment('Pre-construction'), 'PRECONSTRUCTION');
  assert.equal(normalizeContactDepartment('pre construction'), 'PRECONSTRUCTION');
  assert.equal(normalizeContactDepartment('Purchasing'), 'PROCUREMENT');
  assert.equal(normalizeContactDepartment('interior design'), 'INTERIOR_DESIGN');
  assert.equal(normalizeContactDepartment('Nonsense'), null);
  assert.equal(normalizeContactDepartment(''), null);
});

test('a department we have never seen is kept exactly as typed', () => {
  // The whole point: an import from somebody else's CRM must not blank a field
  // just because it used a word we had not thought of.
  assert.equal(cleanDepartment('Weird Team'), 'Weird Team');
  assert.equal(cleanDepartment('  Purchasing  '), 'PROCUREMENT');
  assert.equal(cleanDepartment('CORPORATE'), 'CORPORATE');
  assert.equal(cleanDepartment('   '), null);
  assert.equal(cleanDepartment(null), null);
  assert.equal(cleanDepartment(undefined), null);
});

test('the dropdown keeps whatever this person already holds', () => {
  const fresh = departmentOptions('');
  assert.equal(fresh.length, 9);          // blank + eight
  assert.equal(fresh[0].value, '');

  const legacy = departmentOptions('FINANCE');
  assert.equal(legacy.length, 10);
  assert.equal(legacy[legacy.length - 1].value, 'FINANCE');
  assert.equal(legacy[legacy.length - 1].label, 'Finance');

  const odd = departmentOptions('Weird Team');
  assert.equal(odd[odd.length - 1].value, 'Weird Team');
  assert.equal(odd[odd.length - 1].label, 'Weird Team (old)');

  const normal = departmentOptions('DESIGN');
  assert.equal(normal.length, 9);         // nothing extra appended
});

// ── 3. The two department questions stay apart ───────────────────────────────
test('a CRM person’s department is not an ILC staff department', () => {
  const staff = STAFF_DEPARTMENTS.map(d => d.key ?? d);
  assert.equal(staff.includes('SALES_MARKETING'), true);
  assert.equal(CONTACT_DEPARTMENT_KEYS.includes('SALES_MARKETING'), false);
  assert.equal(staff.includes('ARCHITECT'), false);
});
