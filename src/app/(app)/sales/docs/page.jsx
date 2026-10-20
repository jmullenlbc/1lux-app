'use client';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Link from 'next/link';
import SectionTabs, { SALES_DOCS_TABS } from '@/components/ui/SectionTabs';
import { FilterToolbar, FilterPanel, SearchBox, countFilters } from '@/components/ui/FilterPanel';
import SortHeader, { Th, sortRows } from '@/components/ui/SortHeader';
import { WidgetLoading, WidgetEmpty } from '@/components/ui/WidgetFrame';
import { useUrlView } from '@/lib/useUrlView';
import { CARD, CARD_PADDED, BTN_PRIMARY, BTN_SECONDARY, INPUT, H1, TD, HELPER } from '@/components/ui/tokens';
import { ScanPill, KIND_LABEL, ago, formatBytes, uploadSalesDoc, Modal } from '@/components/salesDocs/SalesDocsUi';

// Sales > Sales Docs > Documents (0137). The library: upload a PDF or Excel
// file, it is checked for cost columns, then shared through tracked links.

const FILTER_FIELDS = [
  { key: 'kind',   label: 'Type',          kind: 'pick' },
  { key: 'folder', label: 'Folder',        kind: 'pick' },
  { key: 'owner',  label: 'Owner',         kind: 'pick' },
  { key: 'scan',   label: 'Pricing check', kind: 'pick' },
  { key: 'archived', label: 'Archived',    kind: 'yesno' },
];
const SORT_KEYS = ['title', 'kind', 'folder', 'owner', 'links', 'views', 'viewed', 'updated'];
const VIEW_FIELDS = [...FILTER_FIELDS, { key: 'q', kind: 'text' }, ...SORT_KEYS.map((k) => ({ key: k, kind: 'sort' }))];
const SORT_DEFAULT = { key: 'updated', dir: 'desc' };
const SCAN_CHOICES = [['CLEAN', 'No cost columns'], ['WARN', 'Check pricing words'], ['BLOCKED', 'Sharing blocked'], ['OVERRIDDEN', 'Cleared by admin'], ['PENDING', 'Checking']];

const GETTERS = {
  title: (d) => d.title.toLowerCase(),
  kind: (d) => d.kind,
  folder: (d) => d.folder?.name?.toLowerCase() || '',
  owner: (d) => d.owner?.name?.toLowerCase() || '',
  links: (d) => d.liveLinks,
  views: (d) => d.views,
  viewed: (d) => (d.lastViewedAt ? new Date(d.lastViewedAt).getTime() : null),
  updated: (d) => new Date(d.updatedAt).getTime(),
};

export default function SalesDocsPage() {
  const { filters, setFilter, clearFilters, sort, toggleSort, ready } = useUrlView({ fields: VIEW_FIELDS, sortDefault: SORT_DEFAULT });
  const [docs, setDocs] = useState(null);
  const [folders, setFolders] = useState([]);
  const [err, setErr] = useState('');
  const [open, setOpen] = useState(false);
  const [uploads, setUploads] = useState([]); // [{ name, stage, error }]
  const [newFolder, setNewFolder] = useState(null);
  const fileRef = useRef(null);

  const load = useCallback(async () => {
    const p = new URLSearchParams();
    if (filters.kind) p.set('kind', filters.kind);
    if (filters.folder) p.set('folderId', filters.folder);
    if (filters.owner) p.set('ownerId', filters.owner);
    if (filters.scan) p.set('scan', filters.scan);
    if (filters.archived === 'yes') p.set('archived', 'yes');
    const res = await fetch(`/api/sales-docs?${p}`);
    if (!res.ok) { setErr('Could not load documents.'); setDocs([]); return; }
    setDocs((await res.json()).docs);
  }, [filters.kind, filters.folder, filters.owner, filters.scan, filters.archived]);

  const loadFolders = useCallback(() => fetch('/api/sales-docs/folders').then((r) => (r.ok ? r.json() : { folders: [] })).then((d) => setFolders(d.folders)), []);

  useEffect(() => { if (ready) load(); }, [ready, load]);
  useEffect(() => { loadFolders(); }, [loadFolders]);

  async function onFiles(list) {
    const files = Array.from(list || []);
    if (!files.length) return;
    setErr('');
    for (const file of files) {
      const row = { id: `${file.name}-${Date.now()}`, name: file.name, stage: 'Uploading', error: '' };
      setUploads((u) => [...u, row]);
      const update = (patch) => setUploads((u) => u.map((x) => (x.id === row.id ? { ...x, ...patch } : x)));
      try {
        const { version } = await uploadSalesDoc(file, { folderId: filters.folder && filters.folder !== 'none' ? filters.folder : null, onStage: (stage) => update({ stage }) });
        update({ stage: version?.processStatus === 'FAILED' ? 'Could not read the file' : 'Done' });
      } catch (e) {
        update({ stage: '', error: e.message });
      }
      load();
    }
    setTimeout(() => setUploads((u) => u.filter((x) => x.error || x.stage !== 'Done')), 2500);
  }

  async function saveFolder() {
    const res = await fetch('/api/sales-docs/folders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newFolder }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setErr(data.error || 'The folder was not made.'); return; }
    setNewFolder(null);
    loadFolders();
  }

  const owners = useMemo(() => {
    const m = new Map();
    for (const d of docs || []) if (d.owner) m.set(d.owner.id, d.owner.name);
    return [...m].sort((a, b) => a[1].localeCompare(b[1]));
  }, [docs]);

  const q = (filters.q || '').trim().toLowerCase();
  const shown = useMemo(() => {
    let rows = docs || [];
    if (q) rows = rows.filter((d) => d.title.toLowerCase().includes(q) || d.currentVersion?.fileName?.toLowerCase().includes(q));
    return sortRows(rows, sort, GETTERS);
  }, [docs, q, sort]);
  const nFilters = countFilters(filters, FILTER_FIELDS);

  return (
    <div className="px-4 py-6">
      <SectionTabs tabs={SALES_DOCS_TABS} className="mb-5" />
      <div className="max-w-5xl mx-auto space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className={H1}>Sales Docs</h1>
            <p className="text-xs text-slate-500 mt-0.5">Share proposals and cut sheets with a tracked link. See who opened them, how long each page was read, and when they get forwarded.</p>
          </div>
          <div className="flex gap-2">
            <button type="button" className={BTN_SECONDARY} onClick={() => setNewFolder('')}>New folder</button>
            <button type="button" className={BTN_PRIMARY} onClick={() => fileRef.current?.click()}>Upload</button>
            <input ref={fileRef} type="file" accept=".pdf,.xlsx" multiple className="hidden" onChange={(e) => { onFiles(e.target.files); e.target.value = ''; }} />
          </div>
        </div>

        {err && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</p>}

        <div
          className={`${CARD} border-dashed p-4 text-center`}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); onFiles(e.dataTransfer.files); }}
        >
          <p className="text-sm text-slate-600">Drop PDF or Excel files here, up to 50 MB each.</p>
          <p className={HELPER}>Excel files with cost columns (DN, Buy, Cost, Margin and the like), hidden sheets or hidden columns cannot be shared until an admin clears them.</p>
          {uploads.length > 0 && (
            <ul className="mt-3 space-y-1 text-left max-w-md mx-auto">
              {uploads.map((u) => (
                <li key={u.id} className="flex items-center justify-between gap-3 text-xs">
                  <span className="truncate text-slate-700">{u.name}</span>
                  {u.error ? <span className="text-red-600">{u.error}</span> : <span className="text-slate-500 whitespace-nowrap">{u.stage}{u.stage !== 'Done' ? '...' : ''}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className={CARD_PADDED}>
          <FilterToolbar
            count={nFilters} open={open} onToggle={() => setOpen((o) => !o)} onClear={clearFilters}
            shown={shown.length} total={(docs || []).length} noun="documents"
            right={<SearchBox value={filters.q} onChange={(v) => setFilter('q', v)} placeholder="Search titles" />}
          />
          <FilterPanel
            open={open} fields={FILTER_FIELDS} filters={filters} onChange={setFilter}
            choices={{
              kind: [['PDF', 'PDF'], ['XLSX', 'Excel']],
              folder: [['none', 'No folder'], ...folders.map((f) => [f.id, f.name])],
              owner: owners,
              scan: SCAN_CHOICES,
            }}
          />
          <div className="mt-4 overflow-x-auto">
            {docs === null ? <WidgetLoading /> : shown.length === 0 ? (
              <WidgetEmpty>{(docs || []).length ? 'No documents match these filters.' : 'No documents yet. Upload a PDF or Excel file to start.'}</WidgetEmpty>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200">
                    <SortHeader label="Document" field="title" sort={sort} onSort={toggleSort} />
                    <SortHeader label="Type" field="kind" sort={sort} onSort={toggleSort} />
                    <Th>Pricing check</Th>
                    <SortHeader label="Folder" field="folder" sort={sort} onSort={toggleSort} />
                    <SortHeader label="Owner" field="owner" sort={sort} onSort={toggleSort} />
                    <SortHeader label="Live links" field="links" sort={sort} onSort={toggleSort} align="right" />
                    <SortHeader label="Views" field="views" sort={sort} onSort={toggleSort} align="right" />
                    <SortHeader label="Last viewed" field="viewed" sort={sort} onSort={toggleSort} />
                    <SortHeader label="Updated" field="updated" sort={sort} onSort={toggleSort} />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {shown.map((d) => {
                    const latest = d.latestVersion;
                    const pending = latest && latest.id !== d.currentVersion?.id;
                    return (
                      <tr key={d.id} className="hover:bg-slate-50">
                        <td className={TD}>
                          <Link href={`/sales/docs/${d.id}`} className="font-semibold text-slate-800 hover:text-orange-600">{d.title}</Link>
                          <span className={`${HELPER} block`}>{d.currentVersion?.fileName} {formatBytes(d.currentVersion?.sizeBytes)}{latest?.version > 1 ? ` · v${latest.version}` : ''}</span>
                        </td>
                        <td className={TD}>{KIND_LABEL[d.kind]}</td>
                        <td className={TD}>
                          <ScanPill version={latest} />
                          {pending && <span className={`${HELPER} block mt-0.5`}>Links still show v{d.currentVersion?.version}</span>}
                        </td>
                        <td className={TD}>{d.folder?.name || ''}</td>
                        <td className={TD}>{d.owner?.name || ''}</td>
                        <td className={`${TD} text-right tabular-nums`}>{d.liveLinks}</td>
                        <td className={`${TD} text-right tabular-nums`}>{d.views}</td>
                        <td className={TD}>{ago(d.lastViewedAt)}</td>
                        <td className={TD}>{ago(d.updatedAt)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {newFolder !== null && (
        <Modal title="New folder" onClose={() => setNewFolder(null)} width="max-w-sm">
          <input autoFocus className={INPUT} value={newFolder} onChange={(e) => setNewFolder(e.target.value)} placeholder="Folder name" onKeyDown={(e) => e.key === 'Enter' && newFolder.trim() && saveFolder()} />
          <div className="flex justify-end gap-2 mt-4">
            <button type="button" className={BTN_SECONDARY} onClick={() => setNewFolder(null)}>Cancel</button>
            <button type="button" className={BTN_PRIMARY} disabled={!newFolder.trim()} onClick={saveFolder}>Make folder</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
