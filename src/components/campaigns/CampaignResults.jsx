'use client';
import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import StatTile from '@/components/ui/StatTile';
import SortHeader, { sortRows } from '@/components/ui/SortHeader';
import { SearchBox } from '@/components/ui/FilterPanel';
import { WidgetLoading, WidgetEmpty } from '@/components/ui/WidgetFrame';
import { CARD_PADDED, TD, NUM, HELPER, BTN_COMPACT_PRIMARY } from '@/components/ui/tokens';
import { formatTime, formatWhen } from '@/components/salesDocs/SalesDocsUi';
import { SEND_STATUS_LABEL } from './CampaignUi';

// Results for a sent campaign (0147): who got it, opened, clicked, and how
// long they spent in the linked documents. Opens are a soft signal (some
// inboxes load images for everyone); clicks and reads are the strong ones.

const GETTERS = {
  name: (r) => (r.name || r.email).toLowerCase(),
  company: (r) => (r.contact?.client?.name || '').toLowerCase(),
  status: (r) => r.status,
  opened: (r) => (r.openedAt ? new Date(r.openedAt).getTime() : null),
  clicks: (r) => r.clickCount,
  read: (r) => r.docReads?.durationMs || null,
};

export default function CampaignResults({ id, campaign, onSendMore, progress }) {
  const [d, setD] = useState(null);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState({ key: 'read', dir: 'desc' });
  useEffect(() => {
    fetch(`/api/campaigns/${id}/results`).then((r) => (r.ok ? r.json() : null)).then(setD).catch(() => setD(null));
  }, [id, campaign.status, progress?.sent]);
  const toggleSort = (key) => setSort((s) => ({ key, dir: s.key === key && s.dir === 'desc' ? 'asc' : 'desc' }));
  const shown = useMemo(() => {
    let rows = d?.rows || [];
    const s = q.trim().toLowerCase();
    if (s) rows = rows.filter((r) => [r.name, r.email, r.contact?.client?.name].some((v) => v?.toLowerCase().includes(s)));
    return sortRows(rows, sort, GETTERS);
  }, [d, q, sort]);
  if (!d) return <WidgetLoading />;
  const t = d.totals;
  const sh = (field, label, align) => <SortHeader label={label} field={field} sort={sort} onSort={toggleSort} align={align} />;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <StatTile label="Sent" value={t.sent} sub={t.queued ? `${t.queued} waiting` : t.failed ? `${t.failed} failed` : null} />
        <StatTile label="Opened" value={t.opened} />
        <StatTile label="Clicked" value={t.clicked} />
        <StatTile label="Read a document" value={t.read} />
        <StatTile label="Unsubscribed" value={t.unsubscribed} />
      </div>
      {campaign.status === 'SENDING' && (
        <div className={CARD_PADDED}>
          <p className="text-sm text-slate-700">This campaign stopped part way. {t.queued} still waiting.</p>
          {onSendMore ? <button type="button" onClick={onSendMore} className={`${BTN_COMPACT_PRIMARY} mt-2`}>Send the rest</button> : <p className={HELPER}>A sales admin can finish it.</p>}
        </div>
      )}
      <div className={CARD_PADDED}>
        <div className="flex items-center justify-between gap-3">
          <p className={HELPER}>Opens are a soft signal: some inboxes load every image. Clicks and document reads are the strong ones.</p>
          <SearchBox value={q} onChange={setQ} placeholder="Search people" />
        </div>
        <div className="mt-4 overflow-x-auto">
          {!shown.length ? <WidgetEmpty>No one matches.</WidgetEmpty> : (
            <table className="min-w-full">
              <thead className="border-b border-slate-200">
                <tr>{sh('name', 'Person')}{sh('company', 'Company')}{sh('status', 'Status')}{sh('opened', 'Opened')}{sh('clicks', 'Clicks', 'right')}{sh('read', 'Time in docs', 'right')}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {shown.map((r) => (
                  <tr key={r.id}>
                    <td className={TD}>
                      <span className="font-medium text-slate-900">{r.name || r.email}</span>
                      <div className="text-xs text-slate-500">{r.email}</div>
                    </td>
                    <td className={TD}>{r.contact?.client ? <Link href={`/clients/${r.contact.client.id}`} className="hover:text-orange-600">{r.contact.client.name}</Link> : ''}</td>
                    <td className={TD}>
                      {SEND_STATUS_LABEL[r.status] || r.status}
                      {r.status === 'SKIPPED' && <div className="text-xs text-slate-500">On the do-not-email list</div>}
                      {r.status === 'FAILED' && r.error && <div className="text-xs text-red-600">{r.error}</div>}
                      {r.unsubscribedAt && <div className="text-xs text-slate-500">Unsubscribed</div>}
                    </td>
                    <td className={`${TD} text-xs`}>{r.openedAt ? formatWhen(r.openedAt) : ''}</td>
                    <td className={`${TD} ${NUM} text-right`}>{r.clickCount || ''}</td>
                    <td className={`${TD} ${NUM} text-right`}>{r.docReads ? formatTime(r.docReads.durationMs) : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
