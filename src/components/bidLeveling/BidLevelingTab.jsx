'use client';
// Bid Leveling tab (Mike 10-18). Every bid on one grid by type tag, priced on
// the baseline's quantities, with "we suggest" from past peer review matrices.
// Internal staff only (the API checks). ILC lines carry CN, never DN.
import { useCallback, useEffect, useMemo, useState } from 'react';
import Button from '@/components/ui/Button';
import WidgetFrame, { WidgetEmpty, WidgetLoading, WidgetError } from '@/components/ui/WidgetFrame';
import { INPUT, LABEL, HELPER, TH, TD, NUM, BTN_SECONDARY, TONE } from '@/components/ui/tokens';
import { BID_FLAG_KEYS, FLAG_STATES, FLAG_STATE_LABELS, FLAG_GROUPS } from '@/lib/bidLeveling/bidFlags';
import { readMatrixSheets, newestLines } from '@/lib/matrixImport/readMatrix';
import { sageColumn, SAGE_GROUP } from '@/lib/bidLeveling/sageAlternates';
import QuoteReader from './QuoteReader';

const money = (n) => (n == null ? '' : `$${Math.round(n).toLocaleString('en-US')}`);
const money2 = (n) => (n == null ? '' : `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const qtyText = (c) => (c?.qty == null ? '' : `${Number(c.qty).toLocaleString('en-US')}${c.uom && c.uom !== 'EA' ? ` ${c.uom}` : ''}`);
const rowLabel = (r) => r.typeTag + (r.variant === 'P' ? ' pole' : r.variant ? ` ${r.variant}` : '');
const TOTAL_ROWS = [
  ['fixtures', 'Fixtures'], ['controls', 'Controls'], ['adders', 'Adders'], ['spares', 'Spares'],
  ['freight', 'Freight'], ['warehousing', 'Warehousing'], ['tax', 'Tax'],
];
const CONF_TONE = { HIGH: TONE.success, MEDIUM: TONE.warning, LOW: TONE.danger };
const STATE_TONE = {
  INCLUDED: 'bg-green-50 text-green-700 border-green-200',
  EXCLUDED: 'bg-red-50 text-red-700 border-red-200',
  EXPIRED: 'bg-red-50 text-red-700 border-red-200',
  NOT_STATED: 'bg-white text-slate-500 border-slate-200',
};
// Fields the server reads from a matrix line. DN columns and internal notes stay in the browser.
const MATRIX_KEEP = ['type', 'section', 'description', 'origMfr', 'origCatalog', 'propMfr', 'propCatalog', 'qty', 'uom', 'unitCn', 'totalCn', 'notes', 'notUsed'];

async function api(url, opts = {}) {
  const res = await fetch(url, { ...opts, headers: { 'Content-Type': 'application/json' } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `We could not reach the server (error ${res.status}), so nothing changed. Wait a minute and try again.`);
  return body;
}

export default function BidLevelingTab({ projectId }) {
  const base = `/api/projects/${projectId}/bid-leveling`;
  const [levelings, setLevelings] = useState(null);
  const [activeId, setActiveId] = useState(null);
  const [view, setView] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [adding, setAdding] = useState(false);

  const loadList = useCallback(async () => {
    try {
      const { levelings: ls } = await api(base);
      setLevelings(ls);
      setActiveId((cur) => cur || ls[0]?.id || null);
    } catch (e) { setError(e.message); }
  }, [base]);

  const loadView = useCallback(async () => {
    if (!activeId) { setView(null); return; }
    try { setView(await api(`${base}/${activeId}`)); setError(''); } catch (e) { setError(e.message); }
  }, [base, activeId]);

  useEffect(() => { loadList(); }, [loadList]);
  useEffect(() => { loadView(); }, [loadView]);

  const run = async (label, fn) => {
    setBusy(label); setError('');
    try { await fn(); await loadView(); } catch (e) { setError(e.message); } finally { setBusy(''); }
  };

  const createLeveling = () => run('create', async () => {
    const { leveling } = await api(base, { method: 'POST', body: JSON.stringify({}) });
    await loadList();
    setActiveId(leveling.id);
  });
  const patchLeveling = (data) => run('settings', () => api(`${base}/${activeId}`, { method: 'PATCH', body: JSON.stringify(data) }));
  const patchBid = (bidId, data) => run('bid', () => api(`${base}/${activeId}/bids/${bidId}`, { method: 'PATCH', body: JSON.stringify(data) }));
  const addBid = (payload) => run('add', async () => {
    await api(`${base}/${activeId}/bids`, { method: 'POST', body: JSON.stringify(payload) });
    setAdding(false);
  });

  if (levelings === null) return error ? <WidgetError>{error}</WidgetError> : <WidgetLoading />;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">Bid Leveling</h2>
          <p className="text-sm text-slate-500 mt-0.5">Every quote on one grid by type, priced on the same quantities, with what we would suggest.</p>
        </div>
        <div className="flex items-center gap-2">
          {levelings.length > 1 && (
            <select className={`${INPUT} w-64`} value={activeId || ''} onChange={(e) => setActiveId(e.target.value)}>
              {levelings.map((l) => <option key={l.id} value={l.id}>{l.name} ({l._count.bids})</option>)}
            </select>
          )}
          <Button variant={levelings.length ? 'secondary' : 'primary'} onClick={createLeveling} loading={busy === 'create'}>New leveling</Button>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {!levelings.length ? (
        <WidgetFrame><WidgetEmpty>No leveling yet. Start one, then add our bid and each competitor quote.</WidgetEmpty></WidgetFrame>
      ) : !view ? <WidgetLoading /> : (
        <>
          <AddBidBar onAdd={addBid} busy={busy === 'add'} adding={adding} setAdding={setAdding} error={error} setError={setError} />
          {view.bids.length === 0 ? (
            <WidgetFrame><WidgetEmpty>No bids yet. Add our bid from Peer Review or a matrix file, then add each competitor quote.</WidgetEmpty></WidgetFrame>
          ) : (
            <>
              <SettingsBar view={view} onPatch={patchLeveling} />
              <TotalsCard view={view} exportUrl={`${base}/${view.leveling.id}/export`} />
              <MatrixCard view={view} />
              <PackagesCard view={view} />
              <FlagsCard view={view} onPatch={patchBid} />
              <ClarificationsCard view={view} />
              <BidsCard view={view} onPatch={patchBid} />
            </>
          )}
        </>
      )}
    </div>
  );
}

function AddBidBar({ onAdd, busy, adding, setAdding, error, setError }) {
  const onMatrixFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
      const tables = readMatrixSheets(wb.SheetNames.map((name) => ({
        name, rows: XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '', raw: true }),
      })));
      const lines = newestLines(tables).map((l) => Object.fromEntries(MATRIX_KEEP.map((k) => [k, l[k] ?? null])));
      if (!lines.length) { setError('We found no fixture table in that file, so nothing was added. Check it is a peer review matrix.'); return; }
      onAdd({ source: 'MATRIX', fileName: file.name, lines });
    } catch { setError('We could not open that file, so nothing was added. Save it again as an Excel file (.xlsx) and pick it once more.'); }
  };

  return (
    <WidgetFrame title="Add a bid" sub="Our bid comes from this project's Peer Review rows or a peer review matrix file. Competitor quotes are read from Excel or pasted, then you check what we read.">
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" loading={busy} onClick={() => onAdd({ source: 'PEER_REVIEW' })}>Our bid from Peer Review</Button>
        <label className={`${BTN_SECONDARY} cursor-pointer`}>
          Our bid from a matrix file
          <input type="file" accept=".xlsx,.xls" className="hidden" onChange={onMatrixFile} />
        </label>
        <Button onClick={() => setAdding(!adding)}>{adding ? 'Close' : 'Competitor quote'}</Button>
      </div>
      {adding && <QuoteReader onAdd={onAdd} busy={busy} error={error} />}
    </WidgetFrame>
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

function SettingsBar({ view, onPatch }) {
  const l = view.leveling;
  const [tax, setTax] = useState(l.taxRate != null ? String(Math.round(l.taxRate * 10000) / 100) : '');
  useEffect(() => { setTax(l.taxRate != null ? String(Math.round(l.taxRate * 10000) / 100) : ''); }, [l.taxRate]);
  const MODE = [['RATIO', 'Scale to fixtures'], ['AS_QUOTED', 'As quoted'], ['FLAT', 'Same flat amount']];
  return (
    <WidgetFrame title="How bids are compared" sub="Every bid is priced on the baseline's quantities. Freight and warehousing scale with fixtures unless set otherwise.">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Field label="Baseline">
          <select className={INPUT} value={view.matrix?.baselineBidId || ''} onChange={(e) => onPatch({ baselineBidId: e.target.value })}>
            {view.bids.map((b) => <option key={b.id} value={b.id}>{b.bidderName}</option>)}
          </select>
        </Field>
        <Field label="Freight">
          <select className={INPUT} value={l.freightMode} onChange={(e) => onPatch({ freightMode: e.target.value })}>
            {MODE.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
          </select>
        </Field>
        <Field label="Warehousing">
          <select className={INPUT} value={l.whMode} onChange={(e) => onPatch({ whMode: e.target.value })}>
            {MODE.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
          </select>
        </Field>
        <Field label="Tax rate (%)">
          <input className={INPUT} value={tax} onChange={(e) => setTax(e.target.value)} onBlur={() => onPatch({ taxRate: tax })} placeholder="Each bid's own" />
        </Field>
        <Field label="Tax on">
          <select className={INPUT} value={l.taxBase} onChange={(e) => onPatch({ taxBase: e.target.value })}>
            <option value="FIXTURES_CONTROLS">Fixtures and controls</option>
            <option value="FIXTURES">Fixtures only</option>
          </select>
        </Field>
        {l.freightMode === 'FLAT' && (
          <Field label="Flat freight"><input className={INPUT} defaultValue={l.freightFlat ?? ''} onBlur={(e) => onPatch({ freightFlat: e.target.value })} /></Field>
        )}
        {l.whMode === 'FLAT' && (
          <Field label="Flat warehousing"><input className={INPUT} defaultValue={l.whFlat ?? ''} onBlur={(e) => onPatch({ whFlat: e.target.value })} /></Field>
        )}
      </div>
    </WidgetFrame>
  );
}

const asQuoted = (bid) => {
  const g = bid.totals.filter((t) => t.bucket === 'GRAND').reduce((s, t) => s + t.amount, 0);
  return g || bid.totals.filter((t) => t.bucket !== 'GRAND').reduce((s, t) => s + t.amount, 0) || null;
};

function TotalsCard({ view, exportUrl }) {
  const { bids, normalized } = view;
  const per = normalized?.perBid || {};
  const lowest = Math.min(...bids.map((b) => per[b.id]?.grand ?? Infinity));
  return (
    <WidgetFrame title="Leveled totals" sub="Same quantities for every bid. Missing types are filled at the other bids' price (a placeholder), so confidence drops as placeholders grow."
      actions={<a href={exportUrl} download className={BTN_SECONDARY}>Download Excel</a>}
      flush
    >
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-slate-50"><tr><th className={TH}></th>{bids.map((b) => <th key={b.id} className={`${TH} text-right`}>{b.bidderName}</th>)}</tr></thead>
          <tbody className="divide-y divide-slate-100">
            <tr><td className={TD}>As quoted</td>{bids.map((b) => <td key={b.id} className={`${TD} ${NUM} text-right text-slate-500`}>{money(asQuoted(b))}</td>)}</tr>
            {TOTAL_ROWS.map(([k, label]) => (
              <tr key={k}>
                <td className={TD}>{label}{k === 'fixtures' && <span className={`${HELPER} block`}>of which placeholders</span>}</td>
                {bids.map((b) => {
                  const p = per[b.id];
                  return (
                    <td key={b.id} className={`${TD} ${NUM} text-right`}>
                      {money(p?.[k])}
                      {k === 'fixtures' && p?.fixturesPlaceholder ? <span className="block text-xs text-amber-600">{money(p.fixturesPlaceholder)}</span> : null}
                      {k === 'fixtures' && p?.fixturesOwnQty ? <span className="block text-xs text-amber-600" title="Our bid has no qty for these types, so this bidder's own qty is used">{money(p.fixturesOwnQty)} at their qty</span> : null}
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr className="bg-slate-50 font-semibold">
              <td className={TD}>Leveled total</td>
              {bids.map((b) => (
                <td key={b.id} className={`${TD} ${NUM} text-right ${per[b.id]?.grand === lowest ? 'text-green-700' : ''}`}>{money(per[b.id]?.grand)}</td>
              ))}
            </tr>
            <tr>
              <td className={TD}>Confidence</td>
              {bids.map((b) => {
                const c = per[b.id]?.confidence;
                return (
                  <td key={b.id} className={`${TD} text-right`}>
                    {c && <span className={`inline-block rounded-full border px-2 py-0.5 text-xs font-semibold ${CONF_TONE[c.level]}`}>{c.level === 'HIGH' ? 'High' : c.level === 'MEDIUM' ? 'Medium' : 'Low'}</span>}
                    {c && <span className={`${HELPER} block mt-0.5`}>{c.hasUnitPricing ? `${Math.round((c.placeholderShare || 0) * 100)}% placeholder, ` : 'No unit pricing, '}{c.notStatedFlags} not stated</span>}
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>
    </WidgetFrame>
  );
}

function MatrixCard({ view }) {
  const { bids, matrix, suggestions } = view;
  const [onlyGaps, setOnlyGaps] = useState(false);
  const gapKeys = useMemo(() => new Set([...matrix.scopeGaps.map((g) => g.key), ...matrix.qtyVariances.map((v) => v.key)]), [matrix]);
  const rows = onlyGaps ? matrix.types.filter((r) => gapKeys.has(r.key)) : matrix.types;
  const varianceFor = (key, bidId) => matrix.qtyVariances.find((v) => v.key === key && v.bidId === bidId);
  const sage = useMemo(() => sageColumn(view), [view]);
  return (
    <WidgetFrame
      title={`By type (${matrix.types.length})`}
      sub={`${matrix.scopeGaps.length} scope gaps, ${matrix.qtyVariances.length} quantity differences. Red = missing on that bid, amber = quantity differs from the baseline.`}
      actions={<Button size="sm" variant="secondary" onClick={() => setOnlyGaps(!onlyGaps)}>{onlyGaps ? 'Show all types' : 'Only gaps and differences'}</Button>}
      flush
    >
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className={TH}>Type</th>
              <th className={TH}>Spec asked for</th>
              <th className={TH}>Sage alternate</th>
              {bids.map((b) => <th key={b.id} className={TH}>{b.bidderName}</th>)}
              <th className={TH}>We suggest</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => {
              const s = suggestions?.[r.key];
              return (
                <tr key={r.key} className="align-top">
                  <td className={`${TD} font-semibold whitespace-nowrap`}>{rowLabel(r)}</td>
                  <td className={`${TD} text-xs`}>
                    {s?.spec ? <>{s.spec.mfr} <span className="text-slate-500">{s.spec.catalog}</span>{s.spec.fromOffer && <span className={`${HELPER} block`}>from a bid, not the drawings</span>}</> : <span className="text-slate-400">Not known</span>}
                  </td>
                  <td className={`${TD} text-xs`}>
                    {sage[r.key]?.name
                      ? <><span className="font-semibold text-slate-800">{sage[r.key].name}</span><span className={`${HELPER} block`}>{SAGE_GROUP[sage[r.key].group]}</span></>
                      : <span className="text-slate-400">{sage[r.key]?.why || ''}</span>}
                  </td>
                  {bids.map((b) => {
                    const c = r.cells[b.id];
                    const inHead = c?.specBasis === 'IN_HEAD';
                    const missing = !inHead && (!c || !(c.qty > 0));
                    const v = varianceFor(r.key, b.id);
                    const offered = c && (c.mfr || c.catalog);
                    const swapped = offered && c.requestedCatalog && c.catalog && c.requestedCatalog !== c.catalog;
                    return (
                      <td key={b.id} className={`${TD} text-xs ${missing ? 'bg-red-50' : v ? 'bg-amber-50' : ''}`}>
                        {inHead ? (
                          <span className="text-slate-500">In fixture price</span>
                        ) : missing ? (
                          <span className="text-red-600">{c?.specBasis === 'NOT_USED' ? 'Not used' : c?.specBasis === 'NO_QUOTE' ? 'No quote' : c ? 'Zero' : 'Missing'}</span>
                        ) : (
                          <>
                            <span className={`${NUM} font-semibold text-slate-800`}>{qtyText(c)}</span>
                            {c.unitPrice != null && <span className={`${NUM} text-slate-500`}> at {money2(c.unitPrice)}</span>}
                            {c.extPrice != null && <span className={`${NUM} block text-slate-700`}>{money(c.extPrice)}</span>}
                            {offered && <span className="block text-slate-500">{c.mfr} {c.catalog}</span>}
                            {swapped && <span className="block text-orange-600">Substitute</span>}
                            {v && <span className="block text-amber-700">{v.delta > 0 ? '+' : ''}{v.delta} vs baseline</span>}
                          </>
                        )}
                      </td>
                    );
                  })}
                  <td className={`${TD} text-xs`}>
                    {s?.options?.length ? s.options.map((o, i) => (
                      <span key={i} className="block" title={o.exampleCatalog || ''}>
                        <span className={i === 0 ? 'font-semibold text-slate-800' : 'text-slate-600'}>{o.kept ? 'Keep the spec' : o.placeholder ? 'Placeholder' : `${o.propMfr || ''} ${o.familyLabel || o.propFamily || ''}`}</span>
                        <span className="text-slate-400"> {o.jobs} job{o.jobs === 1 ? '' : 's'}{o.medianUnitCn != null ? `, ${money2(o.medianUnitCn)} CN` : ''}</span>
                      </span>
                    )) : <span className="text-slate-400">{s ? 'No past match' : ''}</span>}
                    {s?.match && s.match !== 'NONE' && <span className={`${HELPER} block`}>{MATCH_TEXT[s.match]}</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </WidgetFrame>
  );
}

const MATCH_TEXT = {
  FAMILY: 'Same spec seen before',
  BRAND_CATEGORY: 'Same brand and kind of fixture',
  CATEGORY: 'Same kind of fixture',
};

function PackagesCard({ view }) {
  const rows = view.bids.flatMap((b) => (view.packages?.[b.id] || []).map((p) => ({ ...p, bid: b })));
  if (!rows.length) return null;
  return (
    <WidgetFrame title="VE and alternate packages" sub="Priced on their own. Savings = what the base bid pays for the same types, less the package." flush>
      <table className="w-full">
        <thead className="bg-slate-50"><tr>{['Bidder', 'Package', 'Types', 'Package total', 'Base for same types', 'Savings'].map((h) => <th key={h} className={TH}>{h}</th>)}</tr></thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((p) => (
            <tr key={`${p.bid.id}-${p.group}`}>
              <td className={TD}>{p.bid.bidderName}</td>
              <td className={TD}>{p.group === 'VE' ? 'Value engineering' : 'Alternate'}</td>
              <td className={`${TD} text-xs`}>{p.types.join(', ')}</td>
              <td className={`${TD} ${NUM}`}>{money(p.total)}</td>
              <td className={`${TD} ${NUM}`}>{money(p.baseSameTypes)}</td>
              <td className={`${TD} ${NUM} ${p.savings > 0 ? 'text-green-700' : 'text-red-600'}`}>{money(p.savings)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </WidgetFrame>
  );
}

function FlagsCard({ view, onPatch }) {
  const { bids, flags } = view;
  return (
    <WidgetFrame title="What each quote includes" sub="Set from the quote's own words. Not stated items become questions to the bidder." flush>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-slate-50"><tr><th className={TH}></th>{bids.map((b) => <th key={b.id} className={TH}>{b.bidderName}</th>)}</tr></thead>
          <tbody className="divide-y divide-slate-100">
            {FLAG_GROUPS.map((g) => (
              <FlagGroup key={g.key} group={g} bids={bids} flags={flags} onPatch={onPatch} />
            ))}
          </tbody>
        </table>
      </div>
    </WidgetFrame>
  );
}

function FlagGroup({ group, bids, flags, onPatch }) {
  const keys = BID_FLAG_KEYS.filter((f) => f.group === group.key);
  return (
    <>
      <tr className="bg-slate-50/60"><td colSpan={bids.length + 1} className={`${TD} ${LABEL}`}>{group.label}</td></tr>
      {keys.map((f) => (
        <tr key={f.key}>
          <td className={`${TD} text-xs`}>{f.label}</td>
          {bids.map((b) => {
            const cur = flags?.[b.id]?.[f.key];
            const state = cur?.state || 'NOT_STATED';
            return (
              <td key={b.id} className="px-3 py-1.5">
                <select
                  title={cur?.evidence || cur?.value || ''}
                  className={`w-full rounded-md border px-2 py-1 text-xs ${STATE_TONE[state] || 'bg-amber-50 text-amber-700 border-amber-200'}`}
                  value={state}
                  onChange={(e) => onPatch(b.id, { flags: [{ key: f.key, state: e.target.value, value: cur?.value ?? null }] })}
                >
                  {FLAG_STATES.map((s) => <option key={s} value={s}>{FLAG_STATE_LABELS[s]}</option>)}
                </select>
              </td>
            );
          })}
        </tr>
      ))}
    </>
  );
}

function ClarificationsCard({ view }) {
  const [copied, setCopied] = useState('');
  const others = view.bids.filter((b) => (view.clarifications?.[b.id] || []).length);
  if (!others.length) return null;
  const copy = async (b) => {
    const text = `${b.bidderName}\n\n${view.clarifications[b.id].map((q, i) => `${i + 1}. ${q}`).join('\n')}`;
    try { await navigator.clipboard.writeText(text); setCopied(b.id); setTimeout(() => setCopied(''), 1500); } catch { /* clipboard blocked */ }
  };
  return (
    <WidgetFrame title="Questions for each bidder" sub="Most important first. Copy into an email.">
      <div className="grid md:grid-cols-2 gap-4">
        {others.map((b) => (
          <div key={b.id} className="rounded-lg border border-slate-200 p-4">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold text-slate-800">{b.bidderName}</h4>
              <Button size="sm" variant="secondary" onClick={() => copy(b)}>{copied === b.id ? 'Copied' : 'Copy'}</Button>
            </div>
            <ol className="list-decimal pl-5 space-y-1 text-sm text-slate-700">
              {view.clarifications[b.id].map((q, i) => <li key={i}>{q}</li>)}
            </ol>
          </div>
        ))}
      </div>
    </WidgetFrame>
  );
}

function BidsCard({ view, onPatch }) {
  return (
    <WidgetFrame title="Bids" flush>
      <table className="w-full">
        <thead className="bg-slate-50"><tr>{['Bidder', 'Source', 'Lines', 'Quote date', 'Valid until', ''].map((h) => <th key={h} className={TH}>{h}</th>)}</tr></thead>
        <tbody className="divide-y divide-slate-100">
          {view.bids.map((b) => (
            <tr key={b.id}>
              <td className={`${TD} font-semibold`}>{b.bidderName}{b.isIlc && <span className="ml-2 text-xs text-orange-600">Ours</span>}</td>
              <td className={`${TD} text-xs`}>{b.sourceFileName || { ILC_MATRIX: 'Peer Review', MANUAL: 'Pasted', XLSX: 'Matrix file', PDF: 'PDF' }[b.sourceKind]}</td>
              <td className={`${TD} ${NUM}`}>{b.lines.length}</td>
              <td className={TD}>{b.quoteDate ? String(b.quoteDate).slice(0, 10) : ''}</td>
              <td className={TD}>{b.expiresAt ? String(b.expiresAt).slice(0, 10) : ''}</td>
              <td className={`${TD} text-right`}>
                <Button size="sm" variant="ghost" onClick={() => { if (window.confirm(`Archive ${b.bidderName}? It leaves this leveling but is kept.`)) onPatch(b.id, { archived: true }); }}>Archive</Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </WidgetFrame>
  );
}
