'use client';
import { Fragment, useMemo, useState } from 'react';
import Link from 'next/link';
import SectionTabs, { EVENTS_TABS } from '@/components/ui/SectionTabs';
import StatTile from '@/components/ui/StatTile';
import { FilterToolbar, FilterPanel, countFilters } from '@/components/ui/FilterPanel';
import SortHeader, { Th, SortSelect } from '@/components/ui/SortHeader';
import { WidgetLoading, WidgetEmpty } from '@/components/ui/WidgetFrame';
import { CARD_PADDED, H1 } from '@/components/ui/tokens';
import { useUrlView } from '@/lib/useUrlView';
import { EDITION_STATUSES, statusLabel } from '@/lib/conferences/constants';
import {
  SHARED_FILTERS, filterChoices, useConferences, useVisible, money, moneyCents, dateText, placeText, TierPill, EventMarks, NotLoaded,
} from '@/components/events/eventsShared';

const SORT_KEYS = ['date', 'rank', 'score', 'cost', 'planned', 'name'];
const VIEW_FIELDS = [...SHARED_FILTERS, ...SORT_KEYS.map(k => ({ key: k, kind: 'sort' }))];
const SORT_DEFAULT = { key: 'date', dir: 'asc' };
const SORT_CHOICES = [{ key: 'date', label: 'Date' }, { key: 'rank', label: 'Rank' }, { key: 'score', label: 'Score' }, { key: 'cost', label: 'Per person' }];
const FIELD = 'border border-slate-300 rounded px-1 py-0.5 text-xs bg-white';
const quarterName = (q) => (q === 'TBD' ? 'Date TBD' : q);

function StatusPick({ r, canEdit, onSave }) {
  if (!canEdit) return <span>{statusLabel(r.status)}</span>;
  return (
    <select className={FIELD} aria-label={`Status of ${r.name}`} value={r.status} onChange={e => onSave(r.id, { status: e.target.value })}>
      {EDITION_STATUSES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
    </select>
  );
}

function Headcount({ r, canEdit, onSave }) {
  if (!canEdit) return <span className="tabular-nums">{r.headcount}</span>;
  return (
    <input key={`${r.id}-${r.headcount}`} type="number" min="0" className={`${FIELD} w-12 text-right tabular-nums`} aria-label={`Headcount for ${r.name}`}
      defaultValue={r.headcount}
      onBlur={e => { if (Number(e.target.value) !== r.headcount) onSave(r.id, { headcountOverride: e.target.value }); }} />
  );
}

function TierPick({ r, canEdit, onSave }) {
  if (!canEdit || r.tier === 'X') return <TierPill tier={r.tier} />;
  return (
    <select className={FIELD} aria-label={`Tier of ${r.name}`} value={r.tierOverride || ''} onChange={e => onSave(r.id, { tierOverride: e.target.value || null })}>
      <option value="">Auto ({r.tierOverride ? 'by score' : r.tier})</option>
      {['A', 'B', 'C'].map(t => <option key={t} value={t}>{t}</option>)}
    </select>
  );
}

function IncludeBox({ r, canEdit, onSave }) {
  return (
    <input type="checkbox" className="h-4 w-4 accent-orange-600" aria-label={`Include ${r.name}`} checked={!!r.include}
      disabled={!canEdit || r.tier === 'X'} onChange={e => onSave(r.id, { includeOverride: e.target.checked })} />
  );
}

// The working list. Tier X events can't be included, so they only show when the
// Tier filter asks for them. Filters change the list, never the totals.
export default function PlanClient() {
  const { filters, setFilter, clearFilters, sort, setSort, toggleSort } = useUrlView({ fields: VIEW_FIELDS, sortDefault: SORT_DEFAULT });
  const { data, err, loading, saveEvent } = useConferences();
  const [open, setOpen] = useState(false);

  const all = useMemo(() => (data?.rows || []).filter(r => r.tier !== 'X' || filters.tier === 'X'), [data, filters.tier]);
  const rows = useVisible(all, filters, sort);
  const choices = useMemo(() => filterChoices(data?.rows || []), [data]);
  const canEdit = !!data?.canEdit;
  const current = data?.result?.scenarios?.current;
  const byDate = sort.key === 'date';
  const hiddenX = filters.tier === 'X' ? 0 : (data?.rows || []).filter(r => r.tier === 'X').length;

  const groups = useMemo(() => {
    if (!byDate) return [{ key: 'all', rows }];
    const map = new Map();
    for (const r of rows) {
      if (!map.has(r.quarter)) map.set(r.quarter, []);
      map.get(r.quarter).push(r);
    }
    return [...map.entries()].map(([key, list]) => ({ key, rows: list }));
  }, [rows, byDate]);

  return (
    <div className="px-4 py-6 pb-28">
      <SectionTabs tabs={EVENTS_TABS} className="mb-5" />
      <div className="max-w-7xl mx-auto space-y-5">
        <div>
          <h1 className={H1}>Plan</h1>
          <p className="text-xs text-slate-500 mt-0.5">Pick what we go to. Totals and ranks update when a change saves.</p>
        </div>
        {err && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</p>}

        {current && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatTile label="Events included" value={current.events} />
            <StatTile label="Trips" value={current.attendeeTrips} />
            <StatTile label="Current plan" value={moneyCents(current.total)} sub="With contingency" />
            <StatTile label="With memberships" value={moneyCents(data.result.grandTotal)}
              sub={data.result.vsCap == null ? 'No budget cap set' : `${money(Math.abs(data.result.vsCap))} ${data.result.vsCap < 0 ? 'over' : 'under'} cap`}
              tone={data.result.vsCap != null && data.result.vsCap < 0 ? 'danger' : 'default'} />
          </div>
        )}

        <div className={CARD_PADDED}>
          {loading ? <WidgetLoading /> : data && !data.loaded ? <NotLoaded canLoad={canEdit} /> : (
            <>
              <div className="mb-3">
                <FilterToolbar count={countFilters(filters, SHARED_FILTERS)} open={open} onToggle={() => setOpen(o => !o)} onClear={clearFilters}
                  shown={rows.length} total={all.length} noun="events"
                  right={<SortSelect className="sm:hidden" fields={SORT_CHOICES} sort={sort} onChange={setSort} />} />
                <FilterPanel open={open} fields={SHARED_FILTERS} filters={filters} choices={choices} onChange={setFilter} />
                {hiddenX > 0 && <p className="text-xs text-slate-500 mt-2">{hiddenX} Tier X {hiddenX === 1 ? 'event is' : 'events are'} hidden because a supplier can't attend. Set the Tier filter to X to see them.</p>}
                {canEdit && data?.archived?.length > 0 && (
                  <div className="text-xs text-slate-500 mt-2 flex flex-wrap gap-x-3 gap-y-1">
                    <span>Archived:</span>
                    {data.archived.map(a => (
                      <span key={a.id}>{a.name}{' '}
                        <button type="button" className="text-orange-600 hover:underline" onClick={() => saveEvent(a.id, { archived: false })}>Restore</button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {rows.length === 0 ? <WidgetEmpty>No events match these filters.</WidgetEmpty> : (
                <>
                  <div className="sm:hidden space-y-4">
                    {groups.map(g => (
                      <div key={g.key}>
                        {byDate && <h3 className="text-xs font-semibold text-slate-500 mb-1">{quarterName(g.key)}</h3>}
                        <ul className="divide-y divide-slate-100">
                          {g.rows.map(r => (
                            <li key={r.id} className="py-3 flex gap-3">
                              <div className="pt-0.5"><IncludeBox r={r} canEdit={canEdit} onSave={saveEvent} /></div>
                              <div className="min-w-0 flex-1">
                                <Link href={`/sales/events/${r.id}`} className="text-sm font-medium text-slate-900">{r.name}</Link>
                                <p className="text-xs text-slate-500 mt-0.5">{dateText(r)} · {placeText(r)}</p>
                                <div className="mt-1 flex flex-wrap items-center gap-1">
                                  <TierPill tier={r.tier} />
                                  <span className="text-xs text-slate-600 tabular-nums">#{r.rank} · {money(r.perPerson)} each · {r.headcount} going</span>
                                  <EventMarks r={r} />
                                </div>
                                <div className="mt-1.5"><StatusPick r={r} canEdit={canEdit} onSave={saveEvent} /></div>
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>

                  <div className="hidden sm:block overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 text-left">
                          <SortHeader field="rank" label="Rank" sort={sort} onSort={toggleSort} align="right" />
                          <Th>Tier</Th>
                          <Th>Include</Th>
                          <SortHeader field="name" label="Event" sort={sort} onSort={toggleSort} />
                          <SortHeader field="date" label="Dates" sort={sort} onSort={toggleSort} />
                          <Th>Where</Th>
                          <SortHeader field="score" label="Score" sort={sort} onSort={toggleSort} align="right" />
                          <SortHeader field="cost" label="Per person" sort={sort} onSort={toggleSort} align="right" />
                          <Th align="right">Going</Th>
                          <SortHeader field="planned" label="Planned" sort={sort} onSort={toggleSort} align="right" />
                          <Th>Status</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {groups.map(g => (
                          <Fragment key={g.key}>
                            {byDate && (
                              <tr className="bg-slate-50">
                                <td colSpan={11} className="py-1.5 px-2 text-[11px] font-semibold text-slate-600">{quarterName(g.key)}</td>
                              </tr>
                            )}
                            {g.rows.map(r => (
                              <tr key={r.id} className="border-b border-slate-100 align-top hover:bg-slate-50">
                                <td className="py-2 pr-3 text-right tabular-nums">{r.rank}</td>
                                <td className="py-2 pr-3"><TierPick r={r} canEdit={canEdit} onSave={saveEvent} /></td>
                                <td className="py-2 pr-3 text-center"><IncludeBox r={r} canEdit={canEdit} onSave={saveEvent} /></td>
                                <td className="py-2 pr-3 min-w-[220px]">
                                  <Link href={`/sales/events/${r.id}`} className="font-medium text-slate-900 hover:text-orange-600">{r.name}</Link>
                                  <div className="mt-0.5 flex flex-wrap gap-1"><EventMarks r={r} /></div>
                                </td>
                                <td className="py-2 pr-3 whitespace-nowrap">{dateText(r)}</td>
                                <td className="py-2 pr-3 whitespace-nowrap">{placeText(r)}</td>
                                <td className="py-2 pr-3 text-right tabular-nums">{r.score?.toFixed(2)}</td>
                                <td className="py-2 pr-3 text-right tabular-nums">{money(r.perPerson)}</td>
                                <td className="py-2 pr-3 text-right"><Headcount r={r} canEdit={canEdit} onSave={saveEvent} /></td>
                                <td className="py-2 pr-3 text-right tabular-nums">{r.include ? money(r.plannedCost) : ''}</td>
                                <td className="py-2"><StatusPick r={r} canEdit={canEdit} onSave={saveEvent} /></td>
                              </tr>
                            ))}
                          </Fragment>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
