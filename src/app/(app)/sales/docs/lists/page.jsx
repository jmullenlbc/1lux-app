'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import SectionTabs, { SALES_DOCS_TABS } from '@/components/ui/SectionTabs';
import { FilterToolbar, FilterPanel, SearchBox, countFilters } from '@/components/ui/FilterPanel';
import SortHeader, { sortRows } from '@/components/ui/SortHeader';
import { WidgetLoading, WidgetEmpty } from '@/components/ui/WidgetFrame';
import { useUrlView } from '@/lib/useUrlView';
import { CARD_PADDED, H1, TD, NUM, LABEL, BTN_COMPACT_PRIMARY } from '@/components/ui/tokens';
import { ago } from '@/components/salesDocs/SalesDocsUi';
import { NameModal } from '@/components/campaigns/CampaignUi';
import DoNotEmail from '@/components/campaigns/DoNotEmail';

// Sales > Sales Docs > Email lists (0147): who a campaign goes to. A picked
// list is people chosen by hand; a rules list follows the CRM (tags,
// departments, company type, market, state) and stays current by itself.

const KIND_LABEL = { FIXED: 'Picked people', FILTER: 'Rules' };
const FILTER_FIELDS = [
  { key: 'kind', label: 'Kind', kind: 'pick' },
  { key: 'archived', label: 'Show', kind: 'pick' },
];
const SORT_KEYS = ['name', 'kind', 'size', 'campaigns', 'updated'];
const VIEW_FIELDS = [...FILTER_FIELDS, { key: 'q', kind: 'text' }, ...SORT_KEYS.map((k) => ({ key: k, kind: 'sort' }))];
const GETTERS = {
  name: (l) => l.name.toLowerCase(),
  kind: (l) => l.kind,
  size: (l) => (l.kind === 'FIXED' ? l._count.members : l._count.rules),
  campaigns: (l) => l._count.campaigns,
  updated: (l) => new Date(l.updatedAt).getTime(),
};

export default function EmailListsPage() {
  const router = useRouter();
  const { filters, setFilter, clearFilters, sort, toggleSort, ready } = useUrlView({ fields: VIEW_FIELDS, sortDefault: { key: 'name', dir: 'asc' } });
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState('');
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [kind, setKind] = useState('FILTER');

  const archived = filters.archived === 'archived';
  const load = useCallback(async () => {
    const res = await fetch(`/api/campaign-lists${archived ? '?archived=1' : ''}`);
    if (!res.ok) { setErr('We could not load the email lists. Nothing changed. Reload the page. (CAMPAIGN_LIST_LOAD)'); setRows([]); return; }
    setRows((await res.json()).lists);
  }, [archived]);
  useEffect(() => { if (ready) load(); }, [ready, load]);

  const q = (filters.q || '').trim().toLowerCase();
  const shown = useMemo(() => {
    let r = rows || [];
    if (filters.kind) r = r.filter((l) => l.kind === filters.kind);
    if (q) r = r.filter((l) => [l.name, l.notes].some((v) => v?.toLowerCase().includes(q)));
    return sortRows(r, sort, GETTERS);
  }, [rows, filters.kind, q, sort]);
  const sh = (field, label, align) => <SortHeader label={label} field={field} sort={sort} onSort={toggleSort} align={align} />;

  return (
    <div className="px-4 py-6">
      <SectionTabs tabs={SALES_DOCS_TABS} className="mb-5" />
      <div className="max-w-5xl mx-auto space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className={H1}>Email lists</h1>
            <p className="text-xs text-slate-500 mt-0.5">Who a campaign goes to. A rules list follows the CRM and keeps itself current; a picked list is people you choose.</p>
          </div>
          <button type="button" className={BTN_COMPACT_PRIMARY} onClick={() => setAdding(true)}>New list</button>
        </div>

        {err && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</p>}

        <div className={CARD_PADDED}>
          <FilterToolbar
            count={countFilters(filters, FILTER_FIELDS)} open={open} onToggle={() => setOpen((o) => !o)} onClear={clearFilters}
            shown={shown.length} total={(rows || []).length} noun="lists"
            right={<SearchBox value={filters.q} onChange={(v) => setFilter('q', v)} placeholder="Search lists" />}
          />
          <FilterPanel
            open={open} fields={FILTER_FIELDS} filters={filters} onChange={setFilter}
            choices={{ kind: Object.entries(KIND_LABEL), archived: [['archived', 'Archived only']] }}
          />
          <div className="mt-4 overflow-x-auto">
            {rows === null ? <WidgetLoading /> : shown.length === 0 ? (
              <WidgetEmpty>{(rows || []).length ? 'No lists match these filters.' : 'No email lists yet. Press New list to start one.'}</WidgetEmpty>
            ) : (
              <table className="min-w-full">
                <thead className="border-b border-slate-200">
                  <tr>{sh('name', 'List')}{sh('kind', 'Kind')}{sh('size', 'People or rules', 'right')}{sh('campaigns', 'Campaigns', 'right')}{sh('updated', 'Changed')}</tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {shown.map((l) => (
                    <tr key={l.id} className="hover:bg-slate-50">
                      <td className={TD}>
                        <Link href={`/sales/docs/lists/${l.id}`} className="font-medium text-slate-900 hover:text-orange-600">{l.name}</Link>
                        {l.notes && <div className="text-xs text-slate-500 truncate max-w-xs">{l.notes}</div>}
                      </td>
                      <td className={TD}>{KIND_LABEL[l.kind]}</td>
                      <td className={`${TD} ${NUM} text-right`}>{l.kind === 'FIXED' ? `${l._count.members} people` : `${l._count.rules} rules`}</td>
                      <td className={`${TD} ${NUM} text-right`}>{l._count.campaigns}</td>
                      <td className={`${TD} text-xs text-slate-500`}>{ago(l.updatedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <DoNotEmail />
      </div>
      {adding && (
        <NameModal title="New email list" url="/api/campaign-lists" field="list" extra={{ kind }} onClose={() => setAdding(false)} onMade={(l) => router.push(`/sales/docs/lists/${l.id}`)}>
          <div className="space-y-1">
            <span className={LABEL}>Kind</span>
            {Object.entries(KIND_LABEL).map(([k, label]) => (
              <label key={k} className="flex items-center gap-2 text-sm text-slate-700">
                <input type="radio" name="kind" className="accent-orange-500" checked={kind === k} onChange={() => setKind(k)} />
                {label}{k === 'FILTER' ? ': follows tags, departments, company type, market and state' : ': people you choose one by one'}
              </label>
            ))}
          </div>
        </NameModal>
      )}
    </div>
  );
}
