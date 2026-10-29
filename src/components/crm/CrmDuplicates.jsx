'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

// "Already in the CRM twice?" on My Desk (0141). Unlike the web budget
// look-alikes above it, both records already exist. Same = everything moves to
// the one you keep and the other is archived (never deleted). Different = the
// pair never comes back.

const WORDS = {
  client:  { ask: 'Same company?', noun: 'company' },
  contact: { ask: 'Same person?',  noun: 'person' },
};

function describe(kind, r) {
  if (!r) return { text: 'Gone' };
  if (kind === 'client') {
    const bits = [r.name, r.branchMarket, r.type, `${r._count?.contacts ?? 0} people`, `${r._count?.projects ?? 0} jobs`];
    return { text: bits.filter(Boolean).join(' · '), href: `/clients/${r.id}` };
  }
  return { text: [r.name, r.title, r.email, r.client?.name].filter(Boolean).join(' · '), href: r.clientId ? `/clients/${r.clientId}` : null };
}

function PairRow({ p, onDone }) {
  const [keep, setKeep] = useState(p.aId);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const words = WORDS[p.kind];
  async function answer(a) {
    setBusy(true); setErr('');
    const otherId = keep === p.aId ? p.bId : p.aId;
    const res = await fetch('/api/crm/duplicates', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: p.kind, keepId: keep, otherId, answer: a }),
    }).catch(() => null);
    const d = await res?.json().catch(() => ({}));
    setBusy(false);
    if (!res?.ok) { setErr(d?.error || 'No signal, so nothing was changed. Try again in a moment. (MERGE_OFFLINE)'); return; }
    onDone();
  }
  return (
    <li className="rounded-xl border border-amber-200 bg-white p-3">
      <div className="text-sm font-semibold text-slate-800">{words.ask}</div>
      <p className="text-xs text-slate-500 mb-2">{p.why}. Pick the one to keep.</p>
      <div className="space-y-1.5 mb-2">
        {[['a', p.aId], ['b', p.bId]].map(([side, id]) => {
          const d = describe(p.kind, p[side]);
          return (
            <label key={id} className="flex items-start gap-2 text-sm cursor-pointer">
              <input type="radio" name={`keep-${p.aId}-${p.bId}`} checked={keep === id} onChange={() => setKeep(id)} className="mt-1 accent-orange-500" />
              <span className="min-w-0 break-words text-slate-700">
                {d.href ? <Link href={d.href} className="hover:underline">{d.text}</Link> : d.text}
                {keep === id && <span className="ml-2 text-xs font-semibold text-green-700">keep</span>}
              </span>
            </label>
          );
        })}
      </div>
      {err && <p className="text-sm text-red-600 mb-2">{err}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={() => answer('same')}
          className="min-h-[40px] px-3 rounded-lg text-sm font-semibold bg-green-600 text-white hover:bg-green-700 disabled:opacity-40">
          Same {words.noun}, merge
        </button>
        <button type="button" disabled={busy} onClick={() => answer('different')}
          className="min-h-[40px] px-3 rounded-lg text-sm font-semibold border border-slate-300 text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-40">
          Different
        </button>
      </div>
    </li>
  );
}

export default function CrmDuplicates({ onCount }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const load = useCallback(async () => {
    const res = await fetch('/api/crm/duplicates').catch(() => null);
    const d = await res?.json().catch(() => null);
    if (!res?.ok || !d) { setErr('Could not load the duplicate list, a problem reaching our server. Nothing was changed. Reload the page. (DUPES_LOAD)'); return; }
    setErr(''); setData(d);
    onCount?.((d.companies?.length || 0) + (d.people?.length || 0));
  }, [onCount]);
  useEffect(() => { load(); }, [load]);

  if (err) return <p className="text-sm text-red-600 mb-4">{err}</p>;
  if (!data) return null;
  const pairs = [...(data.companies || []), ...(data.people || [])];
  if (!pairs.length) return null;
  return (
    <section id="crm-duplicates" className="mb-6">
      <h2 className="text-sm font-semibold text-slate-800 mb-1">Already in the CRM twice? <span className="text-slate-400 tabular-nums">{pairs.length}</span></h2>
      <p className="text-xs text-slate-500 mb-2">Same moves the people, jobs, notes and tags onto the one you keep and archives the other. Nothing is deleted.</p>
      <ul className="space-y-2">{pairs.map(p => <PairRow key={`${p.kind}-${p.aId}-${p.bId}`} p={p} onDone={load} />)}</ul>
    </section>
  );
}
