'use client';
import { useState, useEffect, useCallback } from 'react';
import { NEXT_ACTION_TYPES } from '@/lib/pipeline';

// Weekly Sales Meeting — v1 run-of-show. Two live queues you work down and edit in
// the meeting, so the pipeline maintains itself (no carried-forward doc).
//   A · Awaiting signature   B · Next actions due
// Everything reads straight from the deal data; edits PATCH the project.

const money = v => v ? `$${Math.round(v).toLocaleString()}` : '—';
const fmtDate = d => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
const todayISO = () => { const t = new Date(); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; };

export default function MeetingDashboard() {
  const [data, setData]   = useState(null);
  const [loading, setLoad] = useState(true);

  const load = useCallback(async () => {
    setLoad(true);
    const r = await fetch('/api/sales/meeting');
    setData(r.ok ? await r.json() : { awaitingSignature: [], nextActions: [], salesUsers: [], counts: {} });
    setLoad(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  // Patch a project, then refresh the queues so items move/drop live.
  async function patch(id, body) {
    await fetch(`/api/projects/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    load();
  }

  if (loading) return <div className="p-8 text-sm text-slate-400">Loading the meeting…</div>;
  const users = data.salesUsers || [];
  const c = data.counts || {};

  return (
    <div className="p-6 space-y-6">
      <div>
        <p className="text-[10px] font-bold text-orange-500 uppercase tracking-wider">Sales</p>
        <h1 className="text-xl font-bold text-slate-900">Weekly Meeting</h1>
        <p className="text-xs text-slate-500 mt-0.5">Work each queue top-to-bottom and update as you go — the pipeline stays current, no separate doc.</p>
        <div className="flex gap-2 mt-3 text-xs">
          <span className="px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 font-semibold">{c.awaitingSignature || 0} awaiting signature</span>
          <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 font-semibold">{c.nextActions || 0} next actions</span>
          {c.overdue > 0 && <span className="px-2.5 py-1 rounded-full bg-red-50 text-red-600 font-semibold">{c.overdue} overdue</span>}
        </div>
      </div>

      {/* ── Queue A · Awaiting signature ─────────────────────────────────────── */}
      <Section title="① Awaiting signature" subtitle="Proposals out, not yet signed — longest-waiting first">
        {data.awaitingSignature.length === 0
          ? <Empty>Nothing waiting on a signature. 🎉</Empty>
          : (
            <Table cols={['Deal', 'Client', 'Value', 'Waiting', 'Next action', '']}>
              {data.awaitingSignature.map(d => (
                <tr key={d.id} className="border-t border-slate-100 align-top">
                  <Td><a href={`/project/${d.id}`} className="font-semibold text-slate-800 hover:text-amber-600">{d.name}</a></Td>
                  <Td className="text-slate-500">{d.client || '—'}</Td>
                  <Td className="text-slate-600">{money(d.value)}</Td>
                  <Td><Waiting days={d.daysWaiting} /></Td>
                  <Td><NextAction d={d} users={users} onSave={patch} /></Td>
                  <Td><button onClick={() => patch(d.id, { proposalSentDate: null, designStatus: 'WON', procurementStage: 'PRECONSTRUCTION' })}
                    className="text-[11px] font-semibold text-emerald-600 hover:text-emerald-700 whitespace-nowrap">Signed ✓</button></Td>
                </tr>
              ))}
            </Table>
          )}
      </Section>

      {/* ── Queue B · Next actions due ───────────────────────────────────────── */}
      <Section title="② Next actions due" subtitle="Who owes what, by when — overdue in red">
        {data.nextActions.length === 0
          ? <Empty>No open next actions. Add one on any deal below or from the pipeline.</Empty>
          : (
            <Table cols={['Deal', 'Client', 'Action', 'Owner', 'Due', '']}>
              {data.nextActions.map(d => (
                <tr key={d.id} className={`border-t border-slate-100 align-top ${d.overdue ? 'bg-red-50/40' : ''}`}>
                  <Td><a href={`/project/${d.id}`} className="font-semibold text-slate-800 hover:text-amber-600">{d.name}</a></Td>
                  <Td className="text-slate-500">{d.client || '—'}</Td>
                  <Td colSpan={3} className="p-0"><NextAction d={d} users={users} onSave={patch} inline /></Td>
                  <Td><button onClick={() => patch(d.id, { nextActionType: null, nextActionOwnerId: null, nextActionDueDate: null })}
                    className="text-[11px] font-semibold text-slate-400 hover:text-emerald-600 whitespace-nowrap">Done ✓</button></Td>
                </tr>
              ))}
            </Table>
          )}
      </Section>
    </div>
  );
}

// ── Inline next-action editor (discrete: type + owner + due) ───────────────────
function NextAction({ d, users, onSave, inline }) {
  const set = (patch) => onSave(d.id, patch);
  const sel = 'text-xs bg-transparent border border-slate-200 rounded px-1.5 py-1 outline-none focus:border-amber-400';
  return (
    <div className={`flex ${inline ? 'gap-3' : 'gap-1.5 flex-wrap'} items-center`}>
      <select value={d.nextActionType || ''} onChange={e => set({ nextActionType: e.target.value })} className={`${sel} ${d.nextActionType ? 'font-semibold text-slate-700' : 'text-slate-400'}`}>
        <option value="">+ action…</option>
        {NEXT_ACTION_TYPES.map(a => <option key={a.key} value={a.key}>{a.label}</option>)}
      </select>
      {d.nextActionType && (
        <>
          <select value={d.nextActionOwnerId || ''} onChange={e => set({ nextActionOwnerId: e.target.value })} className={`${sel} ${d.nextActionOwnerId ? 'text-slate-700' : 'text-slate-400'}`}>
            <option value="">owner…</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
          <input type="date" value={d.nextActionDueDate ? new Date(d.nextActionDueDate).toISOString().slice(0, 10) : ''}
            onChange={e => set({ nextActionDueDate: e.target.value || null })}
            className={`${sel} ${d.overdue ? 'text-red-600 border-red-300 font-semibold' : 'text-slate-600'}`} />
        </>
      )}
    </div>
  );
}

// ── little presentational helpers ─────────────────────────────────────────────
function Section({ title, subtitle, children }) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100">
        <h2 className="text-sm font-bold text-slate-800">{title}</h2>
        <p className="text-[11px] text-slate-500">{subtitle}</p>
      </div>
      <div className="p-3">{children}</div>
    </div>
  );
}
function Table({ cols, children }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead><tr className="text-slate-400 text-left">{cols.map((c, i) => <th key={i} className="px-2 py-1.5 font-semibold">{c}</th>)}</tr></thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
function Td({ children, className = '', ...rest }) { return <td className={`px-2 py-2 ${className}`} {...rest}>{children}</td>; }
function Empty({ children }) { return <p className="text-xs text-slate-400 text-center py-6">{children}</p>; }
function Waiting({ days }) {
  if (days == null) return <span className="text-slate-400">—</span>;
  const cls = days >= 14 ? 'bg-red-50 text-red-600' : days >= 7 ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-500';
  return <span className={`px-1.5 py-0.5 rounded font-semibold ${cls}`}>{days}d</span>;
}
