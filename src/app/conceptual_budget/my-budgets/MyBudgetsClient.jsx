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
 * the newer budget. Two or three budgets can be compared side by side (Mike
 * 10-17), the rows that differ marked. The shared tool password (the layout) gates the page;
 * the email is remembered in this browser only.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { PORTAL_FIELDS, applyPortalView, activeFilterCount, portalChoices } from '@/lib/intake/portalFilter';
import Link from 'next/link';
import { PublicBugLink } from '@/components/public/PublicBugButton';
import { formatCurrency } from '@/lib/format';
import { useUrlView } from '@/lib/useUrlView';
import { FilterToolbar, FilterPanel } from '@/components/ui/FilterPanel';
import { SortSelect } from '@/components/ui/SortHeader';
import { WidgetLoading } from '@/components/ui/WidgetFrame';
import { MAX_COMPARE } from '@/lib/intake/compareBudgets';
import CompareBudgetsTable from '@/components/intake/CompareBudgetsTable';
import { readRememberedEmail, rememberEmail } from '@/lib/publicVisitor';
import { BTN_PRIMARY, BTN_SECONDARY, CARD_PADDED, H1, H2, INPUT, LABEL, HELPER, NUM, TH, TD } from '@/components/ui/tokens';

const ORANGE = BTN_PRIMARY;
const PLAIN = BTN_SECONDARY;

const readEmail = readRememberedEmail;
const writeEmail = rememberEmail;

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
  // Compare (Mike 10-17): tick up to three budgets, then Compare.
  const [picked, setPicked] = useState([]);
  const [compare, setCompare] = useState(null); // { loading, body }
  // Filter and sort (Mike 10-16): a funnel button opens the panel, every
  // card field is a filter, one select picks the sort.
  const { filters, setFilter, clearFilters, sort, setSort, ready } = useUrlView({ fields: PORTAL_FIELDS, sortDefault: { key: '', dir: 'asc' } });
  const [filtersOpen, setFiltersOpen] = useState(false);

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
    // The wizard links here with ?as=<work email> (Mike 10-16); the address
    // typed there wins over the one remembered in this browser.
    let fromLink = '';
    try { fromLink = new URLSearchParams(window.location.search).get('as') || ''; } catch {}
    const saved = fromLink.trim().toLowerCase() || readEmail();
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
    setEmail(''); setTyped(''); setData(null); setHistory(null); setErr(''); setPicked([]); setCompare(null);
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

  function togglePick(id) {
    setPicked(p => (p.includes(id) ? p.filter(x => x !== id) : p.length >= MAX_COMPARE ? p : [...p, id]));
  }

  async function runCompare() {
    setCompare({ loading: true, body: null }); setErr('');
    try {
      const body = await post('/api/intake/portal/compare', { email, draftIds: picked });
      setCompare({ loading: false, body });
      try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch {}
    } catch (e) {
      setCompare(null);
      setErr(e.message);
    }
  }

  const allGroups = data?.groups || [];
  const asks = data?.asks || [];
  const total = allGroups.reduce((n, g) => n + g.budgets.length, 0);
  const groups = useMemo(() => (ready ? applyPortalView(allGroups, filters, sort) : allGroups), [allGroups, filters, sort, ready]);
  const shown = groups.reduce((n, g) => n + g.budgets.length, 0);
  const choices = useMemo(() => portalChoices(allGroups), [allGroups]);
  const activeFilters = activeFilterCount(filters);

  return (
    <main className="min-h-screen bg-slate-50">
      {/* Mike 10-17: built for a monitor, still fine on a phone. */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-6">
          <h1 className={H1}>My company&apos;s budgets</h1>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
            <Link href="/conceptual_budget" className="text-sm font-semibold text-orange-600 hover:text-orange-700">Start a new budget</Link>
            <PublicBugLink />
          </div>
        </div>

        {!email && (
          <form onSubmit={submitEmail} className={`${CARD_PADDED} max-w-2xl`}>
            <p className="text-sm text-slate-700">Type your work email. We will show every budget anyone at your company has started here.</p>
            <p className={`${HELPER} mt-1`}>Work emails only. A personal email such as gmail.com is not accepted.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <input
                type="email" required autoComplete="email" value={typed} onChange={e => setTyped(e.target.value)}
                placeholder="you@yourcompany.com"
                className={`${INPUT} flex-1 min-w-[220px]`}
              />
              <button type="submit" className={ORANGE} disabled={loading}>{loading ? 'Looking...' : 'Show my budgets'}</button>
            </div>
            {err && <p className="mt-3 text-sm text-red-600">{err}</p>}
          </form>
        )}

        {email && (
          <>
            <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600 mb-4">
              <span>Showing budgets from everyone at <span className="font-semibold text-slate-800">{data?.domain || email.split('@').pop()}</span>, as {email}.</span>
              <button type="button" className="text-xs font-semibold text-slate-500 hover:text-slate-700 underline" onClick={forget}>Not you?</button>
            </div>
            {err && <p className="mb-4 text-sm text-red-600">{err}</p>}
            {loading && !data && <p className="text-sm text-slate-500">Looking...</p>}

            {asks.length > 0 && (
              <section className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
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

            {data && total > 0 && (
              <div className="mb-4">
                <FilterToolbar
                  count={activeFilters}
                  open={filtersOpen}
                  onToggle={() => setFiltersOpen(o => !o)}
                  onClear={clearFilters}
                  shown={shown}
                  total={total}
                  noun="budgets"
                  right={<SortSelect fields={PORTAL_FIELDS} sort={sort} onChange={setSort} />}
                />
                <FilterPanel open={filtersOpen} fields={PORTAL_FIELDS} filters={filters} choices={choices} onChange={setFilter} />
              </div>
            )}

            {compare && (
              <section className={`${CARD_PADDED} mb-6`}>
                {compare.loading && <WidgetLoading />}
                {compare.body && <CompareBudgetsTable body={compare.body} onClose={() => setCompare(null)} />}
              </section>
            )}

            {picked.length > 0 && (
              <div className="sticky top-0 z-10 mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm shadow-sm">
                <span className="text-slate-800">
                  {picked.length} of {MAX_COMPARE} picked{picked.length < 2 ? ', pick one more to compare' : ''}.
                </span>
                <button type="button" className={ORANGE} disabled={picked.length < 2 || compare?.loading} onClick={runCompare}>
                  {compare?.loading ? 'Comparing...' : `Compare ${picked.length} budgets`}
                </button>
                <button type="button" className="text-xs font-semibold text-slate-500 hover:text-slate-700 underline" onClick={() => setPicked([])}>Clear</button>
              </div>
            )}

            {data && total > 0 && shown === 0 && (
              <div className={`${CARD_PADDED} text-sm text-slate-600`}>
                No budget matches these filters.
              </div>
            )}

            {data && total === 0 && (
              <div className={`${CARD_PADDED} text-sm text-slate-600`}>
                Nobody at your company has started a budget here yet.{' '}
                <Link href="/conceptual_budget" className="font-semibold text-orange-600 hover:text-orange-700">Start the first one</Link>.
              </div>
            )}

            {groups.map(g => (
              <section key={g.key} className="mb-6">
                <h2 className={`${H2} mb-2`}>{g.name}{g.budgets.length > 1 ? ` (${g.budgets.length} budgets)` : ''}</h2>
                <ul className="space-y-3">
                  {g.budgets.map(b => (
                    <li key={b.id} className={CARD_PADDED}>
                      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-x-6 gap-y-3 text-sm">
                        <Field label="Description" value={b.budgetName || 'Budget'} strong />
                        <Field label="Location" value={[b.city, b.state].filter(Boolean).join(', ')} />
                        <Field label="Building type" value={b.buildingTypeLabel} />
                        <Field label="Units" value={b.unitCount ? Number(b.unitCount).toLocaleString() : ''} num />
                        <Field label="Gross SF" value={b.grossSf ? Number(b.grossSf).toLocaleString() : ''} num />
                        <Field label="Budget" value={b.estimate ? formatCurrency(b.estimate) : ''} strong num />
                        <Field label="Status" value={b.stage?.label} />
                        <Field label="Copied from" value={b.copiedFrom?.projectName} sub={b.copiedFrom?.email} />
                        <Field label="Started" value={when(b.createdAt)} sub={b.createdBy} num />
                        <Field label="Last changed" value={b.changedAt && b.changedAt !== b.createdAt ? when(b.changedAt) : ''} sub={b.changedAt && b.changedAt !== b.createdAt ? b.changedBy : ''} num />
                        <Field label="Sent to Logiq" value={b.sentAt ? when(b.sentAt) : ''} num />
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        {b.canOpen && (
                          <a href={openHref(b.id, email)} className={ORANGE}>Open and continue</a>
                        )}
                        <button type="button" className={PLAIN} disabled={busyId === b.id} onClick={() => copyBudget(b.id)}>
                          {busyId === b.id ? 'Copying...' : 'Copy'}
                        </button>
                        <button type="button" className={PLAIN} onClick={() => showHistory(b.id)}>
                          {history?.draftId === b.id ? 'Hide history' : 'History'}
                        </button>
                        <label className={`ml-auto inline-flex items-center gap-2 text-sm ${!picked.includes(b.id) && picked.length >= MAX_COMPARE ? 'text-slate-400' : 'text-slate-700 cursor-pointer'}`}>
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-slate-300 text-orange-600 focus:ring-orange-500"
                            checked={picked.includes(b.id)}
                            disabled={!picked.includes(b.id) && picked.length >= MAX_COMPARE}
                            onChange={() => togglePick(b.id)}
                          />
                          Compare
                        </label>
                      </div>
                      {history?.draftId === b.id && (
                        <div className="mt-3 pt-3 border-t border-slate-100 overflow-x-auto">
                          {history.loading && <WidgetLoading />}
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
function Field({ label, value, sub, strong, num }) {
  return (
    <div className="min-w-0">
      <div className={LABEL}>{label}</div>
      <div className={`${strong ? 'font-semibold text-slate-900' : 'text-slate-800'}${num ? ` ${NUM}` : ''}`}>{value || '-'}</div>
      {sub ? <div className={`${HELPER} truncate`}>{sub}</div> : null}
    </div>
  );
}


function HistoryList({ body }) {
  const saves = (body.saves || []).filter(s => s.changes.length || s.kind !== 'save');
  if (!saves.length) return <p className={HELPER}>No changes recorded yet.</p>;
  return (
    <table className="min-w-full text-xs">
      <thead>
        <tr className="border-b border-slate-200">
          <th className={TH}>When</th>
          <th className={TH}>Who</th>
          <th className={TH}>Action</th>
          <th className={TH}>Step</th>
          <th className={TH}>Field</th>
          <th className={TH}>Before</th>
          <th className={TH}>After</th>
        </tr>
      </thead>
      <tbody>
        {saves.map(s => {
          const action = s.kind === 'created' ? 'Started' : s.kind === 'copied' ? 'Copied' : 'Saved';
          const rows = s.changes.length ? s.changes : [null];
          return rows.map((c, i) => (
            <tr key={s.id + ':' + i} className="border-b border-slate-100 align-top">
              <td className={`${TD} ${NUM} whitespace-nowrap`}>{i === 0 ? whenAt(s.savedAt) : ''}</td>
              <td className={TD}>{i === 0 ? s.email : ''}</td>
              <td className={TD}>{i === 0 ? action : ''}</td>
              <td className={TD}>{i === 0 ? (s.step || '') : ''}</td>
              <td className={`${TD} font-medium`}>{c ? c.label : ''}</td>
              <td className={`${TD} text-slate-500`}>{c ? (c.before || '') : ''}</td>
              <td className={TD}>{c ? (c.after || 'blank') : ''}</td>
            </tr>
          ));
        })}
      </tbody>
    </table>
  );
}
