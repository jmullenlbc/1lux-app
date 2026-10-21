'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import SectionTabs, { SALES_DOCS_TABS } from '@/components/ui/SectionTabs';
import { Th } from '@/components/ui/SortHeader';
import { WidgetLoading, WidgetEmpty, WidgetError } from '@/components/ui/WidgetFrame';
import { CARD_PADDED, CARD_TITLE, BTN_PRIMARY, BTN_SECONDARY, BTN_COMPACT, INPUT, SELECT, H1, TD, HELPER, LABEL, TONE } from '@/components/ui/tokens';
import { cn } from '@/lib/utils';
import { shareAllowed } from '@/lib/salesDocs/pricingScan';
import { ScanPill, KIND_LABEL, Modal, CreateLinkModal, useClients } from '@/components/salesDocs/SalesDocsUi';
import LinksTable from '@/components/salesDocs/LinksTable';
import { EngagementPanel } from '@/components/salesDocs/EngagementParts';

// Sales > Sales Docs > one Folder (0137; called a Space in the code): pick
// the documents and their order, then share the whole set behind one link.
// No sections (Mike 10-21: one plain list); old section values are ignored. Who opened it, and the time on each page, show here too.

const BACK = 'text-xs font-semibold text-slate-500 hover:text-orange-600 transition-colors';

const showable = (d) => !d.archivedAt && d.currentVersion?.processStatus === 'READY' && shareAllowed(d.currentVersion.scanStatus);

function whyNot(d) {
  if (d.archivedAt) return 'Archived';
  if (d.currentVersion?.processStatus !== 'READY') return d.currentVersion?.processStatus === 'FAILED' ? 'Could not be read' : 'Still being read';
  if (!shareAllowed(d.currentVersion?.scanStatus)) return 'Cost columns found';
  return '';
}

function AddDocsModal({ have, onClose, onAdd }) {
  const [docs, setDocs] = useState(null);
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState(() => new Set());
  useEffect(() => {
    fetch('/api/sales-docs').then((r) => (r.ok ? r.json() : { docs: [] })).then((d) => setDocs(d.docs)).catch(() => setDocs([]));
  }, []);
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (docs || []).filter((d) => !have.has(d.id) && (!t || d.title.toLowerCase().includes(t)));
  }, [docs, q, have]);
  const toggle = (id) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <Modal title="Add documents" onClose={onClose} width="max-w-xl">
      <input autoFocus className={INPUT} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search documents" />
      <div className="mt-3 max-h-80 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-lg">
        {docs === null ? <WidgetLoading /> : list.length === 0 ? <WidgetEmpty>No more documents to add.</WidgetEmpty> : list.map((d) => (
          <label key={d.id} className="flex items-center gap-3 px-3 py-2 text-xs hover:bg-slate-50 cursor-pointer">
            <input type="checkbox" checked={picked.has(d.id)} onChange={() => toggle(d.id)} />
            <span className="flex-1 min-w-0">
              <span className="block font-medium text-slate-800 truncate">{d.title}</span>
              <span className={HELPER}>{KIND_LABEL[d.kind]}{d.folder ? ` · ${d.folder.name}` : ''}</span>
            </span>
            <ScanPill version={d.currentVersion} />
          </label>
        ))}
      </div>
      <div className="flex justify-end gap-2 mt-4">
        <button type="button" className={BTN_SECONDARY} onClick={onClose}>Cancel</button>
        <button type="button" className={BTN_PRIMARY} disabled={!picked.size} onClick={() => onAdd((docs || []).filter((d) => picked.has(d.id)))}>
          Add {picked.size || ''}
        </button>
      </div>
    </Modal>
  );
}

export default function SalesDocSpacePage({ params }) {
  const { spaceId } = params;
  const [space, setSpace] = useState(null);
  const [items, setItems] = useState([]); // [{ section, doc }]
  const [dirty, setDirty] = useState(false);
  const [info, setInfo] = useState(null); // { name, description, clientId } while editing
  const [links, setLinks] = useState([]);
  const [err, setErr] = useState('');
  const [loadErr, setLoadErr] = useState('');
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(false);
  const [linking, setLinking] = useState(false);
  const clients = useClients();

  const take = (s) => { setSpace(s); setItems(s.items.map((i) => ({ section: i.section || '', doc: i.doc }))); setDirty(false); };

  const load = useCallback(async () => {
    const [sRes, lRes] = await Promise.all([fetch(`/api/sales-docs/spaces/${spaceId}`), fetch(`/api/sales-docs/links?spaceId=${spaceId}`)]);
    if (!sRes.ok) { setLoadErr(sRes.status === 404 ? 'This Folder was not found.' : 'This Folder did not load.'); return; }
    take((await sRes.json()).space);
    if (lRes.ok) setLinks((await lRes.json()).links);
  }, [spaceId]);

  const loadLinks = useCallback(async () => {
    const res = await fetch(`/api/sales-docs/links?spaceId=${spaceId}`);
    if (res.ok) setLinks((await res.json()).links);
  }, [spaceId]);

  useEffect(() => { load(); }, [load]);

  async function patch(body) {
    setSaving(true); setErr('');
    const res = await fetch(`/api/sales-docs/spaces/${spaceId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) { setErr(data.error || 'That did not save.'); return false; }
    take(data.space);
    return true;
  }

  const saveItems = () => patch({ items: items.map((i) => ({ docId: i.doc.id, section: i.section })) });
  const edit = (fn) => { setItems(fn); setDirty(true); };
  const move = (n, by) => edit((list) => {
    const next = [...list];
    const [row] = next.splice(n, 1);
    next.splice(Math.max(0, Math.min(next.length, n + by)), 0, row);
    return next;
  });

  if (loadErr) return <div className="px-4 py-6"><SectionTabs tabs={SALES_DOCS_TABS} className="mb-5" /><div className="max-w-5xl mx-auto space-y-3"><Link href="/sales/docs/spaces" className={BACK}>&larr; Back to Folders</Link><WidgetError>{loadErr}</WidgetError></div></div>;
  if (!space) return <div className="px-4 py-6"><SectionTabs tabs={SALES_DOCS_TABS} className="mb-5" /><WidgetLoading /></div>;

  const notReady = items.filter((i) => !showable(i.doc));
  const liveLinks = links.filter((l) => !l.revokedAt && (!l.expiresAt || new Date(l.expiresAt) > new Date())).length;
  const canLink = !space.archivedAt && items.length > 0 && !dirty && !items.some((i) => i.doc.currentVersion?.scanStatus === 'BLOCKED');

  return (
    <div className="px-4 py-6">
      <SectionTabs tabs={SALES_DOCS_TABS} className="mb-5" />
      <div className="max-w-5xl mx-auto space-y-5">
        <div>
          <Link href="/sales/docs/spaces" className={BACK}>&larr; Back to Folders</Link>
          <div className="flex flex-wrap items-start justify-between gap-3 mt-1">
            <div className="min-w-0">
              <h1 className={H1}>{space.name}</h1>
              <p className="text-xs text-slate-500 mt-0.5">
                {[space.client?.name, space.owner?.name && `Owner ${space.owner.name}`, space.archivedAt && 'Archived'].filter(Boolean).join(' · ')}
              </p>
            </div>
            <div className="flex gap-2">
              <button type="button" className={BTN_SECONDARY} onClick={() => setInfo({ name: space.name, description: space.description || '', clientId: space.client?.id || '' })}>Edit details</button>
              <button type="button" className={BTN_PRIMARY} disabled={!canLink} onClick={() => setLinking(true)} title={canLink ? '' : dirty ? 'Save the document list first' : 'Add documents that can be shared first'}>Create link</button>
            </div>
          </div>
        </div>

        {err && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</p>}
        {notReady.length > 0 && (
          <p className={cn('text-xs border rounded-lg px-3 py-2', TONE.warning)}>
            {notReady.length === 1 ? '1 document' : `${notReady.length} documents`} will not show on links yet: {notReady.map((i) => `${i.doc.title} (${whyNot(i.doc)})`).join(', ')}.
            {notReady.some((i) => i.doc.currentVersion?.scanStatus === 'BLOCKED') && ' A document with cost columns stops new links for the whole Folder until it is removed or an admin clears it.'}
          </p>
        )}

        <div className={CARD_PADDED}>
          <div className="flex items-center justify-between gap-2 mb-3">
            <h2 className={CARD_TITLE}>Documents</h2>
            <div className="flex gap-2">
              {dirty && <button type="button" className={BTN_SECONDARY} onClick={() => take(space)}>Undo changes</button>}
              {dirty && <button type="button" className={BTN_PRIMARY} disabled={saving} onClick={saveItems}>{saving ? 'Saving...' : 'Save'}</button>}
              {!dirty && <button type="button" className={BTN_SECONDARY} disabled={!!space.archivedAt} onClick={() => setAdding(true)}>Add documents</button>}
            </div>
          </div>
          {space.description && <p className={cn(HELPER, 'mb-3 whitespace-pre-wrap')}>{space.description}</p>}
          {items.length === 0 ? <WidgetEmpty>No documents yet. Add the proposal, cut sheets and anything else the reader should see.</WidgetEmpty> : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200">
                    <Th>Order</Th>
                    <Th>Document</Th>
                    <Th>Pricing check</Th>
                    <Th />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {items.map((i, n) => (
                    <tr key={i.doc.id} className="hover:bg-slate-50">
                      <td className={cn(TD, 'whitespace-nowrap')}>
                        <span className="inline-flex gap-1">
                          <button type="button" className={BTN_COMPACT} disabled={n === 0} onClick={() => move(n, -1)} aria-label="Move up">Up</button>
                          <button type="button" className={BTN_COMPACT} disabled={n === items.length - 1} onClick={() => move(n, 1)} aria-label="Move down">Down</button>
                        </span>
                      </td>
                      <td className={TD}>
                        <Link href={`/sales/docs/${i.doc.id}?folder=${spaceId}`} className="font-medium text-slate-800 hover:text-orange-600">{i.doc.title}</Link>
                        <span className={cn(HELPER, 'block')}>{KIND_LABEL[i.doc.kind]}{whyNot(i.doc) ? ` · ${whyNot(i.doc)}` : ''}</span>
                      </td>
                      <td className={TD}><ScanPill version={i.doc.currentVersion} /></td>
                      <td className={cn(TD, 'text-right')}>
                        <button type="button" className={BTN_COMPACT} onClick={() => edit((list) => list.filter((_, k) => k !== n))}>Remove</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className={cn(HELPER, 'mt-2')}>The reader sees one list, in this order.</p>
            </div>
          )}
        </div>

        <div className={CARD_PADDED}>
          <div className="flex items-center justify-between gap-2 mb-3">
            <h2 className={CARD_TITLE}>Links</h2>
          </div>
          {links.length === 0 ? <WidgetEmpty>No links yet.</WidgetEmpty> : (
            <div className="overflow-x-auto"><LinksTable links={links} onChanged={loadLinks} onError={setErr} /></div>
          )}
        </div>

        {links.length > 0 && (
          <div className={CARD_PADDED}>
            <h2 className={cn(CARD_TITLE, 'mb-3')}>Who opened it</h2>
            <EngagementPanel query={`spaceId=${spaceId}`} showDoc emptyText="Nobody has opened a link to this Folder yet." />
          </div>
        )}

        <div className="flex justify-end">
          <button type="button" className={BTN_SECONDARY} disabled={saving} onClick={() => {
            if (!space.archivedAt && liveLinks && !window.confirm(`Archive this Folder? Its ${liveLinks} live ${liveLinks === 1 ? 'link stops' : 'links stop'} working.`)) return;
            patch({ archived: !space.archivedAt });
          }}>{space.archivedAt ? 'Bring back' : 'Archive Folder'}</button>
        </div>
      </div>

      {adding && (
        <AddDocsModal
          have={new Set(items.map((i) => i.doc.id))}
          onClose={() => setAdding(false)}
          onAdd={(docs) => { edit((list) => [...list, ...docs.map((d) => ({ section: '', doc: d }))]); setAdding(false); }}
        />
      )}

      {info && (
        <Modal title="Edit details" onClose={() => setInfo(null)}>
          <div className="space-y-3">
            <label className="block"><span className={LABEL}>Name</span><input className={INPUT} value={info.name} onChange={(e) => setInfo({ ...info, name: e.target.value })} /></label>
            <label className="block"><span className={LABEL}>Note for the reader (optional)</span><textarea className={INPUT} rows={3} value={info.description} onChange={(e) => setInfo({ ...info, description: e.target.value })} /></label>
            <label className="block">
              <span className={LABEL}>Company (optional)</span>
              <select className={SELECT} value={info.clientId} onChange={(e) => setInfo({ ...info, clientId: e.target.value })}>
                <option value="">None</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <button type="button" className={BTN_SECONDARY} onClick={() => setInfo(null)}>Cancel</button>
            <button type="button" className={BTN_PRIMARY} disabled={!info.name.trim() || saving} onClick={async () => { if (await patch({ ...info, clientId: info.clientId || null })) setInfo(null); }}>Save</button>
          </div>
        </Modal>
      )}

      {linking && (
        <CreateLinkModal
          spaceId={spaceId} defaultName={space.name} defaultClientId={space.client?.id}
          onClose={() => setLinking(false)} onCreated={loadLinks}
        />
      )}
    </div>
  );
}
