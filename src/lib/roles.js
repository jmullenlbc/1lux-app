// The one list of login types ("roles"). Before this file the same names were
// typed out by hand all over the app, and the admin "edit user" screen would
// store any text it was sent — a typo became a role nobody could match.
//
// No `@/` imports here so the tests can load this file directly.

export const ROLES = [
  { key: 'SUPER_ADMIN',   label: 'Super Admin' },
  { key: 'COMPANY_ADMIN', label: 'Company Admin' },
  // Mike 10-9: a Sales Admin runs the sales team (applies Market Intel rules,
  // sales automation); a Sales login is a salesperson. Both count as the
  // sales team without a department entry.
  { key: 'SALES_ADMIN',   label: 'Sales Admin' },
  { key: 'SALES',         label: 'Sales' },
  { key: 'USER',          label: 'User' },
  { key: 'CLIENT_VIEWER', label: 'Client Viewer' },
];

export const ROLE_KEYS = ROLES.map(r => r.key);

// Older names still sitting on some accounts. They mean the same thing.
const LEGACY = { ILC_ADMIN: 'SUPER_ADMIN', ADMIN: 'COMPANY_ADMIN' };

export const ROLE_LABEL = {
  ...Object.fromEntries(ROLES.map(r => [r.key, r.label])),
  ILC_ADMIN: 'Super Admin',
  ADMIN:     'Company Admin',
};

export function normalizeRole(role) {
  return LEGACY[role] || role;
}

// Only the current names can be saved. The legacy names are read, never written.
export function isValidRole(role) {
  return ROLE_KEYS.includes(role);
}

// Who may hand out which role. Mike, 2026-09-14: a Company Admin can make
// someone an admin. Only a Super Admin can make another Super Admin.
export function canAssignRole(actorRole, newRole) {
  if (!isValidRole(newRole)) return false;
  const actor = normalizeRole(actorRole);
  if (actor === 'SUPER_ADMIN')   return true;
  if (actor === 'COMPANY_ADMIN') return newRole !== 'SUPER_ADMIN';
  return false;
}

// Who may change or turn off an existing account. Nobody but a Super Admin
// touches a Super Admin's account.
export function canManageAccount(actorRole, targetRole) {
  const actor  = normalizeRole(actorRole);
  const target = normalizeRole(targetRole);
  if (actor === 'SUPER_ADMIN')   return true;
  if (actor === 'COMPANY_ADMIN') return target !== 'SUPER_ADMIN';
  return false;
}
