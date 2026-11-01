// The department-shaped screens. Two rules matter more than the shaping itself:
// somebody with no departments recorded keeps the old sidebar, and somebody
// with no departments recorded still appears in every picker.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openSectionsFor, splitByDepartment, PICKER_DEPARTMENTS, phoneTabsFor, PHONE_TABS } from '../../src/lib/deptScreens.js';

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

const tabs = u => phoneTabsFor(u).map(t => t.label);

test('each department gets its own phone tabs, Search last', () => {
  assert.deepEqual(tabs(withDepts(['SALES_MARKETING'])), ['Desk', 'Notes', 'Market Intel', 'Search']);
  assert.deepEqual(tabs(withDepts(['PRECONSTRUCTION'])), ['Pre-Con', 'Budgets', 'RFQs', 'Search']);
  assert.deepEqual(tabs(withDepts(['CONSTRUCTION'])), ['My Jobs', 'Projects', 'Shipping', 'Search']);
  assert.deepEqual(tabs(withDepts(['DESIGN'])), ['Projects', 'Budgets', 'Search']);
  assert.deepEqual(tabs(withDepts(['FINANCE'])), ['Dashboard', 'Projects', 'Sales', 'Search']);
  assert.deepEqual(tabs(withDepts(['OPERATIONS'])), ['Dashboard', 'Projects', 'Sales', 'Search']);
});

test('two departments take the first in the fixed order, not the list order', () => {
  assert.deepEqual(tabs(withDepts(['OPERATIONS', 'CONSTRUCTION'])), tabs(withDepts(['CONSTRUCTION'])));
  assert.deepEqual(tabs(withDepts(['DESIGN', 'PRECONSTRUCTION'])), tabs(withDepts(['PRECONSTRUCTION'])));
  assert.deepEqual(tabs(withDepts(['FINANCE', 'SALES_MARKETING'])), tabs(withDepts(['SALES_MARKETING'])));
});

test('no department keeps the old tabs, except admins and the Sales roles', () => {
  for (const u of [withDepts([]), {}, null, { role: 'USER' }]) {
    assert.deepEqual(tabs(u), ['Desk', 'Notes', 'People', 'Search']);
  }
  for (const role of ['SUPER_ADMIN', 'COMPANY_ADMIN', 'ILC_ADMIN', 'ADMIN']) {
    assert.deepEqual(tabs({ role }), tabs(withDepts(['FINANCE'])), role);
  }
  for (const role of ['SALES', 'SALES_ADMIN']) {
    assert.deepEqual(tabs({ role }), tabs(withDepts(['SALES_MARKETING'])), role);
    assert.deepEqual(tabs({ role, departments: ['CONSTRUCTION'] }), tabs(withDepts(['SALES_MARKETING'])), role);
  }
});

test('a recorded department beats the admin set', () => {
  assert.deepEqual(tabs({ role: 'SUPER_ADMIN', departments: ['PRECONSTRUCTION'] }), tabs(withDepts(['PRECONSTRUCTION'])));
});

test('client viewers get Projects only, whatever is on the account', () => {
  assert.deepEqual(tabs({ role: 'CLIENT_VIEWER', departments: ['SALES_MARKETING'] }), ['Projects']);
});

test('the two Pre-Con list tabs never both light up, and a dashboard is not the Projects tab', () => {
  const { budgets, rfqs, projects } = PHONE_TABS;
  const q = s => new URLSearchParams(s);
  assert.equal(budgets.match('/pre-con', q('')), true);
  assert.equal(rfqs.match('/pre-con', q('')), false);
  assert.equal(budgets.match('/pre-con', q('tab=rfqs')), false);
  assert.equal(rfqs.match('/pre-con', q('tab=rfqs')), true);
  assert.equal(projects.match('/dashboards/main'), false);
  assert.equal(projects.match('/project/abc'), true);
});
