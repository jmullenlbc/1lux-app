import Link from 'next/link';
import StatTile from '@/components/ui/StatTile';
import WidgetFrame, { WidgetEmpty } from '@/components/ui/WidgetFrame';
import AlertMark from '@/components/ui/AlertMark';
import { rfqNumber, showDate, showDateTime } from '@/lib/rfq/format';

// Pre-Con RFQs tab (Mike 10-29): every RFQ across the jobs this person can
// see. Open ones first, overdue at the top, then the recently received.

function Table({ rows, now, showReceived }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-xs text-slate-500 uppercase tracking-wide">
          <tr>{['RFQ', 'Project', 'To', 'Sent', showReceived ? 'Received' : 'Need by', 'Priced'].map((h) => <th key={h} className="text-left font-semibold px-3 py-1.5">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r) => {
            const overdue = r.status === 'SENT' && r.needBy < now;
            return (
              <tr key={r.id}>
                <td className="px-3 py-1.5 font-mono whitespace-nowrap">{rfqNumber(r.number)}</td>
                <td className="px-3 py-1.5">
                  <Link href={`/project/${r.project.id}?tab=rfqs`} className="text-orange-600 hover:underline">{r.project.name}</Link>
                </td>
                <td className="px-3 py-1.5">{r.toName}</td>
                <td className="px-3 py-1.5 text-slate-500 whitespace-nowrap">{showDate(r.createdAt)}{r.sentByName ? ` by ${r.sentByName}` : ''}</td>
                <td className="px-3 py-1.5 whitespace-nowrap">
                  {showReceived ? showDate(r.receivedAt || r.updatedAt) : (
                    <span className={`inline-flex items-center gap-1 ${overdue ? 'text-red-600 font-semibold' : ''}`}>
                      {overdue && <AlertMark label="Overdue" size={12} />}
                      {showDateTime(r.needBy)}
                    </span>
                  )}
                </td>
                <td className="px-3 py-1.5 tabular-nums">{r.priced} of {r.total}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function PreConRfqs({ rfqs }) {
  const now = new Date();
  const open = rfqs.filter((r) => r.status === 'SENT')
    .sort((a, b) => a.needBy - b.needBy); // oldest need by first, so overdue leads
  const overdue = open.filter((r) => r.needBy < now).length;
  const received = rfqs.filter((r) => r.status === 'RECEIVED')
    .sort((a, b) => (b.receivedAt || b.updatedAt) - (a.receivedAt || a.updatedAt))
    .slice(0, 25);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        <StatTile label="Open" value={open.length} sub="Sent, waiting on the rep" />
        <StatTile label="Overdue" value={overdue} tone={overdue ? 'danger' : 'default'} sub="Past the 3 business day need by" />
        <StatTile label="Received" value={rfqs.length - open.length} tone="success" sub="Quote back and priced" />
      </div>
      <WidgetFrame title="Open RFQs" sub="Overdue first. Open the project to bring in the rep's quote.">
        {open.length ? <Table rows={open} now={now} /> : <WidgetEmpty>No open RFQs. Send them from a project's RFQs tab.</WidgetEmpty>}
      </WidgetFrame>
      <WidgetFrame title="Recently received">
        {received.length ? <Table rows={received} now={now} showReceived /> : <WidgetEmpty>No quotes back yet.</WidgetEmpty>}
      </WidgetFrame>
    </div>
  );
}
