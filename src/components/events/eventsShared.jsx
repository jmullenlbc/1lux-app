'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { sortRows } from '@/components/ui/SortHeader';
import { countFilters } from '@/components/ui/FilterPanel';
import StatTile from '@/components/ui/StatTile';
import AutoNumber, { NumberTile } from '@/components/ui/AutoNumber';
import { INPUT } from '@/components/ui/tokens';
import { sumCents } from '@/lib/money';
import { yearTotals } from '@/lib/conferences/engine';
import { TIERS, VERTICALS, FOCUS_TAGS, FORMATS, ACCESS_ROUTES, SCOPES, EDITION_STATUSES, PRICE_BASES, REGIONS, regionLabel } from '@/lib/conferences/constants';

// Shared by the Library, Plan, Budget and Memberships tabs. Every tab reads one answer from
// /api/conferences, so a change on one shows on all three.

export const money = (n) => (n == null ? '' : Number(n).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }));
export const moneyCents = (n) => (n == null ? '' : Number(n).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }));

const day = (d) => new Date(`${d}T12:00:00.000Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
export function dateText(r) {
  if (!r.start) return 'Date TBD';
  const y = r.start.slice(0, 4);
  return r.end && r.end !== r.start ? `${day(r.start)} to ${day(r.end)}, ${y}` : `${day(r.start)}, ${y}`;
}
export const placeText = (r) => [r.city, r.state === 'TBD' ? null : r.state].filter(Boolean).join(', ') || 'Location TBD';

const pairs = (list) => list.map(x => (typeof x === 'string' ? [x, x] : [x.key, x.label]));

export const SHARED_FILTERS = [
  { key: 'q', label: 'Search', kind: 'text', placeholder: 'Event or organizer' },
  { key: 'year', label: 'Year', kind: 'pick' },
  { key: 'vertical', label: 'Vertical', kind: 'pick' },
  { key: 'focus', label: 'Focus', kind: 'pick' },
  { key: 'scope', label: 'Scope', kind: 'pick' },
  { key: 'region', label: 'Region', kind: 'pick' },
  { key: 'state', label: 'State', kind: 'pick' },
  { key: 'tier', label: 'Tier', kind: 'pick' },
  { key: 'status', label: 'Status', kind: 'pick' },
  { key: 'quarter', label: 'Quarter', kind: 'pick' },
  { key: 'format', label: 'Format', kind: 'pick' },
  { key: 'access', label: 'Access route', kind: 'pick' },
  { key: 'dateStatus', label: 'Date confidence', kind: 'pick' },
  { key: 'priceBasis', label: 'Price confidence', kind: 'pick' },
  { key: 'included', label: 'Included only', kind: 'yesno' },
  { key: 'perPerson', label: 'Per person', kind: 'range' },
];

// Search has its own box, so the panel leaves it out.
export const PANEL_FILTERS = SHARED_FILTERS.filter(f => f.key !== 'q');

// Our options plus anything typed on an event.
const withCustom = (list, used) => {
  const out = pairs(list);
  const known = new Set(out.map(([k]) => k));
  return [...out, ...[...new Set(used.filter(Boolean))].filter(v => !known.has(v)).sort().map(v => [v, v])];
};

export function filterChoices(rows) {
  const uniq = (fn) => [...new Set(rows.map(fn).filter(Boolean))].sort();
  return {
    year: uniq(r => r.year && String(r.year)),
    vertical: withCustom(VERTICALS, rows.map(r => r.vertical)),
    focus: withCustom(FOCUS_TAGS, rows.flatMap(r => r.tags)),
    scope: pairs(SCOPES),
    region: Object.keys(REGIONS).map(k => [k, regionLabel(k)]),
    state: uniq(r => r.state),
    tier: pairs(TIERS),
    status: pairs(EDITION_STATUSES),
    quarter: uniq(r => r.quarter),
    format: [...new Set([...pairs(FORMATS).map(([, label]) => label), ...rows.map(r => r.format).filter(Boolean)])],
    access: withCustom(ACCESS_ROUTES, rows.map(r => r.accessRoute)),
    dateStatus: [['CONFIRMED', 'Confirmed'], ['ESTIMATED', 'Estimated']],
    priceBasis: pairs(PRICE_BASES),
  };
}

export function applyFilters(rows, f) {
  const q = (f.q || '').trim().toLowerCase();
  const min = f.perPerson?.min === '' || f.perPerson?.min == null ? null : Number(f.perPerson.min);
  const max = f.perPerson?.max === '' || f.perPerson?.max == null ? null : Number(f.perPerson.max);
  return rows.filter(r => {
    if (q && !`${r.name} ${r.organizer || ''}`.toLowerCase().includes(q)) return false;
    if (f.year && String(r.year) !== f.year) return false;
    if (f.vertical && r.vertical !== f.vertical) return false;
    if (f.focus && !r.tags.includes(f.focus)) return false;
    if (f.scope && r.scope !== f.scope) return false;
    if (f.region && r.region !== f.region) return false;
    if (f.state && r.state !== f.state) return false;
    if (f.tier && r.tier !== f.tier) return false;
    if (f.status && r.status !== f.status) return false;
    if (f.quarter && r.quarter !== f.quarter) return false;
    if (f.format && r.format !== f.format) return false;
    if (f.access && r.accessRoute !== f.access) return false;
    if (f.dateStatus && r.dateStatus !== f.dateStatus) return false;
    if (f.priceBasis && r.regCostBasis !== f.priceBasis) return false;
    if (f.included === 'yes' && !r.include) return false;
    if (f.included === 'no' && r.include) return false;
    if (min != null && r.perPerson < min) return false;
    if (max != null && r.perPerson > max) return false;
    return true;
  });
}

const GETTERS = {
  date: r => r.start || '9999',
  rank: r => r.rank,
  score: r => r.score,
  cost: r => r.perPerson,
  planned: r => (r.include ? r.plannedCost : 0),
  name: r => r.name,
  place: r => placeText(r),
  attendance: r => r.attendance || 0,
  reg: r => r.reg ?? 0,
};
export const sortEvents = (rows, sort) => sortRows(rows, sort, GETTERS);

/** The one read of the plan. `save` patches, then reloads, since one change can move every rank. */
export function useConferences() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);

  // Two quick saves reload twice. Only the newest read may land.
  const reload = useCallback(async () => {
    const mine = ++seq.current;
    try {
      const res = await fetch('/api/conferences');
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `The events did not load on our server. Nothing was changed. Refresh to try again. (HTTP ${res.status})`);
      if (mine !== seq.current) return;
      setData(body);
      setErr('');
    } catch (e) {
      if (mine !== seq.current) return;
      setErr(e instanceof TypeError ? 'No signal reaching our server. Nothing was changed. Check your connection and refresh.' : e.message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { reload(); }, [reload]);

  const save = useCallback(async (url, body) => {
    setErr('');
    try {
      const res = await fetch(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(out.error || `The change did not save on our server. Try again. (HTTP ${res.status})`);
      await reload();
      return true;
    } catch (e) {
      setErr(e instanceof TypeError ? 'No signal reaching our server. That change was not saved. Check your connection and try again.' : e.message);
      return false;
    }
  }, [reload]);

  const saveEvent = useCallback((id, body) => save(`/api/conferences/editions/${id}`, body), [save]);
  return { data, err, loading, reload, save, saveEvent };
}

const TIER_TONE = {
  A: 'bg-green-100 text-green-800',
  B: 'bg-blue-100 text-blue-800',
  C: 'bg-slate-100 text-slate-600',
  X: 'bg-red-100 text-red-700',
};
export function TierPill({ tier, className }) {
  return <span className={cn('inline-block rounded px-1.5 py-0.5 text-[11px] font-semibold', TIER_TONE[tier] || TIER_TONE.C, className)}>{tier}</span>;
}

export function Pill({ children, tone = 'slate' }) {
  const tones = { slate: 'bg-slate-100 text-slate-600', amber: 'bg-amber-100 text-amber-800', red: 'bg-red-100 text-red-700' };
  return <span className={cn('inline-block rounded px-1.5 py-0.5 text-[11px] whitespace-nowrap', tones[tone])}>{children}</span>;
}

export function NotLoaded({ canLoad }) {
  return (
    <p className="text-sm text-slate-600 py-6 text-center">
      The conference list is not loaded yet.{' '}
      {canLoad ? <Link href="/admin/conference-load" className="text-orange-600 hover:underline">Load it here.</Link> : 'Ask an admin to load it.'}
    </p>
  );
}

/** Marks on an event name. Date status words only, never a Budget figure. */
export function EventMarks({ r }) {
  return (
    <>
      {r.dateStatus === 'ESTIMATED' && r.start && <Pill>Dates not confirmed</Pill>}
      {r.needsMembership && <Pill tone="amber">Requires {r.membership || 'membership'}</Pill>}
      {r.clash && <Pill tone="red">Clashes</Pill>}
      {r.restriction && <Pill tone="red">Suppliers barred</Pill>}
    </>
  );
}

export const useVisible = (rows, filters, sort) => useMemo(() => sortEvents(applyFilters(rows, filters), sort), [rows, filters, sort]);

export const FIELD = 'border border-slate-300 rounded px-1 py-0.5 text-xs bg-white';

// Going above 0 puts the event in the plan, 0 takes it out, blank goes back to automatic.
export const goingPatch = (v) => (v === '' ? { headcountOverride: null, includeOverride: null } : { headcountOverride: v, includeOverride: Number(v) > 0 });

export function GoingBox({ r, canEdit, onSave }) {
  if (!canEdit) return <span className="tabular-nums">{r.headcount}</span>;
  return <AutoNumber value={r.headcount} step="1" className={`${FIELD} w-14 text-right tabular-nums`} label={`Going to ${r.name}`} onSave={v => onSave(r.id, goingPatch(v))} />;
}

export function SearchBox({ value, onChange, label = 'Search events' }) {
  return <input type="search" className={`${INPUT} mb-3`} placeholder={label} aria-label={label} value={value || ''} onChange={e => onChange('q', e.target.value)} />;
}

/**
 * The top numbers on every tab. Filters and search move them. The Year filter picks which year
 * is this year. Budgets are typed for the whole year, so filters leave them alone.
 */
export function YearNumbers({ data, filters, editable = false, save }) {
  const year = Number(filters.year) || new Date().getFullYear();
  const today = new Date().toISOString().slice(0, 10);
  const scoped = useMemo(() => applyFilters(data.rows, { ...filters, year: '' }), [data.rows, filters]);
  const filtered = countFilters({ ...filters, year: '' }, SHARED_FILTERS) > 0;
  const c = data.settings.contingency;
  const now = yearTotals(scoped, year, today, c);
  const last = yearTotals(scoped, year - 1, today, c);
  const next = yearTotals(scoped, year + 1, today, c);

  const budget = (y) => data.budgets?.[y]?.budget ?? null;
  const typed = data.budgets?.[year - 1]?.typedSpend ?? null;
  const lastSpend = filtered ? last.yearSpend : typed ?? last.yearSpend;
  const left = budget(year) == null ? null : sumCents([budget(year), -now.ytdSpend]);

  const setBudget = (y) => (v) => save('/api/sales/annual-budgets', { area: 'EVENTS', year: y, budget: v });
  const budgetTile = (label, y, sub) => (
    <NumberTile label={label} sub={sub} value={budget(y)} shown={budget(y) == null ? 'Not set' : money(budget(y))}
      canEdit={editable} onSave={setBudget(y)} placeholder="Not set" />
  );

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {budgetTile('Annual budget', year, `${year}, whole year`)}
      <StatTile label="YTD spend" value={money(now.ytdSpend)} tone={left != null && left < 0 ? 'danger' : 'default'}
        sub={left == null ? String(year) : `${money(Math.abs(left))} ${left < 0 ? 'over' : 'left of'} budget`} />
      <StatTile label="Current year spend" value={money(now.yearSpend)} sub={`${year}, Registered and Attended`} />
      <StatTile label="Planned" value={money(now.planned)} sub={`${year}: ${now.events} events, ${now.trips} trips, with contingency`} />
      {budgetTile('Last year budget', year - 1, String(year - 1))}
      <NumberTile label="Last year spend" value={typed} shown={money(lastSpend)} canEdit={editable && !filtered} placeholder={String(last.yearSpend)}
        sub={`${year - 1}, ${!filtered && typed != null ? 'typed' : 'from events'}`}
        onSave={v => save('/api/sales/annual-budgets', { area: 'EVENTS', year: year - 1, typedSpend: v })} />
      {budgetTile('Next year budget', year + 1, String(year + 1))}
      <StatTile label="Next year planned" value={money(next.planned)} sub={`${year + 1}: ${next.events} events`} />
    </div>
  );
}
