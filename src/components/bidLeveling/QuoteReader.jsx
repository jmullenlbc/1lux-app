'use client';
// Read a competitor quote and "Check what we read" (Mike 10-26, bid step 1).
// The browser reads Excel, CSV or pasted rows with the pure reader; a person
// checks each marked line; the server cleans the lines again before saving.
// Built to be reused by the public bid tool later.
import { Fragment, useMemo, useState } from 'react';
import Button from '@/components/ui/Button';
import AlertMark from '@/components/ui/AlertMark';
import { INPUT, LABEL, HELPER, TH, TD, NUM, BTN_SECONDARY, TONE } from '@/components/ui/tokens';
import { readQuoteSheets, readPastedQuote, lineReasons, quoteWarnings } from '@/lib/bidLeveling/readQuote';
import { normalizeTag } from '@/lib/bidLeveling/normalizeTag';
import { toNumber } from '@/lib/matrixImport/readMatrix';

const BUCKETS = [
  ['FIXTURES', 'Fixtures'], ['CONTROLS', 'Controls'], ['FREIGHT', 'Freight'], ['WAREHOUSING', 'Warehousing'],
  ['SPARES', 'Spares'], ['TAX', 'Tax'], ['GRAND', 'Grand total'],
];
const EMPTY_FORM = { bidderName: '', bidderType: 'UNKNOWN', quoteNumber: '', quoteDate: '', expiresAt: '', taxRateStated: '', notesRaw: '' };
const CELL = 'w-full rounded border border-slate-200 bg-white px-1.5 py-1 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-orange-500';
const asNumbers = (l) => ({ ...l, qty: toNumber(l.qty), unitPrice: toNumber(l.unitPrice), extPrice: toNumber(l.extPrice) });
const shown = (v) => (v == null ? '' : String(v));
let nextKey = 0;

// What the check screen works on, from any reader's result.
export function quoteToCheck(r, fileName) {
  return {
    fileName,
    sheetName: r.sheetName,
    otherSheets: r.otherSheets || 0,
    lines: r.lines.map((l) => ({ ...l, _key: nextKey++, ok: false })),
    totals: Object.fromEntries(Object.entries(r.totals || {}).map(([k, v]) => [k, shown(v)])),
    form: {
      ...EMPTY_FORM,
      bidderName: r.bidderName || '',
      quoteNumber: r.info?.quoteNumber || '',
      quoteDate: r.info?.quoteDate || '',
      expiresAt: r.info?.expiresAt || '',
      taxRateStated: shown(r.info?.taxRateStated),
      notesRaw: r.notesRaw || '',
    },
  };
}

export async function readQuoteFile(file) {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
  const sheets = wb.SheetNames.map((name) => ({
    name, rows: XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '', raw: true }),
  }));
  return readQuoteSheets(sheets, { fileName: file.name });
}

// pasteOnly hides the file pick (the RFQ tab has its own drop). repQuote is a rep's
// quote to us: a part row with no fixture type is fine, and bid-only boxes go away.
export default function QuoteReader({ onAdd, busy, error, pasteOnly = false, repQuote = false, saveLabel }) {
  const [read, setRead] = useState(null);
  const [problem, setProblem] = useState('');
  const [pasted, setPasted] = useState('');

  const start = (r, fileName) => {
    if (!r.ok) { setProblem(r.message); return; }
    setProblem('');
    setRead(quoteToCheck(r, fileName));
  };

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (/\.pdf$/i.test(file.name)) {
      setProblem('We cannot read PDF quotes yet, so nothing was read. Open the PDF, copy the table, and paste it in the box below.');
      return;
    }
    try {
      start(await readQuoteFile(file), file.name);
    } catch {
      setProblem('We could not open that file, so nothing was read. Save it again as an Excel file (.xlsx) and pick it once more, or copy the table and paste it below.');
    }
  };

  const byHand = () => start({ ok: true, lines: [], totals: {}, info: {}, bidderName: '' }, '');

  if (read) return <CheckScreen read={read} setRead={setRead} onAdd={onAdd} busy={busy} error={error} saveLabel={saveLabel} repQuote={repQuote} onStartOver={() => { setRead(null); setPasted(''); }} />;

  return (
    <div className="mt-4 space-y-4 border-t border-slate-100 pt-4">
      {!pasteOnly && (
        <div className="flex flex-wrap items-center gap-2">
          <label className={`${BTN_SECONDARY} cursor-pointer`}>
            Pick the quote file
            <input type="file" accept=".xlsx,.xls,.csv,.pdf" className="hidden" onChange={onFile} />
          </label>
          <span className={HELPER}>Excel or CSV. We read it here in your browser, then you check what we read before anything is saved.</span>
        </div>
      )}
      <label className="block">
        <span className={LABEL}>Or paste the quote table</span>
        <textarea className={`${INPUT} mt-1 font-mono text-xs h-32`} value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder="Copy the table from the quote, heading row included, and paste it here." />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <Button disabled={!pasted.trim()} onClick={() => start(readPastedQuote(pasted), '')}>Read it</Button>
        <button type="button" className="text-sm text-slate-500 underline hover:text-slate-700" onClick={byHand}>{repQuote ? 'No table? Type it by hand' : 'No line table? Type the totals by hand'}</button>
      </div>
      {problem && <p className={`rounded-lg border px-3 py-2 text-sm ${TONE.danger}`}>{problem}</p>}
    </div>
  );
}

export function CheckScreen({ read, setRead, onAdd, busy, error, onStartOver, saveLabel = 'Add this bid', repQuote = false, position = '', startOverLabel = 'Start over' }) {
  const [onlyMarked, setOnlyMarked] = useState(false);
  const { lines, totals, form } = read;
  const numeric = useMemo(() => lines.map(asNumbers), [lines]);
  const reasons = useMemo(() => lineReasons(numeric, { repQuote }), [numeric, repQuote]);
  const warnings = useMemo(() => quoteWarnings(numeric, totals, form), [numeric, totals, form]);
  const open = (i) => reasons[i].some((r) => r.blocking) || (reasons[i].length > 0 && !lines[i].ok);
  const openCount = lines.filter((_, i) => open(i)).length;
  const blocking = reasons.filter((rs) => rs.some((r) => r.blocking)).length;

  const setForm = (k) => (e) => setRead({ ...read, form: { ...form, [k]: e.target.value } });
  const setTotal = (k) => (e) => setRead({ ...read, totals: { ...totals, [k]: e.target.value } });
  const setLine = (i, patch) => setRead({ ...read, lines: lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) });
  const setType = (i, v) => {
    const l = lines[i];
    const t = normalizeTag(v, { description: l.description || '', catalog: l.catalog || '', mfr: l.mfr || '' });
    setLine(i, { typeTagRaw: v, typeTag: t.typeTag, variant: t.variant, lengthFt: t.lengthFt });
  };
  const removeLine = (i) => setRead({ ...read, lines: lines.filter((_, j) => j !== i) });
  const addLine = () => setRead({ ...read, lines: [...lines, { _key: nextKey++, typeTagRaw: '', typeTag: '', variant: '', qty: null, uom: 'EA', optionGroup: 'BASE', ok: false }] });

  const save = () => onAdd({
    source: 'LINES',
    ...form,
    fileName: read.fileName,
    totals,
    lines: lines.map(({ _key, ok, sourceRow, ...l }, i) => ({ ...l, needsReview: reasons[i].length > 0 && !ok })),
  });

  return (
    <div className="mt-4 space-y-5 border-t border-slate-100 pt-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-800">
            Check what we read
            {position && <span className="ml-2 text-sm font-normal text-slate-500">{position}</span>}
          </h3>
          <p className="text-sm text-slate-600 mt-0.5">
            {read.fileName ? `${read.fileName}${read.sheetName && read.sheetName !== 'Pasted' ? `, sheet "${read.sheetName}"` : ''}. ` : ''}
            We read {lines.length} line{lines.length === 1 ? '' : 's'}.{' '}
            {openCount ? <span className="font-medium text-amber-700">{openCount} need{openCount === 1 ? 's' : ''} a look.</span> : 'None need a look.'}
          </p>
          {read.otherSheets > 0 && (
            <p className={`${HELPER} mt-0.5`}>This file has {read.otherSheets} other sheet{read.otherSheets === 1 ? '' : 's'} with a table. We used the one with the most lines.</p>
          )}
        </div>
        <Button variant="secondary" onClick={onStartOver}>{startOverLabel}</Button>
      </div>

      {warnings.length > 0 && (
        <ul className={`rounded-lg border px-3 py-2 text-sm space-y-1 ${TONE.warning}`}>
          {warnings.map((w) => <li key={w}>{w}</li>)}
        </ul>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Field label={repQuote ? 'From' : 'Bidder'}><input className={INPUT} value={form.bidderName} onChange={setForm('bidderName')} placeholder="Company name" /></Field>
        {!repQuote && (
          <Field label="Price level">
            <select className={INPUT} value={form.bidderType} onChange={setForm('bidderType')}>
              <option value="UNKNOWN">Not stated</option>
              <option value="REP">Rep</option>
              <option value="DISTRIBUTOR">Distributor net</option>
              <option value="CONTRACTOR_NET">Contractor net</option>
            </select>
          </Field>
        )}
        <Field label="Quote number"><input className={INPUT} value={form.quoteNumber} onChange={setForm('quoteNumber')} /></Field>
        <Field label="Quote date"><input type="date" className={INPUT} value={form.quoteDate} onChange={setForm('quoteDate')} /></Field>
        {!repQuote && <Field label="Valid until"><input type="date" className={INPUT} value={form.expiresAt} onChange={setForm('expiresAt')} /></Field>}
        {!repQuote && <Field label="Tax rate stated (%)"><input className={INPUT} value={form.taxRateStated} onChange={setForm('taxRateStated')} placeholder="8.6" /></Field>}
      </div>

      <div>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <span className={LABEL}>Lines</span>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={onlyMarked} onChange={(e) => setOnlyMarked(e.target.checked)} />
            Show only lines that need a look
          </label>
        </div>
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="min-w-full">
            <thead className="bg-slate-50">
              <tr>
                <th className={TH}>Type</th>
                <th className={TH}>Description</th>
                <th className={TH}>Maker</th>
                <th className={TH}>Part number</th>
                <th className={`${TH} text-right`}>Qty</th>
                <th className={TH}>Unit</th>
                <th className={`${TH} text-right`}>Unit price</th>
                <th className={`${TH} text-right`}>Extended</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => {
                if (onlyMarked && !open(i)) return null;
                const rs = reasons[i];
                const isBlocking = rs.some((r) => r.blocking);
                const showReasons = rs.filter((r) => r.blocking || !l.ok);
                const tint = isBlocking ? 'bg-red-50/50' : open(i) ? 'bg-amber-50/50' : '';
                return (
                  <Fragment key={l._key}>
                    <tr className={`border-t border-slate-100 align-top ${tint}`}>
                      <td className={`${TD} min-w-[5rem]`}>
                        <input className={CELL} value={l.typeTagRaw || ''} onChange={(e) => setType(i, e.target.value)} aria-label="Type" />
                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400">
                          {l.sourceRow ? <span>Row {l.sourceRow}</span> : <span>Added by hand</span>}
                          {l.optionGroup && l.optionGroup !== 'BASE' && <span className="font-semibold text-slate-600">{l.optionGroup}</span>}
                          <button type="button" className="underline hover:text-red-700" onClick={() => removeLine(i)}>Remove</button>
                        </div>
                      </td>
                      <td className={`${TD} min-w-[11rem]`}>
                        <input className={CELL} value={l.description || ''} onChange={(e) => setLine(i, { description: e.target.value })} aria-label="Description" />
                        {l.section && <div className="mt-1 text-[11px] text-slate-400">{l.section}</div>}
                      </td>
                      <td className={`${TD} min-w-[7rem]`}><input className={CELL} value={l.mfr || ''} onChange={(e) => setLine(i, { mfr: e.target.value })} aria-label="Maker" /></td>
                      <td className={`${TD} min-w-[8rem]`}><input className={CELL} value={l.catalog || ''} onChange={(e) => setLine(i, { catalog: e.target.value })} aria-label="Part number" /></td>
                      <td className={`${TD} min-w-[5rem]`}><input className={`${CELL} text-right ${NUM}`} value={shown(l.qty)} onChange={(e) => setLine(i, { qty: e.target.value })} aria-label="Qty" /></td>
                      <td className={`${TD} min-w-[4.5rem]`}>
                        <select className={CELL} value={l.uom || 'EA'} onChange={(e) => setLine(i, { uom: e.target.value })} aria-label="Unit">
                          <option value="EA">EA</option><option value="LF">LF</option><option value="LOT">LOT</option>
                        </select>
                      </td>
                      <td className={`${TD} min-w-[6rem]`}><input className={`${CELL} text-right ${NUM}`} value={shown(l.unitPrice)} onChange={(e) => setLine(i, { unitPrice: e.target.value })} aria-label="Unit price" /></td>
                      <td className={`${TD} min-w-[6.5rem]`}><input className={`${CELL} text-right ${NUM}`} value={shown(l.extPrice)} onChange={(e) => setLine(i, { extPrice: e.target.value })} aria-label="Extended" /></td>
                    </tr>
                    {rs.length > 0 && (
                      <tr className={tint}>
                        <td colSpan={8} className="px-3 pb-2.5">
                          {showReasons.length === 0 ? (
                            <span className="text-xs text-green-700">You marked this right.</span>
                          ) : (
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                              {showReasons.map((r) => (
                                <span key={r.key} className={`flex items-center gap-1.5 text-xs ${r.blocking ? 'text-red-700' : 'text-amber-800'}`}>
                                  {r.blocking && <AlertMark size={14} label="Must fix before adding" />}
                                  {r.text}
                                </span>
                              ))}
                              {!isBlocking && <Button size="sm" variant="secondary" onClick={() => setLine(i, { ok: true })}>Looks right</Button>}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        <button type="button" className="mt-2 text-sm text-slate-500 underline hover:text-slate-700" onClick={addLine}>Add a line</button>
      </div>

      <div>
        <span className={LABEL}>Quote totals</span>
        <p className={`${HELPER} mt-0.5`}>As the quote states them. Leave a box empty when the quote does not show it.</p>
        <div className="mt-2 grid grid-cols-2 md:grid-cols-7 gap-3">
          {BUCKETS.map(([k, label]) => (
            <Field key={k} label={label}><input className={`${INPUT} ${NUM}`} value={totals[k] || ''} onChange={setTotal(k)} placeholder="$" /></Field>
          ))}
        </div>
      </div>

      {!repQuote && (
        <Field label="Terms and notes" hint="The quote's terms, exclusions and notes, as written.">
          <textarea className={`${INPUT} h-24`} value={form.notesRaw} onChange={setForm('notesRaw')} />
        </Field>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button loading={busy} disabled={blocking > 0} onClick={save}>{saveLabel}</Button>
        {blocking > 0 ? (
          <span className="text-sm text-red-700">{repQuote
            ? `${blocking} line${blocking === 1 ? ' has' : 's have'} no part number or type. Add one or remove the line before saving.`
            : `${blocking} line${blocking === 1 ? ' has' : 's have'} no fixture type. Type it or remove the line before adding this bid.`}</span>
        ) : openCount > 0 ? (
          <span className={HELPER}>{repQuote ? 'You can save it now.' : `You can add it now. The ${openCount} line${openCount === 1 ? '' : 's'} still marked will show as needing a look.`}</span>
        ) : null}
      </div>
      {error && !busy && <p className={`rounded-lg border px-3 py-2 text-sm ${TONE.danger}`}>{error}</p>}
    </div>
  );
}

function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className={LABEL}>{label}</span>
      <div className="mt-1">{children}</div>
      {hint && <p className={`${HELPER} mt-1`}>{hint}</p>}
    </label>
  );
}
