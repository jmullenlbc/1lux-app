'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import SectionTabs, { SALES_DOCS_TABS } from '@/components/ui/SectionTabs';
import { FilterToolbar, FilterPanel, SearchBox, countFilters } from '@/components/ui/FilterPanel';
import SortHeader, { sortRows } from '@/components/ui/SortHeader';
import { WidgetLoading, WidgetEmpty } from '@/components/ui/WidgetFrame';
import { useUrlView } from '@/lib/useUrlView';
import { CARD_PADDED, BTN_PRIMARY, BTN_SECONDARY, INPUT, SELECT, H1, TD, HELPER, LABEL } from '@/components/ui/tokens';
import { ago, Modal, useClients } from '@/components/salesDocs/SalesDocsUi';

// Sales > Sales Docs > Spaces (0137). A Space is a set of documents shared
// behind one link, in sections the sender picks.

const FILTER_FIELDS = [
  { key: 'company', label: 'Company', kind: 'pick' },
  { key: 'owner', label: 'Owner', kind: 'pick' },
  { key: 'archived', label: 'Archived', kind: 'yesno' },
];
const SORT_KEYS = ['name', 'company', 'docs', 'links', 'owner', 'updated'];
const VIEW_FIELDS = [...FILTER_FIELDS, { key: 'q', kind: 'text' }, ...SORT_KEYS.map((k) => ({ key: k, kind: 'sort' }))];
const SORT_DEFAULT = { key: 'updated', dir: 'desc' };
const GETTERS = {
  name: (s) => s.name.toLowerCase(),
  company: (s) => s.client?.name?.toLowerCase() || '',
  docs: (s) => s.docCount,
  links: (s) => s.liveLinks,
  owner: (s) => s.owner?.name?.toLowerCase() || '',
  updated: (s) => new Date(s.updatedAt).getTime(),
};

export default function SalesDocSpacesPage() {
  const router = useRouter();
  const { filters, setFilter, clearFilters, sort, toggleSort, ready } = useUrlView({ fields: VIEW_FIELDS, sortDefault: SORT_DEFAULT });
  const [spaces, setSpaces] = useState(null);
  const [err, setErr] = useState('');
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(null); // { name, description, clientId }
  const [saving, setSaving] = useState(false);
  const clients = useClients();

  const load = useCallback(async () => {
    const p = new URLSearchParams();
    if (filters.archived === 'yes') p.set('archived', 'yes');
    if (filters.company) p.set('clientId', filters.company);
    const res = await fetch(`/api/sales-docs/spaces?${p}`);
    if (!res.ok) { setErr('Could not load Spaces.'); setSpaces([]); return; }
    setSpaces((await res.json()).spaces);
  }, [filters.archived, filters.company]);

  useEffect(() => { if (ready) load(); }, [ready, load]);

  async function create() {
    setSaving(true);
    const res = await fetch('/api/sales-docs/spaces', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...draft, clientId: draft.clientId || null }) });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) { setErr(data.error || 'The Space was not made.'); return; }
    router.push(`/sales/docs/spaces/${data.space.id}`);
  }

  const owners = useMemo(() => {
    const m = new Map();
    for (const s of spaces || []) if (s.owner) m.set(s.owner.id, s.owner.name);
    return [...m].sort((a, b) => a[1].localeCompare(b[1]));
  }, [spaces]);

  const q = (filters.q || '').trim().toLowerCase();
  const shown = useMemo(() => {
    let rows = spaces || [];
    if (filters.owner) rows = rows.filter((s) => s.owner?.id === filters.owner);
    if (q) rows = rows.filter((s) => s.name.toLowerCase().includes(q) || s.client?.name?.toLowerCase().includes(q) || s.description?.toLowerCase().includes(q));
    return sortRows(rows, sort, GETTERS);
  }, [spaces, filters.owner, q, sort]);
  const nFilters = countFilters(filters, FILTER_FIELDS);

  return (
    <div className="px-4 py-6">
      <SectionTabs tabs={SALES_DOCS_TABS} className="mb-5" />
      <div className="max-w-5xl mx-auto space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className={H1}>Spaces</h1>
            <p className="text-xs text-slate-500 mt-0.5">A Space puts several documents behind one link, like a proposal with its cut sheets and schedule.</p>
          </div>
          <button type="button" className={BTN_PRIMARY} onClick={() => setDraft({ name: '', description: '', clientId: '' })}>New Space</button>
        </div>

        {err && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</p>}

        <div className={CARD_PADDED}>
          <FilterToolbar
            count={nFilters} open={open} onToggle={() => setOpen((o) => !o)} onClear={clearFilters}
            shown={shown.length} total={(spaces || []).length} noun="Spaces"
            right={<SearchBox value={filters.q} onChange={(v) => setFilter('q', v)} placeholder="Search Spaces" />}
          />
          <FilterPanel
            open={open} fields={FILTER_FIELDS} filters={filters} onChange={setFilter}
            choices={{ company: clients.map((c) => [c.id, c.name]), owner: owners }}
          />
          <div className="mt-4 overflow-x-auto">
            {spaces === null ? <WidgetLoading /> : shown.length === 0 ? (
              <WidgetEmpty>{(spaces || []).length ? 'No Spaces match these filters.' : 'No Spaces yet. Make one to share several documents behind one link.'}</WidgetEmpty>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200">
                    <SortHeader label="Space" field="name" sort={sort} onSort={toggleSort} />
                    <SortHeader label="Company" field="company" sort={sort} onSort={toggleSort} />
                    <SortHeader label="Documents" field="docs" sort={sort} onSort={toggleSort} align="right" />
                    <SortHeader label="Live links" field="links" sort={sort} onSort={toggleSort} align="right" />
                    <SortHeader label="Owner" field="owner" sort={sort} onSort={toggleSort} />
                    <SortHeader label="Updated" field="updated" sort={sort} onSort={toggleSort} />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {shown.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-50">
                      <td className={TD}>
                        <Link href={`/sales/docs/spaces/${s.id}`} className="font-semibold text-slate-800 hover:text-orange-600">{s.name}</Link>
                        {s.description && <span className={`${HELPER} block truncate max-w-xs`}>{s.description}</span>}
                        {s.archivedAt && <span className={`${HELPER} block`}>Archived</span>}
                      </td>
                      <td className={TD}>{s.client ? <Link href={`/clients/${s.client.id}`} className="hover:underline">{s.client.name}</Link> : ''}</td>
                      <td className={`${TD} text-right tabular-nums`}>{s.docCount}</td>
                      <td className={`${TD} text-right tabular-nums`}>{s.liveLinks}</td>
                      <td className={TD}>{s.owner?.name || ''}</td>
                      <td className={TD}>{ago(s.updatedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {draft && (
        <Modal title="New Space" onClose={() => setDraft(null)}>
          <div className="space-y-3">
            <label className="block">
              <span className={LABEL}>Name</span>
              <input autoFocus className={INPUT} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Example: Skyline Ridge lighting package" />
            </label>
            <label className="block">
              <span className={LABEL}>Note for the reader (optional)</span>
              <textarea className={INPUT} rows={3} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
            </label>
            <label className="block">
              <span className={LABEL}>Company (optional)</span>
              <select className={SELECT} value={draft.clientId} onChange={(e) => setDraft({ ...draft, clientId: e.target.value })}>
                <option value="">None</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <button type="button" className={BTN_SECONDARY} onClick={() => setDraft(null)}>Cancel</button>
            <button type="button" className={BTN_PRIMARY} disabled={!draft.name.trim() || saving} onClick={create}>{saving ? 'Making...' : 'Make Space'}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
