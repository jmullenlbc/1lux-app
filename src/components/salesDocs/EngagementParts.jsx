'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Th } from '@/components/ui/SortHeader';
import { TD, HELPER, LABEL, TONE, TILE, STAT_VALUE, BTN_COMPACT } from '@/components/ui/tokens';
import StatTile from '@/components/ui/StatTile';
import { WidgetLoading, WidgetError, WidgetEmpty } from '@/components/ui/WidgetFrame';
import { cn } from '@/lib/utils';
import { Modal, CompletionBar, formatTime, formatWhen, ago } from '@/components/salesDocs/SalesDocsUi';

// Who opened what (0137): the visits table, time on each page, and the
// page-by-page view of one visit. Shown inside a document, a link row and a
// Folder (Mike 10-20: no separate Engagement tab).

const MATCH_LABEL = { EMAIL: 'Known person', DOMAIN: 'Company by email domain' };
const EVENT_LABEL = {
  GATE_PASSED: 'Passed the email or password step', OPENED: 'Opened', DOWNLOAD: 'Downloaded',
  FORWARDED: 'Opened by someone new (forwarded)', PASSWORD_FAIL: 'Wrong password',
};

export function ViewingNowDot() {
  return <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse" title="Viewing now" aria-label="Viewing now" />;
}

export function VisitorCell({ visitor }) {
  if (!visitor?.email) return <span className="text-slate-500">Anonymous</span>;
  return (
    <span className="block">
      <span className="font-medium text-slate-800">{visitor.contact?.name || visitor.name || visitor.email}</span>
      {(visitor.contact?.name || visitor.name) && <span className={cn(HELPER, 'block')}>{visitor.email}</span>}
      {visitor.client && (
        <span className={cn(HELPER, 'block')}>
          <Link href={`/clients/${visitor.client.id}`} className="hover:underline">{visitor.client.name}</Link>
          {MATCH_LABEL[visitor.matchType] ? ` · ${MATCH_LABEL[visitor.matchType]}` : ''}
        </span>
      )}
    </span>
  );
}

/** Visits table. showDoc adds the Document column (Engagement tab). */
export function EngagementRows({ rows, onOpen, showDoc = false, sortHeader }) {
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="border-b border-slate-200">
          {sortHeader ? sortHeader('opened', 'Opened') : <Th>Opened</Th>}
          <Th>Visitor</Th>
          {showDoc && <Th>Document</Th>}
          <Th>Link</Th>
          {sortHeader ? sortHeader('time', 'Time', 'right') : <Th align="right">Time</Th>}
          <Th>Read</Th>
          <Th align="right">Downloads</Th>
          <Th>Device</Th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-50">
        {rows.map((r) => (
          <tr key={r.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => onOpen?.(r.id)}>
            <td className={TD}>
              <span className="flex items-center gap-1.5 whitespace-nowrap">{r.viewingNow && <ViewingNowDot />}{ago(r.startedAt)}</span>
            </td>
            <td className={TD}>
              <VisitorCell visitor={r.visitor} />
              {r.isForwarded && <span className={cn('inline-flex mt-0.5 px-1.5 py-0.5 rounded-md border text-[11px] font-semibold', TONE.warning)}>Forwarded</span>}
            </td>
            {showDoc && <td className={TD}><Link href={`/sales/docs/${r.doc?.id}`} onClick={(e) => e.stopPropagation()} className="hover:underline">{r.doc?.title}</Link></td>}
            <td className={TD}>{r.link?.name}</td>
            <td className={cn(TD, 'text-right tabular-nums whitespace-nowrap')}>{formatTime(r.durationMs)}</td>
            <td className={TD}><CompletionBar value={r.completion} /></td>
            <td className={cn(TD, 'text-right tabular-nums')}>{r.downloads || ''}</td>
            <td className={cn(TD, 'whitespace-nowrap')}>{[r.device, r.browser].filter(Boolean).join(' · ')}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * Time bars, one per page or sheet. units: [{ index, label, durationMs, seen? }].
 * seen = visits that stayed 5 seconds or more. onPick(index) makes rows clickable.
 */
export function UnitTimeBars({ units, onPick }) {
  const most = Math.max(1, ...units.map((u) => u.durationMs));
  return (
    <ul className="space-y-1">
      {units.map((u) => {
        const inner = (
          <>
            <span className="w-28 truncate text-left text-slate-700" title={u.label}>{u.label}</span>
            <span className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden"><span className="block h-full bg-orange-500" style={{ width: `${(u.durationMs / most) * 100}%` }} /></span>
            <span className="w-16 text-right tabular-nums text-slate-600">{u.durationMs ? formatTime(u.durationMs) : ''}</span>
            {u.seen != null && <span className="w-16 text-right tabular-nums text-slate-500">{u.seen ? `${u.seen} ${u.seen === 1 ? 'visit' : 'visits'}` : ''}</span>}
          </>
        );
        return (
          <li key={u.index}>
            {onPick ? (
              <button type="button" onClick={() => onPick(u.index)} title={`Go to ${u.label}`} className="w-full flex items-center gap-3 text-xs rounded px-1 py-0.5 hover:bg-orange-50">{inner}</button>
            ) : (
              <span className="flex items-center gap-3 text-xs px-1 py-0.5">{inner}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Who downloaded: each person and document, how many times, first and last. */
export function DownloadList({ downloads, showDoc }) {
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="border-b border-slate-200">
          <Th>Visitor</Th>
          {showDoc && <Th>Document</Th>}
          <Th align="right">Times</Th>
          <Th>Last</Th>
          <Th>First</Th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-50">
        {downloads.map((d, i) => (
          <tr key={`${d.visitor?.id || 'x'}:${d.doc?.id || i}`}>
            <td className={TD}><VisitorCell visitor={d.visitor} /></td>
            {showDoc && <td className={TD}>{d.doc ? <Link href={`/sales/docs/${d.doc.id}`} className="hover:underline">{d.doc.title}</Link> : ''}</td>}
            <td className={cn(TD, 'text-right tabular-nums')}>{d.count}</td>
            <td className={cn(TD, 'whitespace-nowrap')}>{formatWhen(d.lastAt)}</td>
            <td className={cn(TD, 'whitespace-nowrap')}>{d.count > 1 ? formatWhen(d.firstAt) : ''}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * Who opened it, for a document, a link or a Folder (query = "docId=..",
 * "linkId=.." or "spaceId=.."): averages per visit (Mike 10-21), average time
 * on each page, who downloaded, visits with paging, CSV. fill = [{ index, label }]
 * lists every page of the document so skipped pages show too. onPick(index)
 * jumps the viewer to that page.
 */
export function EngagementPanel({ query, fill = null, onPick, tiles = true, showDoc = false, emptyText = 'Nobody has opened it yet.' }) {
  const [data, setData] = useState(null);
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [viewId, setViewId] = useState(null);

  const load = useCallback(async (p) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/sales-docs/engagement?${query}&page=${p}${p === 1 ? '&units=1' : ''}`, { cache: 'no-store' });
      if (!res.ok) throw new Error();
      const d = await res.json();
      if (p === 1) { setData(d); setRows(d.rows); } else { setRows((r) => [...r, ...d.rows]); }
      setPage(p);
      setErr('');
    } catch {
      setErr('Who opened it did not load.');
    } finally {
      setBusy(false);
    }
  }, [query]);

  useEffect(() => { load(1); }, [load]);

  if (err && !data) return <WidgetError>{err}</WidgetError>;
  if (!data) return <WidgetLoading />;

  // Group the page times by document (a Folder link shows several).
  const docs = [];
  for (const u of data.units || []) {
    let d = docs.find((x) => x.docId === u.docId);
    if (!d) { d = { docId: u.docId, title: u.docTitle, units: [] }; docs.push(d); }
    d.units.push({ index: u.unitIndex, label: u.label || `Page ${u.unitIndex + 1}`, durationMs: u.avgMs, seen: u.seen });
  }
  if (fill && docs.length <= 1) {
    const had = new Map((docs[0]?.units || []).map((u) => [u.index, u]));
    const merged = fill.map((f) => ({ ...f, durationMs: 0, seen: 0, ...had.get(f.index), label: f.label }));
    for (const u of had.values()) if (!fill.some((f) => f.index === u.index)) merged.push(u);
    docs.splice(0, docs.length, { docId: docs[0]?.docId || '', title: '', units: merged });
  }
  const anyTime = docs.some((d) => d.units.some((u) => u.durationMs));

  return (
    <div className="space-y-4">
      {tiles && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          <StatTile label="Views" value={data.kpis.views} inset />
          <StatTile label="People" value={data.kpis.visitors} inset />
          <StatTile label="Avg time per visit" value={formatTime(data.kpis.avgTimeMs)} sub={data.kpis.views > 1 ? `${formatTime(data.kpis.timeMs)} in all` : null} inset />
          <StatTile label="Avg read" value={`${Math.round((data.kpis.avgRead || 0) * 100)}%`} sub="of the pages" inset />
          <StatTile label="Downloads" value={data.kpis.downloads ?? 0} inset />
          <StatTile label="Forwarded" value={data.kpis.forwarded} inset tone={data.kpis.forwarded ? 'warning' : 'default'} />
          <StatTile label="Viewing now" value={data.kpis.viewingNow} inset tone={data.kpis.viewingNow ? 'success' : 'default'} />
        </div>
      )}
      {data.downloads?.length > 0 && (
        <div>
          <p className={cn(LABEL, 'mb-1')}>Downloaded</p>
          <div className="overflow-x-auto"><DownloadList downloads={data.downloads} showDoc={showDoc} /></div>
        </div>
      )}
      {data.total === 0 ? <WidgetEmpty>{emptyText}</WidgetEmpty> : (
        <>
          {anyTime && (
            <div>
              <p className={cn(LABEL, 'mb-2')}>
                Average time on each page, per visit{onPick ? <span className="font-normal normal-case text-slate-500"> · click one to go to it</span> : null}
              </p>
              <div className="space-y-3">
                {docs.map((d) => (
                  <div key={d.docId}>
                    {docs.length > 1 && <Link href={`/sales/docs/${d.docId}`} className="block text-xs font-semibold text-slate-700 hover:underline mb-1">{d.title}</Link>}
                    <UnitTimeBars units={d.units} onPick={onPick} />
                  </div>
                ))}
              </div>
            </div>
          )}
          <div>
            <div className="flex items-center justify-between gap-2 mb-1">
              <p className={LABEL}>Visits</p>
              <a href={`/api/sales-docs/engagement?${query}&format=csv`} className="text-xs text-slate-500 hover:text-orange-600">Download CSV</a>
            </div>
            <div className="overflow-x-auto"><EngagementRows rows={rows} onOpen={setViewId} showDoc={showDoc} /></div>
            {rows.length < data.total && (
              <div className="mt-3 text-center">
                <button type="button" className={BTN_COMPACT} disabled={busy} onClick={() => load(page + 1)}>
                  {busy ? 'Loading...' : `Show more (${data.total - rows.length} more)`}
                </button>
              </div>
            )}
            {err && <p className="text-xs text-red-600 mt-2">{err}</p>}
          </div>
        </>
      )}
      {viewId && <ViewDetailModal viewId={viewId} onClose={() => setViewId(null)} />}
    </div>
  );
}

/** One visit: time on each page or sheet, and what happened on it. */
export function ViewDetailModal({ viewId, onClose }) {
  const [view, setView] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/sales-docs/views/${viewId}`).then((r) => (r.ok ? r.json() : Promise.reject())).then((d) => { if (!cancelled) setView(d.view); }).catch(() => { if (!cancelled) setErr('This visit did not load.'); });
    return () => { cancelled = true; };
  }, [viewId]);

  const units = (() => {
    if (!view) return [];
    const stat = new Map(view.unitStats.map((s) => [s.unitIndex, s]));
    const list = view.doc.kind === 'XLSX'
      ? view.version?.sheets.map((s) => ({ index: s.index, label: s.name })) || []
      : Array.from({ length: view.version?.pageCount || 0 }, (_, i) => ({ index: i, label: `Page ${i + 1}` }));
    for (const s of view.unitStats) if (!list.some((u) => u.index === s.unitIndex)) list.push({ index: s.unitIndex, label: s.label || `#${s.unitIndex + 1}` });
    return list.map((u) => ({ ...u, durationMs: stat.get(u.index)?.durationMs || 0, visits: stat.get(u.index)?.visits || 0 }));
  })();

  return (
    <Modal title="Visit" onClose={onClose} width="max-w-2xl">
      {err ? <WidgetError>{err}</WidgetError> : !view ? <WidgetLoading /> : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="text-sm"><VisitorCell visitor={view.visitor} /></div>
            <div className={cn(HELPER, 'text-right')}>
              <span className="block">{view.doc.title}</span>
              <span className="block">Link: {view.link?.name}</span>
              <span className="block">{formatWhen(view.startedAt)} · {[view.device, view.browser].filter(Boolean).join(' · ')}</span>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className={TILE}><p className={LABEL}>Time</p><p className={STAT_VALUE}>{formatTime(view.durationMs)}</p></div>
            <div className={TILE}><p className={LABEL}>{view.doc.kind === 'XLSX' ? 'Sheets opened' : 'Pages opened'}</p><p className={STAT_VALUE}>{units.filter((u) => u.visits).length} of {units.length}</p></div>
            <div className={TILE}><p className={LABEL}>Forwarded</p><p className={STAT_VALUE}>{view.isForwarded ? 'Yes' : 'No'}</p></div>
          </div>
          <div>
            <p className={cn(LABEL, 'mb-2')}>{view.doc.kind === 'XLSX' ? 'Time on each sheet' : 'Time on each page'}</p>
            <UnitTimeBars units={units} />
          </div>
          {view.events.length > 0 && (
            <div>
              <p className={cn(LABEL, 'mb-2')}>What happened</p>
              <ul className="space-y-1 text-xs text-slate-700">
                {view.events.map((e, i) => (
                  <li key={i} className="flex justify-between gap-3"><span>{EVENT_LABEL[e.type] || e.type}</span><span className="text-slate-500">{formatWhen(e.createdAt)}</span></li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
