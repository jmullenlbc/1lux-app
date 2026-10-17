// Access history (migration 0086, 2026-09-15). One row per change to someone's
// access: account created, name, role, turned off / back on, a department added
// or removed, an extra permission switched, a password reset by an admin, the
// "must change password" box. Written by the two admin user routes inside the
// same transaction as the change itself, so a change can't land unlogged.
//
// Structured rows, never a blob: `kind` says what moved, `field` names the
// permission for PERMISSION rows, `fromValue` / `toValue` are plain text. A
// department added is (null → key); removed is (key → null). Never deleted.
//
// A password is never written here in any form, a reset row carries no values.
//
// No `@/` imports here so the tests can load this file directly.
import { DEPARTMENT_LABEL } from './departments.js';

export const ACCESS_KINDS = [
  'CREATED', 'NAME', 'ROLE', 'ACTIVE', 'DEPARTMENT', 'PERMISSION', 'PASSWORD_RESET', 'MUST_CHANGE_PASSWORD',
  // A Client Viewer handed one specific job, or had it taken back. `field` is
  // the job id; the value side carries the job's name as it read that day, so
  // the line still means something after the job is renamed or archived.
  'PROJECT_ACCESS',
];

const ROLE_LABEL = {
  SUPER_ADMIN: 'Super Admin', ILC_ADMIN: 'Super Admin',
  COMPANY_ADMIN: 'Company Admin', ADMIN: 'Company Admin',
  SALES_ADMIN: 'Sales Admin', SALES: 'Sales',
  USER: 'User', CLIENT_VIEWER: 'Client Viewer',
};

const PERMISSION_LABEL = {
  knowledgeBase:   'Knowledge Base Editor',
  clientStandards: 'Client Standards Editor',
  salesAdmin:      'Sales Admin',
};

function parsePermissions(p) {
  if (p && typeof p === 'object') return p;
  try { return JSON.parse(p || '{}') || {}; } catch { return {}; }
}

// true / false / missing read as on / off, so a box that was never ticked and
// one that was unticked count as the same thing.
const flag = v => (v === true ? 'on' : v === false || v == null ? 'off' : String(v));
const text = v => (v == null || v === '' ? null : String(v));

// What changed between the saved account (`before`) and what an admin sent
// (`after`). A field left out of `after` (undefined) was not sent and is not a
// change. `after.passwordReset` is true when a new password was set.
//
// Permissions: only the keys the admin actually sent are compared. The Edit
// window sends just the three extra-permission boxes, and older accounts also
// carry left-over keys from when they were created; those would otherwise log
// a false "removed" on every save.
export function accessChanges(before, after) {
  const rows = [];
  const add = (kind, fromValue, toValue, field = null) => rows.push({ kind, field, fromValue, toValue });

  if (after.name !== undefined && text(after.name) !== text(before.name)) {
    add('NAME', text(before.name), text(after.name));
  }
  if (after.role !== undefined && after.role !== before.role) {
    add('ROLE', before.role ?? null, after.role);
  }
  if (after.isActive !== undefined && Boolean(after.isActive) !== (before.isActive !== false)) {
    add('ACTIVE', flag(before.isActive !== false), flag(Boolean(after.isActive)));
  }
  if (after.mustChangePassword !== undefined && Boolean(after.mustChangePassword) !== Boolean(before.mustChangePassword)) {
    add('MUST_CHANGE_PASSWORD', flag(Boolean(before.mustChangePassword)), flag(Boolean(after.mustChangePassword)));
  }
  if (after.departments !== undefined) {
    const was = before.departments || [];
    for (const key of after.departments) if (!was.includes(key)) add('DEPARTMENT', null, key);
    for (const key of was) if (!after.departments.includes(key)) add('DEPARTMENT', key, null);
  }
  if (after.permissions !== undefined) {
    const was = parsePermissions(before.permissions);
    const now = parsePermissions(after.permissions);
    for (const key of Object.keys(now).sort()) {
      if (flag(was[key]) !== flag(now[key])) add('PERMISSION', flag(was[key]), flag(now[key]), key);
    }
  }
  if (after.passwordReset) add('PASSWORD_RESET', null, null);
  return rows;
}

// The rows for a brand-new account: created as a role, plus one row per
// department it starts in.
export function creationEvents({ role, departments = [] }) {
  return [
    { kind: 'CREATED', field: null, fromValue: null, toValue: role },
    ...departments.map(key => ({ kind: 'DEPARTMENT', field: null, fromValue: null, toValue: key })),
  ];
}

const role = r => ROLE_LABEL[r] || r || 'no role';
const dept = d => DEPARTMENT_LABEL[d] || d;

// One plain-English line for the history list on the Users screen.
export function describeAccessEvent(ev) {
  switch (ev.kind) {
    case 'CREATED':    return `Account created as ${role(ev.toValue)}`;
    case 'NAME':       return `Name changed from ${ev.fromValue ? `"${ev.fromValue}"` : 'blank'} to ${ev.toValue ? `"${ev.toValue}"` : 'blank'}`;
    case 'ROLE':       return `Role changed from ${role(ev.fromValue)} to ${role(ev.toValue)}`;
    case 'ACTIVE':     return ev.toValue === 'on' ? 'Turned back on' : 'Turned off (signed out, cannot sign in)';
    case 'DEPARTMENT': return ev.toValue ? `Added to ${dept(ev.toValue)}` : `Removed from ${dept(ev.fromValue)}`;
    case 'PERMISSION': {
      const label = PERMISSION_LABEL[ev.field] || ev.field;
      if (ev.toValue === 'on' || ev.toValue === 'off') return `${label} turned ${ev.toValue}`;
      return `${label} changed from ${ev.fromValue} to ${ev.toValue}`;
    }
    case 'PROJECT_ACCESS': return ev.toValue
      ? `Given access to ${ev.toValue}`
      : `Access removed from ${ev.fromValue || 'a job'}`;
    case 'PASSWORD_RESET':       return 'Password reset by an admin';
    case 'MUST_CHANGE_PASSWORD': return ev.toValue === 'on'
      ? 'Must set a new password at next sign-in'
      : 'No longer has to change password at next sign-in';
    default: return ev.kind;
  }
}
