'use client';
import { useMemo } from 'react';
import { EXPENSE_CATEGORIES } from '@/lib/sales/expenses';
import { BTN_PRIMARY, BTN_SECONDARY, INPUT, LABEL } from '@/components/ui/tokens';

const label = `block ${LABEL} mb-1`;

export const todayInput = () => new Date().toISOString().slice(0, 10);
export const blankExpenseForm = (userId = '') => ({ userId, spentOn: todayInput(), amount: '', category: 'MEAL', vendor: '', clientId: '', projectId: '', description: '' });

export default function ExpenseForm({ value, onChange, users, clients, projects, onSubmit, onCancel, busy, submitLabel, extraActions }) {
  const set = (k, v) => onChange({ ...value, [k]: v });
  const projectOptions = useMemo(
    () => value.clientId ? projects.filter(p => p.clientId === value.clientId) : projects,
    [projects, value.clientId]
  );
  return (
    <form onSubmit={onSubmit} className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <div>
        <label className={label}>Who</label>
        <select value={value.userId} onChange={e => set('userId', e.target.value)} className={INPUT}>
          <option value="">Pick a person</option>
          {users.map(u => <option key={u.id} value={u.id}>{u.name || u.email}</option>)}
        </select>
      </div>
      <div>
        <label className={label}>Date</label>
        <input type="date" value={value.spentOn} onChange={e => set('spentOn', e.target.value)} className={INPUT} />
      </div>
      <div>
        <label className={label}>Amount <span className="font-normal normal-case text-slate-500">($)</span></label>
        <input inputMode="decimal" value={value.amount} onChange={e => set('amount', e.target.value)} placeholder="0.00" className={INPUT} />
      </div>
      <div>
        <label className={label}>What for</label>
        <select value={value.category} onChange={e => set('category', e.target.value)} className={INPUT}>
          {EXPENSE_CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
        </select>
      </div>
      <div>
        <label className={label}>Vendor</label>
        <input value={value.vendor} onChange={e => set('vendor', e.target.value)} placeholder="Fogo de Chao" className={INPUT} />
      </div>
      <div>
        <label className={label}>Company</label>
        <select value={value.clientId} onChange={e => onChange({ ...value, clientId: e.target.value, projectId: '' })} className={INPUT}>
          <option value="">No company</option>
          {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <div className="col-span-2">
        <label className={label}>Project <span className="font-normal normal-case text-slate-500">(optional)</span></label>
        <select value={value.projectId} onChange={e => set('projectId', e.target.value)} className={INPUT}>
          <option value="">No project</option>
          {projectOptions.map(p => <option key={p.id} value={p.id}>{p.projectNumber ? `${p.projectNumber} ` : ''}{p.name}</option>)}
        </select>
      </div>
      <div className="col-span-2 sm:col-span-4">
        <label className={label}>Description</label>
        <input value={value.description} onChange={e => set('description', e.target.value)} placeholder="Dinner with the Hines team" className={INPUT} />
      </div>
      <div className="col-span-2 sm:col-span-4 flex flex-wrap items-center gap-2">
        <button type="submit" disabled={busy} className={BTN_PRIMARY}>{busy ? 'Saving…' : submitLabel}</button>
        {onCancel && <button type="button" onClick={onCancel} className={BTN_SECONDARY}>Cancel</button>}
        {extraActions}
      </div>
    </form>
  );
}
