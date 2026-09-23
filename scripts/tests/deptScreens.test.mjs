// The department-shaped screens. Two rules matter more than the shaping itself:
// somebody with no departments recorded keeps the old sidebar, and somebody
// with no departments recorded still appears in every picker.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openSectionsFor, splitByDepartment, PICKER_DEPARTMENTS } from '../../src/lib/deptScreens.js';

const withDepts = keys => ({ departments: keys });

test('no departments recorded keeps the sidebar everyone had before', () => {
  for (const u of [withDepts([]), {}, null, { departments: null }]) {
    assert.deepEqual(openSectionsFor(u), { home: true, crm: true, precon: false, software: false });
  }
});

test('sales opens the CRM, pre-con opens Pre-con', () => {
  const sales = openSectionsFor(withDepts(['SALES_MARKETING']));
  assert.equal(sales.crm, true);
  assert.equal(sales.precon, false);

  const precon = openSectionsFor(withDepts(['PRECONSTRUCTION']));
  assert.equal(precon.precon, true);
  assert.equal(precon.crm, false);

  const both = openSectionsFor(withDepts(['SALES_MARKETING', 'DESIGN']));
  assert.equal(both.crm, true);
  assert.equal(both.precon, true);
});

test('home is always open and software never opens by department', () => {
  for (const keys of [[], ['SALES_MARKETING'], ['FINANCE'], ['OPERATIONS']]) {
    const open = openSectionsFor(withDepts(keys));
    assert.equal(open.home, true);
    assert.equal(open.software, false);
  }
});

test('a picker never loses anybody', () => {
  const users = [
    { id: 'a', departments: ['PRECONSTRUCTION'] },
    { id: 'b', departments: ['SALES_MARKETING'] },
    { id: 'c', departments: [] },
    { id: 'd' },
  ];
  for (const picker of Object.keys(PICKER_DEPARTMENTS)) {
    const { theirs, others } = splitByDepartment(users, picker);
    assert.equal(theirs.length + others.length, users.length, picker);
  }
});

test('somebody with no departments lands under everyone else, never in the short list', () => {
  const users = [{ id: 'a', departments: ['PRECONSTRUCTION'] }, { id: 'c', departments: [] }];
  const { theirs, others } = splitByDepartment(users, 'qcAssignee');
  assert.deepEqual(theirs.map(u => u.id), ['a']);
  assert.deepEqual(others.map(u => u.id), ['c']);
});

test('an unknown picker shows the same list it showed before', () => {
  const users = [{ id: 'a', departments: [] }, { id: 'b', departments: ['DESIGN'] }];
  const { theirs, others } = splitByDepartment(users, 'nobodyHasThisField');
  assert.equal(theirs.length, 2);
  assert.equal(others.length, 0);
});
