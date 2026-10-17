'use client';
/**
 * The company portal (migration 0132, Mike 10-16): "a very simple portal
 * with no password for now, just an email and all identical suffixes become
 * part of a company".
 *
 * A visitor types a work email. The page lists every budget from that
 * email's company, grouped by project. Each one can be copied; an unfinished
 * one can be opened and carried on; every one has a history of who changed
 * what. "Is X the same project as Y?" is asked only of the person who made
 * the newer budget. The shared tool password (the layout) gates the page;
 * the email is remembered in this browser only.
 */
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { formatCurrency } from '@/lib/format';

const EMAIL_KEY = 'ilc.conceptualBudget.portalEmail';
const BTN = 'px-4 py-2 text-sm font-semibold rounded-lg';
const ORANGE = `${BTN} bg-orange-500 hover:bg-orange-600 text-white disabled:opacity-50`;
const PLAIN = `${BTN} border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50`;

function readEmail() { try { return localStorage.getItem(EMAIL_KEY) || ''; } catch { return ''; } }
function writeEmail(v) { try { if (v) localStorage.setItem(EMAIL_KEY, v); else localStorage.removeItem(EMAIL_KEY); } catch {} }

async function post(path, body) {
  const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error || 'Something went wrong. Please try again.');
  return out;
}

const when = iso => (iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '');
const whenAt = iso => (iso ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '');
const openHref = (id, email) => `/conceptual_budget?open=${encodeURIComponent(id)}&as=${encodeURIComponent(email)}`;

export default function MyBudgetsClient() {
  const [email, setEmail] = useState('');
  const [typed, setTyped] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [history, setHistory] = useState(null); // { draftId, loading, body }
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async (who) => {
    setLoading(true); setErr('');
    try {
      const out = await post('/api/intake/portal/list', { email: who });
      setData(out);
      setEmail(out.email);
      writeEmail(out.email);
    } catch (e) {
      setErr(e.message);
      setData(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const saved = readEmail();
    if (saved) { setTyped(saved); load(saved); }
  }, [load]);

  function submitEmail(e) {
    e.preventDefault();
    const v = typed.trim().toLowerCase();
    if (!v) return;
    load(v);
  }

  function forget() {
    writeEmail('');
    setEmail(''); setTyped(''); setData(null); setHistory(null); setErr('');
  }

  async function copyBudget(id) {
    setBusyId(id); setErr('');
    try {
      const out = await post('/api/intake/portal/copy', { email, draftId: id });
      window.location.href = openHref(out.draftId, email);
      return;
    } catch (e) { setErr(e.message); }
    setBusyId(null);
  }

  async function answerAsk(ask, same) {
    setBusyId(ask.draftId); setErr('');
    try {
      await post('/api/intake/portal/match', { email, draftId: ask.draftId, otherDraftId: ask.otherDraftId, same });
      await load(email);
    } catch (e) { setErr(e.message); }
    setBusyId(null);
  }

  async function showHistory(id) {
    if (history?.draftId === id) { setHistory(null); return; }
    setHistory({ draftId: id, loading: true, body: null });
    try {
      const body = await post('/api/intake/portal/history', { email, draftId: id });
      setHistory({ draftId: id, loading: false, body });
    } catch (e) {
      setHistory(null);
      setErr(e.message);
    }
  }

  const groups = data?.groups || [];
  const asks = data?.asks || [];
  const total = groups.reduce((n, g) => n + g.budgets.length, 0);

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="max-w-3xl mx-auto px-4 py-8 sm:py-12">
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-6">
          <h1 className="text-2xl font-bold text-slate-900">My company&apos;s budgets</h1>
          <Link href="/conceptual_budget" className="text-sm font-semibold text-orange-600 hover:text-orange-700">Start a new budget</Link>
        </div>

        {!email && (
          <form onSubmit={submitEmail} className="bg-white rounded-2xl border border-slate-200 p-6">
            <p className="text-sm text-slate-700">Type your work email. We will show every budget anyone at your company has started here.</p>
            <p className="text-xs text-slate-500 mt-1">Work emails only. A personal email such as gmail.com is not accepted.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <input
                type="email" required autoComplete="email" value={typed} onChange={e => setTyped(e.target.value)}
                placeholder="you@yourcompany.com"
                className="flex-1 min-w-[220px] rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <button type="submit" className={ORANGE} disabled={loading}>{loading ? 'Looking...' : 'Show my budgets'}</button>
            </div>
            {err && <p className="mt-3 text-sm text-rose-600">{err}</p>}
          </form>
        )}

        {email && (
          <>
            <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600 mb-4">
              <span>Showing budgets from everyone at <span className="font-semibold text-slate-800">{data?.domain || email.split('@').pop()}</span>, as {email}.</span>
              <button type="button" className="text-xs font-semibold text-slate-500 hover:text-slate-700 underline" onClick={forget}>Not you?</button>
            </div>
            {err && <p className="mb-4 text-sm text-rose-600">{err}</p>}
            {loading && !data && <p className="text-sm text-slate-500">Looking...</p>}

            {asks.length > 0 && (
              <section className="mb-6 rounded-2xl border border-amber-300 bg-amber-50 p-4">
                <h2 className="text-sm font-semibold text-slate-900">Quick question</h2>
                <ul className="mt-2 space-y-3">
                  {asks.map(a => (
                    <li key={`${a.draftId}:${a.otherDraftId}`} className="text-sm text-slate-800">
                      <p>Is <span className="font-semibold">{a.newerName}</span> the same project as <span className="font-semibold">{a.olderName}</span>?</p>
                      <div className="mt-2 flex gap-2">
                        <button type="button" className={ORANGE} disabled={busyId === a.draftId} onClick={() => answerAsk(a, true)}>Yes, same project</button>
                        <button type="button" className={PLAIN} disabled={busyId === a.draftId} onClick={() => answerAsk(a, false)}>No, different</button>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {data && total === 0 && (
              <div className="bg-white rounded-2xl border border-slate-200 p-6 text-sm text-slate-600">
                Nobody at your company has started a budget here yet.{' '}
                <Link href="/conceptual_budget" className="font-semibold text-orange-600 hover:text-orange-700">Start the first one</Link>.
              </div>
            )}

            {groups.map(g => (
              <section key={g.key} className="mb-6">
                <h2 className="text-base font-semibold text-slate-900 mb-2">{g.name}{g.budgets.length > 1 ? ` (${g.budgets.length} budgets)` : ''}</h2>
                <ul className="space-y-3">
                  {g.budgets.map(b => (
                    <li key={b.id} className="bg-white rounded-2xl border border-slate-200 p-4">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3 text-sm">
                        <Field label="Description" value={b.budgetName || 'Budget'} strong />
                        <Field label="Location" value={[b.city, b.state].filter(Boolean).join(', ')} />
                        <Field label="Building type" value={b.buildingTypeLabel} />
                        <Field label="Units" value={b.unitCount ? Number(b.unitCount).toLocaleString() : ''} />
                        <Field label="Gross SF" value={b.grossSf ? Number(b.grossSf).toLocaleString() : ''} />
                        <Field label="Estimate" value={b.estimate ? formatCurrency(b.estimate) : ''} strong />
                        <Field label="Status" value={b.stage?.label} />
                        <Field label="Copied from" value={b.copiedFrom?.projectName} sub={b.copiedFrom?.email} />
                        <Field label="Started" value={when(b.createdAt)} sub={b.createdBy} />
                        <Field label="Last changed" value={b.changedAt && b.changedAt !== b.createdAt ? when(b.changedAt) : ''} sub={b.changedAt && b.changedAt !== b.createdAt ? b.changedBy : ''} />
                        <Field label="Sent to ILC" value={b.sentAt ? when(b.sentAt) : ''} />
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {b.canOpen && (
                          <a href={openHref(b.id, email)} className={ORANGE}>Open and continue</a>
                        )}
                        <button type="button" className={PLAIN} disabled={busyId === b.id} onClick={() => copyBudget(b.id)}>
                          {busyId === b.id ? 'Copying...' : 'Copy'}
                        </button>
                        <button type="button" className={PLAIN} onClick={() => showHistory(b.id)}>
                          {history?.draftId === b.id ? 'Hide history' : 'History'}
                        </button>
                      </div>
                      {history?.draftId === b.id && (
                        <div className="mt-3 pt-3 border-t border-slate-100 overflow-x-auto">
                          {history.loading && <p className="text-xs text-slate-500">Loading...</p>}
                          {history.body && <HistoryList body={history.body} />}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </>
        )}
      </div>
    </main>
  );
}

// One labeled field: the label above the value, a dash when there is nothing to show.
function Field({ label, value, sub, strong }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={strong ? 'font-semibold text-slate-900' : 'text-slate-800'}>{value || '-'}</div>
      {sub ? <div className="text-xs text-slate-500 truncate">{sub}</div> : null}
    </div>
  );
}

function HistoryList({ body }) {
  const saves = (body.saves || []).filter(s => s.changes.length || s.kind !== 'save');
  if (!saves.length) return <p className="text-xs text-slate-500">No changes recorded yet.</p>;
  return (
    <table className="min-w-full text-xs">
      <thead>
        <tr className="text-left uppercase tracking-wide text-slate-500 border-b border-slate-200">
          <th className="px-2 py-1 font-semibold">When</th>
          <th className="px-2 py-1 font-semibold">Who</th>
          <th className="px-2 py-1 font-semibold">Action</th>
          <th className="px-2 py-1 font-semibold">Step</th>
          <th className="px-2 py-1 font-semibold">Field</th>
          <th className="px-2 py-1 font-semibold">Before</th>
          <th className="px-2 py-1 font-semibold">After</th>
        </tr>
      </thead>
      <tbody>
        {saves.map(s => {
          const action = s.kind === 'created' ? 'Started' : s.kind === 'copied' ? 'Copied' : 'Saved';
          const rows = s.changes.length ? s.changes : [null];
          return rows.map((c, i) => (
            <tr key={s.id + ':' + i} className="border-b border-slate-100 align-top text-slate-700">
              <td className="px-2 py-1 whitespace-nowrap">{i === 0 ? whenAt(s.savedAt) : ''}</td>
              <td className="px-2 py-1">{i === 0 ? s.email : ''}</td>
              <td className="px-2 py-1">{i === 0 ? action : ''}</td>
              <td className="px-2 py-1">{i === 0 ? (s.step || '') : ''}</td>
              <td className="px-2 py-1 font-medium">{c ? c.label : ''}</td>
              <td className="px-2 py-1 text-slate-400">{c ? (c.before || '') : ''}</td>
              <td className="px-2 py-1">{c ? (c.after || 'blank') : ''}</td>
            </tr>
          ));
        })}
      </tbody>
    </table>
  );
}
