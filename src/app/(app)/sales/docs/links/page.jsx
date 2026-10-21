'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import SectionTabs, { SALES_DOCS_TABS } from '@/components/ui/SectionTabs';
import { FilterToolbar, FilterPanel, SearchBox, countFilters } from '@/components/ui/FilterPanel';
import SortHeader, { sortRows } from '@/components/ui/SortHeader';
import { WidgetLoading, WidgetEmpty } from '@/components/ui/WidgetFrame';
import { useUrlView } from '@/lib/useUrlView';
import { CARD_PADDED, H1 } from '@/components/ui/tokens';
import { useClients } from '@/components/salesDocs/SalesDocsUi';
import LinksTable, { LINK_STATUS_LABEL } from '@/components/salesDocs/LinksTable';

// Sales > Sales Docs > Links (0137): every tracked link, for a document or a
// Space, with how often it was opened.

const FILTER_FIELDS = [
  { key: 'status', label: 'Status', kind: 'pick' },
  { key: 'owner', label: 'Made by', kind: 'pick' },
  { key: 'company', label: 'Company', kind: 'pick' },
];
const SORT_KEYS = ['name', 'target', 'status', 'views', 'time', 'viewed'];
const VIEW_FIELDS = [...FILTER_FIELDS, { key: 'q', kind: 'text' }, ...SORT_KEYS.map((k) => ({ key: k, kind: 'sort' }))];
const SORT_DEFAULT = { key: 'viewed', dir: 'desc' };
const GETTERS = {
  name: (l) => l.name.toLowerCase(),
  target: (l) => (l.doc?.title || l.space?.name || '').toLowerCase(),
  status: (l) => l.status,
  views: (l) => l.views,
  time: (l) => l.timeMs,
  viewed: (l) => (l.lastViewedAt ? new Date(l.lastViewedAt).getTime() : null),
};

export default function SalesDocLinksPage() {
  const { filters, setFilter, clearFilters, sort, toggleSort, ready } = useUrlView({ fields: VIEW_FIELDS, sortDefault: SORT_DEFAULT });
  const [links, setLinks] = useState(null);
  const [err, setErr] = useState('');
  const [open, setOpen] = useState(false);
  const clients = useClients();

  const load = useCallback(async () => {
    const p = new URLSearchParams();
    if (filters.status) p.set('status', filters.status);
    if (filters.owner) p.set('createdById', filters.owner);
    if (filters.company) p.set('clientId', filters.company);
    const res = await fetch(`/api/sales-docs/links?${p}`);
    if (!res.ok) { setErr('Could not load links.'); setLinks([]); return; }
    setLinks((await res.json()).links);
  }, [filters.status, filters.owner, filters.company]);

  useEffect(() => { if (ready) load(); }, [ready, load]);

  // Who made links: from an unfiltered first load, so the choice list stays put.
  const [makers, setMakers] = useState([]);
  useEffect(() => {
    fetch('/api/sales-docs/links').then((r) => (r.ok ? r.json() : { links: [] })).then((d) => {
      const m = new Map();
      for (const l of d.links) if (l.createdBy) m.set(l.createdBy.id, l.createdBy.name);
      setMakers([...m].sort((a, b) => a[1].localeCompare(b[1])));
    }).catch(() => {});
  }, []);

  const q = (filters.q || '').trim().toLowerCase();
  const shown = useMemo(() => {
    let rows = links || [];
    if (q) {
      rows = rows.filter((l) => [l.name, l.recipientEmail, l.client?.name, l.doc?.title, l.space?.name].some((v) => v?.toLowerCase().includes(q)));
    }
    return sortRows(rows, sort, GETTERS);
  }, [links, q, sort]);
  const nFilters = countFilters(filters, FILTER_FIELDS);
  const sortHeader = (field, label, align) => <SortHeader key={field} label={label} field={field} sort={sort} onSort={toggleSort} align={align} />;

  return (
    <div className="px-4 py-6">
      <SectionTabs tabs={SALES_DOCS_TABS} className="mb-5" />
      <div className="max-w-5xl mx-auto space-y-5">
        <div>
          <h1 className={H1}>Links</h1>
          <p className="text-xs text-slate-500 mt-0.5">Every tracked link. Turn one off and its address shows a &quot;no longer available&quot; page; its views stay on the record.</p>
        </div>

        {err && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</p>}

        <div className={CARD_PADDED}>
          <FilterToolbar
            count={nFilters} open={open} onToggle={() => setOpen((o) => !o)} onClear={clearFilters}
            shown={shown.length} total={(links || []).length} noun="links"
            right={<SearchBox value={filters.q} onChange={(v) => setFilter('q', v)} placeholder="Search links" />}
          />
          <FilterPanel
            open={open} fields={FILTER_FIELDS} filters={filters} onChange={setFilter}
            choices={{
              status: Object.entries(LINK_STATUS_LABEL),
              owner: makers,
              company: clients.map((c) => [c.id, c.name]),
            }}
          />
          <div className="mt-4 overflow-x-auto">
            {links === null ? <WidgetLoading /> : shown.length === 0 ? (
              <WidgetEmpty>{(links || []).length ? 'No links match these filters.' : 'No links yet. Open a document or a Folder and press Create link.'}</WidgetEmpty>
            ) : (
              <LinksTable links={shown} onChanged={load} onError={setErr} showTarget sortHeader={sortHeader} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
