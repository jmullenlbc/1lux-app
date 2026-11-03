'use client';
import { useState } from 'react';
import Button from '@/components/ui/Button';
import AlertMark from '@/components/ui/AlertMark';
import WidgetFrame, { WidgetEmpty } from '@/components/ui/WidgetFrame';
import { TH, TD } from '@/components/ui/tokens';
import { rfqLabel, showDate, showDateTime } from '@/lib/rfq/format';
import { TERM_KINDS } from '@/lib/rfq/quoteTerms';
import { cents } from '@/lib/money';
import { rfqApi, money } from './rfqApi';
import QuoteDrop from './QuoteDrop';
import { lineLabel, isReplaced, openRows } from './RfqReview';

// RFQ received (Mike 10-29, 0144; drag and drop 10-30, 0148). Drop the rep's
// quotes in; a person checks what we read. Rows that match an RFQ line at 75% or
// better are linked; prices wait on Review prices for an OK (0164), and rows with
// no line are placed there too. This list is read only: one place for matching.
// Rows of one quote add up on an RFQ line, and a newer quote replaces an older one.

const SELECT = 'border border-slate-300 rounded-lg px-2 py-1 text-sm bg-white max-w-full';
const STATUS = {
  AUTO: { text: 'Matched', tone: 'text-emerald-700' },
  PICKED: { text: 'Picked', tone: 'text-emerald-700' },
  SKIPPED: { text: 'Not ours', tone: 'text-slate-400' },
  REPLACED: { text: 'Replaced', tone: 'text-slate-400' },
  OPEN: { text: 'Needs a line', tone: 'text-amber-700' },
};

function QuoteRows({ quote, byId }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="bg-slate-50">
          <tr>{['Quote line', 'Qty', 'Unit price', 'Status', 'RFQ line'].map((h, i) => <th key={h} className={`${TH} ${i === 1 || i === 2 ? 'text-right' : ''}`}>{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {quote.lines.map((ql) => {
            // AUTO or PICKED with no line left lost it to a newer row before 0156.
            const status = ql.links.length || !['AUTO', 'PICKED'].includes(ql.status) ? ql.status : 'REPLACED';
            const st = STATUS[status] || STATUS.OPEN;
            const linked = ql.links.map((k) => byId[k.rfqLineId]).filter(Boolean);
            return (
              <tr key={ql.id} className={ql.status === 'SKIPPED' ? 'opacity-60' : ''}>
                <td className={TD}>
                  <span className="font-mono">{ql.typeTag}</span> <span className="text-slate-600">{ql.manufacturer} {ql.catalog}</span>
                  {ql.description && <div className="text-xs text-slate-400 truncate max-w-xs">{ql.description}</div>}
                  {(ql.leadTime || ql.stockNote || ql.discontinued) && (
                    <div className="text-xs text-slate-500">
                      {[ql.leadTime && `Lead ${ql.leadTime}`, ql.stockNote].filter(Boolean).join(' · ')}
                      {ql.discontinued && <span className="ml-1 text-amber-700">Discontinued</span>}
                    </div>
                  )}
                </td>
                <td className={`${TD} text-right tabular-nums`}>{ql.qty ?? ''}</td>
                <td className={`${TD} text-right tabular-nums`}>{money(ql.unitPrice)}</td>
                <td className={`${TD} text-xs font-semibold whitespace-nowrap ${st.tone}`}>
                  <span className="inline-flex items-center gap-1">
                    {ql.status === 'OPEN' && Number(ql.unitPrice) > 0 && <AlertMark label="Needs a line" size={12} />}
                    {st.text}{status === 'AUTO' ? `, ${Math.round((ql.confidence || 0) * 100)}%` : ''}
                  </span>
                </td>
                <td className={`${TD} text-xs text-slate-600`}>
                  {linked.map((r) => <div key={r.id}>{lineLabel(r)}{r._count?.quoteLinks > 1 ? ' · adds up' : ''}</div>)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
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

export default function RfqReceived({ projectId, rfqs, quotes, onChanged, forCo = false, onReview }) {
  const { data, setData, loadErr } = quotes;
  const [rfqId, setRfqId] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [readerKey, setReaderKey] = useState(0);
  const [added, setAdded] = useState(null); // { matched, open } for the quote just dropped
  const [openId, setOpenId] = useState(null);
  const [showReplaced, setShowReplaced] = useState(false);

  async function onAdd(read) {
    setBusy(true); setErr(''); setAdded(null);
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
    setData((x) => ({ quotes: [d.quote, ...(x?.quotes || [])], rfqLines: d.rfqLines, rollup: d.rollup }));
    setAdded({ matched: d.quote.lines.filter((l) => l.links.length).length, open: openRows(d.quote).length });
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
  // This screen's quotes: its own RFQs' and those not tied to an RFQ yet.
  const ids = new Set(rfqs.map((r) => r.id));
  const mine = (data?.quotes || []).filter((q) => !q.rfqId || ids.has(q.rfqId));
  const replaced = mine.filter(isReplaced);
  const shown = showReplaced ? mine : mine.filter((q) => !isReplaced(q));
  const byId = Object.fromEntries((data?.rfqLines || []).map((r) => [r.id, r]));
  const r = data?.rollup;

  return (
    <WidgetFrame title="Quotes" sub="Drop a rep's quote here. Rows that match a line at 75% or better are linked. Every price waits on Review prices for an OK." flush>
      <div className="px-4 pt-3">
        {sent.length > 0 && (
          <label className="flex flex-wrap items-center gap-2 text-sm text-slate-600 mb-2">
            For
            <select className={SELECT} value={chosenRfq} onChange={(e) => setRfqId(e.target.value)}>
              {!forCo && <option value="">Not sure, match against every RFQ on this job</option>}
              {sent.map((x) => <option key={x.id} value={x.id}>{x.label} {x.toName}</option>)}
            </select>
          </label>
        )}
        <QuoteDrop projectId={projectId} known={(data?.quotes || []).map((q) => q.fileName)} onAdd={onAdd} busy={busy} error={err} pasteKey={readerKey} />
        {added && (
          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-slate-700">
            <span>Saved. {added.matched} row{added.matched === 1 ? '' : 's'} matched{added.open ? `, ${added.open} need${added.open === 1 ? 's' : ''} a line` : ''}. The prices wait for an OK.</span>
            {onReview && <Button size="sm" variant="secondary" onClick={onReview}>Review prices</Button>}
          </div>
        )}
        {loadErr && <p className="text-sm text-red-600 mt-2">{loadErr}</p>}
        {!forCo && r && mine.length > 0 && (
          <p className="text-sm text-slate-600 mt-3 tabular-nums">
            Budget freight {money(r.budget)} · We expect to pay {money(r.expect)} · Freight profit {money(r.profit)}
            {r.realShare != null ? ` · ${cents(r.realShare * 100)}% on real figures` : ''}
          </p>
        )}
      </div>
      {!mine.length
        ? <div className="p-4"><WidgetEmpty>No quotes yet.</WidgetEmpty></div>
        : (
          <ul className="mt-3 border-t border-slate-100 divide-y divide-slate-100">
            {shown.map((q) => {
              const s = q.summary || {};
              const open = openRows(q).length;
              const asks = (s.freightRows || []).some((f) => f.asks);
              const flags = [open && `${open} row${open === 1 ? '' : 's'} need a line`, s.gap && 'Total does not add up', asks && 'Freight question'].filter(Boolean);
              const isOpen = openId === q.id;
              return (
                <li key={q.id} className={isReplaced(q) ? 'opacity-60' : ''}>
                  <button type="button" onClick={() => setOpenId(isOpen ? null : q.id)} aria-expanded={isOpen}
                    className="w-full text-left px-4 py-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm hover:bg-slate-50">
                    <span className="text-slate-400 w-3">{isOpen ? '▾' : '▸'}</span>
                    {flags.length > 0 && <AlertMark label={flags.join('. ')} size={14} />}
                    <span className="font-semibold text-slate-800">{q.fromName || q.fileName}</span>
                    {q.quoteNumber && <span className="text-slate-500">Q {q.quoteNumber}</span>}
                    {q.rfq && <span className="font-mono text-slate-500">{rfqLabel(q.rfq)}</span>}
                    {q.quoteDate && <span className="text-slate-500">{showDate(q.quoteDate)}</span>}
                    {s.asked != null && <span className="text-slate-500">{s.priced} of {s.asked} priced</span>}
                    {s.longestLead?.text && <span className="text-slate-500">Lead {s.longestLead.text}</span>}
                    {isReplaced(q) && <span className="text-slate-500">Replaced</span>}
                    <span className="ml-auto tabular-nums font-semibold text-slate-800">{q.total != null ? money(q.total) : ''}</span>
                  </button>
                  {isOpen && (
                    <div className="pb-3 bg-slate-50/50">
                      <div className="px-4 pt-1 flex flex-wrap items-center gap-x-3 text-xs text-slate-500">
                        {q.fileId ? <a href={`/api/projects/${projectId}/files/${q.fileId}`} target="_blank" rel="noreferrer" className="text-orange-600 hover:underline">{q.fileName}</a> : <span>{q.fileName}</span>}
                        <span>Brought in {showDateTime(q.createdAt)}{q.uploadedByName ? ` by ${q.uploadedByName}` : ''}</span>
                        {flags.length > 0 && <span className="text-amber-700">{flags.join('. ')}.</span>}
                        {open > 0 && onReview && <Button size="sm" variant="secondary" onClick={onReview}>Review rows</Button>}
                      </div>
                      <QuoteFacts projectId={projectId} quote={q} onChanged={changed} />
                      <QuoteRows quote={q} byId={byId} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      {replaced.length > 0 && (
        <label className="flex items-center gap-2 text-sm text-slate-600 px-4 py-3 border-t border-slate-100">
          <input type="checkbox" className="w-4 h-4 accent-orange-500" checked={showReplaced} onChange={(e) => setShowReplaced(e.target.checked)} />
          Show replaced quotes ({replaced.length})
        </label>
      )}
    </WidgetFrame>
  );
}
