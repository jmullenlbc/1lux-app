// Who can change what, the one table (Mike, 2026-09-14, "Option B").
//
// Everyone on staff sees and edits almost everything; only the rows below are
// locked. Admins (Super Admin, Company Admin) can do all of them, and anyone in
// the Operations department counts as a Company Admin (Mike: "Like an admin.
// The CEO or COO would be in operations.", and yes, that includes adding and
// turning off users). Contractors (Client Viewers) can do none of them,
// whatever departments they carry.
//
// Open to all staff on purpose, so NOT in this table: budgets, the design bid
// matrix, code check, client standards and playbook, job meeting notes, the job
// team. Sales automations stay on the Sales Admin key (requireSalesAdmin) and
// the web request queue on Sales + marketing (requireIntakeReviewer).
//
// Before this file each screen typed out its own list of role names; half of
// them only knew the old ILC_ADMIN spelling, so a Super Admin was turned away.
//
// No `@/` imports and no server-only code, so screens and tests load it directly.
import { normalizeRole } from './roles.js';
import { hasDepartment, DEPARTMENT_LABEL } from './departments.js';

export const OPERATIONS = 'OPERATIONS';

export const ACTIONS = {
  editMasterPricing: {
    does: 'change the master pricing sheet',
    departments: ['PRECONSTRUCTION'],
  },
  editJobMoney: {
    does: 'change contract values or change orders',
    departments: ['CONSTRUCTION', 'OPERATIONS', 'FINANCE'],
  },
  editProducts: {
    does: 'change products, manufacturers or the fixture library',
    departments: ['PRECONSTRUCTION', 'DESIGN', 'CONSTRUCTION'],
  },
  manageUsers: {
    does: 'add, change or turn off users',
    departments: [],
  },
};

// The role someone acts with. A plain User in Operations acts as a Company
// Admin; everyone else keeps their own role.
export function effectiveRole(user) {
  const role = normalizeRole(user?.role);
  if (role === 'USER' && hasDepartment(user, OPERATIONS)) return 'COMPANY_ADMIN';
  return role;
}

export function actsAsAdmin(user) {
  const role = effectiveRole(user);
  return role === 'SUPER_ADMIN' || role === 'COMPANY_ADMIN';
}

export function can(user, action) {
  const rule = ACTIONS[action];
  if (!rule) throw new Error(`Unknown permission: ${action}`);
  if (!user || normalizeRole(user.role) === 'CLIENT_VIEWER') return false;
  if (actsAsAdmin(user)) return true;
  return rule.departments.some(d => hasDepartment(user, d));
}

// "Only Pre-construction, Operations or an admin can change the master pricing sheet."
export function deniedMessage(action) {
  const rule = ACTIONS[action];
  const who = [...new Set([...rule.departments, OPERATIONS])].map(d => DEPARTMENT_LABEL[d]);
  who.push('an admin');
  const list = who.length > 1 ? `${who.slice(0, -1).join(', ')} or ${who.at(-1)}` : who[0];
  return `Only ${list} can ${rule.does}.`;
}
