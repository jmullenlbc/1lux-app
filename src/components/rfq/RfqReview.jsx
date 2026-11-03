'use client';
import { useCallback, useEffect, useState } from 'react';
import Button from '@/components/ui/Button';
import AlertMark from '@/components/ui/AlertMark';
import WidgetFrame, { WidgetEmpty } from '@/components/ui/WidgetFrame';
import { FilterToolbar, FilterPanel, countFilters } from '@/components/ui/FilterPanel';
import { TH, TD } from '@/components/ui/tokens';
import useUrlView from '@/lib/useUrlView';
import { cents } from '@/lib/money';
import { scorePair } from '@/lib/rfq/match';
import { rfqLabel } from '@/lib/rfq/format';
import { rfqApi, money } from './rfqApi';
import { BOX, usePicks } from './picks';

// Review prices (Mike 11-2, 0164): "nothing should push automatically to the DN,
// rather be a 1 click approval or drop down to assign". A rep price waits on its
// RFQ line until a person approves it; then it becomes the DN and the client sell
// is worked out. A quote row with no line gets one picked here, which approves too.

const SELECT = 'border border-slate-300 rounded-lg px-2 py-1 text-sm bg-white max-w-full';
const FIELDS = [
  { key: 'prep', label: 'Rep', kind: 'pick' },
  { key: 'pquote', label: 'Quote', kind: 'pick' },
];

export const lineLabel = (r) => `${rfqLabel(r.rfq)} · ${r.typeCode} ${r.manufacturer || ''} ${r.partNumber || ''}${r.qty != null ? ` · qty ${r.qty}` : ''}${r.dnPrice != null ? ` · ${money(r.dnPrice)}` : ''}`.replace(/\s+/g, ' ');

/** The job's quotes, shared by Review prices and Quotes so both stay in step. */
export function useRfqQuotes(projectId) {
  const [data, setData] = useState(null); // { quotes, rfqLines, rollup }
  const [loadErr, setLoadErr] = useState('');
  const load = useCallback(async () => {
    const d = await rfqApi(`/api/projects/${projectId}/rfqs/quotes`, { what: 'Loading the quotes' });
    if (d.error) setLoadErr(d.error); else { setData(d); setLoadErr(''); }
  }, [projectId]);
  useEffect(() => { load(); }, [load]);
  return { data, setData, loadErr, load };
}

// This screen's quotes: those for its own RFQs, and those not tied to an RFQ yet.
export const quotesIn = (data, rfqs) => {
  const ids = new Set(rfqs.map((r) => r.id));
  return (data?.quotes || []).filter((q) => !q.rfqId || ids.has(q.rfqId));
};
export const isReplaced = (q) => q.lines.length > 0 && q.lines.every((l) => l.status === 'REPLACED' || l.status === 'SKIPPED') && q.lines.some((l) => l.status === 'REPLACED');
export const openRows = (q) => q.lines.filter((l) => l.status === 'OPEN' && Number(l.unitPrice) > 0);
const linesIn = (data, rfqs) => {
  const ids = new Set(rfqs.map((r) => r.id));
  return (data?.rfqLines || []).filter((r) => r.current && ids.has(r.rfqId));
};
const looseRows = (data, rfqs) => (linesIn(data, rfqs).length
  ? quotesIn(data, rfqs).filter((q) => !isReplaced(q)).flatMap((q) => openRows(q).map((ql) => ({ q, ql })))
  : []);

/** Prices waiting for an OK plus quote rows waiting for a line: the count on the tab. */
export function reviewCount(state, data) {
  return state.lines.filter((l) => l.rfqLineId && l.dnPrice != null && !l.approved).length + looseRows(data, state.rfqs).length;
}

const quoteName = (q) => [q.fromName, q.quoteNumber ? `Q ${q.quoteNumber}` : ''].filter(Boolean).join(' ') || q.fileName || 'Quote';
const matchText = (l) => (l.priceSource === 'AUTO' ? `${Math.round((l.confidence || 0) * 100)}%` : l.priceSource === 'PICKED' ? 'Picked' : l.priceSource === 'TYPED' ? 'Typed' : '');

export default function RfqReview({ projectId, state, onState, reload, quotes, coId = null, onApproved }) {
  const [showApproved, setShowApproved] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');
  const { filters, setFilter, clearFilters } = useUrlView({ fields: FIELDS });

  const margin = Number(state.marginPct ?? 0.23);
  const sellOf = (dn) => (1 - margin > 0 ? cents(dn / (1 - margin)) : null);
  const repOf = (l) => l.sentTo || l.repName || '';
  const priced = state.lines.filter((l) => l.rfqLineId && l.dnPrice != null);
  const choices = {
    prep: [...new Set(priced.map(repOf).filter(Boolean))].sort(),
    pquote: [...new Map(priced.flatMap((l) => l.quoteFrom).map((q) => [q.id, [q.id, quoteName(q)]])).values()],
  };
  const rows = priced.filter((l) => (showApproved || !l.approved)
    && (!filters.prep || repOf(l) === filters.prep)
    && (!filters.pquote || l.quoteFrom.some((q) => q.id === filters.pquote)));
  const waiting = priced.filter((l) => !l.approved).length;
  const picks = usePicks(rows.filter((l) => !l.approved).map((l) => l.rfqLineId));
  const n = picks.picked.size;

  const allQuotes = quotes.data?.quotes || [];
  const rowsOn = (rfqLineId) => allQuotes.flatMap((q) => q.lines.filter((ql) => ql.links?.some((k) => k.rfqLineId === rfqLineId)));
  const candidates = linesIn(quotes.data, state.rfqs);
  const loose = looseRows(quotes.data, state.rfqs);

  const refresh = () => Promise.all([reload(), quotes.load()]);

  async function approve(ids) {
    setBusy(ids.length === 1 ? ids[0] : 'bulk'); setErr(''); setNote('');
    const d = await rfqApi(`/api/projects/${projectId}/rfqs`, { method: 'POST', what: 'The approval', body: { action: 'approve', rfqLineIds: ids, coId } });
    setBusy(null);
    if (d.error) { setErr(d.error); return; }
    picks.clear();
    onState(d.state);
    onApproved?.();
    if (d.missed) setNote(`${d.approved} approved. ${d.missed} did not change a line, because the ${coId ? 'change order is no longer a draft' : 'matrix line is gone'}. The approval is saved.`);
  }

  // A wrong match: the quote rows come off the line, its price clears, and the rows wait below for the right line.
  async function unmatch(l) {
    setBusy(l.rfqLineId); setErr(''); setNote('');
    for (const ql of rowsOn(l.rfqLineId)) {
      const d = await rfqApi(`/api/projects/${projectId}/rfqs/quotes`, { method: 'PATCH', what: 'Taking that match off', body: { quoteLineId: ql.id, rfqLineId: l.rfqLineId, remove: true } });
      if (d.error) { setErr(d.error); break; }
    }
    await refresh();
    setBusy(null);
  }

  async function patchRow(ql, body, what) {
    setBusy(ql.id); setErr(''); setNote('');
    const d = await rfqApi(`/api/projects/${projectId}/rfqs/quotes`, { method: 'PATCH', what, body: { quoteLineId: ql.id, ...body } });
    if (d.error) setErr(d.error);
    await refresh();
    setBusy(null);
    if (!d.error && body.approve) onApproved?.();
  }

  return (
    <div className="space-y-4">
      <WidgetFrame title="Prices waiting for an OK" sub={`${waiting} waiting`} flush>
        <p className="px-4 pt-3 text-sm text-slate-600">
          {coId
            ? 'Rep prices wait here until someone approves them. Approve puts the price on the change order line while it is a draft.'
            : `Rep prices wait here until someone approves them. Approve makes it the DN on the bid matrix and works out the client sell at the ${cents(margin * 100)}% margin. Nothing reaches the matrix on its own.`}
        </p>
        <div className="px-4 pt-3">
          <FilterToolbar count={countFilters(filters, FIELDS)} open={filterOpen} onToggle={() => setFilterOpen((o) => !o)} onClear={clearFilters}
            shown={rows.length} total={priced.filter((l) => showApproved || !l.approved).length} noun="lines"
            right={(
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" className={BOX} checked={showApproved} onChange={(e) => setShowApproved(e.target.checked)} />
                Show approved
              </label>
            )} />
          <FilterPanel open={filterOpen} fields={FIELDS} filters={filters} choices={choices} onChange={setFilter} />
        </div>
        {n > 0 && (
          <div className="mx-4 mt-3 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-slate-700 flex flex-wrap items-center gap-3">
            <span className="font-semibold tabular-nums">{n} picked</span>
            <Button size="sm" disabled={!!busy} loading={busy === 'bulk'} onClick={() => approve([...picks.picked])}>Approve {n}</Button>
            <button type="button" onClick={picks.clear} className="ml-auto text-xs text-slate-500 hover:text-orange-600">Clear</button>
          </div>
        )}
        {err && <p className="text-sm text-red-600 mx-4 mt-2">{err}</p>}
        {note && <p className="text-sm text-amber-700 mx-4 mt-2">{note}</p>}
        {!rows.length
          ? <div className="p-4"><WidgetEmpty>{waiting ? 'No lines match these filters.' : 'Nothing waiting. Prices from rep quotes show up here for an OK.'}</WidgetEmpty></div>
          : (
            <div className="overflow-x-auto mt-3">
              <table className="w-full min-w-[860px] text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className={`${TH} w-8`}><input type="checkbox" className={BOX} checked={picks.all} onChange={picks.toggleAll} aria-label="Select all prices waiting" /></th>
                    {['Type', 'Part', 'Rep', 'Quote', 'Match', 'Now DN', 'New DN', 'Change', 'New sell', ''].map((h, i) => (
                      <th key={h || i} className={`${TH} ${i >= 5 && i <= 8 ? 'text-right' : ''}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((l) => {
                    const diff = l.nowDN != null ? cents(l.dnPrice - l.nowDN) : null;
                    const sell = coId && l.qty < 0 ? null : sellOf(l.dnPrice);
                    const matched = l.priceSource !== 'TYPED' && rowsOn(l.rfqLineId).length > 0;
                    return (
                      <tr key={l.rfqLineId} className={picks.has(l.rfqLineId) ? 'bg-orange-50' : ''}>
                        <td className={TD}>{!l.approved && <input type="checkbox" className={BOX} checked={picks.has(l.rfqLineId)} onChange={() => picks.toggle(l.rfqLineId)} aria-label={`Pick ${l.typeCode || l.partNumber}`} />}</td>
                        <td className={`${TD} font-mono`}>{l.typeCode}</td>
                        <td className={`${TD} text-slate-600 max-w-[14rem] truncate`} title={l.partNumber || l.description}>{l.partNumber || l.description}</td>
                        <td className={`${TD} max-w-[10rem] truncate`} title={repOf(l)}>{repOf(l)}</td>
                        <td className={`${TD} text-slate-600 max-w-[10rem] truncate`} title={l.quoteFrom.map(quoteName).join(', ')}>
                          {l.quoteFrom.map((q) => (q.quoteNumber ? `Q ${q.quoteNumber}` : quoteName(q))).join(', ') || (l.priceSource === 'TYPED' ? 'Typed in' : '')}
                        </td>
                        <td className={`${TD} tabular-nums`}>{matchText(l)}</td>
                        <td className={`${TD} text-right tabular-nums`}>{money(l.nowDN)}</td>
                        <td className={`${TD} text-right tabular-nums font-semibold`}>{money(l.dnPrice)}</td>
                        <td className={`${TD} text-right tabular-nums ${diff > 0 ? 'text-amber-700' : diff < 0 ? 'text-emerald-700' : 'text-slate-500'}`}>
                          {diff == null ? 'New' : diff === 0 ? 'Same' : `${diff > 0 ? '+' : '-'}${money(Math.abs(diff))}`}
                        </td>
                        <td className={`${TD} text-right tabular-nums`}>{money(sell)}</td>
                        <td className={`${TD} text-right whitespace-nowrap`}>
                          {l.approved
                            ? <span className="text-xs text-emerald-700">Approved{l.approvedByName ? ` by ${l.approvedByName}` : ''}</span>
                            : (
                              <span className="inline-flex items-center gap-1">
                                {matched && <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => unmatch(l)}>Wrong match</Button>}
                                <Button size="sm" disabled={!!busy} loading={busy === l.rfqLineId} onClick={() => approve([l.rfqLineId])}>Approve</Button>
                              </span>
                            )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
      </WidgetFrame>

      {loose.length > 0 && (
        <WidgetFrame title="Quote rows with no line" sub={`${loose.length} to place`} flush>
          <p className="px-4 pt-3 text-sm text-slate-600">Pick the line each row prices. Picking a line approves the price. Best matches are listed first.</p>
          <div className="overflow-x-auto mt-3">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-slate-50">
                <tr>{['Quote', 'Row', 'Qty', 'Unit price', 'Put it on', ''].map((h, i) => <th key={h || i} className={`${TH} ${i === 2 || i === 3 ? 'text-right' : ''}`}>{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loose.map(({ q, ql }) => {
                  const best = candidates.map((r) => ({ r, score: scorePair(ql, r) })).filter((o) => o.score > 0).sort((a, b) => b.score - a.score).slice(0, 5);
                  const rest = candidates.filter((r) => !best.some((o) => o.r.id === r.id)).sort((a, b) => (a.rfqId === q.rfqId ? 0 : 1) - (b.rfqId === q.rfqId ? 0 : 1));
                  return (
                    <tr key={ql.id}>
                      <td className={`${TD} text-slate-600`}>{quoteName(q)}</td>
                      <td className={TD}>
                        <span className="inline-flex items-center gap-1"><AlertMark label="Pick a line" size={12} /><span className="font-mono">{ql.typeTag}</span></span>{' '}
                        <span className="text-slate-600">{ql.manufacturer} {ql.catalog}</span>
                        {ql.description && <div className="text-xs text-slate-400 truncate max-w-xs">{ql.description}</div>}
                      </td>
                      <td className={`${TD} text-right tabular-nums`}>{ql.qty ?? ''}</td>
                      <td className={`${TD} text-right tabular-nums`}>{money(ql.unitPrice)}</td>
                      <td className={TD}>
                        <select className={`${SELECT} w-72`} disabled={!!busy} value="" aria-label={`Line for ${ql.typeTag || ql.catalog || 'this row'}`}
                          onChange={(e) => e.target.value && patchRow(ql, { rfqLineId: e.target.value, approve: true }, 'Putting the row on that line')}>
                          <option value="">Pick the line…</option>
                          {best.length > 0 && (
                            <optgroup label="Best matches">
                              {best.map((o) => <option key={o.r.id} value={o.r.id}>{Math.round(o.score * 100)}% · {lineLabel(o.r)}</option>)}
                            </optgroup>
                          )}
                          <optgroup label={best.length ? 'Every line' : 'Lines'}>
                            {rest.map((r) => <option key={r.id} value={r.id}>{lineLabel(r)}</option>)}
                          </optgroup>
                        </select>
                      </td>
                      <td className={`${TD} text-right`}>
                        <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => patchRow(ql, { skip: true }, 'Not ours')}>Not ours</Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </WidgetFrame>
      )}
    </div>
  );
}
