'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import Badge from '@/components/ui/Badge';
import PublicAccessCard from '@/components/admin/PublicAccessCard';
import { DEPARTMENTS, DEPARTMENT_LABEL } from '@/lib/departments';
import { canAssignRole, canManageAccount } from '@/lib/roles';
import { effectiveRole } from '@/lib/permissions';
import { describeAccessEvent } from '@/lib/accessEvents';
import { CARD, MODAL, BTN_PRIMARY, BTN_SECONDARY, BTN_COMPACT, BTN_COMPACT_PRIMARY, H1, H2, INPUT, HELPER, TH, TAB_ACTIVE, TAB_INACTIVE } from '@/components/ui/tokens';
import { FilterToolbar, FilterPanel, SearchBox, countFilters } from '@/components/ui/FilterPanel';
import SortHeader, { sortRows } from '@/components/ui/SortHeader';
import { WidgetLoading, WidgetError } from '@/components/ui/WidgetFrame';
import { useUrlView } from '@/lib/useUrlView';
import MatrixLoader from '@/components/specSwap/MatrixLoader';

// Tailwind needs the full class strings written out here to keep them.
const DEPARTMENT_COLORS = {
  SALES_MARKETING:    'bg-pink-50 text-pink-700 border-pink-300',
  OPERATIONS:         'bg-slate-100 text-slate-700 border-slate-300',
  PRECONSTRUCTION:    'bg-blue-50 text-blue-700 border-blue-300',
  CONSTRUCTION:       'bg-amber-50 text-amber-700 border-amber-200',
  DESIGN:            'bg-violet-50 text-violet-700 border-violet-300',
  FINANCE:            'bg-green-50 text-green-700 border-green-300',
};

// Departments, pick any number (Mike, 2026-09-12). Being in Sales + marketing
// is what puts someone in the Sales Owner dropdowns and the web request queue.
function DepartmentPicker({ value, onChange }) {
  function toggle(key) {
    onChange(value.includes(key) ? value.filter(k => k !== key) : [...value, key]);
  }
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-600 mb-2">
        Departments
        <span className="text-slate-500 font-normal ml-1">(select all that apply)</span>
      </label>
      <div className="flex flex-wrap gap-2">
        {DEPARTMENTS.map(d => {
          const active = value.includes(d.key);
          return (
            <button key={d.key} type="button" onClick={() => toggle(d.key)} aria-pressed={active}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                active
                  ? `${DEPARTMENT_COLORS[d.key]} ring-2 ring-offset-1 ring-current`
                  : 'bg-white text-slate-500 border-slate-300 hover:border-slate-400 hover:text-slate-700'
              }`}>
              {active && <span className="mr-1">✓</span>}{d.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const ROLE_OPTIONS = [
  { value: 'SUPER_ADMIN',   label: 'Super Admin',   desc: 'Full access, ILC Studios team only'        },
  { value: 'COMPANY_ADMIN', label: 'Company Admin',  desc: 'Can manage users and see all projects'      },
  { value: 'SALES_ADMIN',   label: 'Sales Admin',    desc: 'Runs the sales team: applies Market Intel rules, sales automation, everyone\'s My Desk' },
  { value: 'SALES',         label: 'Sales',          desc: 'Salesperson: CRM, Market Intel, My Desk' },
  { value: 'USER',          label: 'User',           desc: 'Standard access, create and edit projects' },
  { value: 'CLIENT_VIEWER', label: 'Client Viewer',  desc: 'Outside contractor, sees only their own jobs, never buy price' },
];

const ROLE_BADGE = {
  SUPER_ADMIN:   { label: 'Super Admin',   variant: 'ilc_admin' },
  ILC_ADMIN:     { label: 'Super Admin',   variant: 'ilc_admin' },
  COMPANY_ADMIN: { label: 'Company Admin', variant: 'admin'     },
  ADMIN:         { label: 'Company Admin', variant: 'admin'     },
  SALES_ADMIN:   { label: 'Sales Admin',   variant: 'admin'     },
  SALES:         { label: 'Sales',         variant: 'user'      },
  USER:          { label: 'User',          variant: 'user'      },
  CLIENT_VIEWER: { label: 'Client Viewer', variant: 'pending'   },
};

function getRoleBadge(role) {
  return ROLE_BADGE[role] || { label: role, variant: 'user' };
}

// The status word the table shows for one person (also a filter choice).
function userStatus(u) {
  if (u.isActive === false) return 'Inactive';
  if (u.mustChangePassword) return 'Temp Password';
  return u.hasPassword ? 'Active' : 'No Password';
}

// Users list filters (address keys) and sort getters.
const USER_FILTER_FIELDS = [
  { key: 'q',          label: 'Search',     kind: 'text' },
  { key: 'role',       label: 'Role',       kind: 'pick' },
  { key: 'department', label: 'Department', kind: 'pick' },
  { key: 'status',     label: 'Status',     kind: 'pick' },
];
const USER_FILTER_CHOICES = {
  role:       [...new Set(Object.values(ROLE_BADGE).map(b => b.label))],
  department: DEPARTMENTS.map(d => [d.key, d.label]),
  status:     ['Active', 'Temp Password', 'No Password', 'Inactive'],
};
const USER_SORT_GETTERS = {
  name:     u => u.name || u.email,
  role:     u => getRoleBadge(u.role).label,
  status:   u => userStatus(u),
  projects: u => u.projectCount ?? 0,
  joined:   u => (u.createdAt ? new Date(u.createdAt).getTime() : null),
};

// ── Create User Form ──────────────────────────────────────────────────────────

function CreateUserForm({ currentUserRole, onCreated }) {
  const [form, setForm] = useState({
    name:              '',
    email:             '',
    password:          '',
    role:              'USER',
    mustChangePassword: true,
    departments:       [],
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  // Same rule the server uses (src/lib/roles.js): a Company Admin can make
  // someone an admin (Mike, 2026-09-14); only a Super Admin makes a Super Admin.
  const availableRoles = ROLE_OPTIONS.filter(r => canAssignRole(currentUserRole, r.value));

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!form.email || !form.password) { setError('Email and password are required.'); return; }
    if (form.password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    setSaving(true);
    try {
      const res  = await fetch('/api/admin/users', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to create user'); return; }
      onCreated(data);
      setForm({ name: '', email: '', password: '', role: 'USER', mustChangePassword: true, departments: [] });
    } catch {
      setError('Network error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-lg">
      <div className={`${CARD} p-6`}>
        <h2 className={`${H2} mb-5`}>Create New User</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Full Name</label>
              <input type="text" value={form.name} onChange={e => set('name', e.target.value)}
                placeholder="Jane Smith"
                className={INPUT} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Email <span className="text-red-500">*</span></label>
              <input type="email" value={form.email} onChange={e => set('email', e.target.value)}
                placeholder="jane@company.com" required
                className={INPUT} />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Temporary Password <span className="text-red-500">*</span></label>
            <input type="text" value={form.password} onChange={e => set('password', e.target.value)}
              placeholder="Min 8 characters" required
              className={`${INPUT} font-mono`} />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-2">Role <span className="text-red-500">*</span></label>
            <div className="space-y-2">
              {availableRoles.map(r => (
                <label key={r.value} className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  form.role === r.value ? 'border-orange-400 bg-orange-50' : 'border-slate-200 hover:border-slate-300'
                }`}>
                  <input type="radio" name="role" value={r.value} checked={form.role === r.value}
                    onChange={() => set('role', r.value)} className="mt-0.5 accent-orange-500" />
                  <div>
                    <div className="text-sm font-semibold text-slate-800">{r.label}</div>
                    <div className="text-xs text-slate-500">{r.desc}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <DepartmentPicker value={form.departments} onChange={v => set('departments', v)} />

          <label className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50">
            <input type="checkbox" checked={form.mustChangePassword} onChange={e => set('mustChangePassword', e.target.checked)}
              className="accent-orange-500" />
            <div>
              <div className="text-sm font-semibold text-slate-800">Require password change on first login</div>
              <div className="text-xs text-slate-500">User will be prompted to set their own password immediately after logging in</div>
            </div>
          </label>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 text-sm text-red-600">{error}</div>
          )}

          <button type="submit" disabled={saving}
            className={`${BTN_PRIMARY} w-full`}>
            {saving ? 'Creating…' : 'Create User'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Access History ────────────────────────────────────────────────────────────

// Every change to this person's access, newest first (migration 0086). Reloads
// after each save so the change just made shows up.
function AccessHistory({ userId, refreshKey }) {
  const [events, setEvents] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    setFailed(false);
    fetch(`/api/admin/users/${userId}/history`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(rows => { if (live) setEvents(rows); })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [userId, refreshKey]);

  return (
    <div className="mt-6 border-t border-slate-100 pt-4">
      <h4 className="text-xs font-semibold text-slate-600 mb-2">Access history</h4>
      {failed ? (
        <p className="text-xs text-red-600">Couldn&apos;t load the history.</p>
      ) : events === null ? (
        <WidgetLoading />
      ) : events.length === 0 ? (
        <p className={HELPER}>No changes recorded yet. The history started on September 15, 2026.</p>
      ) : (
        <ul className="space-y-1.5 max-h-48 overflow-y-auto">
          {events.map(ev => (
            <li key={ev.id} className="flex items-baseline justify-between gap-3 text-xs">
              <span className="text-slate-700">{describeAccessEvent(ev)}</span>
              <span className="text-slate-500 shrink-0 tabular-nums">
                {ev.changedBy?.name || ev.changedBy?.email || 'Unknown'}
                {' · '}
                {new Date(ev.changedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Edit User Modal ───────────────────────────────────────────────────────────

// Which jobs one Client Viewer can open.
//
// Everyone on staff sees every job, so this only appears for a Client Viewer.
// The rows live in ProjectAccess, which sat unused in the database until now:
// before this, a Client Viewer could see only jobs they had created, and a
// Client Viewer cannot create a job, so the honest answer was always "none".
//
// Saves on its own, separately from the rest of the window, because the list
// can be long and half-finished tick-boxes should not ride along with a
// password reset.
function ClientViewerJobs({ userId, projects, onSaved }) {
  const [ids,     setIds]     = useState(null);
  const [saving,  setSaving]  = useState(false);
  const [message, setMessage] = useState('');
  const [search,  setSearch]  = useState('');

  useEffect(() => {
    let alive = true;
    fetch(`/api/admin/users/${userId}/projects`)
      .then(r => r.json())
      .then(d => { if (alive) setIds(d.projectIds || []); })
      .catch(() => { if (alive) setIds([]); });
    return () => { alive = false; };
  }, [userId]);

  function toggle(id) {
    setMessage('');
    setIds(cur => (cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id]));
  }

  async function save() {
    setSaving(true); setMessage('');
    try {
      const res  = await fetch(`/api/admin/users/${userId}/projects`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectIds: ids }),
      });
      const data = await res.json();
      if (!res.ok) { setMessage(data.error || 'Could not save the job list.'); return; }
      setIds(data.projectIds || []);
      setMessage(`Saved. They can open ${data.total} ${data.total === 1 ? 'job' : 'jobs'}.`);
      onSaved?.();
    } catch {
      setMessage('Network error.');
    } finally {
      setSaving(false);
    }
  }

  const term    = search.trim().toLowerCase();
  const shown   = term
    ? projects.filter(p => `${p.projectNumber || ''} ${p.name}`.toLowerCase().includes(term))
    : projects;

  return (
    <div>
      <label className="block text-xs font-semibold text-slate-600 mb-1">
        Jobs this person can open
        {ids && <span className="text-slate-500 font-normal tabular-nums">, {ids.length} selected</span>}
      </label>
      <p className={`${HELPER} mb-2`}>
        A Client Viewer sees nothing until a job is ticked here. Buy price is never shown to them on any of them.
      </p>

      {ids === null ? (
        <WidgetLoading />
      ) : (
        <>
          <input
            type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search jobs…"
            className={`${INPUT} mb-2`} />

          <div className="max-h-48 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100">
            {shown.length === 0 && <p className={`${HELPER} px-3 py-3`}>No jobs match.</p>}
            {shown.map(p => (
              <label key={p.id} className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-slate-50">
                <input type="checkbox" checked={ids.includes(p.id)} onChange={() => toggle(p.id)} className="accent-orange-500" />
                <span className="text-sm text-slate-700 truncate">
                  {p.projectNumber ? <span className="text-slate-500 mr-1.5 tabular-nums">#{p.projectNumber}</span> : null}
                  {p.name}
                </span>
              </label>
            ))}
          </div>

          <div className="flex items-center gap-3 mt-2">
            <button type="button" onClick={save} disabled={saving}
              className={BTN_COMPACT_PRIMARY}>
              {saving ? 'Saving…' : 'Save job list'}
            </button>
            {message && <span className="text-xs text-slate-500">{message}</span>}
          </div>
        </>
      )}
    </div>
  );
}

function EditUserModal({ user, currentUserRole, projects, onSaved, onClose }) {
  const parsedPerms = (() => { try { return JSON.parse(user.permissions || '{}'); } catch { return {}; } })();

  const [form, setForm] = useState({
    name:              user.name || '',
    role:              user.role,
    departments:       user.departments || [],
    mustChangePassword: user.mustChangePassword,
    isActive:          user.isActive !== false,
    newPassword:       '',
    permKnowledgeBase:    parsedPerms.knowledgeBase    === true,
    permClientStandards:  parsedPerms.clientStandards  === true,
    permSalesAdmin:       parsedPerms.salesAdmin       === true,
  });

  const [saving, setSaving]   = useState(false);
  const [error,  setError]    = useState('');
  const [success, setSuccess] = useState('');
  const [historyKey, setHistoryKey] = useState(0);

  // Same rule the server uses (src/lib/roles.js): a Company Admin can make
  // someone an admin (Mike, 2026-09-14); only a Super Admin makes a Super Admin.
  const availableRoles = ROLE_OPTIONS.filter(r => canAssignRole(currentUserRole, r.value));

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  async function handleSave(e) {
    e.preventDefault();
    setError(''); setSuccess('');
    if (form.newPassword && form.newPassword.length < 8) { setError('Password must be at least 8 characters.'); return; }
    setSaving(true);
    try {
      const body = {
        name:              form.name,
        role:              form.role,
        departments:       form.departments,
        mustChangePassword: form.mustChangePassword,
        isActive:          form.isActive,
        permissions:       { knowledgeBase: form.permKnowledgeBase, clientStandards: form.permClientStandards, salesAdmin: form.permSalesAdmin },
      };
      if (form.newPassword) body.newPassword = form.newPassword;
      const res  = await fetch(`/api/admin/users/${user.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to update user'); return; }
      setSuccess('Saved.');
      setHistoryKey(k => k + 1);
      onSaved(data);
    } catch {
      setError('Network error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className={`${MODAL} w-full max-w-3xl flex flex-col max-h-[90vh]`}>

        {/* Header, fixed */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <div>
            <h3 className={H2}>Edit User</h3>
            <p className="text-xs text-slate-500 mt-0.5">{user.email}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-600">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Body, scrollable, 2-column grid */}
        <form onSubmit={handleSave} className="flex flex-col flex-1 min-h-0">
          <div className="overflow-y-auto flex-1 p-6">
            <div className="grid grid-cols-2 gap-6">

              {/* ── LEFT COLUMN ── */}
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Full Name</label>
                  <input type="text" value={form.name} onChange={e => set('name', e.target.value)}
                    className={INPUT} />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-2">System Role</label>
                  <div className="space-y-1.5">
                    {availableRoles.map(r => (
                      <label key={r.value} className={`flex items-start gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                        form.role === r.value ? 'border-orange-400 bg-orange-50' : 'border-slate-200 hover:border-slate-300'
                      }`}>
                        <input type="radio" name="edit-role" value={r.value} checked={form.role === r.value}
                          onChange={() => set('role', r.value)} className="mt-0.5 accent-orange-500" />
                        <div>
                          <div className="text-sm font-semibold text-slate-800">{r.label}</div>
                          <div className="text-xs text-slate-500">{r.desc}</div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              {/* ── RIGHT COLUMN ── */}
              <div className="space-y-4">

                <DepartmentPicker value={form.departments} onChange={v => set('departments', v)} />

                {form.role === 'CLIENT_VIEWER' && (
                  <ClientViewerJobs
                    userId={user.id}
                    projects={projects}
                    onSaved={() => setHistoryKey(k => k + 1)} />
                )}

                {/* Reset Password */}
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Reset Password <span className="text-slate-500 font-normal">(leave blank to keep current)</span>
                  </label>
                  <input type="text" value={form.newPassword} onChange={e => set('newPassword', e.target.value)}
                    placeholder="New temporary password"
                    className={`${INPUT} font-mono`} />
                  <label className="flex items-center gap-2 cursor-pointer mt-2">
                    <input type="checkbox" checked={form.mustChangePassword} onChange={e => set('mustChangePassword', e.target.checked)} className="accent-orange-500" />
                    <span className="text-xs text-slate-600">Require password change on next login</span>
                  </label>
                </div>

                {/* Extra Permissions */}
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-2">Extra Permissions</label>
                  <div className="space-y-1.5">
                    <label className="flex items-start gap-3 p-2.5 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50 transition-colors">
                      <input type="checkbox" checked={form.permKnowledgeBase} onChange={e => set('permKnowledgeBase', e.target.checked)} className="accent-orange-500 mt-0.5" />
                      <div>
                        <div className="text-sm font-semibold text-slate-800">Knowledge Base Editor</div>
                        <div className="text-xs text-slate-500">Can add, edit, and delete design standards</div>
                      </div>
                    </label>
                    <label className="flex items-start gap-3 p-2.5 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50 transition-colors">
                      <input type="checkbox" checked={form.permClientStandards} onChange={e => set('permClientStandards', e.target.checked)} className="accent-orange-500 mt-0.5" />
                      <div>
                        <div className="text-sm font-semibold text-slate-800">Client Standards Editor</div>
                        <div className="text-xs text-slate-500">Can view and fill out national lighting standards</div>
                      </div>
                    </label>
                    <label className="flex items-start gap-3 p-2.5 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50 transition-colors">
                      <input type="checkbox" checked={form.permSalesAdmin} onChange={e => set('permSalesAdmin', e.target.checked)} className="accent-orange-500 mt-0.5" />
                      <div>
                        <div className="text-sm font-semibold text-slate-800">Sales Admin</div>
                        <div className="text-xs text-slate-500">Can manage Sales Automation action types, templates &amp; bot reminders</div>
                      </div>
                    </label>
                  </div>
                </div>

                {/* Account active */}
                <div className={`flex items-start gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                  form.isActive ? 'border-slate-200 hover:border-slate-300' : 'border-red-200 bg-red-50'
                }`} onClick={() => set('isActive', !form.isActive)}>
                  <input type="checkbox" checked={form.isActive} onChange={e => set('isActive', e.target.checked)}
                    className="accent-orange-500 mt-0.5" onClick={e => e.stopPropagation()} />
                  <div>
                    <div className={`text-sm font-semibold ${form.isActive ? 'text-slate-800' : 'text-red-700'}`}>
                      {form.isActive ? 'Account is active' : 'Account is inactive'}
                    </div>
                    <div className="text-xs text-slate-500">
                      {form.isActive ? 'User can sign in normally' : 'User cannot sign in, data is preserved'}
                    </div>
                  </div>
                </div>

              </div>{/* end right column */}
            </div>{/* end grid */}

            <AccessHistory userId={user.id} refreshKey={historyKey} />

            {error   &&<div className="mt-4 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 text-sm text-red-600">{error}</div>}
            {success && <div className="mt-4 bg-green-50 border border-green-200 rounded-lg px-4 py-2.5 text-sm text-green-700">{success}</div>}
          </div>

          {/* Footer buttons, always visible */}
          <div className="flex gap-3 px-6 py-4 border-t border-slate-100 shrink-0">
            <button type="button" onClick={onClose}
              className={`${BTN_SECONDARY} flex-1`}>
              Close
            </button>
            <button type="submit" disabled={saving}
              className={`${BTN_PRIMARY} flex-1`}>
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>

      </div>
    </div>
  );
}

// ── Main AdminClient ──────────────────────────────────────────────────────────

// Same rule the server uses: nobody but a Super Admin touches a Super Admin's
// account. Operations acts as a Company Admin (src/lib/permissions.js).
function canManageUser(actor, target) {
  if (target.id === actor.id) return false;
  return canManageAccount(effectiveRole(actor), target.role);
}

// Which notifications people find useful and which they call noise.
//
// Counts only, no names. The point is to fix a noisy alert, not to see who
// clicked what. "Turned off" counts the people who said stop after being asked
// three times; a high number there is the loudest signal on the screen.
function AlertFeedbackReport() {
  const [data,  setData]  = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    fetch('/api/admin/alert-feedback')
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(d => { if (alive) setData(d); })
      .catch(() => { if (alive) setError("Couldn't load the report."); });
    return () => { alive = false; };
  }, []);

  if (error)  return <WidgetError>{error}</WidgetError>;
  if (!data)  return <WidgetLoading />;

  if (data.summary.length === 0) {
    return (
      <div className={`${CARD} px-6 py-8`}>
        <p className="text-sm text-slate-500">
          Nobody has rated a notification yet. Every notification in the bell carries
          <span className="font-medium"> Useful</span> and <span className="font-medium">Don&apos;t need</span> buttons;
          this report fills in as people use them.
        </p>
      </div>
    );
  }

  return (
    <div className={`${CARD} overflow-hidden`}>
      <div className="px-6 py-4 border-b border-slate-100">
        <p className="text-sm text-slate-600">
          {data.totalClicks} {data.totalClicks === 1 ? 'rating' : 'ratings'} so far.
          {data.totalMutes > 0 && ` ${data.totalMutes} ${data.totalMutes === 1 ? 'person has' : 'people have'} turned a kind off.`}
          {' '}Noisiest first.
        </p>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-100">
            <th className={`${TH} px-6 py-3`}>Notification</th>
            <th className={`${TH} text-right px-4 py-3`}>Useful</th>
            <th className={`${TH} text-right px-4 py-3`}>Don&apos;t need</th>
            <th className={`${TH} text-right px-4 py-3`}>Turned off</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {data.summary.map(row => (
            <tr key={row.alertType} className="hover:bg-slate-50 align-top">
              <td className="px-6 py-4">
                <div className="font-semibold text-slate-800">{row.label}</div>
                <div className="text-xs text-slate-500 mt-0.5">{row.verdict}</div>
              </td>
              <td className="px-4 py-4 text-right text-slate-700 tabular-nums">{row.useful}</td>
              <td className={`px-4 py-4 text-right font-semibold tabular-nums ${row.noisePct >= 60 ? 'text-red-600' : 'text-slate-600'}`}>
                {row.notUseful}
              </td>
              <td className="px-4 py-4 text-right text-slate-700 tabular-nums">{row.mutedBy}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function AdminClient({ users: initialUsers, projects, currentUser }) {
  const router = useRouter();
  const params = useSearchParams();
  const [tab, setTabState] = useState('users');
  const [users,         setUsers]        = useState(initialUsers);
  const [filtersOpen,   setFiltersOpen]  = useState(false);
  const [editUser,      setEditUser]     = useState(null);

  // Users list filters and sort live in the address (useUrlView). `q` is the search box.
  const { filters, setFilter, clearFilters, sort, toggleSort } = useUrlView({ fields: USER_FILTER_FIELDS });
  const userSearch = filters.q || '';
  const userFilterCount = countFilters(filters, USER_FILTER_FIELDS.filter(f => f.key !== 'q'));
  const shownUsers = sortRows(users.filter(u => {
    const q = userSearch.toLowerCase();
    if (q && !(u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q))) return false;
    if (filters.role && getRoleBadge(u.role).label !== filters.role) return false;
    if (filters.department && !(u.departments || []).includes(filters.department)) return false;
    if (filters.status && userStatus(u) !== filters.status) return false;
    return true;
  }), sort, USER_SORT_GETTERS);
  const [created,       setCreated]      = useState(null);
  const [offConfirm,    setOffConfirm]   = useState(null);
  const [toggling,      setToggling]     = useState(null);
  const [toggleError,   setToggleError]  = useState('');

  useEffect(() => {
    const tabParam = params.get('tab') || 'users';
    setTabState(tabParam);
  }, [params]);

  function setTab(newTab) {
    setTabState(newTab);
    // Read the live address so filters written by useUrlView (replaceState) survive a tab switch.
    const newParams = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : params);
    newParams.set('tab', newTab);
    router.replace(`?${newParams.toString()}`);
  }

  function handleUserCreated(newUser) {
    setUsers(prev => [newUser, ...prev]);
    setCreated(newUser);
    setTab('users');
  }

  function handleUserSaved(updated) {
    setUsers(prev => prev.map(u => u.id === updated.id ? { ...u, ...updated } : u));
  }

  // People are turned off, never deleted (archive-only). Turning someone off
  // signs them out at once; everything they made stays.
  async function handleToggleActive(u) {
    setToggling(u.id);
    setOffConfirm(null);
    setToggleError('');
    try {
      const res = await fetch(`/api/admin/users/${u.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: u.isActive === false }),
      });
      const data = await res.json();
      if (!res.ok) { setToggleError(data.error || 'Could not change this account'); return; }
      handleUserSaved(data);
    } catch {
      setToggleError('Network error');
    } finally {
      setToggling(null);
    }
  }

  const TABS = [
    { id: 'users',  label: `Users (${users.length})`          },
    { id: 'create', label: '+ Create User'                    },
    { id: 'projects', label: `All Projects (${projects.length})` },
    { id: 'alerts',   label: 'Notification feedback'            },
    { id: 'matrices', label: 'Peer review matrices'             },
  ];

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <div className="mb-8">
        <h1 className={H1}>Admin Panel</h1>
        <p className="text-slate-500 text-sm mt-1">Manage users and view all projects.</p>
      </div>

      {/* Password on the public budget tool (moved here 10-7 so admins can find it) */}
      <PublicAccessCard />

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200 mb-6">
        {TABS.map(t => (
          <button key={t.id} onClick={() => { setTab(t.id); setCreated(null); }}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
              tab === t.id
                ? TAB_ACTIVE
                : TAB_INACTIVE
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Users tab */}
      {tab === 'users' && (
        <>
          {created && (
            <div className="mb-4 bg-green-50 border border-green-200 rounded-lg px-5 py-3 flex items-center gap-3">
              <svg className="w-5 h-5 text-green-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm text-green-800">
                <span className="font-semibold">{created.name || created.email}</span> was created.
                {created.mustChangePassword && ' They will be prompted to set their own password on first login.'}
              </p>
            </div>
          )}

          {toggleError && (
            <div className="mb-4 bg-red-50 border border-red-200 rounded-lg px-5 py-3 flex items-center justify-between gap-3">
              <p className="text-sm text-red-700">{toggleError}</p>
              <button onClick={() => setToggleError('')} className="text-red-400 hover:text-red-600 text-lg leading-none">&times;</button>
            </div>
          )}

          <div className="mb-4">
            <FilterToolbar
              count={userFilterCount + (userSearch.trim() ? 1 : 0)}
              open={filtersOpen}
              onToggle={() => setFiltersOpen(o => !o)}
              onClear={clearFilters}
              shown={shownUsers.length}
              total={users.length}
              noun="users"
              right={<SearchBox value={userSearch} onChange={v => setFilter('q', v)} placeholder="Search by name or email..." className="w-72" />}
            />
            <FilterPanel
              open={filtersOpen}
              fields={USER_FILTER_FIELDS.filter(f => f.key !== 'q')}
              filters={filters}
              choices={USER_FILTER_CHOICES}
              onChange={setFilter}
            />
          </div>

          <div className={`${CARD} overflow-hidden`}>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <SortHeader label="User" field="name" sort={sort} onSort={toggleSort} className="px-6 py-3" />
                  <SortHeader label="Role" field="role" sort={sort} onSort={toggleSort} className="px-6 py-3" />
                  <th className={`${TH} px-6 py-3`}>Departments</th>
                  <SortHeader label="Status" field="status" sort={sort} onSort={toggleSort} className="px-6 py-3" />
                  <SortHeader label="Projects" field="projects" sort={sort} onSort={toggleSort} className="px-6 py-3" />
                  <SortHeader label="Joined" field="joined" sort={sort} onSort={toggleSort} className="px-6 py-3" />
                  <th className="px-6 py-3 w-32"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {shownUsers.map(u => {
                  const badge = getRoleBadge(u.role);
                  const isMe  = u.id === currentUser.id;
                  return (
                    <tr key={u.id} className={`hover:bg-slate-50 ${u.isActive === false ? 'opacity-50' : ''}`}>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 text-sm font-semibold shrink-0">
                            {(u.name || u.email)[0].toUpperCase()}
                          </div>
                          <div>
                            <div className="font-medium text-slate-900">
                              {u.name || <span className="text-slate-500 italic">No name set</span>}
                              {isMe && <span className="ml-2 text-[11px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-semibold">You</span>}
                            </div>
                            <div className="text-xs text-slate-500">{u.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <Badge variant={badge.variant}>{badge.label}</Badge>
                      </td>
                      <td className="px-6 py-4">
                        {(u.departments || []).length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {u.departments.map(key => (
                              <span key={key} className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${DEPARTMENT_COLORS[key] || 'bg-slate-100 text-slate-600 border-slate-300'}`}>
                                {DEPARTMENT_LABEL[key] || key}
                              </span>
                            ))}
                          </div>
                        ) : u.role === 'CLIENT_VIEWER'
                          ? <span className="text-xs text-slate-500">n/a</span>
                          : <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full border bg-amber-50 text-amber-700 border-amber-200">No department</span>}
                      </td>
                      <td className="px-6 py-4">
                        {u.isActive === false
                          ? <Badge variant="draft">Inactive</Badge>
                          : u.mustChangePassword
                            ? <Badge variant="pending">Temp Password</Badge>
                            : u.hasPassword
                              ? <Badge variant="complete">Active</Badge>
                              : <Badge variant="pending">No Password</Badge>
                        }
                      </td>
                      <td className="px-6 py-4 text-slate-700 tabular-nums">{u.projectCount ?? 0}</td>
                      <td className="px-6 py-4 text-slate-500 text-xs tabular-nums">
                        {new Date(u.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          {!isMe && (
                            <button onClick={() => setEditUser(u)}
                              className={BTN_COMPACT}>
                              Edit
                            </button>
                          )}
                          {canManageUser(currentUser, u) && (
                            offConfirm === u.id ? (
                              <span className="flex items-center gap-1.5">
                                <span className="text-xs text-red-600">Sign them out?</span>
                                <button onClick={() => handleToggleActive(u)}
                                  className="text-xs text-red-600 font-semibold hover:text-red-700 transition-colors">
                                  Yes
                                </button>
                                <button onClick={() => setOffConfirm(null)}
                                  className="text-xs font-semibold text-slate-500 hover:text-slate-700 transition-colors">
                                  No
                                </button>
                              </span>
                            ) : u.isActive === false ? (
                              <button onClick={() => handleToggleActive(u)} disabled={toggling === u.id}
                                className="text-xs font-semibold text-slate-500 hover:text-green-600 transition-colors disabled:opacity-40">
                                {toggling === u.id ? '…' : 'Turn on'}
                              </button>
                            ) : (
                              <button
                                onClick={() => { setOffConfirm(u.id); setToggleError(''); }}
                                disabled={toggling === u.id}
                                className="text-xs font-semibold text-slate-500 hover:text-red-600 transition-colors disabled:opacity-40">
                                {toggling === u.id ? '…' : 'Turn off'}
                              </button>
                            )
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Create user tab */}
      {tab === 'create' && (
        <CreateUserForm
          currentUserRole={effectiveRole(currentUser)}
          onCreated={handleUserCreated}
        />
      )}

      {/* Notification feedback tab */}
      {tab === 'alerts' && <AlertFeedbackReport />}
      {tab === 'matrices' && <MatrixLoader />}

      {/* Projects tab */}
      {tab === 'projects' && (
        <div className={`${CARD} overflow-hidden`}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                <th className={`${TH} px-6 py-3`}>Project</th>
                <th className={`${TH} px-6 py-3`}>Owner</th>
                <th className={`${TH} px-6 py-3`}>Status</th>
                <th className={`${TH} px-6 py-3`}>Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {projects.map(p => (
                <tr key={p.id} className="hover:bg-slate-50">
                  <td className="px-6 py-4">
                    <Link href={`/project/${p.id}`} className="font-semibold text-orange-600 hover:underline">
                      {p.name}
                    </Link>
                    {p.location && <div className="text-xs text-slate-500 mt-0.5">{p.location}</div>}
                  </td>
                  <td className="px-6 py-4 text-slate-700">
                    {p.createdBy?.name || p.createdBy?.email}
                  </td>
                  <td className="px-6 py-4">
                    <Badge variant={p.status.toLowerCase()}>
                      {p.status.charAt(0) + p.status.slice(1).toLowerCase().replace('_', ' ')}
                    </Badge>
                  </td>
                  <td className="px-6 py-4 text-slate-500 text-xs tabular-nums">
                    {new Date(p.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit modal */}
      {editUser && (
        <EditUserModal
          user={editUser}
          currentUserRole={effectiveRole(currentUser)}
          projects={projects}
          onSaved={handleUserSaved}
          onClose={() => setEditUser(null)}
        />
      )}
    </div>
  );
}
