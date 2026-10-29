'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import Button from '@/components/ui/Button';
import StatTile from '@/components/ui/StatTile';
import AlertMark from '@/components/ui/AlertMark';
import WidgetFrame, { WidgetLoading, WidgetError, WidgetEmpty } from '@/components/ui/WidgetFrame';
import { LINE_STATUS, needByFrom, rfqNumber, showDate } from '@/lib/rfq/format';
import { rfqApi } from './rfqApi';
import SentRfqs from './SentRfqs';
import RfqReceived from './RfqReceived';
import SentNotice from './SentNotice';

// Project > RFQs (Mike 10-29, 0144). The bid matrix lines grouped by the rep
// who quotes them. One press sends a group: the RFQ number is made, the lines
// go to Sent, and the email and PDF are ready. Prices come back on the RFQ
// received screen below and the lines go to Received.

const STATUS_TONE = {
  [LINE_STATUS.DRAFT]: 'bg-slate-100 text-slate-700',
  [LINE_STATUS.SENT]: 'bg-amber-100 text-amber-800',
  [LINE_STATUS.RECEIVED]: 'bg-emerald-100 text-emerald-800',
};

export function StatusChip({ status }) {
  if (!status) return <span className="text-xs text-slate-400">No manufacturer</span>;
  return <span className={`text-xs font-semibold rounded-full px-2 py-0.5 ${STATUS_TONE[status]}`}>{status}</span>;
}

const SELECT = 'border border-slate-300 rounded-lg px-2 py-1 text-sm bg-white';

function RepPick({ projectId, mfr, choices, onState, setErr }) {
  const reps = mfr.reps.length ? mfr.reps : choices;
  async function pick(v) {
    const body = v === 'default' ? { action: 'pick', manufacturerId: mfr.id, clear: true }
      : { action: 'pick', manufacturerId: mfr.id, salesRepId: v === 'direct' ? null : v };
    const d = await rfqApi(`/api/projects/${projectId}/rfqs`, { method: 'POST', body, what: 'The rep pick' });
    if (d.error) setErr(d.error); else onState(d);
  }
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <Link href={`/manufacturers/${mfr.id}`} className="font-medium text-slate-800 hover:text-orange-600">{mfr.name}</Link>
      <span className="text-slate-400">{mfr.how}</span>
      <select className={SELECT} value="" onChange={(e) => e.target.value && pick(e.target.value)} aria-label={`Change the rep for ${mfr.name}`}>
        <option value="">Change rep for this job…</option>
        {reps.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        <option value="direct">Buy direct from {mfr.name}</option>
        <option value="default">Back to the default</option>
      </select>
    </div>
  );
}

function GroupCard({ projectId, group, onState, onSent, setErr }) {
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const ready = !group.problems.length && group.draftCount > 0;

  async function send() {
    setBusy(true); setErr('');
    const d = await rfqApi(`/api/projects/${projectId}/rfqs`, { method: 'POST', body: { action: 'send', groupKey: group.key, notes: notes.trim() || undefined }, what: 'The RFQ' });
    setBusy(false);
    if (d.error) { setErr(d.error); return; }
    setNotes('');
    onSent(d);
  }

  return (
    <div className="border border-slate-200 rounded-xl p-4">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {group.problems.length > 0 && <AlertMark label="Not ready to send" />}
            {group.kind === 'REP'
              ? <Link href={`/sales-reps/${group.salesRepId}`} className="font-semibold text-slate-900 hover:text-orange-600">{group.toName}</Link>
              : <span className="font-semibold text-slate-900">{group.toName}{group.kind === 'DIRECT' ? ' (buy direct)' : ''}</span>}
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            {group.quoteEmails.length ? `To ${group.quoteEmails.join(', ')}` : 'No email yet'} · {group.lines.length} line{group.lines.length === 1 ? '' : 's'}, {group.draftCount} not sent
          </p>
        </div>
        <div className="ml-auto">
          <Button size="sm" disabled={!ready || busy} loading={busy} onClick={send}>
            {group.draftCount ? `Send RFQ (${group.draftCount} line${group.draftCount === 1 ? '' : 's'})` : 'All sent'}
          </Button>
        </div>
      </div>
      {group.problems.map((p) => <p key={p} className="text-sm text-amber-700 mt-2">{p}</p>)}
      <div className="mt-3 space-y-1.5">
        {group.manufacturers.map((m) => <RepPick key={m.id} projectId={projectId} mfr={m} choices={group.choices} onState={onState} setErr={setErr} />)}
      </div>
      <table className="w-full text-sm mt-3">
        <tbody className="divide-y divide-slate-100">
          {group.lines.map((l) => (
            <tr key={l.id}>
              <td className="py-1 pr-2 font-mono text-slate-700 w-20">{l.typeCode}</td>
              <td className="py-1 pr-2 text-slate-600">{l.partNumber || l.description}</td>
              <td className="py-1 pr-2 text-right tabular-nums w-16">{l.qty ?? ''}</td>
              <td className="py-1 text-right w-28"><StatusChip status={l.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      {group.draftCount > 0 && !group.problems.length && (
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes for this rep (optional, prints on the RFQ)"
          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm mt-3 min-h-[2.5rem]" />
      )}
    </div>
  );
}

export default function RfqTab({ projectId }) {
  const [state, setState] = useState(null);
  const [err, setErr] = useState('');
  const [loadErr, setLoadErr] = useState('');
  const [sent, setSent] = useState([]); // [{ rfq, email }] from this visit
  const [sendingAll, setSendingAll] = useState(false);

  const load = useCallback(async () => {
    const d = await rfqApi(`/api/projects/${projectId}/rfqs`, { what: 'Loading the RFQs' });
    if (d.error) setLoadErr(d.error); else { setState(d); setLoadErr(''); }
  }, [projectId]);
  useEffect(() => { load(); }, [load]);

  const onSent = (d) => { setState(d.state); setSent((s) => [{ rfq: d.rfq, email: d.email }, ...s]); };

  async function setOffice(officeId) {
    setErr('');
    const d = await rfqApi(`/api/projects/${projectId}/rfqs`, { method: 'POST', body: { action: 'office', officeId: officeId || null }, what: 'The office' });
    if (d.error) setErr(d.error); else setState(d);
  }

  // Sends each ready group in turn and stops on the first problem; the ones
  // already sent keep their numbers.
  async function sendAll() {
    setSendingAll(true); setErr('');
    for (const g of state.groups.filter((x) => !x.problems.length && x.draftCount > 0)) {
      const d = await rfqApi(`/api/projects/${projectId}/rfqs`, { method: 'POST', body: { action: 'send', groupKey: g.key }, what: `The RFQ to ${g.toName}` });
      if (d.error) { setErr(`${d.error} The RFQs before it were sent.`); break; }
      onSent(d);
    }
    setSendingAll(false);
  }

  if (loadErr) return <WidgetFrame title="RFQs"><WidgetError>{loadErr}</WidgetError></WidgetFrame>;
  if (!state) return <WidgetFrame title="RFQs"><WidgetLoading /></WidgetFrame>;

  const count = (s) => state.lines.filter((l) => l.status === s).length;
  const readyGroups = state.groups.filter((g) => !g.problems.length && g.draftCount > 0);
  const blocked = state.groups.filter((g) => g.problems.length && g.draftCount > 0);
  const noMfr = state.lines.filter((l) => !l.status).length;

  return (
    <div className="space-y-6">
      <WidgetFrame title="RFQs" sub="Pricing requests to reps, built from the bid matrix" actions={
        <label className="flex items-center gap-2 text-sm text-slate-600">
          Office working this job
          <select className={SELECT} value={state.office?.id || ''} onChange={(e) => setOffice(e.target.value)}>
            {!state.office && <option value="">Pick an office</option>}
            {state.offices.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </label>
      }>
        {state.officeGuessed && state.office && (
          <p className="text-sm text-amber-700 mb-3">The office was guessed. Pick it above so the right reps and address are used.</p>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatTile label="Not sent" value={count(LINE_STATUS.DRAFT)} sub="Draft lines" />
          <StatTile label="Sent" value={count(LINE_STATUS.SENT)} sub="waiting on price" />
          <StatTile label="Received" value={count(LINE_STATUS.RECEIVED)} sub="priced" />
          <StatTile label="Overdue RFQs" value={state.rfqs.filter((r) => r.overdue).length} sub="past the 3 business day need by" />
        </div>
        {noMfr > 0 && <p className="text-sm text-slate-500 mt-3">{noMfr} matrix line{noMfr === 1 ? ' has' : 's have'} no manufacturer, so {noMfr === 1 ? 'it is' : 'they are'} left off the RFQs.</p>}
      </WidgetFrame>

      {sent.map((s) => <SentNotice key={s.rfq.id} projectId={projectId} rfq={s.rfq} email={s.email} onClose={() => setSent((x) => x.filter((y) => y.rfq.id !== s.rfq.id))} />)}

      <WidgetFrame title="By rep" sub={`${readyGroups.length} ready to send${blocked.length ? `, ${blocked.length} need a look` : ''}`} actions={
        readyGroups.length > 1 && <Button size="sm" disabled={sendingAll} loading={sendingAll} onClick={sendAll}>Send all {readyGroups.length}</Button>
      }>
        {err && <p className="text-sm text-red-600 mb-3">{err}</p>}
        {!state.groups.length && <WidgetEmpty>No matrix lines have a manufacturer yet. Fill the bid matrix first.</WidgetEmpty>}
        <div className="space-y-3">
          {state.groups.map((g) => <GroupCard key={g.key} projectId={projectId} group={g} onState={setState} onSent={onSent} setErr={setErr} />)}
        </div>
      </WidgetFrame>

      <SentRfqs projectId={projectId} state={state} onState={setState} onSent={onSent} reload={load} />

      <RfqReceived projectId={projectId} rfqs={state.rfqs} onChanged={load} />

      <WidgetFrame title="Every matrix line" sub="Rep and RFQ status, kept up to date by the app" flush>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500 uppercase tracking-wide">
              <tr>
                {['Type', 'Manufacturer', 'Part', 'Qty', 'Rep', 'Status', 'RFQ', 'DN price'].map((h) => <th key={h} className="text-left font-semibold px-3 py-2">{h}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {state.lines.map((l) => (
                <tr key={l.id}>
                  <td className="px-3 py-1.5 font-mono">{l.typeCode}</td>
                  <td className="px-3 py-1.5">{l.manufacturer}</td>
                  <td className="px-3 py-1.5 text-slate-600">{l.partNumber}</td>
                  <td className="px-3 py-1.5 tabular-nums">{l.qty ?? ''}</td>
                  <td className="px-3 py-1.5" title={l.how}>{l.repName || <span className="text-slate-400">{l.how}</span>}</td>
                  <td className="px-3 py-1.5"><StatusChip status={l.status} /></td>
                  <td className="px-3 py-1.5 font-mono text-slate-600">{l.rfqNumber ? rfqNumber(l.rfqNumber) : ''}</td>
                  <td className="px-3 py-1.5 tabular-nums">{l.dnPrice != null ? `$${Number(l.dnPrice).toFixed(2)}` : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </WidgetFrame>
      <p className="text-xs text-slate-400">Need by is {showDate(needByFrom())} for an RFQ sent now.</p>
    </div>
  );
}
