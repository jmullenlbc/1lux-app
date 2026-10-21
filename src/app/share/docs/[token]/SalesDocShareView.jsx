'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { SALES_DOCS_BRAND as BRAND } from '@/lib/salesDocsBrand';
import { PING_EVERY_MS, IDLE_AFTER_MS, MAX_DELTA_MS } from '@/lib/salesDocs/tracking';
import { useRangedPdf, PdfViewer, SheetTable, useSheet } from '@/components/salesDocs/DocViewers';

// What a reader sees when they open a Sales Docs link (0137): the Logiq
// frame, the link's gate (email, password, or nothing), then the document or
// the Folder's list. Time on each page is sent every 5 seconds while the tab is
// in front and the reader has moved in the last 30 seconds.

const BTN = 'inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 transition-opacity hover:opacity-90';
const BTN_LIGHT = 'inline-flex items-center justify-center rounded-lg px-3 py-1.5 text-sm font-medium border border-slate-300 bg-white text-slate-700 hover:bg-slate-50';
const FIELD = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200';
const KIND = { PDF: 'PDF', XLSX: 'Excel' };

function Frame({ children, right }) {
  return (
    <div className="min-h-screen flex flex-col bg-slate-100 text-slate-800">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
          {BRAND.logoUrl
            ? <img src={BRAND.logoUrl} alt={BRAND.name} className="h-7" />
            : <span className="text-lg font-bold tracking-[0.2em]" style={{ color: BRAND.accent }}>{BRAND.wordmark}</span>}
          {right}
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="px-4 py-4 text-center text-xs text-slate-500">{BRAND.disclosure}</footer>
    </div>
  );
}

function Notice({ title, children }) {
  return (
    <div className="max-w-md mx-auto px-4 py-16">
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 text-center">
        <h1 className="text-lg font-semibold text-slate-900">{title}</h1>
        {children && <p className="text-sm text-slate-600 mt-2">{children}</p>}
      </div>
    </div>
  );
}

const GONE = {
  MISSING: ['This link was not found', 'Check the address, or ask the person who sent it for a new link.'],
  REVOKED: ['This link is no longer available', 'Ask the person who sent it for a new link.'],
  EXPIRED: ['This link has ended', 'Ask the person who sent it for a new link.'],
  ARCHIVED: ['This link is no longer available', 'Ask the person who sent it for a new link.'],
};

function Gate({ token, link, onPassed }) {
  const [f, setF] = useState({ email: '', name: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function submit(e) {
    e.preventDefault();
    setBusy(true); setErr('');
    const res = await fetch(`/api/share/docs/${token}/gate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f) }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    setBusy(false);
    if (!res?.ok) { setErr(data.error || 'That did not work. Try again.'); return; }
    onPassed();
  }
  return (
    <div className="max-w-md mx-auto px-4 py-16">
      <form onSubmit={submit} className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">{link.name}</h1>
          <p className="text-sm text-slate-600 mt-1">
            {link.requireEmail && link.needsPassword ? 'Enter your work email and the password you were sent.' : link.requireEmail ? 'Enter your work email to open this.' : 'Enter the password you were sent.'}
          </p>
        </div>
        {link.requireEmail && (
          <>
            <label className="block">
              <span className="text-xs font-medium text-slate-600">Work email</span>
              <input type="email" required autoFocus autoComplete="email" className={`${FIELD} mt-1`} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-600">Name (optional)</span>
              <input autoComplete="name" className={`${FIELD} mt-1`} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
            </label>
          </>
        )}
        {link.needsPassword && (
          <label className="block">
            <span className="text-xs font-medium text-slate-600">Password</span>
            <input type="password" required autoFocus={!link.requireEmail} autoComplete="off" className={`${FIELD} mt-1`} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
          </label>
        )}
        {err && <p className="text-sm text-red-600">{err}</p>}
        <button type="submit" className={`${BTN} w-full`} style={{ background: BRAND.accent }} disabled={busy}>{busy ? 'Opening...' : 'Open'}</button>
      </form>
    </div>
  );
}

/** One visit to one document: makes the view, then sends time on each page or sheet. */
function useVisit(token, docId, unit, onLost) {
  const url = `/api/share/docs/${token}/ping`;
  const viewRef = useRef(null);
  const unitRef = useRef(null);
  const tickRef = useRef(Date.now());
  const activeRef = useRef(Date.now());

  const send = useCallback((payload, beacon) => {
    const body = JSON.stringify(payload);
    if (beacon && navigator.sendBeacon && navigator.sendBeacon(url, new Blob([body], { type: 'text/plain' }))) return;
    fetch(url, { method: 'POST', body, keepalive: true, headers: { 'Content-Type': 'text/plain' } }).catch(() => {});
  }, [url]);

  // Add the time since the last tick to the page being read, if it counts.
  const flush = useCallback((beacon) => {
    const now = Date.now();
    const u = unitRef.current;
    const counts = document.visibilityState === 'visible' && now - activeRef.current <= IDLE_AFTER_MS;
    const delta = Math.min(now - tickRef.current, MAX_DELTA_MS);
    tickRef.current = now;
    if (!viewRef.current || !u || !counts || delta < 250) return;
    send({ viewId: viewRef.current, unitIndex: u.index, label: u.label, deltaMs: delta }, beacon);
  }, [send]);

  const enter = useCallback((u) => {
    tickRef.current = Date.now();
    if (viewRef.current && u) send({ viewId: viewRef.current, unitIndex: u.index, label: u.label, deltaMs: 0, entered: true }, true);
  }, [send]);

  // Make the view for this document.
  useEffect(() => {
    let cancelled = false;
    viewRef.current = null;
    fetch(`/api/share/docs/${token}/views`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ docId }) })
      .then(async (res) => {
        if (res.status === 401) { onLost?.(); return; }
        if (!res.ok || cancelled) return;
        viewRef.current = (await res.json()).viewId;
        enter(unitRef.current);
      })
      .catch(() => {});
    return () => { cancelled = true; flush(true); viewRef.current = null; };
  }, [token, docId, enter, flush, onLost]);

  // A new page or sheet: close out the old one, count a visit to the new one.
  useEffect(() => {
    if (!unit) return;
    const prev = unitRef.current;
    if (prev && prev.index === unit.index) return;
    if (prev) flush(true);
    unitRef.current = unit;
    enter(unit);
  }, [unit, flush, enter]);

  // Ticks, idle, tab hidden, tab closed.
  useEffect(() => {
    const touch = () => {
      const now = Date.now();
      if (now - activeRef.current > IDLE_AFTER_MS) tickRef.current = now; // the idle gap does not count
      activeRef.current = now;
    };
    const vis = () => { if (document.visibilityState === 'hidden') flush(true); else { tickRef.current = Date.now(); touch(); } };
    const hide = () => flush(true);
    const id = setInterval(() => flush(false), PING_EVERY_MS);
    const opts = { passive: true, capture: true };
    for (const ev of ['scroll', 'wheel', 'mousemove', 'keydown', 'touchstart', 'pointerdown']) window.addEventListener(ev, touch, opts);
    document.addEventListener('visibilitychange', vis);
    window.addEventListener('pagehide', hide);
    return () => {
      clearInterval(id);
      for (const ev of ['scroll', 'wheel', 'mousemove', 'keydown', 'touchstart', 'pointerdown']) window.removeEventListener(ev, touch, opts);
      document.removeEventListener('visibilitychange', vis);
      window.removeEventListener('pagehide', hide);
    };
  }, [flush]);
}

function PdfDoc({ token, doc, onUnit }) {
  const { pdf, error } = useRangedPdf(`/api/share/docs/${token}/file?docId=${doc.id}`, doc.sizeBytes);
  // The viewer reports the page crossing the top third of the screen; that is the one being read.
  const onPage = useCallback((n) => onUnit({ index: n - 1, label: `Page ${n}` }), [onUnit]);

  if (error) return <Notice title="This document did not load">Refresh the page to try again.</Notice>;
  if (!pdf) return <p className="text-sm text-slate-500 text-center py-16">Loading...</p>;
  return (
    <div className="max-w-6xl mx-auto px-2 sm:px-4 py-3">
      <PdfViewer pdf={pdf} height="calc(100vh - 190px)" onPage={onPage} className="shadow-sm" />
    </div>
  );
}

function SheetDoc({ token, doc, onUnit }) {
  const [at, setAt] = useState(doc.sheets[0]?.index ?? null);
  const sheet = doc.sheets.find((s) => s.index === at);
  const { data, error, loading } = useSheet(at === null ? null : `/api/share/docs/${token}/rendered?docId=${doc.id}&index=${at}`);
  useEffect(() => { if (sheet) onUnit({ index: sheet.index, label: sheet.name }); }, [sheet, onUnit]);

  if (!doc.sheets.length) return <Notice title="This workbook has no sheets to show" />;
  return (
    <div className="max-w-6xl mx-auto px-2 sm:px-4 py-4 space-y-3">
      {doc.sheets.length > 1 && (
        <div className="flex flex-wrap gap-1">
          {doc.sheets.map((s) => (
            <button
              key={s.index} type="button" onClick={() => setAt(s.index)}
              className={`px-3 py-1.5 rounded-lg text-sm border ${s.index === at ? 'text-white border-transparent' : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'}`}
              style={s.index === at ? { background: BRAND.accent } : undefined}
            >{s.name}</button>
          ))}
        </div>
      )}
      {error ? <Notice title="This sheet did not load">Pick it again to retry.</Notice> : loading || !data ? <p className="text-sm text-slate-500 text-center py-16">Loading...</p> : <SheetTable data={data} maxHeight="calc(100vh - 220px)" />}
    </div>
  );
}

function DocView({ token, doc, allowDownload, onBack, onLost }) {
  const [unit, setUnit] = useState(null);
  const onUnit = useCallback((u) => setUnit((cur) => (cur && cur.index === u.index ? cur : u)), []);
  useVisit(token, doc.id, unit, onLost);
  return (
    <>
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            {onBack && <button type="button" onClick={onBack} className="text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors">&larr; All documents</button>}
            <h1 className="text-base font-semibold text-slate-900 truncate">{doc.title}</h1>
            {unit && doc.kind !== 'PDF' && <p className="text-xs text-slate-500">{unit.label}</p>}
          </div>
          {allowDownload && <a className={BTN_LIGHT} href={`/api/share/docs/${token}/download?docId=${doc.id}`}>Download</a>}
        </div>
      </div>
      {doc.kind === 'PDF' ? <PdfDoc token={token} doc={doc} onUnit={onUnit} /> : <SheetDoc token={token} doc={doc} onUnit={onUnit} />}
    </>
  );
}

function SpaceList({ space, docs, onOpen }) {
  const groups = [];
  for (const d of docs) {
    const last = groups[groups.length - 1];
    if (last && last.section === (d.section || '')) last.docs.push(d);
    else groups.push({ section: d.section || '', docs: [d] });
  }
  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">{space?.name}</h1>
        {space?.description && <p className="text-sm text-slate-600 mt-1 whitespace-pre-wrap">{space.description}</p>}
      </div>
      {docs.length === 0 && <Notice title="Nothing to show yet">Ask the person who sent this link to check it.</Notice>}
      {groups.map((g, i) => (
        <div key={i}>
          {g.section && <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">{g.section}</h2>}
          <ul className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
            {g.docs.map((d) => (
              <li key={d.id}>
                <button type="button" onClick={() => onOpen(d.id)} className="w-full text-left px-4 py-3 hover:bg-slate-50 flex items-center justify-between gap-3">
                  <span className="font-medium text-slate-800">{d.title}</span>
                  <span className="text-xs text-slate-500 whitespace-nowrap">{KIND[d.kind]}{d.kind === 'PDF' && d.pageCount ? ` · ${d.pageCount} ${d.pageCount === 1 ? 'page' : 'pages'}` : ''}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

export default function SalesDocShareView({ token }) {
  const [info, setInfo] = useState(null);
  const [failed, setFailed] = useState(false);
  const [openId, setOpenId] = useState(null);
  const autoGate = useRef(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/share/docs/${token}`, { cache: 'no-store' }).catch(() => null);
    if (!res?.ok) { setFailed(true); return; }
    const data = await res.json();
    // A link that asks for nothing still goes through the gate once, so the reader gets a visitor id.
    if (data.state === 'OK' && !data.passed && !data.link.requireEmail && !data.link.needsPassword && !autoGate.current) {
      autoGate.current = true;
      await fetch(`/api/share/docs/${token}/gate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).catch(() => null);
      return load();
    }
    setInfo(data);
  }, [token]);

  useEffect(() => { load(); }, [load]);
  const lost = useCallback(() => { autoGate.current = false; setOpenId(null); load(); }, [load]);

  if (failed) return <Frame><Notice title="This page did not load">Refresh to try again.</Notice></Frame>;
  if (!info) return <Frame><p className="text-sm text-slate-500 text-center py-16">Loading...</p></Frame>;
  if (info.state !== 'OK') {
    const [title, text] = GONE[info.state] || GONE.MISSING;
    return <Frame><Notice title={title}>{text}</Notice></Frame>;
  }
  if (!info.passed) return <Frame><Gate token={token} link={info.link} onPassed={load} /></Frame>;

  const docs = info.docs || [];
  if (!info.link.isSpace) {
    if (!docs[0]) return <Frame><Notice title="This link is no longer available">Ask the person who sent it for a new link.</Notice></Frame>;
    return <Frame><DocView token={token} doc={docs[0]} allowDownload={info.link.allowDownload} onLost={lost} /></Frame>;
  }
  const open = docs.find((d) => d.id === openId);
  return (
    <Frame>
      {open
        ? <DocView key={open.id} token={token} doc={open} allowDownload={info.link.allowDownload} onBack={() => setOpenId(null)} onLost={lost} />
        : <SpaceList space={info.space} docs={docs} onOpen={setOpenId} />}
    </Frame>
  );
}
