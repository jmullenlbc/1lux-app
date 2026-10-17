'use client';
// "Ask any market question" (Mike 9-27). The web research runs on the server
// for minutes (park-and-poll); every answer is saved, so past questions stay
// one click away. Nothing reaches the CRM until a person presses Add to CRM.
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { postParked } from '@/lib/parkedFetch';
import { yearWindow } from '@/lib/market-intel/ranking';
import { CARD, CARD_TITLE, INPUT, BTN_PRIMARY, LABEL } from '@/components/ui/tokens';
import { cn } from '@/lib/utils';

const EXAMPLES = [
  'Who are the top 50 affordable housing developers in the US?',
  'Who are the top multifamily general contractors in the Tampa Bay area?',
  'Which developers are building the most student housing in Texas?',
];

const fmt = n => (n == null ? '' : Number(n).toLocaleString('en-US'));
const when = d => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const host = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };
const STALE_MS = 15 * 60 * 1000;

async function send(url, method, body) {
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.message || d.error || `Error ${res.status}`);
  return d;
}

function Sources({ list }) {
  if (!list?.length) return null;
  return (
    <span className="flex flex-wrap gap-x-2">
      {list.map(s => (
        <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer" title={s.title || s.url}
          className="text-[11px] text-orange-600 hover:underline">{host(s.url)}</a>
      ))}
    </span>
  );
}

function CrmCell({ row, question, onChange }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const act = async fn => { setBusy(true); setErr(''); try { await fn(); } catch (e) { setErr(e.message); } finally { setBusy(false); } };
  const link = clientId => act(async () => onChange((await send(`/api/market-intel/ask/rows/${row.id}`, 'PATCH', { action: 'link', clientId })).row));
  const add = () => act(async () => {
    const { client } = await send('/api/clients', 'POST', {
      name: row.companyName, city: row.city || '', state: row.state || '',
      notes: `Added from Market Intel. Question: "${question}"${row.detail ? `\n${row.detail}` : ''}`,
    });
    onChange((await send(`/api/market-intel/ask/rows/${row.id}`, 'PATCH', { action: 'link', clientId: client.id })).row);
  });
  const dismiss = action => act(async () => onChange((await send(`/api/market-intel/ask/rows/${row.id}`, 'PATCH', { action })).row));

  if (row.status === 'DISMISSED') {
    return <button onClick={() => dismiss('restore')} disabled={busy} className="text-xs text-slate-500 hover:underline">Bring back</button>;
  }
  const sure = row.client && row.matchStatus !== 'SUGGESTED';
  return (
    <div className="flex flex-col items-start gap-1">
      {sure && <Link href={`/clients/${row.client.id}`} className="text-xs text-green-600 hover:underline whitespace-nowrap">In CRM: {row.client.name}</Link>}
      {!sure && row.client && (
        <span className="text-xs text-slate-600">
          Maybe <Link href={`/clients/${row.client.id}`} className="text-orange-600 hover:underline">{row.client.name}</Link>?{' '}
          <button onClick={() => link(row.client.id)} disabled={busy} className="text-green-600 hover:underline">That&apos;s them</button>
        </span>
      )}
      {!sure && (
        <span className="flex gap-2">
          <button onClick={add} disabled={busy}
            className={cn(BTN_PRIMARY, 'whitespace-nowrap')}>Add to CRM</button>
          <button onClick={() => dismiss('dismiss')} disabled={busy} className="text-xs text-slate-500 hover:underline whitespace-nowrap">Not useful</button>
        </span>
      )}
      {err && <span className="text-[11px] text-red-600">{err}</span>}
    </div>
  );
}

function Answer({ q, onRow }) {
  const win = yearWindow();
  const hasUnits = q.rows.some(r => r.years.length);
  const cols = hasUnits ? [...win.years, ...(q.rows.some(r => r.years.some(y => y.year === win.soFar)) ? [win.soFar] : [])] : [];
  const cell = 'py-2 px-2 align-top';
  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-semibold text-slate-800">{q.question}</p>
        <p className="text-xs text-slate-500 mt-0.5">
          {q.askedBy?.name ? `${q.askedBy.name}, ` : ''}{when(q.createdAt)}{q.metro ? `, ${q.metro}` : ''}
        </p>
      </div>
      {q.status === 'FAILED' && <p className="text-sm text-red-600">Did not finish: {q.error || 'the research failed'}. Ask it again.</p>}
      {q.summary && <p className="text-sm text-slate-700 bg-slate-50 rounded-lg p-3 leading-relaxed">{q.summary}</p>}
      {q.rows.length > 0 && (
        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 border-b border-slate-100 text-left">
                <th className={`${cell} font-semibold w-8`}>#</th>
                <th className={`${cell} font-semibold`}>Company</th>
                {hasUnits && <th className={`${cell} font-semibold text-right tabular-nums`} title={`${win.years[0]} to ${win.years[2]}`}>Units, 3 yrs</th>}
                {cols.map(y => <th key={y} className={`${cell} font-semibold text-right tabular-nums`}>{y === win.soFar ? `${y} so far` : y}</th>)}
                <th className={`${cell} font-semibold`}>Notes</th>
                <th className={`${cell} font-semibold`}>CRM</th>
              </tr>
            </thead>
            <tbody>
              {q.rows.map(r => {
                const by = Object.fromEntries(r.years.map(y => [y.year, y.units]));
                return (
                  <tr key={r.id} className={`border-b border-slate-50 ${r.status === 'DISMISSED' ? 'opacity-40' : ''}`}>
                    <td className={`${cell} text-slate-500 tabular-nums`}>{r.rank}</td>
                    <td className={cell}>
                      <div className="font-medium text-slate-800">{r.companyName}</div>
                      <div className="text-xs text-slate-500">{[r.role, [r.city, r.state].filter(Boolean).join(', ')].filter(Boolean).join(', ')}</div>
                    </td>
                    {hasUnits && <td className={`${cell} text-right font-semibold text-slate-800 tabular-nums`}>{fmt(r.unitsTotal)}</td>}
                    {cols.map(y => <td key={y} className={`${cell} text-right text-slate-600 tabular-nums`}>{fmt(by[y])}</td>)}
                    <td className={`${cell} text-xs text-slate-600 max-w-xs`}>
                      {r.yearNote && <div className="text-slate-800">{r.yearNote}</div>}
                      {r.detail && <div className="mt-0.5">{r.detail}</div>}
                      <Sources list={r.sources} />
                    </td>
                    <td className={cell}><CrmCell row={r} question={q.question} onChange={u => onRow(r.id, u)} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {q.sources?.length > 0 && (
        <div className="text-xs text-slate-500">Also read: <Sources list={q.sources} /></div>
      )}
      <p className="text-xs text-slate-500">
        From the open web, so figures are what companies and the press have published. A blank year means no figure was found, not zero.
      </p>
    </div>
  );
}

export default function AskPanel() {
  const [text, setText] = useState('');
  const [history, setHistory] = useState([]);
  const [open, setOpen] = useState(null);
  const [running, setRunning] = useState(false);
  const [err, setErr] = useState('');
  const [waited, setWaited] = useState(0);
  const [showAll, setShowAll] = useState(false);

  const loadHistory = useCallback(async () => {
    const res = await fetch('/api/market-intel/ask');
    if (res.ok) setHistory((await res.json()).questions || []);
  }, []);
  useEffect(() => { loadHistory(); }, [loadHistory]);

  const openQuestion = async id => {
    setErr('');
    const res = await fetch(`/api/market-intel/ask?id=${id}`);
    const d = await res.json().catch(() => ({}));
    if (res.ok) setOpen(d.question); else setErr(d.error || 'Could not open that answer.');
  };

  const ask = async () => {
    const question = text.trim();
    if (!question || running) return;
    setRunning(true); setErr(''); setOpen(null);
    const started = Date.now();
    setWaited(0);
    const tick = setInterval(() => setWaited(Math.round((Date.now() - started) / 1000)), 1000);
    try {
      const res = await postParked('/api/market-intel/ask', { question }, { maxWaitMs: 11 * 60 * 1000 });
      if (!res.ok) throw new Error(res.data?.message || res.data?.error || `Error ${res.status}`);
      setOpen(res.data.question);
      setText('');
    } catch (e) {
      setErr(e.message);
    } finally {
      clearInterval(tick);
      setRunning(false);
      loadHistory();
    }
  };

  const putAway = async id => {
    try { await send(`/api/market-intel/ask/${id}`, 'PATCH', { action: 'archive' }); } catch (e) { setErr(e.message); }
    if (open?.id === id) setOpen(null);
    loadHistory();
  };

  const onRow = (rowId, u) => setOpen(q => ({ ...q, rows: q.rows.map(r => (r.id === rowId ? { ...r, ...u } : r)) }));
  const shown = showAll ? history : history.slice(0, 6);

  return (
    <div className={cn(CARD, 'p-5 mb-6')}>
      <h2 className={CARD_TITLE}>Ask a market question</h2>
      <p className="text-xs text-slate-500 mt-0.5">
        Anything about the market: top developers, GCs, architects, who is building what and where. Rankings count units built in the last 3 years.
      </p>
      <div className="mt-3 flex flex-col sm:flex-row gap-2">
        <textarea value={text} onChange={e => setText(e.target.value)} rows={2} disabled={running}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(); } }}
          placeholder="e.g. Who are the top multifamily GCs in the Tampa Bay area?"
          className={cn(INPUT, 'flex-1')} />
        <button onClick={ask} disabled={running || text.trim().length < 8}
          className={cn(BTN_PRIMARY, 'sm:self-start')}>
          {running ? 'Searching…' : 'Ask'}
        </button>
      </div>
      {!running && !text && (
        <div className="mt-2 flex flex-wrap gap-2">
          {EXAMPLES.map(x => (
            <button key={x} onClick={() => setText(x)} className="text-xs text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg px-3 py-1">{x}</button>
          ))}
        </div>
      )}
      {running && (
        <p className="mt-3 text-sm text-slate-600">
          Searching the web. A big question takes a few minutes; you can leave this page and open the answer from the list below later. {waited}s
        </p>
      )}
      {err && <p className="mt-3 text-sm text-red-600">{err}</p>}

      {open && <div className="mt-5 border-t border-slate-100 pt-4"><Answer q={open} onRow={onRow} /></div>}

      {history.length > 0 && (
        <div className="mt-5 border-t border-slate-100 pt-3">
          <p className={cn(LABEL, 'mb-2')}>Asked before</p>
          <ul className="space-y-1">
            {shown.map(h => {
              const stale = h.status === 'RUNNING' && Date.now() - new Date(h.createdAt).getTime() > STALE_MS;
              const label = h.status === 'DONE' ? `${h._count.rows} rows` : h.status === 'FAILED' || stale ? 'Did not finish' : 'Still searching';
              return (
                <li key={h.id} className="flex items-baseline gap-2 text-sm">
                  <button onClick={() => openQuestion(h.id)} className={`text-left hover:underline ${open?.id === h.id ? 'text-orange-600 font-medium' : 'text-slate-700'}`}>
                    {h.question}
                  </button>
                  <span className="text-xs text-slate-500 whitespace-nowrap tabular-nums">{when(h.createdAt)}, {label}</span>
                  <button onClick={() => putAway(h.id)} className="text-xs text-slate-500 hover:text-slate-700 hover:underline ml-auto whitespace-nowrap">Put away</button>
                </li>
              );
            })}
          </ul>
          {history.length > 6 && (
            <button onClick={() => setShowAll(v => !v)} className="mt-1 text-xs text-slate-500 hover:underline">
              {showAll ? 'Show fewer' : `Show all ${history.length}`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
