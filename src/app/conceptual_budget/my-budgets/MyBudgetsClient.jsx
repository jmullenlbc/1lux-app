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
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-900">{b.budgetName || 'Budget'}<span className="font-normal text-slate-500"> for {b.projectName}</span></p>
                          <p className="text-xs text-slate-500">
                            {[[b.city, b.state].filter(Boolean).join(', '), b.buildingTypeLabel, b.unitCount ? `${b.unitCount} units` : null, b.grossSf ? `${Number(b.grossSf).toLocaleString()} SF` : null].filter(Boolean).join(' · ')}
                          </p>
                          {b.copiedFrom && (
                            <p className="text-xs text-slate-500 mt-1">Copy of <span className="font-semibold">{b.copiedFrom.projectName}</span> (made by {b.copiedFrom.email})</p>
                          )}
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold text-slate-900">{b.estimate ? formatCurrency(b.estimate) : 'No estimate yet'}</p>
                          <p className="text-xs text-slate-500">{b.stage?.label || ""}</p>
                        </div>
                      </div>
                      <p className="mt-2 text-xs text-slate-500">
                        Started by {b.createdBy} on {when(b.createdAt)}.
                        {b.changedAt && b.changedAt !== b.createdAt ? ` Last changed by ${b.changedBy} on ${when(b.changedAt)}.` : ''}
                        {b.sentAt ? ` Sent to ILC on ${when(b.sentAt)}.` : ''}
                      </p>
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
                        <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
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

function HistoryList({ body }) {
  const saves = (body.saves || []).filter(s => s.changes.length || s.kind !== 'save');
  if (!saves.length) return <p className="text-xs text-slate-500">No changes recorded yet.</p>;
  return (
    <ol className="space-y-3">
      {saves.map(s => (
        <li key={s.id} className="text-xs text-slate-700">
          <p className="font-semibold text-slate-800">
            {s.kind === 'created' ? 'Started' : s.kind === 'copied' ? 'Copied' : 'Saved'} by {s.email} on {whenAt(s.savedAt)}{s.step ? ` (${s.step})` : ''}
          </p>
          {s.changes.length > 0 && (
            <ul className="mt-1 space-y-0.5 pl-3">
              {s.changes.map((c, i) => (
                <li key={i}>
                  <span className="font-medium">{c.label}</span>: {c.before ? <><span className="line-through text-slate-400">{c.before}</span> to </> : ''}<span>{c.after || 'blank'}</span>
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ol>
  );
}
