'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import SectionTabs, { ACTIVITY_TABS } from '@/components/ui/SectionTabs';
import { EXPENSE_CATEGORIES, categoryLabel, formatMoney, centsToInput } from '@/lib/sales/expenses';

// Sales > Activity > Expenses (0129). Every dollar a salesperson spent on a
// client: rows typed on a note ("Amount spent") show here read-only with a
// link back to the note, and standalone rows (no meeting, or a gift) are added
// and edited here. Rows are archived, never deleted.

const input = 'w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-400';
const btn   = 'px-4 py-2 text-sm font-semibold rounded-lg bg-orange-500 hover:bg-orange-600 text-white transition-colors shadow-sm disabled:opacity-50';
const btn2  = 'px-4 py-2 text-sm font-semibold rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 shadow-sm transition-colors';

const today = () => new Date().toISOString().slice(0, 10);
const blankForm = (userId = '') => ({ userId, spentOn: today(), amount: '', category: 'MEAL', clientId: '', projectId: '', description: '' });

function fmtDate(v) {
  if (!v) return '—';
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
        <label className="block text-xs font-medium text-slate-500 mb-1">Who</label>
        <select value={value.userId} onChange={e => set('userId', e.target.value)} className={input}>
          <option value="">Pick a person</option>
          {users.map(u => <option key={u.id} value={u.id}>{u.name || u.email}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1">Date</label>
        <input type="date" value={value.spentOn} onChange={e => set('spentOn', e.target.value)} className={input} />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1">Amount <span className="font-normal text-slate-400">($)</span></label>
        <input inputMode="decimal" value={value.amount} onChange={e => set('amount', e.target.value)} placeholder="0.00" className={input} />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1">What for</label>
        <select value={value.category} onChange={e => set('category', e.target.value)} className={input}>
          {EXPENSE_CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1">Company</label>
        <select value={value.clientId} onChange={e => onChange({ ...value, clientId: e.target.value, projectId: '' })} className={input}>
          <option value="">No company</option>
          {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1">Project <span className="font-normal text-slate-400">(optional)</span></label>
        <select value={value.projectId} onChange={e => set('projectId', e.target.value)} className={input}>
          <option value="">No project</option>
          {projectOptions.map(p => <option key={p.id} value={p.id}>{p.projectNumber ? `${p.projectNumber} ` : ''}{p.name}</option>)}
        </select>
      </div>
      <div className="col-span-2">
        <label className="block text-xs font-medium text-slate-500 mb-1">Description</label>
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
  const [filterUser, setFilterUser] = useState('all');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo,   setFilterTo]   = useState('');

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

  useEffect(() => { load(); }, [load]);

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

  const th = 'text-[11px] font-semibold text-slate-500 uppercase tracking-wide pb-2 pr-3';

  return (
    <div className="px-4 py-6">
      <SectionTabs tabs={ACTIVITY_TABS} className="mb-5" />
      <div className="max-w-5xl mx-auto space-y-5">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Expenses</h1>
          <p className="text-xs text-slate-500 mt-0.5">What each salesperson spent on clients. Money typed on a sales note lands here on its own; add anything without a meeting below.</p>
        </div>

        {err && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</p>}

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <h2 className="text-sm font-bold text-slate-900 mb-3">Add an expense</h2>
          <ExpenseForm value={form} onChange={setForm} users={users} clients={clients} projects={projects}
            onSubmit={create} busy={busy} submitLabel="Add expense" />
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
            <h2 className="text-sm font-bold text-slate-900">All expenses <span className="font-normal text-slate-400">({rows.length}, {formatMoney(total)})</span></h2>
            <div className="flex items-center gap-2 flex-wrap">
              <select value={filterUser} onChange={e => setFilterUser(e.target.value)} className="text-xs border border-slate-200 rounded-lg px-2 py-1 bg-white text-slate-700">
                <option value="all">Everyone</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.name || u.email}</option>)}
              </select>
              <input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)} className="text-xs border border-slate-200 rounded-lg px-2 py-1 bg-white text-slate-700" />
              <span className="text-xs text-slate-400">to</span>
              <input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)} className="text-xs border border-slate-200 rounded-lg px-2 py-1 bg-white text-slate-700" />
            </div>
          </div>

          {byUser.length > 1 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {byUser.map(([name, cents]) => (
                <span key={name} className="text-[11px] bg-slate-50 border border-slate-200 rounded-full px-2 py-0.5 text-slate-600">{name}: <span className="font-semibold">{formatMoney(cents)}</span></span>
              ))}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-10"><div className="w-5 h-5 border-2 border-slate-200 border-t-orange-500 rounded-full animate-spin" /></div>
          ) : rows.length === 0 ? (
            <p className="text-xs text-slate-500 py-6 text-center">Nothing spent yet. Type an amount on a sales note or add one above.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className={`text-left ${th}`}>Date</th>
                    <th className={`text-left ${th}`}>Who</th>
                    <th className={`text-right ${th}`}>Amount</th>
                    <th className={`text-left ${th}`}>What for</th>
                    <th className={`text-left ${th}`}>Company</th>
                    <th className={`text-left ${th}`}>Project</th>
                    <th className={`text-left ${th}`}>Note</th>
                    <th className={`text-left ${th}`}>Description</th>
                    <th className={th}></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {rows.map(r => (
                    editId === r.id ? (
                      <tr key={r.id}><td colSpan={9} className="py-3">
                        <ExpenseForm value={editForm} onChange={setEditForm} users={users} clients={clients} projects={projects}
                          onSubmit={saveEdit} onCancel={() => { setEditId(null); setEditForm(null); }} busy={busy} submitLabel="Save" />
                      </td></tr>
                    ) : (
                      <tr key={r.id} className="hover:bg-slate-50">
                        <td className="py-2 pr-3 text-slate-700 whitespace-nowrap">{fmtDate(r.spentOn)}</td>
                        <td className="py-2 pr-3 text-slate-700">{r.user?.name || '—'}</td>
                        <td className="py-2 pr-3 text-right font-semibold text-slate-800">{formatMoney(r.amountCents)}</td>
                        <td className="py-2 pr-3 text-slate-500">{categoryLabel(r.category)}</td>
                        <td className="py-2 pr-3">{r.client ? <Link href={`/clients/${r.client.id}`} className="text-slate-700 hover:text-orange-600">{r.client.name}</Link> : <span className="text-slate-400">—</span>}</td>
                        <td className="py-2 pr-3">{r.project ? <Link href={`/projects/${r.project.id}`} className="text-slate-700 hover:text-orange-600">{r.project.name}</Link> : <span className="text-slate-400">—</span>}</td>
                        <td className="py-2 pr-3">{r.note ? <Link href={`/crm/notes?note=${r.note.id}`} className="text-slate-700 hover:text-orange-600">#{r.note.noteNumber}{r.note.title ? ` ${r.note.title}` : ''}</Link> : <span className="text-slate-400">—</span>}</td>
                        <td className="py-2 pr-3 text-slate-500 max-w-[220px] truncate" title={r.description}>{r.description || ''}</td>
                        <td className="py-2 text-right whitespace-nowrap">
                          {r.note ? (
                            <span className="text-[11px] text-slate-400" title="Change the amount on the note itself">from note</span>
                          ) : (
                            <>
                              <button type="button" onClick={() => startEdit(r)} className="text-[11px] font-semibold text-slate-500 hover:text-orange-600 mr-2">Edit</button>
                              <button type="button" onClick={() => archive(r.id)} className="text-[11px] font-semibold text-slate-400 hover:text-red-600">Archive</button>
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
