// Department-shaped screens.
//
// The privileges plan asked for two things in one sentence: "their menu section
// opens first, and dropdowns like 'Project Manager' list only people from that
// department."
//
// Both are conveniences, not security. Nothing here hides a screen or blocks a
// save — who may do what still lives in src/lib/permissions.js. This file only
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

// Which departments own each collapsible section of the sidebar. An empty list
// means the section is not owned by anybody in particular.
export const SECTION_DEPARTMENTS = {
  home:     [],
  crm:      ['SALES_MARKETING'],
  precon:   ['PRECONSTRUCTION', 'DESIGN', 'CONSTRUCTION'],
  software: [],
};

// Which sidebar sections start open for this person.
// Home is always open — it is where the projects live.
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
// unknown key means "no opinion" — everybody comes back as a match, which is
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
