'use client';
import { useEffect, useCallback, useState } from 'react';
import Link from 'next/link';
import Button from '@/components/ui/Button';
import AlertMark from '@/components/ui/AlertMark';
import SectionTabs from '@/components/ui/SectionTabs';
import WidgetFrame, { WidgetLoading, WidgetError, WidgetEmpty } from '@/components/ui/WidgetFrame';
import { FilterToolbar, FilterPanel, SearchBox, countFilters } from '@/components/ui/FilterPanel';
import SortHeader, { sortRows } from '@/components/ui/SortHeader';
import { CARD, TH, TD } from '@/components/ui/tokens';
import useUrlView from '@/lib/useUrlView';
import { LINE_STATUS, needByFrom, roundLabel, showDate } from '@/lib/rfq/format';
import { rfqApi, money } from './rfqApi';
import SentRfqs from './SentRfqs';
import RfqReceived from './RfqReceived';
import RfqReview, { useRfqQuotes, reviewCount, quotesIn, isReplaced } from './RfqReview';
import SentNotice from './SentNotice';
import RfqCompare from './RfqCompare';
import RepSelect, { SELECT } from './RepSelect';
import { BOX, usePicks } from './picks';

// Project > RFQs (Mike 10-29, 0144; tabs 11-2). The bid matrix lines grouped by
// the rep who quotes them. One press sends a group: the RFQ number is made, the
// lines go to Sent, and the email and PDF are ready. Quotes come back on the
// Quotes tab, and every price waits on Review prices for a person's OK (0164).

const STATUS_TONE = {
  [LINE_STATUS.DRAFT]: 'bg-slate-100 text-slate-700',
  [LINE_STATUS.SENT]: 'bg-amber-100 text-amber-800',
  [LINE_STATUS.RECEIVED]: 'bg-emerald-100 text-emerald-800',
};
const TABS = ['review', 'send', 'sent', 'quotes', 'lines'];

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

// One rep's lines. With onToggle the lines fold away until the row is opened.
export function GroupCard({ projectId, group, onState, onSent, setErr, coId, open = true, onToggle }) {
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
    <div className={onToggle ? 'px-4 py-3' : 'border border-slate-200 rounded-xl p-4'}>
      <div className="flex flex-wrap items-start gap-3">
        {onToggle && (
          <button type="button" onClick={onToggle} aria-expanded={open} aria-label={`${open ? 'Hide' : 'Show'} lines for ${group.toName}`} className="text-slate-400 hover:text-slate-700 w-4 pt-0.5">
            {open ? '▾' : '▸'}
          </button>
        )}
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {group.problems.length > 0 && <AlertMark label="Not ready to send" />}
            {group.kind === 'REP'
              ? <Link href={`/sales-reps/${group.salesRepId}`} className="font-semibold text-slate-900 hover:text-orange-600">{group.toName}</Link>
              : <span className="font-semibold text-slate-900">{group.toName}{group.kind === 'DIRECT' ? ' (buy direct)' : ''}</span>}
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            {group.quoteEmails.length ? `To ${group.quoteEmails.join(', ')}` : 'No email yet'} ·{' '}
            {onToggle
              ? <button type="button" onClick={onToggle} className="hover:text-orange-600">{group.lines.length} line{group.lines.length === 1 ? '' : 's'}, {group.draftCount} not sent</button>
              : <>{group.lines.length} line{group.lines.length === 1 ? '' : 's'}, {group.draftCount} not sent</>}
          </p>
          {group.lastSent && (
            <p className="text-xs text-slate-500 mt-0.5">
              Last sent {group.lastSent.label}{group.lastSent.round ? ` in ${group.lastSent.round}` : ''}. For a new version, use Send revision on the Sent tab.
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
      {open && (
        <>
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
        </>
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
  const [starting, setStarting] = useState(false);
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
    if (await post({ action: 'round', name }, 'The new round')) { setName(''); setStarting(false); }
  }
  async function saveName() {
    if (await post({ action: 'roundName', roundId: newest.id, name: rename }, 'The round name')) setRename(null);
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
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
      {starting
        ? (
          <span className="flex flex-wrap items-center gap-2">
            <input className={`${SELECT} w-40`} value={name} onChange={(e) => setName(e.target.value)} placeholder="Name, such as GMP" aria-label="New round name" autoFocus />
            <Button size="sm" variant="secondary" disabled={busy} loading={busy} onClick={start}>Start</Button>
            <Button size="sm" variant="ghost" onClick={() => setStarting(false)}>Cancel</Button>
          </span>
        )
        : <Button size="sm" variant="ghost" onClick={() => setStarting(true)}>Start a new round</Button>}
    </div>
  );
}

function ToSend({ projectId, state, setState, onSent, err, setErr }) {
  const [openKeys, setOpenKeys] = useState(() => new Set());
  const [showDone, setShowDone] = useState(false);
  const [sendingAll, setSendingAll] = useState(false);
  const waiting = state.groups.filter((g) => g.draftCount > 0);
  const done = state.groups.filter((g) => g.draftCount === 0);
  const readyGroups = waiting.filter((g) => !g.problems.length);
  const noMfr = state.lines.filter((l) => !l.status).length;
  const toggle = (k) => setOpenKeys((s) => { const x = new Set(s); if (x.has(k)) x.delete(k); else x.add(k); return x; });

  // Sends each ready group in turn and stops on the first problem; the ones
  // already sent keep their numbers.
  async function sendAll() {
    setSendingAll(true); setErr('');
    for (const g of readyGroups) {
      const d = await rfqApi(`/api/projects/${projectId}/rfqs`, { method: 'POST', body: { action: 'send', groupKey: g.key }, what: `The RFQ to ${g.toName}` });
      if (d.error) { setErr(`${d.error} The RFQs before it were sent.`); break; }
      onSent(d);
    }
    setSendingAll(false);
  }

  const card = (g) => (
    <GroupCard key={g.key} projectId={projectId} group={g} onState={setState} onSent={onSent} setErr={setErr}
      open={openKeys.has(g.key)} onToggle={() => toggle(g.key)} />
  );

  return (
    <WidgetFrame title="To send" sub={`${readyGroups.length} rep${readyGroups.length === 1 ? '' : 's'} ready${waiting.length > readyGroups.length ? `, ${waiting.length - readyGroups.length} need a look` : ''}`} flush
      actions={readyGroups.length > 1 && <Button size="sm" disabled={sendingAll} loading={sendingAll} onClick={sendAll}>Send all ready ({readyGroups.length})</Button>}>
      <p className="px-4 pt-3 text-sm text-slate-600">
        One row per rep with lines not sent yet. Open a row to see its lines, tick some to send only those, or add notes. Need by is {showDate(needByFrom())} for an RFQ sent now.
        {noMfr > 0 && ` ${noMfr} matrix line${noMfr === 1 ? ' has' : 's have'} no manufacturer, so ${noMfr === 1 ? 'it is' : 'they are'} left off.`}
      </p>
      {err && <p className="text-sm text-red-600 mx-4 mt-2">{err}</p>}
      {!state.groups.length && <div className="p-4"><WidgetEmpty>No matrix lines have a manufacturer yet. Fill the bid matrix first.</WidgetEmpty></div>}
      {state.groups.length > 0 && !waiting.length && <div className="p-4"><WidgetEmpty>Every line has gone out.</WidgetEmpty></div>}
      <div className="mt-2 divide-y divide-slate-100 border-t border-slate-100">
        {waiting.map(card)}
        {showDone && done.map(card)}
      </div>
      {done.length > 0 && (
        <label className="flex items-center gap-2 text-sm text-slate-600 px-4 py-3 border-t border-slate-100">
          <input type="checkbox" className={BOX} checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />
          Show reps with everything sent ({done.length})
        </label>
      )}
    </WidgetFrame>
  );
}

const LINE_FIELDS = [
  { key: 'lstatus', label: 'Status', kind: 'pick' },
  { key: 'lrep', label: 'Rep', kind: 'pick' },
  { key: 'lmfr', label: 'Manufacturer', kind: 'pick' },
  { key: 'lround', label: 'Round', kind: 'pick' },
];
const LINE_VIEW = [...LINE_FIELDS, { key: 'lq', label: 'Search', kind: 'text' }];

function AllLines({ projectId, state, setState, err, setErr }) {
  const [filterOpen, setFilterOpen] = useState(false);
  const { filters, setFilter, clearFilters, sort, toggleSort } = useUrlView({ fields: LINE_VIEW });
  const roundOf = (l) => roundLabel(state.rounds?.find((r) => r.number === state.rfqs.find((x) => x.number === l.rfqNumber)?.round)) || '';
  const repOf = (l) => l.repName || '';
  const uniq = (xs) => [...new Set(xs.filter(Boolean))].sort();
  const choices = {
    lstatus: [[LINE_STATUS.DRAFT, 'Draft'], [LINE_STATUS.SENT, 'Sent'], [LINE_STATUS.RECEIVED, 'Received'], ['none', 'No manufacturer']],
    lrep: uniq(state.lines.map(repOf)),
    lmfr: uniq(state.lines.map((l) => l.manufacturer)),
    lround: uniq(state.lines.map(roundOf)),
  };
  const q = String(filters.lq || '').trim().toLowerCase();
  const filtered = state.lines.filter((l) => (!filters.lstatus || (filters.lstatus === 'none' ? !l.status : l.status === filters.lstatus))
    && (!filters.lrep || repOf(l) === filters.lrep)
    && (!filters.lmfr || l.manufacturer === filters.lmfr)
    && (!filters.lround || roundOf(l) === filters.lround)
    && (!q || [l.typeCode, l.manufacturer, l.partNumber, l.description, repOf(l), l.rfqLabel].some((v) => String(v || '').toLowerCase().includes(q))));
  const rows = sortRows(filtered, sort, {
    type: (l) => l.typeCode, mfr: (l) => l.manufacturer, part: (l) => l.partNumber, qty: (l) => (l.qty == null ? null : Number(l.qty)),
    rep: repOf, status: (l) => l.status, rfq: (l) => l.rfqLabel, dn: (l) => (l.dnPrice == null ? null : Number(l.dnPrice)),
  });
  const picks = usePicks(rows.map((l) => l.id));
  const chosen = rows.filter((l) => picks.has(l.id));
  const mfrIds = [...new Set(chosen.map((l) => l.manufacturerId).filter(Boolean))];
  const left = chosen.filter((l) => !l.manufacturerId).length;
  const head = (label, field, align) => <SortHeader label={label} field={field} sort={sort} onSort={toggleSort} align={align} />;

  return (
    <WidgetFrame title="All lines" sub="Rep and RFQ status for every matrix line, kept up to date by the app." flush>
      <div className="px-4 pt-3">
        <FilterToolbar count={countFilters(filters, LINE_FIELDS)} open={filterOpen} onToggle={() => setFilterOpen((o) => !o)} onClear={clearFilters}
          shown={rows.length} total={state.lines.length} noun="lines"
          right={<SearchBox value={filters.lq} onChange={(v) => setFilter('lq', v)} placeholder="Search type, part, rep" />} />
        <FilterPanel open={filterOpen} fields={LINE_FIELDS} filters={filters} choices={choices} onChange={setFilter} />
      </div>
      {chosen.length > 0 && (
        <div className="mx-4 mt-3 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-slate-700 flex flex-wrap items-center gap-3">
          <span className="font-semibold tabular-nums">{chosen.length} picked</span>
          <RepSelect projectId={projectId} manufacturerIds={mfrIds} placeholder={`Change rep for ${mfrIds.length} manufacturer${mfrIds.length === 1 ? '' : 's'}…`}
            onState={(d) => { setState(d); picks.clear(); }} setErr={setErr} />
          {left > 0 && <span className="text-xs text-slate-500">{left} with no manufacturer in the app {left === 1 ? 'is' : 'are'} skipped.</span>}
          <button type="button" onClick={picks.clear} className="ml-auto text-xs text-slate-500 hover:text-orange-600">Clear</button>
        </div>
      )}
      {err && <p className="text-sm text-red-600 mx-4 mt-2">{err}</p>}
      <div className="overflow-x-auto mt-3">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className={`${TH} w-8`}><input type="checkbox" className={BOX} checked={picks.all} onChange={picks.toggleAll} aria-label="Select all lines" /></th>
              {head('Type', 'type')}{head('Manufacturer', 'mfr')}{head('Part', 'part')}{head('Qty', 'qty', 'right')}
              {head('Rep', 'rep')}{head('Status', 'status')}{head('RFQ', 'rfq')}{head('Rep price', 'dn', 'right')}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((l) => (
              <tr key={l.id} className={picks.has(l.id) ? 'bg-orange-50' : ''}>
                <td className={TD}><input type="checkbox" className={BOX} checked={picks.has(l.id)} onChange={() => picks.toggle(l.id)} aria-label={`Pick line ${l.typeCode || l.description || ''}`} /></td>
                <td className={`${TD} font-mono`}>{l.typeCode}</td>
                <td className={TD}>{l.manufacturerId ? <Link href={`/manufacturers/${l.manufacturerId}`} className="hover:text-orange-600">{l.manufacturer}</Link> : l.manufacturer}</td>
                <td className={`${TD} text-slate-600`}>{l.partNumber}</td>
                <td className={`${TD} text-right tabular-nums`}>{l.qty ?? ''}</td>
                <td className={TD} title={l.how}>{l.repName || <span className="text-slate-400">{l.how}</span>}</td>
                <td className={TD}><StatusChip status={l.status} /></td>
                <td className={`${TD} font-mono text-slate-600`}>{l.rfqLabel || ''}</td>
                <td className={`${TD} text-right tabular-nums`}>
                  {l.dnPrice != null && <>{money(l.dnPrice)}{!l.approved && <div className="text-xs text-amber-700">Waiting for an OK</div>}</>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length && <div className="p-4"><WidgetEmpty>{state.lines.length ? 'No lines match these filters.' : 'No matrix lines yet.'}</WidgetEmpty></div>}
    </WidgetFrame>
  );
}

export default function RfqTab({ projectId }) {
  const [state, setState] = useState(null);
  const [err, setErr] = useState('');
  const [loadErr, setLoadErr] = useState('');
  const [sent, setSent] = useState([]); // [{ rfq, email }] from this visit
  const [tab, setTabState] = useState(null);
  const [compareOpen, setCompareOpen] = useState(false);
  const quotes = useRfqQuotes(projectId);

  const load = useCallback(async () => {
    const d = await rfqApi(`/api/projects/${projectId}/rfqs`, { what: 'Loading the RFQs' });
    if (d.error) setLoadErr(d.error); else { setState(d); setLoadErr(''); }
  }, [projectId]);
  useEffect(() => { load(); }, [load]);

  // The open tab lives in the URL (?rfq=), so a reload or a shared link opens it.
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('rfq');
    if (TABS.includes(t)) setTabState(t);
  }, []);
  function setTab(t) {
    setTabState(t); setErr('');
    const p = new URLSearchParams(window.location.search);
    p.set('rfq', t);
    window.history.replaceState(window.history.state, '', `${window.location.pathname}?${p}${window.location.hash || ''}`);
  }
  // With no tab asked for, open where the work is: prices to OK, then lines to send.
  const quotesReady = !!(quotes.data || quotes.loadErr);
  useEffect(() => {
    if (tab || !state || !quotesReady) return;
    setTabState(reviewCount(state, quotes.data) ? 'review' : state.lines.some((l) => l.status === LINE_STATUS.DRAFT) ? 'send' : 'quotes');
  }, [tab, state, quotesReady, quotes.data]);

  const onSent = (d) => { setState(d.state); setSent((s) => [{ rfq: d.rfq, email: d.email }, ...s]); };
  const reloadAll = () => { load(); quotes.load(); };

  async function setOffice(officeId) {
    setErr('');
    const d = await rfqApi(`/api/projects/${projectId}/rfqs`, { method: 'POST', body: { action: 'office', officeId: officeId || null }, what: 'The office' });
    if (d.error) setErr(d.error); else setState(d);
  }

  // A failed reload keeps the page, so a quote drop in progress is not wiped.
  if (loadErr && !state) return <WidgetFrame title="RFQs"><WidgetError>{loadErr}</WidgetError></WidgetFrame>;
  if (!state) return <WidgetFrame title="RFQs"><WidgetLoading /></WidgetFrame>;

  const review = reviewCount(state, quotes.data);
  const drafts = state.lines.filter((l) => l.status === LINE_STATUS.DRAFT).length;
  const families = state.rfqs.filter((r) => r.isLatest);
  const overdue = families.filter((r) => r.overdue).length;
  const quoteCount = quotesIn(quotes.data, state.rfqs).filter((q) => !isReplaced(q)).length;
  const tabs = [
    { key: 'review', label: <>{review > 0 && <AlertMark label="Prices waiting for an OK" size={14} />}Review prices ({review})</> },
    { key: 'send', label: `To send (${drafts})` },
    { key: 'sent', label: <>{overdue > 0 && <AlertMark label={`${overdue} overdue`} size={14} />}Sent ({families.length})</> },
    { key: 'quotes', label: `Quotes (${quoteCount})` },
    { key: 'lines', label: `All lines (${state.lines.length})` },
  ].map((t) => ({ ...t, href: `?rfq=${t.key}`, onClick: () => setTab(t.key) }));

  return (
    <div className="space-y-4">
      <WidgetFrame title="RFQs" sub="Pricing requests to reps, built from the bid matrix" actions={
        <label className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
          Office
          <select className={SELECT} value={state.office?.id || ''} onChange={(e) => setOffice(e.target.value)} aria-label="Office working this job">
            {!state.office && <option value="">Pick an office</option>}
            {state.offices.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </label>
      }>
        {state.officeGuessed && state.office && (
          <p className="text-sm text-amber-700 mb-2">The office was guessed. Pick it above so the right reps and address are used.</p>
        )}
        <RoundStrip projectId={projectId} state={state} onState={setState} setErr={setErr} />
      </WidgetFrame>

      <SectionTabs tabs={tabs} active={tab} className="-mt-1" />
      {sent.map((s) => <SentNotice key={s.rfq.id} projectId={projectId} rfq={s.rfq} email={s.email} onClose={() => setSent((x) => x.filter((y) => y.rfq.id !== s.rfq.id))} />)}
      {err && tab !== 'send' && tab !== 'lines' && <p className="text-sm text-red-600">{err}</p>}

      {!tab && <WidgetFrame title="RFQs"><WidgetLoading /></WidgetFrame>}
      {tab === 'review' && (
        quotes.data || quotes.loadErr
          ? <RfqReview projectId={projectId} state={state} onState={setState} reload={load} quotes={quotes} />
          : <WidgetFrame title="Prices waiting for an OK"><WidgetLoading /></WidgetFrame>
      )}
      {tab === 'send' && <ToSend projectId={projectId} state={state} setState={setState} onSent={onSent} err={err} setErr={setErr} />}
      {tab === 'sent' && <SentRfqs projectId={projectId} state={state} onSent={onSent} reload={load} />}
      {tab === 'quotes' && (
        <>
          <RfqReceived projectId={projectId} rfqs={state.rfqs} quotes={quotes} onChanged={reloadAll} onReview={() => setTab('review')} />
          <div className={CARD}>
            <button type="button" onClick={() => setCompareOpen((o) => !o)} aria-expanded={compareOpen} className="w-full text-left px-4 py-3 text-sm font-semibold text-slate-800 flex items-center gap-2">
              <span className="text-slate-400 w-3">{compareOpen ? '▾' : '▸'}</span>Compare rounds
            </button>
          </div>
          {compareOpen && <RfqCompare state={state} />}
        </>
      )}
      {tab === 'lines' && <AllLines projectId={projectId} state={state} setState={setState} err={err} setErr={setErr} />}
    </div>
  );
}
