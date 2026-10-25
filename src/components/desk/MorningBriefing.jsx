'use client';

/**
 * Morning briefing card at the top of My Desk (placeholder, Mike 10-23).
 * A few lines written from the desk once a day; each line takes you to the
 * section it is about. Reads only; nothing here sends or changes anything.
 */
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { CARD, BTN_COMPACT, HELPER } from '@/components/ui/tokens';

const fmtTime = iso => (iso ? new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '');

export default function MorningBriefing({ onGo }) {
  const [b, setB] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const load = useCallback(async (refresh = false) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/sales/desk/briefing${refresh ? '?refresh=1' : ''}`);
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || `Error ${res.status}`);
      setB(d);
      setErr('');
    } catch (e) { setErr(e.message); }
    setBusy(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <section id="briefing" className={`${CARD} p-4 mb-6 scroll-mt-4`}>
      <div className="flex items-center gap-2 mb-2">
        <h2 className="text-sm font-semibold text-slate-800">Morning briefing</h2>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">Early version</span>
        <button type="button" onClick={() => load(true)} disabled={busy} className={`${BTN_COMPACT} ml-auto`}>
          {busy ? 'Writing…' : 'Refresh'}
        </button>
      </div>
      {err && <p className="text-sm text-red-600">{err}</p>}
      {!b && !err && <p className={HELPER}>Putting your morning together…</p>}
      {b && b.lines.length === 0 && <p className="text-sm text-slate-600">Nothing waiting on you this morning. A clear desk.</p>}
      {b && b.lines.length > 0 && (
        <ul className="space-y-1.5">
          {b.lines.map((l, i) => (
            <li key={i} className="flex gap-2 text-sm text-slate-700">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-orange-500" aria-hidden />
              {l.go?.startsWith('/')
                ? <Link href={l.go} className="text-left hover:underline">{l.text}</Link>
                : <button type="button" onClick={() => onGo?.(l.go)} className="text-left hover:underline">{l.text}</button>}
            </li>
          ))}
        </ul>
      )}
      {b && (
        <p className={`${HELPER} mt-3`}>
          {b.source === 'plain' ? `${b.note} ` : ''}
          Written from your desk at {fmtTime(b.writtenAt)}. Tap a line to go there. Nothing here sends or changes anything.
        </p>
      )}
    </section>
  );
}
