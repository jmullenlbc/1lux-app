'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import SectionTabs, { EVENTS_TABS } from '@/components/ui/SectionTabs';
import { FilterToolbar, FilterPanel, countFilters } from '@/components/ui/FilterPanel';
import SortHeader, { Th, SortSelect } from '@/components/ui/SortHeader';
import { WidgetLoading, WidgetEmpty } from '@/components/ui/WidgetFrame';
import { CARD_PADDED, H1 } from '@/components/ui/tokens';
import { useUrlView } from '@/lib/useUrlView';
import {
  SHARED_FILTERS, PANEL_FILTERS, filterChoices, SearchBox, YearNumbers, useConferences, useVisible, money, dateText, placeText, TierPill, Pill, EventMarks, NotLoaded,
} from '@/components/events/eventsShared';

const SORT_KEYS = ['date', 'name', 'place', 'attendance', 'reg', 'score'];
const VIEW_FIELDS = [...SHARED_FILTERS, ...SORT_KEYS.map(k => ({ key: k, kind: 'sort' }))];
const SORT_DEFAULT = { key: 'date', dir: 'asc' };
const SORT_CHOICES = [{ key: 'date', label: 'Date' }, { key: 'score', label: 'Score' }, { key: 'name', label: 'Name' }, { key: 'attendance', label: 'Attendance' }, { key: 'reg', label: 'Registration' }];

// Every event we have research on, in or out of the plan.
export default function LibraryClient() {
  const { filters, setFilter, clearFilters, sort, setSort, toggleSort } = useUrlView({ fields: VIEW_FIELDS, sortDefault: SORT_DEFAULT });
  const { data, err, loading } = useConferences();
  const [open, setOpen] = useState(false);

  const all = useMemo(() => data?.rows || [], [data]);
  const rows = useVisible(all, filters, sort);
  const choices = useMemo(() => filterChoices(all), [all]);

  return (
    <div className="px-4 py-6 pb-28">
      <SectionTabs tabs={EVENTS_TABS} className="mb-5" />
      <div className="max-w-7xl mx-auto space-y-5">
        <div>
          <h1 className={H1}>Library</h1>
          <p className="text-xs text-slate-500 mt-0.5">Every conference we have looked at. Plan picks which ones we go to. Budget adds up what they cost.</p>
        </div>
        {err && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</p>}
        {data?.loaded && <YearNumbers data={data} filters={filters} />}

        <div className={CARD_PADDED}>
          {loading ? <WidgetLoading /> : data && !data.loaded ? <NotLoaded canLoad={data.canEdit} /> : (
            <>
              <div className="mb-3">
                <SearchBox value={filters.q} onChange={setFilter} />
                <FilterToolbar count={countFilters(filters, SHARED_FILTERS)} open={open} onToggle={() => setOpen(o => !o)} onClear={clearFilters}
                  shown={rows.length} total={all.length} noun="events"
                  right={<SortSelect className="sm:hidden" fields={SORT_CHOICES} sort={sort} onChange={setSort} />} />
                <FilterPanel open={open} fields={PANEL_FILTERS} filters={filters} choices={choices} onChange={setFilter} />
              </div>

              {rows.length === 0 ? <WidgetEmpty>No events match these filters.</WidgetEmpty> : (
                <>
                  <ul className="sm:hidden divide-y divide-slate-100">
                    {rows.map(r => (
                      <li key={r.id} className="py-3">
                        <Link href={`/sales/events/${r.id}`} className="block">
                          <p className="text-sm font-medium text-slate-900">{r.name}</p>
                          <p className="text-xs text-slate-500 mt-0.5">{dateText(r)} · {placeText(r)}</p>
                          <div className="mt-1 flex flex-wrap items-center gap-1">
                            <TierPill tier={r.tier} />
                            <Pill>{r.verticalLabel}</Pill>
                            <span className="text-xs text-slate-600 tabular-nums">{money(r.perPerson)} each</span>
                            <EventMarks r={r} />
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>

                  <div className="hidden sm:block overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 text-left">
                          <SortHeader field="name" label="Event" sort={sort} onSort={toggleSort} />
                          <SortHeader field="date" label="Dates" sort={sort} onSort={toggleSort} />
                          <SortHeader field="place" label="Where" sort={sort} onSort={toggleSort} />
                          <Th>Vertical</Th>
                          <Th>Focus</Th>
                          <Th>Format</Th>
                          <Th>Access</Th>
                          <SortHeader field="attendance" label="Attendance" sort={sort} onSort={toggleSort} align="right" />
                          <SortHeader field="reg" label="Registration" sort={sort} onSort={toggleSort} align="right" />
                          <SortHeader field="score" label="Score" sort={sort} onSort={toggleSort} align="right" />
                          <Th>Tier</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map(r => (
                          <tr key={r.id} className="border-b border-slate-100 align-top hover:bg-slate-50">
                            <td className="py-2 pr-3 min-w-[220px]">
                              <Link href={`/sales/events/${r.id}`} className="font-medium text-slate-900 hover:text-orange-600">{r.name}</Link>
                              <div className="mt-0.5 flex flex-wrap gap-1"><EventMarks r={r} /></div>
                            </td>
                            <td className="py-2 pr-3 whitespace-nowrap">{dateText(r)}</td>
                            <td className="py-2 pr-3 whitespace-nowrap">{placeText(r)}</td>
                            <td className="py-2 pr-3">{r.verticalLabel}</td>
                            <td className="py-2 pr-3 min-w-[120px] text-slate-500">{r.tagLabels.join(', ')}</td>
                            <td className="py-2 pr-3">{r.format}</td>
                            <td className="py-2 pr-3">{r.access}</td>
                            <td className="py-2 pr-3 text-right tabular-nums">{r.attendance ? r.attendance.toLocaleString('en-US') : ''}</td>
                            <td className="py-2 pr-3 text-right tabular-nums whitespace-nowrap">
                              {money(r.reg)} <span className="text-slate-400">{r.priceLabel}</span>
                            </td>
                            <td className="py-2 pr-3 text-right tabular-nums">{r.score?.toFixed(2)}</td>
                            <td className="py-2"><TierPill tier={r.tier} /></td>
                          </tr>
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
