'use client';
import { useCallback, useEffect, useState } from 'react';
import Button from '@/components/ui/Button';
import AlertMark from '@/components/ui/AlertMark';
import WidgetFrame from '@/components/ui/WidgetFrame';
import QuoteReader from '@/components/bidLeveling/QuoteReader';
import { rfqNumber, showDateTime } from '@/lib/rfq/format';
import { rfqApi, money } from './rfqApi';
import RepSelect from './RepSelect';
import { BOX, usePicks } from './picks';

// RFQ received (Mike 10-29, 0144). Bring in the rep's quote with the same
// reader as Bid Leveling. Lines that match an RFQ line at 75% or better are
// priced straight away; the rest ask which RFQ line they belong to.

const SELECT = 'border border-slate-300 rounded-lg px-2 py-1 text-sm bg-white max-w-full';
const STATUS = {
  AUTO: { text: 'Matched', tone: 'text-emerald-700' },
  PICKED: { text: 'Picked', tone: 'text-emerald-700' },
  SKIPPED: { text: 'Not ours', tone: 'text-slate-400' },
  OPEN: { text: 'Which line?', tone: 'text-amber-700' },
};

const lineLabel = (r) => `${rfqNumber(r.rfq.number)} · ${r.typeCode} ${r.manufacturer || ''} ${r.partNumber || ''}${r.qty != null ? ` · qty ${r.qty}` : ''}${r.dnPrice != null ? ` · ${money(r.dnPrice)}` : ''}`.replace(/\s+/g, ' ');

const nameKey = (s) => String(s || '').trim().toLowerCase();

function QuoteLines({ projectId, quote, options, rfqLines, onChanged, mfrIdByName, onState }) {
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(null);
  const byId = Object.fromEntries(rfqLines.map((r) => [r.id, r]));
  const open = quote.lines.filter((l) => l.status === 'OPEN').length;
  const picks = usePicks(quote.lines.map((l) => l.id));
  // The manufacturer of a quote line: its matched RFQ line's, else its own.
  const mfrIdOf = (ql) => mfrIdByName?.[nameKey(byId[ql.rfqLineId]?.manufacturer)] || mfrIdByName?.[nameKey(ql.manufacturer)] || null;
  const chosen = quote.lines.filter((l) => picks.has(l.id));
  const chosenMfrs = [...new Set(chosen.map(mfrIdOf).filter(Boolean))];

  async function skipPicked() {
    setErr('');
    let last = null;
    for (const ql of chosen.filter((l) => l.status !== 'SKIPPED')) {
      setBusy(ql.id);
      const d = await rfqApi(`/api/projects/${projectId}/rfqs/quotes`, { method: 'PATCH', body: { quoteLineId: ql.id, skip: true }, what: 'Not ours' });
      if (d.error) { setErr(`${d.error} The lines before it were marked.`); break; }
      last = d;
    }
    setBusy(null);
    if (last) { onChanged(last); picks.clear(); }
  }

  async function set(ql, body) {
    setBusy(ql.id); setErr('');
    const d = await rfqApi(`/api/projects/${projectId}/rfqs/quotes`, { method: 'PATCH', body: { quoteLineId: ql.id, ...body }, what: 'That match' });
    setBusy(null);
    if (d.error) setErr(d.error); else onChanged(d);
  }

  return (
    <div className="border border-slate-200 rounded-xl">
      <div className="px-3 py-2 border-b border-slate-100 flex flex-wrap items-center gap-x-3 text-sm">
        <span className="font-semibold text-slate-800">{quote.fileName}</span>
        {quote.quoteNumber && <span className="text-slate-500">Quote {quote.quoteNumber}</span>}
        {quote.rfq && <span className="text-slate-500">for {rfqNumber(quote.rfq.number)} {quote.rfq.toName}</span>}
        <span className="text-slate-400">{showDateTime(quote.createdAt)}{quote.uploadedByName ? ` by ${quote.uploadedByName}` : ''}</span>
        <span className={`ml-auto ${open ? 'text-amber-700' : 'text-emerald-700'}`}>{open ? `${open} need a line picked` : 'All lines settled'}</span>
      </div>
      {chosen.length > 0 && (
        <div className="mx-3 mt-2 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-slate-700 flex flex-wrap items-center gap-3">
          <span className="font-semibold tabular-nums">{chosen.length} picked</span>
          <Button size="sm" variant="secondary" disabled={!!busy} onClick={skipPicked}>Not ours</Button>
          <RepSelect projectId={projectId} manufacturerIds={chosenMfrs}
            placeholder={chosenMfrs.length ? `Change rep for ${chosenMfrs.length} manufacturer${chosenMfrs.length === 1 ? '' : 's'}…` : 'No manufacturer in the app'}
            onState={(d) => { onState?.(d); picks.clear(); }} setErr={setErr} />
          <button type="button" onClick={picks.clear} className="ml-auto text-xs text-slate-500 hover:text-orange-600">Clear</button>
        </div>
      )}
      {err && <p className="text-sm text-red-600 px-3 pt-2">{err}</p>}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-slate-500 uppercase tracking-wide">
            <tr>
              <th className="px-3 py-1.5 w-8 text-left"><input type="checkbox" className={BOX} checked={picks.all} onChange={picks.toggleAll} aria-label={`Select all lines of ${quote.fileName}`} /></th>
              {['Quote line', 'Qty', 'Unit price', 'RFQ line', ''].map((h) => <th key={h} className="text-left font-semibold px-3 py-1.5">{h}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {quote.lines.map((ql) => {
              const st = STATUS[ql.status] || STATUS.OPEN;
              const suggested = (options?.[ql.id] || []).map((o) => ({ ...o, line: byId[o.rfqLineId] })).filter((o) => o.line);
              const rest = rfqLines.filter((r) => !suggested.some((o) => o.rfqLineId === r.id));
              return (
                <tr key={ql.id} className={`${ql.status === 'SKIPPED' ? 'opacity-60' : ''} ${picks.has(ql.id) ? 'bg-orange-50' : ''}`}>
                  <td className="px-3 py-1.5"><input type="checkbox" className={BOX} checked={picks.has(ql.id)} onChange={() => picks.toggle(ql.id)} aria-label={`Pick quote line ${ql.typeTag || ql.catalog || ''}`} /></td>
                  <td className="px-3 py-1.5">
                    <span className="font-mono">{ql.typeTag}</span> <span className="text-slate-600">{ql.manufacturer} {ql.catalog}</span>
                    {ql.description && <div className="text-xs text-slate-400 truncate max-w-xs">{ql.description}</div>}
                  </td>
                  <td className="px-3 py-1.5 tabular-nums">{ql.qty ?? ''}</td>
                  <td className="px-3 py-1.5 tabular-nums">{money(ql.unitPrice)}</td>
                  <td className="px-3 py-1.5 min-w-[16rem]">
                    <div className={`text-xs font-semibold flex items-center gap-1 ${st.tone}`}>
                      {ql.status === 'OPEN' && <AlertMark label="Pick a line" size={12} />}
                      {st.text}{ql.status === 'AUTO' ? `, ${Math.round((ql.confidence || 0) * 100)}%` : ''}
                    </div>
                    <select className={SELECT} disabled={busy === ql.id} value={ql.status === 'SKIPPED' ? '' : ql.rfqLineId || ''}
                      onChange={(e) => e.target.value && set(ql, { rfqLineId: e.target.value })} aria-label={`RFQ line for ${ql.typeTag}`}>
                      <option value="">{ql.status === 'SKIPPED' ? 'Not ours' : 'Pick the RFQ line…'}</option>
                      {suggested.length > 0 && (
                        <optgroup label="Best matches">
                          {suggested.map((o) => <option key={o.rfqLineId} value={o.rfqLineId}>{Math.round(o.score * 100)}% · {lineLabel(o.line)}</option>)}
                        </optgroup>
                      )}
                      <optgroup label={suggested.length ? 'Every RFQ line' : 'RFQ lines'}>
                        {rest.map((r) => <option key={r.id} value={r.id}>{lineLabel(r)}</option>)}
                      </optgroup>
                    </select>
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    {ql.status !== 'SKIPPED' && <Button size="sm" variant="ghost" disabled={busy === ql.id} onClick={() => set(ql, { skip: true })}>Not ours</Button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function RfqReceived({ projectId, rfqs, onChanged, lines = [], onState }) {
  const mfrIdByName = Object.fromEntries(lines.filter((l) => l.manufacturerId).map((l) => [nameKey(l.manufacturer), l.manufacturerId]));
  const [data, setData] = useState(null); // { quotes, rfqLines }
  const [options, setOptions] = useState({}); // quoteLineId -> best matches, from this visit's reads
  const [rfqId, setRfqId] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [readerKey, setReaderKey] = useState(0);

  const load = useCallback(async () => {
    const d = await rfqApi(`/api/projects/${projectId}/rfqs/quotes`, { what: 'Loading the quotes' });
    if (d.error) setErr(d.error); else setData(d);
  }, [projectId]);
  useEffect(() => { load(); }, [load]);

  async function onAdd(read) {
    setBusy(true); setErr('');
    const d = await rfqApi(`/api/projects/${projectId}/rfqs/quotes`, {
      method: 'POST', what: 'The quote',
      body: { rfqId: rfqId || null, fileName: read.fileName || 'Pasted quote', quoteNumber: read.quoteNumber || null, lines: read.lines },
    });
    setBusy(false);
    if (d.error) { setErr(d.error); return; }
    setOptions((o) => ({ ...o, ...d.options }));
    setData((x) => ({ quotes: [d.quote, ...(x?.quotes || [])], rfqLines: d.rfqLines }));
    setReaderKey((k) => k + 1);
    onChanged();
  }

  function changed(d) {
    setData((x) => ({ quotes: x.quotes.map((q) => (q.id === d.quote.id ? d.quote : q)), rfqLines: d.rfqLines }));
    onChanged();
  }

  const sent = rfqs.filter((r) => r.status === 'SENT' || r.status === 'RECEIVED');
  return (
    <WidgetFrame title="RFQ received" sub="Bring in a rep's quote. Lines matched at 75% or better are priced for you.">
      {!sent.length ? (
        <p className="text-sm text-slate-500">Send an RFQ first. Its quote comes back here.</p>
      ) : (
        <>
          <label className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
            Which RFQ is this quote for?
            <select className={SELECT} value={rfqId} onChange={(e) => setRfqId(e.target.value)}>
              <option value="">Not sure, match against every RFQ on this job</option>
              {sent.map((r) => <option key={r.id} value={r.id}>{rfqNumber(r.number)} {r.toName}</option>)}
            </select>
          </label>
          <QuoteReader key={readerKey} onAdd={onAdd} busy={busy} error={err} />
        </>
      )}
      {err && !sent.length && <p className="text-sm text-red-600 mt-2">{err}</p>}
      {data?.quotes.length > 0 && (
        <div className="mt-5 space-y-4">
          {data.quotes.map((q) => <QuoteLines key={q.id} projectId={projectId} quote={q} options={options} rfqLines={data.rfqLines} onChanged={changed} mfrIdByName={mfrIdByName} onState={onState} />)}
        </div>
      )}
    </WidgetFrame>
  );
}
