'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import SectionTabs, { SALES_DOCS_TABS } from '@/components/ui/SectionTabs';
import { FilterToolbar, FilterPanel, SearchBox, countFilters } from '@/components/ui/FilterPanel';
import SortHeader from '@/components/ui/SortHeader';
import StatTile from '@/components/ui/StatTile';
import { WidgetLoading, WidgetEmpty } from '@/components/ui/WidgetFrame';
import { useUrlView } from '@/lib/useUrlView';
import { CARD_PADDED, BTN_SECONDARY, BTN_COMPACT, H1, HELPER } from '@/components/ui/tokens';
import { formatTime, useClients } from '@/components/salesDocs/SalesDocsUi';
import { EngagementRows, ViewDetailModal } from '@/components/salesDocs/EngagementParts';

// Sales > Sales Docs > Engagement (0137): every visit to every link, who it
// was, how long they read and whether it was forwarded.

const FILTER_FIELDS = [
  { key: 'doc', label: 'Document', kind: 'pick' },
  { key: 'space', label: 'Space', kind: 'pick' },
  { key: 'link', label: 'Link', kind: 'pick' },
  { key: 'company', label: 'Company', kind: 'pick' },
  { key: 'forwarded', label: 'Forwarded', kind: 'yesno' },
  { key: 'from', label: 'Opened on or after', kind: 'date' },
  { key: 'to', label: 'Opened on or before', kind: 'date' },
];
const VIEW_FIELDS = [...FILTER_FIELDS, { key: 'q', kind: 'text' }, { key: 'page', kind: 'text' }, { key: 'opened', kind: 'sort' }, { key: 'time', kind: 'sort' }];
const SORT_DEFAULT = { key: 'opened', dir: 'desc' };
const API_KEY = { doc: 'docId', space: 'spaceId', link: 'linkId', company: 'clientId', forwarded: 'forwarded', from: 'from', to: 'to', q: 'q' };

export default function SalesDocEngagementPage() {
  const { filters, replaceFilters, clearFilters, sort, toggleSort, ready } = useUrlView({ fields: VIEW_FIELDS, sortDefault: SORT_DEFAULT });
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [open, setOpen] = useState(false);
  const [viewId, setViewId] = useState(null);
  const [choices, setChoices] = useState({ doc: [], space: [], link: [] });
  const clients = useClients();
  const page = Math.max(1, Number(filters.page) || 1);

  // Changing any filter starts again at page 1.
  const setFilter = (k, v) => replaceFilters({ ...filters, [k]: v, page: '' });

  const params = useMemo(() => {
    const p = new URLSearchParams();
    for (const [k, api] of Object.entries(API_KEY)) if (filters[k]) p.set(api, k === 'q' ? filters.q.trim() : filters[k]);
    if (sort.key === 'time') p.set('sort', 'time');
    if (sort.dir === 'asc') p.set('dir', 'asc');
    return p;
  }, [filters, sort]);

  const load = useCallback(async () => {
    const p = new URLSearchParams(params);
    if (page > 1) p.set('page', String(page));
    const res = await fetch(`/api/sales-docs/engagement?${p}`);
    if (!res.ok) { setErr('Could not load visits.'); setData({ kpis: {}, rows: [], total: 0, page: 1, pageSize: 50 }); return; }
    setErr('');
    setData(await res.json());
  }, [params, page]);

  useEffect(() => { if (ready) load(); }, [ready, load]);

  useEffect(() => {
    const pick = (url, key, map) => fetch(url).then((r) => (r.ok ? r.json() : {})).then((d) => (d[key] || []).map(map)).catch(() => []);
    Promise.all([
      pick('/api/sales-docs', 'docs', (d) => [d.id, d.title]),
      pick('/api/sales-docs/spaces', 'spaces', (s) => [s.id, s.name]),
      pick('/api/sales-docs/links', 'links', (l) => [l.id, `${l.name} (${l.doc?.title || l.space?.name || ''})`]),
    ]).then(([doc, space, link]) => setChoices({
      doc: doc.sort((a, b) => a[1].localeCompare(b[1])),
      space: space.sort((a, b) => a[1].localeCompare(b[1])),
      link: link.sort((a, b) => a[1].localeCompare(b[1])),
    }));
  }, []);

  const k = data?.kpis || {};
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const nFilters = countFilters(filters, FILTER_FIELDS);
  const sortHeader = (field, label, align) => <SortHeader label={label} field={field} sort={sort} onSort={toggleSort} align={align} />;

  return (
    <div className="px-4 py-6">
      <SectionTabs tabs={SALES_DOCS_TABS} className="mb-5" />
      <div className="max-w-5xl mx-auto space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className={H1}>Engagement</h1>
            <p className="text-xs text-slate-500 mt-0.5">Every visit to a Sales Docs link. Press a row to see the time on each page.</p>
          </div>
          <a className={BTN_SECONDARY} href={`/api/sales-docs/engagement?${new URLSearchParams([...params, ['format', 'csv']])}`}>Download CSV</a>
        </div>

        {err && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</p>}

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <StatTile label="Views" value={data ? (k.views ?? 0).toLocaleString() : ''} />
          <StatTile label="People" value={data ? (k.visitors ?? 0).toLocaleString() : ''} />
          <StatTile label="Time read" value={data ? formatTime(k.timeMs || 0) : ''} />
          <StatTile label="Forwarded" value={data ? (k.forwarded ?? 0).toLocaleString() : ''} tone={k.forwarded ? 'warning' : 'default'} onClick={k.forwarded ? () => setFilter('forwarded', 'yes') : undefined} />
          <StatTile label="Viewing now" value={data ? (k.viewingNow ?? 0).toLocaleString() : ''} tone={k.viewingNow ? 'success' : 'default'} />
        </div>

        <div className={CARD_PADDED}>
          <FilterToolbar
            count={nFilters} open={open} onToggle={() => setOpen((o) => !o)} onClear={clearFilters}
            shown={data?.rows.length ?? 0} total={data?.total ?? 0} noun="visits"
            right={<SearchBox value={filters.q} onChange={(v) => setFilter('q', v)} placeholder="Search visitor email" />}
          />
          <FilterPanel
            open={open} fields={FILTER_FIELDS} filters={filters} onChange={setFilter}
            choices={{ ...choices, company: clients.map((c) => [c.id, c.name]) }}
          />
          <div className="mt-4 overflow-x-auto">
            {data === null ? <WidgetLoading /> : data.rows.length === 0 ? (
              <WidgetEmpty>{nFilters || filters.q ? 'No visits match these filters.' : 'No visits yet. Share a link and visits show here as they happen.'}</WidgetEmpty>
            ) : (
              <EngagementRows rows={data.rows} onOpen={setViewId} showDoc sortHeader={sortHeader} />
            )}
          </div>
          {data && pages > 1 && (
            <div className="flex items-center justify-end gap-2 mt-3">
              <span className={HELPER}>Page {page} of {pages}</span>
              <button type="button" className={BTN_COMPACT} disabled={page <= 1} onClick={() => replaceFilters({ ...filters, page: page - 1 > 1 ? String(page - 1) : '' })}>Back</button>
              <button type="button" className={BTN_COMPACT} disabled={page >= pages} onClick={() => replaceFilters({ ...filters, page: String(page + 1) })}>Next</button>
            </div>
          )}
        </div>
      </div>

      {viewId && <ViewDetailModal viewId={viewId} onClose={() => setViewId(null)} />}
    </div>
  );
}
