'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import SectionTabs, { SALES_DOCS_TABS } from '@/components/ui/SectionTabs';
import { FilterToolbar, FilterPanel, SearchBox, countFilters } from '@/components/ui/FilterPanel';
import SortHeader, { sortRows } from '@/components/ui/SortHeader';
import { WidgetLoading, WidgetEmpty } from '@/components/ui/WidgetFrame';
import { useUrlView } from '@/lib/useUrlView';
import { CARD_PADDED, H1, TD, NUM, BTN_COMPACT_PRIMARY } from '@/components/ui/tokens';
import { ago } from '@/components/salesDocs/SalesDocsUi';
import { CAMPAIGN_STATUS_LABEL, StatusPill, SendingSetup, NameModal } from '@/components/campaigns/CampaignUi';

// Sales > Sales Docs > Campaigns (0147): marketing emails whose document
// cards open as tracked Sales Docs links, one per person.

const FILTER_FIELDS = [
  { key: 'status', label: 'Status', kind: 'pick' },
  { key: 'archived', label: 'Show', kind: 'pick' },
];
const SORT_KEYS = ['name', 'status', 'list', 'sent', 'opened', 'clicked', 'updated'];
const VIEW_FIELDS = [...FILTER_FIELDS, { key: 'q', kind: 'text' }, ...SORT_KEYS.map((k) => ({ key: k, kind: 'sort' }))];
const SORT_DEFAULT = { key: 'updated', dir: 'desc' };
const GETTERS = {
  name: (c) => c.name.toLowerCase(),
  status: (c) => c.status,
  list: (c) => (c.list?.name || '').toLowerCase(),
  sent: (c) => c.counts.SENT || 0,
  opened: (c) => c.counts.opened,
  clicked: (c) => c.counts.clicked,
  updated: (c) => new Date(c.updatedAt).getTime(),
};

export default function CampaignsPage() {
  const router = useRouter();
  const { filters, setFilter, clearFilters, sort, toggleSort, ready } = useUrlView({ fields: VIEW_FIELDS, sortDefault: SORT_DEFAULT });
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState('');
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);

  const archived = filters.archived === 'archived';
  const load = useCallback(async () => {
    const res = await fetch(`/api/campaigns${archived ? '?archived=1' : ''}`);
    if (!res.ok) { setErr('We could not load the campaigns. Nothing changed. Reload the page. (CAMPAIGN_LOAD)'); setRows([]); return; }
    setRows((await res.json()).campaigns);
  }, [archived]);
  useEffect(() => { if (ready) load(); }, [ready, load]);

  const q = (filters.q || '').trim().toLowerCase();
  const shown = useMemo(() => {
    let r = rows || [];
    if (filters.status) r = r.filter((c) => c.status === filters.status);
    if (q) r = r.filter((c) => [c.name, c.subject, c.list?.name].some((v) => v?.toLowerCase().includes(q)));
    return sortRows(r, sort, GETTERS);
  }, [rows, filters.status, q, sort]);
  const sh = (field, label, align) => <SortHeader label={label} field={field} sort={sort} onSort={toggleSort} align={align} />;

  return (
    <div className="px-4 py-6">
      <SectionTabs tabs={SALES_DOCS_TABS} className="mb-5" />
      <div className="max-w-5xl mx-auto space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className={H1}>Campaigns</h1>
            <p className="text-xs text-slate-500 mt-0.5">Marketing emails and newsletters. A document card in the email opens as that person&apos;s own tracked link, so you see who read what.</p>
          </div>
          <button type="button" className={BTN_COMPACT_PRIMARY} onClick={() => setAdding(true)}>New campaign</button>
        </div>

        <SendingSetup />

        {err && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</p>}

        <div className={CARD_PADDED}>
          <FilterToolbar
            count={countFilters(filters, FILTER_FIELDS)} open={open} onToggle={() => setOpen((o) => !o)} onClear={clearFilters}
            shown={shown.length} total={(rows || []).length} noun="campaigns"
            right={<SearchBox value={filters.q} onChange={(v) => setFilter('q', v)} placeholder="Search campaigns" />}
          />
          <FilterPanel
            open={open} fields={FILTER_FIELDS} filters={filters} onChange={setFilter}
            choices={{ status: Object.entries(CAMPAIGN_STATUS_LABEL), archived: [['archived', 'Archived only']] }}
          />
          <div className="mt-4 overflow-x-auto">
            {rows === null ? <WidgetLoading /> : shown.length === 0 ? (
              <WidgetEmpty>{(rows || []).length ? 'No campaigns match these filters.' : 'No campaigns yet. Press New campaign to start one.'}</WidgetEmpty>
            ) : (
              <table className="min-w-full">
                <thead className="border-b border-slate-200">
                  <tr>{sh('name', 'Campaign')}{sh('status', 'Status')}{sh('list', 'List')}{sh('sent', 'Sent', 'right')}{sh('opened', 'Opened', 'right')}{sh('clicked', 'Clicked', 'right')}{sh('updated', 'Changed')}</tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {shown.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-50">
                      <td className={TD}>
                        <Link href={`/sales/docs/campaigns/${c.id}`} className="font-medium text-slate-900 hover:text-orange-600">{c.name}</Link>
                        {c.subject && <div className="text-xs text-slate-500 truncate max-w-xs">{c.subject}</div>}
                      </td>
                      <td className={TD}><StatusPill status={c.status} /></td>
                      <td className={TD}>{c.list?.name || <span className="text-slate-400">None picked</span>}</td>
                      <td className={`${TD} ${NUM} text-right`}>{c.counts.SENT || 0}</td>
                      <td className={`${TD} ${NUM} text-right`}>{c.counts.opened}</td>
                      <td className={`${TD} ${NUM} text-right`}>{c.counts.clicked}</td>
                      <td className={`${TD} text-xs text-slate-500`}>{ago(c.updatedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
      {adding && <NameModal title="New campaign" url="/api/campaigns" field="campaign" onClose={() => setAdding(false)} onMade={(c) => router.push(`/sales/docs/campaigns/${c.id}`)} />}
    </div>
  );
}

