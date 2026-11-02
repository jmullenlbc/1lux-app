'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { sortRows } from '@/components/ui/SortHeader';
import { TIERS, VERTICALS, FOCUS_TAGS, FORMATS, ACCESS_ROUTES, SCOPES, EDITION_STATUSES, PRICE_BASES, REGIONS, regionLabel } from '@/lib/conferences/constants';

// Shared by the Library, Plan and Budget tabs. Every tab reads one answer from
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

export function filterChoices(rows) {
  const uniq = (fn) => [...new Set(rows.map(fn).filter(Boolean))].sort();
  return {
    year: uniq(r => r.year && String(r.year)),
    vertical: pairs(VERTICALS),
    focus: pairs(FOCUS_TAGS),
    scope: pairs(SCOPES),
    region: Object.keys(REGIONS).map(k => [k, regionLabel(k)]),
    state: uniq(r => r.state),
    tier: pairs(TIERS),
    status: pairs(EDITION_STATUSES),
    quarter: uniq(r => r.quarter),
    format: pairs(FORMATS).map(([, label]) => label),
    access: pairs(ACCESS_ROUTES),
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

  const reload = useCallback(async () => {
    try {
      const res = await fetch('/api/conferences');
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `The events did not load on our server. Nothing was changed. Refresh to try again. (HTTP ${res.status})`);
      setData(body);
      setErr('');
    } catch (e) {
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
