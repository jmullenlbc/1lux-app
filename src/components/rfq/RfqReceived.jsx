'use client';
import { useCallback, useEffect, useState } from 'react';
import Button from '@/components/ui/Button';
import AlertMark from '@/components/ui/AlertMark';
import WidgetFrame from '@/components/ui/WidgetFrame';
import { rfqLabel, showDate, showDateTime } from '@/lib/rfq/format';
import { TERM_KINDS } from '@/lib/rfq/quoteTerms';
import { cents } from '@/lib/money';
import StatTile from '@/components/ui/StatTile';
import { rfqApi, money } from './rfqApi';
import RepSelect from './RepSelect';
import QuoteDrop from './QuoteDrop';
import { BOX, usePicks } from './picks';

// RFQ received (Mike 10-29, 0144; drag and drop 10-30, 0148). Drop the rep's
// quotes in; a person checks what we read. Lines that match an RFQ line at 75%
// or better are priced straight away; the rest ask which RFQ line they belong to.
// A quote with no RFQ yet stays here with its lines open. Rows of one quote add up
// on an RFQ line, one row can price several, and a newer quote replaces an older one.

const SELECT = 'border border-slate-300 rounded-lg px-2 py-1 text-sm bg-white max-w-full';
const STATUS = {
  AUTO: { text: 'Matched', tone: 'text-emerald-700' },
  PICKED: { text: 'Picked', tone: 'text-emerald-700' },
  SKIPPED: { text: 'Not ours', tone: 'text-slate-400' },
  REPLACED: { text: 'Replaced', tone: 'text-slate-400' },
  OPEN: { text: 'Which line?', tone: 'text-amber-700' },
};

const lineLabel = (r) => `${rfqLabel(r.rfq)} · ${r.typeCode} ${r.manufacturer || ''} ${r.partNumber || ''}${r.qty != null ? ` · qty ${r.qty}` : ''}${r.dnPrice != null ? ` · ${money(r.dnPrice)}` : ''}`.replace(/\s+/g, ' ');

const nameKey = (s) => String(s || '').trim().toLowerCase();

function QuoteLines({ projectId, quote, options, rfqLines, onChanged, mfrIdByName, onState }) {
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(null);
  const byId = Object.fromEntries(rfqLines.map((r) => [r.id, r]));
  const open = quote.lines.filter((l) => l.status === 'OPEN').length;
  const picks = usePicks(quote.lines.map((l) => l.id));
  // The manufacturer of a quote line: its matched RFQ line's, else its own.
  const mfrIdOf = (ql) => mfrIdByName?.[nameKey(byId[ql.links?.[0]?.rfqLineId]?.manufacturer)] || mfrIdByName?.[nameKey(ql.manufacturer)] || null;
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
        {quote.fromName && <span className="font-semibold text-slate-800">{quote.fromName}</span>}
        <span className={quote.fromName ? 'text-slate-500' : 'font-semibold text-slate-800'}>
          {quote.fileId ? <a href={`/api/projects/${projectId}/files/${quote.fileId}`} target="_blank" rel="noreferrer" className="text-orange-600 hover:underline">{quote.fileName}</a> : quote.fileName}
        </span>
        {quote.quoteNumber && <span className="text-slate-500">Quote {quote.quoteNumber}</span>}
        {quote.quoteDate && <span className="text-slate-500">{showDate(quote.quoteDate)}</span>}
        {quote.total != null && <span className="text-slate-500">Total {money(quote.total)}</span>}
        {quote.rfq && <span className="text-slate-500">for {rfqLabel(quote.rfq)} {quote.rfq.toName}</span>}
        <span className="text-slate-400">{showDateTime(quote.createdAt)}{quote.uploadedByName ? ` by ${quote.uploadedByName}` : ''}</span>
        <span className={`ml-auto ${open ? 'text-amber-700' : 'text-emerald-700'}`}>{open ? (rfqLines.length ? `${open} need a line picked` : 'No RFQ line yet') : 'All lines settled'}</span>
      </div>
      <QuoteFacts projectId={projectId} quote={quote} onChanged={onChanged} />
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
              // AUTO or PICKED with no line left lost it to a newer row before 0156.
              const status = ql.links.length || !['AUTO', 'PICKED'].includes(ql.status) ? ql.status : 'REPLACED';
              const st = STATUS[status] || STATUS.OPEN;
              const linked = ql.links.map((k) => byId[k.rfqLineId]).filter(Boolean);
              const free = (id) => !ql.links.some((k) => k.rfqLineId === id);
              const suggested = (options?.[ql.id] || []).map((o) => ({ ...o, line: byId[o.rfqLineId] })).filter((o) => o.line && free(o.rfqLineId));
              const rest = rfqLines.filter((r) => r.current && free(r.id) && !suggested.some((o) => o.rfqLineId === r.id));
              return (
                <tr key={ql.id} className={`${ql.status === 'SKIPPED' ? 'opacity-60' : ''} ${picks.has(ql.id) ? 'bg-orange-50' : ''}`}>
                  <td className="px-3 py-1.5"><input type="checkbox" className={BOX} checked={picks.has(ql.id)} onChange={() => picks.toggle(ql.id)} aria-label={`Pick quote line ${ql.typeTag || ql.catalog || ''}`} /></td>
                  <td className="px-3 py-1.5">
                    <span className="font-mono">{ql.typeTag}</span> <span className="text-slate-600">{ql.manufacturer} {ql.catalog}</span>
                    {ql.description && <div className="text-xs text-slate-400 truncate max-w-xs">{ql.description}</div>}
                    {(ql.leadTime || ql.stockNote || ql.discontinued) && (
                      <div className="text-xs text-slate-500">
                        {[ql.leadTime && `Lead ${ql.leadTime}`, ql.stockNote].filter(Boolean).join(' · ')}
                        {ql.discontinued && <span className="ml-1 text-amber-700">Discontinued</span>}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-1.5 tabular-nums">{ql.qty ?? ''}</td>
                  <td className="px-3 py-1.5 tabular-nums">{money(ql.unitPrice)}</td>
                  <td className="px-3 py-1.5 min-w-[16rem]">
                    {!rfqLines.length && ql.status === 'OPEN' ? <span className="text-xs text-slate-500">No RFQ line yet</span> : (
                      <>
                        <div className={`text-xs font-semibold flex items-center gap-1 ${st.tone}`}>
                          {ql.status === 'OPEN' && <AlertMark label="Pick a line" size={12} />}
                          {st.text}{status === 'AUTO' ? `, ${Math.round((ql.confidence || 0) * 100)}%` : ''}
                        </div>
                        {linked.map((r) => (
                          <div key={r.id} className="text-xs text-slate-600 flex items-center gap-2 py-0.5">
                            <span>{lineLabel(r)}{r._count?.quoteLinks > 1 ? ' · adds up' : ''}</span>
                            <button type="button" disabled={busy === ql.id} onClick={() => set(ql, { rfqLineId: r.id, remove: true })}
                              className="text-slate-400 hover:text-orange-600" aria-label={`Remove ${r.typeCode} from this quote line`}>Remove</button>
                          </div>
                        ))}
                        <select className={SELECT} disabled={busy === ql.id} value=""
                          onChange={(e) => e.target.value && set(ql, { rfqLineId: e.target.value })} aria-label={`RFQ line for ${ql.typeTag}`}>
                          <option value="">{ql.status === 'SKIPPED' ? 'Not ours' : linked.length ? 'Add another RFQ line…' : 'Pick the RFQ line…'}</option>
                          {suggested.length > 0 && (
                            <optgroup label="Best matches">
                              {suggested.map((o) => <option key={o.rfqLineId} value={o.rfqLineId}>{Math.round(o.score * 100)}% · {lineLabel(o.line)}</option>)}
                            </optgroup>
                          )}
                          <optgroup label={suggested.length ? 'Every RFQ line' : 'RFQ lines'}>
                            {rest.map((r) => <option key={r.id} value={r.id}>{lineLabel(r)}</option>)}
                          </optgroup>
                        </select>
                      </>
                    )}
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

// What one quote really costs, what it says about freight, and its terms.
// Freight is per brand, first match wins: Typed, Stated, Allowed, Allowed by FFA, Estimated.
function QuoteFacts({ projectId, quote, onChanged }) {
  const [err, setErr] = useState('');
  const s = quote.summary;
  if (!s) return null;
  const older = quote.notesText == null && quote.expiresAt == null && !quote.freight?.length && !quote.terms?.length;
  const kinds = [...new Map((quote.terms || []).map((t) => [t.kind, t])).values()];

  async function setFreight(body) {
    setErr('');
    const d = await rfqApi(`/api/projects/${projectId}/rfqs/quotes`, { method: 'PATCH', what: 'The freight figure', body: { quoteId: quote.id, ...body } });
    if (d.error) { setErr(d.error); return; }
    onChanged(d);
  }

  const facts = [
    ['Product', money(s.product)], ['Controls', money(s.controls)], ['Spares', money(s.spares)],
    ['Freight', money(s.freight)], ['Quote really costs', money(s.cost)],
    ['Longest lead', s.longestLead?.text], ['Valid until', quote.expiresAt ? showDate(quote.expiresAt) : ''],
    ['Payment terms', quote.paymentTerms], ['FOB point', quote.fobPoint], ['Revision note', quote.revisionNote],
  ].filter(([, v]) => v);

  return (
    <div className="px-3 py-2 border-t border-slate-100 space-y-2 text-sm">
      <p className="text-slate-700">{s.priced} of {s.asked} line{s.asked === 1 ? '' : 's'} priced, {s.missing} missing</p>
      <dl className="flex flex-wrap gap-x-5 gap-y-1">
        {facts.map(([k, v]) => <div key={k}><dt className="text-xs text-slate-500">{k}</dt><dd className="text-slate-800 tabular-nums">{v}</dd></div>)}
      </dl>
      {s.gap ? <p className="text-amber-700">The rows add to {money(s.rowsTotal)}, the quote says {money(quote.total)}. Check the difference of {money(s.gap)}.</p> : null}
      {kinds.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {kinds.map((t) => <span key={t.kind} title={t.text} className="px-2 py-0.5 rounded-md border border-slate-200 text-xs text-slate-600">{TERM_KINDS[t.kind] || t.kind}</span>)}
        </div>
      )}
      {s.freightRows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] md:min-w-0 text-sm">
            <thead className="text-xs text-slate-500">
              <tr>{['Brand', 'Product', 'Freight', 'How we know', 'Quote says', 'Type a figure'].map((h) => <th key={h} className="text-left font-semibold pr-3 py-1">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {s.freightRows.map((f) => (
                <tr key={f.brand || 'whole'} className="align-top">
                  <td className="pr-3 py-1 text-slate-800">{f.brand || 'Whole quote'}</td>
                  <td className="pr-3 py-1 tabular-nums">{money(f.dollars)}</td>
                  <td className="pr-3 py-1 tabular-nums">{money(f.amount)}</td>
                  <td className="pr-3 py-1 text-slate-600">
                    {f.asks
                      ? (
                        <select className="border border-slate-300 rounded-lg px-2 py-1 text-sm bg-white" defaultValue="" onChange={(e) => e.target.value && setFreight({ brand: f.brand, status: e.target.value })} aria-label="What the quote means">
                          <option value="">The quote says both, pick one</option>
                          <option value="ALLOWED">Allowed</option>
                          <option value="NOT_INCLUDED">Not included</option>
                        </select>
                      )
                      : f.label}
                  </td>
                  <td className="pr-3 py-1 text-xs text-slate-500 max-w-[14rem] truncate" title={f.wording || ''}>{f.wording}</td>
                  <td className="pr-3 py-1">
                    <input key={`${f.brand}-${f.typedAmount ?? ''}`} defaultValue={f.typedAmount ?? ''} inputMode="decimal" aria-label={`Freight for ${f.brand || 'the whole quote'}`}
                      className="border border-slate-300 rounded-lg px-2 py-1 text-sm w-24"
                      onBlur={(e) => { if (e.target.value !== String(f.typedAmount ?? '')) setFreight({ brand: f.brand, typedAmount: e.target.value }); }} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {older && <p className="text-xs text-slate-500">Saved before lead times and terms were kept. Drop it in again to read them.</p>}
      {err && <p className="text-sm text-red-600">{err}</p>}
    </div>
  );
}

export default function RfqReceived({ projectId, rfqs, onChanged, lines = [], onState, forCo = false }) {
  const mfrIdByName = Object.fromEntries(lines.filter((l) => l.manufacturerId).map((l) => [nameKey(l.manufacturer), l.manufacturerId]));
  const [data, setData] = useState(null); // { quotes, rfqLines, rollup }
  const [options, setOptions] = useState({}); // quoteLineId -> best matches, from this visit's reads
  const [rfqId, setRfqId] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [loadErr, setLoadErr] = useState('');
  const [readerKey, setReaderKey] = useState(0);

  const load = useCallback(async () => {
    const d = await rfqApi(`/api/projects/${projectId}/rfqs/quotes`, { what: 'Loading the quotes' });
    if (d.error) setLoadErr(d.error); else { setData(d); setLoadErr(''); }
  }, [projectId]);
  useEffect(() => { load(); }, [load]);

  async function onAdd(read) {
    setBusy(true); setErr('');
    const d = await rfqApi(`/api/projects/${projectId}/rfqs/quotes`, {
      method: 'POST', what: 'The quote',
      body: {
        rfqId: chosenRfq || null, fileId: read.fileId || null, fileName: read.fileName || 'Pasted quote', quoteNumber: read.quoteNumber || null,
        fromName: read.bidderName || null, quoteDate: read.quoteDate || null, total: read.totals?.GRAND || null, lines: read.lines,
        expiresAt: read.expiresAt || null, paymentTerms: read.paymentTerms || null, fob: read.fob || null, revisionNote: read.revisionNote || null,
        leadTime: read.leadTime || null, notes: read.notesRaw || null, totals: read.totals, freight: read.freight, terms: read.terms,
      },
    });
    setBusy(false);
    if (d.error) { setErr(d.error); return false; }
    setOptions((o) => ({ ...o, ...d.options }));
    setData((x) => ({ quotes: [d.quote, ...(x?.quotes || [])], rfqLines: d.rfqLines, rollup: d.rollup }));
    setReaderKey((k) => k + 1);
    onChanged();
    return true;
  }

  function changed(d) {
    setData((x) => ({ quotes: x.quotes.map((q) => (q.id === d.quote.id ? d.quote : q)), rfqLines: d.rfqLines, rollup: d.rollup }));
    onChanged();
  }

  const sent = rfqs.filter((r) => r.isLatest && (r.status === 'SENT' || r.status === 'RECEIVED'));
  const chosenRfq = rfqId || (forCo ? sent[0]?.id : '') || '';
  // On a change order, only its own quotes and quotes not tied to an RFQ yet
  const quotes = (data?.quotes || []).filter((q) => !forCo || !q.rfqId || rfqs.some((r) => r.id === q.rfqId));
  return (
    <WidgetFrame title="RFQ received" sub="Drop a rep's quote here. Lines matched at 75% or better are priced for you. Rows on one RFQ line add up, and a newer quote replaces an older one.">
      {sent.length > 0 && (
        <label className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
          Which RFQ is this quote for?
          <select className={SELECT} value={chosenRfq} onChange={(e) => setRfqId(e.target.value)}>
            {!forCo && <option value="">Not sure, match against every RFQ on this job</option>}
            {sent.map((r) => <option key={r.id} value={r.id}>{r.label} {r.toName}</option>)}
          </select>
        </label>
      )}
      <QuoteDrop projectId={projectId} known={(data?.quotes || []).map((q) => q.fileName)} onAdd={onAdd} busy={busy} error={err} pasteKey={readerKey} />
      {loadErr && <p className="text-sm text-red-600 mt-2">{loadErr}</p>}
      {!forCo && data?.rollup && data.quotes.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
          <StatTile label="Budget Freight" value={money(data.rollup.budget)} />
          <StatTile label="Freight we expect to pay" value={money(data.rollup.expect)} />
          <StatTile label="Freight profit" value={money(data.rollup.profit)} />
          <StatTile label="Share based on real figures" value={data.rollup.realShare == null ? '' : `${cents(data.rollup.realShare * 100)}%`} />
        </div>
      )}
      {quotes.length > 0 && (
        <div className="mt-5 space-y-4">
          {quotes.map((q) => <QuoteLines key={q.id} projectId={projectId} quote={q} options={options} rfqLines={data.rfqLines} onChanged={changed} mfrIdByName={mfrIdByName} onState={onState} />)}
        </div>
      )}
    </WidgetFrame>
  );
}
