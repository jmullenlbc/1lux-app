'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { BTN_COMPACT_PRIMARY, CARD_PADDED, H1, HELPER } from '@/components/ui/tokens';

// One press loads the conference research file (140 events, the 2027 plan and
// the memberships). It only adds what is missing, so pressing it twice is safe.
export default function ConferenceLoadClient() {
  const [counts, setCounts] = useState(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const [err, setErr] = useState('');

  const readCounts = useCallback(async () => {
    const res = await fetch('/api/admin/conferences/load');
    if (res.ok) setCounts(await res.json());
  }, []);
  useEffect(() => { readCounts().catch(() => {}); }, [readCounts]);

  async function load() {
    setBusy(true); setErr(''); setDone(null);
    try {
      const res = await fetch('/api/admin/conferences/load', { method: 'POST' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `The load stopped on our server. It is safe to press again. (HTTP ${res.status})`);
      setDone(body.result);
      await readCounts();
    } catch (e) {
      setErr(e instanceof TypeError
        ? 'No signal reaching our server. Rows already saved are kept. Check your connection and press again.'
        : e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="px-4 py-6">
      <div className="max-w-2xl mx-auto space-y-5">
        <div>
          <h1 className={H1}>Conference Load</h1>
          <p className="text-xs text-slate-500 mt-0.5">Adds the conference research file to Sales, Events. Pressing it twice is safe and never overwrites an edit.</p>
        </div>
        <div className={CARD_PADDED}>
          {counts && (
            <p className="text-sm text-slate-700 mb-3 tabular-nums">
              In the app now: {counts.events} events, {counts.plans} plan, {counts.memberships} memberships.
            </p>
          )}
          <button type="button" className={BTN_COMPACT_PRIMARY} disabled={busy} onClick={load}>
            {busy ? 'Loading...' : 'Load conference list'}
          </button>
          {err && <p className="mt-3 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</p>}
          {done && (
            <p className={`${HELPER} mt-3 tabular-nums`}>
              Added {done.editions} events, {done.series} conferences, {done.sources} source links and {done.memberships} memberships.
              {done.editions === 0 ? ' Everything was already here.' : ' '}
              <Link href="/sales/events" className="text-orange-600 hover:underline ml-1">Open Events</Link>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
