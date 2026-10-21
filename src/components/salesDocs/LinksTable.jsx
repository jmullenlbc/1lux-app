'use client';
import { Fragment, useState } from 'react';
import Link from 'next/link';
import { Th } from '@/components/ui/SortHeader';
import { TD, HELPER, BTN_COMPACT, TONE } from '@/components/ui/tokens';
import { cn } from '@/lib/utils';
import { CopyButton, shareUrl, formatTime, formatWhen, ago } from '@/components/salesDocs/SalesDocsUi';
import { EngagementPanel } from '@/components/salesDocs/EngagementParts';

// Tracked links (0137): the same table on a doc, a Folder and the Links tab.
// Each row opens to show who opened that link and the time on each page.

const STATUS_TONE = { LIVE: TONE.success, EXPIRED: TONE.warning, REVOKED: TONE.danger };
export const LINK_STATUS_LABEL = { LIVE: 'Live', EXPIRED: 'Expired', REVOKED: 'Turned off' };

export function statusOf(l) {
  if (l.status) return l.status;
  if (l.revokedAt) return 'REVOKED';
  if (l.expiresAt && new Date(l.expiresAt) <= new Date()) return 'EXPIRED';
  return 'LIVE';
}

/** true when turned off, false when it failed, null when the person said no. */
export async function revokeLink(link) {
  if (!window.confirm(`Turn off "${link.name}"? Anyone with the address will see a "no longer available" page.`)) return null;
  const res = await fetch(`/api/sales-docs/links/${link.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revoke: true }) });
  return res.ok;
}

/** showTarget adds the Shows column (doc or Folder); sortHeader(field, label, align) swaps in sortable headers. */
export default function LinksTable({ links, onChanged, onError, showTarget = false, sortHeader }) {
  const [open, setOpen] = useState(null);
  const cols = showTarget ? 8 : 7;
  const head = (field, label, align) => (sortHeader ? sortHeader(field, label, align) : <Th align={align}>{label}</Th>);
  async function off(l) {
    const ok = await revokeLink(l);
    if (ok === null) return;
    if (!ok) onError?.('The link was not turned off.');
    onChanged?.();
  }
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="border-b border-slate-200">
          <Th />
          {head('name', 'Link')}
          {showTarget && head('target', 'Shows')}
          {head('status', 'Status')}
          {head('views', 'Views', 'right')}
          {head('time', 'Time', 'right')}
          {head('viewed', 'Last viewed')}
          <Th />
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-50">
        {links.map((l) => {
          const st = statusOf(l);
          const isOpen = open === l.id;
          const toggle = () => setOpen(isOpen ? null : l.id);
          return (
            <Fragment key={l.id}>
            <tr className={cn('hover:bg-slate-50', isOpen && 'bg-slate-50')}>
              <td className={cn(TD, 'w-6 pr-0')}>
                <button type="button" onClick={toggle} aria-expanded={isOpen} aria-label={isOpen ? 'Hide who opened it' : 'Show who opened it'} title={isOpen ? 'Hide who opened it' : 'Show who opened it'}
                  className="w-6 h-6 inline-flex items-center justify-center rounded text-slate-500 hover:text-orange-600 hover:bg-orange-50">
                  <span className={cn('inline-block transition-transform', isOpen && 'rotate-90')}>›</span>
                </button>
              </td>
              <td className={TD}>
                <span className="font-medium text-slate-800">{l.name}</span>
                <span className={cn(HELPER, 'block')}>
                  {[l.client?.name, l.recipientEmail, l.hasPassword && 'Password', l.allowDownload && 'Download on', l.expiresAt && `Ends ${formatWhen(l.expiresAt)}`, l.createdBy?.name && `By ${l.createdBy.name}`].filter(Boolean).join(' · ')}
                </span>
              </td>
              {showTarget && (
                <td className={TD}>
                  {l.doc && <Link href={`/sales/docs/${l.doc.id}`} className="hover:underline">{l.doc.title}</Link>}
                  {l.space && <Link href={`/sales/docs/spaces/${l.space.id}`} className="hover:underline">{l.space.name} <span className="text-slate-500">(Folder)</span></Link>}
                </td>
              )}
              <td className={TD}><span className={cn('px-2 py-0.5 rounded-lg border text-xs font-semibold whitespace-nowrap', STATUS_TONE[st])}>{LINK_STATUS_LABEL[st]}</span></td>
              <td className={cn(TD, 'text-right tabular-nums')}>{l.views ? <button type="button" onClick={toggle} className="hover:underline tabular-nums">{l.views}</button> : 0}</td>
              <td className={cn(TD, 'text-right tabular-nums whitespace-nowrap')}>{l.timeMs ? formatTime(l.timeMs) : ''}</td>
              <td className={cn(TD, 'whitespace-nowrap')}>{ago(l.lastViewedAt)}</td>
              <td className={cn(TD, 'text-right whitespace-nowrap')}>
                {st === 'LIVE' && (
                  <span className="inline-flex gap-2">
                    <CopyButton text={shareUrl(l.token)} />
                    <button type="button" className={BTN_COMPACT} onClick={() => off(l)}>Turn off</button>
                  </span>
                )}
              </td>
            </tr>
            {isOpen && (
              <tr className="bg-slate-50">
                <td colSpan={cols} className="px-4 pb-4 pt-1">
                  <div className="rounded-lg border border-slate-200 bg-white p-4">
                    <EngagementPanel query={`linkId=${l.id}`} tiles={false} emptyText="Nobody has opened this link yet." />
                  </div>
                </td>
              </tr>
            )}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}
