// Department-shaped screens.
//
// The privileges plan asked for two things in one sentence: "their menu section
// opens first, and dropdowns like 'Project Manager' list only people from that
// department."
//
// Both are conveniences, not security. Nothing here hides a screen or blocks a
// save, who may do what still lives in src/lib/permissions.js. This file only
// decides what a person sees FIRST, so the app opens on their own work instead
// of somebody else's.
//
// Two rules make that safe:
//   1. A person with no departments recorded keeps exactly what they had before
//      (Home and the CRM open). Nobody is worse off for an unfilled field.
//   2. A person with no departments recorded still appears in every people
//      picker, under "Everyone else". A half-filled department list must never
//      make somebody disappear from a dropdown.
//
// No `@/` imports here so the tests can load this file directly.

import { departmentKeys } from './departments.js';
import { normalizeRole } from './roles.js';

// Which departments own each collapsible section of the sidebar. An empty list
// means the section is not owned by anybody in particular.
export const SECTION_DEPARTMENTS = {
  home:     [],
  crm:      ['SALES_MARKETING'],
  precon:   ['PRECONSTRUCTION', 'DESIGN', 'CONSTRUCTION'],
  software: [],
};

// Which sidebar sections start open for this person.
// Home is always open, it is where the projects live.
export function openSectionsFor(user) {
  const mine = departmentKeys(user);

  // Rule 1: nothing recorded, nothing changes.
  if (!mine.length) return { home: true, crm: true, precon: false, software: false };

  const owns = section => SECTION_DEPARTMENTS[section].some(d => mine.includes(d));
  return {
    home:     true,
    crm:      owns('crm'),
    precon:   owns('precon'),
    software: false,
  };
}

// The phone bottom bar (Mike 10-31). Shortcuts like the rest of this file: a tab
// never opens or closes a screen, and Menu still reaches everything.
export const PHONE_TABS = {
  desk:            { key: 'desk',            label: 'Desk',         href: '/sales/desk',        match: p => p.startsWith('/sales/desk') },
  notes:           { key: 'notes',           label: 'Notes',        href: '/crm/notes',         match: p => p.startsWith('/crm/notes') },
  people:          { key: 'people',          label: 'People',       href: '/crm/contacts',      match: p => p.startsWith('/clients') || p.startsWith('/crm/contacts') },
  marketIntel:     { key: 'marketIntel',     label: 'Market Intel', href: '/market-intel',      match: p => p.startsWith('/market-intel') },
  preconDashboard: { key: 'preconDashboard', label: 'Pre-Con',      href: '/dashboards/budget', match: p => p.startsWith('/dashboards/budget') },
  budgets:         { key: 'budgets',         label: 'Budgets',      href: '/pre-con',           match: (p, q) => p.startsWith('/pre-con') && q?.get('tab') !== 'rfqs' },
  rfqs:            { key: 'rfqs',            label: 'RFQs',         href: '/pre-con?tab=rfqs',  match: (p, q) => p.startsWith('/pre-con') && q?.get('tab') === 'rfqs' },
  myJobs:          { key: 'myJobs',          label: 'My Jobs',      href: '/my-jobs',           match: p => p.startsWith('/my-jobs') },
  projects:        { key: 'projects',        label: 'Projects',     href: '/dashboard',         match: p => p === '/dashboard' || p.startsWith('/project/') },
  shipSchedules:   { key: 'shipSchedules',   label: 'Shipping',     href: '/ship-schedules',    match: p => p.startsWith('/ship-schedules') },
  mainDashboard:   { key: 'mainDashboard',   label: 'Dashboard',    href: '/dashboards/main',   match: p => p.startsWith('/dashboards/main') },
  salesDashboard:  { key: 'salesDashboard',  label: 'Sales',        href: '/dashboards/sales',  match: p => p.startsWith('/dashboards/sales') },
  search:          { key: 'search',          label: 'Search',       href: '/search',            match: p => p.startsWith('/search') },
};

// Somebody in two departments gets the first of these (Mike 10-31).
export const PHONE_ORDER = ['SALES_MARKETING', 'PRECONSTRUCTION', 'CONSTRUCTION', 'DESIGN', 'FINANCE', 'OPERATIONS'];

const OFFICE_TABS = ['mainDashboard', 'projects', 'salesDashboard'];
const PHONE_SETS = {
  SALES_MARKETING: ['desk', 'notes', 'marketIntel'],
  PRECONSTRUCTION: ['preconDashboard', 'budgets', 'rfqs'],
  CONSTRUCTION:    ['myJobs', 'projects', 'shipSchedules'],
  DESIGN:          ['projects', 'budgets'],
  FINANCE:         OFFICE_TABS,
  OPERATIONS:      OFFICE_TABS,
};
const NO_DEPARTMENT_TABS = ['desk', 'notes', 'people'];

// This person's tabs, left to right. Search is always last, the bar adds Menu.
export function phoneTabsFor(user) {
  const role = normalizeRole(user?.role);
  // Client viewers have no CRM, and Search refuses them.
  if (role === 'CLIENT_VIEWER') return [PHONE_TABS.projects];

  const mine = new Set(departmentKeys(user));
  // The Sales roles are sales team with or without a department entry.
  if (role === 'SALES' || role === 'SALES_ADMIN') mine.add('SALES_MARKETING');
  const first = PHONE_ORDER.find(d => mine.has(d));

  // Rule 1: nothing recorded, nothing changes. Admins get the office set.
  const admin = role === 'SUPER_ADMIN' || role === 'COMPANY_ADMIN';
  const set = first ? PHONE_SETS[first] : admin ? OFFICE_TABS : NO_DEPARTMENT_TABS;
  return [...set, 'search'].map(k => PHONE_TABS[k]);
}

// Which departments each people-dropdown is really asking about. The key is the
// field being filled in, not the screen it sits on, so the same answer holds
// wherever that field appears.
export const PICKER_DEPARTMENTS = {
  salesOwner:      ['SALES_MARKETING'],
  preconManager:   ['PRECONSTRUCTION'],
  projectManager:  ['CONSTRUCTION'],
  projectAssignee: ['PRECONSTRUCTION', 'DESIGN', 'CONSTRUCTION'],
  qcAssignee:      ['PRECONSTRUCTION', 'DESIGN'],
  rfiAssignee:     ['PRECONSTRUCTION', 'DESIGN', 'CONSTRUCTION'],
};

// Split a list of people into the ones this dropdown is about and everyone
// else. Both lists keep the order they came in.
//
// `picker` is a key of PICKER_DEPARTMENTS, or a list of department keys. An
// unknown key means "no opinion", everybody comes back as a match, which is
// the same list the dropdown showed before.
export function splitByDepartment(users, picker) {
  const wanted = Array.isArray(picker) ? picker : PICKER_DEPARTMENTS[picker];
  const list   = Array.isArray(users) ? users : [];
  if (!wanted || !wanted.length) return { theirs: list, others: [] };

  const theirs = [];
  const others = [];
  for (const u of list) {
    // Rule 2: no departments recorded lands in "Everyone else", never dropped.
    (departmentKeys(u).some(d => wanted.includes(d)) ? theirs : others).push(u);
  }
  return { theirs, others };
}

// The line above the short list, e.g. "Pre-construction, Design". Used as a
// heading so it is obvious why the list is short.
export function pickerDepartmentLabel(picker, labels) {
  const wanted = Array.isArray(picker) ? picker : PICKER_DEPARTMENTS[picker];
  if (!wanted || !wanted.length) return '';
  return wanted.map(k => labels?.[k] || k).join(', ');
}
