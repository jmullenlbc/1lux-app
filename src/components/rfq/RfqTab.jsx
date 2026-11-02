'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import Button from '@/components/ui/Button';
import StatTile from '@/components/ui/StatTile';
import AlertMark from '@/components/ui/AlertMark';
import WidgetFrame, { WidgetLoading, WidgetError, WidgetEmpty } from '@/components/ui/WidgetFrame';
import { LINE_STATUS, needByFrom, roundLabel, showDate } from '@/lib/rfq/format';
import { rfqApi } from './rfqApi';
import SentRfqs from './SentRfqs';
import RfqReceived from './RfqReceived';
import SentNotice from './SentNotice';
import RfqCompare from './RfqCompare';
import RepSelect, { SELECT } from './RepSelect';
import { BOX, usePicks } from './picks';

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

function RepPick({ projectId, mfr, choices, onState, setErr }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <Link href={`/manufacturers/${mfr.id}`} className="font-medium text-slate-800 hover:text-orange-600">{mfr.name}</Link>
      <span className="text-slate-400">{mfr.how}</span>
      <RepSelect projectId={projectId} manufacturerIds={[mfr.id]} linked={mfr.reps.length ? mfr.reps : choices} directName={mfr.name} onState={onState} setErr={setErr} />
    </div>
  );
}

export function GroupCard({ projectId, group, onState, onSent, setErr, coId }) {
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const picks = usePicks(group.lines.map((l) => l.id));
  const n = picks.picked.size;
  const ready = !group.problems.length && (n > 0 || group.draftCount > 0);

  async function send() {
    setBusy(true); setErr('');
    const d = await rfqApi(`/api/projects/${projectId}/rfqs`, { method: 'POST', body: { action: 'send', groupKey: group.key, lineIds: n ? [...picks.picked] : undefined, notes: notes.trim() || undefined, coId }, what: 'The RFQ' });
    setBusy(false);
    if (d.error) { setErr(d.error); return; }
    setNotes('');
    picks.clear();
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
          {group.lastSent && (
            <p className="text-xs text-slate-500 mt-0.5">
              Last sent {group.lastSent.label}{group.lastSent.round ? ` in ${group.lastSent.round}` : ''}. For a new version, use Send revision under Sent RFQs.
            </p>
          )}
        </div>
        <div className="ml-auto">
          <Button size="sm" disabled={!ready || busy} loading={busy} onClick={send}>
            {n ? `Send RFQ (${n} picked)` : group.draftCount ? `Send RFQ (${group.draftCount} line${group.draftCount === 1 ? '' : 's'})` : 'All sent'}
          </Button>
        </div>
      </div>
      {group.problems.map((p) => <p key={p} className="text-sm text-amber-700 mt-2">{p}</p>)}
      <div className="mt-3 space-y-1.5">
        {group.manufacturers.map((m) => <RepPick key={m.id} projectId={projectId} mfr={m} choices={group.choices} onState={onState} setErr={setErr} />)}
      </div>
      {/* Phones: this small table scrolls sideways instead of crushing the Part column (Mike 10-29) */}
      <div className="overflow-x-auto mt-3">
      <table className="w-full min-w-[420px] md:min-w-0 text-sm">
        <thead className="text-xs text-slate-500">
          <tr>
            <th className="py-1 pr-2 w-6 text-left"><input type="checkbox" className={BOX} checked={picks.all} onChange={picks.toggleAll} aria-label={`Select all lines for ${group.toName}`} /></th>
            <th colSpan={4} className="py-1 text-left font-normal">
              {n ? `${n} picked. Send sends only these.` : 'Select all, or tick lines to send only those. With none ticked, Send sends every line not sent yet.'}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {group.lines.map((l) => (
            <tr key={l.id} className={picks.has(l.id) ? 'bg-orange-50' : ''}>
              <td className="py-1 pr-2 w-6"><input type="checkbox" className={BOX} checked={picks.has(l.id)} onChange={() => picks.toggle(l.id)} aria-label={`Pick line ${l.typeCode || l.description}`} /></td>
              <td className="py-1 pr-2 font-mono text-slate-700 w-20">{l.typeCode}</td>
              <td className="py-1 pr-2 text-slate-600">{l.partNumber || l.description}</td>
              <td className="py-1 pr-2 text-right tabular-nums w-16">{l.qty ?? ''}</td>
              <td className="py-1 text-right w-28"><StatusChip status={l.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      {ready && (
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes for this rep (optional, prints on the RFQ)"
          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm mt-3 min-h-[2.5rem]" />
      )}
    </div>
  );
}

// The newest round on the job: one drawing submission, such as Bid Set, VE or GMP.
// Reps left out of a round carry their last prices forward.
function RoundStrip({ projectId, state, onState, setErr }) {
  const rounds = state.rounds || [];
  const newest = rounds.reduce((best, r) => (!best || r.number > best.number ? r : best), null);
  const [name, setName] = useState('');
  const [rename, setRename] = useState(null);
  const [busy, setBusy] = useState(false);

  async function post(body, what) {
    setBusy(true); setErr('');
    const d = await rfqApi(`/api/projects/${projectId}/rfqs`, { method: 'POST', what, body });
    setBusy(false);
    if (d.error) { setErr(d.error); return false; }
    onState(d);
    return true;
  }
  async function start() {
    if (await post({ action: 'round', name }, 'The new round')) setName('');
  }
  async function saveName() {
    if (await post({ action: 'roundName', roundId: newest.id, name: rename }, 'The round name')) setRename(null);
  }

  return (
    <div className="border border-slate-200 rounded-lg bg-white px-3 py-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
      {newest
        ? rename == null
          ? (
            <>
              <span className="font-semibold text-slate-800">{roundLabel(newest)}</span>
              <span className="text-slate-500">{newest.sentReps.length} rep{newest.sentReps.length === 1 ? '' : 's'} sent, {newest.carriedReps.length} carried forward</span>
              <Button size="sm" variant="ghost" onClick={() => setRename(newest.name || '')}>Rename</Button>
            </>
          )
          : (
            <>
              <input className={`${SELECT} w-40`} value={rename} onChange={(e) => setRename(e.target.value)} placeholder="Bid Set, VE, GMP" aria-label="Round name" />
              <Button size="sm" variant="secondary" disabled={busy} onClick={saveName}>Save</Button>
              <Button size="sm" variant="ghost" onClick={() => setRename(null)}>Cancel</Button>
            </>
          )
        : <span className="text-slate-500">Nothing sent yet. The first send starts Round 1.</span>}
      <div className="ml-auto flex flex-wrap items-center gap-2">
        <input className={`${SELECT} w-40`} value={name} onChange={(e) => setName(e.target.value)} placeholder="Name, such as GMP" aria-label="New round name" />
        <Button size="sm" variant="secondary" disabled={busy} loading={busy} onClick={start}>Start a new round</Button>
      </div>
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

  const linePicks = usePicks((state?.lines || []).map((l) => l.id));
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

  // A failed reload keeps the page, so a quote drop in progress is not wiped.
  if (loadErr && !state) return <WidgetFrame title="RFQs"><WidgetError>{loadErr}</WidgetError></WidgetFrame>;
  if (!state) return <WidgetFrame title="RFQs"><WidgetLoading /></WidgetFrame>;

  const count = (s) => state.lines.filter((l) => l.status === s).length;
  const readyGroups = state.groups.filter((g) => !g.problems.length && g.draftCount > 0);
  const blocked = state.groups.filter((g) => g.problems.length && g.draftCount > 0);
  const noMfr = state.lines.filter((l) => !l.status).length;

  return (
    <div className="space-y-6">
      <WidgetFrame title="RFQs" sub="Pricing requests to reps, built from the bid matrix" actions={
        <label className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
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
      <RoundStrip projectId={projectId} state={state} onState={setState} setErr={setErr} />

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
      <RfqCompare state={state} />

      <RfqReceived projectId={projectId} rfqs={state.rfqs} onChanged={load} lines={state.lines} onState={setState} />

      <WidgetFrame title="Every matrix line" sub="Rep and RFQ status, kept up to date by the app. Tick lines to change the rep for all of them." flush>
        {linePicks.picked.size > 0 && (() => {
          const chosen = state.lines.filter((l) => linePicks.has(l.id));
          const mfrIds = [...new Set(chosen.map((l) => l.manufacturerId).filter(Boolean))];
          const left = chosen.filter((l) => !l.manufacturerId).length;
          return (
            <div className="mx-4 mt-3 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-slate-700 flex flex-wrap items-center gap-3">
              <span className="font-semibold tabular-nums">{chosen.length} picked</span>
              <RepSelect projectId={projectId} manufacturerIds={mfrIds} placeholder={`Change rep for ${mfrIds.length} manufacturer${mfrIds.length === 1 ? '' : 's'}…`}
                onState={(d) => { setState(d); linePicks.clear(); }} setErr={setErr} />
              {left > 0 && <span className="text-xs text-slate-500">{left} with no manufacturer in the app {left === 1 ? 'is' : 'are'} skipped.</span>}
              <button type="button" onClick={linePicks.clear} className="ml-auto text-xs text-slate-500 hover:text-orange-600">Clear</button>
            </div>
          );
        })()}
        {err && linePicks.picked.size > 0 && <p className="text-sm text-red-600 mx-4 mt-2">{err}</p>}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500 uppercase tracking-wide">
              <tr>
                <th className="px-3 py-2 w-8 text-left"><input type="checkbox" className={BOX} checked={linePicks.all} onChange={linePicks.toggleAll} aria-label="Select all lines" /></th>
                {['Type', 'Manufacturer', 'Part', 'Qty', 'Rep', 'Status', 'RFQ', 'DN price'].map((h) => <th key={h} className="text-left font-semibold px-3 py-2">{h}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {state.lines.map((l) => (
                <tr key={l.id} className={linePicks.has(l.id) ? 'bg-orange-50' : ''}>
                  <td className="px-3 py-1.5"><input type="checkbox" className={BOX} checked={linePicks.has(l.id)} onChange={() => linePicks.toggle(l.id)} aria-label={`Pick line ${l.typeCode || l.description || ''}`} /></td>
                  <td className="px-3 py-1.5 font-mono">{l.typeCode}</td>
                  <td className="px-3 py-1.5">{l.manufacturerId ? <Link href={`/manufacturers/${l.manufacturerId}`} className="hover:text-orange-600">{l.manufacturer}</Link> : l.manufacturer}</td>
                  <td className="px-3 py-1.5 text-slate-600">{l.partNumber}</td>
                  <td className="px-3 py-1.5 tabular-nums">{l.qty ?? ''}</td>
                  <td className="px-3 py-1.5" title={l.how}>
                    <div className="flex items-center gap-2">
                      <span className="min-w-0 truncate">{l.repName || <span className="text-slate-400">{l.how}</span>}</span>
                      {l.manufacturerId && <RepSelect projectId={projectId} manufacturerIds={[l.manufacturerId]} placeholder="Change…" directName={l.manufacturer} onState={setState} setErr={setErr} className={`${SELECT} w-24`} />}
                    </div>
                  </td>
                  <td className="px-3 py-1.5"><StatusChip status={l.status} /></td>
                  <td className="px-3 py-1.5 font-mono text-slate-600">{l.rfqLabel || ''}</td>
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
