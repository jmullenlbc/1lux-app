'use client';
import { useState, useEffect, useMemo } from 'react';
import SectionTabs, { MARKET_INTEL_TABS } from '@/components/ui/SectionTabs';
import { MARKETS, DEFAULT_MARKET, RETIRED, marketLabel, missingSources, isRetired, retiredStillActive, movedSources } from '@/lib/market-intel/sourceCatalog';

/**
 * Market Sources.
 *
 * Grouped by the town a paper reports from, because that grouping is the whole
 * finding: a list of thirty-five sources that is thirty-four national trade
 * papers has no coverage anywhere. Seeing "Houston · 2" is seeing the gap.
 */

const PROJECT_TYPE_LABELS = {
  MARKET_RATE:     'Market Rate',
  AFFORDABLE:      'Affordable',
  STUDENT_HOUSING: 'Student Housing',
  SENIOR_LIVING:   'Senior Living',
};

export default function MarketSourcesPage() {
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [seedLog, setSeedLog] = useState(null);
  const [polling, setPolling] = useState(false);
  const [pollLog, setPollLog] = useState(null);
  const [retiring, setRetiring] = useState(false);
  // Learned rules (0130, Mike 10-9): what "Not relevant" presses propose; a
  // Sales Admin applies or ignores each one. Nothing applies on its own.
  const [rules,    setRules]    = useState([]);
  const [week,     setWeek]     = useState(null);
  const [deciding, setDeciding] = useState('');
  const [canDecide, setCanDecide] = useState(false);   // Sales sees the list; Sales Admin or admin decides

  async function loadRules() {
    const res = await fetch('/api/market-intel/rules');
    if (!res.ok) return;
    const d = await res.json();
    setRules(d.rules || []);
    setWeek(d.week || null);
    setCanDecide(!!d.canDecide);
  }
  async function decideRule(id, status) {
    setDeciding(id);
    try {
      const res  = await fetch('/api/market-intel/rules', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { alert(data.error || 'Could not save'); return; }
      await loadRules();
    } finally { setDeciding(''); }
  }
  useEffect(() => { loadRules(); }, []);

  async function loadSources() {
    setLoading(true);
    const res = await fetch('/api/market-intel/sources');
    if (res.ok) setSources(await res.json());
    setLoading(false);
  }

  useEffect(() => { loadSources(); }, []);

  // What the catalog knows about that this database does not.
  const missing = useMemo(() => missingSources(sources.map(s => s.name)), [sources]);

  // Sources we have given up on that are still switched on here. Each one costs
  // the poller ten seconds of waiting and returns nothing.
  const dead = useMemo(() => retiredStillActive(sources), [sources]);
  const reasonFor = name => RETIRED.find(r => r.name.trim().toLowerCase() === String(name).trim().toLowerCase())?.reason;

  // Sources still on a feed address the paper has moved away from (10-8). The
  // same "Update sources" press repairs them.
  const moved = useMemo(() => movedSources(sources), [sources]);
  const movedNames = useMemo(() => new Set(moved.map(m => m.row.name)), [moved]);
  const updates = missing.length + moved.length;

  // Click a column header to sort within every market group; click again to
  // flip (Mike 10-8). Default is the order the API returns.
  const [sortKey, setSortKey] = useState('');
  const [sortDir, setSortDir] = useState('asc');
  function toggleSort(key) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir(key === 'lastPolledAt' ? 'desc' : 'asc'); }
  }
  const sortRows = rows => {
    if (!sortKey) return rows;
    const dir = sortDir === 'asc' ? 1 : -1;
    const val = s => {
      if (sortKey === 'lastPolledAt') return s.lastPolledAt ? new Date(s.lastPolledAt).getTime() : 0;
      if (sortKey === 'isActive')     return s.isActive ? 1 : 0;
      if (sortKey === 'projectTypes') { try { return JSON.parse(s.projectTypes || '[]').join(','); } catch { return ''; } }
      return s[sortKey] ?? '';
    };
    return [...rows].sort((a, b) => {
      const av = val(a), bv = val(b);
      if (typeof av === 'string' || typeof bv === 'string') return dir * String(av).localeCompare(String(bv));
      return dir * (av - bv);
    });
  };
  const Th = ({ col, children, right }) => (
    <th
      onClick={() => toggleSort(col)}
      className={`${right ? 'text-right' : 'text-left'} px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide cursor-pointer select-none hover:text-slate-800`}
    >
      {children}{sortKey === col ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
    </th>
  );

  // Markets in catalog order, then anything hand-added under a market we do not
  // recognise, so a source can never become invisible by being mis-tagged.
  const groups = useMemo(() => {
    const known = MARKETS.map(m => ({
      ...m,
      rows: sources.filter(s => (s.market || DEFAULT_MARKET) === m.key),
    }));
    const knownKeys = new Set(MARKETS.map(m => m.key));
    const strays = sources.filter(s => !knownKeys.has(s.market || DEFAULT_MARKET));
    const extra = strays.length
      ? [{ key: '_other', label: 'Unsorted', blurb: 'No market set.', rows: strays }]
      : [];
    return [...known, ...extra].filter(g => g.rows.length > 0);
  }, [sources]);

  async function seedSources() {
    setSeeding(true);
    setSeedLog(null);
    const res  = await fetch('/api/market-intel/sources/seed', { method: 'POST' });
    const data = await res.json();
    setSeedLog(data.log || data);
    await loadSources();
    setSeeding(false);
  }

  // Switches the dead ones off, nothing else. Deliberately not part of the
  // seeder: turning a source off is a decision, and a button that makes it is
  // honest in a way a silent background edit is not. Every row keeps its
  // Enable button, so this is reversible.
  async function turnOffDead() {
    setRetiring(true);
    for (const s of dead) {
      await fetch(`/api/market-intel/sources/${s.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ isActive: false }),
      });
    }
    await loadSources();
    setRetiring(false);
  }

  async function toggleActive(source) {
    await fetch(`/api/market-intel/sources/${source.id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ isActive: !source.isActive }),
    });
    loadSources();
  }

  // The server works in 22 s slices (Amplify cuts longer requests), so keep
  // pressing for it until it says it is done; totals add up across slices.
  async function runPoll() {
    setPolling(true);
    setPollLog(null);
    const total = { fetched: 0, inserted: 0, skipped: 0, errors: [], more: false };
    try {
      for (let round = 0; round < 60; round++) {
        const res  = await fetch('/api/market-intel/poll', { method: 'POST' });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) { total.errors.push({ error: data.error || 'Refresh was cut short. Press again to continue.' }); break; }
        const log = data.log || {};
        total.fetched  = log.fetched ?? total.fetched;
        total.skipped  = log.skipped ?? total.skipped;
        total.inserted += log.inserted || 0;
        total.errors.push(...(log.errors || []));
        total.readFailed = (total.readFailed || 0) + (log.readFailed || 0);
        total.readError  = total.readError || log.readError || null;
        total.more = !!log.more;
        setPollLog({ ...total });
        if (!log.more) break;
      }
    } finally {
      setPolling(false);
    }
  }

  // Screen older articles for "is this about a project" (0125) and read
  // their tags (0122), 25 per press.
  const [retagging, setRetagging] = useState(false);
  const [retagLog,  setRetagLog]  = useState(null);
  // Keeps calling, 25 at a time, until nothing is left (or 40 slices), the
  // same way "Refresh sources" loops, so one press screens the whole backlog.
  async function runRetag() {
    setRetagging(true);
    setRetagLog(null);
    const total = { tagged: 0, screenedOut: 0, readFailed: 0, readError: null, errors: [], remaining: 0 };
    for (let i = 0; i < 40; i++) {
      const res  = await fetch('/api/market-intel/retag', { method: 'POST' });
      const data = await res.json();
      const log  = data.log || data;
      total.tagged      += log.tagged      || 0;
      total.screenedOut += log.screenedOut || 0;
      total.readFailed  += log.readFailed  || 0;
      total.readError    = total.readError || log.readError || null;
      total.errors       = total.errors.concat(log.errors || []);
      total.remaining    = log.remaining ?? 0;
      setRetagLog({ ...total });
      if (!total.remaining || !res.ok) break;
      // The reader is failing and nothing moved: pressing on burns calls.
      if (log.readFailed && !(log.tagged || log.screenedOut)) break;
    }
    setRetagging(false);
  }

  const activeCount = sources.filter(s => s.isActive).length;
  const localCount  = sources.filter(s => (s.market || DEFAULT_MARKET) !== DEFAULT_MARKET).length;

  return (
    <div className="p-6">
      {/* Market Intelligence / Sources tabs (Mike 10-6) replace the back arrow. */}
      <SectionTabs tabs={MARKET_INTEL_TABS} />
      <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Market Sources</h1>
            <p className="text-sm text-slate-500">
              {sources.length} sources · {activeCount} active · {localCount} local
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {dead.length > 0 && (
            <button
              onClick={turnOffDead}
              disabled={retiring}
              className="px-4 py-2 text-sm font-medium border border-red-200 text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-50"
            >
              {retiring ? 'Turning off…' : `Turn off ${dead.length} dead source${dead.length === 1 ? '' : 's'}`}
            </button>
          )}
          {updates > 0 && (
            <button
              onClick={seedSources}
              disabled={seeding}
              className="px-4 py-2 text-sm font-medium bg-slate-800 text-white rounded-lg hover:bg-slate-700 disabled:opacity-50"
              title={[
                missing.length ? `Add ${missing.length} missing` : '',
                moved.length   ? `fix ${moved.length} moved feed address${moved.length === 1 ? '' : 'es'}` : '',
              ].filter(Boolean).join(', ')}
            >
              {seeding ? 'Updating…'
                : moved.length && !missing.length ? `Fix ${moved.length} moved feed${moved.length === 1 ? '' : 's'}`
                : !moved.length ? `Add ${missing.length} missing source${missing.length === 1 ? '' : 's'}`
                : `Update ${updates} sources`}
            </button>
          )}
          <button
            onClick={runRetag}
            disabled={retagging}
            className="px-4 py-2 text-sm font-medium bg-white border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 shadow-sm disabled:opacity-50"
            title="Marks older articles that are not about a project so they drop out, and reads company, project, place and unit tags on the rest, 25 at a time"
          >
            {retagging ? 'Screening…' : retagLog ? `Screen articles (${retagLog.remaining ?? 0} left)` : 'Screen articles'}
          </button>
          <button
            onClick={runPoll}
            disabled={polling || activeCount === 0}
            className="px-4 py-2 text-sm font-medium bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50 flex items-center gap-2"
          >
            {polling ? (
              <>
                <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
                Refreshing…
              </>
            ) : 'Refresh sources'}
          </button>
        </div>
      </div>

      {/* Feeds that have stopped publishing */}
      {!loading && dead.length > 0 && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-900">
          {dead.length} source{dead.length === 1 ? '' : 's'} here stopped publishing: the feed is gone, blocked
          or broken. Each one makes the poll wait ten seconds for nothing. Turning them off changes no data
          and can be undone from the row.
        </div>
      )}

      {/* Feeds that moved to a new address */}
      {!loading && moved.length > 0 && (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-900">
          {moved.length} source{moved.length === 1 ? '' : 's'} here still point{moved.length === 1 ? 's' : ''} at a feed address the
          paper has moved away from, so every poll comes back empty. The button above fixes the address; nothing else changes.
        </div>
      )}

      {/* Why local matters: the finding, stated once, where the decision is made */}
      {!loading && localCount === 0 && sources.length > 0 && (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-900">
          Every source here is national trade press. That press names companies, not buildings,
          which is why no article has ever been tagged with one of our jobs. Adding the local
          papers is what changes that.
        </div>
      )}

      {/* Seed result */}
      {seedLog && (
        <div className="mb-4 p-3 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700">
          <div className="flex items-center gap-4">
            <span className="font-medium">Sources updated</span>
            <span>Added: {seedLog.added?.length ?? 0}</span>
            <span>Already there: {seedLog.alreadyThere ?? 0}</span>
            {seedLog.retagged?.length > 0 && <span>Re-tagged: {seedLog.retagged.length}</span>}
            {seedLog.moved?.length > 0 && <span>Feed address fixed: {seedLog.moved.length}</span>}
            {seedLog.errors?.length > 0 && <span className="text-red-600">Errors: {seedLog.errors.length}</span>}
            <button onClick={() => setSeedLog(null)} className="ml-auto text-slate-400 hover:text-slate-600">✕</button>
          </div>
          {seedLog.added?.length > 0 && (
            <div className="mt-2 text-xs text-slate-500">
              {seedLog.added.map(a => `${a.name} (${marketLabel(a.market)})`).join(' · ')}
            </div>
          )}
          {seedLog.errors?.length > 0 && (
            <div className="mt-2 text-xs text-red-600">
              {seedLog.errors.map(e => `${e.name}: ${e.error}`).join(' · ')}
            </div>
          )}
        </div>
      )}

      {/* Screen articles result */}
      {retagLog && (
        <div className="mb-4 p-3 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 flex items-center gap-4">
          <span className="font-medium">{retagging ? 'Screening articles…' : 'Articles screened'}</span>
          <span>Kept and tagged: {retagLog.tagged}</span>
          <span>Not about a project, hidden: {retagLog.screenedOut}</span>
          {retagLog.remaining > 0 && <span>Still waiting: {retagLog.remaining}</span>}
          {retagLog.errors?.length > 0 && <span className="text-red-600">Errors: {retagLog.errors.length}</span>}
          {retagLog.readFailed > 0 && (
            <span className="text-red-600" title={retagLog.readError || ''}>
              The reader could not read {retagLog.readFailed}{retagLog.readError ? `: ${retagLog.readError}` : ''}
            </span>
          )}
          {!retagging && <button onClick={() => setRetagLog(null)} className="ml-auto text-slate-400 hover:text-slate-600">✕</button>}
        </div>
      )}

      {/* Poll result */}
      {pollLog && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800 flex items-center gap-4">
          <span>{polling ? 'Still refreshing…' : '✓ Poll complete'}</span>
          <span>Fetched: {pollLog.fetched}</span>
          <span>New: {pollLog.inserted}</span>
          <span>Skipped: {pollLog.skipped}</span>
          {pollLog.errors?.length > 0 && <span className="text-red-600">Errors: {pollLog.errors.length}</span>}
          {pollLog.readFailed > 0 && (
            <span className="text-red-600" title={pollLog.readError || ''}>
              Saved without tags, the reader could not read {pollLog.readFailed}{pollLog.readError ? `: ${pollLog.readError}` : ''}
            </span>
          )}
          <button onClick={() => setPollLog(null)} className="ml-auto text-green-600 hover:text-green-800">✕</button>
        </div>
      )}

      {/* Learned rules (0130). Shown only once a press has taught something. */}
      {(rules.length > 0 || (week && week.dismissed > 0)) && (
        <div className="mb-6">
          <div className="flex items-baseline gap-2 mb-2 px-1">
            <h2 className="text-sm font-semibold text-slate-800">Learned rules</h2>
            <span className="text-xs text-slate-400">
              From the Not relevant button. A Sales Admin applies a rule; applied rules skip matching rows at pull time.
              {week && week.rate != null && <> This week {Math.round(week.rate * 100)}% of the rows people touched were not relevant ({week.dismissed} of {week.dismissed + week.reviewed}).</>}
            </span>
          </div>
          {rules.length === 0 ? (
            <p className="text-xs text-slate-400 px-1">No rule proposed yet. One appears after the same source, case type, company or zone is marked not relevant three times.</p>
          ) : (
            <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
              {rules.map(r => (
                <div key={r.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${r.status === 'APPLIED' ? 'bg-green-100 text-green-700' : r.status === 'IGNORED' ? 'bg-slate-100 text-slate-500' : 'bg-amber-100 text-amber-800'}`}>
                    {r.status === 'APPLIED' ? 'Applied' : r.status === 'IGNORED' ? 'Ignored' : 'Proposed'}
                  </span>
                  <span className="text-slate-700 min-w-0 flex-1">
                    {r.description}
                    {r.status === 'APPLIED' && r.hits > 0 && <span className="text-slate-400"> Skipped {r.hits} so far.</span>}
                    {r.decidedBy && <span className="text-slate-400"> By {r.decidedBy.name}.</span>}
                  </span>
                  {canDecide && <div className="flex gap-1.5 shrink-0">
                    {r.status !== 'APPLIED' && (
                      <button onClick={() => decideRule(r.id, 'APPLIED')} disabled={deciding === r.id} className="px-4 py-2 text-sm font-semibold rounded-lg bg-orange-500 hover:bg-orange-600 text-white disabled:opacity-50">Apply</button>
                    )}
                    {r.status === 'PROPOSED' && (
                      <button onClick={() => decideRule(r.id, 'IGNORED')} disabled={deciding === r.id} className="px-4 py-2 text-sm font-semibold rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50">Ignore</button>
                    )}
                    {r.status !== 'PROPOSED' && (
                      <button onClick={() => decideRule(r.id, 'PROPOSED')} disabled={deciding === r.id} className="px-4 py-2 text-sm font-semibold rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50">Undo</button>
                    )}
                  </div>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Sources, grouped by market */}
      {loading ? (
        <div className="text-sm text-slate-400 py-8 text-center">Loading…</div>
      ) : sources.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <p className="font-medium">No sources yet</p>
          <p className="text-xs mt-1">Use the button above to add the full list</p>
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map(group => (
            <div key={group.key}>
              <div className="flex items-baseline gap-2 mb-2 px-1">
                <h2 className="text-sm font-semibold text-slate-800">{group.label}</h2>
                <span className="text-xs text-slate-400">{group.rows.length}</span>
                {group.blurb && <span className="text-xs text-slate-400">· {group.blurb}</span>}
              </div>
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50">
                      <Th col="name">Source</Th>
                      <Th col="projectTypes">Types</Th>
                      <Th col="pollingFrequency">Freq</Th>
                      <Th col="lastPolledAt">Last Poll</Th>
                      <Th col="isActive" right>On</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {sortRows(group.rows).map(source => {
                      const types = (() => { try { return JSON.parse(source.projectTypes || '[]'); } catch { return []; } })();
                      return (
                        <tr key={source.id} className={source.isActive ? '' : 'opacity-50'}>
                          <td className="px-4 py-3">
                            <div className="font-medium text-slate-800">{source.name}</div>
                            <a href={source.siteUrl} target="_blank" rel="noreferrer"
                              className="text-xs text-slate-400 hover:text-amber-600 truncate block max-w-xs">
                              {source.siteUrl}
                            </a>
                            {isRetired(source.name) && (
                              <div className="text-xs text-red-600 mt-1">
                                Stopped publishing: {reasonFor(source.name)}
                              </div>
                            )}
                            {movedNames.has(source.name) && (
                              <div className="text-xs text-amber-700 mt-1">
                                Feed moved. Press the update button above to fix the address.
                              </div>
                            )}
                            {source.notes && (
                              <div className="text-xs text-slate-400 mt-1 max-w-md">{source.notes}</div>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1">
                              {types.map(t => (
                                <span key={t} className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">
                                  {PROJECT_TYPE_LABELS[t] || t}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-slate-500">{source.pollingFrequency}</td>
                          <td className="px-4 py-3 text-slate-400 text-xs">
                            {source.lastPolledAt ? new Date(source.lastPolledAt).toLocaleDateString() : 'Never'}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              onClick={() => toggleActive(source)}
                              className={`text-xs px-3 py-1 rounded-lg border font-medium transition-colors ${
                                source.isActive
                                  ? 'border-slate-200 text-slate-500 hover:bg-slate-50'
                                  : 'border-green-200 text-green-600 hover:bg-green-50'
                              }`}
                            >
                              {source.isActive ? 'Disable' : 'Enable'}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
      </div>
    </div>
  );
}
