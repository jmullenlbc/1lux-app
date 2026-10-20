'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Th } from '@/components/ui/SortHeader';
import { TD, HELPER, LABEL, TONE, TILE, STAT_VALUE } from '@/components/ui/tokens';
import { WidgetLoading, WidgetError } from '@/components/ui/WidgetFrame';
import { cn } from '@/lib/utils';
import { Modal, CompletionBar, formatTime, formatWhen, ago } from '@/components/salesDocs/SalesDocsUi';

// Who opened what (0137): the visits table used on the doc page and the
// Engagement tab, and the page-by-page view of one visit.

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
            <td className={cn(TD, 'whitespace-nowrap')}>{[r.device, r.browser].filter(Boolean).join(' · ')}</td>
          </tr>
        ))}
      </tbody>
    </table>
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
  const most = Math.max(1, ...units.map((u) => u.durationMs));

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
            <ul className="space-y-1.5">
              {units.map((u) => (
                <li key={u.index} className="flex items-center gap-3 text-xs">
                  <span className="w-28 truncate text-slate-700" title={u.label}>{u.label}</span>
                  <span className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden"><span className="block h-full bg-orange-500" style={{ width: `${(u.durationMs / most) * 100}%` }} /></span>
                  <span className="w-16 text-right tabular-nums text-slate-600">{u.durationMs ? formatTime(u.durationMs) : ''}</span>
                </li>
              ))}
            </ul>
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
