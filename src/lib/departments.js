// The seven departments a person can belong to — as many as apply (Mike,
// 2026-09-12: "We need to start with departments for every use. ... It should
// be a multi select."). This is the first step of the permissions work: later
// checks ask "is this person in department X", never a role name.
//
// Stored one row per person per department (UserDepartment, migration 0079).
// It replaces the one-per-person User.division and the JSON User.deptRoles,
// which stay in the database but are no longer read.
//
// No `@/` imports here so the tests can load this file directly.

export const DEPARTMENTS = [
  { key: 'SALES_MARKETING',    label: 'Sales + marketing' },
  { key: 'OPERATIONS',         label: 'Operations' },
  { key: 'PRECONSTRUCTION',    label: 'Pre-construction' },
  { key: 'CONSTRUCTION',       label: 'Construction' },
  { key: 'PROJECT_MANAGEMENT', label: 'Project management' },
  { key: 'DESIGN',             label: 'Design' },
  { key: 'FINANCE',            label: 'Finance' },
];

export const DEPARTMENT_KEYS  = DEPARTMENTS.map(d => d.key);
export const DEPARTMENT_LABEL = Object.fromEntries(DEPARTMENTS.map(d => [d.key, d.label]));

// Sales + marketing owns the web budget request queue and the Sales Owner
// dropdowns.
export const SALES_MARKETING = 'SALES_MARKETING';

// A list from a form, cleaned: known keys only, each once, in the order above.
// Returns null when it isn't a list at all, so a route can tell "clear them
// all" ([]) apart from "bad request".
export function cleanDepartments(list) {
  if (!Array.isArray(list)) return null;
  const picked = new Set(list);
  return DEPARTMENT_KEYS.filter(k => picked.has(k));
}

// The keys on a user loaded with `departments: { select: { department: true } }`.
// Also accepts a plain list of keys, which is what the API hands the browser.
export function departmentKeys(user) {
  const rows = user?.departments;
  if (!Array.isArray(rows)) return [];
  return cleanDepartments(rows.map(r => (typeof r === 'string' ? r : r?.department)));
}

export function hasDepartment(user, key) {
  return departmentKeys(user).includes(key);
}

// Prisma where-clause: users in this department.
export function inDepartment(key) {
  return { departments: { some: { department: key } } };
}

// Prisma select fragment for loading a user's departments.
export const DEPARTMENTS_SELECT = Object.freeze({ select: { department: true } });
