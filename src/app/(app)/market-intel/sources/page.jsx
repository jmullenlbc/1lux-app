'use client';
import { useState, useEffect, useMemo } from 'react';
import SectionTabs, { MARKET_INTEL_TABS } from '@/components/ui/SectionTabs';
import { MARKETS, DEFAULT_MARKET, RETIRED, marketLabel, missingSources, isRetired, retiredStillActive, movedSources } from '@/lib/market-intel/sourceCatalog';
import { FilterToolbar, FilterPanel, SearchBox, countFilters } from '@/components/ui/FilterPanel';
import SortHeader, { sortRows } from '@/components/ui/SortHeader';
import { WidgetEmpty, WidgetLoading } from '@/components/ui/WidgetFrame';
import { useUrlView } from '@/lib/useUrlView';
import { H1, H2, HELPER, CARD, BTN_PRIMARY, BTN_SECONDARY, BTN_COMPACT, TD, TONE } from '@/components/ui/tokens';
import { cn } from '@/lib/utils';

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

// Filters and sort live in the page address (Mike 10-16).
const FILTER_FIELDS = [
  { key: 'market', label: 'Market',       kind: 'pick' },
  { key: 'type',   label: 'Project type', kind: 'pick' },
  { key: 'active', label: 'Switched on',  kind: 'yesno' },
  { key: 'q',      label: 'Name',         kind: 'text' },
];
const PANEL_FIELDS = FILTER_FIELDS.filter(f => f.key !== 'q');
const SORT_DEFAULT = { key: '', dir: 'asc' };
const parseTypes = s => { try { return JSON.parse(s || '[]'); } catch { return []; } };
const SORT_GETTERS = {
  name:             s => s.name,
  projectTypes:     s => parseTypes(s.projectTypes).join(','),
  pollingFrequency: s => s.pollingFrequency,
  lastPolledAt:     s => (s.lastPolledAt ? new Date(s.lastPolledAt).getTime() : null),
  isActive:         s => (s.isActive ? 1 : 0),
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
  // flip (Mike 10-8). Default is the order the API returns. Filters narrow
  // the rows in every group (Mike 10-16).
  const { filters, setFilter, clearFilters, sort, toggleSort } = useUrlView({ fields: FILTER_FIELDS, sortDefault: SORT_DEFAULT });
  const [panelOpen, setPanelOpen] = useState(false);
  const filterCount = countFilters(filters, FILTER_FIELDS);
  const choices = useMemo(() => ({
    market: MARKETS.map(m => [m.key, m.label]),
    type:   Object.entries(PROJECT_TYPE_LABELS),
  }), []);
  const filtered = useMemo(() => {
    const needle = String(filters.q || '').trim().toLowerCase();
    return sources.filter(s =>
      (!filters.market || (s.market || DEFAULT_MARKET) === filters.market) &&
      (!filters.type   || parseTypes(s.projectTypes).includes(filters.type)) &&
      (!filters.active || (filters.active === 'yes') === !!s.isActive) &&
      (!needle         || String(s.name || '').toLowerCase().includes(needle))
    );
  }, [sources, filters]);

  // Markets in catalog order, then anything hand-added under a market we do not
  // recognise, so a source can never become invisible by being mis-tagged.
  const groups = useMemo(() => {
    const known = MARKETS.map(m => ({
      ...m,
      rows: filtered.filter(s => (s.market || DEFAULT_MARKET) === m.key),
    }));
    const knownKeys = new Set(MARKETS.map(m => m.key));
    const strays = filtered.filter(s => !knownKeys.has(s.market || DEFAULT_MARKET));
    const extra = strays.length
      ? [{ key: '_other', label: 'Unsorted', blurb: 'No market set.', rows: strays }]
      : [];
    return [...known, ...extra].filter(g => g.rows.length > 0);
  }, [filtered]);

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
            <h1 className={H1}>Market Sources</h1>
            <p className="text-sm text-slate-500 tabular-nums">
              {sources.length} sources · {activeCount} active · {localCount} local
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {dead.length > 0 && (
            <button
              onClick={turnOffDead}
              disabled={retiring}
              className={cn(BTN_SECONDARY, 'border-red-200 text-red-600 hover:bg-red-50')}
            >
              {retiring ? 'Turning off…' : `Turn off ${dead.length} dead source${dead.length === 1 ? '' : 's'}`}
            </button>
          )}
          {updates > 0 && (
            <button
              onClick={seedSources}
              disabled={seeding}
              className={BTN_SECONDARY}
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
            className={BTN_SECONDARY}
            title="Marks older articles that are not about a project so they drop out, and reads company, project, place and unit tags on the rest, 25 at a time"
          >
            {retagging ? 'Screening…' : retagLog ? `Screen articles (${retagLog.remaining ?? 0} left)` : 'Screen articles'}
          </button>
          <button
            onClick={runPoll}
            disabled={polling || activeCount === 0}
            className={BTN_PRIMARY}
          >
            {polling ? 'Refreshing…' : 'Refresh sources'}
          </button>
        </div>
      </div>

      {/* Feeds that have stopped publishing */}
      {!loading && dead.length > 0 && (
        <div className={cn('mb-4 p-3 border rounded-lg text-sm', TONE.danger)}>
          {dead.length} source{dead.length === 1 ? '' : 's'} here stopped publishing: the feed is gone, blocked
          or broken. Each one makes the poll wait ten seconds for nothing. Turning them off changes no data
          and can be undone from the row.
        </div>
      )}

      {/* Feeds that moved to a new address */}
      {!loading && moved.length > 0 && (
        <div className={cn('mb-4 p-3 border rounded-lg text-sm', TONE.warning)}>
          {moved.length} source{moved.length === 1 ? '' : 's'} here still point{moved.length === 1 ? 's' : ''} at a feed address the
          paper has moved away from, so every poll comes back empty. The button above fixes the address; nothing else changes.
        </div>
      )}

      {/* Why local matters: the finding, stated once, where the decision is made */}
      {!loading && localCount === 0 && sources.length > 0 && (
        <div className={cn('mb-4 p-3 border rounded-lg text-sm', TONE.warning)}>
          Every source here is national trade press. That press names companies, not buildings,
          which is why no article has ever been tagged with one of our jobs. Adding the local
          papers is what changes that.
        </div>
      )}

      {/* Seed result */}
      {seedLog && (
        <div className={cn('mb-4 p-3 border rounded-lg text-sm', TONE.info)}>
          <div className="flex items-center gap-4 tabular-nums">
            <span className="font-medium">Sources updated</span>
            <span>Added: {seedLog.added?.length ?? 0}</span>
            <span>Already there: {seedLog.alreadyThere ?? 0}</span>
            {seedLog.retagged?.length > 0 && <span>Re-tagged: {seedLog.retagged.length}</span>}
            {seedLog.moved?.length > 0 && <span>Feed address fixed: {seedLog.moved.length}</span>}
            {seedLog.errors?.length > 0 && <span className="text-red-600">Errors: {seedLog.errors.length}</span>}
            <button onClick={() => setSeedLog(null)} className="ml-auto text-slate-600 hover:bg-slate-100 rounded-lg px-1.5">✕</button>
          </div>
          {seedLog.added?.length > 0 && (
            <div className={cn(HELPER, 'mt-2')}>
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
        <div className={cn('mb-4 p-3 border rounded-lg text-sm flex items-center gap-4 tabular-nums', TONE.info)}>
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
          {!retagging && <button onClick={() => setRetagLog(null)} className="ml-auto text-slate-600 hover:bg-slate-100 rounded-lg px-1.5">✕</button>}
        </div>
      )}

      {/* Poll result */}
      {pollLog && (
        <div className={cn('mb-4 p-3 border rounded-lg text-sm flex items-center gap-4 tabular-nums', TONE.success)}>
          <span>{polling ? 'Still refreshing…' : 'Poll complete'}</span>
          <span>Fetched: {pollLog.fetched}</span>
          <span>New: {pollLog.inserted}</span>
          <span>Skipped: {pollLog.skipped}</span>
          {pollLog.errors?.length > 0 && <span className="text-red-600">Errors: {pollLog.errors.length}</span>}
          {pollLog.readFailed > 0 && (
            <span className="text-red-600" title={pollLog.readError || ''}>
              Saved without tags, the reader could not read {pollLog.readFailed}{pollLog.readError ? `: ${pollLog.readError}` : ''}
            </span>
          )}
          <button onClick={() => setPollLog(null)} className="ml-auto text-green-600 hover:text-green-700">✕</button>
        </div>
      )}

      {/* Learned rules (0130). Shown only once a press has taught something. */}
      {(rules.length > 0 || (week && week.dismissed > 0)) && (
        <div className="mb-6">
          <div className="flex items-baseline gap-2 mb-2 px-1">
            <h2 className={H2}>Learned rules</h2>
            <span className={HELPER}>
              From the Not relevant button. A Sales Admin applies a rule; applied rules skip matching rows at pull time.
              {week && week.rate != null && <> This week {Math.round(week.rate * 100)}% of the rows people touched were not relevant ({week.dismissed} of {week.dismissed + week.reviewed}).</>}
            </span>
          </div>
          {rules.length === 0 ? (
            <p className={cn(HELPER, 'px-1')}>No rule proposed yet. One appears after the same source, case type, company or zone is marked not relevant three times.</p>
          ) : (
            <div className={cn(CARD, 'divide-y divide-slate-100')}>
              {rules.map(r => (
                <div key={r.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <span className={cn('text-xs px-2 py-0.5 rounded-lg border shrink-0', r.status === 'APPLIED' ? TONE.success : r.status === 'IGNORED' ? TONE.info : TONE.warning)}>
                    {r.status === 'APPLIED' ? 'Applied' : r.status === 'IGNORED' ? 'Ignored' : 'Proposed'}
                  </span>
                  <span className="text-slate-700 min-w-0 flex-1">
                    {r.description}
                    {r.status === 'APPLIED' && r.hits > 0 && <span className="text-slate-500"> Skipped {r.hits} so far.</span>}
                    {r.decidedBy && <span className="text-slate-500"> By {r.decidedBy.name}.</span>}
                  </span>
                  {canDecide && <div className="flex gap-1.5 shrink-0">
                    {r.status !== 'APPLIED' && (
                      <button onClick={() => decideRule(r.id, 'APPLIED')} disabled={deciding === r.id} className={BTN_PRIMARY}>Apply</button>
                    )}
                    {r.status === 'PROPOSED' && (
                      <button onClick={() => decideRule(r.id, 'IGNORED')} disabled={deciding === r.id} className={BTN_SECONDARY}>Ignore</button>
                    )}
                    {r.status !== 'PROPOSED' && (
                      <button onClick={() => decideRule(r.id, 'PROPOSED')} disabled={deciding === r.id} className={BTN_SECONDARY}>Undo</button>
                    )}
                  </div>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Filters (Mike 10-16): one funnel, the address keeps them. */}
      {sources.length > 0 && (
        <div className="mb-5">
          <FilterToolbar
            count={filterCount}
            open={panelOpen}
            onToggle={() => setPanelOpen(o => !o)}
            onClear={clearFilters}
            shown={filtered.length}
            total={sources.length}
            noun="sources"
            right={<SearchBox value={filters.q || ''} onChange={v => setFilter('q', v)} placeholder="Search sources…" />}
          />
          <FilterPanel open={panelOpen} fields={PANEL_FIELDS} filters={filters} choices={choices} onChange={setFilter} />
        </div>
      )}

      {/* Sources, grouped by market */}
      {loading ? (
        <WidgetLoading />
      ) : sources.length === 0 ? (
        <WidgetEmpty>
          <span className="block font-medium">No sources yet</span>
          <span className={cn(HELPER, 'block mt-1')}>Use the button above to add the full list</span>
        </WidgetEmpty>
      ) : groups.length === 0 ? (
        <WidgetEmpty>No sources match these filters</WidgetEmpty>
      ) : (
        <div className="space-y-6">
          {groups.map(group => (
            <div key={group.key}>
              <div className="flex items-baseline gap-2 mb-2 px-1">
                <h2 className={H2}>{group.label}</h2>
                <span className={cn(HELPER, 'tabular-nums')}>{group.rows.length}</span>
                {group.blurb && <span className={HELPER}>· {group.blurb}</span>}
              </div>
              <div className={cn(CARD, 'overflow-hidden')}>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50">
                      <SortHeader label="Source" field="name" sort={sort} onSort={toggleSort} />
                      <SortHeader label="Types" field="projectTypes" sort={sort} onSort={toggleSort} />
                      <SortHeader label="Freq" field="pollingFrequency" sort={sort} onSort={toggleSort} />
                      <SortHeader label="Last Poll" field="lastPolledAt" sort={sort} onSort={toggleSort} />
                      <SortHeader label="On" field="isActive" sort={sort} onSort={toggleSort} align="right" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {sortRows(group.rows, sort, SORT_GETTERS).map(source => {
                      const types = parseTypes(source.projectTypes);
                      return (
                        <tr key={source.id} className={source.isActive ? '' : 'opacity-50'}>
                          <td className={TD}>
                            <div className="font-medium text-slate-800">{source.name}</div>
                            <a href={source.siteUrl} target="_blank" rel="noreferrer"
                              className="text-xs text-slate-500 hover:text-orange-600 truncate block max-w-xs">
                              {source.siteUrl}
                            </a>
                            {isRetired(source.name) && (
                              <div className="text-xs text-red-600 mt-1">
                                Stopped publishing: {reasonFor(source.name)}
                              </div>
                            )}
                            {movedNames.has(source.name) && (
                              <div className="text-xs text-amber-600 mt-1">
                                Feed moved. Press the update button above to fix the address.
                              </div>
                            )}
                            {source.notes && (
                              <div className={cn(HELPER, 'mt-1 max-w-md')}>{source.notes}</div>
                            )}
                          </td>
                          <td className={TD}>
                            <div className="flex flex-wrap gap-1">
                              {types.map(t => (
                                <span key={t} className="text-xs bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-lg">
                                  {PROJECT_TYPE_LABELS[t] || t}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className={cn(TD, 'text-slate-500')}>{source.pollingFrequency}</td>
                          <td className={cn(TD, 'text-slate-500 text-xs tabular-nums')}>
                            {source.lastPolledAt ? new Date(source.lastPolledAt).toLocaleDateString() : 'Never'}
                          </td>
                          <td className={cn(TD, 'text-right')}>
                            <button
                              onClick={() => toggleActive(source)}
                              className={cn(BTN_COMPACT, !source.isActive && 'border-green-200 text-green-600 hover:bg-green-50')}
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
