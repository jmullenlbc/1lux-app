'use client';
import { Fragment, useState } from 'react';
import { formatCurrency } from '@/lib/format';
import { BTN_SECONDARY, H2, HELPER, NUM, TH, TD } from '@/components/ui/tokens';

// Two or three web budgets side by side (Mike 10-17). Used by the company
// portal (/conceptual_budget/my-budgets) and Sales on My Desk (Mike 10-18).
// Rows come from compareBudgetRows (src/lib/intake/compareBudgets.js).

function showValue(kind, v) {
  if (v == null || v === '') return '';
  if (kind === 'money') return formatCurrency(v);
  if (kind === 'perSf') return `${Number(v).toFixed(2)}`;
  if (kind === 'count') return Number(v).toLocaleString();
  return String(v);
}

// "+$12,000" against the first budget, for dollar rows that moved.
function deltaOf(kind, v, first) {
  if (kind !== 'money' && kind !== 'perSf') return null;
  const d = (Number(v) || 0) - (Number(first) || 0);
  if (Math.abs(d) < 0.005) return null;
  const amount = kind === 'perSf' ? `${Math.abs(d).toFixed(2)}` : formatCurrency(Math.abs(d));
  return { up: d > 0, words: `${d > 0 ? '+' : '-'}${amount}` };
}

function CompareRow({ r, indent, strong }) {
  return (
    <tr className={`border-b border-slate-100 align-top ${r.differs ? 'bg-amber-50' : ''}`}>
      <td className={`${TD} ${indent ? 'pl-6 text-slate-500' : 'text-slate-700'} ${strong ? 'font-semibold text-slate-900' : ''}`}>{r.label}</td>
      {r.values.map((v, i) => {
        const delta = i > 0 && r.differs ? deltaOf(r.kind, v, r.values[0]) : null;
        return (
          <td key={i} className={`${TD} ${r.kind === 'text' ? '' : `text-right ${NUM}`} ${strong ? 'font-semibold text-slate-900' : ''}`}>
            {showValue(r.kind, v) || <span className="text-slate-300">-</span>}
            {delta && <div className={`text-xs font-normal ${delta.up ? 'text-red-600' : 'text-emerald-700'}`}>{delta.words}</div>}
          </td>
        );
      })}
    </tr>
  );
}

/** Two or three budgets side by side (Mike 10-17); rows that differ are shaded. */
export default function CompareBudgetsTable({ body, onClose }) {
  const [onlyDiff, setOnlyDiff] = useState(false);
  const n = body.ids.length;
  const keep = r => !onlyDiff || r.differs || (r.details || []).some(d => d.differs);
  const heads = body.facts.find(r => r.key === 'projectName')?.values || [];
  const names = body.facts.find(r => r.key === 'budgetName')?.values || [];
  const facts = body.facts.filter(r => r.key !== 'projectName' && r.key !== 'budgetName').filter(keep);
  const totals = body.totals.filter(keep);
  const lines = body.lines.filter(keep);
  const choices = body.choices.filter(keep);
  const Head = ({ label }) => (
    <tr><td colSpan={n + 1} className="pt-4 pb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</td></tr>
  );

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
        <h2 className={H2}>Compare budgets</h2>
        <div className="flex flex-wrap items-center gap-4">
          <label className="inline-flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
            <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-orange-600 focus:ring-orange-500" checked={onlyDiff} onChange={e => setOnlyDiff(e.target.checked)} />
            Only what differs
          </label>
          <button type="button" className={BTN_SECONDARY} onClick={onClose}>Close</button>
        </div>
      </div>
      <p className={HELPER}>Rows that differ are shaded. Under the second and third budget is the change against the first.</p>
      <div className="mt-3 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 align-bottom">
              <th className={TH}><span className="sr-only">Line</span></th>
              {body.ids.map((id, i) => (
                <th key={id} className={`${TH} text-right normal-case`}>
                  <span className="block font-semibold text-slate-900">{heads[i] || 'Budget'}</span>
                  <span className="block font-normal text-slate-500">{names[i]}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {totals.length > 0 && <Head label="Totals" />}
            {totals.map(r => <CompareRow key={r.key} r={r} strong={r.strong} />)}
            {lines.length > 0 && <Head label="Budget breakdown" />}
            {lines.map(c => (
              <Fragment key={c.key}>
                <CompareRow r={c} strong />
                {c.details.filter(keep).map(d => <CompareRow key={d.key} r={d} indent />)}
              </Fragment>
            ))}
            {facts.length > 0 && <Head label="Project" />}
            {facts.map(r => <CompareRow key={r.key} r={r} />)}
            {choices.length > 0 && <Head label="Answers and figures" />}
            {choices.map(r => <CompareRow key={r.key} r={r} />)}
            {onlyDiff && !totals.length && !lines.length && !facts.length && !choices.length && (
              <tr><td colSpan={n + 1} className={`${TD} text-slate-500`}>Nothing differs between these budgets.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {body.totals.length === 0 && (
        <p className={`${HELPER} mt-3`}>No dollars yet: these budgets are not far enough along to price.</p>
      )}
    </div>
  );
}
