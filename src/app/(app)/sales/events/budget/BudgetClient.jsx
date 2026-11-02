'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import SectionTabs, { EVENTS_TABS } from '@/components/ui/SectionTabs';
import { FilterToolbar, FilterPanel, countFilters } from '@/components/ui/FilterPanel';
import SortHeader, { Th, SortSelect } from '@/components/ui/SortHeader';
import AutoNumber from '@/components/ui/AutoNumber';
import { WidgetLoading } from '@/components/ui/WidgetFrame';
import { useUrlView } from '@/lib/useUrlView';
import { groupTotals } from '@/lib/conferences/engine';
import { BTN_COMPACT, BTN_COMPACT_PRIMARY, CARD_PADDED, CARD_TITLE, H1, HELPER, INPUT, LABEL } from '@/components/ui/tokens';
import { MEMBERSHIP_INCLUDE, verticalLabel, regionLabel, statusLabel } from '@/lib/conferences/constants';
import { SHARED_FILTERS, PANEL_FILTERS, FIELD, filterChoices, useConferences, useVisible, money, dateText, NotLoaded, GoingBox, SearchBox, YearNumbers } from '@/components/events/eventsShared';

const VIEW_FIELDS = [...SHARED_FILTERS, ...['date', 'name', 'reg', 'cost', 'planned'].map(k => ({ key: k, kind: 'sort' }))];
const SORT_DEFAULT = { key: 'date', dir: 'asc' };
const SORT_CHOICES = [{ key: 'date', label: 'Date' }, { key: 'name', label: 'Name' }, { key: 'reg', label: 'Registration' }, { key: 'cost', label: 'Per person' }, { key: 'planned', label: 'Planned' }];

function Breakdown({ title, rows, label = (k) => k }) {
  return (
    <div>
      <h3 className={`${LABEL} mb-1`}>{title}</h3>
      <table className="w-full text-xs">
        <tbody>
          {rows.map(b => (
            <tr key={b.key} className="border-b border-slate-100">
              <td className="py-1 pr-2">{label(b.key)}</td>
              <td className="py-1 pr-2 text-right tabular-nums text-slate-500">{b.events}</td>
              <td className="py-1 text-right tabular-nums">{money(b.planned)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Memberships({ result, canEdit, save, q }) {
  return (
    <div className={CARD_PADDED}>
      <h2 className={`${CARD_TITLE} mb-1`}>Memberships</h2>
      <p className={`${HELPER} mb-3`}>Automatic turns on when a ticked event needs the membership, and off when none does.</p>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500">
              <th className="py-1 pr-3 font-medium">Membership</th>
              <th className="py-1 pr-3 font-medium">Include</th>
              <th className="py-1 pr-3 font-medium text-right">Dues</th>
              <th className="py-1 pr-3 font-medium text-right">Counted</th>
              <th className="py-1 font-medium text-right">Events unlocked</th>
            </tr>
          </thead>
          <tbody>
            {result.memberships.filter(m => !q || m.orgName.toLowerCase().includes(q.toLowerCase())).map(m => (
              <tr key={m.id} className="border-b border-slate-100 align-top">
                <td className="py-2 pr-3 min-w-[160px]">
                  <span className="font-medium text-slate-900">{m.orgName}</span>
                  {m.notes && <p className="text-slate-500 mt-0.5">{m.notes}</p>}
                </td>
                <td className="py-2 pr-3">
                  {canEdit ? (
                    <select className="border border-slate-300 rounded px-1 py-0.5 text-xs bg-white" aria-label={`Include ${m.orgName}`} value={m.include}
                      onChange={e => save(`/api/conferences/memberships/${m.id}`, { include: e.target.value })}>
                      {MEMBERSHIP_INCLUDE.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
                    </select>
                  ) : MEMBERSHIP_INCLUDE.find(o => o.key === m.include)?.label}
                </td>
                <td className="py-2 pr-3 text-right">
                  {canEdit ? (
                    <AutoNumber className={`${FIELD} w-24 text-right tabular-nums`} value={m.annualDues} label={`Dues for ${m.orgName}`} placeholder="Not priced"
                      onSave={v => save(`/api/conferences/memberships/${m.id}`, { annualDues: v })} />
                  ) : money(m.annualDues)}
                </td>
                <td className="py-2 pr-3 text-right tabular-nums">{m.on ? money(m.duesCounted) : ''}</td>
                <td className="py-2 text-right tabular-nums">{m.unlocks.length ? m.unlockedCount : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const pct = (n) => Math.round(n * 1000) / 10;
const NumberBox = ({ label, value, onChange, step = 'any', suffix }) => (
  <label className="block">
    <span className={LABEL}>{label}</span>
    <span className="flex items-center gap-1">
      <input type="number" step={step} className={`${INPUT} tabular-nums`} value={value ?? ''} onChange={e => onChange(e.target.value === '' ? NaN : Number(e.target.value))} />
      {suffix && <span className="text-xs text-slate-500">{suffix}</span>}
    </span>
  </label>
);

// Every number the score and cost math reads. Weights show as percents.
function PlanningRules({ data, save }) {
  const [open, setOpen] = useState(false);
  const [s, setS] = useState(null);
  const [busy, setBusy] = useState(false);
  const settings = s || data.settings;

  const put = (head, sub, v) => setS(prev => {
    const next = structuredClone(prev || data.settings);
    if (sub === null) next[head] = v; else next[head][sub] = v;
    return next;
  });
  const weightTotal = Math.round(Object.values(settings.weights).reduce((a, b) => a + (b || 0), 0) * 1000) / 10;

  async function submit() {
    setBusy(true);
    const ok = await save('/api/conferences/plan', { settings });
    setBusy(false);
    if (ok) setS(null);
  }

  return (
    <div className={CARD_PADDED}>
      <button type="button" className={`${CARD_TITLE} w-full text-left`} onClick={() => setOpen(o => !o)} aria-expanded={open}>
        Planning rules <span className="font-normal text-slate-500">{open ? 'Hide' : 'Show'}</span>
      </button>
      {open && (
        <div className="mt-3 space-y-5">
          <section>
            <h3 className={`${LABEL} mb-2`}>Score weights {weightTotal !== 100 && <span className="text-red-600">Adds up to {weightTotal}%, should be 100%</span>}</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {Object.keys(settings.weights).map(k => (
                <NumberBox key={k} label={k.replace(/([A-Z])/g, ' $1').toLowerCase()} suffix="%" value={pct(settings.weights[k])} onChange={v => put('weights', k, v / 100)} />
              ))}
            </div>
          </section>
          <section>
            <h3 className={`${LABEL} mb-2`}>Tiers and headcount</h3>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <NumberBox label="Tier A score" value={settings.tiers.A} onChange={v => put('tiers', 'A', v)} />
              <NumberBox label="Tier B score" value={settings.tiers.B} onChange={v => put('tiers', 'B', v)} />
              {['A', 'B', 'C'].map(t => <NumberBox key={t} label={`Going, Tier ${t}`} value={settings.headcount[t]} onChange={v => put('headcount', t, v)} />)}
            </div>
          </section>
          <section>
            <h3 className={`${LABEL} mb-2`}>Vertical priority and market fit (1 to 5)</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {Object.keys(settings.verticalPriority).map(k => <NumberBox key={k} label={verticalLabel(k)} value={settings.verticalPriority[k]} onChange={v => put('verticalPriority', k, v)} />)}
              {Object.keys(settings.marketFit).map(k => <NumberBox key={k} label={k.toLowerCase()} value={settings.marketFit[k]} onChange={v => put('marketFit', k, v)} />)}
            </div>
          </section>
          <section>
            <h3 className={`${LABEL} mb-2`}>Score bands: attendance, then cost per person</h3>
            <div className="grid grid-cols-4 gap-3">
              {settings.reachBands.map((v, i) => <NumberBox key={`r${i}`} label={`Attendance ${5 - i}`} value={v} onChange={x => put('reachBands', i, x)} />)}
              {settings.costBands.map((v, i) => <NumberBox key={`c${i}`} label={`Cost ${5 - i}`} value={v} onChange={x => put('costBands', i, x)} />)}
            </div>
          </section>
          <section>
            <h3 className={`${LABEL} mb-2`}>Travel</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <NumberBox label="Hotel a night" value={settings.hotelDefault} onChange={v => put('hotelDefault', null, v)} />
              <NumberBox label="Per diem" value={settings.perDiem} onChange={v => put('perDiem', null, v)} />
              <NumberBox label="Days if no dates" value={settings.defaultDays} onChange={v => put('defaultDays', null, v)} />
              <NumberBox label="Extra hotel nights" value={settings.extraHotelNights} onChange={v => put('extraHotelNights', null, v)} />
              <NumberBox label="Contingency" suffix="%" value={pct(settings.contingency)} onChange={v => put('contingency', null, v / 100)} />
              <NumberBox label="Sponsor placeholder" value={settings.sponsorPlaceholder} onChange={v => put('sponsorPlaceholder', null, v)} />
            </div>
          </section>
          <section>
            <h3 className={`${LABEL} mb-1`}>Airfare from Denver, by state</h3>
            <div className="grid grid-cols-3 sm:grid-cols-6 lg:grid-cols-10 gap-2">
              {Object.keys(settings.airfareByState).map(k => <NumberBox key={k} label={k} value={settings.airfareByState[k]} onChange={v => put('airfareByState', k, v)} />)}
            </div>
          </section>
          <button type="button" className={BTN_COMPACT_PRIMARY} disabled={busy} onClick={submit}>{busy ? 'Saving...' : 'Save rules'}</button>
        </div>
      )}
    </div>
  );
}

// What the plan costs under each scenario, with memberships on top.
function EventCosts({ rows, canEdit, saveEvent, sort, onSort }) {
  if (!rows.length) return <p className={HELPER}>No events match.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="border-b border-slate-200">
            <SortHeader field="name" label="Event" sort={sort} onSort={onSort} />
            <SortHeader field="date" label="Dates" sort={sort} onSort={onSort} />
            <Th>Status</Th>
            <Th align="right">Going</Th>
            <SortHeader field="reg" label="Registration" sort={sort} onSort={onSort} align="right" />
            <SortHeader field="cost" label="Per person" sort={sort} onSort={onSort} align="right" />
            <SortHeader field="planned" label="Planned" sort={sort} onSort={onSort} align="right" />
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.id} className="border-b border-slate-100 last:border-0">
              <td className="py-2 pr-3"><Link href={`/sales/events/${r.id}`} className="text-orange-600 hover:underline">{r.name}</Link></td>
              <td className="py-2 pr-3 text-xs text-slate-600 whitespace-nowrap">{dateText(r)}</td>
              <td className="py-2 pr-3 text-xs text-slate-600">{statusLabel(r.status)}</td>
              <td className="py-2 pr-3 text-right"><GoingBox r={r} canEdit={canEdit} onSave={saveEvent} /></td>
              <td className="py-2 pr-3 text-right tabular-nums">
                {canEdit ? <AutoNumber className={`${FIELD} w-24 text-right tabular-nums`} value={r.reg} label={`Registration for ${r.name}`} onSave={v => saveEvent(r.id, { regCost: v })} /> : money(r.reg)}
              </td>
              <td className="py-2 pr-3 text-right tabular-nums">{money(r.perPerson)}</td>
              <td className="py-2 text-right tabular-nums">{money(r.plannedCost)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function BudgetClient() {
  const { filters, setFilter, clearFilters, sort, setSort, toggleSort } = useUrlView({ fields: VIEW_FIELDS, sortDefault: SORT_DEFAULT });
  const { data, err, loading, save, saveEvent } = useConferences();
  const [open, setOpen] = useState(false);

  const all = useMemo(() => data?.rows || [], [data]);
  const rows = useVisible(all, filters, sort);
  const choices = useMemo(() => filterChoices(all), [all]);
  const year = Number(filters.year) || new Date().getFullYear();
  const listed = filters.included ? rows : rows.filter(r => r.include);
  const counted = rows.filter(r => r.include && Number(r.year) === year);

  return (
    <div className="px-4 py-6 pb-28">
      <SectionTabs tabs={EVENTS_TABS} className="mb-5" />
      <div className="max-w-6xl mx-auto space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className={H1}>Budget</h1>
            <p className="text-xs text-slate-500 mt-0.5">The yearly budget against what we have spent and planned.</p>
          </div>
          <a href="/api/conferences/export" className={BTN_COMPACT}>Export to Excel</a>
        </div>
        {err && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</p>}

        {loading ? <WidgetLoading /> : data && !data.loaded ? <div className={CARD_PADDED}><NotLoaded canLoad={data.canEdit} /></div> : data && (
          <>
            <YearNumbers data={data} filters={filters} editable={data.canEdit} save={save} />

            <div className={CARD_PADDED}>
              <div className="mb-3">
                <SearchBox value={filters.q} onChange={setFilter} />
                <FilterToolbar count={countFilters(filters, SHARED_FILTERS)} open={open} onToggle={() => setOpen(o => !o)} onClear={clearFilters}
                  shown={listed.length} total={all.filter(r => r.include).length} noun="events"
                  right={<SortSelect className="sm:hidden" fields={SORT_CHOICES} sort={sort} onChange={setSort} />} />
                <FilterPanel open={open} fields={PANEL_FILTERS} filters={filters} choices={choices} onChange={setFilter} />
              </div>
              <EventCosts rows={listed} canEdit={data.canEdit} saveEvent={saveEvent} sort={sort} onSort={toggleSort} />
            </div>

            <Memberships result={data.result} canEdit={data.canEdit} save={save} q={filters.q} />

            <div className={CARD_PADDED}>
              <h2 className={`${CARD_TITLE} mb-3`}>Where the {year} plan goes</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                <Breakdown title="By quarter" rows={groupTotals(counted, r => r.quarter || 'TBD')} label={k => (k === 'TBD' ? 'Date TBD' : k)} />
                <Breakdown title="By vertical" rows={groupTotals(counted, r => r.vertical)} label={verticalLabel} />
                <Breakdown title="By region" rows={groupTotals(counted, r => r.region)} label={regionLabel} />
              </div>
            </div>

            {data.canEdit && <PlanningRules data={data} save={save} />}
          </>
        )}
      </div>
    </div>
  );
}
