// Admin and user privileges, step 1: the six bugs found 2026-09-14.
//
// 1. A turned-off account kept working for up to 7 days, and a role change waited
//    for the next sign-in — the login pass was trusted without reading the account.
// 2. The Profile screen saved notification choices to a column that didn't exist.
// 3. Change-order and ship-schedule emails called sendNotification() the wrong way.
// 4. The playbook (and client standards, and five more routes) crashed on every
//    call: a handler named its argument `req` and then read `request`.
// 5. The company page read permissions off the login pass, which never had them.
// 6. The admin "edit user" screen saved any role text it was sent.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ROLE_KEYS, isValidRole, normalizeRole, canAssignRole, canManageAccount,
} from '../../src/lib/roles.js';
import {
  ACTIONS, effectiveRole, actsAsAdmin, can, deniedMessage,
} from '../../src/lib/permissions.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const read = rel => readFileSync(join(ROOT, rel), 'utf8');

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(js|jsx)$/.test(name)) out.push(full);
  }
  return out;
}

// ── 1. The live account ──────────────────────────────────────────────────────

test('every login check reads the live account, not just the pass', () => {
  const src = read('src/lib/auth.js');
  assert.match(src, /async function liveUser\(payload\)/);
  assert.match(src, /account\.isActive === false\) return null/);
  // Both doors go through it.
  assert.match(src, /export async function getSession\(\)[\s\S]*?liveUser\(/);
  assert.match(src, /export async function requireAuth\(request\)[\s\S]*?liveUser\(/);
  // The role, permissions and departments come from the account.
  assert.match(src, /role:\s+account\.role/);
  assert.match(src, /permissions:\s+account\.permissions/);
  assert.match(src, /departments:\s+departmentKeys\(account\)/);
});

// ── 2. The missing column ────────────────────────────────────────────────────

test('User has the notificationPrefs column the Profile screen saves to', () => {
  const schema = read('prisma/schema.prisma');
  const user = schema.match(/model User \{[\s\S]*?\n\}/)[0];
  assert.match(user, /\n\s+notificationPrefs\s+String\?/);
  const sql = read('prisma/migrations/0084_user_notification_prefs/migration.sql');
  assert.match(sql, /ALTER TABLE "User" ADD COLUMN "notificationPrefs" TEXT;/);
  assert.doesNotMatch(sql, /DROP/i);
});

// ── 3. Emails sent the right way ─────────────────────────────────────────────

test('nothing calls sendNotification() with an email object', () => {
  const bad = walk(join(ROOT, 'src'))
    .filter(f => /sendNotification\(\s*\{/.test(readFileSync(f, 'utf8')))
    .map(f => f.slice(ROOT.length));
  assert.deepEqual(bad, []);
});

// ── 4. Handlers that read a name they never defined ─────────────────────────

// Both directions: handed `req` but reads `request.json()`, or handed `request`
// but reads `req.url`. Only real uses count — the word inside a comment or a
// message ("release request") is fine.
test('no route handler reads the request under a name it was never given', () => {
  const USE = '(json|url|headers|formData|text|nextUrl|cookies|method|body|signal)';
  const bad = [];
  for (const f of walk(join(ROOT, 'src/app')).filter(f => /route\.js$/.test(f))) {
    const src = readFileSync(f, 'utf8').replace(/\/\/.*$/gm, '');
    for (const [body, fn, arg] of src.matchAll(/export\s+async\s+function\s+(\w+)\s*\(\s*([\w$]*)[\s\S]*?(?=\nexport\s|$)/g)) {
      for (const name of ['req', 'request']) {
        if (name === arg) continue;
        const inner = body.slice(body.indexOf('{'));
        if (new RegExp(`(const|let|var)\\s+${name}\\b|\\b${name}\\s*=>`).test(inner)) continue;
        if (new RegExp(`\\b${name}\\.${USE}\\b|(requireAuth|requireAdmin|getSession)\\(\\s*${name}\\s*\\)`).test(inner)) {
          bad.push(`${f.slice(ROOT.length)} ${fn}(${arg}) reads ${name}`);
        }
      }
    }
  }
  assert.deepEqual(bad, []);
});

test('the playbook route only uses names it defines', () => {
  const src = read('src/app/api/clients/[id]/playbook/route.js');
  assert.doesNotMatch(src.replace(/\/\/.*$/gm, ''), /\bsession\b/);
  assert.match(src, /canSeeAllData\(user\)/);
});

test('client standards — answers, pictures, fixtures, product options — are open to all staff', () => {
  for (const rel of [
    'src/app/api/clients/[id]/standards/concepts/route.js',
    'src/app/api/clients/[id]/standard-fixtures/route.js',
    'src/app/api/clients/[id]/product-options/route.js',
  ]) {
    const src = read(rel);
    // `clients: true` was never saved by the Users screen, so this let nobody
    // but a Super Admin in.
    assert.doesNotMatch(src, /perms\(|isAdmin\(/, rel);
    assert.equal(src.match(/if \(!staff\(s\)\) return/g)?.length, 4, rel);
    assert.match(src, /const staff = s => canSeeAllData\(s\)/, rel);
  }
  const standards = read('src/app/api/clients/[id]/standards/route.js');
  assert.equal(standards.match(/if \(!canSeeAllData\(user\)\) return/g)?.length, 2);
  const preview = read('src/app/api/link-preview/route.js');
  assert.match(preview, /export async function POST\(req\)/);
  assert.match(preview, /if \(!canSeeAllData\(user\)\) return/);
});

// ── 5. Company page ──────────────────────────────────────────────────────────

test('company page no longer reads permissions off the login pass', () => {
  const src = read('src/app/(app)/clients/[id]/page.jsx');
  assert.doesNotMatch(src, /session\.permissions/);
  assert.match(src, /canEditStandards = canSeeAllData\(session\)/);
});

// ── 6. One list of roles ─────────────────────────────────────────────────────

test('only the four real role names can be saved', () => {
  assert.deepEqual(ROLE_KEYS, ['SUPER_ADMIN', 'COMPANY_ADMIN', 'USER', 'CLIENT_VIEWER']);
  for (const r of ROLE_KEYS) assert.ok(isValidRole(r));
  for (const r of ['ADMIN', 'ILC_ADMIN', 'super_admin', 'SUPERADMIN', '', null, undefined]) {
    assert.equal(isValidRole(r), false, String(r));
  }
  assert.equal(normalizeRole('ILC_ADMIN'), 'SUPER_ADMIN');
  assert.equal(normalizeRole('ADMIN'), 'COMPANY_ADMIN');
});

test('a Company Admin can make an admin, never a Super Admin', () => {
  for (const actor of ['COMPANY_ADMIN', 'ADMIN']) {
    assert.ok(canAssignRole(actor, 'COMPANY_ADMIN'));
    assert.ok(canAssignRole(actor, 'USER'));
    assert.ok(canAssignRole(actor, 'CLIENT_VIEWER'));
    assert.equal(canAssignRole(actor, 'SUPER_ADMIN'), false);
  }
  for (const actor of ['SUPER_ADMIN', 'ILC_ADMIN']) {
    for (const r of ROLE_KEYS) assert.ok(canAssignRole(actor, r));
  }
  for (const actor of ['USER', 'CLIENT_VIEWER', undefined]) {
    for (const r of ROLE_KEYS) assert.equal(canAssignRole(actor, r), false);
  }
  assert.equal(canAssignRole('SUPER_ADMIN', 'TYPO'), false);
});

test('nobody but a Super Admin touches a Super Admin account', () => {
  assert.equal(canManageAccount('COMPANY_ADMIN', 'SUPER_ADMIN'), false);
  assert.equal(canManageAccount('COMPANY_ADMIN', 'ILC_ADMIN'), false);
  assert.ok(canManageAccount('COMPANY_ADMIN', 'COMPANY_ADMIN'));
  assert.ok(canManageAccount('COMPANY_ADMIN', 'USER'));
  assert.ok(canManageAccount('SUPER_ADMIN', 'SUPER_ADMIN'));
  assert.equal(canManageAccount('USER', 'USER'), false);
});

test('both admin user routes check roles against the one list', () => {
  for (const rel of ['src/app/api/admin/users/route.js', 'src/app/api/admin/users/[id]/route.js']) {
    const src = read(rel);
    assert.match(src, /from '@\/lib\/roles'/, rel);
    assert.match(src, /isValidRole\(role\)/, rel);
    // effectiveRole: someone in Operations acts as a Company Admin.
    assert.match(src, /canAssignRole\(effectiveRole\(actor\), role\)/, rel);
    assert.doesNotMatch(src, /canAssignRole\(actor\.role/, rel);
  }
  assert.match(read('src/app/api/admin/invite/route.js'), /status: 410/);
});

// ── Step 3: who can change what (src/lib/permissions.js, Mike 2026-09-14) ────

const staff = (role, ...departments) => ({ id: 'u', role, departments });

test('Operations acts as a Company Admin, including users', () => {
  const ops = staff('USER', 'OPERATIONS');
  assert.equal(effectiveRole(ops), 'COMPANY_ADMIN');
  assert.ok(actsAsAdmin(ops));
  for (const a of Object.keys(ACTIONS)) assert.ok(can(ops, a), a);
  // Operations never lifts anyone to Super Admin.
  assert.equal(canAssignRole(effectiveRole(ops), 'SUPER_ADMIN'), false);
  // A Client Viewer tagged Operations is still a Client Viewer.
  const cv = staff('CLIENT_VIEWER', 'OPERATIONS');
  assert.equal(actsAsAdmin(cv), false);
  for (const a of Object.keys(ACTIONS)) assert.equal(can(cv, a), false, a);
});

test('the locked areas follow the departments Mike named', () => {
  const expect = {
    editMasterPricing: ['PRECONSTRUCTION'],
    editJobMoney:      ['CONSTRUCTION', 'FINANCE'],
    editProducts:      ['PRECONSTRUCTION', 'DESIGN', 'CONSTRUCTION'],
    manageUsers:       [],
  };
  const all = ['PRECONSTRUCTION', 'DESIGN', 'CONSTRUCTION', 'FINANCE', 'SALES_MARKETING'];
  for (const [action, allowed] of Object.entries(expect)) {
    for (const d of all) assert.equal(can(staff('USER', d), action), allowed.includes(d), `${d} ${action}`);
    assert.equal(can(staff('USER'), action), false, `no department ${action}`);
    assert.ok(can(staff('SUPER_ADMIN'), action));
    assert.ok(can(staff('COMPANY_ADMIN'), action));
    assert.ok(can(staff('ILC_ADMIN'), action));
  }
  assert.equal(can(null, 'editProducts'), false);
  assert.throws(() => can(staff('SUPER_ADMIN'), 'noSuchThing'));
  assert.match(deniedMessage('editMasterPricing'), /Pre-construction/);
});

test('pricing, products and fixture library no longer hand-type role names', () => {
  for (const rel of [
    'src/app/api/admin/pricing/route.js',
    'src/app/api/products/[id]/route.js',
    'src/app/api/manufacturers/[id]/products/[productId]/route.js',
    'src/app/api/fixture-library/specs/[id]/route.js',
    'src/app/api/fixture-library/master-types/[code]/route.js',
    'src/app/api/fixture-library/fixture-types/[code]/route.js',
    'src/app/api/fixture-library/fixture-types/import/route.js',
    'src/app/api/cron/weekly-roundup/route.js',
    'src/app/api/cron/market-intel/route.js',
    'src/app/api/cron/note-reminders/route.js',
  ]) {
    assert.doesNotMatch(read(rel), /'ILC_ADMIN'/, rel);
  }
  assert.match(read('src/app/api/admin/pricing/route.js'), /requirePermission\(req, 'editMasterPricing'\)/);
});

test('every change-order write needs job-money rights; reads refuse contractors', () => {
  const dir = join(ROOT, 'src/app/api/projects/[id]/change-orders');
  for (const f of walk(dir).filter(f => /route\.js$/.test(f))) {
    const rel = f.slice(ROOT.length);
    if (/[\\/]pdf[\\/]/.test(rel)) continue; // PDF already hides DN via audienceForRole
    const src = readFileSync(f, 'utf8');
    for (const [, method, body] of src.matchAll(/export async function (\w+)\([\s\S]*?\{([\s\S]*?)(?=\nexport\s|$)/g)) {
      if (method === 'GET') assert.match(body, /isClientViewer\(user\.role\)/, `${rel} GET`);
      else assert.match(body, /requirePermission\(req, 'editJobMoney'\)/, `${rel} ${method}`);
    }
  }
});

test('manufacturer and product writes need product rights; reads refuse contractors', () => {
  for (const rel of [
    'src/app/api/manufacturers/route.js',
    'src/app/api/manufacturers/[id]/route.js',
    'src/app/api/manufacturers/[id]/products/route.js',
    'src/app/api/manufacturers/[id]/products/[productId]/route.js',
    'src/app/api/products/route.js',
    'src/app/api/products/[id]/route.js',
  ]) {
    const src = read(rel);
    for (const [, method, body] of src.matchAll(/export async function (\w+)\([\s\S]*?\{([\s\S]*?)(?=\nexport\s|$)/g)) {
      if (method === 'GET') assert.match(body, /isClientViewer\(user\.role\)/, `${rel} GET`);
      else if (/deleteRefused/.test(body)) continue; // DELETE is refused outright (archive-only)
      else assert.match(body, /requirePermission\(request, 'editProducts'\)/, `${rel} ${method}`);
    }
  }
});

test('contract dollars are locked on screen and on the server', () => {
  const route = read('src/app/api/projects/[id]/route.js');
  assert.match(route, /!can\(user, 'editJobMoney'\)/);
  assert.match(read('src/app/(app)/project/[id]/page.jsx'), /canEditMoney=\{can\(session, 'editJobMoney'\)\}/);
  const hub = read('src/app/(app)/project/[id]/ProjectHubClient.jsx');
  assert.equal(hub.match(/canEditMoney=\{canEditMoney\}/g)?.length, 2);
  assert.match(read('src/components/ContractWidgets.jsx'), /lockedNote=\{moneyLock\}/);
});

test('change-order screens say "view only" up front and show refusals', () => {
  const api = 'src/app/api/projects/[id]/change-orders';
  assert.match(read(`${api}/route.js`), /canEdit: can\(user, 'editJobMoney'\)/);
  assert.match(read(`${api}/[coId]/route.js`), /canEdit: can\(user, 'editJobMoney'\)/);

  const tab = read('src/components/changeOrders/ChangeOrdersTab.jsx');
  assert.match(tab, /View only\./);
  assert.equal(tab.match(/\{canEdit && <button onClick=\{createCO\}|\{canEdit && <button\s+onClick=\{createCO\}/g)?.length, 2, 'both New CO buttons hidden');
  assert.match(tab, /co\.status === 'DRAFT' && canEdit && \(/);

  const detail = read('src/app/(app)/project/[id]/change-orders/[coId]/CODetailClient.jsx');
  assert.match(detail, /isLocked = co\.status === 'APPROVED' \|\| co\.status === 'SENT' \|\| viewOnly/);
  assert.match(detail, /View only\./);
  // The cell used to ignore readOnly, so sent/approved COs looked editable.
  assert.match(detail, /function InlineCell\(\{[^}]*readOnly = false/);
  assert.match(detail, /function start\(\) \{ if \(readOnly\) return;/);
  // No bare fire-and-forget write left in the detail screen.
  assert.doesNotMatch(detail, /^\s*await fetch\(/m);
});

test('admin checks go through actsAsAdmin, so Operations counts as an admin', () => {
  // isAnyAdmin(role) only knows the login type; actsAsAdmin(user) also knows
  // the person sits in Operations (the CEO and COO).
  for (const f of walk(join(ROOT, 'src')).filter(f => /\.jsx?$/.test(f))) {
    if (/[\\/]lib[\\/]auth\.js$/.test(f)) continue;
    assert.doesNotMatch(readFileSync(f, 'utf8'), /isAnyAdmin\(/, f.slice(ROOT.length));
  }
});

test('no screen hand-types its own list of admin roles', () => {
  // Eleven places had ['SUPER_ADMIN', 'ILC_ADMIN', 'COMPANY_ADMIN'].includes(...),
  // which left out Operations. Every admin is ILC staff (Mike, 2026-09-14).
  for (const f of walk(join(ROOT, 'src')).filter(f => /\.jsx?$/.test(f))) {
    assert.doesNotMatch(readFileSync(f, 'utf8'), /\[[^\]]*'COMPANY_ADMIN'[^\]]*\]\.includes/, f.slice(ROOT.length));
  }
});

test("auth.js's role checks are handed a role, not the whole person", () => {
  // isSuperAdmin(user) is always false, so the AI review queue and its
  // verdict button turned away every Super Admin.
  for (const f of walk(join(ROOT, 'src')).filter(f => /\.jsx?$/.test(f))) {
    const src = readFileSync(f, 'utf8');
    const m = src.match(/import\s*\{([^}]*)\}\s*from\s*'@\/lib\/auth'/);
    if (!m) continue;
    for (const fn of ['isSuperAdmin', 'isCompanyAdmin', 'isClientViewer']) {
      if (!new RegExp(`\\b${fn}\\b`).test(m[1])) continue;
      assert.doesNotMatch(src, new RegExp(`\\b${fn}\\((user|session|me|currentUser)\\)`), `${f.slice(ROOT.length)}: ${fn}`);
    }
  }
});
