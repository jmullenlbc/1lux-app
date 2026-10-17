'use client';
import { useEffect, useRef, useState } from 'react';

// Find someone in the CRM, or add them on the spot. Phone first: 16px text so
// the phone does not zoom, and big rows to tap. Used by the Quick Note and the
// "not in the system" flags on My Desk.
export default function PersonPicker({ onPick, start = {}, skipIds = [], autoFocus = false, addOnly = false }) {
  const [q, setQ] = useState(start.name || '');
  const [results, setResults] = useState([]);
  const [adding, setAdding] = useState(addOnly);
  const [form, setForm] = useState({ name: start.name || '', email: start.email || '', company: start.company || '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const timer = useRef(null);
  const skip = skipIds.join(',');

  useEffect(() => {
    clearTimeout(timer.current);
    if (adding || !q.trim()) { setResults([]); return; }
    timer.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/crm/contacts?search=${encodeURIComponent(q.trim())}`);
        if (r.ok) setResults(((await r.json()).contacts || []).filter(c => !skip.split(',').includes(c.id)).slice(0, 6));
      } catch { /* no signal: typing still works, search waits */ }
    }, 250);
    return () => clearTimeout(timer.current);
  }, [q, adding, skip]);

  async function create() {
    if (!form.name.trim()) { setErr('Add a name.'); return; }
    setBusy(true); setErr('');
    try {
      const r = await fetch('/api/crm/contacts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: form.name.trim(), email: form.email.trim() || null, company: form.company.trim() || null }),
      });
      const c = await r.json();
      if (!r.ok) throw new Error(c.error || 'Could not add them.');
      onPick(c);
      setAdding(addOnly); setQ(''); setForm({ name: '', email: '', company: '' });
    } catch (e) { setErr(e.message === 'Failed to fetch' ? 'No signal. Try again in a moment.' : e.message); }
    setBusy(false);
  }

  const input = 'w-full min-h-[44px] rounded-lg border border-slate-200 bg-white px-3 text-base text-slate-900 outline-none focus:border-orange-500';

  if (adding) {
    return (
      <div className="space-y-2">
        <input autoFocus value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Full name" className={input} />
        <input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="Email (for the follow-up)" type="email" inputMode="email" autoCapitalize="none" className={input} />
        <input value={form.company} onChange={e => setForm({ ...form, company: e.target.value })} placeholder="Company" className={input} />
        {err && <p className="text-sm text-red-600">{err}</p>}
        <div className="flex gap-2">
          <button type="button" onClick={create} disabled={busy} className="min-h-[44px] px-4 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold disabled:opacity-40">{busy ? 'Adding…' : 'Add person'}</button>
          {!addOnly && <button type="button" onClick={() => setAdding(false)} className="min-h-[44px] px-4 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-sm font-semibold text-slate-600">Back to search</button>}
        </div>
      </div>
    );
  }

  return (
    <div>
      <input autoFocus={autoFocus} value={q} onChange={e => setQ(e.target.value)} placeholder="Who did you meet? Type a name" className={input} />
      {results.length > 0 && (
        <ul className="mt-1 rounded-lg border border-slate-200 bg-white divide-y divide-slate-100 overflow-hidden">
          {results.map(c => (
            <li key={c.id}>
              <button type="button" onClick={() => { onPick(c); setQ(''); }} className="w-full min-h-[44px] px-3 py-2 text-left hover:bg-orange-50">
                <span className="block text-sm font-semibold text-slate-800">{c.name}</span>
                {(c.client?.name || c.company) && <span className="block text-xs text-slate-500">{c.client?.name || c.company}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      <button type="button" onClick={() => { setForm({ name: q, email: '', company: '' }); setAdding(true); }}
        className="mt-1 min-h-[40px] text-sm font-semibold text-orange-600 hover:text-orange-700">+ Not in the system? Add them</button>
    </div>
  );
}
