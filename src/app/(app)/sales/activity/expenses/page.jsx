'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import SectionTabs, { ACTIVITY_TABS } from '@/components/ui/SectionTabs';
import { EXPENSE_CATEGORIES, categoryLabel, formatMoney, centsToInput } from '@/lib/sales/expenses';
import { FilterToolbar, FilterPanel, countFilters } from '@/components/ui/FilterPanel';
import SortHeader, { Th, sortRows } from '@/components/ui/SortHeader';
import { WidgetLoading, WidgetEmpty } from '@/components/ui/WidgetFrame';
import ExpenseNumbers from './ExpenseNumbers';
import { useUrlView } from '@/lib/useUrlView';
import { CARD_PADDED, CARD_TITLE, BTN_PRIMARY, BTN_SECONDARY, INPUT, LABEL, H1, TD } from '@/components/ui/tokens';

// Sales > Activity > Expenses (0129). Every dollar a salesperson spent on a
// client: rows typed on a note ("Amount spent") show here read-only with a
// link back to the note, and standalone rows (no meeting, or a gift) are added
// and edited here. Rows are archived, never deleted.

const input = INPUT;
const btn   = BTN_PRIMARY;
const btn2  = BTN_SECONDARY;
const label = `block ${LABEL} mb-1`;

// Filters drive the server fetch; they and the sort live in the address.
const FILTER_FIELDS = [
  { key: 'user', label: 'Who',  kind: 'pick' },
  { key: 'from', label: 'From', kind: 'date' },
  { key: 'to',   label: 'To',   kind: 'date' },
];
const SORT_KEYS = ['date', 'who', 'amount', 'category', 'company', 'project', 'note', 'description'];
const VIEW_FIELDS = [...FILTER_FIELDS, ...SORT_KEYS.map(k => ({ key: k, kind: 'sort' }))];
const SORT_DEFAULT = { key: 'date', dir: 'desc' };

const today = () => new Date().toISOString().slice(0, 10);
const blankForm = (userId = '') => ({ userId, spentOn: today(), amount: '', category: 'MEAL', clientId: '', projectId: '', description: '' });

function fmtDate(v) {
  if (!v) return 'None';
  return new Date(v).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function ExpenseForm({ value, onChange, users, clients, projects, onSubmit, onCancel, busy, submitLabel }) {
  const set = (k, v) => onChange({ ...value, [k]: v });
  const projectOptions = useMemo(
    () => value.clientId ? projects.filter(p => p.clientId === value.clientId) : projects,
    [projects, value.clientId]
  );
  return (
    <form onSubmit={onSubmit} className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <div>
        <label className={label}>Who</label>
        <select value={value.userId} onChange={e => set('userId', e.target.value)} className={input}>
          <option value="">Pick a person</option>
          {users.map(u => <option key={u.id} value={u.id}>{u.name || u.email}</option>)}
        </select>
      </div>
      <div>
        <label className={label}>Date</label>
        <input type="date" value={value.spentOn} onChange={e => set('spentOn', e.target.value)} className={input} />
      </div>
      <div>
        <label className={label}>Amount <span className="font-normal normal-case text-slate-500">($)</span></label>
        <input inputMode="decimal" value={value.amount} onChange={e => set('amount', e.target.value)} placeholder="0.00" className={input} />
      </div>
      <div>
        <label className={label}>What for</label>
        <select value={value.category} onChange={e => set('category', e.target.value)} className={input}>
          {EXPENSE_CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
        </select>
      </div>
      <div>
        <label className={label}>Company</label>
        <select value={value.clientId} onChange={e => onChange({ ...value, clientId: e.target.value, projectId: '' })} className={input}>
          <option value="">No company</option>
          {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <div>
        <label className={label}>Project <span className="font-normal normal-case text-slate-500">(optional)</span></label>
        <select value={value.projectId} onChange={e => set('projectId', e.target.value)} className={input}>
          <option value="">No project</option>
          {projectOptions.map(p => <option key={p.id} value={p.id}>{p.projectNumber ? `${p.projectNumber} ` : ''}{p.name}</option>)}
        </select>
      </div>
      <div className="col-span-2">
        <label className={label}>Description</label>
        <input value={value.description} onChange={e => set('description', e.target.value)} placeholder="Dinner at Fogo with the Hines team" className={input} />
      </div>
      <div className="col-span-2 sm:col-span-4 flex items-center gap-2">
        <button type="submit" disabled={busy} className={btn}>{busy ? 'Saving…' : submitLabel}</button>
        {onCancel && <button type="button" onClick={onCancel} className={btn2}>Cancel</button>}
      </div>
    </form>
  );
}

export default function SalesExpensesPage() {
  const [rows,     setRows]     = useState([]);
  const [users,    setUsers]    = useState([]);
  const [clients,  setClients]  = useState([]);
  const [projects, setProjects] = useState([]);
  const [me,       setMe]       = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [err,      setErr]      = useState('');
  const [form,     setForm]     = useState(blankForm());
  const [busy,     setBusy]     = useState(false);
  const [editId,   setEditId]   = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [open,     setOpen]     = useState(false);
  const { filters, setFilter, clearFilters, sort, toggleSort, ready } = useUrlView({ fields: VIEW_FIELDS, sortDefault: SORT_DEFAULT });
  const filterUser = filters.user || 'all';
  const filterFrom = filters.from || '';
  const filterTo   = filters.to   || '';

  const load = useCallback(async () => {
    setLoading(true); setErr('');
    try {
      const q = new URLSearchParams();
      if (filterUser !== 'all') q.set('userId', filterUser);
      if (filterFrom) q.set('from', filterFrom);
      if (filterTo)   q.set('to', filterTo);
      const res = await fetch(`/api/sales/expenses?${q}`);
      if (!res.ok) throw new Error(`Error ${res.status}`);
      setRows((await res.json()).expenses || []);
    } catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  }, [filterUser, filterFrom, filterTo]);

  useEffect(() => { if (ready) load(); }, [ready, load]);

  useEffect(() => {
    (async () => {
      const [u, c, p, m] = await Promise.all([
        fetch('/api/users').then(r => r.ok ? r.json() : { users: [] }).catch(() => ({ users: [] })),
        fetch('/api/clients').then(r => r.ok ? r.json() : { clients: [] }).catch(() => ({ clients: [] })),
        fetch('/api/projects').then(r => r.ok ? r.json() : { projects: [] }).catch(() => ({ projects: [] })),
        fetch('/api/auth/me').then(r => r.ok ? r.json() : null).catch(() => null),
      ]);
      setUsers((u.users || []).filter(x => x.role !== 'CLIENT_VIEWER'));
      setClients((c.clients || c || []).slice().sort((a, b) => (a.name || '').localeCompare(b.name || '')));
      setProjects((p.projects || p || []).map(x => ({ id: x.id, name: x.name, projectNumber: x.projectNumber || x.budgetNumber, clientId: x.clientId })));
      const meId = m?.user?.id || m?.id || '';
      setMe(meId);
      setForm(f => f.userId ? f : { ...f, userId: meId });
    })();
  }, []);

  async function create(e) {
    e.preventDefault();
    setBusy(true); setErr('');
    try {
      const res = await fetch('/api/sales/expenses', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
      setForm(blankForm(form.userId || me || ''));
      await load();
    } catch (e2) { setErr(e2.message); }
    finally { setBusy(false); }
  }

  function startEdit(r) {
    setEditId(r.id);
    setEditForm({
      userId: r.userId, spentOn: (r.spentOn || '').slice(0, 10), amount: centsToInput(r.amountCents),
      category: r.category, clientId: r.clientId || '', projectId: r.projectId || '', description: r.description || '',
    });
  }

  async function saveEdit(e) {
    e.preventDefault();
    setBusy(true); setErr('');
    try {
      const res = await fetch(`/api/sales/expenses/${editId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editForm),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
      setEditId(null); setEditForm(null);
      await load();
    } catch (e2) { setErr(e2.message); }
    finally { setBusy(false); }
  }

  async function archive(id) {
    setErr('');
    const res = await fetch(`/api/sales/expenses/${id}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ archived: true }),
    });
    if (!res.ok) { setErr((await res.json().catch(() => ({}))).error || `Error ${res.status}`); return; }
    await load();
  }

  const total = rows.reduce((s, r) => s + (Number(r.amountCents) || 0), 0);
  const byUser = useMemo(() => {
    const m = {};
    for (const r of rows) {
      const k = r.user?.name || r.userId;
      m[k] = (m[k] || 0) + (Number(r.amountCents) || 0);
    }
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [rows]);

  const sorted = useMemo(() => sortRows(rows, sort, {
    date:        r => r.spentOn ? new Date(r.spentOn).getTime() : null,
    who:         r => r.user?.name || '',
    amount:      r => Number(r.amountCents) || 0,
    category:    r => categoryLabel(r.category) || '',
    company:     r => r.client?.name || '',
    project:     r => r.project?.name || '',
    note:        r => r.note ? Number(r.note.noteNumber) || 0 : null,
    description: r => r.description || '',
  }), [rows, sort]);
  const choices = { user: users.map(u => [u.id, u.name || u.email]) };
  const filterCount = countFilters(filters, FILTER_FIELDS);

  return (
    <div className="px-4 py-6 pb-28">
      <SectionTabs tabs={ACTIVITY_TABS} className="mb-5" />
      <div className="max-w-5xl mx-auto space-y-5">
        <div>
          <h1 className={H1}>Expenses</h1>
          <p className="text-xs text-slate-500 mt-0.5">What each salesperson spent on clients. Money typed on a sales note lands here on its own; add anything without a meeting below.</p>
        </div>

        {err && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</p>}

        <ExpenseNumbers userId={filterUser === 'all' ? '' : filterUser} rows={rows} />

        <div className={CARD_PADDED}>
          <h2 className={`${CARD_TITLE} mb-3`}>Add an expense</h2>
          <ExpenseForm value={form} onChange={setForm} users={users} clients={clients} projects={projects}
            onSubmit={create} busy={busy} submitLabel="Add expense" />
        </div>

        <div className={CARD_PADDED}>
          <h2 className={`${CARD_TITLE} mb-3`}>All expenses <span className="font-normal text-slate-500 tabular-nums">({rows.length}, {formatMoney(total)})</span></h2>
          <div className="mb-3">
            <FilterToolbar count={filterCount} open={open} onToggle={() => setOpen(o => !o)} onClear={clearFilters}
              shown={rows.length} total={rows.length} noun="expenses" />
            <FilterPanel open={open} fields={FILTER_FIELDS} filters={filters} choices={choices} onChange={setFilter} />
          </div>

          {byUser.length > 1 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {byUser.map(([name, cents]) => (
                <span key={name} className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2 py-0.5 text-slate-600">{name}: <span className="font-semibold tabular-nums">{formatMoney(cents)}</span></span>
              ))}
            </div>
          )}

          {loading ? (
            <WidgetLoading />
          ) : rows.length === 0 ? (
            <WidgetEmpty>Nothing spent yet. Type an amount on a sales note or add one above.</WidgetEmpty>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-100">
                    <SortHeader field="date" label="Date" sort={sort} onSort={toggleSort} />
                    <SortHeader field="who" label="Who" sort={sort} onSort={toggleSort} />
                    <SortHeader field="amount" label="Amount" sort={sort} onSort={toggleSort} align="right" />
                    <SortHeader field="category" label="What for" sort={sort} onSort={toggleSort} />
                    <SortHeader field="company" label="Company" sort={sort} onSort={toggleSort} />
                    <SortHeader field="project" label="Project" sort={sort} onSort={toggleSort} />
                    <SortHeader field="note" label="Note" sort={sort} onSort={toggleSort} />
                    <SortHeader field="description" label="Description" sort={sort} onSort={toggleSort} />
                    <Th />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {sorted.map(r => (
                    editId === r.id ? (
                      <tr key={r.id}><td colSpan={9} className="px-3 py-3">
                        <ExpenseForm value={editForm} onChange={setEditForm} users={users} clients={clients} projects={projects}
                          onSubmit={saveEdit} onCancel={() => { setEditId(null); setEditForm(null); }} busy={busy} submitLabel="Save" />
                      </td></tr>
                    ) : (
                      <tr key={r.id} className="hover:bg-slate-50">
                        <td className={`${TD} whitespace-nowrap tabular-nums`}>{fmtDate(r.spentOn)}</td>
                        <td className={TD}>{r.user?.name || 'None'}</td>
                        <td className={`${TD} text-right font-semibold text-slate-800 tabular-nums`}>{formatMoney(r.amountCents)}</td>
                        <td className={`${TD} text-slate-500`}>{categoryLabel(r.category)}</td>
                        <td className={TD}>{r.client ? <Link href={`/clients/${r.client.id}`} className="text-slate-700 hover:text-orange-600">{r.client.name}</Link> : <span className="text-slate-400">None</span>}</td>
                        <td className={TD}>{r.project ? <Link href={`/projects/${r.project.id}`} className="text-slate-700 hover:text-orange-600">{r.project.name}</Link> : <span className="text-slate-400">None</span>}</td>
                        <td className={TD}>{r.note ? <Link href={`/crm/notes?note=${r.note.id}`} className="text-slate-700 hover:text-orange-600">#{r.note.noteNumber}{r.note.title ? ` ${r.note.title}` : ''}</Link> : <span className="text-slate-400">None</span>}</td>
                        <td className={`${TD} text-slate-500 max-w-[220px] truncate`} title={r.description}>{r.description || ''}</td>
                        <td className={`${TD} text-right whitespace-nowrap`}>
                          {r.note ? (
                            <span className="text-xs text-slate-500" title="Change the amount on the note itself">from note</span>
                          ) : (
                            <>
                              <button type="button" onClick={() => startEdit(r)} className="text-xs font-semibold text-slate-600 hover:text-orange-600 mr-2">Edit</button>
                              <button type="button" onClick={() => archive(r.id)} className="text-xs font-semibold text-slate-600 hover:text-red-600">Archive</button>
                            </>
                          )}
                        </td>
                      </tr>
                    )
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
