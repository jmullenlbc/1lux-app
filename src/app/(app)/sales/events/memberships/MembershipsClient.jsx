'use client';
import { useEffect, useMemo, useState } from 'react';
import SectionTabs, { EVENTS_TABS } from '@/components/ui/SectionTabs';
import { FilterToolbar, FilterPanel, countFilters } from '@/components/ui/FilterPanel';
import SortHeader, { Th, SortSelect, sortRows } from '@/components/ui/SortHeader';
import StatTile from '@/components/ui/StatTile';
import AutoNumber, { NumberTile } from '@/components/ui/AutoNumber';
import { WidgetLoading } from '@/components/ui/WidgetFrame';
import { useUrlView } from '@/lib/useUrlView';
import { sumCents } from '@/lib/money';
import { membershipTotals } from '@/lib/conferences/engine';
import { BTN_COMPACT, BTN_COMPACT_PRIMARY, CARD_PADDED, H1, INPUT } from '@/components/ui/tokens';
import { MEMBERSHIP_INCLUDE } from '@/lib/conferences/constants';
import { FIELD, useConferences, money, NotLoaded, SearchBox } from '@/components/events/eventsShared';

const FILTERS = [
  { key: 'q', label: 'Search', kind: 'text', placeholder: 'Membership' },
  { key: 'include', label: 'Include', kind: 'pick' },
  { key: 'counted', label: 'Counted', kind: 'yesno' },
  { key: 'paid', label: 'Paid', kind: 'yesno' },
];
const PANEL = FILTERS.filter(f => f.key !== 'q');
const CHOICES = { include: MEMBERSHIP_INCLUDE.map(o => [o.key, o.label]) };
const VIEW_FIELDS = [...FILTERS, ...['name', 'dues', 'actual'].map(k => ({ key: k, kind: 'sort' }))];
const SORT_DEFAULT = { key: 'name', dir: 'asc' };
const SORT_CHOICES = [{ key: 'name', label: 'Name' }, { key: 'dues', label: 'Dues' }, { key: 'actual', label: 'Actual' }];
const GETTERS = { name: m => m.orgName.toLowerCase(), dues: m => m.annualDues, actual: m => m.paid };

// A year typed by hand passes through 0002, 0020 and 0202 on its way to 2027.
function PaidOn({ value, label, onSave }) {
  const [day, setDay] = useState(value || '');
  useEffect(() => setDay(value || ''), [value]);
  return (
    <input type="date" className={`${FIELD} w-32`} aria-label={label} value={day}
      onChange={e => { setDay(e.target.value); if (!e.target.value || e.target.value >= '2000') onSave(e.target.value); }} />
  );
}

function AddMembership({ onAdded }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const add = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      const res = await fetch('/api/conferences/memberships', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orgName: name }) });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(out.error || `The membership did not save on our server. Try again. (HTTP ${res.status})`);
      setName('');
      await onAdded();
    } catch (e2) {
      setErr(e2 instanceof TypeError ? 'No signal reaching our server. The membership was not saved. Check your connection and try again.' : e2.message);
    }
    setBusy(false);
  };

  return (
    <form onSubmit={add} className="mt-3">
      <div className="flex flex-col sm:flex-row gap-2">
        <input className={`${INPUT} sm:max-w-xs`} placeholder="New membership" aria-label="New membership" value={name} onChange={e => setName(e.target.value)} />
        <button type="submit" className={BTN_COMPACT_PRIMARY} disabled={busy || !name.trim()}>{busy ? 'Adding' : 'Add membership'}</button>
      </div>
      {err && <p className="text-xs text-red-600 mt-1">{err}</p>}
    </form>
  );
}

// Budgets are typed for the whole year, so filters leave them alone.
function MembershipNumbers({ data, rows, editable, save }) {
  const year = data.plan.year;
  const today = new Date().toISOString().slice(0, 10);
  const totals = membershipTotals(rows, today);
  const budget = (y) => data.membershipBudgets?.[y]?.budget ?? null;
  const typed = data.membershipBudgets?.[year - 1]?.typedSpend ?? null;
  const left = budget(year) == null ? null : sumCents([budget(year), -totals.ytdSpend]);

  const budgetTile = (label, y, sub) => (
    <NumberTile label={label} sub={sub} value={budget(y)} shown={budget(y) == null ? 'Not set' : money(budget(y))}
      canEdit={editable} placeholder="Not set" onSave={v => save('/api/sales/annual-budgets', { area: 'MEMBERSHIPS', year: y, budget: v })} />
  );

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {budgetTile('Annual budget', year, `${year}, whole year`)}
      <StatTile label="YTD spend" value={money(totals.ytdSpend)} tone={left != null && left < 0 ? 'danger' : 'default'}
        sub={left == null ? String(year) : `${money(Math.abs(left))} ${left < 0 ? 'over' : 'left of'} budget`} />
      <StatTile label="Current year spend" value={money(totals.yearSpend)} sub={`${year}, paid`} />
      <StatTile label="Planned" value={money(totals.planned)} sub={`${year}: dues counted`} />
      {budgetTile('Last year budget', year - 1, String(year - 1))}
      <NumberTile label="Last year spend" value={typed} shown={typed == null ? 'Not set' : money(typed)} canEdit={editable} placeholder="Not set"
        sub={`${year - 1}, typed`} onSave={v => save('/api/sales/annual-budgets', { area: 'MEMBERSHIPS', year: year - 1, typedSpend: v })} />
      {budgetTile('Next year budget', year + 1, String(year + 1))}
      <StatTile label="Still to pay" value={money(totals.toPay)} sub={`${year}: counted, not paid`} />
    </div>
  );
}

function MembershipTable({ rows, canEdit, save, sort, onSort }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-xs">
        <thead>
          <tr className="border-b border-slate-200 text-left text-slate-500">
            <SortHeader field="name" label="Membership" sort={sort} onSort={onSort} />
            <Th>Include</Th>
            <SortHeader field="dues" label="Dues" sort={sort} onSort={onSort} align="right" />
            <SortHeader field="actual" label="Actual" sort={sort} onSort={onSort} align="right" />
            <Th>Paid on</Th>
            <Th align="right">Counted</Th>
            <Th align="right">Events unlocked</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map(m => {
            const url = `/api/conferences/memberships/${m.id}`;
            return (
              <tr key={m.id} className="border-b border-slate-100 align-top">
                <td className="py-2 pr-3 min-w-[160px]">
                  <span className="font-medium text-slate-900">{m.orgName}</span>
                  {m.notes && <p className="text-slate-500 mt-0.5">{m.notes}</p>}
                </td>
                <td className="py-2 pr-3">
                  {canEdit ? (
                    <select className={FIELD} aria-label={`Include ${m.orgName}`} value={m.include} onChange={e => save(url, { include: e.target.value })}>
                      {MEMBERSHIP_INCLUDE.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
                    </select>
                  ) : MEMBERSHIP_INCLUDE.find(o => o.key === m.include)?.label}
                </td>
                <td className="py-2 pr-3 text-right">
                  {canEdit ? (
                    <AutoNumber className={`${FIELD} w-24 text-right tabular-nums`} value={m.annualDues} label={`Dues for ${m.orgName}`} placeholder="Not priced"
                      onSave={v => save(url, { annualDues: v })} />
                  ) : money(m.annualDues)}
                </td>
                <td className="py-2 pr-3 text-right">
                  {canEdit ? (
                    <AutoNumber className={`${FIELD} w-24 text-right tabular-nums`} value={m.paid} label={`Actual for ${m.orgName}`} placeholder="Not paid"
                      onSave={v => save(url, { paid: v })} />
                  ) : money(m.paid)}
                </td>
                <td className="py-2 pr-3">
                  {canEdit ? <PaidOn value={m.paidOn} label={`Paid on for ${m.orgName}`} onSave={v => save(url, { paidOn: v })} /> : m.paidOn}
                </td>
                <td className="py-2 pr-3 text-right tabular-nums">{m.on ? money(m.duesCounted) : ''}</td>
                <td className="py-2 text-right tabular-nums">{m.unlocks.length ? m.unlockedCount : ''}</td>
              </tr>
            );
          })}
          {rows.length === 0 && <tr><td colSpan={7} className="py-4 text-center text-slate-500">No memberships match.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

export default function MembershipsClient() {
  const { filters, setFilter, clearFilters, sort, setSort, toggleSort } = useUrlView({ fields: VIEW_FIELDS, sortDefault: SORT_DEFAULT });
  const { data, err, loading, save, reload } = useConferences();
  const [open, setOpen] = useState(false);

  const all = data?.result?.memberships;
  const rows = useMemo(() => {
    const q = (filters.q || '').toLowerCase();
    const yes = (pick, on) => !pick || (pick === 'yes') === on;
    return sortRows((all || []).filter(m => (!q || m.orgName.toLowerCase().includes(q))
      && (!filters.include || m.include === filters.include)
      && yes(filters.counted, !!m.on)
      && yes(filters.paid, m.paid != null)), sort, GETTERS);
  }, [all, filters, sort]);
  const count = countFilters(filters, FILTERS);

  return (
    <div className="px-4 py-6 pb-28">
      <SectionTabs tabs={EVENTS_TABS} className="mb-5" />
      <div className="max-w-6xl mx-auto space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className={H1}>Memberships</h1>
            <p className="text-xs text-slate-500 mt-0.5">Budget and actuals for the year. Automatic turns on when a ticked event needs the membership, and off when none does.</p>
          </div>
          <a href="/api/conferences/export" className={`${BTN_COMPACT} whitespace-nowrap`}>Export to Excel</a>
        </div>

        {err && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</p>}

        {loading ? <WidgetLoading /> : data && !data.loaded ? (
          <div className={CARD_PADDED}><NotLoaded canLoad={data.canEdit} /></div>
        ) : data && (
          <>
            <MembershipNumbers data={data} rows={rows} editable={data.canEdit} save={save} />
            <div className={CARD_PADDED}>
              <SearchBox value={filters.q} onChange={setFilter} label="Search memberships" />
              <FilterToolbar count={count} open={open} onToggle={() => setOpen(o => !o)} onClear={clearFilters}
                shown={rows.length} total={(all || []).length} noun="memberships"
                right={<SortSelect className="sm:hidden" fields={SORT_CHOICES} sort={sort} onChange={setSort} />} />
              <FilterPanel open={open} fields={PANEL} filters={filters} choices={CHOICES} onChange={setFilter} />
              <MembershipTable rows={rows} canEdit={data.canEdit} save={save} sort={sort} onSort={toggleSort} />
              {data.canEdit && <AddMembership onAdded={reload} />}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
