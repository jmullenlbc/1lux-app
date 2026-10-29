'use client';
import { useEffect, useState } from 'react';
import Button from '@/components/ui/Button';
import AlertMark from '@/components/ui/AlertMark';
import WidgetFrame, { WidgetEmpty } from '@/components/ui/WidgetFrame';
import RecordHistory from '@/components/RecordHistory';
import { rfqNumber, showDate } from '@/lib/rfq/format';
import { rfqApi } from './rfqApi';
import SentNotice from './SentNotice';

// Sent RFQs on this project. Open one to type DN prices by hand, get the
// email again, or send a revision (a new number that points back to this one).

function Detail({ projectId, summary, state, onSent, reload }) {
  const [d, setD] = useState(null);
  const [prices, setPrices] = useState({});
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(0);
  const [showEmail, setShowEmail] = useState(false);
  const base = `/api/projects/${projectId}/rfqs/${summary.id}`;

  useEffect(() => {
    rfqApi(base, { what: 'Opening the RFQ' }).then((r) => {
      if (r.error) { setErr(r.error); return; }
      setD(r);
      setPrices(Object.fromEntries(r.rfq.lines.map((l) => [l.id, l.dnPrice ?? ''])));
    });
  }, [base]);

  const changed = d ? d.rfq.lines.filter((l) => String(prices[l.id] ?? '') !== String(l.dnPrice ?? '')) : [];

  async function save() {
    setBusy(true); setErr('');
    const r = await rfqApi(base, { method: 'PATCH', body: { prices: changed.map((l) => ({ lineId: l.id, dnPrice: prices[l.id] })) }, what: 'The prices' });
    setBusy(false);
    if (r.error) { setErr(r.error); return; }
    setD({ ...d, rfq: r.rfq });
    setVersion((v) => v + 1);
    reload();
  }

  // A revision goes to whoever quotes these lines today, so find the group
  // that holds them now.
  const itemIds = d ? d.rfq.lines.map((l) => l.peerReviewItemId).filter(Boolean) : [];
  const group = state.groups.find((g) => g.lines.some((l) => itemIds.includes(l.id)));
  async function revise() {
    if (!group) return;
    setBusy(true); setErr('');
    const r = await rfqApi(`/api/projects/${projectId}/rfqs`, {
      method: 'POST', what: 'The revision',
      body: { action: 'send', groupKey: group.key, lineIds: group.lines.filter((l) => itemIds.includes(l.id)).map((l) => l.id), revisesId: summary.id },
    });
    setBusy(false);
    if (r.error) { setErr(r.error); return; }
    onSent(r);
  }

  if (err && !d) return <p className="text-sm text-red-600 px-3 py-2">{err}</p>;
  if (!d) return <p className="text-sm text-slate-500 px-3 py-2">Loading…</p>;

  return (
    <div className="px-3 pb-4 space-y-3">
      <table className="w-full text-sm">
        <thead className="text-xs text-slate-500 uppercase tracking-wide">
          <tr>{['Type', 'Manufacturer', 'Part', 'Qty', 'DN price'].map((h) => <th key={h} className="text-left font-semibold py-1 pr-2">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {d.rfq.lines.map((l) => (
            <tr key={l.id}>
              <td className="py-1 pr-2 font-mono">{l.typeCode}</td>
              <td className="py-1 pr-2">{l.manufacturer}</td>
              <td className="py-1 pr-2 text-slate-600">{l.partNumber}</td>
              <td className="py-1 pr-2 tabular-nums">{l.qty ?? ''}</td>
              <td className="py-1 w-36">
                <input value={prices[l.id] ?? ''} onChange={(e) => setPrices({ ...prices, [l.id]: e.target.value })} inputMode="decimal" placeholder="$"
                  className="w-full border border-slate-300 rounded-lg px-2 py-1 text-sm tabular-nums" aria-label={`DN price for ${l.typeCode}`} />
                {l.priceSource && l.priceSource !== 'TYPED' && <span className="text-[11px] text-slate-400">{l.priceSource === 'AUTO' ? `From quote, ${Math.round((l.confidence || 0) * 100)}% match` : 'From quote, picked'}</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {err && <p className="text-sm text-red-600">{err}</p>}
      <div className="flex flex-wrap gap-2">
        {changed.length > 0 && <Button size="sm" disabled={busy} loading={busy} onClick={save}>Save {changed.length} price{changed.length === 1 ? '' : 's'}</Button>}
        <Button size="sm" variant="secondary" onClick={() => setShowEmail((s) => !s)}>{showEmail ? 'Hide the email' : 'Email and PDF again'}</Button>
        <Button size="sm" variant="secondary" disabled={busy || !group || !!group.problems.length} onClick={revise}
          title={!group ? 'These lines are no longer on the bid matrix.' : group.problems.join(' ')}>Send revision</Button>
      </div>
      {showEmail && <SentNotice projectId={projectId} rfq={d.rfq} email={d.email} onClose={() => setShowEmail(false)} />}
      <RecordHistory type="RFQ" id={summary.id} version={version} />
    </div>
  );
}

export default function SentRfqs({ projectId, state, onSent, reload }) {
  const [open, setOpen] = useState(null);
  const rfqs = state.rfqs;
  const byId = Object.fromEntries(rfqs.map((r) => [r.id, r]));
  return (
    <WidgetFrame title="Sent RFQs" sub={`${rfqs.length} on this project`} flush>
      {!rfqs.length && <div className="p-4"><WidgetEmpty>None sent yet.</WidgetEmpty></div>}
      <ul className="divide-y divide-slate-100">
        {rfqs.map((r) => (
          <li key={r.id}>
            <button type="button" onClick={() => setOpen(open === r.id ? null : r.id)} className="w-full text-left px-3 py-2 hover:bg-slate-50 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              <span className="font-mono font-semibold text-slate-800">{rfqNumber(r.number)}</span>
              <span className="text-slate-800">{r.toName}</span>
              <span className="text-slate-500">Sent {showDate(r.createdAt)}{r.sentByName ? ` by ${r.sentByName}` : ''}</span>
              {r.status === 'RECEIVED'
                ? <span className="text-emerald-700">Received {showDate(r.receivedAt)}</span>
                : <span className={r.overdue ? 'text-red-600 flex items-center gap-1' : 'text-slate-500'}>{r.overdue && <AlertMark label="Overdue" size={14} />}Need by {showDate(r.needBy)}</span>}
              <span className="text-slate-500 tabular-nums">{r.pricedCount} of {r.lineCount} priced</span>
              {r.revisesId && <span className="text-slate-400">Revises {byId[r.revisesId] ? rfqNumber(byId[r.revisesId].number) : 'an older RFQ'}</span>}
              <span className="ml-auto text-slate-400">{open === r.id ? 'Close' : 'Open'}</span>
            </button>
            {open === r.id && <Detail projectId={projectId} summary={r} state={state} onSent={onSent} reload={reload} />}
          </li>
        ))}
      </ul>
    </WidgetFrame>
  );
}
