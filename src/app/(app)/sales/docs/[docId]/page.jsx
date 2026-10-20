'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import SectionTabs, { SALES_DOCS_TABS } from '@/components/ui/SectionTabs';
import { Th } from '@/components/ui/SortHeader';
import StatTile from '@/components/ui/StatTile';
import { WidgetLoading, WidgetEmpty, WidgetError } from '@/components/ui/WidgetFrame';
import { CARD_PADDED, CARD_TITLE, BTN_PRIMARY, BTN_SECONDARY, BTN_COMPACT, BTN_COMPACT_PRIMARY, INPUT, SELECT, H1, TD, HELPER, LABEL, TONE } from '@/components/ui/tokens';
import { cn } from '@/lib/utils';
import { HIT_LABELS, shareAllowed } from '@/lib/salesDocs/pricingScan';
import {
  ScanPill, KIND_LABEL, formatBytes, formatTime, formatWhen, uploadSalesDoc, Modal, CreateLinkModal,
} from '@/components/salesDocs/SalesDocsUi';
import { useRangedPdf, PdfPage, SheetTable, useSheet } from '@/components/salesDocs/DocViewers';
import { EngagementRows, ViewDetailModal } from '@/components/salesDocs/EngagementParts';
import LinksTable from '@/components/salesDocs/LinksTable';

// Sales > Sales Docs > one document (0137): pricing check, versions, links,
// and who has opened it.

function Preview({ version, kind }) {
  const [sheet, setSheet] = useState(null);
  const shown = (version?.sheets || []).filter((s) => !s.hidden);
  useEffect(() => { setSheet(shown[0]?.index ?? null); }, [version?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const pdf = useRangedPdf(kind === 'PDF' && version?.processStatus === 'READY' ? `/api/sales-docs/versions/${version.id}/file` : null, version?.sizeBytes);
  const sh = useSheet(kind === 'XLSX' && sheet != null ? `/api/sales-docs/versions/${version.id}/sheets/${sheet}` : null);

  if (!version || version.processStatus === 'PENDING') return <WidgetLoading>Reading the file...</WidgetLoading>;
  if (version.processStatus === 'FAILED') return <WidgetError>{version.processError || 'This file could not be read.'}</WidgetError>;
  if (kind === 'PDF') {
    if (pdf.error) return <WidgetError>{pdf.error}</WidgetError>;
    if (!pdf.pdf) return <WidgetLoading />;
    return (
      <div className="max-w-md mx-auto">
        <PdfPage pdf={pdf.pdf} pageNumber={1} eager />
        <p className={cn(HELPER, 'text-center mt-2')}>Page 1 of {pdf.pdf.numPages}</p>
      </div>
    );
  }
  return (
    <div>
      {shown.length > 1 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {shown.map((s) => (
            <button key={s.index} type="button" onClick={() => setSheet(s.index)}
              className={cn('px-2.5 py-1 rounded-lg text-xs font-medium border', s.index === sheet ? 'bg-orange-50 border-orange-300 text-orange-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50')}>
              {s.name}
            </button>
          ))}
        </div>
      )}
      {sh.error ? <WidgetError>{sh.error}</WidgetError> : sh.loading || !sh.data ? <WidgetLoading /> : <SheetTable data={sh.data} maxHeight="420px" />}
    </div>
  );
}

function PricingCheck({ version, canOverride, onCleared }) {
  const [reason, setReason] = useState('');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  if (!version) return null;
  const hidden = (version.sheets || []).filter((s) => s.hidden);

  async function clear() {
    setBusy(true); setErr('');
    const res = await fetch(`/api/sales-docs/versions/${version.id}/override`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason }) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setErr(data.error || 'It was not cleared.'); return; }
    setOpen(false); setReason('');
    onCleared();
  }

  return (
    <div className={CARD_PADDED}>
      <div className="flex items-center justify-between gap-2 mb-3">
        <h2 className={CARD_TITLE}>Pricing check · v{version.version}</h2>
        <ScanPill version={version} />
      </div>
      {version.processStatus !== 'READY' ? (
        <p className={HELPER}>{version.processStatus === 'FAILED' ? 'The file could not be read, so it cannot be shared.' : 'Checking the file for cost columns...'}</p>
      ) : (
        <>
          {version.scanStatus === 'CLEAN' && <p className={HELPER}>No cost columns, hidden sheets or hidden columns were found.</p>}
          {version.scanStatus === 'WARN' && <p className={HELPER}>Pricing words were found in the text. It can be shared, but take a look first.</p>}
          {version.scanStatus === 'BLOCKED' && <p className={HELPER}>This file cannot be shared. Upload a copy without these, or ask a Sales Admin to clear it.</p>}
          {version.scanStatus === 'OVERRIDDEN' && (
            <p className={HELPER}>Cleared by {version.scanOverrideBy?.name || 'an admin'} {version.scanOverriddenAt ? `on ${formatWhen(version.scanOverriddenAt)}` : ''}: &ldquo;{version.scanOverrideReason}&rdquo;. Hidden sheets, rows and columns still never show.</p>
          )}
          {version.scanHits.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {version.scanHits.map((h) => (
                <li key={h.id} className="text-xs text-slate-700">
                  <span className="font-semibold">{HIT_LABELS[h.reason] || h.reason}</span>
                  {h.sheetName ? ` · ${h.sheetName}` : ''}{h.cell ? ` ${h.cell}` : ''}{h.page ? ` · page ${h.page}` : ''}
                  {h.text ? <span className="block text-slate-500 truncate" title={h.text}>&ldquo;{h.text}&rdquo;</span> : null}
                </li>
              ))}
            </ul>
          )}
          {hidden.length > 0 && <p className={cn(HELPER, 'mt-3')}>Never shown: {hidden.map((s) => s.name).join(', ')}.</p>}
          {version.truncated && <p className={cn(HELPER, 'mt-1')}>A sheet was cut at 2,000 rows or 60 columns.</p>}
          {version.scanStatus === 'BLOCKED' && canOverride && !open && (
            <button type="button" className={cn(BTN_COMPACT, 'mt-3')} onClick={() => setOpen(true)}>Clear for sharing</button>
          )}
          {open && (
            <div className="mt-3 space-y-2">
              <label className={cn('block', LABEL)} htmlFor="sd-reason">Why is this safe to share?</label>
              <textarea id="sd-reason" rows={2} className={INPUT} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Like: the Cost column is the client's own budget, not ours" />
              {err && <p className="text-xs text-red-600">{err}</p>}
              <div className="flex justify-end gap-2">
                <button type="button" className={BTN_COMPACT} onClick={() => setOpen(false)}>Cancel</button>
                <button type="button" className={BTN_COMPACT_PRIMARY} disabled={busy || reason.trim().length < 5} onClick={clear}>{busy ? 'Clearing...' : 'Clear it'}</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function SalesDocPage({ params }) {
  const { docId } = params;
  const [data, setData] = useState(null);
  const [folders, setFolders] = useState([]);
  const [eng, setEng] = useState(null);
  const [err, setErr] = useState('');
  const [editing, setEditing] = useState(null);
  const [replace, setReplace] = useState(null); // File waiting on the confirm
  const [stage, setStage] = useState('');
  const [linkOpen, setLinkOpen] = useState(false);
  const [viewId, setViewId] = useState(null);
  const fileRef = useRef(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/sales-docs/${docId}`);
    if (!res.ok) { setErr(res.status === 404 ? 'This document was not found.' : 'Could not load this document.'); setData(false); return; }
    setData(await res.json());
  }, [docId]);
  const loadEng = useCallback(() => fetch(`/api/sales-docs/engagement?docId=${docId}`).then((r) => (r.ok ? r.json() : null)).then(setEng), [docId]);

  useEffect(() => { load(); loadEng(); }, [load, loadEng]);
  useEffect(() => { fetch('/api/sales-docs/folders').then((r) => (r.ok ? r.json() : { folders: [] })).then((d) => setFolders(d.folders)); }, []);

  async function patch(body) {
    const res = await fetch(`/api/sales-docs/${docId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) { setErr(d.error || 'That did not save.'); return false; }
    setErr('');
    load();
    return true;
  }

  async function doReplace(file) {
    setReplace(null); setErr('');
    try {
      await uploadSalesDoc(file, { docId, onStage: setStage });
    } catch (e) {
      setErr(e.message);
    }
    setStage('');
    load();
  }

  if (data === null) return <div className="px-4 py-6"><SectionTabs tabs={SALES_DOCS_TABS} className="mb-5" /><WidgetLoading /></div>;
  if (data === false) {
    return (
      <div className="px-4 py-6">
        <SectionTabs tabs={SALES_DOCS_TABS} className="mb-5" />
        <div className="max-w-5xl mx-auto"><p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</p></div>
      </div>
    );
  }

  const { doc, links, liveLinks, spaceLiveLinks, canOverride } = data;
  const current = doc.versions.find((v) => v.id === doc.currentVersionId) || doc.versions[doc.versions.length - 1];
  const latest = doc.versions[0];
  const newer = latest && current && latest.id !== current.id ? latest : null;
  const canShare = current?.processStatus === 'READY' && shareAllowed(current.scanStatus) && !doc.archivedAt;
  const reach = liveLinks + spaceLiveLinks;

  return (
    <div className="px-4 py-6">
      <SectionTabs tabs={SALES_DOCS_TABS} className="mb-5" />
      <div className="max-w-5xl mx-auto space-y-5">
        <div>
          <Link href="/sales/docs" className="text-xs text-slate-500 hover:text-slate-700">Sales Docs</Link>
          <div className="flex flex-wrap items-start justify-between gap-3 mt-1">
            <div className="min-w-0">
              {editing !== null ? (
                <div className="flex gap-2 items-center">
                  <input autoFocus className={cn(INPUT, 'text-lg font-semibold')} value={editing} onChange={(e) => setEditing(e.target.value)}
                    onKeyDown={async (e) => { if (e.key === 'Enter' && editing.trim() && await patch({ title: editing })) setEditing(null); if (e.key === 'Escape') setEditing(null); }} />
                  <button type="button" className={BTN_COMPACT} onClick={async () => { if (editing.trim() && await patch({ title: editing })) setEditing(null); }}>Save</button>
                </div>
              ) : (
                <h1 className={cn(H1, 'break-words')}>
                  {doc.title}
                  <button type="button" className="ml-2 align-middle text-xs font-normal text-slate-500 hover:text-orange-600" onClick={() => setEditing(doc.title)}>Rename</button>
                </h1>
              )}
              <p className="text-xs text-slate-500 mt-0.5">
                {KIND_LABEL[doc.kind]} · {current?.fileName} {formatBytes(current?.sizeBytes)}
                {current?.pageCount ? ` · ${current.pageCount} ${doc.kind === 'XLSX' ? (current.pageCount === 1 ? 'sheet' : 'sheets') : (current.pageCount === 1 ? 'page' : 'pages')}` : ''}
                {doc.owner ? ` · ${doc.owner.name}` : ''}
                {doc.archivedAt ? ' · Archived' : ''}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={BTN_SECONDARY} disabled={!!stage} onClick={() => fileRef.current?.click()}>{stage ? `${stage}...` : 'Upload new version'}</button>
              <input ref={fileRef} type="file" accept={doc.kind === 'PDF' ? '.pdf' : '.xlsx'} className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) (reach ? setReplace(f) : doReplace(f)); }} />
              <button type="button" className={BTN_PRIMARY} disabled={!canShare} title={canShare ? '' : 'Only a checked file that passed the pricing check can be shared.'} onClick={() => setLinkOpen(true)}>Create link</button>
            </div>
          </div>
        </div>

        {err && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</p>}

        {newer && (
          <p className={cn('text-xs rounded-lg border px-3 py-2', newer.processStatus === 'PENDING' ? TONE.info : TONE.warning)}>
            {newer.processStatus === 'PENDING' && `Version ${newer.version} is being checked. Links keep showing version ${current.version} until it passes.`}
            {newer.processStatus === 'FAILED' && `Version ${newer.version} could not be read. Links keep showing version ${current.version}.`}
            {newer.processStatus === 'READY' && newer.scanStatus === 'BLOCKED' && `Version ${newer.version} has cost columns, so links keep showing version ${current.version}. Upload a clean copy${canOverride ? ' or clear it below' : ' or ask a Sales Admin to clear it'}.`}
          </p>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className={cn(CARD_PADDED, 'lg:col-span-2')}>
            <div className="flex items-center justify-between gap-2 mb-3">
              <h2 className={CARD_TITLE}>Preview · v{current?.version}</h2>
              {current && <a className="text-xs text-slate-500 hover:text-orange-600" href={`/api/sales-docs/versions/${current.id}/file?download=1`}>Download</a>}
            </div>
            <Preview version={current} kind={doc.kind} />
          </div>
          <div className="space-y-5">
            {newer && <PricingCheck version={newer} canOverride={canOverride} onCleared={load} />}
            <PricingCheck version={current} canOverride={canOverride} onCleared={load} />
            <div className={CARD_PADDED}>
              <h2 className={cn(CARD_TITLE, 'mb-3')}>Details</h2>
              <label className={cn('block', LABEL, 'mb-1')} htmlFor="sd-folder">Folder</label>
              <select id="sd-folder" className={SELECT} value={doc.folder?.id || ''} onChange={(e) => patch({ folderId: e.target.value || null })}>
                <option value="">No folder</option>
                {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
              {doc.spaceItems.length > 0 && (
                <p className={cn(HELPER, 'mt-3')}>
                  In Spaces:{' '}
                  {doc.spaceItems.map((i, n) => <span key={i.space.id}>{n ? ', ' : ''}<Link href={`/sales/docs/spaces/${i.space.id}`} className="hover:underline">{i.space.name}</Link></span>)}
                </p>
              )}
              <button type="button" className={cn(BTN_COMPACT, 'mt-4')} onClick={() => patch({ archived: !doc.archivedAt })}>{doc.archivedAt ? 'Bring back' : 'Archive'}</button>
              {!doc.archivedAt && <p className={cn(HELPER, 'mt-1')}>Archiving turns off every link to it.</p>}
            </div>
          </div>
        </div>

        <div className={CARD_PADDED}>
          <h2 className={cn(CARD_TITLE, 'mb-3')}>Versions</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="border-b border-slate-200"><Th>Version</Th><Th>File</Th><Th>Pricing check</Th><Th>Uploaded</Th><Th /></tr></thead>
              <tbody className="divide-y divide-slate-50">
                {doc.versions.map((v) => (
                  <tr key={v.id} className="hover:bg-slate-50">
                    <td className={TD}>v{v.version}{v.id === current?.id && <span className={cn('ml-2 px-1.5 py-0.5 rounded-md border text-[11px] font-semibold', TONE.success)}>Links show this</span>}</td>
                    <td className={TD}>{v.fileName} <span className="text-slate-500">{formatBytes(v.sizeBytes)}</span></td>
                    <td className={TD}><ScanPill version={v} /></td>
                    <td className={TD}>{formatWhen(v.createdAt)}{v.uploadedBy ? ` · ${v.uploadedBy.name}` : ''}</td>
                    <td className={cn(TD, 'text-right')}><a className="text-slate-500 hover:text-orange-600" href={`/api/sales-docs/versions/${v.id}/file?download=1`}>Download</a></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className={CARD_PADDED}>
          <div className="flex items-center justify-between gap-2 mb-3">
            <h2 className={CARD_TITLE}>Links</h2>
            {spaceLiveLinks > 0 && <span className={HELPER}>Also shown through {spaceLiveLinks} Space {spaceLiveLinks === 1 ? 'link' : 'links'}</span>}
          </div>
          {links.length === 0 ? <WidgetEmpty>No links yet. Create one to share this document.</WidgetEmpty> : (
            <div className="overflow-x-auto"><LinksTable links={links} onChanged={load} onError={setErr} /></div>
          )}
        </div>

        <div className={CARD_PADDED}>
          <div className="flex items-center justify-between gap-2 mb-3">
            <h2 className={CARD_TITLE}>Who opened it</h2>
            <Link href={`/sales/docs/engagement?doc=${doc.id}`} className="text-xs text-slate-500 hover:text-orange-600">All visits</Link>
          </div>
          {!eng ? <WidgetLoading /> : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                <StatTile label="Views" value={eng.kpis.views} inset />
                <StatTile label="People" value={eng.kpis.visitors} inset />
                <StatTile label="Time read" value={formatTime(eng.kpis.timeMs)} inset />
                <StatTile label="Forwarded" value={eng.kpis.forwarded} inset tone={eng.kpis.forwarded ? 'warning' : 'default'} />
              </div>
              {eng.rows.length === 0 ? <WidgetEmpty>Nobody has opened it yet.</WidgetEmpty> : (
                <div className="overflow-x-auto"><EngagementRows rows={eng.rows.slice(0, 10)} onOpen={setViewId} /></div>
              )}
            </>
          )}
        </div>
      </div>

      {replace && (
        <Modal title="Upload new version" onClose={() => setReplace(null)} width="max-w-md">
          <p className="text-sm text-slate-700">All {reach} live {reach === 1 ? 'link' : 'links'} will show the new version once it passes the pricing check. Until then they keep showing version {current?.version}.</p>
          <div className="flex justify-end gap-2 mt-5">
            <button type="button" className={BTN_SECONDARY} onClick={() => setReplace(null)}>Cancel</button>
            <button type="button" className={BTN_PRIMARY} onClick={() => doReplace(replace)}>Upload {replace.name}</button>
          </div>
        </Modal>
      )}
      {linkOpen && <CreateLinkModal docId={doc.id} defaultName="" onClose={() => setLinkOpen(false)} onCreated={() => load()} />}
      {viewId && <ViewDetailModal viewId={viewId} onClose={() => setViewId(null)} />}
    </div>
  );
}
